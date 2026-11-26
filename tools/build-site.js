#!/usr/bin/env node
/*
 * Builds the News, Blog and Photos pages of tqzhaone.github.io from their content:
 *
 *   site/blog/<post>/index.md   one folder per post, its pictures next to it
 *   site/news/news.json         the news items
 *   site/photos/photos.json     the photos (the files are in site/photos/img/)
 *
 * and writes, inside site/:
 *
 *   blog/index.html, blog/<post>/index.html, blog/posts.json, blog/feed.xml
 *   news/index.html
 *   photos/index.html
 *   publications/index.html (from papers.html and bibtex.json, which tools/build.py writes)
 *   playground/index.html (the Playground page, last in the top bar)
 *   sitemap.xml (the new pages are added)
 *
 * The deploy workflow runs it before publishing site/, so the generated pages are never kept in the
 * repository (see .gitignore). Nothing needs installing: it uses Node's own modules and
 * site/assets/js/blog-render.js, the same Markdown code as the preview on the admin page.
 *
 *   node tools/build-site.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const R = require("../site/assets/js/blog-render.js");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "site");
const BLOG = path.join(SITE, "blog");
const NEWS = path.join(SITE, "news");
const PHOTOS = path.join(SITE, "photos");
const ORIGIN = "https://tqzhaone.github.io";
const AUTHOR = "Tianqi Zhao";
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const RESERVED = new Set(["write", "tag", "tags", "feed", "page", "assets", "posts", "admin"]);

// Comments and read counts use the same Twikoo backend as the guestbook on the home page.
const HOME = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const API = (/data-guestbook[^>]*data-api="([^"]+)"/.exec(HOME) || /data-api="([^"]+)"/.exec(HOME) || [, ""])[1];

const esc = R.esc;
const bi = (en, zh) => `<span data-l="en">${en}</span><span data-l="zh" lang="zh-CN">${zh}</span>`;
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const gitBlobSha = (buf) => crypto.createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
const localPath = (p) => typeof p === "string" && p !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(p) && p.indexOf("..") === -1;

/* Dates ------------------------------------------------------------------------------------------- */

function parseDate(value) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(value || "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Dates are Beijing time.
  return { y, mo, d, iso: `${y}-${pad(mo)}-${pad(d)}`, time: Date.UTC(y, mo - 1, d, h, mi) - 8 * 3600 * 1000 };
}

const dateEn = (d) => `${MONTHS[d.mo - 1]} ${d.d}, ${d.y}`;
const dateZh = (d) => `${d.y} 年 ${d.mo} 月 ${d.d} 日`;
const dateBi = (d) => bi(dateEn(d), dateZh(d));

/* Image sizes, so pages don't jump while pictures load ------------------------------------------------ */

function imageSize(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (error) {
    return null;
  }
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const kind = buf.toString("ascii", 12, 16);
      if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (kind === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
      }
      if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch (error) {
    return null;
  }
  return null;
}

const dims = (size) => (size && size.w && size.h ? ` width="${size.w}" height="${size.h}"` : "");

function sizeImages(html, dir) {
  return html.replace(/<img src="([^"]+)"/g, (tag, src) => {
    const file = src.replace(/&amp;/g, "&");
    return localPath(file) ? `${tag}${dims(imageSize(path.join(dir, file)))}` : tag;
  });
}

// Inline Markdown for short texts (news); a single paragraph loses its <p>.
function shortMd(text) {
  const html = R.render(String(text || "")).html.trim();
  const one = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return one && one[1].indexOf("<p>") === -1 ? one[1] : html;
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file);
    return { data: JSON.parse(raw.toString("utf8")), version: gitBlobSha(raw) };
  } catch (error) {
    if (fs.existsSync(file)) console.warn(`could not read ${path.relative(ROOT, file)}: ${error.message}`);
    return { data: fallback, version: "" };
  }
}

/* Shared page parts ----------------------------------------------------------------------------------- */

// Same as the home page: pick the language before the first paint.
const LANG_BOOT = `(function () {
        var lang = "en";
        try {
          var asked = new URLSearchParams(location.search).get("lang");
          if (asked === "zh" || asked === "en") {
            lang = asked;
            localStorage.setItem("site-lang", asked);
          } else if (localStorage.getItem("site-lang") === "zh") {
            lang = "zh";
          }
        } catch (e) {}
        document.documentElement.setAttribute("data-lang", lang);
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
        var t = document.documentElement.getAttribute("data-title-" + lang);
        if (t) document.title = t;
      })();`;

const UPDATES = [
  ["publications", "/publications/", "Publications", "论文", "Journal articles, with BibTeX", "期刊论文与引用格式"],
  ["news", "/news/", "News", "新闻", "Papers, talks, awards", "论文、会议、获奖"],
  ["blog", "/blog/", "Blog", "博客", "Long reads and notes", "长文与随笔"],
  ["photos", "/photos/", "Photos", "照片", "The lab, travel, life", "实验室、旅行与生活"],
];

// A drop-down in the top bar (assets/js/nav.js); in the phone menu its links are listed.
function navGroup(id, en, zh, list, current, extraClass = "") {
  const items = list
    .map(
      ([key, href, itemEn, itemZh, hintEn, hintZh]) =>
        `            <a href="${href}"${key === current ? ' class="is-active" aria-current="page"' : ""}><span class="nav__item">${bi(itemEn, itemZh)}</span><span class="nav__hint">${bi(hintEn, hintZh)}</span></a>`
    )
    .join("\n");
  const here = list.some(([key]) => key === current);
  return `        <div class="nav__group${here ? " is-current" : ""}" data-navgroup>
          <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="${id}">${bi(en, zh)}<svg class="nav__chev" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5"></path></svg></button>
          <div class="nav__menu${extraClass}" id="${id}">
${items}
          </div>
        </div>`;
}

