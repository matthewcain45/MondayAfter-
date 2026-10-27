// Checks what a reader's browser sends before anything is stored. Only known
// fields with real choices from the scenario get through; anything else is
// rejected. This stops junk, oversized or malicious data reaching the database.

import { LIMITS } from "./config.ts";
import type { ReaderState } from "./types.ts";
import type { Scenario } from "./scenarios.ts";

export class InvalidInput extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
// Only the exact date format browsers produce (2026-11-02T09:00:00.000Z), in a sensible range.
const isIso = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^20\d\d-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/.test(v)) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && t >= Date.UTC(2020, 0, 1) && t < Date.UTC(2100, 0, 1);
};

function fail(why: string): never {
  throw new InvalidInput(why);
}

function uniqueStrings(v: unknown, allowed: (s: string) => boolean, max: number, what: string): string[] {
  if (!Array.isArray(v)) fail(what + " must be a list");
  if (v.length > max) fail(what + " is too long");
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !allowed(x)) fail("Unknown " + what + ": " + String(x).slice(0, 40));
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

export function validateEmail(raw: unknown): string {
  if (typeof raw !== "string") fail("Email is missing");
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email)) fail("That doesn't look like an email address");
  return email;
}

// The form of an address used only for sign-up limits, so variations that all reach
// the same inbox count as one: anything after a "+", and dots in Gmail addresses.
// The address itself is stored and emailed exactly as typed.
export function emailForLimits(email: string): string {
  const at = email.lastIndexOf("@");
  let local = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return local + "@" + domain;
}

export function validateState(raw: unknown, scenario: Scenario): ReaderState {
  let size = Infinity;
  try {
    size = JSON.stringify(raw ?? null).length;
  } catch {
    // Too deeply nested to measure: treat as too big.
  }
  if (size > LIMITS.stateBytes) fail("Too much data");
  if (!isObj(raw)) fail("State must be an object");

  const choiceScreens = new Map(scenario.screens.filter((s) => s.options).map((s) => [s.id, s]));
  const screenIds = new Set(scenario.screens.map((s) => s.id));
  const threadIds = new Set(Object.keys(scenario.threads));
  const ledger = scenario.screens.find((s) => s.type === "ledger");
  const rowIds = new Set((ledger?.rows || []).map((r) => r.id));
  const takeback = scenario.screens.find((s) => s.type === "takeback");
  const whenIds = new Set((takeback?.whenOptions || []).map((w) => w.id));
  const optionIds = (screenId: string) => new Set((choiceScreens.get(screenId)?.options || []).map((o) => o.id));

  // answers: { screenId: optionId } or { screenId: [optionId, ...] } for multi-choice
  const answers: ReaderState["answers"] = {};
  if (raw.answers !== undefined) {
    if (!isObj(raw.answers)) fail("answers must be an object");
    for (const [sid, v] of Object.entries(raw.answers)) {
      const screen = choiceScreens.get(sid);
      if (!screen) fail("Unknown question: " + sid.slice(0, 40));
      const ok = optionIds(sid);
      if ((screen.max || 1) > 1) answers[sid] = uniqueStrings(v, (x) => ok.has(x), screen.max || 1, "choice");
      else if (typeof v === "string" && ok.has(v)) answers[sid] = v;
      else fail("Unknown choice for " + sid);
    }
  }

  const threads: ReaderState["threads"] = {};
  if (raw.threads !== undefined) {
    if (!isObj(raw.threads)) fail("threads must be an object");
    for (const [tid, v] of Object.entries(raw.threads)) {
      const th = threadIds.has(tid) ? scenario.threads[tid] : undefined; // never a built-in name like "constructor"
      if (!th || typeof v !== "string" || !th.options.some((o) => o.id === v)) fail("Unknown thread answer");
      threads[tid] = v;
    }
  }

  const pulled = uniqueStrings(raw.pulled ?? [], (x) => threadIds.has(x), threadIds.size, "thread");
  const flags = uniqueStrings(raw.flags ?? [], (x) => {
    const [kind, a, b, extra] = x.split(":");
    if (extra !== undefined) return false;
    if (kind === "ledger") return rowIds.has(a) && b === undefined;
    if (kind === "reveal") return optionIds(a).has(b);
    return false;
  }, 100, "flag");
  const isTakeBackItem = (x: string) => {
    const [kind, a, b, extra] = x.split(":");
    if (extra !== undefined) return false;
    if (kind === "thread") return threadIds.has(a) && b === undefined;
    if (kind === "ledger") return rowIds.has(a) && b === undefined;
    if (kind === "reveal") return optionIds(a).has(b);
    return false;
  };
  const reached = uniqueStrings(raw.reached ?? [], (x) => screenIds.has(x), screenIds.size, "screen");
  const last = raw.last === null || raw.last === undefined ? null : screenIds.has(String(raw.last)) ? String(raw.last) : fail("Unknown screen");

  // The flight recorder's text is never accepted here, only whether it was saved or skipped.
  let recorder: ReaderState["recorder"] = null;
  const r = raw.recorder;
  if (isObj(r)) {
    const keys = Object.keys(r).sort().join(",");
    if (keys === "skipped" && r.skipped === true) recorder = { skipped: true };
    else if (keys === "saved,savedAt" && r.saved === true && isIso(r.savedAt)) recorder = { saved: true, savedAt: r.savedAt };
    else fail("Flight recorder text can't be saved this way");
  } else if (r !== null && r !== undefined) fail("Bad flight recorder field");

  let takeBack: ReaderState["takeBack"] = null;
  const tb = raw.takeBack;
  if (isObj(tb)) {
    if (tb.skipped === true) takeBack = { skipped: true };
    else {
      const item = tb.item === null || tb.item === undefined ? null : String(tb.item);
      if (item !== null && !isTakeBackItem(item)) fail("Unknown take-back item");
      if (typeof tb.when !== "string" || !whenIds.has(tb.when)) fail("Unknown take-back date");
      takeBack = { item, when: tb.when, followUp: tb.followUp === true };
      if (tb.draft === true) takeBack.draft = true;
      if (tb.savedAt !== undefined) {
        if (!isIso(tb.savedAt)) fail("Bad date");
        takeBack.savedAt = tb.savedAt;
      }
    }
  } else if (tb !== null && tb !== undefined) fail("Bad take-back field");

  return { v: 1, answers, threads, pulled, flags, recorder, takeBack, closed: raw.closed === true, reached, last };
}

export function validateRecorder(raw: unknown, fields: string[]): Record<string, string> {
  if (!isObj(raw)) fail("Flight recorder must be an object");
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!fields.includes(k)) fail("Unknown flight recorder field");
    if (typeof v !== "string") fail("Flight recorder entries must be text");
    if (v.length > LIMITS.recorderFieldChars) fail("Please keep each entry under " + LIMITS.recorderFieldChars + " characters");
    out[k] = v.trim();
  }
  if (!out.hour) fail("Please write something for the first hour");
  return out;
}
