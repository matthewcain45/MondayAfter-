// What the backend actually does: sign-up, confirming, opening a magic link,
// saving answers and the flight recorder, analytics, unsubscribe and delete.

import { LIMITS, type Settings } from "./config.ts";
import { hashForLimit, hashToken, newId, newToken, seal, unseal } from "./crypto.ts";
import { confirmEmail, fileEmail, recorderEmail } from "./emails.ts";
import { scenarios, type Scenario } from "./scenarios.ts";
import type { Clock, KeyService, Link, LinkPurpose, Mailer, ReaderState, Store, Subscriber } from "./types.ts";
import { InvalidInput, validateEmail, validateRecorder, validateState } from "./validate.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const EXPIRED = "This link has expired or isn't valid. Reply to any Monday After email and we'll send you a fresh one.";
const SLOW_DOWN = "Too many requests. Please wait a little and try again.";

// Analytics events the browser may send. Nothing free-text is ever accepted.
const EVENT_NAMES = new Set(["screen", "lock", "thread", "flag", "unflag", "recorder", "forecast", "close", "share", "recorder-email"]);

export interface Deps {
  store: Store;
  keys: KeyService;
  mailer: Mailer;
  clock: Clock;
  settings: Settings;
}

export function createService({ store, keys, mailer, clock, settings }: Deps) {
  const nowIso = () => clock.now().toISOString();
  const epoch = (plusSeconds: number) => Math.floor(clock.now().getTime() / 1000) + plusSeconds;

  async function issueLink(purpose: LinkPurpose, subscriberId: string, seconds: number, scenarioId?: string): Promise<string> {
    const token = newToken();
    await store.putLink({ tokenHash: hashToken(token), purpose, subscriberId, scenarioId, createdAt: nowIso(), expiresAt: epoch(seconds) });
    return token;
  }

  const urlFor = (page: string, token: string) => `${settings.siteUrl}/${page}#t=${token}`;
  const manageUrl = async (subscriberId: string) => urlFor("manage.html", await issueLink("manage", subscriberId, LIMITS.manageLinkSeconds));

  async function resolve(token: unknown, purpose: LinkPurpose): Promise<{ link: Link; subscriber: Subscriber }> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, EXPIRED);
    const tokenHash = hashToken(token);
    const link = await store.getLink(tokenHash);
    if (!link || link.purpose !== purpose || link.expiresAt < epoch(0)) throw new ApiError(401, EXPIRED);
    if ((await store.hit("link:" + tokenHash, 3600)) > LIMITS.requestsPerLinkPerHour) throw new ApiError(429, SLOW_DOWN);
    const subscriber = await store.getSubscriber(link.subscriberId);
    if (!subscriber) throw new ApiError(401, EXPIRED);
    return { link, subscriber };
  }

  async function resolveFile(token: unknown): Promise<{ link: Link; subscriber: Subscriber; scenario: Scenario }> {
    const found = await resolve(token, "file");
    const scenario = found.link.scenarioId ? scenarios[found.link.scenarioId] : undefined;
    if (!scenario) throw new ApiError(401, EXPIRED);
    return { ...found, scenario };
  }

  const recorderFields = (scenario: Scenario) => {
    const screen = scenario.screens.find((s) => s.type === "recorder") as unknown as { fields: { id: string; label: string }[] } | undefined;
    return screen ? screen.fields : [];
  };

  return {
    // Same reply whatever happens, so the form can't be used to find out who is subscribed.
    async signup(input: { email?: unknown; website?: unknown; ip: string }): Promise<{ ok: true }> {
      if (typeof input.website === "string" && input.website.trim() !== "") return { ok: true }; // a bot filled the hidden trap field
      if ((await store.hit("signup-ip:" + hashForLimit(input.ip), 3600)) > LIMITS.signupsPerIpPerHour) throw new ApiError(429, SLOW_DOWN);
      const email = wrapInvalid(() => validateEmail(input.email));
      if ((await store.hit("signup-email:" + hashForLimit(email), 86400)) > LIMITS.signupsPerEmailPerDay) return { ok: true };

      let subscriber = await store.findSubscriberByEmail(email);
      if (subscriber?.status === "confirmed") return { ok: true };
      if (!subscriber) {
        subscriber = { id: newId(), email, status: "pending", createdAt: nowIso(), expiresAt: epoch(LIMITS.pendingSignupSeconds) };
        await store.putSubscriber(subscriber);
      }
      const token = await issueLink("confirm", subscriber.id, LIMITS.confirmLinkSeconds);
      await mailer.send(confirmEmail(email, settings.brand, urlFor("confirm.html", token)));
      return { ok: true };
    },

    async confirm(token: unknown): Promise<{ ok: true }> {
      const { link, subscriber } = await resolve(token, "confirm");
      await store.putSubscriber({ ...subscriber, status: "confirmed", confirmedAt: nowIso(), unsubscribedAt: undefined, expiresAt: epoch(LIMITS.retentionSeconds) });
      await store.deleteLink(link.tokenHash);
      return { ok: true };
    },

    // The "Send Incident File" button: one personal link per confirmed reader.
    // Carries on past individual failures and reports counts only (no addresses).
    async sendFile(scenarioId: string, options: { pauseMs?: number } = {}): Promise<{ sent: number; failed: number }> {
      const scenario = scenarios[scenarioId];
      if (!scenario?.email) throw new Error("Unknown scenario, or it has no email: " + scenarioId);
      const readers = (await store.listSubscribers()).filter((s) => s.status === "confirmed");
      let sent = 0;
      let failed = 0;
      for (const r of readers) {
        try {
          const token = await issueLink("file", r.id, LIMITS.fileLinkSeconds, scenarioId);
          await mailer.send(fileEmail(r.email, scenario.email, urlFor("index.html", token), await manageUrl(r.id)));
          await store.putEvent({ subscriberId: r.id, scenarioId, at: nowIso(), name: "sent", expiresAt: epoch(LIMITS.retentionSeconds) });
          sent++;
        } catch {
          failed++;
        }
        if (options.pauseMs) await new Promise((res) => setTimeout(res, options.pauseMs));
      }
      return { sent, failed };
    },

    // Creates one reader's personal link for a file.
    async issueFileLink(subscriberId: string, scenarioId: string): Promise<string> {
      if (!scenarios[scenarioId]) throw new Error("Unknown scenario " + scenarioId);
      return issueLink("file", subscriberId, LIMITS.fileLinkSeconds, scenarioId);
    },
    manageUrl,

    async openFile(token: unknown) {
      const { subscriber, scenario } = await resolveFile(token);
      // Taking part restarts the 2-year clock on the reader's record.
      await store.putSubscriber({ ...subscriber, expiresAt: epoch(LIMITS.retentionSeconds) });
      const saved = await store.getAnswers(subscriber.id, scenario.id);
      const recorder = await store.getRecorder(subscriber.id, scenario.id);
      await store.putEvent({ subscriberId: subscriber.id, scenarioId: scenario.id, at: nowIso(), name: "open", expiresAt: epoch(LIMITS.retentionSeconds) });
      return { scenarioId: scenario.id, state: saved ? saved.state : null, recorder: recorder ? { saved: true, savedAt: recorder.savedAt } : null };
    },

    async saveState(token: unknown, raw: unknown): Promise<{ ok: true }> {
      const { subscriber, scenario } = await resolveFile(token);
      const state: ReaderState = wrapInvalid(() => validateState(raw, scenario));
      const tb = state.takeBack;
      const followUpDue = tb && "item" in tb && tb.item && tb.followUp && tb.savedAt && !tb.draft
        ? new Date(Date.parse(tb.savedAt) + 30 * 86400 * 1000).toISOString().slice(0, 10)
        : undefined;
      await store.putAnswers({ subscriberId: subscriber.id, scenarioId: scenario.id, state, updatedAt: nowIso(), followUpDue, expiresAt: epoch(LIMITS.retentionSeconds) });
      return { ok: true };
    },

    async saveRecorder(token: unknown, raw: unknown): Promise<{ savedAt: string }> {
      const { subscriber, scenario } = await resolveFile(token);
      const fields = recorderFields(scenario);
      const entries = wrapInvalid(() => validateRecorder(raw, fields.map((f) => f.id)));
      const context = { subscriberId: subscriber.id, scenarioId: scenario.id, purpose: "flight-recorder" };
      const savedAt = nowIso();
      await store.putRecorder({ subscriberId: subscriber.id, scenarioId: scenario.id, sealed: await seal(keys, JSON.stringify(entries), context), savedAt, expiresAt: epoch(LIMITS.retentionSeconds) });
      return { savedAt };
    },

    // The only code allowed to unlock a flight recorder, and it only ever sends
    // it to the reader's own email address.
    async emailRecorder(token: unknown): Promise<{ ok: true }> {
      const { subscriber, scenario } = await resolveFile(token);
      if ((await store.hit("recorder-email:" + hashForLimit(subscriber.id), 86400)) > LIMITS.recorderEmailsPerDay) throw new ApiError(429, SLOW_DOWN);
      const rec = await store.getRecorder(subscriber.id, scenario.id);
      if (!rec) throw new ApiError(404, "There's no saved flight recorder for this file.");
      const context = { subscriberId: subscriber.id, scenarioId: scenario.id, purpose: "flight-recorder" };
      const entries = JSON.parse(await unseal(keys, rec.sealed, context)) as Record<string, string>;
      const labels = recorderFields(scenario).map((f) => ({ label: f.label.split("·")[0].trim(), text: entries[f.id] || "" }));
      await mailer.send(recorderEmail(subscriber.email, settings.brand, scenario.title, rec.savedAt, labels, await manageUrl(subscriber.id)));
      return { ok: true };
    },

    async track(token: unknown, raw: unknown): Promise<{ ok: true }> {
      const { subscriber, scenario } = await resolveFile(token);
      const e = (raw && typeof raw === "object" ? raw : {}) as { name?: unknown; target?: unknown };
      if (typeof e.name !== "string" || !EVENT_NAMES.has(e.name)) throw new ApiError(400, "Unknown event");
      if (e.target !== undefined && (typeof e.target !== "string" || !/^[A-Za-z0-9:_-]{1,60}$/.test(e.target))) throw new ApiError(400, "Bad event");
      await store.putEvent({ subscriberId: subscriber.id, scenarioId: scenario.id, at: nowIso(), name: e.name, target: e.target as string | undefined, expiresAt: epoch(LIMITS.retentionSeconds) });
      return { ok: true };
    },

    async unsubscribe(token: unknown): Promise<{ ok: true }> {
      const { subscriber } = await resolve(token, "manage");
      if (subscriber.status !== "unsubscribed") await store.putSubscriber({ ...subscriber, status: "unsubscribed", unsubscribedAt: nowIso() });
      return { ok: true };
    },

    // Removes everything we hold about this person, straight away.
    async deleteMe(token: unknown): Promise<{ ok: true }> {
      const { subscriber } = await resolve(token, "manage");
      await store.deleteAnswersFor(subscriber.id);
      await store.deleteRecordersFor(subscriber.id);
      await store.deleteEventsFor(subscriber.id);
      await store.deleteLinksFor(subscriber.id);
      await store.deleteSubscriber(subscriber.id);
      return { ok: true };
    },
  };
}

export type Service = ReturnType<typeof createService>;

function wrapInvalid<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof InvalidInput) throw new ApiError(400, e.message);
    throw e;
  }
}
