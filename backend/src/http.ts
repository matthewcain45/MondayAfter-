// Turns web requests into service calls. Personal links travel in our own
// "X-TMA-Link" header, never in the web address, so they don't end up in logs.

import { noAudit, type Audit } from "./audit.ts";
import { ApiError, type Service } from "./service.ts";

export interface Request {
  method: string;
  path: string;
  headers: Record<string, string | undefined>; // lower-case names
  body: string | undefined;
  ip: string;
}

export interface Response {
  status: number;
  headers: Record<string, string>;
  body: string;
}

type Handler = (svc: Service, token: string | undefined, body: unknown, req: Request) => Promise<unknown>;

export const ROUTES: Record<string, { method: string; path: string; run: Handler }> = {
  signup: { method: "POST", path: "/api/signup", run: (svc, _t, b, req) => svc.signup({ ...(b as object), ip: req.ip }) },
  confirm: { method: "POST", path: "/api/confirm", run: (svc, t) => svc.confirm(t) },
  openFile: { method: "GET", path: "/api/file", run: (svc, t) => svc.openFile(t) },
  saveState: { method: "PUT", path: "/api/file/state", run: (svc, t, b) => svc.saveState(t, b) },
  saveRecorder: { method: "PUT", path: "/api/file/recorder", run: (svc, t, b) => svc.saveRecorder(t, b) },
  emailRecorder: { method: "POST", path: "/api/file/recorder/email", run: (svc, t) => svc.emailRecorder(t) },
  track: { method: "POST", path: "/api/events", run: (svc, t, b) => svc.track(t, b) },
  manageStatus: { method: "POST", path: "/api/manage", run: (svc, t) => svc.manageStatus(t) },
  pause: { method: "POST", path: "/api/pause", run: (svc, t) => svc.pause(t) },
  resume: { method: "POST", path: "/api/resume", run: (svc, t) => svc.resume(t) },
  unsubscribe: { method: "POST", path: "/api/unsubscribe", run: (svc, t) => svc.unsubscribe(t) },
  deleteMe: { method: "POST", path: "/api/delete", run: (svc, t) => svc.deleteMe(t) },
  followUpStatus: { method: "POST", path: "/api/followup", run: (svc, t) => svc.followUpStatus(t) },
  answerFollowUp: { method: "POST", path: "/api/followup/answer", run: (svc, t, b) => svc.answerFollowUp(t, b) },
};

const MAX_BODY = 32 * 1024;

function reply(status: number, data: unknown): Response {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    body: JSON.stringify(data),
  };
}

// `allowed` lists the routes this deployment answers. The flight recorder
// mailer runs separately from everything else so only it can unlock recorders.
export function createRouter(svc: Service, allowed: string[] = Object.keys(ROUTES), audit: Audit = noAudit) {
  const routes = allowed.map((name) => ROUTES[name]);

  return async function handle(req: Request): Promise<Response> {
    const route = routes.find((r) => r.path === req.path);
    if (!route) return reply(404, { error: "Not found" });
    if (route.method !== req.method) return reply(405, { error: "Method not allowed" });
    try {
      let body: unknown = undefined;
      if (req.body) {
        if (req.body.length > MAX_BODY) return reply(413, { error: "Too much data" });
        try {
          body = JSON.parse(req.body);
        } catch {
          return reply(400, { error: "Couldn't read the request" });
        }
      }
      const token = req.headers["x-tma-link"]?.trim() || undefined;
      return reply(200, await route.run(svc, token, body, req));
    } catch (e) {
      if (e instanceof ApiError) {
        // The route and status only: the message can echo part of what was sent.
        audit("request-refused", { method: req.method, path: req.path, status: e.status });
        return reply(e.status, { error: e.message });
      }
      // Log the route and error only: never request bodies, emails or tokens.
      console.error("Request failed", req.method, req.path, e instanceof Error ? e.message : "unknown error");
      return reply(500, { error: "Something went wrong. Please try again." });
    }
  };
}
