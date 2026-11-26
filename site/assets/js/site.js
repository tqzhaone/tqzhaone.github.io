/*
 * tqzhaone.github.io
 *
 * 1. Language switch (English / 中文).
 * 2. Top bar, phone menu and the highlighted section in the menu.
 * 3. Email address, publication filter, and the copy buttons.
 * 4. The imaging chamber on the opening screen. The pointer acts as the excitation lamp: particles
 *    store energy where it passes and give it back as afterglow that decays over a few seconds. Each
 *    particle has its own lifetime (a spread of trap depths), and the glow is shown with an IVIS-style
 *    radiance colour table. The letters of the name charge and decay the same way.
 */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  /* 1. Language ------------------------------------------------------------------------------- */

  const TITLES = { en: "Tianqi Zhao | Afterglow materials", zh: "Tianqi Zhao | 余辉发光材料" };
  const currentLang = () => (root.getAttribute("data-lang") === "zh" ? "zh" : "en");

  function setLang(next, remember) {
    const lang = next === "zh" ? "zh" : "en";
    root.setAttribute("data-lang", lang);
    root.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = TITLES[lang];
    document.querySelectorAll("[data-set-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.setLang === lang));
    });
    if (remember) {
      try {
        localStorage.setItem("site-lang", lang);
      } catch (error) {
        // Storage is unavailable (private mode); the choice lasts for this page only.
      }
    }
    document.dispatchEvent(new CustomEvent("site:lang"));
  }

  setLang(currentLang(), false);
  document.querySelectorAll("[data-set-lang]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.setLang, true));
  });

  /* 2. Top bar, menu, highlighted section --------------------------------------------------------- */

  const topbar = document.querySelector("[data-topbar]");
  const chamber = document.querySelector(".chamber");
  const menuButton = document.querySelector("[data-menu]");

  function updateTopbar() {
    topbar.classList.toggle("is-solid", chamber.getBoundingClientRect().bottom < topbar.offsetHeight + 8);
  }

  let scrollQueued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        updateTopbar();
      });
    },
    { passive: true }
  );
  updateTopbar();

  function closeMenu() {
    topbar.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  menuButton.addEventListener("click", () => {
    const open = !topbar.classList.contains("is-open");
    topbar.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".nav a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const navLinks = new Map(Array.from(document.querySelectorAll("[data-nav]"), (link) => [link.dataset.nav, link]));
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const link = navLinks.get(entry.target.id);
        if (link) link.classList.toggle("is-active", entry.isIntersecting);
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  navLinks.forEach((link, id) => {
    const section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });

  /* 3. Email and its copy button (the publications have their own page and pubs.js) ---------------- */

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (ignored) {
        copied = false;
      }
      area.remove();
      return copied;
    }
  };

  const showDone = (button) => {
    button.classList.add("is-done");
    clearTimeout(button.doneTimer);
    button.doneTimer = setTimeout(() => button.classList.remove("is-done"), 2000);
  };

  const status = document.querySelector("[data-status]");
  const announce = (en, zh) => {
    if (status) status.textContent = currentLang() === "zh" ? zh : en;
  };

  // The address is put together here, so it never sits whole in the HTML for spam crawlers.
  let emailAddress = "";
  document.querySelectorAll("[data-email]").forEach((link) => {
    emailAddress = `${link.dataset.user}@${link.dataset.domain}`;
    link.href = `mailto:${emailAddress}`;
    const text = link.querySelector("[data-email-text]");
    if (text) text.textContent = emailAddress;
  });
  document.querySelectorAll("[data-copy-email]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (emailAddress && (await copyText(emailAddress))) {
        showDone(button);
        announce("Email address copied", "已复制邮箱");
      }
    });
  });

  /* 4. Imaging chamber ----------------------------------------------------------------------------- */

  const canvas = chamber.querySelector(".chamber__canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const nameEl = chamber.querySelector(".name");
  const timeOut = chamber.querySelector("[data-t]");
  const plot = chamber.querySelector(".readout__plot");
  const plotCtx = plot.getContext("2d");

  // Radiance colour table, low to high (matches --lut in site.css).
  const STOPS = [
    [0, [43, 11, 102]],
    [0.2, [35, 72, 255]],
    [0.42, [0, 200, 255]],
    [0.62, [54, 242, 122]],
    [0.82, [255, 227, 77]],
    [1, [255, 69, 48]],
  ];

  function lut(t) {
    const v = t < 0 ? 0 : t > 1 ? 1 : t;
    for (let i = 1; i < STOPS.length; i++) {
      const [p1, c1] = STOPS[i];
      if (v <= p1) {
        const [p0, c0] = STOPS[i - 1];
        const k = (v - p0) / (p1 - p0);
        return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  // One pre-rendered glow sprite per colour level.
  const LEVELS = 48;
  const SPRITE = 64;
  const sprites = [];
  for (let i = 0; i < LEVELS; i++) {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = SPRITE;
    const g = sprite.getContext("2d");
    const [r, gr, b] = lut(i / (LEVELS - 1)).map(Math.round);
    const glow = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    glow.addColorStop(0, `rgba(${r},${gr},${b},1)`);
    glow.addColorStop(0.16, `rgba(${r},${gr},${b},0.9)`);
    glow.addColorStop(0.42, `rgba(${r},${gr},${b},0.25)`);
    glow.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, SPRITE, SPRITE);
    sprites.push(sprite);
  }

  let W = 0;
  let H = 0;
  let dpr = 1;
  let N = 0;
  let R = 100; // radius of the lamp's reach, in CSS pixels
  let px, py, pr, pe, pk; // position, size, stored energy, decay rate (1 / lifetime)
  let grid = [];
  let gridCols = 1;
  let gridRows = 1;
  const base = document.createElement("canvas"); // the particles as they look unlit
  const baseCtx = base.getContext("2d");

  const gaussian = () => {
    let u = 0;
    let v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /* The name, one span per letter, so each letter can charge and decay on its own. */
  const letters = [];
  (function splitName() {
    const text = nameEl.textContent.trim();
    nameEl.setAttribute("aria-label", text);
    const holder = document.createElement("span");
    holder.setAttribute("aria-hidden", "true");
    for (const ch of text) {
      const span = document.createElement("span");
      span.className = "ch";
      span.textContent = ch;
      holder.appendChild(span);
      if (ch.trim()) letters.push({ el: span, x: 0, y: 0, h: 0, e: 0, shown: 0 });
    }
    nameEl.textContent = "";
    nameEl.appendChild(holder);
  })();

  function measureLetters() {
    const box = chamber.getBoundingClientRect();
    letters.forEach((letter) => {
      const r = letter.el.getBoundingClientRect();
      letter.x = r.left - box.left + r.width / 2;
      letter.y = r.top - box.top + r.height / 2;
      letter.h = r.height;
    });
  }

  function build() {
    const box = chamber.getBoundingClientRect();
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    R = Math.max(64, Math.min(130, Math.min(W, H) * 0.12));

    const density = coarsePointer.matches ? 1 / 760 : 1 / 520;
    N = Math.round(Math.max(420, Math.min(coarsePointer.matches ? 1400 : 3000, W * H * density)));
    px = new Float32Array(N);
    py = new Float32Array(N);
    pr = new Float32Array(N);
    pe = new Float32Array(N);
    pk = new Float32Array(N);

    // Mostly an even dispersion, with some aggregates.
    const clusters = [];
    for (let c = 0; c < 9; c++) clusters.push([Math.random() * W, Math.random() * H, 30 + Math.random() * 110]);
    for (let i = 0; i < N; i++) {
      if (Math.random() < 0.32) {
        const [cx, cy, spread] = clusters[i % clusters.length];
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * spread;
        px[i] = cx + Math.cos(angle) * dist;
        py[i] = cy + Math.sin(angle) * dist;
      } else {
        px[i] = Math.random() * W;
        py[i] = Math.random() * H;
      }
      pr[i] = 0.5 + Math.random() * 1.3;
      // Lifetimes spread log-normally around 1.8 s, like a distribution of trap depths.
      const lifetime = Math.min(9, Math.max(0.35, Math.exp(Math.log(1.8) + 0.6 * gaussian())));
      pk[i] = 1 / lifetime;
    }

    // Spatial grid with cells the size of the lamp's reach, for quick lookups.
    gridCols = Math.ceil(W / R) + 1;
    gridRows = Math.ceil(H / R) + 1;
    const buckets = Array.from({ length: gridCols * gridRows }, () => []);
    for (let i = 0; i < N; i++) {
      const gx = Math.min(gridCols - 1, Math.max(0, Math.floor(px[i] / R)));
      const gy = Math.min(gridRows - 1, Math.max(0, Math.floor(py[i] / R)));
      buckets[gy * gridCols + gx].push(i);
    }
    grid = buckets.map((bucket) => Uint16Array.from(bucket));

    base.width = canvas.width;
    base.height = canvas.height;
    baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baseCtx.fillStyle = "#000";
    baseCtx.fillRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      baseCtx.fillStyle = `rgba(160, 170, 200, ${(0.06 + Math.random() * 0.12).toFixed(3)})`;
      baseCtx.beginPath();
      baseCtx.arc(px[i], py[i], pr[i] * 0.75, 0, Math.PI * 2);
      baseCtx.fill();
    }
    measureLetters();
  }

  /* Excitation */

  const lamp = { x: 0, y: 0, a: 0 };
  let lastExcitation = performance.now();

  function deposit(x, y, amount) {
    const reach2 = R * R;
    const gx0 = Math.max(0, Math.floor((x - R) / R));
    const gx1 = Math.min(gridCols - 1, Math.floor((x + R) / R));
    const gy0 = Math.max(0, Math.floor((y - R) / R));
    const gy1 = Math.min(gridRows - 1, Math.floor((y + R) / R));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const bucket = grid[gy * gridCols + gx];
        for (let j = 0; j < bucket.length; j++) {
          const i = bucket[j];
          const dx = px[i] - x;
          const dy = py[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach2) {
            const f = 1 - d2 / reach2;
            const e = pe[i] + amount * f * f;
            pe[i] = e > 1.3 ? 1.3 : e;
          }
        }
      }
    }
    for (const letter of letters) {
      const reach = Math.max(R * 0.8, letter.h * 0.6);
      const dx = letter.x - x;
      const dy = letter.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < reach * reach) letter.e = Math.min(1.25, letter.e + amount * 0.9 * (1 - d2 / (reach * reach)));
    }
    lamp.x = x;
    lamp.y = y;
    lamp.a = 1;
    lastExcitation = performance.now();
  }

  // Excite along a stroke, so a fast pointer still leaves a continuous trail.
  function stroke(x0, y0, x1, y1, amount) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (R / 3)));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      deposit(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, amount);
    }
  }

  /* Automatic passes of the lamp: one across the name on load, then occasional ones when idle. */

  const sweeps = [];
  let lastUser = 0;
  let lastSweepEnd = performance.now();

  // A wavy pass along the name, from just before its first letter to just past its last.
  function introPath() {
    const first = letters[0];
    const last = letters[letters.length - 1];
    const x0 = first.x - R * 0.6;
    const x1 = last.x + R * 0.4;
    const yc = (first.y + last.y) / 2;
    const amp = first.h * 0.18;
    return (u) => [x0 + (x1 - x0) * u, yc + Math.sin(u * Math.PI * 3) * amp];
  }

  function startSweep(kind, now) {
    if (kind === "intro") {
      sweeps.push({ t0: now, dur: 1700, path: introPath(), amount: 0.34, last: null });
      return;
    }
    const y0 = H * (0.12 + Math.random() * 0.6);
    const y1 = H * (0.12 + Math.random() * 0.6);
    const leftToRight = Math.random() < 0.5;
    const xa = leftToRight ? -R : W + R;
    const xb = leftToRight ? W + R : -R;
    const bow = (Math.random() - 0.5) * H * 0.4;
    sweeps.push({
      t0: now,
      dur: 3400,
      path: (u) => [xa + (xb - xa) * u, y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * bow],
      amount: 0.2,
      last: null,
    });
  }

  function runSweeps(now) {
    for (let s = sweeps.length - 1; s >= 0; s--) {
      const sweep = sweeps[s];
      const u = Math.min(1, (now - sweep.t0) / sweep.dur);
      const [x, y] = sweep.path(u);
      if (sweep.last) stroke(sweep.last[0], sweep.last[1], x, y, sweep.amount);
      sweep.last = [x, y];
      if (u >= 1) {
        sweeps.splice(s, 1);
        lastSweepEnd = now;
      }
    }
  }

  /* Drawing */

  const BASE_SHADOW = "0 0 34px rgba(236, 239, 247, 0.16)";
  const history = new Float32Array(200);
  let historyPos = 0;
  let historyClock = 0;

  function paintLetters(dt) {
    const k = Math.exp(-dt / 2.4);
    for (const letter of letters) {
      letter.e *= k;
      const e = letter.e > 1 ? 1 : letter.e;
      if (e < 0.01) {
        if (letter.shown) {
          letter.el.style.textShadow = "";
          letter.shown = 0;
        }
        continue;
      }
      if (Math.abs(e - letter.shown) < 0.006) continue;
      letter.shown = e;
      const [r, g, b] = lut(e).map(Math.round);
      const c = `${r}, ${g}, ${b}`;
      letter.el.style.textShadow =
        `0 0 ${(3 + 5 * e).toFixed(1)}px rgba(${c}, ${(0.9 * e).toFixed(3)}), ` +
        `0 0 ${(14 + 26 * e).toFixed(1)}px rgba(${c}, ${(0.7 * e).toFixed(3)}), ` +
        `0 0 ${(36 + 60 * e).toFixed(1)}px rgba(${c}, ${(0.4 * e).toFixed(3)}), ${BASE_SHADOW}`;
    }
  }

  function drawPlot() {
    const w = plot.clientWidth || 180;
    const h = plot.clientHeight || 56;
    if (plot.width !== Math.round(w * dpr)) {
      plot.width = Math.round(w * dpr);
      plot.height = Math.round(h * dpr);
    }
    plotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plotCtx.clearRect(0, 0, w, h);
    plotCtx.strokeStyle = "rgba(236, 239, 247, 0.2)";
    plotCtx.lineWidth = 1;
    plotCtx.beginPath();
    plotCtx.moveTo(0.5, 0);
    plotCtx.lineTo(0.5, h - 0.5);
    plotCtx.lineTo(w, h - 0.5);
    plotCtx.stroke();
    // Mean stored energy on a log axis from 1e-4 (bottom) to 1 (top): an exponential decay is a straight fall.
    plotCtx.beginPath();
    for (let k = 0; k < history.length; k++) {
      const v = history[(historyPos + k) % history.length];
      const level = Math.log10(Math.max(v, 1e-4));
      const x = 1 + (k / (history.length - 1)) * (w - 2);
      const y = h - 2 - ((level + 4) / 4) * (h - 6);
      if (k === 0) plotCtx.moveTo(x, y);
      else plotCtx.lineTo(x, y);
    }
    plotCtx.strokeStyle = "#74f7be";
    plotCtx.lineWidth = 1.5;
    plotCtx.shadowColor = "rgba(116, 247, 190, 0.8)";
    plotCtx.shadowBlur = 6;
    plotCtx.stroke();
    plotCtx.shadowBlur = 0;
  }

  function render(dt, decay) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";

    let total = 0;
    for (let i = 0; i < N; i++) {
      let e = pe[i];
      if (e < 0.003) {
        if (e) pe[i] = 0;
        continue;
      }
      if (decay) {
        e *= Math.exp(-dt * pk[i]);
        pe[i] = e;
      }
      total += e;
      const v = e > 1 ? 1 : e;
      const size = pr[i] * (4 + 18 * v);
      ctx.globalAlpha = v < 0.15 ? (v / 0.15) * 0.7 : 0.7 + 0.3 * v;
      ctx.drawImage(sprites[(v * (LEVELS - 1)) | 0], px[i] - size / 2, py[i] - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    // The lamp itself: a faint violet spot where the excitation light falls.
    if (decay) lamp.a *= Math.exp(-dt / 0.18);
    if (lamp.a > 0.02) {
      const spot = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, R * 1.1);
      spot.addColorStop(0, `rgba(143, 107, 255, ${(0.22 * lamp.a).toFixed(3)})`);
      spot.addColorStop(1, "rgba(143, 107, 255, 0)");
      ctx.fillStyle = spot;
      ctx.fillRect(lamp.x - R * 1.1, lamp.y - R * 1.1, R * 2.2, R * 2.2);
    }
    ctx.globalCompositeOperation = "source-over";

    paintLetters(decay ? dt : 0);

    historyClock += dt;
    if (historyClock >= 0.06 || !decay) {
      historyClock = 0;
      history[historyPos] = total / N;
      historyPos = (historyPos + 1) % history.length;
      drawPlot();
    }
  }

  /* Pointer */

  const pointer = { x: 0, y: 0, lx: 0, ly: 0, inside: false, moved: false };

  function localPoint(event) {
    const box = chamber.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  chamber.addEventListener("pointermove", (event) => {
    const [x, y] = localPoint(event);
    if (!pointer.inside) {
      pointer.lx = x;
      pointer.ly = y;
      pointer.inside = true;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.moved = true;
    lastUser = performance.now();
  });

  chamber.addEventListener("pointerdown", (event) => {
    const [x, y] = localPoint(event);
    pointer.inside = true;
    pointer.lx = pointer.x = x;
    pointer.ly = pointer.y = y;
    lastUser = performance.now();
    deposit(x, y, 0.8);
    if (reduceMotion.matches) render(0, false);
  });

  const leave = () => {
    pointer.inside = false;
  };
  chamber.addEventListener("pointerleave", leave);
  chamber.addEventListener("pointercancel", leave);

  /* Animation loop, paused when the chamber is off screen or the tab is hidden. */

  let raf = 0;
  let prev = 0;
  let onScreen = true;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - prev) / 1000;
    prev = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;

    if (pointer.inside && pointer.moved) {
      stroke(pointer.lx, pointer.ly, pointer.x, pointer.y, 0.3);
      pointer.lx = pointer.x;
      pointer.ly = pointer.y;
      pointer.moved = false;
    }
    runSweeps(now);
    if (!sweeps.length && now - Math.max(lastUser, lastSweepEnd) > 9000) startSweep("idle", now);

    render(dt, true);

    const since = (now - lastExcitation) / 1000;
    timeOut.textContent = since < 0.05 ? "0.0" : since >= 99.95 ? "99.9+" : since.toFixed(1);
  }

  function updateLoop() {
    const run = onScreen && !document.hidden && !reduceMotion.matches;
    if (run && !raf) {
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  // Reduced motion: no animation. Charge the name once and show that still image.
  function drawStill() {
    pe.fill(0);
    letters.forEach((letter) => {
      letter.e = 0;
      letter.shown = -1;
    });
    const path = introPath();
    let last = path(0);
    for (let s = 1; s <= 60; s++) {
      const next = path(s / 60);
      stroke(last[0], last[1], next[0], next[1], 0.34);
      last = next;
    }
    for (let i = 0; i < N; i++) pe[i] *= Math.exp(-1.2 * pk[i]);
    letters.forEach((letter) => {
      letter.e *= Math.exp(-1.2 / 2.4);
    });
    lamp.a = 0;
    render(0, false);
    timeOut.textContent = "1.2";
  }

  build();
  render(0, false);

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    updateLoop();
  }).observe(chamber);
  document.addEventListener("visibilitychange", updateLoop);
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", () => {
      updateLoop();
      if (reduceMotion.matches) drawStill();
    });
  }

  let started = false;
  function begin() {
    if (started) return;
    started = true;
    measureLetters();
    if (reduceMotion.matches) {
      drawStill();
      return;
    }
    startSweep("intro", performance.now());
    updateLoop();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(begin, 150));
  setTimeout(begin, 1200); // in case font loading never settles

  // Rebuild on real size changes only (phone address bars resize the window while scrolling).
  let lastSize = [W, H];
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const box = chamber.getBoundingClientRect();
      if (Math.abs(box.width - lastSize[0]) < 2 && Math.abs(box.height - lastSize[1]) < 120) {
        measureLetters();
        return;
      }
      build();
      lastSize = [W, H];
      if (reduceMotion.matches) drawStill();
      else render(0, false);
    }, 180);
  });
  document.addEventListener("site:lang", () => requestAnimationFrame(measureLetters));
})();
