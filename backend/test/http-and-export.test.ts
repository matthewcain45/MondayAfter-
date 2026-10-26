import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExport, toCsv } from "../src/export.ts";
import { confirmedReader, designRouteState, FAKE_EMAIL, setup } from "./helpers.ts";

const req = (method: string, path: string, opts: { token?: string; body?: string } = {}) => ({
  method, path, body: opts.body, ip: "203.0.113.1",
  headers: opts.token ? { authorization: "Bearer " + opts.token } : {},
});

describe("web requests", () => {
  it("routes requests and reads the link from the Authorization header", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    const res = await env.apiRouter(req("GET", "/api/file", { token }));
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(JSON.parse(res.body).scenarioId, "incident-file-01");
  });

  it("answers clearly for unknown paths, wrong methods, bad JSON and oversized bodies", async () => {
    const env = setup();
    assert.equal((await env.apiRouter(req("GET", "/api/nope"))).status, 404);
    assert.equal((await env.apiRouter(req("GET", "/api/signup"))).status, 405);
    assert.equal((await env.apiRouter(req("POST", "/api/signup", { body: "{oops" }))).status, 400);
    assert.equal((await env.apiRouter(req("POST", "/api/signup", { body: "x".repeat(40000) }))).status, 413);
    assert.equal((await env.apiRouter(req("GET", "/api/file", { token: "made-up" }))).status, 401);
  });

  it("hides unexpected errors and never logs request bodies", async () => {
    const env = setup();
    const { token } = await confirmedReader(env);
    env.store.putAnswers = async () => { throw new Error("database down"); };
    const logged: unknown[][] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      const res = await env.apiRouter(req("PUT", "/api/file/state", { token, body: JSON.stringify(designRouteState()) }));
      assert.equal(res.status, 500);
      assert.doesNotMatch(res.body, /database/);
    } finally {
      console.error = orig;
    }
    assert.ok(!JSON.stringify(logged).includes(token) && !JSON.stringify(logged).includes("forecast"));
  });
});

describe("the owner's spreadsheets", () => {
  async function filledIn() {
    const env = setup();
    const { token } = await confirmedReader(env);
    await env.api.openFile(token);
    await env.api.track(token, { name: "screen", target: "scene" });
    env.clock.advance(40);
    await env.api.track(token, { name: "screen", target: "d1" });
    await env.api.saveRecorder(token, { hour: "SECRET-RECORDER-TEXT" });
    await env.api.track(token, { name: "recorder", target: "saved" });
    await env.api.saveState(token, designRouteState());
    await env.api.track(token, { name: "close", target: "took-back" });
    const second = await confirmedReader(env, "=HYPERLINK(\"evil\")@example.com".replace(/[()"]/g, "").toLowerCase());
    await env.api.openFile(second.token);
    return { env, files: await buildExport(env.store) };
  }

  it("names readers only in the named export", async () => {
    const { files } = await filledIn();
    assert.match(files["answers-named.csv"], new RegExp(FAKE_EMAIL));
    assert.doesNotMatch(files["answers-anonymous.csv"], /@/);
    assert.match(files["answers-named.csv"], /Your first move\.,Build the list\. \+ Press the agency\./);
    assert.match(files["answers-named.csv"], /Take one thing back,Ask who should have checked the agency’s payroll provider\. \(by 2 weeks\)/);
  });

  it("never contains flight recorder text", async () => {
    const { files } = await filledIn();
    for (const [name, csv] of Object.entries(files)) assert.doesNotMatch(csv, /SECRET-RECORDER-TEXT/, name);
    assert.match(files["answers-named.csv"], /Flight recorder,Saved \(private to the reader\)/);
  });

  it("shows the funnel: who opened, reached each screen, and how long they spent", async () => {
    const { files } = await filledIn();
    const summary = files["summary-incident-file-01.csv"];
    assert.match(summary, /Opened their link,2,100%/);
    assert.match(summary, /Reached: Your temps and contractors haven't been paid\.,1,50%,40/);
    assert.match(summary, /Reached: The ledger,0,0%/);
    assert.match(summary, /Saved a flight recorder,1,50%/);
    assert.match(summary, /Chose one thing to take back,1,50%/);
    assert.match(summary, /Asked for the 30-day follow-up,1,50%/);
  });

  it("stops spreadsheet formulas from running", () => {
    assert.equal(toCsv([["=SUM(A1)", "+1", "-2", "@x", "fine"]]), "'=SUM(A1),'+1,'-2,'@x,fine\r\n");
    assert.equal(toCsv([['say "hi", ok']]), '"say ""hi"", ok"\r\n');
  });
});
