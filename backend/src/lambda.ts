// Entry points AWS Lambda runs. There are two, each with only the permissions
// it needs:
//   api            - everything except emailing a flight recorder; can lock recorders, not unlock them
//   recorderMailer - only "email me my flight recorder"; the one place allowed to unlock

import { dynamoStore, kmsKeys, sesMailer } from "./adapters/aws.ts";
import { createRouter, ROUTES, type Request } from "./http.ts";
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

function build(canDecrypt: boolean, routes: string[]) {
  const svc = createService({
    store: dynamoStore({
      subscribers: env("SUBSCRIBERS_TABLE"), links: env("LINKS_TABLE"), answers: env("ANSWERS_TABLE"),
      recorders: env("RECORDERS_TABLE"), events: env("EVENTS_TABLE"), limits: env("LIMITS_TABLE"),
    }),
    keys: kmsKeys(env("RECORDER_KEY_ID"), { canDecrypt }),
    mailer: sesMailer(env("FROM_ADDRESS"), env("REPLY_TO")),
    clock: { now: () => new Date() },
    settings: { siteUrl: env("SITE_URL"), brand: "The Monday After" },
  });
  const handle = createRouter(svc, routes);
  return async (event: HttpEvent) => {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
    const req: Request = {
      method: event.requestContext.http.method,
      path: event.requestContext.http.path,
      headers,
      body: event.body && event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body,
      ip: event.requestContext.http.sourceIp,
    };
    const res = await handle(req);
    return { statusCode: res.status, headers: res.headers, body: res.body };
  };
}

let api: ReturnType<typeof build> | undefined;
let mailer: ReturnType<typeof build> | undefined;

export const apiHandler = (event: HttpEvent) =>
  (api ??= build(false, Object.keys(ROUTES).filter((r) => r !== "emailRecorder")))(event);

export const recorderMailerHandler = (event: HttpEvent) => (mailer ??= build(true, ["emailRecorder"]))(event);
