// In-memory stand-ins for the database, key service and email, used by tests
// and the local preview. Nothing here touches AWS.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AnswersRecord, Clock, Email, EventRecord, KeyService, Link, Mailer, RecorderRecord, Store, Subscriber } from "../types.ts";

export function memoryStore(clock: Clock = { now: () => new Date() }): Store & { dump(): unknown } {
  const subscribers = new Map<string, Subscriber>();
  const links = new Map<string, Link>();
  const answers = new Map<string, AnswersRecord>();
  const recorders = new Map<string, RecorderRecord>();
  let events: EventRecord[] = [];
  const hits = new Map<string, { count: number; expiresAt: number }>();

  const nowSec = () => Math.floor(clock.now().getTime() / 1000);
  // Like the real database, records past their expiry time are treated as gone.
  const live = <T extends { expiresAt: number }>(v: T | undefined) => (v && v.expiresAt >= nowSec() ? structuredClone(v) : undefined);
  const key = (a: string, b: string) => a + "|" + b;
  const dropFor = <T extends { subscriberId: string }>(m: Map<string, T>, id: string) => {
    for (const [k, v] of m) if (v.subscriberId === id) m.delete(k);
  };

  return {
    async getSubscriber(id) { return live(subscribers.get(id)); },
    async findSubscriberByEmail(email) { return live([...subscribers.values()].find((s) => s.email === email)); },
    async putSubscriber(s) { subscribers.set(s.id, structuredClone(s)); },
    async listSubscribers() { return [...subscribers.values()].map(live).filter((s): s is Subscriber => !!s); },
    async deleteSubscriber(id) { subscribers.delete(id); },

    async putLink(l) { links.set(l.tokenHash, structuredClone(l)); },
    async getLink(h) { return live(links.get(h)); },
    async deleteLink(h) { links.delete(h); },
    async deleteLinksFor(id) { dropFor(links, id); },

    async getAnswers(id, sc) { return live(answers.get(key(id, sc))); },
    async putAnswers(a) { answers.set(key(a.subscriberId, a.scenarioId), structuredClone(a)); },
    async listAnswers() { return [...answers.values()].map(live).filter((a): a is AnswersRecord => !!a); },
    async deleteAnswersFor(id) { dropFor(answers, id); },

    async getRecorder(id, sc) { return live(recorders.get(key(id, sc))); },
    async putRecorder(r) { recorders.set(key(r.subscriberId, r.scenarioId), structuredClone(r)); },
    async deleteRecordersFor(id) { dropFor(recorders, id); },

    async putEvent(e) { events.push(structuredClone(e)); },
    async listEvents() { return events.filter((e) => e.expiresAt >= nowSec()).map((e) => structuredClone(e)); },
    async deleteEventsFor(id) { events = events.filter((e) => e.subscriberId !== id); },

    async hit(k, windowSeconds) {
      const bucket = k + "|" + Math.floor(nowSec() / windowSeconds);
      const cur = hits.get(bucket);
      const count = (cur && cur.expiresAt >= nowSec() ? cur.count : 0) + 1;
      hits.set(bucket, { count, expiresAt: nowSec() + windowSeconds });
      return count;
    },

    dump() {
      return { subscribers: [...subscribers.values()], links: [...links.values()], answers: [...answers.values()], recorders: [...recorders.values()], events };
    },
  };
}

// A stand-in for AWS KMS. Its master key exists only in memory for this run.
export function memoryKeys(options: { canDecrypt: boolean } = { canDecrypt: true }, master: Buffer = randomBytes(32)): KeyService {
  const wrap = (data: Buffer, context: Record<string, string>) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", master, iv);
    c.setAAD(Buffer.from(JSON.stringify(context)));
    return Buffer.concat([iv, c.update(data), c.final(), c.getAuthTag()]);
  };
  const keys: KeyService = {
    async generateDataKey(context) {
      const plain = randomBytes(32);
      return { plain: new Uint8Array(plain), encrypted: new Uint8Array(wrap(Buffer.from(plain), context)) };
    },
  };
  if (options.canDecrypt) {
    keys.decryptDataKey = async (encrypted, context) => {
      const b = Buffer.from(encrypted);
      const d = createDecipheriv("aes-256-gcm", master, b.subarray(0, 12));
      d.setAAD(Buffer.from(JSON.stringify(context)));
      d.setAuthTag(b.subarray(b.length - 16));
      return new Uint8Array(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]));
    };
  }
  return keys;
}

// Collects emails instead of sending them.
export function memoryMailer(): Mailer & { outbox: Email[] } {
  const outbox: Email[] = [];
  return { outbox, async send(e) { outbox.push(structuredClone(e)); } };
}

export function fixedClock(start: string): Clock & { advance(seconds: number): void } {
  let t = Date.parse(start);
  return { now: () => new Date(t), advance: (s) => { t += s * 1000; } };
}
