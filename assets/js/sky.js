/*
 * The opening screen follows the weather that weather.js shows in the top bar (where the visitor is,
 * or Nanjing). At night the photograph darkens and a few stars and the moon come out; rain, snow and
 * thunderstorms fall across it; fog and overcast skies grey it; a clear day leaves it as it is. A line
 * under the hint says why.
 *
 * Falling rain and snow are drawn only while the opening screen is in view and the tab is showing.
 * With reduced motion they are drawn once and hold still, and there is no lightning.
 */
(function () {
  "use strict";

  const chamber = document.querySelector(".chamber");
  const photo = document.querySelector(".chamber__photo img");
  const cv = document.querySelector(".chamber__sky");
  const note = document.querySelector("[data-skynote]");
  if (!chamber || !photo || !cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const zh = () => document.documentElement.getAttribute("data-lang") === "zh";

  /* What the WMO weather code means for the picture, and how hard it comes down (0 to 1). */
  function kind(code) {
    if (code >= 95) return "storm";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if (code === 45 || code === 48) return "fog";
    if (code === 3) return "overcast";
    return "clear";
  }
  function amount(code) {
    if ([51, 56, 61, 66, 71, 80, 85].includes(code)) return 0.35;
    if ([55, 57, 65, 67, 75, 77, 82, 86, 96, 97, 99].includes(code)) return 1;
    return 0.65;
  }

  /* The photograph's look for each sky: brightness, saturation, contrast. Night darkens it further. */
  const LOOK = {
    clear: [1, 1, 1],
    overcast: [0.84, 0.55, 0.95],
    fog: [0.94, 0.42, 0.8],
    rain: [0.72, 0.6, 0.95],
    snow: [0.96, 0.55, 0.9],
    storm: [0.58, 0.5, 1],
  };

  /* The line under the hint: [English, as a phrase that fits "It's ___ in Nanjing"; Chinese]. */
  const CAPTION = {
    rain: ["raining", "正在下雨，画面里也在下。"],
    snow: ["snowing", "正在下雪，画面里也在下。"],
    storm: ["storming", "有雷阵雨，画面里也是。"],
    fog: ["foggy", "起雾了，画面里也是。"],
    overcast: ["overcast", "阴天，画面里也阴着。"],
    night: ["night", "已经入夜，画面里也是夜晚。"],
  };

  let weather = null; // { code, isDay, here }
  let mode = "clear";
  let parts = [];
  let W = 0;
  let H = 0;
  let DPR = 1;
  let photoH = 0;
  let running = false;
  let visible = true;
  let last = 0;
  let flashAt = 0;

  function caption() {
    if (!note) return;
    const key = mode === "clear" ? (weather && !weather.isDay ? "night" : "") : mode;
    if (!key) {
      note.hidden = true;
      return;
    }
    const [en, cn] = CAPTION[key];
    const here = weather.here;
    note.textContent = zh()
      ? `${here ? "你那里" : "南京"}${cn}`
      : `It's ${en} ${here ? "where you are" : "in Nanjing"} right now, so it's ${en} here too.`;
    note.hidden = false;
  }

  function size() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    W = chamber.clientWidth;
    H = chamber.clientHeight;
    photoH = photo.getBoundingClientRect().height || H * 0.58;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  function seed() {
    const area = (W * H) / (1440 * 900);
    const amt = weather ? amount(weather.code) : 0.5;
    parts = [];
    if (mode === "rain" || mode === "storm") {
      const n = Math.round((60 + 260 * amt) * area);
      for (let i = 0; i < n; i++) {
        parts.push({ x: rand(-0.1, 1.05) * W, y: rand(0, 1) * H, len: rand(12, 26), v: rand(900, 1350) });
      }
    } else if (mode === "snow") {
      const n = Math.round((50 + 170 * amt) * area);
      for (let i = 0; i < n; i++) {
        parts.push({ x: rand(0, 1) * W, y: rand(0, 1) * H, r: rand(0.8, 2.6), v: rand(22, 62), a: rand(10, 32), f: rand(0.25, 0.7), p: rand(0, 6.3) });
      }
    }
  }

  /* Still things: stars and the moon on a clear night, haze in fog. */
  function still() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (mode === "clear" && weather && !weather.isDay) {
      const n = Math.round((W * photoH * 0.4) / 2600);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * W;
        const y = Math.pow(Math.random(), 1.5) * photoH * 0.4;
        const r = Math.random() < 0.08 ? rand(1, 1.5) : rand(0.4, 0.9);
        ctx.globalAlpha = rand(0.35, 0.95);
        ctx.fillStyle = Math.random() < 0.25 ? "#cfe0ff" : "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // the moon, high on the right, with a soft glow
      const mx = W * 0.86;
      const my = Math.max(photoH * 0.25, 110);
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 70);
      glow.addColorStop(0, "rgba(236, 239, 247, 0.28)");
      glow.addColorStop(1, "rgba(236, 239, 247, 0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(mx - 70, my - 70, 140, 140);
      ctx.fillStyle = "#f3f1e6";
      ctx.beginPath();
      ctx.arc(mx, my, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    if (mode === "fog") {
      // thickest low over the mountains, thinning out above and fading before the name
      const top = photoH * 0.15;
      const bottom = Math.min(H, photoH * 1.12);
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, "rgba(214, 219, 232, 0)");
      g.addColorStop(0.45, "rgba(214, 219, 232, 0.22)");
      g.addColorStop(0.72, "rgba(214, 219, 232, 0.26)");
      g.addColorStop(1, "rgba(214, 219, 232, 0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, top, W, bottom - top);
    }
    ctx.globalAlpha = 1;
  }

  function draw(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (mode === "rain" || mode === "storm") {
      ctx.strokeStyle = "rgba(205, 215, 240, 0.34)";
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const d of parts) {
        d.y += d.v * dt;
        d.x += d.v * dt * 0.16;
        if (d.y > H) {
          d.y -= H + d.len;
          d.x = rand(-0.1, 1.05) * W;
        }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.16, d.y - d.len);
      }
      ctx.stroke();
    } else if (mode === "snow") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.beginPath();
      for (const f of parts) {
        f.y += f.v * dt;
        f.p += f.f * dt * 2 * Math.PI;
        if (f.y > H + 4) {
          f.y = -4;
          f.x = Math.random() * W;
        }
        const x = f.x + Math.sin(f.p) * f.a;
        ctx.moveTo(x + f.r, f.y);
        ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  function lightning(t) {
    if (mode !== "storm" || reduce.matches) return;
    if (!flashAt) flashAt = t + rand(4, 9);
    if (t >= flashAt) {
      chamber.classList.add("is-flash");
      setTimeout(() => chamber.classList.remove("is-flash"), 110);
      flashAt = t + rand(7, 15);
    }
  }

  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, t - last || 0.016);
    last = t;
    if (!running) return;
    draw(dt);
    lightning(t);
    requestAnimationFrame(frame);
  }

  function animated() {
    return (mode === "rain" || mode === "storm" || mode === "snow") && !reduce.matches;
  }

  function play() {
    const should = animated() && visible && !document.hidden;
    if (should && !running) {
      running = true;
      last = performance.now() / 1000;
      requestAnimationFrame(frame);
    } else if (!should) {
      running = false;
    }
  }

  function apply() {
    if (!weather) return;
    mode = kind(weather.code);
    const [b, s, c] = LOOK[mode];
    const night = !weather.isDay;
    photo.style.filter = `brightness(${(b * (night ? 0.45 : 1)).toFixed(3)}) saturate(${(s * (night ? 0.8 : 1)).toFixed(3)}) contrast(${c})`;
    chamber.dataset.sky = (night ? "night " : "") + mode;
    size();
    seed();
    still();
    if (mode === "rain" || mode === "storm" || mode === "snow") {
      if (reduce.matches) draw(0); // one still picture of it
      play();
    } else {
      running = false;
    }
    caption();
  }

  document.addEventListener("site:weather", (event) => {
    const d = event.detail;
    const changed = !weather || d.code !== weather.code || d.isDay !== weather.isDay || d.here !== weather.here;
    weather = d;
    if (changed) apply();
    else caption();
  });
  if (window.__siteWeather) {
    weather = window.__siteWeather;
    apply();
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!weather) return;
      size();
      seed();
      still();
      if (reduce.matches) draw(0);
    }, 150);
  });
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    play();
  }).observe(chamber);
  document.addEventListener("visibilitychange", play);
  reduce.addEventListener("change", apply);
})();
