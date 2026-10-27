// One-click unsubscribe: the hidden link mail apps use for their own "Unsubscribe" button.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRouter, ROUTES } from "../src/http.ts";
import type { AuditDetails } from "../src/audit.ts";
import { confirmedReader, setup, tokenFrom } from "./helpers.ts";

const oneClick = (url: string) => new URL(url).pathname;

describe("one-click unsubscribe", () => {
  it("is in every monthly file email, and unsubscribes with one POST", async () => {
    const env = setup();
    const { sub } = await confirmedReader(env);
    await env.api.sendFile("incident-file-01");
    const mail = env.mailer.outbox.at(-1)!;
    assert.match(mail.oneClickUnsubscribeUrl!, /^https:\/\/test\.example\/api\/unsubscribe\/one-click\/[A-Za-z0-9_-]{43}$/);

    const res = await env.apiRouter({ method: "POST", path: oneClick(mail.oneClickUnsubscribeUrl!), headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click", ip: "203.0.113.1" });
    assert.equal(res.status, 200);
    assert.equal((await env.store.getSubscriber(sub.id))!.status, "unsubscribed");
  });

  it("does nothing when a link-checking robot just opens it", async () => {
    const env = setup();
    const { sub } = await confirmedReader(env);
    await env.api.sendFile("incident-file-01");
    const res = await env.apiRouter({ method: "GET", path: oneClick(env.mailer.outbox.at(-1)!.oneClickUnsubscribeUrl!), headers: {}, body: undefined, ip: "203.0.113.1" });
    assert.equal(res.status, 405);
    assert.equal((await env.store.getSubscriber(sub.id))!.status, "confirmed");
  });

  it("can only unsubscribe: it doesn't open the file or the manage page, and other links don't work here", async () => {
    const env = setup();
    const { sub, token } = await confirmedReader(env);
    await env.api.sendFile("incident-file-01");
    const link = oneClick(env.mailer.outbox.at(-1)!.oneClickUnsubscribeUrl!).split("/").at(-1)!;
    assert.equal((await env.apiRouter({ method: "GET", path: "/api/file", headers: { "x-tma-link": link }, body: undefined, ip: "203.0.113.1" })).status, 401);
    assert.equal((await env.apiRouter({ method: "POST", path: "/api/delete", headers: { "x-tma-link": link }, body: undefined, ip: "203.0.113.1" })).status, 401);
    const manage = tokenFrom(await env.api.manageUrl(sub.id));
    for (const t of [token, manage, "x".repeat(43), "short"]) {
      assert.equal((await env.apiRouter({ method: "POST", path: "/api/unsubscribe/one-click/" + t, headers: {}, body: undefined, ip: "203.0.113.1" })).status, 401);
    }
    assert.equal((await env.store.getSubscriber(sub.id))!.status, "confirmed");
  });

  it("keeps the link out of the security notes", async () => {
    const env = setup();
    await confirmedReader(env);
    const notes: { event: string; details: AuditDetails }[] = [];
    const router = createRouter(env.api, Object.keys(ROUTES).filter((r) => r !== "emailRecorder"), (event, details = {}) => notes.push({ event, details }));
    const bad = "y".repeat(43);
    await router({ method: "POST", path: "/api/unsubscribe/one-click/" + bad, headers: {}, body: undefined, ip: "203.0.113.1" });
    assert.ok(notes.some((n) => n.event === "request-refused"));
    assert.ok(!JSON.stringify(notes).includes(bad));
  });

  it("isn't added to the confirm email, which goes to people who haven't subscribed yet", async () => {
    const env = setup();
    await env.api.signup({ email: "test.user@example.com", ip: "203.0.113.1" });
    assert.equal(env.mailer.outbox[0].oneClickUnsubscribeUrl, undefined);
  });
});
