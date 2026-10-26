// Runs the whole site on this computer only, for checking before anything goes
// live: the pages, plus the real backend code using an in-memory database and
// a pretend outbox instead of AWS. Everything is forgotten when it stops.
//
// Run: node scripts/preview.mjs   then open the address it prints.
// Test-only helpers (never deployed) live under /dev/:
//   /dev/            outbox of emails "sent", with clickable links
//   /dev/send-file   send Incident File 01 to every confirmed reader
//   /dev/export      the owner's spreadsheets (CSV)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { memoryKeys, memoryMailer, memoryStore } from "../backend/src/adapters/memory.ts";
import { buildExport } from "../backend/src/export.ts";
import { createRouter, ROUTES } from "../backend/src/http.ts";
import { createService } from "../backend/src/service.ts";

const root = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const siteUrl = `http://localhost:${port}`;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Same split as on AWS: the main API can't unlock flight recorders.
const store = memoryStore();
const mailer = memoryMailer();
const clock = { now: () => new Date() };
const settings = { siteUrl, brand: "The Monday After" };
const master = (await import("node:crypto")).randomBytes(32);
const api = createService({ store, keys: memoryKeys({ canDecrypt: false }, master), mailer, clock, settings });
const recorderMailer = createService({ store, keys: memoryKeys({ canDecrypt: true }, master), mailer, clock, settings });
const apiRouter = createRouter(api, Object.keys(ROUTES).filter((r) => r !== "emailRecorder"));
const mailerRouter = createRouter(recorderMailer, ["emailRecorder"]);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const devPage = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 system-ui;margin:0;padding:16px;max-width:760px;background:#0E1621;color:#E8EDF3}a{color:#FFB020}pre{white-space:pre-wrap;background:#17212F;padding:12px;border-radius:10px;overflow-x:auto}h1{font-size:20px}</style>
<p><a href="/dev/">Outbox</a> · <a href="/dev/send-file">Send Incident File 01</a> · <a href="/dev/export">Export</a> · <a href="/signup.html">Sign-up page</a></p>${body}`;

async function dev(path, res) {
  const html = (title, body) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(devPage(title, body));
  if (path === "/dev/" || path === "/dev") {
    const mails = mailer.outbox.slice().reverse().map((m) => `<h2>To ${esc(m.to)}: ${esc(m.subject)}</h2><pre>${esc(m.text).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</pre>`).join("");
    return html("Outbox", `<h1>Outbox (pretend emails)</h1>${mails || "<p>Nothing sent yet. Sign up first.</p>"}`);
  }
  if (path === "/dev/send-file") {
    // A stand-in for the monthly send (Phase 6): one personal link per confirmed reader.
    const readers = (await store.listSubscribers()).filter((s) => s.status === "confirmed");
    for (const r of readers) {
      const token = await api.issueFileLink(r.id, "incident-file-01");
      await mailer.send({ to: r.email, subject: "Incident File 01: Your temps and contractors haven't been paid.", text: `Make your first call: ${siteUrl}/index.html#t=${token}\n\n--\nUnsubscribe or delete your data: ${await api.manageUrl(r.id)}` });
    }
    return html("Sent", `<p>Sent Incident File 01 to ${readers.length} confirmed reader(s). <a href="/dev/">See the outbox</a>.</p>`);
  }
  if (path === "/dev/export") {
    const files = await buildExport(store);
    return html("Export", Object.entries(files).map(([n, csv]) => `<h2>${esc(n)}</h2><pre>${esc(csv)}</pre>`).join(""));
  }
  res.writeHead(404).end();
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path.startsWith("/api/")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const handler = path === "/api/file/recorder/email" ? mailerRouter : apiRouter;
    const out = await handler({ method: req.method, path, headers: req.headers, body: body || undefined, ip: req.socket.remoteAddress || "" });
    res.writeHead(out.status, out.headers).end(out.body);
    return;
  }
  if (path.startsWith("/dev")) return dev(path, res);
  const file = normalize(join(root, path.endsWith("/") ? path + "index.html" : path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview running (this computer only, nothing is saved permanently):
  Sign up:        ${siteUrl}/signup.html
  Pretend outbox: ${siteUrl}/dev/
  Email preview:  ${siteUrl}/preview/email.html`);
});
