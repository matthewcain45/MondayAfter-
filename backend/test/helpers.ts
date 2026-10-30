// Test set-up: two services sharing one in-memory database and key, mirroring
// the real split (the API can lock flight recorders; only the mailer can unlock).

import { randomBytes } from "node:crypto";
import { fixedClock, memoryKeys, memoryMailer, memoryStore } from "../src/adapters/memory.ts";
import { createRouter, ROUTES } from "../src/http.ts";
import { createService } from "../src/service.ts";

export const FAKE_EMAIL = "alex.example@example.com";

export function setup() {
  const clock = fixedClock("2026-11-02T09:00:00Z");
  const store = memoryStore(clock);
  const mailer = memoryMailer();
  const master = randomBytes(32);
  const settings = { siteUrl: "https://test.example", brand: "The Monday After" };
  const api = createService({ store, keys: memoryKeys({ canDecrypt: false }, master), mailer, clock, settings });
  const recorderMailer = createService({ store, keys: memoryKeys({ canDecrypt: true }, master), mailer, clock, settings });
  const apiRouter = createRouter(api, Object.keys(ROUTES).filter((r) => r !== "emailRecorder"));
  const mailerRouter = createRouter(recorderMailer, ["emailRecorder"]);
  return { clock, store, mailer, api, recorderMailer, apiRouter, mailerRouter };
}

export const tokenFrom = (text: string) => /#t=([A-Za-z0-9_-]{43})/.exec(text)![1];

// Signs up and confirms a fake reader, then issues their link for Incident File 01.
export async function confirmedReader(env: ReturnType<typeof setup>, email = FAKE_EMAIL) {
  await env.api.signup({ email, ip: "203.0.113.10" });
  await env.api.confirm(tokenFrom(env.mailer.outbox.at(-1)!.text));
  const sub = (await env.store.findSubscriberByEmail(email))!;
  const token = await env.api.issueFileLink(sub.id, "incident-file-01");
  return { sub, token };
}

// A confirmed reader who hasn't been sent any file yet (as readers who signed up
// before files were sent on confirming).
export async function readerWithoutFile(env: ReturnType<typeof setup>, email = FAKE_EMAIL) {
  const sub = { id: "sub-" + email.split("@")[0].replace(/\W/g, ""), email, status: "confirmed" as const, createdAt: "2026-10-01T09:00:00.000Z", confirmedAt: "2026-10-01T09:05:00.000Z", expiresAt: 4102444800 };
  await env.store.putSubscriber(sub);
  return { sub };
}

export function designRouteState() {
  return {
    v: 1,
    answers: { d1: ["A", "B"], holding: "B2", d2: "1", forecast: "same" },
    threads: { t2: "hr", t3: "note" },
    pulled: ["t2", "t3"],
    flags: ["reveal:d1:B", "ledger:dependency"],
    recorder: { saved: true, savedAt: "2026-11-02T09:05:00.000Z" },
    takeBack: { item: "thread:t2", when: "2w", followUp: true, savedAt: "2026-11-02T09:10:00.000Z" },
    closed: true,
    reached: ["d1", "holding", "reveal1", "twist", "d2", "recorder", "forecast", "ledger", "takeback", "closing"],
    last: "closing",
  };
}
