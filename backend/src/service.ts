// What the backend actually does: sign-up, confirming, opening a magic link,
// saving answers and the flight recorder, analytics, unsubscribe and delete.

import { noAudit, type Audit } from "./audit.ts";
import { LIMITS, type Settings } from "./config.ts";
import { hashForLimit, hashToken, newId, newToken, seal, unseal } from "./crypto.ts";
import { confirmEmail, fileEmail, followUpEmail, recorderEmail } from "./emails.ts";
import { labels } from "./export.ts";
import { scenarios, type Scenario } from "./scenarios.ts";
import type { Clock, FollowUpAnswer, KeyService, Link, LinkPurpose, Mailer, ReaderState, Store, Subscriber } from "./types.ts";
import { networkForLimits } from "./edge.ts";
import { emailForLimits, InvalidInput, validateEmail, validateRecorder, validateState } from "./validate.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const EXPIRED = "This link has expired or isn't valid. Reply to any Monday After email and we'll send you a fresh one.";
const SLOW_DOWN = "Too many requests. Please wait a little and try again.";
const BUSY = "We're getting a lot of sign-ups right now. Please try again in an hour.";

// Analytics events the browser may send. Nothing free-text is ever accepted.
const EVENT_NAMES = new Set(["screen", "lock", "thread", "flag", "unflag", "recorder", "forecast", "close", "share", "recorder-email"]);

export interface Deps {
  store: Store;
  keys: KeyService;
  mailer: Mailer;
  clock: Clock;
  settings: Settings;
  audit?: Audit;
}

