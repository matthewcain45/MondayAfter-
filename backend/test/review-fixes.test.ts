// Checks for the AWS Continuum code review findings (27 October 2026).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedClock, memoryKeys, memoryMailer, memoryStore } from "../src/adapters/memory.ts";
import type { AuditDetails } from "../src/audit.ts";
import { networkForLimits } from "../src/edge.ts";
import { createRouter, ROUTES } from "../src/http.ts";
import { ApiError, createService } from "../src/service.ts";
import { emailForLimits } from "../src/validate.ts";
import { confirmedReader, designRouteState, FAKE_EMAIL, setup, tokenFrom } from "./helpers.ts";

const rejects = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof ApiError && e.status === status);

describe("odd saved data is turned away politely (400), never a crash", () => {
  it("refuses built-in names as thread ids", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    for (const tid of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const body = JSON.parse(`{"threads":{"${tid}":"x"}}`);
      await rejects(env.api.saveState(token, { ...designRouteState(), ...body }), 400);
    }
  });

  it("only accepts real dates in the normal format", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    const tb = designRouteState().takeBack;
    for (const savedAt of ["+275760-09-13T00:00:00.000Z", "Jan 1 2024 (<svg onload=1>)", "1999-12-31T00:00:00Z", "2026-11-02"]) {
      await rejects(env.api.saveState(token, { ...designRouteState(), takeBack: { ...tb, savedAt } }), 400);
      await rejects(env.api.saveState(token, { ...designRouteState(), recorder: { saved: true, savedAt } }), 400);
    }
    await env.api.saveState(token, designRouteState()); // the normal format still works
  });

  it("only accepts take-back items and flags that exist in the scenario", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    const tb = designRouteState().takeBack;
    for (const item of ["thread:t99", "ledger:nonsense", "reveal:d1:Z", "reveal:d1:A:extra", "thread:constructor"]) {
      await rejects(env.api.saveState(token, { ...designRouteState(), takeBack: { ...tb, item } }), 400);
    }
    await rejects(env.api.saveState(token, { ...designRouteState(), flags: ["reveal:d1:B:extra"] }), 400);
    for (const item of ["thread:t2", "ledger:dependency", "reveal:d1:B"]) {
      await env.api.saveState(token, { ...designRouteState(), takeBack: { ...tb, item } });
    }
  });

  it("treats a body too deeply nested to measure as too big", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    let deep: unknown = 1;
    for (let i = 0; i < 200_000; i++) deep = [deep];
    await rejects(env.api.saveState(token, deep), 400);
  });
});

