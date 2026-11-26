/*
 * Shared helpers for the small pages under /playground/ (loaded in <head>, before the page's own
 * script, so the language is set before anything is drawn).
 *
 *   Play.lang            "zh" or "en": ?lang=, then the site's remembered choice, then the browser's
 *   Play.onLang(fn)      call fn(lang) whenever the language changes
 *   Play.setLang(lang)
 *   Play.t({zh, en})     pick the string for the current language
 *   Play.lut(v)          [r, g, b] on the home page's radiance colour table, v in 0..1
 *   Play.rgba(c, a)      "rgba(r,g,b,a)"
 *   Play.store           localStorage that never throws
 *   Play.copy(text)      copy to the clipboard, true if it worked
 *
 * A button with [data-langswitch] switches the language; the <html> element's data-title-en and
 * data-title-zh give the document title in each language.
 */
(function () {
  "use strict";

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch (e) {}
    },
    json(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key) || "null");
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
  };

  let lang = "en";
  try {
    const asked = new URLSearchParams(location.search).get("lang");
    const stored = localStorage.getItem("site-lang");
    if (asked === "zh" || asked === "en") {
      lang = asked;
      localStorage.setItem("site-lang", asked);
    } else if (stored === "zh" || stored === "en") {
      lang = stored;
    } else if (/^zh\b/i.test(navigator.language || "")) {
      lang = "zh";
    }
  } catch (e) {
    if (/^zh\b/i.test(navigator.language || "")) lang = "zh";
  }

  const listeners = [];

  function apply() {
    const root = document.documentElement;
    root.dataset.lang = lang;
    root.lang = lang === "zh" ? "zh-CN" : "en";
    const title = root.getAttribute("data-title-" + lang);
    if (title) document.title = title;
    listeners.forEach((fn) => fn(lang));
  }

  function setLang(next) {
    lang = next === "zh" ? "zh" : "en";
    store.set("site-lang", lang);
    apply();
  }

  document.addEventListener("click", (ev) => {
    const button = ev.target.closest && ev.target.closest("[data-langswitch]");
    if (!button) return;
    if (ev.detail > 0) button.blur(); // a mouse click: give the keyboard back to the page
    setLang(lang === "zh" ? "en" : "zh");
  });

  const LUT = [
    [0, "#2b0b66"],
    [0.2, "#2348ff"],
    [0.42, "#00c8ff"],
    [0.62, "#36f27a"],
    [0.82, "#ffe34d"],
    [1, "#ff4530"],
  ].map(([p, hex]) => [p, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);

  function lut(v) {
    v = Math.max(0, Math.min(1, v));
    for (let i = 1; i < LUT.length; i++) {
      if (v <= LUT[i][0]) {
        const [p0, c0] = LUT[i - 1];
        const [p1, c1] = LUT[i];
        const f = (v - p0) / (p1 - p0);
        return c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
      }
    }
    return LUT[LUT.length - 1][1].slice();
  }

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  window.Play = {
    get lang() {
      return lang;
    },
    onLang(fn) {
      listeners.push(fn);
    },
    setLang,
    apply,
    t(o) {
      return o[lang];
    },
    lut,
    rgba,
    store,
    copy,
  };

  apply();
})();
