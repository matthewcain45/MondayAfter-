import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../src/service.ts";
import { confirmedReader, designRouteState, FAKE_EMAIL, readerWithoutFile, setup, tokenFrom } from "./helpers.ts";

const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof ApiError && e.status === status);
const DAY = 86400;

describe("sign-up", () => {
  it("emails a confirm link and stores the reader as pending", async () => {
    const env = setup();
    assert.deepEqual(await env.api.signup({ email: "  Alex.Example@Example.com ", ip: "203.0.113.1" }), { ok: true });
    assert.equal(env.mailer.outbox.length, 1);
    assert.equal(env.mailer.outbox[0].to, FAKE_EMAIL);
    assert.match(env.mailer.outbox[0].text, /https:\/\/test\.example\/confirm\.html#t=/);
    assert.equal((await env.store.findSubscriberByEmail(FAKE_EMAIL))?.status, "pending");
  });

  it("ignores bots that fill in the hidden trap field", async () => {
    const env = setup();
    assert.deepEqual(await env.api.signup({ email: FAKE_EMAIL, website: "spam.example", ip: "203.0.113.1" }), { ok: true });
    assert.equal(env.mailer.outbox.length, 0);
    assert.equal((await env.store.listSubscribers()).length, 0);
  });

  it("rejects things that aren't email addresses", async () => {
    const env = setup();
    await rejects(env.api.signup({ email: "not an email", ip: "203.0.113.1" }), 400);
    await rejects(env.api.signup({ email: 42, ip: "203.0.113.1" }), 400);
  });

  it("limits sign-ups from one connection", async () => {
    const env = setup();
    for (let i = 0; i < 5; i++) await env.api.signup({ email: `test.user${i}@example.com`, ip: "203.0.113.7" });
    await rejects(env.api.signup({ email: "test.user9@example.com", ip: "203.0.113.7" }), 429);
  });

  it("caps sign-ups across everyone at 30 an hour, whatever connection they come from", async () => {
    const env = setup();
    for (let i = 0; i < 30; i++) await env.api.signup({ email: `test.user${i}@example.com`, ip: `203.0.113.${i}` });
    await rejects(env.api.signup({ email: "test.user99@example.com", ip: "198.51.100.99" }), 429);
    env.clock.advance(3600);
    assert.deepEqual(await env.api.signup({ email: "test.user99@example.com", ip: "198.51.100.99" }), { ok: true });
  });

  it("gives the same answer for an address that's already subscribed, without emailing it", async () => {
    const env = setup();
    await confirmedReader(env);
    const sent = env.mailer.outbox.length;
    assert.deepEqual(await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.2" }), { ok: true });
    assert.equal(env.mailer.outbox.length, sent);
  });

  it("deletes unconfirmed sign-ups after 7 days", async () => {
    const env = setup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    env.clock.advance(7 * DAY + 60);
    assert.equal(await env.store.findSubscriberByEmail(FAKE_EMAIL), undefined);
  });
});

describe("confirming", () => {
  it("confirms once, and the link can't be reused", async () => {
    const env = setup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    const token = tokenFrom(env.mailer.outbox[0].text);
    await env.api.confirm(token);
    assert.equal((await env.store.findSubscriberByEmail(FAKE_EMAIL))?.status, "confirmed");
    await rejects(env.api.confirm(token), 401);
  });

  it("stops working after 24 hours", async () => {
    const env = setup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    env.clock.advance(DAY + 60);
    await rejects(env.api.confirm(tokenFrom(env.mailer.outbox[0].text)), 401);
  });

  it("stores only a scrambled version of each link", async () => {
    const env = setup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    const token = tokenFrom(env.mailer.outbox[0].text);
    assert.ok(!JSON.stringify((env.store as unknown as { dump(): unknown }).dump()).includes(token));
  });
});

describe("the magic link", () => {
  it("opens a fresh file and records the click", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    const opened = await env.api.openFile(token);
    assert.equal(opened.scenarioId, "incident-file-01");
    assert.equal(opened.state, null);
    assert.equal((await env.store.listEvents()).filter((e) => e.name === "open").length, 1);
  });

  it("rejects made-up, wrong-type and expired links", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await rejects(env.api.openFile("x".repeat(43)), 401);
    await rejects(env.api.openFile(undefined), 401);
    await rejects(env.api.unsubscribe(token), 401); // a file link can't unsubscribe
    const manage = /#t=(.{43})/.exec(await env.api.manageUrl(sub.id))![1];
    await rejects(env.api.openFile(manage), 401); // and a manage link can't open a file
    env.clock.advance(90 * DAY + 60);
    await rejects(env.api.openFile(token), 401);
  });
});