export function createService({ store, keys, mailer, clock, settings, audit = noAudit }: Deps) {
  const nowIso = () => clock.now().toISOString();
  const epoch = (plusSeconds: number) => Math.floor(clock.now().getTime() / 1000) + plusSeconds;

  async function issueLink(purpose: LinkPurpose, subscriberId: string, seconds: number, scenarioId?: string): Promise<string> {
    const token = newToken();
    await store.putLink({ tokenHash: hashToken(token), purpose, subscriberId, scenarioId, createdAt: nowIso(), expiresAt: epoch(seconds) });
    return token;
  }

  const urlFor = (page: string, token: string) => `${settings.siteUrl}/${page}#t=${token}`;
  const manageUrl = async (subscriberId: string) => urlFor("manage.html", await issueLink("manage", subscriberId, LIMITS.manageLinkSeconds));

  function limited(limit: string, subscriberId: string | undefined, message: string): never {
    audit("rate-limited", { limit, subscriberId });
    throw new ApiError(429, message);
  }

  async function resolve(token: unknown, purpose: LinkPurpose): Promise<{ link: Link; subscriber: Subscriber }> {
    // Readers always see the same message; the note records the real reason.
    const refuse = (reason: string, subscriberId?: string): never => {
      audit("link-refused", { purpose, reason, subscriberId });
      throw new ApiError(401, EXPIRED);
    };
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) refuse(token === undefined ? "missing" : "bad-format");
    const tokenHash = hashToken(token as string);
    const link = await store.getLink(tokenHash);
    if (!link) return refuse("unknown");
    if (link.purpose !== purpose) refuse("wrong-purpose", link.subscriberId);
    if (link.expiresAt < epoch(0)) refuse("expired", link.subscriberId);
    if ((await store.hit("link:" + tokenHash, 3600)) > LIMITS.requestsPerLinkPerHour) limited("link", link.subscriberId, SLOW_DOWN);
    const subscriber = await store.getSubscriber(link.subscriberId);
    if (!subscriber) return refuse("no-subscriber", link.subscriberId);
    return { link, subscriber };
  }

  async function resolveFile(token: unknown): Promise<{ link: Link; subscriber: Subscriber; scenario: Scenario }> {
    const found = await resolve(token, "file");
    const scenario = found.link.scenarioId ? scenarios[found.link.scenarioId] : undefined;
    if (!scenario) {
      audit("link-refused", { purpose: "file", reason: "unknown-file", subscriberId: found.subscriber.id });
      throw new ApiError(401, EXPIRED);
    }
    return { ...found, scenario };
  }

  const recorderFields = (scenario: Scenario) => {
    const screen = scenario.screens.find((s) => s.type === "recorder") as unknown as { fields: { id: string; label: string }[] } | undefined;
    return screen ? screen.fields : [];
  };

  return {
    // Same reply whatever happens, so the form can't be used to find out who is subscribed.
    async signup(input: { email?: unknown; website?: unknown; ip: string }): Promise<{ ok: true }> {
      if (typeof input.website === "string" && input.website.trim() !== "") {
        audit("signup-trap");
        return { ok: true }; // a bot filled the hidden trap field
      }
      if ((await store.hit("signup-ip:" + hashForLimit(networkForLimits(input.ip)), 3600)) > LIMITS.signupsPerIpPerHour) limited("signup-visitor", undefined, SLOW_DOWN);
      const email = wrapInvalid(() => validateEmail(input.email));
      if ((await store.hit("signup-everyone", 3600)) > LIMITS.signupsPerHourEveryone) limited("signup-everyone", undefined, BUSY);
      if ((await store.hit("signup-email:" + hashForLimit(emailForLimits(email)), 86400)) > LIMITS.signupsPerEmailPerDay) {
        audit("rate-limited", { limit: "signup-address" });
        return { ok: true }; // same reply as always, so the form can't reveal anything
      }

      let subscriber = await store.findSubscriberByEmail(email);
      if (subscriber?.status === "confirmed") return { ok: true };
      if (!subscriber) {
        subscriber = { id: newId(), email, status: "pending", createdAt: nowIso(), expiresAt: epoch(LIMITS.pendingSignupSeconds) };
        await store.putSubscriber(subscriber);
      }
      const token = await issueLink("confirm", subscriber.id, LIMITS.confirmLinkSeconds);
      await mailer.send(confirmEmail(email, settings.brand, urlFor("confirm.html", token)));
      audit("signup", { subscriberId: subscriber.id });
      return { ok: true };
    },

    async confirm(token: unknown): Promise<{ ok: true }> {
      const { link, subscriber } = await resolve(token, "confirm");
      await store.putSubscriber({ ...subscriber, status: "confirmed", confirmedAt: nowIso(), unsubscribedAt: undefined, expiresAt: epoch(LIMITS.retentionSeconds) });
      await store.deleteLink(link.tokenHash);
      audit("confirmed", { subscriberId: subscriber.id });
      return { ok: true };
    },

    // The "Send Incident File" button: one personal link per confirmed reader.
    // Carries on past individual failures and reports counts only (no addresses).
    async sendFile(scenarioId: string, options: { pauseMs?: number } = {}): Promise<{ sent: number; failed: number }> {
      const scenario = scenarios[scenarioId];
      if (!scenario?.email) throw new Error("Unknown scenario, or it has no email: " + scenarioId);
      const now = clock.now().toISOString();
      const readers = (await store.listSubscribers()).filter((s) => s.status === "confirmed" && !(s.pausedUntil && s.pausedUntil > now));
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

    // Runs every morning: emails readers whose 30-day follow-up is due, once each.
    // Unsubscribed readers are skipped. Paused readers still get it: they asked for it.
    async sendFollowUps(options: { pauseMs?: number; asOf?: Date } = {}): Promise<{ sent: number; failed: number }> {
      const today = (options.asOf || clock.now()).toISOString().slice(0, 10);
      const due = (await store.listAnswers()).filter((a) => a.followUpDue && a.followUpDue <= today && !a.followUpSentAt);
      let sent = 0;
      let failed = 0;
      for (const a of due) {
        const scenario = scenarios[a.scenarioId];
        const tb = a.state.takeBack;
        const subscriber = await store.getSubscriber(a.subscriberId);
        if (!scenario || !tb || !("item" in tb) || !tb.item || !tb.followUp || subscriber?.status !== "confirmed") continue;
        try {
          const token = await issueLink("followup", subscriber.id, LIMITS.followUpLinkSeconds, scenario.id);
          const action = labels(scenario).takeBack(tb.item);
          await mailer.send(followUpEmail(subscriber.email, scenario.title, action, urlFor("followup.html", token), await manageUrl(subscriber.id)));
          await store.putAnswers({ ...a, followUpSentAt: nowIso() });
          await store.putEvent({ subscriberId: subscriber.id, scenarioId: scenario.id, at: nowIso(), name: "followup-sent", expiresAt: epoch(LIMITS.retentionSeconds) });
          audit("followup-sent", { subscriberId: subscriber.id, scenarioId: scenario.id });
          sent++;
        } catch {
          failed++;
        }
        if (options.pauseMs) await new Promise((res) => setTimeout(res, options.pauseMs));
      }
      return { sent, failed };
    },

    // What the follow-up page shows: the file, the action, and any answer already given.
    async followUpStatus(token: unknown): Promise<{ fileTitle: string; action: string; answer: FollowUpAnswer | null }> {
      const { link, subscriber } = await resolve(token, "followup");
      const scenario = link.scenarioId ? scenarios[link.scenarioId] : undefined;
      const record = scenario ? await store.getAnswers(subscriber.id, scenario.id) : undefined;
      const tb = record?.state.takeBack;
      if (!scenario || !record || !tb || !("item" in tb) || !tb.item) throw new ApiError(410, "There's nothing to answer for this file any more.");
      return { fileTitle: scenario.title, action: labels(scenario).takeBack(tb.item), answer: record.followUpAnswer?.answer ?? null };
    },

    async answerFollowUp(token: unknown, raw: unknown): Promise<{ ok: true }> {
      const { link, subscriber } = await resolve(token, "followup");
      const answer = (raw && typeof raw === "object" ? (raw as { answer?: unknown }).answer : undefined) as FollowUpAnswer;
      if (!["done", "partly", "not-yet"].includes(answer)) throw new ApiError(400, "Please choose one of the answers.");
      const record = link.scenarioId ? await store.getAnswers(subscriber.id, link.scenarioId) : undefined;
      if (!record) throw new ApiError(410, "There's nothing to answer for this file any more.");
      await store.putAnswers({ ...record, followUpAnswer: { answer, at: nowIso() } });
      audit("followup-answered", { subscriberId: subscriber.id, scenarioId: record.scenarioId });
      return { ok: true };
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
      const due = tb && "item" in tb && tb.item && tb.followUp && tb.savedAt && !tb.draft ? Date.parse(tb.savedAt) + 30 * 86400 * 1000 : NaN;
      const followUpDue = Number.isFinite(due) ? new Date(due).toISOString().slice(0, 10) : undefined;
      // Keep the follow-up's history: it's sent once, and the reader's answer stays.
      const before = await store.getAnswers(subscriber.id, scenario.id);
      await store.putAnswers({
        subscriberId: subscriber.id, scenarioId: scenario.id, state, updatedAt: nowIso(), followUpDue,
        followUpSentAt: before?.followUpSentAt, followUpAnswer: before?.followUpAnswer, expiresAt: epoch(LIMITS.retentionSeconds),
      });
      return { ok: true };
    },

    async saveRecorder(token: unknown, raw: unknown): Promise<{ savedAt: string }> {
      const { subscriber, scenario } = await resolveFile(token);
      const fields = recorderFields(scenario);
      const entries = wrapInvalid(() => validateRecorder(raw, fields.map((f) => f.id)));
      const context = { subscriberId: subscriber.id, scenarioId: scenario.id, purpose: "flight-recorder" };
      const savedAt = nowIso();
      await store.putRecorder({ subscriberId: subscriber.id, scenarioId: scenario.id, sealed: await seal(keys, JSON.stringify(entries), context), savedAt, expiresAt: epoch(LIMITS.retentionSeconds) });
      audit("recorder-saved", { subscriberId: subscriber.id, scenarioId: scenario.id });
      return { savedAt };
    },

    // The only code allowed to unlock a flight recorder, and it only ever sends
    // it to the reader's own email address.
    async emailRecorder(token: unknown): Promise<{ ok: true }> {
      const { subscriber, scenario } = await resolveFile(token);
      if ((await store.hit("recorder-email:" + hashForLimit(subscriber.id), 86400)) > LIMITS.recorderEmailsPerDay) limited("recorder-email", subscriber.id, SLOW_DOWN);
      const rec = await store.getRecorder(subscriber.id, scenario.id);
      if (!rec) throw new ApiError(409, "There's no saved flight recorder for this file."); // not 404: CloudFront swaps 404s for its "page not found" page
      const context = { subscriberId: subscriber.id, scenarioId: scenario.id, purpose: "flight-recorder" };
      const entries = JSON.parse(await unseal(keys, rec.sealed, context)) as Record<string, string>;
      const labels = recorderFields(scenario).map((f) => ({ label: f.label.split("·")[0].trim(), text: entries[f.id] || "" }));
      await mailer.send(recorderEmail(subscriber.email, settings.brand, scenario.title, rec.savedAt, labels, await manageUrl(subscriber.id)));
      audit("recorder-emailed", { subscriberId: subscriber.id, scenarioId: scenario.id });
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

    // What the manage page shows. Deliberately not the email address: anyone
    // holding a forwarded email shouldn't learn more from the link than the email says.
    async manageStatus(token: unknown): Promise<{ status: "subscribed" | "paused" | "unsubscribed"; pausedUntil?: string }> {
      const { subscriber } = await resolve(token, "manage");
      if (subscriber.status === "unsubscribed") return { status: "unsubscribed" };
      if (subscriber.pausedUntil && subscriber.pausedUntil > nowIso()) return { status: "paused", pausedUntil: subscriber.pausedUntil };
      return { status: "subscribed" };
    },

    async pause(token: unknown): Promise<{ pausedUntil: string }> {
      const { subscriber } = await resolve(token, "manage");
      if (subscriber.status === "unsubscribed") throw new ApiError(409, "You're unsubscribed, so there's nothing to pause.");
      const pausedUntil = new Date(clock.now().getTime() + LIMITS.pauseSeconds * 1000).toISOString();
      await store.putSubscriber({ ...subscriber, pausedUntil });
      audit("paused", { subscriberId: subscriber.id });
      return { pausedUntil };
    },

    async resume(token: unknown): Promise<{ ok: true }> {
      const { subscriber } = await resolve(token, "manage");
      await store.putSubscriber({ ...subscriber, pausedUntil: undefined });
      audit("resumed", { subscriberId: subscriber.id });
      return { ok: true };
    },

    async unsubscribe(token: unknown): Promise<{ ok: true }> {
      const { subscriber } = await resolve(token, "manage");
      if (subscriber.status !== "unsubscribed") await store.putSubscriber({ ...subscriber, status: "unsubscribed", unsubscribedAt: nowIso() });
      audit("unsubscribed", { subscriberId: subscriber.id });
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
      audit("deleted", { subscriberId: subscriber.id }); // kept 90 days as a record that it was done
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
