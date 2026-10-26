// Builds the owner's spreadsheets (CSV files). Flight recorder text is never
// included: the export can't read the recorders at all.

import { scenarios, type Scenario } from "./scenarios.ts";
import type { AnswersRecord, EventRecord, Store, Subscriber } from "./types.ts";

const text = (v: unknown): string => (v && typeof v === "object" && "todo" in v ? "[" + String((v as { todo: string }).todo) + "]" : String(v ?? ""));

// Spreadsheet programs run cells starting with = + - @ as formulas, so those
// are prefixed with ' to keep anything a reader typed from doing harm.
function cell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows: unknown[][]): string => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

function labels(sc: Scenario) {
  const screen = (id: string) => sc.screens.find((s) => s.id === id);
  const option = (screenId: string, optId: string) => screen(screenId)?.options?.find((o) => o.id === optId);
  const ledger = sc.screens.find((s) => s.type === "ledger") as unknown as { rows: { id: string; dimension: string; takeBack?: { label: unknown } }[] } | undefined;
  const flag = (id: string) => {
    const [kind, a, b] = id.split(":");
    if (kind === "reveal") return "Assumption: " + text(option(a, b)?.short ?? option(a, b)?.title);
    const row = ledger?.rows.find((r) => r.id === a);
    return "Ledger: " + (row ? row.dimension : a);
  };
  const takeBack = (id: string) => {
    const [kind, a, b] = id.split(":");
    if (kind === "thread") return text((sc.threads[a]?.takeBack as { label?: unknown } | undefined)?.label ?? sc.threads[a]?.title);
    if (kind === "ledger") return text(ledger?.rows.find((r) => r.id === a)?.takeBack?.label ?? flag(id));
    const o = option(a, b) as { takeBack?: { label: unknown } } | undefined;
    return text(o?.takeBack?.label ?? flag(id));
  };
  return { screen, option, flag, takeBack };
}

function answerRows(sc: Scenario, a: AnswersRecord): [string, string][] {
  const L = labels(sc);
  const s = a.state;
  const out: [string, string][] = [];
  for (const scr of sc.screens.filter((x) => x.options)) {
    const v = s.answers[scr.id];
    if (v === undefined) continue;
    const picked = (Array.isArray(v) ? v : [v]).map((id) => text(L.option(scr.id, id)?.title ?? id));
    out.push([text(scr.title), picked.join(" + ")]);
  }
  for (const [tid, opt] of Object.entries(s.threads)) {
    const th = sc.threads[tid];
    out.push(["Thread: " + text(th?.title), text(th?.options.find((o) => o.id === opt)?.title ?? opt)]);
  }
  out.push(["Threads pulled", s.pulled.map((t) => text(sc.threads[t]?.title ?? t)).join("; ")]);
  out.push(["Flagged", s.flags.map(L.flag).join("; ")]);
  out.push(["Flight recorder", !s.recorder ? "Not reached" : "skipped" in s.recorder ? "Skipped" : "Saved (private to the reader)"]);
  const tb = s.takeBack;
  if (tb && "item" in tb && tb.item && !tb.draft) {
    const tbScreen = sc.screens.find((x) => x.type === "takeback");
    const when = tbScreen?.whenOptions?.find((w) => w.id === tb.when)?.label ?? tb.when;
    out.push(["Take one thing back", L.takeBack(tb.item) + " (by " + when + ")"]);
    out.push(["30-day follow-up", tb.followUp ? "Yes" : "No"]);
  } else out.push(["Take one thing back", tb && "skipped" in tb ? "Skipped" : "Not reached"]);
  out.push(["File closed", s.closed ? "Yes" : "No"]);
  return out;
}

export function answersCsv(answers: AnswersRecord[], subscribers: Subscriber[], named: boolean): string {
  const emailOf = new Map(subscribers.map((s) => [s.id, s.email]));
  const rows: unknown[][] = [named ? ["email", "subscriber_id", "file", "question", "answer", "last_updated"] : ["subscriber_id", "file", "question", "answer", "last_updated"]];
  for (const a of answers) {
    const sc = scenarios[a.scenarioId];
    if (!sc) continue;
    for (const [q, ans] of answerRows(sc, a)) {
      const base = [a.subscriberId, sc.title, q, ans, a.updatedAt];
      rows.push(named ? [emailOf.get(a.subscriberId) ?? "", ...base] : base);
    }
  }
  return toCsv(rows);
}