function topbar(current) {
  const link = (href, en, zh, key) =>
    `        <a href="${href}"${key && key === current ? ' class="is-active" aria-current="page"' : ""}>${bi(en, zh)}</a>`;
  return `    <header class="topbar is-solid" data-topbar>
      <a class="brand" href="/">Tianqi Zhao</a>
      <nav class="nav" id="site-nav" aria-label="Sections">
${link("/#research", "Research", "研究")}
${link("/#cv", "CV", "简历")}
${navGroup("nav-updates", "Updates", "动态", UPDATES, current, " nav__menu--two")}
${link("/#contact", "Contact", "联系")}
${link("/#guestbook", "Guestbook", "留言板")}
${link("/playground/", "Playground", "趣味", "playground")}
      </nav>
      <div class="lang" role="group" aria-label="Language / 语言">
        <button type="button" data-set-lang="en" lang="en" aria-pressed="true">EN</button>
        <button type="button" data-set-lang="zh" lang="zh-CN" aria-pressed="false">中文</button>
      </div>
      <button class="menu" type="button" aria-expanded="false" aria-controls="site-nav" data-menu>
        <span class="menu__bars" aria-hidden="true"></span>
        <span class="sr-only">${bi("Menu", "菜单")}</span>
      </button>
    </header>`;
}

function footer() {
  return `    <footer class="footer">
      <div class="wrap footer__row">
        <span>© ${new Date().getFullYear()} ${AUTHOR}</span>
        <span class="footer__visits" data-visits data-api="${esc(API)}" hidden></span>
        <span class="footer__links"><a href="/publications/">${bi("Publications", "论文")}</a><a href="/news/">${bi("News", "新闻")}</a><a href="/blog/">${bi("Blog", "博客")}</a><a href="/photos/">${bi("Photos", "照片")}</a><a href="/blog/feed.xml">RSS</a></span>
      </div>
    </footer>`;
}

function page(o) {
  const image = o.image || `${ORIGIN}/assets/img/og.png`;
  return `<!doctype html>
<html lang="en" data-lang="en" data-title-en="${esc(o.titleEn)}" data-title-zh="${esc(o.titleZh)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${esc(o.titleEn)}</title>
    <meta name="description" content="${esc(o.description)}">
    <meta name="theme-color" content="#000000">
    <meta name="color-scheme" content="dark">
    <link rel="canonical" href="${esc(o.url)}">
    <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
    <link rel="alternate" type="application/rss+xml" title="${AUTHOR} · Blog" href="/blog/feed.xml">
    <meta property="og:type" content="${o.type || "website"}">
    <meta property="og:url" content="${esc(o.url)}">
    <meta property="og:title" content="${esc(o.ogTitle || o.titleEn)}">
    <meta property="og:description" content="${esc(o.description)}">
    <meta property="og:image" content="${esc(image)}">
    <meta name="twitter:card" content="summary_large_image">
${o.head || ""}    <link rel="preload" href="/assets/fonts/cardo-400.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/assets/fonts/fira-400.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/css/site.css">
    <link rel="stylesheet" href="/assets/css/pages.css">
    <script>
      ${LANG_BOOT}
    </script>
  </head>
  <body class="content-page ${o.bodyClass || ""}">
    <a class="skip" href="#main">${bi("Skip to content", "跳到正文")}</a>
${topbar(o.current)}

    <main id="main">
${o.main}
    </main>

${footer()}

    <div class="lightbox" data-lightbox hidden>
      <div class="lightbox__stage" data-lightbox-stage>
        <img class="lightbox__img" alt="" data-lightbox-img>
      </div>
      <div class="lightbox__bar">
        <p class="lightbox__cap" data-lightbox-cap></p>
        <p class="lightbox__count" data-lightbox-count></p>
      </div>
      <button class="lightbox__btn lightbox__btn--prev" type="button" data-lightbox-prev><span class="sr-only">${bi("Previous", "上一张")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg></button>
      <button class="lightbox__btn lightbox__btn--next" type="button" data-lightbox-next><span class="sr-only">${bi("Next", "下一张")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg></button>
      <button class="lightbox__btn lightbox__btn--close" type="button" data-lightbox-close><span class="sr-only">${bi("Close", "关闭")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
    </div>
    <p class="sr-only" role="status" data-status></p>
    <script src="/assets/js/nav.js" defer></script>
    <script src="/assets/js/pages.js" defer></script>
${o.scripts || ""}    <script src="/assets/js/visits.js" defer></script>
  </body>
</html>
`;
}

function pageHead(o) {
  return `          <header class="page-head">
            <h1 class="section-title page-head__title" id="${o.id}">${bi(o.en, o.zh)}</h1>
            <p class="page-head__lead" data-l="en">${o.leadEn}</p>
            <p class="page-head__lead" data-l="zh" lang="zh-CN">${o.leadZh}</p>
          </header>`;
}

// A stretch of the afterglow trail behind the page heading, in the page's own colours, as the home
// page's sections have (the pictures are rendered by tools/ribbons.py in the site's source folder).
function headRibbon(name) {
  return `        <div class="backdrop backdrop--pagehead" aria-hidden="true"><img src="/assets/img/bg/ribbon-${name}.webp" srcset="/assets/img/bg/ribbon-${name}.webp 1x, /assets/img/bg/ribbon-${name}@2x.webp 2x" width="1100" height="360" alt="" decoding="async"></div>`;
}

function chips(o) {
  const buttons = o.items
    .map(([value, label, n]) => `<button class="chip" type="button" data-filter="${esc(value)}" aria-pressed="false">${label}${n === undefined ? "" : ` <span class="chip__n">${n}</span>`}</button>`)
    .join("\n              ");
  return `          <div class="page-tools">
            <div class="filterbar" role="group" aria-label="${esc(o.label)}" data-filterbar="${o.key}"${o.items.length ? "" : " hidden"}>
              <button class="chip" type="button" data-filter="" aria-pressed="true">${bi("All", "全部")} <span class="chip__n">${o.total}</span></button>
              ${buttons}
            </div>
            <div class="page-tools__actions">
              ${o.actions || ""}
            </div>
          </div>`;
}

const ownerLink = (href, en, zh) => `<a class="chip chip--owner" href="${href}" data-owner hidden>${bi(en, zh)}</a>`;

/* Blog -------------------------------------------------------------------------------------------- */