describe("sign-up limits count variations of the same inbox as one", () => {
  it("ignores +tags, and dots in Gmail addresses", () => {
    assert.equal(emailForLimits("alex.example+1@gmail.com"), "alexexample@gmail.com");
    assert.equal(emailForLimits("a.lex.example@googlemail.com"), "alexexample@gmail.com");
    assert.equal(emailForLimits("alex.example+news@example.com"), "alex.example@example.com");
    assert.equal(emailForLimits("test.user@example.com"), "test.user@example.com");
  });

  it("stops at 3 confirm emails a day across all the variations", async () => {
    const env = setup();
    for (let i = 1; i <= 6; i++) await env.api.signup({ email: `alex.example+${i}@example.com`, ip: `203.0.113.${i}` });
    assert.equal(env.mailer.outbox.length, 3);
  });

  it("still stores and emails the address exactly as typed", async () => {
    const env = setup();
    await env.api.signup({ email: "alex.example+news@example.com", ip: "203.0.113.1" });
    assert.equal(env.mailer.outbox[0].to, "alex.example+news@example.com");
    assert.ok(await env.store.findSubscriberByEmail("alex.example+news@example.com"));
  });

  it("counts a whole IPv6 block as one visitor, and keeps IPv4 addresses separate", async () => {
    assert.equal(networkForLimits("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
    assert.equal(networkForLimits("2001:db8:1:2::9"), "2001:db8:1:2::/64");
    assert.equal(networkForLimits("2001:db8::1"), "2001:db8:0:0::/64");
    assert.equal(networkForLimits("2001:0db8:0001:0002::1"), "2001:db8:1:2::/64");
    assert.equal(networkForLimits("::ffff:203.0.113.5"), "203.0.113.5");
    assert.equal(networkForLimits("203.0.113.5"), "203.0.113.5");

    const env = setup();
    for (let i = 0; i < 5; i++) await env.api.signup({ email: `test.user${i}@example.com`, ip: `2001:db8:1:2::${i + 1}` });
    await rejects(env.api.signup({ email: "test.user9@example.com", ip: "2001:db8:1:2::99" }), 429);
    await env.api.signup({ email: "test.user9@example.com", ip: "203.0.113.200" }); // a different visitor is fine
  });
});

describe("security notes", () => {
  function auditedSetup() {
    const notes: { event: string; details: AuditDetails }[] = [];
    const audit = (event: string, details: AuditDetails = {}) => notes.push({ event, details });
    const clock = fixedClock("2026-11-02T09:00:00Z");
    const store = memoryStore(clock);
    const mailer = memoryMailer();
    const api = createService({ store, keys: memoryKeys({ canDecrypt: false }), mailer, clock, settings: { siteUrl: "https://test.example", brand: "The Monday After" }, audit });
    const router = createRouter(api, Object.keys(ROUTES).filter((r) => r !== "emailRecorder"), audit);
    return { notes, api, mailer, store, router, clock };
  }

  it("records refused links, actions and blocks, without emails or links", async () => {
    const env = auditedSetup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    const confirmToken = tokenFrom(env.mailer.outbox[0].text);
    await env.api.confirm(confirmToken);
    await rejects(env.api.confirm(confirmToken), 401); // already used
    await rejects(env.api.manageStatus("x".repeat(43)), 401);
    await env.api.signup({ email: FAKE_EMAIL, website: "spam.example", ip: "203.0.113.1" });

    const sub = (await env.store.findSubscriberByEmail(FAKE_EMAIL))!;
    const res = await env.router({ method: "POST", path: "/api/manage", headers: {}, body: undefined, ip: "203.0.113.1" });
    assert.equal(res.status, 401);

    const events = env.notes.map((n) => n.event);
    for (const e of ["signup", "confirmed", "link-refused", "signup-trap", "request-refused"]) assert.ok(events.includes(e), e);
    assert.deepEqual(env.notes.find((n) => n.event === "confirmed")!.details, { subscriberId: sub.id });
    assert.ok(env.notes.some((n) => n.event === "link-refused" && n.details.reason === "unknown"));
    assert.ok(env.notes.some((n) => n.event === "link-refused" && n.details.reason === "missing"));

    const all = JSON.stringify(env.notes);
    assert.ok(!all.includes(FAKE_EMAIL) && !all.includes("example.com"), "no email addresses");
    assert.ok(!all.includes(confirmToken) && !all.includes("x".repeat(43)), "no links");
    assert.ok(!all.includes("203.0.113.1"), "no internet addresses");
  });

  it("records pause, resume, unsubscribe and delete", async () => {
    const env = auditedSetup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    await env.api.confirm(tokenFrom(env.mailer.outbox[0].text));
    const sub = (await env.store.findSubscriberByEmail(FAKE_EMAIL))!;
    const fileToken = await env.api.issueFileLink(sub.id, "incident-file-01");
    await env.api.saveState(fileToken, designRouteState());
    const manageToken = tokenFrom(await env.api.manageUrl(sub.id));
    await env.api.pause(manageToken);
    await env.api.resume(manageToken);
    await env.api.unsubscribe(manageToken);
    await env.api.deleteMe(manageToken);
    const events = env.notes.map((n) => n.event);
    for (const e of ["paused", "resumed", "unsubscribed", "deleted"]) assert.ok(events.includes(e), e);
    assert.ok(!JSON.stringify(env.notes).includes(manageToken));
  });

  it("records link rate-limit blocks", async () => {
    const env = auditedSetup();
    await env.api.signup({ email: FAKE_EMAIL, ip: "203.0.113.1" });
    await env.api.confirm(tokenFrom(env.mailer.outbox[0].text));
    const sub = (await env.store.findSubscriberByEmail(FAKE_EMAIL))!;
    const token = await env.api.issueFileLink(sub.id, "incident-file-01");
    for (let i = 0; i < 600; i++) await env.api.openFile(token);
    await rejects(env.api.openFile(token), 429);
    assert.ok(env.notes.some((n) => n.event === "rate-limited" && n.details.limit === "link" && n.details.subscriberId === sub.id));
  });
});
