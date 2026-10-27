// The real AWS versions: DynamoDB (database), KMS (encryption keys) and SES
// (email). Table names and IDs come from settings the infrastructure sets.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";
import { CloudWatchClient, GetMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { GetAccountCommand, SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { randomBytes } from "node:crypto";
import type { AnswersRecord, EventRecord, KeyService, Link, Mailer, RecorderRecord, SendingHealthSource, Store, Subscriber } from "../types.ts";

export interface Tables {
  subscribers: string; // key: id; index "byEmail" on email
  links: string; // key: tokenHash; index "bySubscriber" on subscriberId
  answers: string; // key: subscriberId + scenarioId
  recorders: string; // key: subscriberId + scenarioId
  events: string; // key: subscriberId + sk
  limits: string; // key: key
}

export function dynamoStore(tables: Tables, client = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })): Store {
  const nowSec = () => Math.floor(Date.now() / 1000);
  // The database removes expired records within a day or two; hide them meanwhile.
  const live = <T extends { expiresAt: number }>(v: unknown) => (v && (v as T).expiresAt >= nowSec() ? (v as T) : undefined);

  async function scanAll<T>(table: string): Promise<T[]> {
    const out: T[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: start }));
      out.push(...((r.Items || []) as T[]));
      start = r.LastEvaluatedKey;
    } while (start);
    return out.filter((x) => live(x));
  }

  async function queryAll(table: string, keyName: string, value: string, index?: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await client.send(new QueryCommand({
        TableName: table, IndexName: index, KeyConditionExpression: "#k = :v",
        ExpressionAttributeNames: { "#k": keyName }, ExpressionAttributeValues: { ":v": value }, ExclusiveStartKey: start,
      }));
      out.push(...(r.Items || []));
      start = r.LastEvaluatedKey;
    } while (start);
    return out;
  }

  async function deleteKeys(table: string, keys: Record<string, unknown>[]) {
    for (let i = 0; i < keys.length; i += 25) {
      let pending = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      while (pending.length) {
        const r = await client.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
        pending = (r.UnprocessedItems?.[table] || []) as typeof pending;
      }
    }
  }

  const byPair = async (table: string, subscriberId: string) =>
    deleteKeys(table, (await queryAll(table, "subscriberId", subscriberId)).map((x) => ({ subscriberId: x.subscriberId, scenarioId: x.scenarioId })));

  return {
    async getSubscriber(id) { return live<Subscriber>((await client.send(new GetCommand({ TableName: tables.subscribers, Key: { id } }))).Item); },
    async findSubscriberByEmail(email) { return live<Subscriber>((await queryAll(tables.subscribers, "email", email, "byEmail"))[0]); },
    async putSubscriber(s) { await client.send(new PutCommand({ TableName: tables.subscribers, Item: s })); },
    async listSubscribers() { return scanAll<Subscriber>(tables.subscribers); },
    async deleteSubscriber(id) { await client.send(new DeleteCommand({ TableName: tables.subscribers, Key: { id } })); },

    async putLink(l) { await client.send(new PutCommand({ TableName: tables.links, Item: l })); },
    async getLink(tokenHash) { return live<Link>((await client.send(new GetCommand({ TableName: tables.links, Key: { tokenHash } }))).Item); },
    async deleteLink(tokenHash) { await client.send(new DeleteCommand({ TableName: tables.links, Key: { tokenHash } })); },
    async deleteLinksFor(subscriberId) {
      await deleteKeys(tables.links, (await queryAll(tables.links, "subscriberId", subscriberId, "bySubscriber")).map((x) => ({ tokenHash: x.tokenHash })));
    },

    async getAnswers(subscriberId, scenarioId) { return live<AnswersRecord>((await client.send(new GetCommand({ TableName: tables.answers, Key: { subscriberId, scenarioId } }))).Item); },
    async putAnswers(a) { await client.send(new PutCommand({ TableName: tables.answers, Item: a })); },
    async listAnswers() { return scanAll<AnswersRecord>(tables.answers); },
    async deleteAnswersFor(subscriberId) { await byPair(tables.answers, subscriberId); },

    async getRecorder(subscriberId, scenarioId) { return live<RecorderRecord>((await client.send(new GetCommand({ TableName: tables.recorders, Key: { subscriberId, scenarioId } }))).Item); },
    async putRecorder(r) { await client.send(new PutCommand({ TableName: tables.recorders, Item: r })); },
    async deleteRecordersFor(subscriberId) { await byPair(tables.recorders, subscriberId); },

    async putEvent(e) { await client.send(new PutCommand({ TableName: tables.events, Item: { ...e, sk: e.at + "#" + randomBytes(4).toString("hex") } })); },
    async listEvents() { return scanAll<EventRecord & { sk?: string }>(tables.events).then((xs) => xs.map(({ sk: _sk, ...e }) => e)); },
    async deleteEventsFor(subscriberId) {
      await deleteKeys(tables.events, (await queryAll(tables.events, "subscriberId", subscriberId)).map((x) => ({ subscriberId: x.subscriberId, sk: x.sk })));
    },

    async hit(key, windowSeconds) {
      const bucket = key + "|" + Math.floor(nowSec() / windowSeconds);
      const r = await client.send(new UpdateCommand({
        TableName: tables.limits, Key: { key: bucket },
        UpdateExpression: "ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)",
        ExpressionAttributeNames: { "#c": "count" }, ExpressionAttributeValues: { ":one": 1, ":exp": nowSec() + windowSeconds },
        ReturnValues: "UPDATED_NEW",
      }));
      return Number(r.Attributes?.count ?? 1);
    },
  };
}