describe("saving answers", () => {
  it("saves and returns the latest answers, and works out the follow-up date", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await env.api.saveState(token, designRouteState());
    const opened = await env.api.openFile(token);
    assert.deepEqual(opened.state?.answers, { d1: ["A", "B"], holding: "B2", d2: "1", forecast: "same" });
    assert.equal((await env.store.getAnswers(sub.id, "incident-file-01"))?.followUpDue, "2026-12-02");

    const changed = { ...designRouteState(), answers: { d1: ["C"], d2: "3" } };
    await env.api.saveState(token, changed);
    assert.deepEqual((await env.api.openFile(token)).state?.answers, { d1: ["C"], d2: "3" });
  });

  it("rejects answers that aren't real choices", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    const bad = (patch: object) => env.api.saveState(token, { ...designRouteState(), ...patch });
    await rejects(bad({ answers: { d1: ["A", "B", "C"] } }), 400); // more than two picks
    await rejects(bad({ answers: { d1: ["Z"] } }), 400);
    await rejects(bad({ answers: { nope: "1" } }), 400);
    await rejects(bad({ flags: ["reveal:d1:Q"] }), 400);
    await rejects(bad({ threads: { t2: "everyone" } }), 400);
    await rejects(bad({ takeBack: { item: "<script>", when: "2w", followUp: false } }), 400);
    await rejects(env.api.saveState(token, "just a string"), 400);
  });

  it("never accepts flight recorder text through the answers route", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await rejects(env.api.saveState(token, { ...designRouteState(), recorder: { hour: "Call the agency", savedAt: "2026-11-02T09:05:00Z" } }), 400);
  });
});

describe("the flight recorder", () => {
  it("is stored encrypted, so the text isn't visible in the database", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await env.api.saveRecorder(token, { hour: "Test entry: phone the agency director", day: "", week: "" });
    const rec = await env.store.getRecorder(sub.id, "incident-file-01");
    assert.ok(rec && !rec.sealed.includes("agency") && !JSON.stringify(rec).includes("phone"));
  });

  it("can't be unlocked by the main API", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await env.api.saveRecorder(token, { hour: "Test entry" });
    await assert.rejects(env.api.emailRecorder(token), /not allowed to unlock/);
    const res = await env.apiRouter({ method: "POST", path: "/api/file/recorder/email", headers: { "x-tma-link": token }, body: undefined, ip: "203.0.113.1" });
    assert.equal(res.status, 404);
  });

  it("is emailed only to the reader's own address by the mailer", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await env.api.saveRecorder(token, { hour: "Test entry: phone the agency director", week: "Map the supply chain" });
    await env.recorderMailer.emailRecorder(token);
    const mail = env.mailer.outbox.at(-1)!;
    assert.equal(mail.to, FAKE_EMAIL);
    assert.match(mail.text, /phone the agency director/);
    assert.match(mail.text, /FIRST WEEK\nMap the supply chain/);
    assert.match(mail.text, /manage\.html#t=/);
  });

  it("requires the first hour, limits length and unknown fields", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await rejects(env.api.saveRecorder(token, { hour: "  " }), 400);
    await rejects(env.api.saveRecorder(token, { hour: "x".repeat(1001) }), 400);
    await rejects(env.api.saveRecorder(token, { hour: "ok", notes: "extra" }), 400);
  });

  it("limits how often it can be emailed", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await env.api.saveRecorder(token, { hour: "Test entry" });
    for (let i = 0; i < 3; i++) await env.recorderMailer.emailRecorder(token);
    await rejects(env.recorderMailer.emailRecorder(token), 429);
  });
});

describe("analytics", () => {
  it("records known events and refuses anything else", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await env.api.track(token, { name: "screen", target: "d1" });
    await rejects(env.api.track(token, { name: "keystrokes" }), 400);
    await rejects(env.api.track(token, { name: "screen", target: "free text with spaces" }), 400);
    const names = (await env.store.listEvents()).map((e) => e.name);
    assert.deepEqual(names.filter((n) => n === "screen"), ["screen"]);
  });
});

