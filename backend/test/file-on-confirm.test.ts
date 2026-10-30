// New readers get the current file straight after confirming, and Send Incident
// File never sends the same file to someone twice.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createService } from "../src/service.ts";
import { fixedClock, memoryKeys, memoryMailer, memoryStore } from "../src/adapters/memory.ts";
import { FAKE_EMAIL, readerWithoutFile, setup, tokenFrom } from "./helpers.ts";

const signUpAndConfirm = async (env: ReturnType<typeof setup>, email = FAKE_EMAIL) => {
  await env.api.signup({ email, ip: "203.0.113.10" });
  return env.api.confirm(tokenFrom(env.mailer.outbox.at(-1)!.text));
};

describe("the file, straight after confirming", () => {
  it("arrives as soon as the reader confirms, with a working link", async () => {
    const env = setup();
    const r = await signUpAndConfirm(env);
    assert.deepEqual(r, { ok: true, fileSent: true, fileTitle: "Incident File 01" });
    const mail = env.mailer.outbox.at(-1)!;
    assert.equal(mail.to, FAKE_EMAIL);
    assert.match(mail.subject, /haven't been paid/);
    assert.ok(mail.oneClickUnsubscribeUrl);
    assert.equal((await env.api.openFile(tokenFrom(mail.text))).scenarioId, "incident-file-01");
  });

  it("isn't sent again by Send Incident File, which only reaches people who don't have it", async () => {
    const env = setup();
    await signUpAndConfirm(env, "test.user1@example.com");
    await readerWithoutFile(env, "test.user2@example.com");
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 1, failed: 0, skipped: 1 });
    assert.equal(env.mailer.outbox.at(-1)!.to, "test.user2@example.com");
    assert.deepEqual(await env.api.sendFile("incident-file-01"), { sent: 0, failed: 0, skipped: 2 }, "pressing it again sends nothing");
  });

  it("waits for the next Send if bounce or complaint rates are too high", async () => {
    const clock = fixedClock("2026-11-02T09:00:00Z");
    const store = memoryStore(clock);
    const mailer = memoryMailer();
    const sendingHealth = { read: async () => ({ sendingEnabled: true, enforcement: "HEALTHY", bounceRate: 0.06, complaintRate: 0 }) };
    const api = createService({ store, keys: memoryKeys({ canDecrypt: false }), mailer, clock, settings: { siteUrl: "https://test.example", brand: "The Monday After" }, sendingHealth });
    await api.signup({ email: FAKE_EMAIL, ip: "203.0.113.10" });
    const r = await api.confirm(tokenFrom(mailer.outbox[0].text));
    assert.equal(r.fileSent, false);
    assert.equal(mailer.outbox.length, 1, "only the confirm email");
    assert.equal((await store.findSubscriberByEmail(FAKE_EMAIL))!.status, "confirmed", "still confirmed");
  });

  it("still confirms the reader if the file email fails", async () => {
    const env = setup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.10" });
    const token = tokenFrom(env.mailer.outbox[0].text);
    env.mailer.send = async () => { throw new Error("SES is down"); };
    assert.equal((await env.api.confirm(token)).fileSent, false);
    assert.equal((await env.store.findSubscriberByEmail(FAKE_EMAIL))!.status, "confirmed");
  });

  it("isn't sent twice to someone who unsubscribes and signs up again", async () => {
    const env = setup();
    await signUpAndConfirm(env);
    const sub = (await env.store.findSubscriberByEmail(FAKE_EMAIL))!;
    await env.api.unsubscribe(tokenFrom(await env.api.manageUrl(sub.id)));
    const again = await signUpAndConfirm(env);
    assert.equal(again.fileSent, false);
  });
});
