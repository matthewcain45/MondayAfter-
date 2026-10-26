// The Monday After: sign-up, confirm and manage-your-data pages.

(function () {
  "use strict";

  const apiBase = (document.querySelector('meta[name="tma-api"]') || {}).content || "/api";
  const $ = (id) => document.getElementById(id);
  const show = (id) => { document.querySelectorAll("[data-step]").forEach((el) => { el.hidden = el.id !== id; }); const h = $(id).querySelector("h1, h2"); if (h) { h.tabIndex = -1; h.focus(); } };

  async function post(path, token, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-TMA-Link"] = token;
    const res = await fetch(apiBase + path, { method: "POST", headers, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: res.status });
    return data;
  }

  // Read the personal link token from the address, then remove it from view.
  function takeToken(key) {
    const m = /^#t=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    let token = m ? m[1] : null;
    try {
      if (token) sessionStorage.setItem(key, token);
      else token = sessionStorage.getItem(key);
    } catch (e) { /* storage blocked: token only lives for this page view */ }
    if (m) history.replaceState(null, "", location.pathname);
    return token;
  }

  const page = document.body.dataset.page;

  if (page === "signup") {
    const form = $("signup-form");
    const error = $("signup-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.textContent = "";
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await post("/signup", null, { email: $("email").value, website: $("website").value });
        show("signup-done");
      } catch (err) {
        error.textContent = err.status ? err.message : "Couldn't reach us. Check your connection and try again.";
      } finally {
        button.disabled = false;
      }
    });
  }

  if (page === "confirm") {
    const token = takeToken("tma:confirm");
    if (!token) show("confirm-failed");
    else post("/confirm", token).then(() => show("confirm-done"), (err) => {
      $("confirm-failed-text").textContent = err.status === 401 ? "This confirm link has expired or was already used. Sign up again and we'll send a fresh one." : "Couldn't reach us. Check your connection and reload this page.";
      show("confirm-failed");
    });
  }

  if (page === "manage") {
    const token = takeToken("tma:manage");
    const fail = (err) => { $("manage-error").textContent = err.status ? err.message : "Couldn't reach us. Check your connection and try again."; };
    const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    // Shows the right cards for where the reader is now: subscribed, on a break or unsubscribed.
    function render(info) {
      $("manage-error").textContent = "";
      const paused = info.status === "paused";
      const out = info.status === "unsubscribed";
      $("pause-card").hidden = paused || out;
      $("resume-card").hidden = !paused;
      $("unsubscribe-card").hidden = out;
      $("manage-state").textContent = out
        ? "You're unsubscribed, so no more files will arrive. You can still delete your data below."
        : paused ? "You're on a break from the monthly files." : "You get one incident file a month.";
      if (paused) $("paused-until").textContent = "No files until " + longDate(info.pausedUntil) + ". They start again by themselves after that.";
      show("manage-choose");
    }
    const refresh = () => post("/manage", token).then(render, (err) => {
      if (err.status === 401) $("manage-missing-text").textContent = "This link has expired or isn't valid. Use the link at the bottom of your most recent Monday After email.";
      else if (!err.status) $("manage-missing-text").textContent = "Couldn't reach us. Check your connection and reload this page.";
      show("manage-missing");
    });

    if (!token) show("manage-missing");
    else refresh();
    $("pause").addEventListener("click", () => post("/pause", token).then(refresh, fail));
    $("resume").addEventListener("click", () => post("/resume", token).then(refresh, fail));
    $("unsubscribe").addEventListener("click", () => post("/unsubscribe", token).then(refresh, fail));
    $("delete-start").addEventListener("click", () => show("manage-confirm-delete"));
    $("delete-cancel").addEventListener("click", () => show("manage-choose"));
    $("delete-yes").addEventListener("click", () => post("/delete", token).then(() => {
      try { sessionStorage.clear(); } catch (e) { /* ignore */ }
      show("manage-deleted");
    }, (err) => { show("manage-choose"); fail(err); }));
  }
})();