describe("unsubscribe and delete", () => {
  it("unsubscribing keeps answers but marks the reader", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await env.api.saveState(token, designRouteState());
    const manage = /#t=(.{43})/.exec(await env.api.manageUrl(sub.id))![1];
    await env.api.unsubscribe(manage);
    assert.equal((await env.store.getSubscriber(sub.id))?.status, "unsubscribed");
    assert.ok(await env.store.getAnswers(sub.id, "incident-file-01"));
  });

  it("deleting removes everything straight away and the links stop working", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await env.api.saveState(token, designRouteState());
    await env.api.saveRecorder(token, { hour: "Test entry" });
    await env.api.track(token, { name: "screen", target: "d1" });
    const manage = /#t=(.{43})/.exec(await env.api.manageUrl(sub.id))![1];
    await env.api.deleteMe(manage);
    const left = JSON.stringify((env.store as unknown as { dump(): unknown }).dump());
    assert.ok(!left.includes(sub.id), "nothing should mention the reader any more");
    await rejects(env.api.openFile(token), 401);
  });

  it("taking part restarts the 2-year clock", async () => {
    const env = setup();
    const { sub } = await confirmedReader(env);
    env.clock.advance(400 * DAY);
    await env.api.openFile(await env.api.issueFileLink(sub.id, "incident-file-01")); // a fresh monthly link
    env.clock.advance(400 * DAY);
    assert.ok(await env.store.getSubscriber(sub.id));
  });

  it("everything expires after 2 years", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await env.api.saveState(token, designRouteState());
    env.clock.advance(731 * DAY);
    assert.equal(await env.store.getAnswers(sub.id, "incident-file-01"), undefined);
    assert.equal(await env.store.getSubscriber(sub.id), undefined);
  });
});

describe("sending a file", () => {
  it("emails each confirmed reader their own working link, and nobody else", async () => {
    const env = setup();
    await readerWithoutFile(env, "test.user1@example.com");
    await readerWithoutFile(env, "test.user2@example.com");
    await env.api.signup({ email: "test.pending@example.com", ip: "203.0.113.3" }); // never confirmed
    const before = env.mailer.outbox.length;
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 2, failed: 0, skipped: 0 });
    const mails = env.mailer.outbox.slice(before);
    assert.deepEqual(mails.map((m) => m.to).sort(), ["test.user1@example.com", "test.user2@example.com"]);
    const links = mails.map((m) => tokenFrom(m.text));
    assert.notEqual(links[0], links[1]);
    for (const t of links) assert.equal((await env.api.openFile(t)).scenarioId, "incident-file-01");
    assert.match(mails[0].subject, /haven't been paid/);
    assert.match(mails[0].text, /index\.html#t=/);
    assert.match(mails[0].text, /manage\.html#t=/);
    assert.equal((await env.store.listEvents()).filter((e) => e.name === "sent").length, 2);
  });

  it("keeps going if one email fails, and reports counts only", async () => {
    const env = setup();
    await readerWithoutFile(env, "test.user1@example.com");
    await readerWithoutFile(env, "test.user2@example.com");
    const send = env.mailer.send;
    env.mailer.send = async (m) => { if (m.to === "test.user1@example.com") throw new Error("not verified"); return send(m); };
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 1, failed: 1, skipped: 0 });
  });

  it("refuses an unknown file", async () => {
    const env = setup();
    await assert.rejects(env.api.sendFile("no-such-file"), /Unknown scenario/);
  });
});

describe("taking a break", () => {
  const manageToken = async (env: ReturnType<typeof setup>, id: string) => /#t=(.{43})/.exec(await env.api.manageUrl(id))![1];

  it("pauses the monthly emails for about 3 months, then they restart by themselves", async () => {
    const env = setup();
    const { sub } = await readerWithoutFile(env);
    const manage = await manageToken(env, sub.id);
    assert.deepEqual(await env.api.manageStatus(manage), { status: "subscribed" });
    const { pausedUntil } = await env.api.pause(manage);
    assert.equal(pausedUntil.slice(0, 10), "2027-02-01");
    assert.deepEqual(await env.api.manageStatus(manage), { status: "paused", pausedUntil });
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 0, failed: 0, skipped: 0 });
    env.clock.advance(92 * DAY);
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 1, failed: 0, skipped: 0 });
    assert.deepEqual(await env.api.manageStatus(manage), { status: "subscribed" });
  });

  it("can be resumed early", async () => {
    const env = setup();
    const { sub } = await readerWithoutFile(env);
    const manage = await manageToken(env, sub.id);
    await env.api.pause(manage);
    await env.api.resume(manage);
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 1, failed: 0, skipped: 0 });
  });

  it("doesn't reveal the email address, and refuses to pause an unsubscribed reader", async () => {
    const env = setup();
    const { sub } = await confirmedReader(env);
    const manage = await manageToken(env, sub.id);
    assert.ok(!JSON.stringify(await env.api.manageStatus(manage)).includes("@"));
    await env.api.unsubscribe(manage);
    assert.deepEqual(await env.api.manageStatus(manage), { status: "unsubscribed" });
    await rejects(env.api.pause(manage), 409);
  });

  it("needs a manage link, not a file link", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    await rejects(env.api.pause(token), 401);
  });
});