export function subscribersCsv(subscribers: Subscriber[]): string {
  return toCsv([["email", "subscriber_id", "status", "signed_up", "confirmed", "unsubscribed", "paused_until"],
    ...subscribers.map((s) => [s.email, s.id, s.status, s.createdAt, s.confirmedAt ?? "", s.unsubscribedAt ?? "", s.pausedUntil ?? ""])]);
}

const SCREEN_NAMES: Record<string, string> = { story: "The twist", ledger: "The ledger", closing: "Closing screen" };
const screenName = (scr: { id: string; type: string; title?: unknown }) => (scr.title !== undefined ? text(scr.title) : SCREEN_NAMES[scr.type] ?? scr.id);

// The funnel: how many readers reached each step, where they dropped out,
// and how long each screen took (median).
export function summaryCsv(sc: Scenario, events: EventRecord[], answers: AnswersRecord[], subscribers: Subscriber[]): string {
  const ev = events.filter((e) => e.scenarioId === sc.id);
  const who = (pred: (e: EventRecord) => boolean) => new Set(ev.filter(pred).map((e) => e.subscriberId)).size;
  const opened = who((e) => e.name === "open");
  const pct = (n: number) => (opened ? Math.round((n / opened) * 100) + "%" : "");
  const rows: unknown[][] = [["measure", "readers", "share_of_readers_who_opened", "median_seconds_on_screen"]];

  const all = subscribers.length;
  const confirmed = subscribers.filter((s) => s.status !== "pending").length;
  rows.push(["Sign-ups confirmed (all files)", confirmed + " of " + all, "", ""]);
  rows.push(["Unsubscribed (all files)", subscribers.filter((s) => s.status === "unsubscribed").length, "", ""]);
  rows.push(["Paused at the moment (all files)", subscribers.filter((s) => s.status === "confirmed" && s.pausedUntil && Date.parse(s.pausedUntil) > Date.now()).length, "", ""]);
  rows.push(["Emails sent", who((e) => e.name === "sent"), "", ""]);
  rows.push(["Opened their link", opened, opened ? "100%" : "", ""]);

  // Time on each screen = gap until the reader's next screen (capped at 30 minutes).
  const durations = new Map<string, number[]>();
  const bySub = new Map<string, EventRecord[]>();
  ev.filter((e) => e.name === "screen").forEach((e) => bySub.set(e.subscriberId, [...(bySub.get(e.subscriberId) || []), e]));
  for (const list of bySub.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    list.forEach((e, i) => {
      const next = list[i + 1];
      if (!next || !e.target) return;
      const secs = (Date.parse(next.at) - Date.parse(e.at)) / 1000;
      if (secs > 0 && secs <= 1800) durations.set(e.target, [...(durations.get(e.target) || []), secs]);
    });
  }
  const median = (xs: number[] | undefined) => {
    if (!xs || !xs.length) return "";
    const s = [...xs].sort((a, b) => a - b);
    return Math.round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  };

  for (const scr of sc.screens) {
    const n = who((e) => e.name === "screen" && e.target === scr.id);
    rows.push(["Reached: " + screenName(scr), n, pct(n), median(durations.get(scr.id))]);
  }
  const closed = who((e) => e.name === "close");
  rows.push(["Closed the file", closed, pct(closed), ""]);
  for (const [tid, th] of Object.entries(sc.threads)) {
    const n = who((e) => e.name === "thread" && e.target === tid);
    rows.push(["Pulled thread: " + text(th.title), n, pct(n), ""]);
  }
  const saved = who((e) => e.name === "recorder" && e.target === "saved");
  rows.push(["Saved a flight recorder", saved, pct(saved), ""]);
  const tookBack = who((e) => e.name === "close" && e.target === "took-back");
  rows.push(["Chose one thing to take back", tookBack, pct(tookBack), ""]);
  const followUps = answers.filter((a) => a.scenarioId === sc.id && a.followUpDue).length;
  rows.push(["Asked for the 30-day follow-up", followUps, pct(followUps), ""]);
  const shared = who((e) => e.name === "share");
  rows.push(["Shared the file", shared, pct(shared), ""]);
  return toCsv(rows);
}

export async function buildExport(store: Store): Promise<Record<string, string>> {
  const [subscribers, answers, events] = await Promise.all([store.listSubscribers(), store.listAnswers(), store.listEvents()]);
  const files: Record<string, string> = {
    "subscribers.csv": subscribersCsv(subscribers),
    "answers-named.csv": answersCsv(answers, subscribers, true),
    "answers-anonymous.csv": answersCsv(answers, subscribers, false),
  };
  for (const sc of Object.values(scenarios)) files[`summary-${sc.id}.csv`] = summaryCsv(sc, events, answers, subscribers);
  return files;
}
