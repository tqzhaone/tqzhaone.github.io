/*
 * Visit counter for tqzhaone.github.io, kept by the same Twikoo backend as the guestbook
 * (its COUNTER_GET event reads the count and adds one).
 *
 * A visit is counted once per browser session, so reloading or switching language does not add
 * to it, and only on the published site, never on a local preview. Nothing is stored in the
 * browser beyond this session, and if the server can't be reached the footer simply shows no
 * number.
 */
(function () {
  "use strict";

  const box = document.querySelector("[data-visits]");
  if (!box) return;
  const api = (box.dataset.api || "").trim();
  const canonical = document.querySelector('link[rel="canonical"]');
  let home = "";
  try {
    home = canonical ? new URL(canonical.href).hostname : "";
  } catch (error) {
    home = "";
  }
  if (!api || !home || location.hostname !== home) return;

  const KEY = "site-visit-count";

  function show(n, fresh) {
    const number = new Intl.NumberFormat("en").format(n);
    const en = document.createElement("span");
    en.dataset.l = "en";
    en.textContent = `${number} ${n === 1 ? "visit" : "visits"}`;
    const zh = document.createElement("span");
    zh.dataset.l = "zh";
    zh.lang = "zh-CN";
    zh.textContent = `访问量 ${number}`;
    box.textContent = "";
    box.append(en, zh);
    box.hidden = false;
    // This visit has just been added: its point lights up once, then settles.
    if (fresh) box.classList.add("is-new");
  }

  let known = null;
  try {
    known = sessionStorage.getItem(KEY);
  } catch (error) {
    known = null;
  }
  if (known && /^\d+$/.test(known)) {
    show(Number(known), false);
    return;
  }

  function count() {
    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "COUNTER_GET", url: "/", title: "Tianqi Zhao" }),
      credentials: "omit",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!result || typeof result.time !== "number") return;
        const n = result.time + 1; // the count before this visit, plus this visit
        try {
          sessionStorage.setItem(KEY, String(n));
        } catch (error) {
          // Without session storage a reload counts again; nothing else changes.
        }
        show(n, true);
      })
      .catch(() => {});
  }

  // After the page has settled, so the count never competes with the page itself.
  if ("requestIdleCallback" in window) requestIdleCallback(count, { timeout: 4000 });
  else setTimeout(count, 1500);
})();
