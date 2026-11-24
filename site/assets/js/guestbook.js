/*
 * Guestbook for tqzhaone.github.io.
 *
 * Messages are kept by a Twikoo backend (an open-source comment system) and read and written over
 * its HTTP API. Each message is drawn as an emitter that was excited when it was posted and has
 * been fading ever since, on the same radiance colour table as the opening screen. The plot above
 * the list puts every message on that afterglow decay curve: newer messages sit high and hot,
 * older ones low and violet, and likes push a message back up.
 */
(function () {
  "use strict";

  const section = document.querySelector("[data-guestbook]");
  if (!section) return;

  const API = (section.dataset.api || "").trim();
  const THREAD = "/guestbook/"; // every guestbook message is filed under this path in Twikoo
  const TOKEN_KEY = "twikoo-access-token"; // same key as the official client, so an admin sign-in carries over
  const VISITOR_KEY = "guestbook-visitor";
  const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lang = () => (root.getAttribute("data-lang") === "zh" ? "zh" : "en");
  const locale = () => (lang() === "zh" ? "zh-CN" : "en");

  /* Words ----------------------------------------------------------------------------------------- */

  const S = {
    owner: ["Owner", "博主"],
    pinned: ["Pinned", "置顶"],
    reply: ["Reply", "回复"],
    like: ["Like", "赞"],
    del: ["Delete", "删除"],
    delAsk: ["Delete this message?", "删除这条留言？"],
    keep: ["Keep", "保留"],
    to: ["To", "回复"],
    pending: ["Waiting for approval. Only you can see it for now.", "等待审核，目前只有你能看到。"],
    hidden: ["Hidden from visitors.", "访客看不到这条留言。"],
    loading: ["Loading messages…", "正在加载留言……"],
    empty: ["No messages yet. Write the first one.", "还没有留言，来写第一条吧。"],
    loadFail: ["Messages couldn't be loaded. The server may be waking up, so try again in a moment.", "留言没能加载出来。服务器可能正在启动，请稍后再试。"],
    moreFail: ["Older messages couldn't be loaded. Try again.", "更早的留言没能加载出来，请再试一次。"],
    actionFail: ["That didn't go through. Try again.", "操作没有成功，请再试一次。"],
    retry: ["Try again", "重试"],
    notConnected: ["The guestbook isn't connected to its server yet.", "留言板还没有接入服务器。"],
    more: ["Show older messages", "查看更早的留言"],
    moreBusy: ["Loading…", "正在加载……"],
    post: ["Post message", "发布留言"],
    postReply: ["Post reply", "发布回复"],
    posting: ["Posting…", "正在发布……"],
    posted: ["Posted.", "已发布。"],
    postedPending: ["Posted. It will appear for others once approved.", "已提交，审核通过后其他人才能看到。"],
    deleted: ["Message deleted.", "留言已删除。"],
    needText: ["Write a message first.", "请先写点内容。"],
    needNick: ["Add your name so people know who wrote it.", "请填写称呼。"],
    badMail: ["Check the email address.", "邮箱格式不对，请检查一下。"],
    badLink: ["Check the website address. It should look like https://example.com.", "个人主页地址不对，应该类似 https://example.com。"],
    tooLong: ["Your message is {n} characters over the limit.", "留言超出了 {n} 个字。"],
    netFail: ["Your message wasn't posted because the server couldn't be reached. Check your connection and try again.", "留言没有发出：连接不上服务器。请检查网络后重试。"],
    failed: ["Your message wasn't posted: {m}", "留言没有发出：{m}"],
    justNow: ["just now", "刚刚"],
  };

  // Twikoo answers in Chinese; these are the refusals a visitor can run into.
  const REFUSALS = [
    [/发言频率过高|请求过于频繁/, ["You're posting too quickly. Wait a few minutes and try again.", "发言太频繁了，请过几分钟再试。"]],
    [/太火爆/, ["A lot of people are posting right now. Try again in a few minutes.", "现在留言的人比较多，请过几分钟再试。"]],
    [/过长/, ["Your message is too long. Shorten it and try again.", "留言太长了，请删减后再试。"]],
    [/屏蔽词|违禁词/, ["Your message contains a word that isn't allowed. Edit it and try again.", "留言里有不允许使用的词，请修改后再试。"]],
    [/邮箱格式/, S.badMail],
    [/博主身份/, ["That email belongs to the site owner. Use your own email or leave it blank.", "这个邮箱是博主的。请填写你自己的邮箱，或者留空。"]],
    [/验证码/, ["Posting needs a captcha, which this page doesn't support. Please email me instead.", "发布需要验证码，这个页面不支持。请改用邮件联系我。"]],
  ];

  const say = (pair, vars) => {
    let text = pair[lang() === "zh" ? 1 : 0];
    if (vars) Object.keys(vars).forEach((key) => (text = text.split(`{${key}}`).join(String(vars[key]))));
    return text;
  };

  const countText = (n) => (lang() === "zh" ? `${n} 条留言` : n === 1 ? "1 message" : `${n} messages`);

  /* Small helpers ----------------------------------------------------------------------------------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Both languages at once; the page's language switch shows one of them.
  function bi(pair) {
    const frag = document.createDocumentFragment();
    const en = el("span", "", pair[0]);
    en.dataset.l = "en";
    const zh = el("span", "", pair[1]);
    zh.dataset.l = "zh";
    zh.lang = "zh-CN";
    frag.append(en, zh);
    return frag;
  }

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        // Storage is unavailable (private mode); nothing is remembered between visits.
      }
    },
  };

  const smooth = () => (reduceMotion.matches ? "auto" : "smooth");

  function safeUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return "";
    try {
      return new URL(value).href;
    } catch (error) {
      return "";
    }
  }

  /* Server ------------------------------------------------------------------------------------------ */

  class GuestbookError extends Error {
    constructor(message, network) {
      super(message);
      this.network = network;
    }
  }

  async function call(event, data) {
    const payload = Object.assign({ event }, data);
    const token = store.get(TOKEN_KEY);
    if (token) payload.accessToken = token;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : 0;
    let response;
    try {
      response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        signal: controller ? controller.signal : undefined,
      });
    } catch (error) {
      throw new GuestbookError(error && error.message ? error.message : String(error), true);
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429) throw new GuestbookError("请求过于频繁", false);
    if (!response.ok) throw new GuestbookError(`HTTP ${response.status}`, true);
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new GuestbookError("Unreadable response", true);
    }
    if (!result || typeof result !== "object") throw new GuestbookError("Unreadable response", true);
    // An anonymous visitor gets a token on the first reply; it marks their own messages and likes.
    if (typeof result.accessToken === "string" && result.accessToken) store.set(TOKEN_KEY, result.accessToken);
    if (result.code) throw new GuestbookError(String(result.message || result.code), false);
    return result;
  }

  function refusal(error) {
    if (error.network) return say(S.netFail);
    const raw = error.message || "";
    for (const [pattern, pair] of REFUSALS) if (pattern.test(raw)) return say(pair);
    return say(S.failed, { m: raw });
  }

  /* The afterglow model ----------------------------------------------------------------------------- */

  // Glow falls off as a power law, I(t) = (1 + t / 10 min)^-0.35: bright for the first minutes,
  // then a long, slow tail, so even a two-year-old message still shows faintly.
  const TAU = 600;
  const POWER = 0.35;
  const T_MIN = 60;
  const T_MAX = 2 * 365.25 * 86400;
  const LOG_MIN = Math.log10(T_MIN);
  const LOG_SPAN = Math.log10(T_MAX) - LOG_MIN;
  const Y_LOW = -2.1;
  const Y_HIGH = 0.08;

  const glowAt = (seconds) => Math.pow(1 + Math.max(0, seconds) / TAU, -POWER);
  const ageOf = (c, now) => Math.max(0, (now - c.created) / 1000);
  // Each like recharges a message a little.
  const intensity = (c, now) => Math.min(1, glowAt(ageOf(c, now)) * (1 + 0.6 * Math.log1p(c.ups || 0)));
  const xOf = (seconds) => (Math.log10(Math.min(T_MAX, Math.max(T_MIN, seconds))) - LOG_MIN) / LOG_SPAN;
  const yOf = (value) => (Math.log10(Math.max(value, 1e-3)) - Y_LOW) / (Y_HIGH - Y_LOW);
  const levelOf = (value) => Math.min(1, Math.max(0, (Math.log10(Math.max(value, 1e-3)) + 2) / 2));

  // Radiance colour table, low to high (the same stops as site.js and --lut in site.css).
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
        return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k));
      }
    }
    return STOPS[STOPS.length - 1][1].slice();
  }

  const colourOf = (value) => lut(levelOf(value)).join(" ");

  /* Elements ---------------------------------------------------------------------------------------- */

  const $ = (selector) => section.querySelector(selector);
  const plot = $("[data-gb-plot]");
  const pointsBox = $("[data-gb-points]");
  const tip = $("[data-gb-tip]");
  const form = $("[data-gb-form]");
  const textarea = form.querySelector("#gb-text");
  const nickInput = form.querySelector("#gb-nick");
  const mailInput = form.querySelector("#gb-mail");
  const linkInput = form.querySelector("#gb-link");
  const honeypot = form.querySelector("#gb-company");
  const meter = form.querySelector(".gb-meter");
  const chars = $("[data-gb-chars]");
  const postButton = $("[data-gb-post]");
  const formStatus = $("[data-gb-status]");
  const replying = $("[data-gb-replying]");
  const replyNick = $("[data-gb-reply-nick]");
  const ownerNote = $("[data-gb-owner]");
  const list = $("[data-gb-list]");
  const total = $("[data-gb-total]");
  const stateLine = $("[data-gb-state]");
  const moreButton = $("[data-gb-more]");

  const state = {
    started: false,
    loaded: false,
    failed: false,
    configLoaded: false,
    config: {},
    admin: false,
    limit: 500,
    items: [], // top-level messages, pinned first, then newest first
    count: 0,
    more: false,
    pages: 0,
    loadingMore: false,
    posting: false,
    replyTo: null, // { id, rid, nick }
  };

  const entries = new Map(); // message id -> { c, parent }
  const points = new Map(); // message id -> point on the plot

  /* Plot -------------------------------------------------------------------------------------------- */

  function drawCurve() {
    let d = "";
    for (let k = 0; k <= 120; k++) {
      const f = k / 120;
      const y = 1 - yOf(glowAt(Math.pow(10, LOG_MIN + f * LOG_SPAN)));
      d += `${k ? "L" : "M"}${(f * 1000).toFixed(1)} ${(y * 1000).toFixed(1)}`;
    }
    plot.querySelector("[data-gb-line]").setAttribute("d", d);
    plot.querySelector("[data-gb-fill]").setAttribute("d", `${d}L1000 1000L0 1000Z`);
    const gradient = plot.querySelector("[data-gb-stops]");
    for (let k = 0; k <= 12; k++) {
      const f = k / 12;
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", f.toFixed(3));
      stop.setAttribute("stop-color", `rgb(${lut(levelOf(glowAt(Math.pow(10, LOG_MIN + f * LOG_SPAN)))).join(",")})`);
      gradient.append(stop);
    }
    plot.querySelectorAll(".gb-tick").forEach((tick) => {
      tick.style.left = `${(xOf(Number(tick.dataset.s)) * 100).toFixed(2)}%`;
    });
  }

  function placePoint(point, c, now) {
    const value = intensity(c, now);
    point.style.left = `${(xOf(ageOf(c, now)) * 100).toFixed(2)}%`;
    point.style.top = `${((1 - yOf(value)) * 100).toFixed(2)}%`;
    point.style.setProperty("--c", colourOf(value));
    point.style.setProperty("--i", value.toFixed(3));
  }

  function renderPoints() {
    pointsBox.textContent = "";
    points.clear();
    const now = Date.now();
    // Oldest first, so newer (brighter) points are drawn on top.
    Array.from(entries.values())
      .sort((a, b) => a.c.created - b.c.created)
      .forEach(({ c, parent }) => {
        const point = el("span", parent ? "gb-pt gb-pt--reply" : "gb-pt");
        point.dataset.id = c.id;
        placePoint(point, c, now);
        pointsBox.append(point);
        points.set(c.id, point);
      });
  }

  function showTip(point) {
    const entry = entries.get(point.dataset.id);
    if (!entry) return;
    tip.textContent = "";
    tip.append(el("b", "", entry.c.nick || ""), el("span", "", relative(entry.c.created)));
    tip.hidden = false;
    const box = pointsBox.getBoundingClientRect();
    const x = (parseFloat(point.style.left) / 100) * box.width;
    const y = (parseFloat(point.style.top) / 100) * box.height;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(x, half - 30), box.width - half + 12).toFixed(1)}px`;
    tip.style.top = `${y.toFixed(1)}px`;
    tip.classList.toggle("is-below", y < tip.offsetHeight + 18);
  }

  function hideTip() {
    tip.hidden = true;
  }

  // The curve is traced once, the first time the plot comes into view, and each message lights
  // up as the trace reaches it.
  let plotSeen = false;
  let introDone = false;
  let introTimer = 0;

  function maybeIntro() {
    if (introDone || !plotSeen) return;
    if (!state.loaded && !state.failed) {
      if (!introTimer) introTimer = setTimeout(() => runIntro(), 1400);
      return;
    }
    runIntro();
  }

  function runIntro() {
    if (introDone) return;
    introDone = true;
    clearTimeout(introTimer);
    plot.classList.remove("is-waiting");
    if (reduceMotion.matches) return;
    const trace = 1500;
    plot.classList.add("is-tracing");
    points.forEach((point) => ignite(point, (parseFloat(point.style.left) / 100) * trace));
    setTimeout(() => plot.classList.remove("is-tracing"), trace + 200);
  }

  function ignite(point, delay) {
    if (!point.animate || reduceMotion.matches) return;
    point.animate(
      [
        { opacity: 0, scale: 0.3, filter: "brightness(2.4)" },
        { opacity: 1, scale: 2, filter: "brightness(2.2) saturate(0.5)", offset: 0.2 },
        { opacity: 1, scale: 1, filter: "brightness(1) saturate(1)" },
      ],
      { duration: 1300, delay, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "backwards" }
    );
  }

  new IntersectionObserver(
    (seen) => {
      if (seen.some((entry) => entry.isIntersecting)) {
        plotSeen = true;
        maybeIntro();
      }
    },
    { threshold: 0.6 }
  ).observe(plot);

  /* Messages ---------------------------------------------------------------------------------------- */

  const BLOCK = new Set(["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "NOSCRIPT", "TEXTAREA", "SELECT", "BUTTON", "INPUT", "FORM", "VIDEO", "AUDIO", "CANVAS", "LINK", "META", "HEAD", "TITLE"]);
  const KEEP = new Set(["P", "BR", "A", "STRONG", "B", "EM", "I", "CODE", "PRE", "BLOCKQUOTE", "UL", "OL", "LI", "DEL", "S", "SUB", "SUP"]);

  // The server cleans what it stores; this copies only plain formatting into the page as well.
  function clean(html) {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");
    const out = document.createDocumentFragment();
    const walk = (from, into) => {
      from.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          into.append(node.textContent);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE || BLOCK.has(node.tagName)) return;
        if (node.tagName === "IMG") {
          const alt = node.getAttribute("alt");
          if (alt) into.append(alt);
          return;
        }
        if (!KEEP.has(node.tagName)) {
          walk(node, into);
          return;
        }
        let copy;
        if (node.tagName === "A") {
          const href = safeUrl(node.getAttribute("href"));
          if (!href) {
            walk(node, into);
            return;
          }
          copy = el("a");
          copy.href = href;
          copy.rel = "nofollow ugc noopener noreferrer";
          copy.target = "_blank";
        } else {
          copy = document.createElement(node.tagName.toLowerCase());
        }
        walk(node, copy);
        into.append(copy);
      });
    };
    walk(doc.body, out);
    return out;
  }

  // What a visitor types becomes paragraphs, line breaks and links, nothing else.
  function toHtml(text) {
    const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const line = (s) => {
      let out = "";
      let last = 0;
      s.replace(/https?:\/\/[^\s<>"'，。；：！？、）】》]+/g, (match, offset) => {
        const url = match.replace(/[.,;:!?)\]]+$/, "");
        out += `${escape(s.slice(last, offset))}<a href="${escape(url)}">${escape(url)}</a>`;
        last = offset + url.length;
        return match;
      });
      return out + escape(s.slice(last));
    };
    return text
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map((para) => `<p>${para.split("\n").map(line).join("<br>")}</p>`)
      .join("");
  }

  function relative(ts) {
    const seconds = Math.round((Date.now() - ts) / 1000);
    if (seconds < 45) return say(S.justNow);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    if (typeof Intl.RelativeTimeFormat === "function" && days < 30) {
      const format = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
      if (minutes < 60) return format.format(-minutes, "minute");
      if (hours < 24) return format.format(-hours, "hour");
      return format.format(-days, "day");
    }
    return new Intl.DateTimeFormat(locale(), { year: "numeric", month: "short", day: "numeric" }).format(new Date(ts));
  }

  const fullTime = (ts) => new Intl.DateTimeFormat(locale(), { dateStyle: "long", timeStyle: "short" }).format(new Date(ts));

  function tint(node, c, now) {
    const value = intensity(c, now);
    node.style.setProperty("--c", colourOf(value));
    node.style.setProperty("--i", value.toFixed(3));
  }

  const SPARK =
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 .6c.55 3.75 2.1 6.3 7.4 7.4-5.3 1.1-6.85 3.65-7.4 7.4C7.45 11.65 5.9 9.1.6 8 5.9 6.9 7.45 4.35 8 .6z"/></svg>';

  function fillLike(button, c) {
    button.textContent = "";
    button.insertAdjacentHTML("beforeend", SPARK);
    button.append(bi(S.like));
    if (c.ups) button.append(el("span", "gb-n", String(c.ups)));
    button.setAttribute("aria-pressed", String(!!c.liked));
  }

  function actionButton(act, pair, extra) {
    const button = el("button", `gb-act${extra ? ` ${extra}` : ""}`);
    button.type = "button";
    button.dataset.act = act;
    if (pair) button.append(bi(pair));
    return button;
  }

  function messageEl(c, parent, now) {
    const item = el("li", parent ? "gb-msg gb-msg--reply" : "gb-msg");
    if (SAFE_ID.test(c.id)) item.id = c.id;
    item.dataset.id = c.id;
    tint(item, c, now);

    const dot = el("span", "gb-dot");
    dot.setAttribute("aria-hidden", "true");

    const head = el("p", "gb-msg__head");
    const site = safeUrl(c.link);
    const nick = el(site ? "a" : "span", "gb-nick", c.nick || "");
    if (site) {
      nick.href = site;
      nick.rel = "nofollow ugc noopener noreferrer";
      nick.target = "_blank";
    }
    head.append(nick);
    if (c.master) {
      const badge = el("span", "badge badge--owner");
      if (typeof state.config.MASTER_TAG === "string" && state.config.MASTER_TAG) badge.textContent = state.config.MASTER_TAG;
      else badge.append(bi(S.owner));
      head.append(badge);
    }
    if (c.top && !parent) {
      const badge = el("span", "badge");
      badge.append(bi(S.pinned));
      head.append(badge);
    }
    if (Number.isFinite(c.created)) {
      const when = el("a", "gb-time");
      when.href = `#${c.id}`;
      const time = el("time");
      time.dateTime = new Date(c.created).toISOString();
      time.dataset.ts = String(c.created);
      time.textContent = relative(c.created);
      when.title = fullTime(c.created);
      when.append(time);
      head.append(when);
    }
    item.append(dot, head);

    if (parent && c.pid && c.pid !== c.rid && c.ruser) {
      const to = el("p", "gb-to");
      to.append(bi(S.to), " ", el("span", "gb-to__nick", c.ruser));
      item.append(to);
    }

    const body = el("div", "gb-msg__body");
    body.append(clean(typeof c.comment === "string" ? c.comment : ""));
    item.append(body);

    if (c.isSpam) {
      const note = el("p", "gb-note");
      note.append(bi(c.isOwner ? S.pending : S.hidden));
      item.append(note);
    }

    const actions = el("div", "gb-actions");
    if (!c.isSpam) {
      actions.append(actionButton("reply", S.reply));
      const like = actionButton("like", null, "gb-like");
      fillLike(like, c);
      actions.append(like);
    }
    if (c.isOwner) actions.append(actionButton("delete", S.del, "gb-del"));
    if (actions.childNodes.length) item.append(actions);

    if (!parent && c.replies.length) {
      const replies = el("ol", "gb-replies");
      c.replies.forEach((r) => replies.append(messageEl(r, c, now)));
      item.append(replies);
    }

    entries.set(c.id, { c, parent });
    return item;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
    const c = Object.assign({}, raw);
    c.created = Number(c.created);
    c.ups = Number(c.ups) || 0;
    c.nick = typeof c.nick === "string" ? c.nick : "";
    c.replies = Array.isArray(raw.replies) ? raw.replies.map(normalize).filter(Boolean) : [];
    return c;
  }

  function merge(raw) {
    const byId = new Map(state.items.map((c) => [c.id, c]));
    (Array.isArray(raw) ? raw : []).map(normalize).filter(Boolean).forEach((c) => byId.set(c.id, c));
    state.items = Array.from(byId.values()).sort((a, b) => Number(b.top === true) - Number(a.top === true) || b.created - a.created);
  }

  function render() {
    entries.clear();
    list.textContent = "";
    const now = Date.now();
    state.items.forEach((c) => list.append(messageEl(c, null, now)));
    total.textContent = state.loaded && state.count ? countText(state.count) : "";
    moreButton.hidden = !state.more;
    renderPoints();
    markReplyTarget();
    if (state.loaded) showState(state.items.length ? null : S.empty);
  }

  function refreshGlow() {
    const now = Date.now();
    entries.forEach(({ c }) => {
      const item = document.getElementById(c.id);
      if (item) tint(item, c, now);
      const point = points.get(c.id);
      if (point) placePoint(point, c, now);
    });
    list.querySelectorAll("time[data-ts]").forEach((time) => {
      const ts = Number(time.dataset.ts);
      time.textContent = relative(ts);
      time.parentElement.title = fullTime(ts);
    });
  }

  function showState(pair, kind, retry) {
    stateLine.textContent = "";
    stateLine.className = `gb-state${kind ? ` is-${kind}` : ""}`;
    if (!pair) return;
    stateLine.append(bi(pair));
    if (retry) {
      const button = el("button", "chip gb-retry");
      button.type = "button";
      button.append(bi(S.retry));
      button.addEventListener("click", () => load());
      stateLine.append(" ", button);
    }
  }

  /* Light: hovering a message lights its point, and the other way round. A strong excitation
     (a new or linked message) flashes and sends out a ring, like the lamp switching on. */

  let litId = null;

  function lightUp(id) {
    if (id === litId) return;
    if (litId) {
      const before = document.getElementById(litId);
      if (before) before.classList.remove("is-lit");
      const point = points.get(litId);
      if (point) point.classList.remove("is-lit");
    }
    litId = id;
    if (!id) return;
    const item = document.getElementById(id);
    if (item) item.classList.add("is-lit");
    const point = points.get(id);
    if (point) point.classList.add("is-lit");
  }

  const FLASH = [
    { scale: 2.3, filter: "brightness(2.3) saturate(0.4)" },
    { scale: 1.6, filter: "brightness(1.7) saturate(0.7)", offset: 0.14 },
    { scale: 1.15, filter: "brightness(1.2) saturate(0.95)", offset: 0.42 },
    { scale: 1, filter: "brightness(1) saturate(1)" },
  ];

  function excite(id, strong) {
    if (reduceMotion.matches) return;
    const item = document.getElementById(id);
    const point = points.get(id);
    const dot = item && item.querySelector(":scope > .gb-dot");
    const timing = { duration: strong ? 2800 : 1500, easing: "cubic-bezier(0.15, 0.75, 0.3, 1)" };
    [dot, point].forEach((node) => node && node.animate && node.animate(FLASH, timing));
    if (!strong) return;
    if (point && point.animate) {
      const ring = el("span", "gb-ring");
      ring.style.left = point.style.left;
      ring.style.top = point.style.top;
      pointsBox.append(ring);
      ring.animate([{ scale: 0.4, opacity: 0.9 }, { scale: 5, opacity: 0 }], { duration: 1100, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)" }).onfinish = () => ring.remove();
    }
    if (item) {
      item.classList.remove("is-fresh");
      void item.offsetWidth; // restart the animation
      item.classList.add("is-fresh");
      item.addEventListener("animationend", () => item.classList.remove("is-fresh"), { once: true });
    }
  }

  function reveal(id) {
    const item = document.getElementById(id);
    if (!item) return;
    // Scroll only when the start of the message is off screen, so the plot stays in view if it can.
    const box = item.getBoundingClientRect();
    const visible = box.top >= 80 && box.top <= window.innerHeight - 90;
    if (!visible) item.scrollIntoView({ block: "center", behavior: smooth() });
    setTimeout(() => excite(id, true), visible || reduceMotion.matches ? 0 : 450);
  }

  pointsBox.addEventListener("pointerover", (event) => {
    const point = event.target.closest(".gb-pt");
    if (!point) return;
    lightUp(point.dataset.id);
    showTip(point);
  });
  pointsBox.addEventListener("pointerout", (event) => {
    const point = event.target.closest(".gb-pt");
    if (!point || (event.relatedTarget && point.contains(event.relatedTarget))) return;
    lightUp(null);
    hideTip();
  });
  pointsBox.addEventListener("click", (event) => {
    const point = event.target.closest(".gb-pt");
    if (point) reveal(point.dataset.id);
  });

  list.addEventListener("pointerover", (event) => {
    const item = event.target.closest(".gb-msg");
    lightUp(item ? item.dataset.id : null);
  });
  list.addEventListener("pointerleave", () => lightUp(null));
  list.addEventListener("focusin", (event) => {
    const item = event.target.closest(".gb-msg");
    if (item) lightUp(item.dataset.id);
  });
  list.addEventListener("focusout", (event) => {
    if (!list.contains(event.relatedTarget)) lightUp(null);
  });

  /* Actions on a message ------------------------------------------------------------------------------ */

  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const item = button.closest(".gb-msg");
    const entry = item && entries.get(item.dataset.id);
    if (!entry) return;
    const act = button.dataset.act;
    if (act === "reply") startReply(entry);
    else if (act === "like") like(entry, button);
    else if (act === "delete") askDelete(item);
    else if (act === "delete-no") closeDelete(item, true);
    else if (act === "delete-yes") removeMessage(entry, item, button);
  });

  function inlineError(item, pair) {
    const actions = item.querySelector(":scope > .gb-actions");
    let note = item.querySelector(":scope > .gb-oops");
    if (!note) {
      note = el("p", "gb-oops");
      note.setAttribute("role", "status");
      (actions || item.lastElementChild).after(note);
    }
    note.textContent = say(pair);
    clearTimeout(note.timer);
    note.timer = setTimeout(() => note.remove(), 6000);
  }

  async function like(entry, button) {
    const c = entry.c;
    const was = !!c.liked;
    const apply = (liked) => {
      c.liked = liked;
      c.ups = Math.max(0, (c.ups || 0) + (liked ? 1 : -1));
      fillLike(button, c);
      const item = button.closest(".gb-msg");
      tint(item, c, Date.now());
      const point = points.get(c.id);
      if (point) placePoint(point, c, Date.now());
    };
    apply(!was);
    if (!was) excite(c.id, false);
    try {
      await call("COMMENT_LIKE", { id: c.id, type: "up" });
    } catch (error) {
      apply(was);
      inlineError(button.closest(".gb-msg"), S.actionFail);
    }
  }

  function askDelete(item) {
    const actions = item.querySelector(":scope > .gb-actions");
    if (!actions || item.querySelector(":scope > .gb-confirm")) return;
    const confirm = el("div", "gb-confirm");
    confirm.append(el("span", "", ""), actionButton("delete-yes", S.del, "gb-del"), actionButton("delete-no", S.keep));
    confirm.firstChild.append(bi(S.delAsk));
    actions.hidden = true;
    actions.after(confirm);
    confirm.querySelector('[data-act="delete-no"]').focus();
  }

  function closeDelete(item, refocus) {
    const confirm = item.querySelector(":scope > .gb-confirm");
    if (confirm) confirm.remove();
    const actions = item.querySelector(":scope > .gb-actions");
    if (actions) {
      actions.hidden = false;
      if (refocus) {
        const del = actions.querySelector('[data-act="delete"]');
        if (del) del.focus();
      }
    }
  }

  async function removeMessage(entry, item, button) {
    button.disabled = true;
    try {
      await call("COMMENT_DELETE_FOR_USER", { id: entry.c.id });
    } catch (error) {
      button.disabled = false;
      closeDelete(item, true);
      inlineError(item, S.actionFail);
      return;
    }
    if (entry.parent) {
      entry.parent.replies = entry.parent.replies.filter((r) => r.id !== entry.c.id);
    } else {
      state.items = state.items.filter((c) => c.id !== entry.c.id);
      state.count = Math.max(0, state.count - 1);
    }
    if (state.replyTo && (state.replyTo.id === entry.c.id || state.replyTo.rid === entry.c.id)) cancelReply();
    render();
    list.focus();
    showStatus(S.deleted, "ok");
  }

  /* Writing ------------------------------------------------------------------------------------------- */

  function setPostLabel(busy) {
    postButton.textContent = "";
    postButton.append(bi(busy ? S.posting : state.replyTo ? S.postReply : S.post));
  }

  function showStatus(pair, kind, vars) {
    formStatus.className = `gb-status${kind ? ` is-${kind}` : ""}`;
    formStatus.textContent = pair ? (typeof pair === "string" ? pair : say(pair, vars)) : "";
  }

  function markReplyTarget() {
    list.querySelectorAll(".gb-msg.is-target").forEach((node) => node.classList.remove("is-target"));
    if (!state.replyTo) return;
    const target = document.getElementById(state.replyTo.id);
    if (target) target.classList.add("is-target");
  }

  function startReply(entry) {
    const { c, parent } = entry;
    state.replyTo = { id: c.id, rid: parent ? parent.id : c.id, nick: c.nick };
    replyNick.textContent = c.nick;
    replying.hidden = false;
    setPostLabel(false);
    markReplyTarget();
    showStatus(null);
    textarea.focus({ preventScroll: true });
    replying.scrollIntoView({ block: "nearest", behavior: smooth() });
  }

  function cancelReply() {
    state.replyTo = null;
    replying.hidden = true;
    setPostLabel(false);
    markReplyTarget();
  }

  replying.querySelector("[data-gb-cancel]").addEventListener("click", () => {
    cancelReply();
    textarea.focus();
  });

  function updateChars() {
    const n = textarea.value.length;
    const limited = Number.isFinite(state.limit);
    const scale = limited ? state.limit : 500;
    chars.textContent = limited ? `${n} / ${state.limit}` : "";
    chars.classList.toggle("is-over", limited && n > state.limit);
    // The bar under the box fills along the colour table as the message grows.
    meter.style.setProperty("--fill", `${Math.min(100, (n / scale) * 100).toFixed(1)}%`);
    meter.classList.toggle("is-over", limited && n > state.limit);
  }

  function invalid(input, pair, vars) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
    showStatus(pair, "error", vars);
    return false;
  }

  form.addEventListener("input", (event) => {
    // Editing the field that was flagged clears the complaint about it.
    if (event.target.getAttribute("aria-invalid")) {
      event.target.removeAttribute("aria-invalid");
      if (formStatus.classList.contains("is-error")) showStatus(null);
    }
    if (event.target === textarea) updateChars();
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else postButton.click();
    }
  });

  function restoreVisitor() {
    try {
      const visitor = JSON.parse(store.get(VISITOR_KEY) || "{}");
      nickInput.value = typeof visitor.nick === "string" ? visitor.nick : "";
      mailInput.value = typeof visitor.mail === "string" ? visitor.mail : "";
      linkInput.value = typeof visitor.link === "string" ? visitor.link : "";
    } catch (error) {
      // Nothing usable was stored.
    }
  }

  function saveVisitor(nick, mail, link) {
    store.set(VISITOR_KEY, JSON.stringify({ nick, mail, link }));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.posting) return;
    [textarea, nickInput, mailInput, linkInput].forEach((input) => input.removeAttribute("aria-invalid"));
    if (!API) return showStatus(S.notConnected, "error");

    const text = textarea.value.trim();
    const nick = nickInput.value.trim();
    const mail = mailInput.value.trim();
    let link = linkInput.value.trim();
    if (!text) return invalid(textarea, S.needText);
    if (Number.isFinite(state.limit) && text.length > state.limit) return invalid(textarea, S.tooLong, { n: text.length - state.limit });
    if (!nick) return invalid(nickInput, S.needNick);
    if (mail && !EMAIL.test(mail)) return invalid(mailInput, S.badMail);
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    if (link && !safeUrl(link)) return invalid(linkInput, S.badLink);

    // Bots fill in every field, including the hidden one; let them think it worked.
    if (honeypot.value) {
      textarea.value = "";
      updateChars();
      return showStatus(S.posted, "ok");
    }

    const replyTo = state.replyTo;
    const payload = {
      url: THREAD,
      href: `${location.origin}${location.pathname}`,
      title: "Guestbook",
      ua: navigator.userAgent,
      nick,
      mail,
      link,
      comment: toHtml(text),
      markdown: text,
    };
    if (replyTo) {
      payload.pid = replyTo.id;
      payload.rid = replyTo.rid;
    }

    state.posting = true;
    postButton.disabled = true;
    setPostLabel(true);
    showStatus(null);
    let id = "";
    try {
      const result = await call("COMMENT_SUBMIT", payload);
      id = typeof result.id === "string" ? result.id : String(result.id || "");
    } catch (error) {
      state.posting = false;
      postButton.disabled = false;
      setPostLabel(false);
      showStatus(refusal(error), "error");
      return;
    }

    saveVisitor(nick, mail, link);
    linkInput.value = link;
    textarea.value = "";
    updateChars();
    cancelReply();
    await afterPost(replyTo, id, { nick, link, comment: payload.comment });
    state.posting = false;
    postButton.disabled = false;
    setPostLabel(false);
    const posted = entries.get(id);
    showStatus(posted && posted.c.isSpam ? S.postedPending : S.posted, "ok");
    if (posted) reveal(id);
  });

  // Read the thread again, so the new message appears exactly as the server stored it.
  async function afterPost(replyTo, id, typed) {
    let before;
    if (replyTo) {
      const parent = state.items.find((c) => c.id === replyTo.rid);
      if (parent && !parent.top) before = parent.created + 1;
    }
    try {
      const result = await call("COMMENT_GET", before === undefined ? { url: THREAD } : { url: THREAD, before });
      merge(result.data);
      if (typeof result.count === "number") state.count = result.count;
      if (before === undefined && state.pages <= 1) state.more = !!result.more;
      state.loaded = true;
    } catch (error) {
      // The message is saved; show it as typed until the next visit.
      if (!id) return;
      const local = normalize({ id, nick: typed.nick, link: typed.link, comment: typed.comment, created: Date.now(), ups: 0, isOwner: true, replies: [] });
      const parent = replyTo && state.items.find((c) => c.id === replyTo.rid);
      if (parent) parent.replies.push(Object.assign(local, { pid: replyTo.id, rid: replyTo.rid }));
      else {
        state.items.unshift(local);
        state.count += 1;
      }
      state.loaded = true;
    }
    render();
  }

  /* Loading ------------------------------------------------------------------------------------------- */

  async function loadConfig() {
    try {
      const result = await call("GET_CONFIG");
      state.config = result.config && typeof result.config === "object" ? result.config : {};
      state.configLoaded = true;
      state.admin = state.config.IS_ADMIN === true;
      const limit = parseInt(state.config.LIMIT_LENGTH, 10);
      state.limit = Number.isNaN(limit) ? 500 : limit > 0 ? limit : Infinity;
      ownerNote.hidden = !state.admin;
      updateChars();
    } catch (error) {
      // The defaults are fine without the server's settings.
    }
  }

  async function load() {
    if (!API) {
      state.failed = true;
      showState(S.notConnected, "error");
      maybeIntro();
      return;
    }
    state.failed = false;
    showState(S.loading, "loading");
    try {
      let page;
      if (!state.configLoaded && !store.get(TOKEN_KEY)) {
        // First visit: get a visitor token before anything else, so every request uses the same one.
        await loadConfig();
        page = await call("COMMENT_GET", { url: THREAD });
      } else {
        [page] = await Promise.all([call("COMMENT_GET", { url: THREAD }), state.configLoaded ? null : loadConfig()]);
      }
      state.items = [];
      merge(page.data);
      state.count = typeof page.count === "number" ? page.count : state.items.length;
      state.more = !!page.more;
      state.pages = 1;
      state.loaded = true;
      render();
    } catch (error) {
      state.failed = true;
      showState(S.loadFail, "error", true);
    }
    maybeIntro();
  }

  async function loadOlder() {
    if (state.loadingMore) return false;
    const oldest = state.items.filter((c) => !c.top).reduce((min, c) => Math.min(min, c.created), Infinity);
    if (!Number.isFinite(oldest)) return false;
    state.loadingMore = true;
    moreButton.disabled = true;
    moreButton.textContent = "";
    moreButton.append(bi(S.moreBusy));
    let ok = true;
    try {
      const page = await call("COMMENT_GET", { url: THREAD, before: oldest });
      merge(page.data);
      state.more = !!page.more;
      state.pages += 1;
      render();
    } catch (error) {
      ok = false;
      showState(S.moreFail, "error");
    }
    state.loadingMore = false;
    moreButton.disabled = false;
    moreButton.textContent = "";
    moreButton.append(bi(S.more));
    return ok;
  }

  moreButton.addEventListener("click", async () => {
    const count = list.children.length;
    if ((await loadOlder()) && list.children[count]) {
      // Keep keyboard users in place: move to the first message that just arrived.
      const first = list.children[count].querySelector(".gb-time");
      if (first) first.focus({ preventScroll: true });
    }
  });

  // A link to one message (from a reply notification, or a copied time link) is #<message id>.
  const linked = /^#([A-Za-z0-9_-]{8,64})$/.exec(location.hash);
  const linkedId = linked && !document.getElementById(linked[1]) ? linked[1] : null;

  async function start() {
    if (state.started) return;
    state.started = true;
    await load();
    if (!linkedId || !state.loaded) return;
    for (let page = 0; page < 6 && !entries.has(linkedId) && state.more; page++) {
      if (!(await loadOlder())) break;
    }
    if (entries.has(linkedId)) reveal(linkedId);
  }

  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (entries.has(id)) setTimeout(() => excite(id, true), 350);
  });

  /* Start ------------------------------------------------------------------------------------------- */

  function applyLanguage() {
    textarea.placeholder = lang() === "zh" ? textarea.dataset.phZh : textarea.dataset.phEn;
    total.textContent = state.loaded && state.count ? countText(state.count) : "";
    refreshGlow();
    updateChars();
    hideTip();
  }

  drawCurve();
  restoreVisitor();
  setPostLabel(false);
  applyLanguage();
  document.addEventListener("site:lang", applyLanguage);

  // The glow keeps fading while the page is open.
  setInterval(() => {
    if (!document.hidden && state.loaded) refreshGlow();
  }, 30000);

  if (linkedId || location.hash === "#guestbook" || !("IntersectionObserver" in window)) {
    start();
  } else {
    // Messages load only when the guestbook is about to scroll into view.
    const loader = new IntersectionObserver(
      (seen) => {
        if (seen.some((entry) => entry.isIntersecting)) {
          loader.disconnect();
          start();
        }
      },
      { rootMargin: "900px 0px" }
    );
    loader.observe(section);
  }
})();
