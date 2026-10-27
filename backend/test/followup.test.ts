// The 30-day follow-up email and its answer page, and the check before every send.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkSendingHealth } from "../src/reputation.ts";
import { ApiError } from "../src/service.ts";
import { answersCsv, summaryCsv } from "../src/export.ts";
import { scenarios } from "../src/scenarios.ts";
import { confirmedReader, designRouteState, FAKE_EMAIL, setup, tokenFrom } from "./helpers.ts";

const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof ApiError && e.status === status);
const in31Days = new Date("2026-12-03T09:00:00Z"); // the test clock is 2 November 2026

async function readerWhoAskedForFollowUp(followUp = true) {
  const env = setup();
  const { sub, token } = await confirmedReader(env);
  const state = designRouteState();
  await env.api.saveState(token, { ...state, takeBack: { ...state.takeBack, followUp } });
  env.mailer.outbox.length = 0;
  return { env, sub, token };
}

describe("30-day follow-up", () => {
  it("is sent once, 30 days on, with the action the reader chose", async () => {
    const { env } = await readerWhoAskedForFollowUp();
    assert.deepEqual(await env.api.sendFollowUps(), { sent: 0, failed: 0 }); // not due yet
    assert.deepEqual(await env.api.sendFollowUps({ asOf: in31Days }), { sent: 1, failed: 0 });
    const mail = env.mailer.outbox[0];
    assert.equal(mail.to, FAKE_EMAIL);
    assert.match(mail.subject, /Did you do it\? Incident File 01/);
    assert.match(mail.text, /followup\.html#t=/);
    assert.match(mail.text, /manage\.html#t=/, "every email has the pause, unsubscribe and delete link");
    assert.match(mail.oneClickUnsubscribeUrl!, /\/api\/unsubscribe\/one-click\//);
    assert.deepEqual(await env.api.sendFollowUps({ asOf: in31Days }), { sent: 0, failed: 0 }, "never sent twice");
  });

  it("isn't sent to readers who didn't tick the box, or who unsubscribed", async () => {
    const a = await readerWhoAskedForFollowUp(false);
    assert.equal((await a.env.api.sendFollowUps({ asOf: in31Days })).sent, 0);
    const b = await readerWhoAskedForFollowUp(true);
    await b.env.api.unsubscribe(tokenFrom(await b.env.api.manageUrl(b.sub.id)));
    assert.equal((await b.env.api.sendFollowUps({ asOf: in31Days })).sent, 0);
  });

  it("records the reader's answer, which they can change, and it survives later saves", async () => {
    const { env, token } = await readerWhoAskedForFollowUp();
    await env.api.sendFollowUps({ asOf: in31Days });
    const link = tokenFrom(env.mailer.outbox[0].text);
    const status = await env.api.followUpStatus(link);
    assert.equal(status.fileTitle, "Incident File 01");
    assert.equal(status.answer, null);
    assert.ok(status.action.length > 5);

    await env.api.answerFollowUp(link, { answer: "partly" });
    await env.api.answerFollowUp(link, { answer: "done" });
    assert.equal((await env.api.followUpStatus(link)).answer, "done");
    await rejects(env.api.answerFollowUp(link, { answer: "maybe" }), 400);

    await env.api.saveState(token, designRouteState()); // the reader opens the file again
    const rec = (await env.store.listAnswers())[0];
    assert.equal(rec.followUpAnswer?.answer, "done");
    assert.ok(rec.followUpSentAt);
    assert.match(answersCsv([rec], [], false), /Done at 30 days,Yes/);
    assert.match(summaryCsv(scenarios["incident-file-01"], [], [rec], []), /Done at 30 days: Yes,1/);
  });

  it("only works with the follow-up link, not the file or manage link", async () => {
    const { env, sub, token } = await readerWhoAskedForFollowUp();
    await rejects(env.api.followUpStatus(token), 401);
    await rejects(env.api.answerFollowUp(tokenFrom(await env.api.manageUrl(sub.id)), { answer: "done" }), 401);
  });
});

describe("the check before every send", () => {
  const source = (h: Partial<{ sendingEnabled: boolean; enforcement: string; bounceRate: number | null; complaintRate: number | null }>) => ({
    read: async () => ({ sendingEnabled: true, enforcement: "HEALTHY", bounceRate: 0.01, complaintRate: 0, ...h }),
  });

  it("allows sending when the account is healthy, or there's no data yet", async () => {
    assert.equal((await checkSendingHealth(source({}))).ok, true);
    assert.equal((await checkSendingHealth(source({ bounceRate: null, complaintRate: null }))).ok, true);
  });

  it("stops sending when rates are too high or AWS has flagged the account", async () => {
    const bounce = await checkSendingHealth(source({ bounceRate: 0.04 }));
    assert.equal(bounce.ok, false);
    assert.match(bounce.reasons[0], /Bounce rate is 4%; the limit is 4%/);
    assert.equal((await checkSendingHealth(source({ complaintRate: 0.001 }))).ok, false);
    assert.equal((await checkSendingHealth(source({ enforcement: "PROBATION" }))).ok, false);
    assert.equal((await checkSendingHealth(source({ sendingEnabled: false }))).ok, false);
  });
});