// The save code is given a key service without decrypt; only the mailer gets `canDecrypt`.
// AWS permissions enforce the same split, so this is a second lock, not the only one.
export function kmsKeys(keyId: string, options: { canDecrypt: boolean }, client = new KMSClient({})): KeyService {
  const keys: KeyService = {
    async generateDataKey(context) {
      const r = await client.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: "AES_256", EncryptionContext: context }));
      return { plain: r.Plaintext!, encrypted: r.CiphertextBlob! };
    },
  };
  if (options.canDecrypt) {
    keys.decryptDataKey = async (encrypted, context) => {
      const r = await client.send(new DecryptCommand({ KeyId: keyId, CiphertextBlob: encrypted, EncryptionContext: context }));
      return r.Plaintext!;
    };
  }
  return keys;
}

export function sesMailer(from: string, replyTo: string, client = new SESv2Client({})): Mailer {
  return {
    async send(email) {
      await client.send(new SendEmailCommand({
        FromEmailAddress: from,
        ReplyToAddresses: [replyTo],
        Destination: { ToAddresses: [email.to] },
        Content: { Simple: { Subject: { Data: email.subject, Charset: "UTF-8" }, Body: { Text: { Data: email.text, Charset: "UTF-8" } } } },
      }));
    },
  };
}

// SES's own view of the account, plus the latest bounce and complaint rates,
// which AWS publishes to CloudWatch for every SES account.
export function sesHealth(ses = new SESv2Client({}), cloudwatch = new CloudWatchClient({})): SendingHealthSource {
  return {
    async read() {
      const account = await ses.send(new GetAccountCommand({}));
      const now = new Date();
      const metric = (id: string, name: string) => ({ Id: id, MetricStat: { Metric: { Namespace: "AWS/SES", MetricName: name }, Period: 3600, Stat: "Maximum" } });
      const r = await cloudwatch.send(new GetMetricDataCommand({
        StartTime: new Date(now.getTime() - 2 * 86400 * 1000), EndTime: now, ScanBy: "TimestampDescending",
        MetricDataQueries: [metric("bounce", "Reputation.BounceRate"), metric("complaint", "Reputation.ComplaintRate")],
      }));
      const latest = (id: string) => r.MetricDataResults?.find((m) => m.Id === id)?.Values?.[0] ?? null;
      return {
        sendingEnabled: account.SendingEnabled !== false,
        enforcement: account.EnforcementStatus || "UNKNOWN",
        bounceRate: latest("bounce"),
        complaintRate: latest("complaint"),
      };
    },
  };
}
