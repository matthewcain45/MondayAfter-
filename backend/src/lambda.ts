// Entry points AWS Lambda runs. Each has only the permissions it needs:
//   api            - everything except emailing a flight recorder; can lock recorders, not unlock them
//   recorderMailer - only "email me my flight recorder"; the one place allowed to unlock
//   exporter       - builds the owner's spreadsheets into a private storage bucket; can't read recorders
//   sender         - the "Send Incident File" button: emails each confirmed reader their personal link
//   followUp       - every morning: the 30-day follow-up emails that are due

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { dynamoStore, kmsKeys, sesHealth, sesMailer } from "./adapters/aws.ts";
import { consoleAudit } from "./audit.ts";
import { cameThroughCloudFront, visitorAddress } from "./edge.ts";
import { buildExport } from "./export.ts";
import { createRouter, ROUTES, type Request } from "./http.ts";
import { checkSendingHealth, describeRate } from "./reputation.ts";
import { createService } from "./service.ts";

interface HttpEvent {
  requestContext: { http: { method: string; path: string; sourceIp: string } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error("Missing setting " + name);
  return v;
}

const store = () => dynamoStore({
  subscribers: env("SUBSCRIBERS_TABLE"), links: env("LINKS_TABLE"), answers: env("ANSWERS_TABLE"),
  recorders: env("RECORDERS_TABLE"), events: env("EVENTS_TABLE"), limits: env("LIMITS_TABLE"),
});

// The site's address is stored as a setting (SSM parameter) because the
// address is only known after the site is created.
async function siteUrl(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const r = await new SSMClient({}).send(new GetParameterCommand({ Name: env("SITE_URL_PARAM") }));
  return r.Parameter!.Value!.replace(/\/$/, "");
}

async function build(canDecrypt: boolean, routes: string[]) {
  const svc = createService({
    store: store(),
    keys: kmsKeys(env("RECORDER_KEY_ID"), { canDecrypt }),
    mailer: sesMailer(env("FROM_ADDRESS"), env("REPLY_TO")),
    clock: { now: () => new Date() },
    settings: { siteUrl: await siteUrl(), brand: "The Monday After" },
    audit: consoleAudit,
  });
  const handle = createRouter(svc, routes, consoleAudit);
  return async (event: HttpEvent) => {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
    if (!cameThroughCloudFront(headers, process.env.ORIGIN_SECRET)) {
      return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Forbidden" }) };
    }
    const req: Request = {
      method: event.requestContext.http.method,
      path: event.requestContext.http.path,
      headers,
      body: event.body && event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body,
      ip: visitorAddress(headers, event.requestContext.http.sourceIp),
    };
    const res = await handle(req);
    return { statusCode: res.status, headers: res.headers, body: res.body };
  };
}

let api: ReturnType<typeof build> | undefined;
let mailer: ReturnType<typeof build> | undefined;

export const apiHandler = async (event: HttpEvent) =>
  (await (api ??= build(false, Object.keys(ROUTES).filter((r) => r !== "emailRecorder"))))(event);

export const recorderMailerHandler = async (event: HttpEvent) => (await (mailer ??= build(true, ["emailRecorder"])))(event);

// Run on request (the "Send Incident File" button). Logs counts only, never addresses.
// SES allows about one email a second at first, so it sends one at a time.
// Which GitHub run pressed the button, for the security notes. Digits only.
const runOf = (event: { requestedBy?: unknown }) => (typeof event.requestedBy === "string" && /^\d{1,20}$/.test(event.requestedBy) ? event.requestedBy : "unknown");

const senderService = async () => createService({
  store: store(),
  keys: { generateDataKey: () => Promise.reject(new Error("The sender never handles flight recorders")) },
  mailer: sesMailer(env("FROM_ADDRESS"), env("REPLY_TO")),
  clock: { now: () => new Date() },
  settings: { siteUrl: await siteUrl(), brand: "The Monday After" },
  audit: consoleAudit,
});

// Checks bounce and complaint rates first; sends nothing if they're too high.
async function healthFirst(what: string) {
  const health = await checkSendingHealth(sesHealth());
  const rates = { bounceRate: describeRate(health.bounceRate), complaintRate: describeRate(health.complaintRate) };
  if (!health.ok) consoleAudit("send-blocked", { what, reasons: health.reasons.join(" "), ...rates });
  return { ...health, ...rates };
}

export const sendFileHandler = async (event: { scenarioId?: string; requestedBy?: unknown }) => {
  const scenarioId = String(event.scenarioId || "");
  consoleAudit("send-started", { scenarioId: /^[a-z0-9-]{1,60}$/.test(scenarioId) ? scenarioId : "invalid", githubRun: runOf(event) });
  const health = await healthFirst("file");
  if (!health.ok) return { blocked: true, reasons: health.reasons, bounceRate: health.bounceRate, complaintRate: health.complaintRate };
  const result = await (await senderService()).sendFile(scenarioId, { pauseMs: 1100 });
  consoleAudit("send-finished", { scenarioId, sent: result.sent, failed: result.failed, githubRun: runOf(event) });
  return { ...result, bounceRate: health.bounceRate, complaintRate: health.complaintRate };
};

// Runs every morning on a schedule: the 30-day follow-up emails that are due.
export const followUpHandler = async () => {
  const health = await healthFirst("follow-ups");
  if (!health.ok) return { blocked: true, reasons: health.reasons }; // they wait until sending is healthy again
  const result = await (await senderService()).sendFollowUps({ pauseMs: 1100 });
  consoleAudit("followups-finished", { sent: result.sent, failed: result.failed });
  return result;
};

// Run on request (the "Export spreadsheets" button). Files land in a private
// bucket, in a folder named by date and time, and are deleted after 7 days.
export const exportHandler = async (event: { requestedBy?: unknown } = {}) => {
  const folder = new Date().toISOString().replace(/[:.]/g, "-");
  consoleAudit("export-started", { folder, githubRun: runOf(event) });
  const files = await buildExport(store());
  const s3 = new S3Client({});
  for (const [name, csv] of Object.entries(files)) {
    await s3.send(new PutObjectCommand({ Bucket: env("EXPORT_BUCKET"), Key: `${folder}/${name}`, Body: "\uFEFF" + csv /* marks the file as UTF-8 for Excel */, ContentType: "text/csv; charset=utf-8" }));
  }
  consoleAudit("export-finished", { folder, files: Object.keys(files).length, githubRun: runOf(event) });
  return { folder, files: Object.keys(files) };
};
