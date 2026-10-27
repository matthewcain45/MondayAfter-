// The Monday After: renders a scenario file as a series of mobile screens.
// Two modes:
//   live    - opened from a reader's personal link; answers are saved to our backend
//   preview - no personal link (or ?preview); answers stay in this browser only

(function () {
  "use strict";

  const app = document.getElementById("app");
  let scenario = null;
  let state = null;
  let storageKey = "";
  let mode = "preview";
  let token = null;
  const apiBase = (document.querySelector('meta[name="tma-api"]') || {}).content || "";

  // ---------- Small helpers ----------

  // Builds DOM nodes. Text is always added as text, never as HTML, so nothing
  // in a scenario file (or typed by a reader) can inject code into the page.
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === undefined || c === null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // Scenario text can be a string, or { "todo": "..." } where the author still
  // needs to supply copy. Placeholders are shown clearly rather than hidden.
  function t(v) {
    if (v && typeof v === "object" && "todo" in v) return h("span", { class: "todo" }, v.todo);
    return v === undefined || v === null ? "" : String(v);
  }
  const isTodo = (v) => !!(v && typeof v === "object" && "todo" in v);
  const plain = (v) => (isTodo(v) ? "[" + v.todo + "]" : String(v || ""));

  const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const word = (n) => NUMBER_WORDS[n] || String(n);

  const ICON_FLAG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14V2.5M4 3h8l-1.5 3L12 9H4"/></svg>';
  const ICON_LOCK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9AA7B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  function icon(svg) {
    const span = document.createElement("span");
    span.innerHTML = svg; // fixed icon markup from this file, never from data
    return span.firstChild;
  }

  // ---------- Talking to our backend ----------

  // The personal link travels in a header, never in the address, so it doesn't
  // end up in logs or get shared by accident.
  async function api(method, path, body) {
    const res = await fetch(apiBase + path, {
      method,
      headers: Object.assign({ "X-TMA-Link": token }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
      keepalive: method !== "GET",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status });
    return data;
  }

  // Analytics go to our own backend only: no cookies, no third parties.
  // Never pass flight recorder text here.
  function track(name, target) {
    if (mode !== "live") return;
    api("POST", "/events", target ? { name, target: String(target) } : { name }).catch(() => {});
  }

  const notice = h("p", { class: "save-notice", role: "status" });
  function showNotice(text) {
    notice.textContent = text;
    notice.hidden = !text;
    if (!notice.isConnected) document.body.append(notice);
  }

  // ---------- Saving and loading ----------

  function blankState() {
    return { v: 1, answers: {}, threads: {}, pulled: [], flags: [], recorder: null, takeBack: null, reached: [], last: null };
  }
  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return Object.assign(blankState(), JSON.parse(raw));
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return blankState();
  }
  let saveTimer = null;
  function save() {
    if (mode !== "live") {
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (e) { /* preview still works without storage */ }
      return;
    }
    // Wait for a short pause in tapping, then send the latest answers.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }
  function flush() {
    if (mode !== "live" || saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    api("PUT", "/file/state", state).then(() => showNotice(""), (e) => {
      if (e.status === 401) return expired(e.message);
      showNotice("Not saved yet. Check your connection; we'll try again.");
      saveTimer = setTimeout(flush, 5000);
    });
  }
  window.addEventListener("pagehide", flush);

  // ---------- Rules (which screens, rows and lines apply) ----------

  const screenById = (id) => scenario.screens.find((s) => s.id === id);

  function selected(choiceId) {
    const v = state.answers[choiceId];
    return Array.isArray(v) ? v : v ? [v] : [];
  }

  function matches(rule) {
    if (!rule) return true;
    if (rule.all) return rule.all.every(matches);
    if (rule.any) return rule.any.some(matches);
    if (rule.not) return !matches(rule.not);
    if (rule.picked) {
      const [choiceId, optId] = rule.picked.split(":");
      const s = screenById(choiceId);
      if (s && !isVisible(s)) return false;
      if (scenario.threads[choiceId]) return state.threads[choiceId] === optId;
      return selected(choiceId).includes(optId);
    }
    if (rule.pulled) return state.pulled.includes(rule.pulled);
    return false;
  }

  function isVisible(screen) { return matches(screen.showIf); }
  const visibleScreens = () => scenario.screens.filter(isVisible);
  const variant = (list) => (Array.isArray(list) ? (list.find((v) => matches(v.when)) || {}).text : list);

  function threadIdsOn(screen) {
    const ids = [];
    (screen.threads || []).concat(screen.threadsBeforeOptions || []).forEach((r) => ids.push(r.thread));
    (screen.blocks || []).forEach((b) => b.type === "thread" && ids.push(b.thread));
    return ids;
  }
  function availableThreads() {
    const ids = [];
    visibleScreens().forEach((s) => threadIdsOn(s).forEach((id) => ids.includes(id) || ids.push(id)));
    return ids;
  }

  function routeLine(line) {
    const parts = [];
    line.choices.forEach((cid) => {
      const s = screenById(cid);
      if (!s || !isVisible(s)) return;
      s.options.filter((o) => selected(cid).includes(o.id)).forEach((o) => {
        let label = plain(o.short || o.title);
        if (o.detailFrom && line.detail !== false) {
          const d = screenById(o.detailFrom);
          const pick = d && d.options.find((x) => x.id === state.answers[o.detailFrom]);
          if (pick && isVisible(d)) label += " (" + plain(pick.short || pick.title) + ")";
        }
        parts.push(label);
      });
    });
    return parts.join(" · ");
  }

  // A row can have "variants": the first whose rule matches sets its effect
  // (drain or deposit), one-line summary and detail. If none matches, the row
  // isn't shown for this route.
  function ledgerRows() {
    const out = [];
    for (const r of screenById("ledger").rows) {
      if (!matches(r.when)) continue;
      if (!r.variants) { out.push(r); continue; }
      const v = r.variants.find((x) => matches(x.when));
      if (v) out.push(Object.assign({}, r, v, { when: r.when }));
    }
    return out;
  }

  // The closing line, built from parts: an opening from the first decision,
  // a line that depends on one choice, and an ending from the second decision.
  function mirrorText(m) {
    if (!m || Array.isArray(m) || typeof m !== "object" || !m.opening) return variant(m);
    const phrases = selected(m.opening.choice).map((id) => m.opening.phrases[id]).filter(Boolean);
    const ending = m.ending.parts[selected(m.ending.choice)[0]];
    if (!phrases.length || !ending) return variant(m.fallback);
    return [m.opening.prefix + phrases.join(" and ") + ".", ending.did, variant(m.middle), ending.still].filter(Boolean).join(" ");
  }

  // Everything the reader could choose to "take back": threads they pulled,
  // then ledger rows and assumptions they flagged.
  function takeBackCandidates() {
    const out = [];
    for (const id of state.pulled) {
      const th = scenario.threads[id];
      if (th && th.takeBack && availableThreads().includes(id)) out.push({ id: "thread:" + id, ...th.takeBack });
    }
    for (const r of ledgerRows()) {
      if (state.flags.includes("ledger:" + r.id)) {
        out.push({ id: "ledger:" + r.id, ...(r.takeBack || { label: { todo: "Action for " + plain(r.dimension) }, from: r.dimension }) });
      }
    }
    for (const s of visibleScreens().filter((x) => x.type === "reveal")) {
      for (const cid of s.from) {
        const cs = screenById(cid);
        if (!cs || !isVisible(cs)) continue;
        for (const o of cs.options) {
          const fid = "reveal:" + cid + ":" + o.id;
          if (selected(cid).includes(o.id) && state.flags.includes(fid)) {
            out.push({ id: fid, ...(o.takeBack || { label: { todo: "Action for ‘" + plain(o.short) + "’" }, from: "Reveal, " + plain(o.short).toLowerCase() }) });
          }
        }
      }
    }
    return out;
  }

  // ---------- Navigation ----------

  function go(path) { location.hash = "#/" + path; }

  function nextScreenId(currentId) {
    const list = visibleScreens();
    const i = list.findIndex((s) => s.id === currentId);
    return list[i + 1] ? list[i + 1].id : null;
  }

  function advance(currentId) {
    const next = nextScreenId(currentId);
    if (!next) return;
    if (!state.reached.includes(next)) state.reached.push(next);
    save();
    go(next);
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const list = visibleScreens();
    if (parts[0] === "t" && scenario.threads[parts[1]]) return renderThread(parts[1], parts[2]);
    if (parts[0] === "row") {
      const row = ledgerRows().find((r) => r.id === parts[1]);
      if (row) return renderRow(row);
    }
    // Only the first screen and screens already reached can be opened, so
    // nobody can skip ahead to a reveal before locking in their choices.
    const allowed = (s) => s && (s === list[0] || state.reached.includes(s.id));
    let target = list.find((s) => s.id === parts[0]);
    if (!allowed(target)) {
      target = [list.find((s) => s.id === state.last)].concat(list.slice().reverse()).find(allowed);
      history.replaceState(null, "", "#/" + target.id);
    }
    renderScreen(target);
  }

  // ---------- Shared building blocks ----------

  function header(hd) {
    const right = [hd.step];
    if (hd.dots) {
      const avail = availableThreads();
      const pulled = avail.filter((id) => state.pulled.includes(id)).length;
      right.push(" · ", h("span", { class: "dots", "aria-label": pulled + " of " + avail.length + " threads pulled" },
        "●".repeat(pulled) + "○".repeat(avail.length - pulled)));
    }
    const out = [h("div", { class: "top" }, h("span", {}, hd.label), h("span", {}, right))];
    if (hd.progress) out.push(h("div", { class: "bar" + (hd.tone === "teal" ? " teal" : ""), "aria-hidden": "true" }, h("span", { style: "width:" + hd.progress + "%" })));
    return out;
  }

  let lastHash = null;
  const FOCUSABLE = "button, a, input, textarea";

  function page(hd, title, content, foot) {
    // Re-drawing the same screen (after a tap) keeps focus and scroll where
    // they were; arriving on a new screen moves focus to its heading.
    const same = lastHash === location.hash;
    const focusIdx = same ? Array.from(app.querySelectorAll(FOCUSABLE)).indexOf(document.activeElement) : -1;
    const scrollY = window.scrollY;
    lastHash = location.hash;

    const screen = h("main", { class: "screen" }, header(hd), h("div", { class: "body" }, content, foot ? h("div", { class: "foot" }, foot) : null));
    app.replaceChildren(screen);
    document.title = plain(title) + " · " + scenario.brand;
    if (same) {
      window.scrollTo(0, scrollY);
      const el = screen.querySelectorAll(FOCUSABLE)[focusIdx];
      if (el) el.focus({ preventScroll: true });
      return;
    }
    window.scrollTo(0, 0);
    const h1 = screen.querySelector("h1");
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  }

  function primary(label, onclick, enabled = true) {
    return h("button", { class: "btn", type: "button", "aria-disabled": enabled ? null : "true", onclick: (e) => { if (enabled) onclick(e); } }, label);
  }
  function secondary(label, onclick) {
    return h("button", { class: "btn secondary", type: "button", onclick }, label);
  }

  function threadChip(ref, fromId) {
    const th = scenario.threads[ref.thread];
    if (!th) return null;
    if (ref.needsAnswer && !state.answers[fromId]) return null;
    const pulled = state.pulled.includes(ref.thread);
    return h("button", { class: "thread" + (pulled ? " pulled" : ""), type: "button", onclick: () => go("t/" + ref.thread + "/" + fromId) },
      h("span", {},
        h("span", { class: "k" }, th.chip.kicker),
        h("span", { class: "t" }, th.chip.title),
        th.chip.sub ? h("span", { class: "d" }, th.chip.sub) : null),
      h("span", { class: "arrow", "aria-hidden": "true" }, "↗"));
  }

  function routeBox(r, compact) {
    return h("div", { class: "card" + (compact ? " tight" : "") },
      h("div", { class: "kicker" }, r.kicker),
      r.lines.map((l) => {
        const text = routeLine(l);
        if (!text) return null;
        return h("div", { class: "route" }, l.strong ? h("strong", {}, (l.prefix || "") + text) : (l.prefix || "") + text);
      }));
  }

  function flagButton(flagId, label) {
    const on = state.flags.includes(flagId);
    return h("button", {
      class: "flag", type: "button", "aria-pressed": on ? "true" : "false",
      "aria-label": "Flag " + label + ": I'd check this in my own organisation",
      onclick: (e) => {
        e.stopPropagation();
        state.flags = on ? state.flags.filter((f) => f !== flagId) : state.flags.concat(flagId);
        save();
        track(on ? "unflag" : "flag", flagId);
        route();
      },
    }, icon(ICON_FLAG));
  }

  // ---------- Screens ----------

  function renderScreen(s) {
    state.last = s.id;
    save();
    track("screen", s.id);
    ({ scene, choice, reveal, story, recorder, forecast, ledger, takeback, closing })[s.type](s);
  }

  function scene(s) {
    page(s.header, s.title, [
      h("div", { class: "time" }, s.time),
      h("h1", { class: "big" }, s.title),
      h("div", { class: "chips" }, s.chips.map((c) => h("span", { class: "chip" }, c))),
      h("section", { class: "card" }, h("h2", { class: "kicker teal" }, s.know.kicker), h("ul", {}, s.know.items.map((i) => h("li", { class: "lead" }, i)))),
      h("section", { class: "card" }, h("h2", { class: "kicker amber" }, s.dontKnow.kicker), h("ul", {}, s.dontKnow.items.map((i) => h("li", { class: "lead" }, i)))),
    ], [primary(s.button, () => advance(s.id)), h("p", { class: "small center", style: "margin:0" }, s.footnote)]);
  }

  function choice(s) {
    const picks = selected(s.id);
    const multi = s.max > 1;
    const status = h("div", { class: "counter", "aria-live": "polite" }, s.counter ? picks.length + " of " + s.max + " picked" : "");

    const options = h("div", { class: "options", role: multi ? "group" : "radiogroup", "aria-label": plain(s.title) },
      s.options.map((o) => {
        const on = picks.includes(o.id);
        return h("button", {
          class: "option", type: "button",
          role: multi ? null : "radio",
          "aria-pressed": multi ? String(on) : null,
          "aria-checked": multi ? null : String(on),
          onclick: () => {
            if (multi) {
              if (on) state.answers[s.id] = picks.filter((p) => p !== o.id);
              else if (picks.length < s.max) state.answers[s.id] = picks.concat(o.id);
              else { status.textContent = "You can pick up to " + word(s.max) + ". Untick one first."; return; }
            } else state.answers[s.id] = o.id;
            save();
            route();
          },
        },
        h("span", { class: "key", "aria-hidden": "true" }, o.key),
        h("span", {}, h("span", { class: "t" }, o.title), o.body ? h("span", { class: "d" }, o.body) : null));
      }));

    const note = variant(s.notes);
    const ok = picks.length >= s.min;
    page(s.header, s.title, [
      s.route ? routeBox(s.route, false) : null,
      h("h1", {}, s.title),
      h("p", { class: "intro" }, s.intro),
      note ? h("div", { class: "card tight", style: "color:var(--amber);font-size:.875rem" }, t(note)) : null,
      (s.threadsBeforeOptions || []).map((r) => threadChip(r, s.id)),
      options,
      s.footnote ? h("p", { class: "small", style: "margin:6px 0 0" }, s.footnote) : null,
      (s.threads || []).map((r) => threadChip(r, s.id)),
    ], [s.counter ? status : null, primary(s.button, () => { track("lock", s.id); advance(s.id); }, ok)]);
  }

  function reveal(s) {
    const cards = [];
    for (const cid of s.from) {
      const cs = screenById(cid);
      if (!cs || !isVisible(cs)) continue;
      cs.options.filter((o) => selected(cid).includes(o.id)).forEach((o) => {
        const fid = "reveal:" + cid + ":" + o.id;
        cards.push(h("div", { class: "card" },
          h("div", { class: "row-head" },
            h("span", { class: "who" }, t(o.short || o.title)),
            h("span", { class: "row-tools" }, h("span", { class: "lens" }, t(o.assumption.lens)), flagButton(fid, plain(o.short)))),
          h("p", { class: "lead", style: "font-size:.94rem" }, t(o.assumption.text))));
      });
    }
    page(s.header, s.title, [
      h("h1", {}, s.title),
      h("p", { class: "intro" }, s.intro),
      cards,
      h("div", { class: "card dashed-amber", style: "margin-top:8px" }, h("div", { class: "kicker amber" }, s.costBox.kicker), h("div", { style: "font-size:1.125rem;font-weight:500;line-height:1.35" }, s.costBox.text)),
    ], [primary(s.button, () => advance(s.id))]);
  }

  function story(s) {
    const blocks = s.blocks.map((b) => {
      if (b.type === "time") return h("div", { class: "time" }, b.text);
      if (b.type === "card") return h("div", { class: "card" }, h("div", { class: "kicker" }, b.kicker), h("p", { class: "lead" }, b.text));
      if (b.type === "thread") return threadChip(b, s.id);
      if (b.type === "chat") return h("div", { class: "card" }, h("div", { class: "kicker" }, b.kicker), h("p", { class: "bubble" }, b.message), h("p", { class: "alert" }, b.alert));
      if (b.type === "chain") {
        const nodes = [];
        b.nodes.forEach((n, i) => {
          if (i) nodes.push(h("span", { class: "sep", "aria-hidden": "true" }, "→"));
          nodes.push(h("div", { class: "node " + n.tone, role: "listitem" }, h("b", {}, n.title), h("span", {}, n.sub)));
        });
        return h("section", {}, h("h2", { class: "kicker", style: "margin:6px 0 8px" }, b.kicker), h("div", { class: "chain", role: "list" }, nodes));
      }
      return null;
    });
    page(s.header, s.blocks[0].text, [h("h1", { class: "visually-hidden" }, plain(s.blocks[0].text)), blocks], [primary(s.button, () => advance(s.id))]);
  }

  function recorder(s) {
    // In live mode the text goes straight to the backend, encrypted, and is
    // never kept in the browser or shown again here; it can be emailed back.
    const saved = state.recorder && !state.recorder.skipped ? state.recorder : {};
    const error = h("p", { class: "error", role: "alert" });
    const fields = s.fields.map((f) => {
      const ta = h("textarea", { id: "rec-" + f.id, maxlength: "1000", required: f.required ? "" : null, "aria-required": f.required ? "true" : null });
      ta.value = mode === "live" ? "" : saved[f.id] || "";
      return { f, ta, el: h("label", { class: "field", for: "rec-" + f.id }, h("span", { class: "kicker amber" }, f.label), ta) };
    });
    page(s.header, s.title, [
      h("h1", {}, s.title),
      h("p", { class: "intro", style: "font-size:.94rem;color:var(--muted2)" }, s.intro),
      fields.map((x) => x.el),
      h("p", { class: "lockline" }, icon(ICON_LOCK), h("span", {}, s.privacy)),
      mode === "live" && saved.savedAt ? h("p", { class: "small", style: "margin:0" }, "You saved your flight recorder on " + new Date(saved.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) + ". Saving again replaces it.") : null,
      error,
    ], [
      primary(s.button, async () => {
        const values = {};
        fields.forEach(({ f, ta }) => { values[f.id] = ta.value.trim(); });
        const missing = fields.find(({ f }) => f.required && !values[f.id]);
        if (missing) { error.textContent = "Please write something for the first hour, or skip."; missing.ta.focus(); return; }
        if (mode === "live") {
          try {
            const res = await api("PUT", "/file/recorder", values);
            state.recorder = { saved: true, savedAt: res.savedAt };
          } catch (e) {
            if (e.status === 401) return expired(e.message);
            error.textContent = e.status ? e.message : "Couldn't save. Check your connection and try again.";
            return;
          }
        } else {
          state.recorder = Object.assign(values, { savedAt: new Date().toISOString() });
        }
        track("recorder", "saved"); // never the text itself
        advance(s.id);
      }),
      secondary(s.skip, () => {
        if (!saved.savedAt) state.recorder = { skipped: true };
        track("recorder", "skipped");
        advance(s.id);
      }),
    ]);
  }

  function forecast(s) {
    const pick = state.answers[s.id];
    page(s.header, s.title, [
      routeBox(s.route, false),
      h("h1", { style: "margin-top:16px" }, s.title),
      h("p", { class: "intro", style: "font-size:.94rem" }, s.intro),
      h("div", { class: "options", role: "radiogroup", "aria-label": plain(s.title) }, s.options.map((o) =>
        h("button", { class: "option plain", type: "button", role: "radio", "aria-checked": String(pick === o.id), onclick: () => { state.answers[s.id] = o.id; save(); route(); } },
          h("span", { class: "t", style: "font-size:1rem" }, o.title)))),
    ], [
      primary(s.button, () => { track("forecast", pick); advance(s.id); }, !!pick),
      h("p", { class: "lockline", style: "justify-content:center;margin:0" }, icon(ICON_LOCK), h("span", {}, s.privacy)),
    ]);
  }

  function ledger(s) {
    const rows = ledgerRows();
    const deposits = rows.filter((r) => r.effect === "deposit").length;
    const drains = rows.filter((r) => r.effect === "drain").length;
    const places = (n) => (n === 0 ? "no places" : n + (n === 1 ? " place" : " places"));
    const fc = screenById("forecast");
    const fcPick = fc && fc.options.find((o) => o.id === state.answers.forecast);

    const cards = rows.map((r) => {
      const effect = isTodo(r.effect) ? t(r.effect) : h("span", { class: "pill " + r.effect }, r.effect === "drain" ? "Drain" : "Deposit");
      return h("div", { class: "card tight ledger-row", onclick: () => go("row/" + r.id) },
        h("div", { class: "row-head" },
          h("button", { class: "dim", type: "button", "aria-label": plain(r.dimension) + ": open three months on and next time", onclick: (e) => { e.stopPropagation(); go("row/" + r.id); } }, r.dimension),
          h("span", { class: "row-tools" }, effect, flagButton("ledger:" + r.id, plain(r.dimension)))),
        h("p", {}, t(r.summary)));
    });

    page(s.header, s.headline, [
      h("h1", { class: "mid" }, s.headline),
      h("div", { class: "card tight", style: "font-size:.8125rem;color:var(--soft);display:block" },
        fcPick ? [s.summary.forecastLabel + " ", h("strong", { style: "color:var(--text)" }, fcPick.phrase), " "] : null,
        s.summary.tally.replace("{deposits}", places(deposits)).replace("{drains}", String(drains))),
      cards,
      h("p", { class: "small", style: "margin:2px 2px 0" }, s.footnote),
    ], [primary(s.button, () => advance(s.id))]);
  }

  function takeback(s) {
    const items = takeBackCandidates();
    const tb = state.takeBack && !state.takeBack.skipped ? state.takeBack : { when: s.defaultWhen, followUp: false };
    if (!items.some((i) => i.id === tb.item)) tb.item = null;
    const error = h("p", { class: "error", role: "alert" });
    const remember = (patch) => { state.takeBack = Object.assign({}, tb, patch, { draft: true }); save(); route(); };

    const list = h("div", { class: "options", role: "radiogroup", "aria-label": plain(s.title) }, items.map((i) =>
      h("button", { class: "option radio", type: "button", role: "radio", "aria-checked": String(tb.item === i.id), onclick: () => remember({ item: i.id }) },
        h("span", { class: "dot", "aria-hidden": "true" }),
        h("span", {}, h("span", { class: "t" }, t(i.label)), h("span", { class: "from" }, "From: ", t(i.from))))));

    const followUp = h("input", { type: "checkbox", id: "followup", checked: tb.followUp ? "" : null });
    followUp.addEventListener("change", () => remember({ followUp: followUp.checked }));

    const content = [h("h1", { class: "big" }, s.title)];
    if (!items.length) {
      content.push(h("p", { class: "intro", style: "font-size:.94rem" }, s.none));
    } else {
      content.push(
        h("p", { class: "intro", style: "font-size:.94rem" }, s.intro.replace("{count}", word(items.length))),
        list,
        h("fieldset", { class: "card", style: "margin:6px 0 0" },
          h("legend", { class: "visually-hidden" }, s.whenKicker),
          h("div", { class: "kicker amber", "aria-hidden": "true" }, s.whenKicker),
          h("div", { class: "segments", role: "radiogroup", "aria-label": s.whenKicker }, s.whenOptions.map((w) =>
            h("button", { class: "option", type: "button", role: "radio", "aria-checked": String(tb.when === w.id), onclick: () => remember({ when: w.id }) }, h("span", { class: "t", style: "font-weight:500" }, w.label)))),
          h("label", { class: "check", for: "followup" }, followUp, h("span", {}, s.followUp))),
        error);
    }

    const close = (value) => { state.takeBack = value; state.closed = true; track("close", value.skipped ? "skipped" : "took-back"); advance(s.id); };
    page(s.header, s.title, content, [
      items.length ? primary(s.button, () => {
        if (!tb.item) { error.textContent = "Pick one thing to take back, or skip."; return; }
        close({ item: tb.item, when: tb.when, followUp: !!tb.followUp, savedAt: new Date().toISOString() });
      }) : secondary("Back to the ledger", () => go("ledger")),
      secondary(s.skip, () => close({ skipped: true })),
    ]);
  }

  function closing(s) {
    const tbScreen = screenById("takeback");
    const tb = state.takeBack && !state.takeBack.skipped && !state.takeBack.draft ? state.takeBack : null;
    const item = tb && takeBackCandidates().find((i) => i.id === tb.item);
    const when = tb && tbScreen.whenOptions.find((w) => w.id === tb.when);
    const hasRecorder = state.recorder && !state.recorder.skipped && (state.recorder.saved || state.recorder.hour);
    const emailRecorder = async () => {
      track("recorder-email");
      if (mode !== "live") { recStatus.textContent = s.recorder.previewNote; return; }
      recStatus.textContent = "Sending…";
      try {
        await api("POST", "/file/recorder/email");
        recStatus.textContent = "Sent. Check your inbox.";
      } catch (e) {
        recStatus.textContent = e.status ? e.message : "Couldn't send. Check your connection and try again.";
      }
    };
    const recStatus = h("p", { class: "small", role: "status", style: "margin:0" });
    const shareStatus = h("p", { class: "small", role: "status", style: "margin:0" });

    // Share a general link only: never the reader's personal magic link.
    const shareUrl = location.origin + location.pathname;
    const share = async () => {
      const data = { title: scenario.brand + ": " + scenario.title, url: shareUrl };
      try {
        if (navigator.share) { await navigator.share(data); return; }
        await navigator.clipboard.writeText(shareUrl);
        shareStatus.textContent = s.share.copied;
      } catch (e) { shareStatus.textContent = shareUrl; }
      track("share");
    };

    page(s.header, mirrorText(s.mirror), [
      h("div", { class: "kicker amber" }, s.kicker),
      h("h1", { class: "mirror" }, t(mirrorText(s.mirror))),
      h("p", { class: "tagline" }, s.tagline),
      item ? h("div", { class: "card" }, h("div", { class: "kicker teal" }, s.takingKicker),
        h("p", { class: "note-line" }, t(item.commit || item.label), " ", when ? when.phrase : "", tb.followUp ? " " + tbScreen.followUpPromise : "")) : null,
      hasRecorder ? h("div", { class: "card" }, h("div", { class: "kicker" }, s.recorder.kicker), h("p", { class: "note-line" }, s.recorder.text),
        h("button", { class: "btn secondary small-btn", type: "button", onclick: emailRecorder }, s.recorder.button), recStatus) : null,
      h("div", { class: "card" }, h("div", { class: "kicker" }, s.share.kicker), h("p", { class: "note-line" }, s.share.text),
        h("button", { class: "btn secondary small-btn", type: "button", onclick: share }, s.share.button), shareStatus),
      h("div", { class: "card outline-amber" }, h("p", { class: "note-line" }, s.team.text),
        h("a", { class: "btn", href: "mailto:" + scenario.replyAddress + "?subject=team" }, s.team.button)),
    ], [h("p", { class: "small center", style: "margin:0" }, s.next)]);
  }

  // ---------- Threads (optional detours) ----------

  function renderThread(id, fromId) {
    const th = scenario.threads[id];
    const back = screenById(fromId) ? fromId : state.last;
    if (!state.pulled.includes(id)) { state.pulled.push(id); save(); track("thread", id); }
    const pick = state.threads[id];
    const chosen = th.options.find((o) => o.id === pick);

    const options = h("div", { class: "options", role: "radiogroup", "aria-label": plain(th.title) }, th.options.map((o) =>
      h("button", { class: "option plain", type: "button", role: "radio", "aria-checked": String(pick === o.id), onclick: () => { state.threads[id] = o.id; save(); route(); } },
        h("span", {}, h("span", { class: "t", style: "font-size:1rem" }, o.title), o.body ? h("span", { class: "d", style: "font-size:.875rem" }, o.body) : null))));

    let revealBox = null;
    if (chosen && chosen.reveal) {
      const r = chosen.reveal;
      revealBox = h("div", { class: "card", "aria-live": "polite" }, h("div", { class: "kicker amber" }, "You're assuming…"),
        isTodo(r) ? h("p", {}, t(r)) : [
          h("p", { class: "lead" }, r.assuming),
          h("p", { class: "gain" }, h("b", {}, "Gain."), " ", r.gain),
          h("p", { class: "cost" }, h("b", {}, "Cost."), " ", r.cost)]);
    }

    const done = () => go(back);
    page(th.header, th.title, [
      th.time ? h("div", { class: "time" }, th.time) : null,
      h("h1", {}, th.title),
      th.intro ? h("p", { class: "intro", style: "font-size:.94rem" }, t(variant(th.intro))) : null,
      th.situation ? h("div", { class: "card" }, th.situation.time ? h("div", { class: "time", style: "font-size:.72rem" }, th.situation.time) : null, h("p", { class: "lead" }, th.situation.text)) : null,
      th.prompt ? h("p", { class: "intro", style: "font-size:.94rem" }, th.prompt) : null,
      options,
      revealBox,
      th.closing ? h("p", { class: "note-line" }, th.closing) : null,
      th.disclaimer ? h("p", { class: "small", style: "margin:0" }, th.disclaimer) : null,
    ], [th.lock ? primary("Lock in", done, !!pick) : secondary("Back to the file", done)]);
  }

  function renderRow(r) {
    const d = r.detail;
    const effect = isTodo(r.effect) ? t(r.effect) : h("span", { class: "pill big " + r.effect }, r.effect === "drain" ? "Drain" : "Deposit");
    const box = (kicker, text, cls) => h("div", { class: "card " + (cls || "") }, h("div", { class: "kicker " + (cls ? "coral" : "amber") }, kicker), h("p", { class: "lead" }, t(text)));
    page({ label: "The Monday After · Thread", step: "Optional" }, r.dimension, [
      h("div", { class: "row-head" }, h("h1", { class: "big" }, r.dimension), effect),
      isTodo(d) ? h("p", {}, t(d))
        : typeof d === "string" ? h("p", { class: "intro", style: "font-size:.94rem" }, d) // a detail written as one paragraph
        : [
        h("p", { class: "intro", style: "font-size:.94rem" }, d.intro),
        box("Monday", d.monday),
        box("Three months on", d.threeMonths),
        box("Next time", d.nextTime),
        box("Assured on paper", d.paper, "dashed-coral"),
      ],
    ], [secondary("Back to the ledger", () => go("ledger"))]);
  }

  // ---------- Start ----------

  function message(title, text, link) {
    app.replaceChildren(h("main", { class: "screen" }, h("div", { class: "body" }, h("h1", {}, title), h("p", { class: "intro", style: "font-size:.94rem" }, text),
      link ? h("a", { class: "btn secondary", href: link.href, style: "margin-top:12px" }, link.label) : null)));
    document.title = "The Monday After";
  }
  function expired(text) {
    mode = "stopped";
    try { sessionStorage.removeItem("tma:token"); } catch (e) { /* ignore */ }
    message("This link has expired.", text || "Reply to any Monday After email and we'll send you a fresh one.");
  }

  async function loadScenario(id) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Bad file name");
    const res = await fetch("scenarios/" + id + ".json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Scenario not found");
    return res.json();
  }

  async function start() {
    const params = new URLSearchParams(location.search);

    // A personal link looks like ...#t=TOKEN. Take the token out of the address
    // straight away, so it can't be bookmarked, shared or seen over a shoulder.
    const fromLink = /^#t=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    try {
      if (fromLink) sessionStorage.setItem("tma:token", fromLink[1]);
      token = sessionStorage.getItem("tma:token");
    } catch (e) { token = fromLink ? fromLink[1] : null; }
    if (fromLink) history.replaceState(null, "", location.pathname + location.search);

    if (apiBase && !params.has("preview")) {
      if (!token) return message("Open this file from your email.", "Each Monday After file opens from the personal link in your email.", { href: "signup.html", label: "Not subscribed yet? Sign up" });
      mode = "live";
      let opened;
      try {
        opened = await api("GET", "/file");
      } catch (e) {
        if (e.status === 401) return expired(e.message);
        return message("This file couldn't be opened.", "Check your connection and try the link in your email again.");
      }
      scenario = await loadScenario(opened.scenarioId);
      state = Object.assign(blankState(), opened.state || {});
      if (opened.recorder && !(state.recorder && state.recorder.saved)) state.recorder = opened.recorder;
    } else {
      scenario = await loadScenario(params.get("file") || "incident-file-01");
      storageKey = "tma:" + scenario.id;
      if (params.has("reset")) {
        try { localStorage.removeItem(storageKey); } catch (e) { /* ignore */ }
        params.delete("reset");
        history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
      }
      state = load();
    }
    window.addEventListener("hashchange", route);
    route();
  }

  start().catch(() => message("This file couldn't be opened.", "Please try the link in your email again."));
})();