function readPosts() {
  if (!fs.existsSync(BLOG)) return [];
  const posts = [];
  for (const entry of fs.readdirSync(BLOG, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const dir = path.join(BLOG, slug);
    const file = path.join(dir, "index.md");
    if (!fs.existsSync(file)) continue;
    if (!SLUG.test(slug) || RESERVED.has(slug)) {
      console.warn(`skipped blog/${slug}: a post folder name may use only a-z, 0-9 and -`);
      continue;
    }
    const raw = fs.readFileSync(file);
    const { meta, body } = R.parseFrontMatter(raw.toString("utf8"));
    if (meta.draft === true) continue;
    const title = String(meta.title || "").trim();
    const date = parseDate(meta.date);
    if (!title || !date) {
      console.warn(`skipped blog/${slug}: it needs a title and a date (YYYY-MM-DD) at the top`);
      continue;
    }
    const out = R.render(body, { origin: ORIGIN });
    const local = out.images.filter(localPath);
    const cover = localPath(meta.cover) ? String(meta.cover) : "";
    posts.push({
      slug,
      dir,
      title,
      date,
      updated: parseDate(meta.updated),
      tags: R.normalizeTags(meta.tags),
      summary: String(meta.summary || "").trim() || R.summarize(out.text, 110),
      cover,
      thumb: cover || local[0] || "",
      pinned: meta.pinned === true,
      lang: meta.lang === "en" ? "en" : "zh-CN",
      minutes: R.readingMinutes(out.text),
      html: sizeImages(out.html, dir),
      toc: out.toc,
      version: gitBlobSha(raw),
    });
  }
  posts.sort((a, b) => b.date.time - a.date.time || (a.slug < b.slug ? 1 : -1));
  return posts;
}

function comments(slug) {
  return `      <section class="section guestbook comments" id="comments" aria-labelledby="comments-title" data-guestbook data-kind="comment" data-thread="/blog/${slug}/" data-api="${esc(API)}">
        <div class="backdrop backdrop--ribbon-guestbook" aria-hidden="true"><img src="/assets/img/bg/ribbon-guestbook.webp" srcset="/assets/img/bg/ribbon-guestbook.webp 1x, /assets/img/bg/ribbon-guestbook@2x.webp 2x" width="1000" height="300" alt="" loading="lazy" decoding="async"></div>
        <div class="wrap gb">
          <div class="gb__head">
            <h2 class="section-title" id="comments-title">${bi("Comments", "评论")}</h2>
            <p class="gb__lead" data-l="en">Thoughts on this post, or a question? Comments are public.</p>
            <p class="gb__lead" data-l="zh" lang="zh-CN">读完有想法，或者有问题，欢迎留下评论。评论会公开显示。</p>
          </div>

          <figure class="gb__plot">
            <div class="gb-plot is-waiting" data-gb-plot aria-hidden="true">
              <span class="gb-plot__y">${bi("Glow", "亮度")}</span>
              <div class="gb-plot__box">
                <svg class="gb-plot__curve" viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
                  <defs><linearGradient id="gb-lut" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0" data-gb-stops></linearGradient></defs>
                  <path class="gb-plot__fill" data-gb-fill d=""></path>
                  <path class="gb-plot__line" data-gb-line d=""></path>
                </svg>
                  <span class="gb-tick" data-s="60">${bi("1 min", "1 分钟")}</span>
                  <span class="gb-tick" data-s="3600">${bi("1 h", "1 小时")}</span>
                  <span class="gb-tick" data-s="86400">${bi("1 day", "1 天")}</span>
                  <span class="gb-tick" data-s="2629800">${bi("1 month", "1 个月")}</span>
                  <span class="gb-tick" data-s="31557600">${bi("1 year", "1 年")}</span>
                <div class="gb-plot__pts" data-gb-points></div>
                <div class="gb-tip" data-gb-tip hidden></div>
              </div>
            </div>
            <figcaption>${bi("Each point is a comment, placed by how long ago it was posted. Like an afterglow, it fades with time; likes make it brighter.", "每个点是一条评论，横轴是评论至今的时间。它会像余辉一样随时间慢慢变暗，被点赞会更亮。")}</figcaption>
          </figure>

          <form class="gb-form" data-gb-form novalidate>
            <p class="gb-owner" data-gb-owner hidden>${bi("Signed in as the site owner.", "已用博主身份登录。")}</p>
            <div class="gb-replying" data-gb-replying hidden>
              <span>${bi("Replying to", "回复")} <b data-gb-reply-nick></b></span>
              <button class="gb-act" type="button" data-gb-cancel>${bi("Cancel", "取消")}</button>
            </div>
            <div class="gb-field">
              <label class="gb-label" for="gb-text">${bi("Comment", "评论")}</label>
              <div class="gb-text">
                <textarea class="gb-input" id="gb-text" name="comment" rows="4" required aria-describedby="gb-chars" data-ph-en="Share a thought, or ask a question." data-ph-zh="写下你的看法，或者提个问题。"></textarea>
                <span class="gb-meter" aria-hidden="true"><i></i></span>
              </div>
            </div>
            <div class="gb-meta">
              <div class="gb-field">
                <label class="gb-label" for="gb-nick">${bi("Name", "称呼")}</label>
                <input class="gb-input" id="gb-nick" name="nick" type="text" autocomplete="nickname" maxlength="40" required>
              </div>
              <div class="gb-field">
                <label class="gb-label" for="gb-mail">${bi("Email (optional)", "邮箱（选填）")}</label>
                <input class="gb-input" id="gb-mail" name="mail" type="email" autocomplete="email" maxlength="100" aria-describedby="gb-help">
              </div>
              <div class="gb-field gb-field--wide">
                <label class="gb-label" for="gb-link">${bi("Website (optional)", "个人主页（选填）")}</label>
                <input class="gb-input" id="gb-link" name="link" type="url" inputmode="url" autocomplete="url" maxlength="200" placeholder="https://">
              </div>
              <div class="gb-hp" aria-hidden="true">
                <label for="gb-company">Company</label>
                <input id="gb-company" name="company" type="text" tabindex="-1" autocomplete="off">
              </div>
            </div>
            <p class="gb-help" id="gb-help">${bi("Only the site owner can see your email.", "邮箱只有博主能看到，不会公开。")}</p>
            <div class="gb-submit">
              <span class="gb-chars" id="gb-chars" data-gb-chars></span>
              <button class="gb-post" type="submit" data-gb-post>${bi("Post comment", "发布评论")}</button>
            </div>
            <p class="gb-status" data-gb-status role="status"></p>
          </form>

          <div class="gb__list">
            <p class="gb-total" data-gb-total></p>
            <ol class="gb-list" data-gb-list aria-labelledby="comments-title" tabindex="-1"></ol>
            <p class="gb-state" data-gb-state role="status"></p>
            <noscript><p class="gb-state">${bi("Turn on JavaScript to read and post comments.", "需要开启 JavaScript 才能查看和发布评论。")}</p></noscript>
            <button class="chip gb-more" type="button" data-gb-more hidden>${bi("Show older comments", "查看更早的评论")}</button>
          </div>
        </div>
      </section>`;
}

function postPage(post, newer, older) {
  const url = `${ORIGIN}/blog/${post.slug}/`;
  const image = post.thumb ? `${url}${encodeURI(post.thumb)}` : "";
  const tags = post.tags.map((t) => `<a class="post__tag" href="/blog/?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");
  const updated =
    post.updated && post.updated.iso !== post.date.iso ? `<span>${bi(`Updated ${dateEn(post.updated)}`, `更新于 ${dateZh(post.updated)}`)}</span>` : "";
  const toc =
    post.toc.length >= 3
      ? `          <nav class="toc" aria-labelledby="toc-title">
            <p class="toc__title" id="toc-title">${bi("Contents", "目录")}</p>
            <ol class="toc__list">
${post.toc.map((h) => `              <li class="toc__item toc__item--${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("\n")}
            </ol>
          </nav>\n`
      : "";
  const cover = post.cover
    ? `        <figure class="post__cover"><img src="${esc(post.cover)}" alt=""${dims(imageSize(path.join(post.dir, post.cover)))} decoding="async" fetchpriority="high"></figure>\n`
    : "";
  const navItem = (p, dir) =>
    p
      ? `<a class="post-nav__item post-nav__item--${dir}" href="/blog/${p.slug}/"><span class="post-nav__dir">${dir === "newer" ? bi("Newer", "上一篇") : bi("Older", "下一篇")}</span><span class="post-nav__title" lang="${p.lang}">${esc(p.title)}</span></a>`
      : `<span class="post-nav__item post-nav__item--none"></span>`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    datePublished: post.date.iso,
    dateModified: (post.updated || post.date).iso,
    author: { "@type": "Person", name: AUTHOR, url: `${ORIGIN}/` },
    mainEntityOfPage: url,
    inLanguage: post.lang,
    keywords: post.tags.join(", "),
    description: post.summary,
  };
  if (image) ld.image = image;

  const main = `      <article class="post" data-post="${post.slug}">
        <div class="readbar" data-readbar aria-hidden="true"><i></i></div>
        <header class="post__head">
          <p class="post__crumbs"><a class="post__back" href="/blog/">${bi("Blog", "博客")}</a>${tags}</p>
          <h1 class="post__title" lang="${post.lang}">${esc(post.title)}</h1>
          <p class="post__meta">
            <time datetime="${post.date.iso}">${dateBi(post.date)}</time>
            ${updated}<span>${bi(`${post.minutes} min read`, `阅读约 ${post.minutes} 分钟`)}</span>
            <span data-views hidden></span>
          </p>
          <p class="post__owner" data-owner hidden><a class="chip chip--owner" href="/admin/#blog/edit/${post.slug}">${bi("Edit this post", "编辑这篇")}</a></p>
        </header>
${cover}        <div class="post__layout${toc ? " has-toc" : ""}">
${toc}          <div class="prose" lang="${post.lang}">
${post.html}          </div>
        </div>
        <footer class="post__foot">
          <div class="post__share">
            <button class="chip" type="button" data-copy-link><span class="chip__idle">${bi("Copy link", "复制链接")}</span><span class="chip__done">${bi("Link copied", "已复制链接")}</span></button>
            <button class="chip" type="button" data-share hidden>${bi("Share", "分享")}</button>
            <a class="chip" href="#comments">${bi("Comments", "评论")}</a>
          </div>
          <nav class="post-nav" aria-label="More posts">
            ${navItem(newer, "newer")}
            ${navItem(older, "older")}
          </nav>
        </footer>
      </article>

${comments(post.slug)}`;

  return page({
    titleEn: `${post.title} | ${AUTHOR}`,
    titleZh: `${post.title} | ${AUTHOR}`,
    ogTitle: post.title,
    description: post.summary,
    url,
    image,
    type: "article",
    current: "blog",
    bodyClass: "post-page",
    head:
      `    <meta property="article:published_time" content="${post.date.iso}">\n` +
      `    <meta name="content-version" content="${post.version}">\n` +
      `    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n`,
    main,
    scripts: `    <script src="/assets/js/guestbook.js" defer></script>\n`,
  });
}

function blogPage(posts) {
  const order = posts.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const counts = new Map();
  posts.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const tagItems = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([t, n]) => [t, esc(t), n]);

  const card = (p) => {
    const shot = p.thumb
      ? `<span class="post-card__shot"><img src="/blog/${p.slug}/${esc(p.thumb)}" alt=""${dims(imageSize(path.join(p.dir, p.thumb)))} loading="lazy" decoding="async"></span>`
      : "";
    const pin = p.pinned ? `<span class="post-card__pin">${bi("Pinned", "置顶")}</span>` : "";
    const tags = p.tags.length ? `<span class="post-card__tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</span>` : "";
    return `            <li class="post-card${p.thumb ? "" : " post-card--text"}" data-filter-values="${esc(JSON.stringify(p.tags))}">
              <a class="post-card__link" href="/blog/${p.slug}/">
                ${shot}<span class="post-card__body">
                  <span class="post-card__meta">${pin}<time datetime="${p.date.iso}">${dateBi(p.date)}</time><span>${bi(`${p.minutes} min read`, `${p.minutes} 分钟`)}</span></span>
                  <span class="post-card__title" lang="${p.lang}">${esc(p.title)}</span>
                  <span class="post-card__summary" lang="${p.lang}">${esc(p.summary)}</span>
                  ${tags}
                </span>
              </a>
            </li>`;
  };

  const body = posts.length
    ? `          <ol class="post-list" data-filter-list>
${order.map(card).join("\n")}
          </ol>
          <p class="page-none" data-filter-none hidden>${bi("No posts with this tag.", "这个标签下还没有文章。")}</p>`
    : `          <div class="page-empty">
            <p class="page-empty__title">${bi("No posts yet.", "还没有文章。")}</p>
            <p>${bi("The first one is on its way.", "第一篇正在路上。")}</p>
          </div>`;

  const main = `      <section class="section page blogpage" aria-labelledby="page-title">
${headRibbon("blog")}
        <div class="wrap">
${pageHead({ id: "page-title", en: "Blog", zh: "博客", leadEn: "Long reads, notes from the lab, and things outside it.", leadZh: "长文、实验笔记，以及实验室之外的事。" })}
${chips({ key: "tag", label: "Tags", total: posts.length, items: tagItems, actions: `${ownerLink("/admin/#blog/new", "Write a post", "写文章")}\n              <a class="chip" href="/blog/feed.xml">RSS</a>` })}
${body}
        </div>
      </section>`;

  return page({
    titleEn: `Blog | ${AUTHOR}`,
    titleZh: `博客 | ${AUTHOR}`,
    ogTitle: `${AUTHOR} · Blog`,
    description: "Long reads and notes by Tianqi Zhao: afterglow materials, the lab, and life outside it.",
    url: `${ORIGIN}/blog/`,
    current: "blog",
    bodyClass: "list-page",
    head: `    <meta name="content-version" content="${crypto.createHash("sha1").update(posts.map((p) => `${p.slug}:${p.version}`).join(",")).digest("hex")}">\n`,
    main,
  });
}

function feed(posts) {
  const rfc822 = (d) => new Date(d.time).toUTCString().replace("GMT", "+0000");
  const items = posts
    .slice(0, 30)
    .map((p) => {
      const url = `${ORIGIN}/blog/${p.slug}/`;
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${esc(p.summary)}</description>
${p.tags.map((t) => `      <category>${esc(t)}</category>`).join("\n")}
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${AUTHOR} · Blog</title>
    <link>${ORIGIN}/blog/</link>
    <description>Long reads and notes by ${AUTHOR}.</description>
    <language>zh-CN</language>
    <atom:link href="${ORIGIN}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString().replace("GMT", "+0000")}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

/* News -------------------------------------------------------------------------------------------- */

const KINDS = {
  paper: ["Paper", "论文"],
  talk: ["Talk", "会议"],
  award: ["Award", "获奖"],
  other: ["News", "其他"],
};

function readNews() {
  const { data, version } = readJson(path.join(NEWS, "news.json"), []);
  const items = (Array.isArray(data) ? data : [])
    .map((n) => ({ ...n, when: parseDate(n.date), kind: KINDS[n.kind] ? n.kind : "other" }))
    .filter((n) => n.when && (String(n.text || "").trim() || String(n.text_en || "").trim()));
  items.sort((a, b) => b.when.time - a.when.time || String(b.id).localeCompare(String(a.id)));
  return { items, version };
}

function newsPage(news) {
  const { items, version } = news;
  const used = Object.keys(KINDS).filter((k) => items.some((n) => n.kind === k));
  const kindItems = used.map((k) => [k, bi(KINDS[k][0], KINDS[k][1]), items.filter((n) => n.kind === k).length]);

  const one = (n) => {
    const zh = String(n.text || "").trim();
    const en = String(n.text_en || "").trim();
    const text =
      zh && en
        ? `<div class="news-item__text" data-l="zh" lang="zh-CN">${shortMd(zh)}</div><div class="news-item__text" data-l="en" lang="en">${shortMd(en)}</div>`
        : `<div class="news-item__text" lang="${zh ? "zh-CN" : "en"}">${shortMd(zh || en)}</div>`;
    const link = n.link && R.safeUrl(n.link) ? `<a class="news-item__link" href="${esc(n.link)}" target="_blank" rel="noopener">${bi("Read more", "查看详情")}<span aria-hidden="true"> ↗</span></a>` : "";
    const pic =
      n.image && localPath(n.image)
        ? `<figure class="news-item__pic"><img src="/news/${esc(n.image)}" alt=""${dims(imageSize(path.join(NEWS, n.image)))} loading="lazy" decoding="async" data-zoom></figure>`
        : "";
    const id = /^[A-Za-z0-9_-]{1,64}$/.test(String(n.id || "")) ? ` id="${n.id}"` : "";
    return `              <li class="news-item news-item--${n.kind}"${id} data-filter-values="${esc(JSON.stringify([n.kind]))}">
                <time class="news-item__date" datetime="${n.when.iso}">${bi(`${MONTHS[n.when.mo - 1]} ${n.when.d}`, `${n.when.mo} 月 ${n.when.d} 日`)}</time>
                <div class="news-item__body">
                  <span class="news-item__kind">${bi(KINDS[n.kind][0], KINDS[n.kind][1])}</span>
                  ${text}
                  ${link}${pic}
                </div>
              </li>`;
  };

  const years = [];
  items.forEach((n) => {
    const last = years[years.length - 1];
    if (last && last.y === n.when.y) last.items.push(n);
    else years.push({ y: n.when.y, items: [n] });
  });

  const body = items.length
    ? `          <div class="newsline" data-filter-list-group>
${years
  .map(
    (g) => `            <section class="newsline__year" data-filter-group>
              <h2 class="newsline__y">${g.y}</h2>
              <ol class="newsline__list" data-filter-list>
${g.items.map(one).join("\n")}
              </ol>
            </section>`
  )
  .join("\n")}
          </div>
          <p class="page-none" data-filter-none hidden>${bi("Nothing here yet.", "这一类还没有新闻。")}</p>`
    : `          <div class="page-empty">
            <p class="page-empty__title">${bi("No news yet.", "还没有新闻。")}</p>
            <p>${bi("Papers, talks and awards will show up here.", "论文、会议和获奖的消息会出现在这里。")}</p>
          </div>`;

  const main = `      <section class="section page newspage" aria-labelledby="page-title">
${headRibbon("news")}
        <div class="wrap">
${pageHead({ id: "page-title", en: "News", zh: "新闻", leadEn: "Papers, talks, awards and other news.", leadZh: "论文、会议、获奖，和其他新消息。" })}
${chips({ key: "kind", label: "Kind", total: items.length, items: kindItems, actions: ownerLink("/admin/#news", "Add news", "发新闻") })}
${body}
        </div>
      </section>`;

  return page({
    titleEn: `News | ${AUTHOR}`,
    titleZh: `新闻 | ${AUTHOR}`,
    ogTitle: `${AUTHOR} · News`,
    description: "News from Tianqi Zhao: papers, talks and awards.",
    url: `${ORIGIN}/news/`,
    current: "news",
    bodyClass: "list-page",
    head: `    <meta name="content-version" content="${version}">\n`,
    main,
  });
}

/* Photos ------------------------------------------------------------------------------------------ */

function readPhotos() {
  const { data, version } = readJson(path.join(PHOTOS, "photos.json"), []);
  const items = (Array.isArray(data) ? data : [])
    .filter((p) => localPath(p.file) && fs.existsSync(path.join(PHOTOS, p.file)))
    .map((p) => {
      const full = imageSize(path.join(PHOTOS, p.file)) || { w: p.w, h: p.h };
      const thumbFile = localPath(p.thumb) && fs.existsSync(path.join(PHOTOS, p.thumb)) ? p.thumb : p.file;
      const thumb = imageSize(path.join(PHOTOS, thumbFile)) || full;
      return { ...p, when: parseDate(p.date), full, thumbFile, thumb, album: String(p.album || "").trim() };
    });
  items.sort((a, b) => (b.when ? b.when.time : 0) - (a.when ? a.when.time : 0) || String(b.id).localeCompare(String(a.id)));
  return { items, version };
}

function photosPage(photos) {
  const { items, version } = photos;
  const albums = new Map();
  items.forEach((p) => p.album && albums.set(p.album, (albums.get(p.album) || 0) + 1));
  const albumItems = [...albums.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([a, n]) => [a, esc(a), n]);

  const caption = (p) => {
    const zh = String(p.caption || "").trim();
    const en = String(p.caption_en || "").trim();
    if (zh && en) return bi(esc(en), esc(zh));
    return esc(zh || en);
  };
  const tile = (p, i) => {
    const cap = caption(p);
    const place = String(p.place || "").trim();
    const meta = [place ? esc(place) : "", p.when ? dateBi(p.when) : ""].filter(Boolean).join(" · ");
    const label = String(p.caption || p.caption_en || p.place || "").trim();
    return `            <li class="photo" data-filter-values="${esc(JSON.stringify(p.album ? [p.album] : []))}">
              <a class="photo__link" href="/photos/${esc(p.file)}" data-photo="${i}">
                <img src="/photos/${esc(p.thumbFile)}" alt="${esc(label)}"${dims(p.thumb)} loading="lazy" decoding="async">
                ${cap || meta ? `<span class="photo__info">${cap ? `<span class="photo__cap">${cap}</span>` : ""}${meta ? `<span class="photo__meta">${meta}</span>` : ""}</span>` : ""}
              </a>
            </li>`;
  };
  const data = items.map((p) => ({
    src: `/photos/${p.file}`,
    w: p.full.w,
    h: p.full.h,
    zh: String(p.caption || p.caption_en || "").trim(),
    en: String(p.caption_en || p.caption || "").trim(),
    place: String(p.place || "").trim(),
    dateZh: p.when ? dateZh(p.when) : "",
    dateEn: p.when ? dateEn(p.when) : "",
  }));

  const body = items.length
    ? `          <ul class="photo-grid" data-filter-list data-photos>
${items.map(tile).join("\n")}
          </ul>
          <p class="page-none" data-filter-none hidden>${bi("No photos in this album.", "这个相册里还没有照片。")}</p>
          <script type="application/json" id="photo-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
    : `          <div class="page-empty">
            <p class="page-empty__title">${bi("No photos yet.", "还没有照片。")}</p>
            <p>${bi("Pictures from the lab, travel and life will show up here.", "实验室、旅行和生活的照片会出现在这里。")}</p>
          </div>`;

  const main = `      <section class="section page photospage" aria-labelledby="page-title">
${headRibbon("photos")}
        <div class="wrap">
${pageHead({ id: "page-title", en: "Photos", zh: "照片", leadEn: "The lab, conferences, travel and everyday life.", leadZh: "实验室、会议、旅行，还有日常。" })}
${chips({ key: "album", label: "Albums", total: items.length, items: albumItems, actions: ownerLink("/admin/#photos", "Add photos", "传照片") })}
${body}
        </div>
      </section>`;

  const cover = items[0] ? `${ORIGIN}/photos/${encodeURI(items[0].thumbFile)}` : "";
  return page({
    titleEn: `Photos | ${AUTHOR}`,
    titleZh: `照片 | ${AUTHOR}`,
    ogTitle: `${AUTHOR} · Photos`,
    description: "Photos by Tianqi Zhao: the lab, conferences, travel and everyday life.",
    url: `${ORIGIN}/photos/`,
    image: cover,
    current: "photos",
    bodyClass: "list-page",
    head: `    <meta name="content-version" content="${version}">\n`,
    main,
  });
}

/* Publications ------------------------------------------------------------------------------------ */

// tools/build.py writes the list (from the BibTeX file) and the BibTeX data next to the page.
function publicationsPage() {
  const dir = path.join(SITE, "publications");
  const list = fs.readFileSync(path.join(dir, "papers.html"), "utf8");
  const bib = fs.readFileSync(path.join(dir, "bibtex.json"), "utf8").trim();
  const orcid = '<a href="https://orcid.org/0000-0002-2230-7690">ORCID</a>';
  const main = `      <section class="section page pubspage pubs" aria-labelledby="page-title" data-pubs>
        <div class="backdrop backdrop--ribbon-pubs" aria-hidden="true"><img src="/assets/img/bg/ribbon-pubs.webp" srcset="/assets/img/bg/ribbon-pubs.webp 1x, /assets/img/bg/ribbon-pubs@2x.webp 2x" width="420" height="2300" alt="" loading="lazy" decoding="async"></div>
        <div class="wrap">
${pageHead({
  id: "page-title",
  en: "Publications",
  zh: "论文",
  leadEn: `Journal articles, newest first. The full record is on ${orcid}.`,
  leadZh: `期刊论文，按时间从新到旧排列。完整记录见 ${orcid}。`,
})}
${list.replace(/\s+$/, "")}
        </div>
      </section>
      <script type="application/json" id="bibtex">${bib.replace(/</g, "\\u003c")}</script>`;
  return page({
    titleEn: `Publications | ${AUTHOR}`,
    titleZh: `论文 | ${AUTHOR}`,
    ogTitle: `${AUTHOR} · Publications`,
    description: "Journal articles by Tianqi Zhao on persistent luminescence and afterglow materials, with DOIs and BibTeX.",
    url: `${ORIGIN}/publications/`,
    current: "publications",
    bodyClass: "list-page",
    scripts: `    <script src="/assets/js/pubs.js" defer></script>\n`,
    main,
  });
}

/* Playground ------------------------------------------------------------------------------------- */

const playCard = (o) => `              <a class="play play--${o.key}" href="/playground/${o.key}/">
                <span class="play__shot"><img src="/assets/img/play/${o.key}.webp" width="1120" height="700" alt="" loading="lazy" decoding="async"></span>
                <div class="play__body">
                  <p class="play__kicker">${o.kicker}</p>
                  <h3 class="play__title">${bi(o.en, o.zh)}</h3>
                  <p class="play__text" data-l="en">${o.textEn}</p>
                  <p class="play__text" data-l="zh" lang="zh-CN">${o.textZh}</p>
                  <p class="play__cue">${bi("Open", "打开")}<span class="play__arrow" aria-hidden="true">→</span></p>
                </div>
              </a>`;

// The Playground page, in groups. Each card is a page of its own under site/playground/<key>/, with a
// picture in site/assets/img/play/<key>.webp (1120 × 700).
const GAME = bi("Game", "小游戏");
const PLAY_GROUPS = [
  {
    id: "lab",
    en: "From the lab",
    zh: "和研究有关",
    leadEn: "Afterglow, phosphors and luminescence thermometry, made into things to play with.",
    leadZh: "余辉、发光材料和荧光测温，做成可以动手玩的小东西。",
    cards: [
      {
        key: "lights-off",
        kicker: `Canvas · ${GAME}`,
        en: "Lights Off",
        zh: "关灯之后",
        textEn: "Under the lamp the whole tissue glows; switch it off and the background dies away, while the afterglow on the tumors keeps shining. Pick your moment and tap them.",
        textZh: "灯亮时整块组织都在发光，关灯后背景很快熄灭，肿瘤上的余辉还亮着，看准时机点中它们。",
      },
      {
        key: "secret",
        kicker: bi("Canvas · Interactive", "Canvas · 互动"),
        en: "Afterglow secret",
        zh: "余辉密信",
        textEn: "A line printed in two phosphors: under the lamp you read the decoy, after lights-off only the real line glows. Write one and send it as a link.",
        textZh: "一句话用两种材料印在一起：灯亮时读到的是伪装，关灯后只剩真话。写好以后可以生成链接发给别人。",
      },
      {
        key: "glow-wall",
        kicker: bi("Canvas · Interactive", "Canvas · 互动"),
        en: "Glow wall",
        zh: "夜光涂鸦墙",
        textEn: "Draw with ultraviolet light on a phosphor wall: four persistent phosphors, each with its own colour and lifetime. Infrared wipes the stored charge.",
        textZh: "用紫外光在夜光墙上画画，四种长余辉材料各有颜色和余辉时长；红外光能把存着的能量一下子放掉。",
      },
      {
        key: "thermometer",
        kicker: bi("Chart · Game", "图表 · 小游戏"),
        en: "Guess the temperature",
        zh: "猜温度",
        textEn: "Read a Cr³⁺ emission spectrum: the ratio of the broad band to the sharp line is a thermometer. Five rounds, with a Boltzmann plot.",
        textZh: "看 Cr³⁺ 的发射光谱猜温度：宽带和锐线的比值就是一支温度计。一局五轮，附玻尔兹曼图。",
      },
    ],
  },
  {
    id: "games",
    en: "Classic games",
    zh: "经典小游戏",
    leadEn: "Familiar games in afterglow colours.",
    leadZh: "熟悉的玩法，换成了余辉的配色。",
    cards: [
      {
        key: "snake",
        kicker: `Canvas · ${GAME}`,
        en: "Snake",
        zh: "贪吃蛇",
        textEn: "Hot at the head and cooling along the body; the path behind it glows and fades, and a bonus orb cools down the colour table the longer you leave it.",
        textZh: "蛇头最热，往后一路冷却；走过的格子亮一下再暗下去；不时出现的奖励光球会慢慢冷却，越早吃到分越高。",
      },
      {
        key: "tetris",
        kicker: `Canvas · ${GAME}`,
        en: "Tetris",
        zh: "俄罗斯方块",
        textEn: "The falling piece is lit violet; once it lands it glows red-hot and cools towards blue, so the stack shows when each block arrived.",
        textZh: "下落的方块被紫光照亮，落定后开始发余辉，从红色慢慢冷却成蓝色，越早落下的越冷。",
      },
      {
        key: "2048",
        kicker: `HTML · ${GAME}`,
        en: "2048",
        zh: "2048",
        textEn: "Merge equal tiles to reach 2048. The bigger a tile, the brighter it glows, from deep violet up through blue, green and yellow to red.",
        textZh: "合并相同的方块，凑出 2048。方块越大越亮，颜色从深紫经过蓝、绿、黄一路走到红。",
      },
      {
        key: "minesweeper",
        kicker: `HTML · ${GAME}`,
        en: "Minesweeper",
        zh: "扫雷",
        textEn: "Three levels, and the first click is always safe. The numbers glow in the radiance colours: the more mines around, the hotter.",
        textZh: "三种难度，第一下不会踩雷。数字按辐射色标上色，周围的雷越多，颜色越热。",
      },
    ],
  },
  {
    id: "tools",
    en: "Tools",
    zh: "实用工具",
    leadEn: "For writing papers and working with data. Everything runs in your browser.",
    leadZh: "写论文、处理数据时用得上，全部在浏览器里运行。",
    cards: [
      {
        key: "decay-fit",
        kicker: bi("Tool", "工具"),
        en: "Afterglow decay fitting",
        zh: "余辉寿命拟合",
        textEn: "Paste a decay curve and fit one to three exponentials: lifetimes with errors, the average lifetime and the residuals. Nothing is uploaded.",
        textZh: "粘贴衰减曲线，单、双、三指数拟合，给出各个寿命、误差、平均寿命和残差图。数据不会上传。",
      },
      {
        key: "cite",
        kicker: bi("Tool", "工具"),
        en: "DOI to reference",
        zh: "DOI 转参考文献",
        textEn: "Paste DOIs and get references in GB/T 7714, APA, ACS, BibTeX or RIS, from Crossref.",
        textZh: "粘贴 DOI，一键生成 GB/T 7714、APA、ACS、BibTeX 或 RIS 格式的参考文献。",
      },
    ],
  },
  {
    id: "art",
    en: "Simulations and animations",
    zh: "模拟与动画",
    leadEn: "Things to watch: a simulation and two animations.",
    leadZh: "看着就好玩的：一个模拟，两个动画。",
    cards: [
      {
        key: "life",
        kicker: bi("Canvas · Simulation", "Canvas · 模拟"),
        en: "Game of Life",
        zh: "生命游戏",
        textEn: "Conway's Game of Life where dying cells keep glowing, so gliders and spaceships leave trails. Draw your own, or pick a classic pattern.",
        textZh: "康威的生命游戏，死去的格子会留一会儿余辉，滑翔机和飞船走过的路都看得见。可以自己画，也有经典图案。",
      },
      {
        key: "pelican",
        kicker: "3D · WebGL",
        en: "Pelican on a bicycle",
        zh: "鹈鹕骑车",
        textEn: "A pelican in a red helmet and striped scarf pedals down a country road with a basket of fish — the classic “pelican on a bicycle” test for AI, built out in 3D. Ring the bell, or switch to dusk.",
        textZh: "戴红头盔、围条纹围巾的鹈鹕沿着乡间小路蹬车，车筐里装着鱼 ——「鹈鹕骑自行车」这道考 AI 的老题，做成了 3D。可以按铃，也能切到黄昏。",
      },
      {
        key: "eiffel",
        kicker: bi("Canvas · Animation", "Canvas · 动画"),
        en: "The Eiffel Tower at night",
        zh: "埃菲尔铁塔之夜",
        textEn: "The tower draws itself from the ground up, the gold lighting comes on over the Seine, and then the whole lattice starts to sparkle.",
        textZh: "铁塔从地面一层层自己长上去，塞纳河上的金色灯光依次亮起，然后整座铁塔开始闪烁。",
      },
    ],
  },
];

function playgroundPage() {
  const groups = PLAY_GROUPS.map(
    (g) => `          <section class="playgroup" aria-labelledby="pg-${g.id}">
            <div class="playgroup__head">
              <h2 class="playgroup__title" id="pg-${g.id}">${bi(g.en, g.zh)}</h2>
              <p class="playgroup__lead" data-l="en">${g.leadEn}</p>
              <p class="playgroup__lead" data-l="zh" lang="zh-CN">${g.leadZh}</p>
            </div>
            <div class="plays">
${g.cards.map(playCard).join("\n")}
            </div>
          </section>`
  ).join("\n");
  const main = `      <section class="section page playpage" aria-labelledby="page-title">
${headRibbon("play")}
        <div class="wrap">
${pageHead({
  id: "page-title",
  en: "Playground",
  zh: "趣味",
  leadEn: "Small things I made: toys from my research, classic games and a couple of tools. Each one is a single web page that runs in the browser — nothing to install.",
  leadZh: "做着玩的小作品：和研究有关的小玩意、经典小游戏，还有两个实用工具。每个都是单独的一张网页，浏览器里直接跑，不用装任何东西。",
})}
${groups}
        </div>
      </section>`;
  return page({
    titleEn: `Playground | ${AUTHOR}`,
    titleZh: `趣味 | ${AUTHOR}`,
    ogTitle: `${AUTHOR} · Playground`,
    description: "Small things Tianqi Zhao made: afterglow toys from the lab, classic games in afterglow colours, a decay-fitting tool, a DOI-to-reference tool, and two animations.",
    url: `${ORIGIN}/playground/`,
    image: `${ORIGIN}/assets/img/play/lights-off.webp`,
    current: "playground",
    bodyClass: "list-page",
    main,
  });
}

/* Sitemap ----------------------------------------------------------------------------------------- */

function updateSitemap(posts, news, photos) {
  const file = path.join(SITE, "sitemap.xml");
  if (!fs.existsSync(file)) return;
  let xml = fs
    .readFileSync(file, "utf8")
    .replace(/\s*<url><loc>https:\/\/tqzhaone\.github\.io\/(?:blog|news|photos)\/[^<]*<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, "");
  const iso = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const latest = (list, f) => list.reduce((m, x) => Math.max(m, f(x)), 0);
  const entry = (loc, t) => `  <url><loc>${ORIGIN}${loc}</loc>${t ? `<lastmod>${iso(t)}</lastmod>` : ""}</url>`;
  const lines = [
    entry("/news/", latest(news.items, (n) => n.when.time)),
    entry("/blog/", latest(posts, (p) => (p.updated || p.date).time)),
    entry("/photos/", latest(photos.items, (p) => (p.when ? p.when.time : 0))),
  ];
  posts.forEach((p) => lines.push(entry(`/blog/${p.slug}/`, (p.updated || p.date).time)));
  xml = xml.replace(/\s*<\/urlset>/, `\n${lines.join("\n")}\n</urlset>`);
  fs.writeFileSync(file, xml);
}

/* Build ------------------------------------------------------------------------------------------- */

function build() {
  [BLOG, NEWS, PHOTOS].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

  const posts = readPosts();
  posts.forEach((post, i) => fs.writeFileSync(path.join(post.dir, "index.html"), postPage(post, posts[i - 1], posts[i + 1])));
  fs.writeFileSync(path.join(BLOG, "index.html"), blogPage(posts));
  fs.writeFileSync(
    path.join(BLOG, "posts.json"),
    JSON.stringify(
      posts.map((p) => ({ slug: p.slug, title: p.title, date: p.date.iso, tags: p.tags, minutes: p.minutes, pinned: p.pinned || undefined, version: p.version })),
      null,
      1
    )
  );
  fs.writeFileSync(path.join(BLOG, "feed.xml"), feed(posts));

  const news = readNews();
  fs.writeFileSync(path.join(NEWS, "index.html"), newsPage(news));

  const photos = readPhotos();
  fs.writeFileSync(path.join(PHOTOS, "index.html"), photosPage(photos));

  fs.writeFileSync(path.join(SITE, "publications", "index.html"), publicationsPage());
  fs.writeFileSync(path.join(SITE, "playground", "index.html"), playgroundPage());

  updateSitemap(posts, news, photos);
  console.log(`built: ${posts.length} blog post(s), ${news.items.length} news item(s), ${photos.items.length} photo(s)`);
}

build();
