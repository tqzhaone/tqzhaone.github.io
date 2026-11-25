/*
 * Markdown for the blog, written for this site (no outside library).
 *
 * The same file runs in two places: in the browser, for the preview on the writing page, and in
 * Node, where tools/build-blog.js turns each post into a static page. What the preview shows is what
 * gets published.
 *
 * Supported: headings, paragraphs (a single line break stays a line break, which is how most people
 * type on a phone), **bold**, *italic*, ~~strikethrough~~, ==highlight==, `code`, code blocks, links,
 * bare web addresses, images, block quotes, lists (bulleted, numbered, task), tables, horizontal
 * rules, footnotes ([^1]) and raw HTML such as H<sub>2</sub>O.
 *
 * An image on a line of its own becomes a figure and its description ![...] becomes the caption;
 * images on consecutive lines become a gallery; ![...](photo.webp "wide") lets a figure run wider
 * than the text. Raw HTML is kept, but scripts, inline event handlers and javascript: links are
 * removed, because the writing page's key is stored on this same site.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BlogRender = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Text helpers ------------------------------------------------------------------------------------ */

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ESC[c]);

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" };
  function decodeEntities(value) {
    return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (all, code) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      const named = ENTITIES[code.toLowerCase()];
      return named === undefined ? all : named;
    });
  }

  const stripTags = (html) => String(html).replace(/<[^>]*>/g, "");
  const toPlain = (html) => decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();

  // A web, mail or phone link, or a path on this site. Anything else (javascript:, data:, ...) is dropped.
  function dangerousUrl(value) {
    const flat = decodeEntities(String(value || ""))
      .replace(/[\u0000- \u007f-\u009f]+/g, "")
      .toLowerCase();
    return /^(javascript|vbscript|data|file):/.test(flat);
  }

  function safeUrl(value) {
    const url = String(value || "").trim();
    if (!url || dangerousUrl(url)) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?|mailto|tel):/i.test(url)) return "";
    return url;
  }

  // Raw HTML in a post is kept, minus anything that could run code.
  function cleanHtml(html) {
    return String(html)
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<\/?script\b[^>]*>/gi, "")
      .replace(/<([a-z][a-z0-9-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`=]+))?)*)\s*(\/?)>/gi, (tag, name, attrs, selfClose) => {
        const kept = [];
        const re = /\s+([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'<>`=]+))?/g;
        let m;
        while ((m = re.exec(attrs))) {
          const attr = m[1].toLowerCase();
          const raw = m[2] === undefined ? null : m[2];
          const value = raw === null ? null : raw.replace(/^["']|["']$/g, "");
          if (/^on/.test(attr) || attr === "srcdoc" || attr === "formaction") continue;
          if (/^(href|src|action|xlink:href|poster|background|data)$/.test(attr) && value !== null && dangerousUrl(value)) continue;
          kept.push(raw === null ? ` ${m[1]}` : ` ${m[1]}=${raw}`);
        }
        return `<${name}${kept.join("")}${selfClose ? " /" : ""}>`;
      });
  }

  function slugify(text) {
    return String(text)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
  }

  /* Inline ------------------------------------------------------------------------------------------ */

  // Inline tags a writer may type directly: chemistry and units (H<sub>2</sub>O, cm<sup>-1</sup>),
  // line breaks, keys, highlights, small text.
  const INLINE_TAG = /^<\/?(sub|sup|br|kbd|mark|u|small|abbr|span|b|i|em|strong|s|del|ins|ruby|rt|rp|q|cite|code|a|img|time|var|wbr)(?:\s[^<>]*)?\s*\/?>/i;
  const URL_CHARS = /^(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i;

  function parseLink(src, start) {
    // src[start] === "[" ; returns { text, url, title, end } for [text](url "title")
    let depth = 0;
    let i = start;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) break;
      } else if (ch === "\n" && src[i + 1] === "\n") return null;
    }
    if (i >= src.length || src[i + 1] !== "(") return null;
    const text = src.slice(start + 1, i);
    let j = i + 2;
    while (src[j] === " ") j++;
    let url = "";
    if (src[j] === "<") {
      const k = src.indexOf(">", j);
      if (k === -1) return null;
      url = src.slice(j + 1, k);
      j = k + 1;
    } else {
      let paren = 0;
      const from = j;
      for (; j < src.length; j++) {
        const ch = src[j];
        if (ch === "\\") {
          j++;
          continue;
        }
        if (ch === "(") paren++;
        else if (ch === ")") {
          if (paren === 0) break;
          paren--;
        } else if (/\s/.test(ch)) break;
      }
      url = src.slice(from, j);
    }
    while (src[j] === " " || src[j] === "\n") j++;
    let title = "";
    if (src[j] === '"' || src[j] === "'") {
      const quote = src[j];
      const k = src.indexOf(quote, j + 1);
      if (k === -1) return null;
      title = src.slice(j + 1, k);
      j = k + 1;
      while (src[j] === " ") j++;
    }
    if (src[j] !== ")") return null;
    return { text, url: url.replace(/\\([()])/g, "$1"), title, end: j + 1 };
  }

  function imageTag(link, ctx) {
    const resolved = ctx.resolveImage ? ctx.resolveImage(link.url) : link.url;
    // blob: addresses are pictures the writing page holds before they are published
    const src = /^blob:/.test(resolved) ? resolved : safeUrl(resolved);
    ctx.images.push(link.url);
    const alt = toPlain(inline(link.text, ctx, true));
    const title = link.title && !/^\s*wide\s*$/i.test(link.title) ? ` title="${esc(link.title)}"` : "";
    return `<img src="${esc(src)}" alt="${esc(alt)}"${title} loading="lazy" decoding="async">`;
  }

  function anchorTag(link, ctx) {
    const href = safeUrl(link.url);
    const inner = inline(link.text, ctx, true);
    if (!href) return inner;
    const external = /^https?:\/\//i.test(href) && !(ctx.origin && href.indexOf(ctx.origin) === 0);
    const title = link.title ? ` title="${esc(link.title)}"` : "";
    return `<a href="${esc(href)}"${title}${external ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`;
  }

  function autoLink(url, label, ctx) {
    const href = safeUrl(url);
    if (!href) return esc(label || url);
    const external = !(ctx.origin && href.indexOf(ctx.origin) === 0);
    return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${esc(label || url)}</a>`;
  }

  function footnoteRef(id, ctx) {
    const key = id.toLowerCase();
    if (ctx.fnOrder.indexOf(key) === -1) ctx.fnOrder.push(key);
    const n = ctx.fnOrder.indexOf(key) + 1;
    const sid = slugify(key) || String(n);
    ctx.fnRefs[key] = (ctx.fnRefs[key] || 0) + 1;
    const refId = `fnref-${sid}${ctx.fnRefs[key] > 1 ? `-${ctx.fnRefs[key]}` : ""}`;
    return `<sup class="fn-ref"><a href="#fn-${sid}" id="${refId}">${n}</a></sup>`;
  }

  // *em*, **strong**, ***both***, with _ as well. Openers need text right after them and closers right
  // before them; _ inside a word (snake_case) is left alone. Works the same for Chinese text.
  function emphasis(src, i, ctx, noLinks) {
    const ch = src[i];
    let run = 1;
    while (src[i + run] === ch) run++;
    if (run > 3) return null;
    const after = src[i + run];
    if (!after || /\s/.test(after)) return null;
    if (ch === "_" && i > 0 && /[A-Za-z0-9]/.test(src[i - 1])) return null;
    const delim = ch.repeat(run);
    let j = i + run;
    for (;;) {
      j = src.indexOf(delim, j);
      if (j === -1) return null;
      const before = src[j - 1];
      const next = src[j + run];
      const ok =
        before !== undefined &&
        !/\s/.test(before) &&
        before !== ch &&
        before !== "\\" &&
        next !== ch &&
        !(ch === "_" && next !== undefined && /[A-Za-z0-9]/.test(next));
      if (ok) break;
      j += 1;
    }
    const inner = src.slice(i + run, j);
    if (!inner || inner.indexOf("\n\n") !== -1) return null;
    const html = inline(inner, ctx, noLinks);
    const wrapped = run === 1 ? `<em>${html}</em>` : run === 2 ? `<strong>${html}</strong>` : `<strong><em>${html}</em></strong>`;
    return { html: wrapped, end: j + run };
  }

  function pair(src, i, delim, tag, ctx, noLinks) {
    const after = src[i + delim.length];
    if (!after || /\s/.test(after)) return null;
    const j = src.indexOf(delim, i + delim.length);
    if (j === -1 || /\s/.test(src[j - 1])) return null;
    const inner = src.slice(i + delim.length, j);
    if (!inner || inner.indexOf("\n\n") !== -1) return null;
    return { html: `<${tag}>${inline(inner, ctx, noLinks)}</${tag}>`, end: j + delim.length };
  }

  function inline(src, ctx, noLinks) {
    let out = "";
    let buf = "";
    const flush = () => {
      if (buf) out += esc(buf);
      buf = "";
    };
    const n = src.length;
    let i = 0;
    while (i < n) {
      const c = src[i];

      if (c === "\\" && i + 1 < n) {
        const d = src[i + 1];
        if (d === "\n") {
          flush();
          out += "<br>\n";
          i += 2;
          continue;
        }
        if (/[!-\/:-@[-`{-~]/.test(d)) {
          buf += d;
          i += 2;
          continue;
        }
      }

      if (c === "`") {
        let run = 1;
        while (src[i + run] === "`") run++;
        const fence = "`".repeat(run);
        let end = src.indexOf(fence, i + run);
        while (end !== -1 && src[end + run] === "`") end = src.indexOf(fence, end + run + 1);
        if (end !== -1) {
          flush();
          let code = src.slice(i + run, end).replace(/\n/g, " ");
          if (code.length > 2 && code[0] === " " && code[code.length - 1] === " " && code.trim()) code = code.slice(1, -1);
          out += `<code>${esc(code)}</code>`;
          i = end + run;
          continue;
        }
        buf += fence;
        i += run;
        continue;
      }

      if (c === "!" && src[i + 1] === "[") {
        const link = parseLink(src, i + 1);
        if (link) {
          flush();
          out += imageTag(link, ctx);
          i = link.end;
          continue;
        }
      }

      if (c === "[") {
        if (src[i + 1] === "^") {
          const m = /^\[\^([^\]\s]{1,40})\]/.exec(src.slice(i, i + 48));
          if (m) {
            flush();
            out += footnoteRef(m[1], ctx);
            i += m[0].length;
            continue;
          }
        }
        if (!noLinks) {
          const link = parseLink(src, i);
          if (link) {
            flush();
            out += anchorTag(link, ctx);
            i = link.end;
            continue;
          }
        }
      }

      if (c === "<") {
        const rest = src.slice(i, i + 2048);
        let m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest);
        if (m && !noLinks) {
          flush();
          out += autoLink(m[1], m[1].replace(/^mailto:/i, ""), ctx);
          i += m[0].length;
          continue;
        }
        m = INLINE_TAG.exec(rest);
        if (m) {
          flush();
          out += cleanHtml(m[0]);
          i += m[0].length;
          continue;
        }
        m = /^<!--[\s\S]*?-->/.exec(rest);
        if (m) {
          flush();
          i += m[0].length;
          continue;
        }
      }

      if (c === "*" || c === "_") {
        const em = emphasis(src, i, ctx, noLinks);
        if (em) {
          flush();
          out += em.html;
          i = em.end;
          continue;
        }
        // a run of * or _ that isn't emphasis stays as typed
        let run = 1;
        while (src[i + run] === c) run++;
        buf += src.slice(i, i + run);
        i += run;
        continue;
      }

      if ((c === "~" || c === "=") && src[i + 1] === c) {
        const r = pair(src, i, c + c, c === "~" ? "del" : "mark", ctx, noLinks);
        if (r) {
          flush();
          out += r.html;
          i = r.end;
          continue;
        }
      }

      if (!noLinks && (c === "h" || c === "H" || c === "w" || c === "W") && (i === 0 || !/[A-Za-z0-9@./]/.test(src[i - 1]))) {
        const m = URL_CHARS.exec(src.slice(i, i + 2048));
        if (m && (/^https?:\/\/\S/i.test(m[0]) || /^www\.[A-Za-z0-9-]+\.[A-Za-z]/i.test(m[0]))) {
          let url = m[0].replace(/[.,;:!?'")\]]+$/, "");
          // keep a closing parenthesis that belongs to the address, as in .../Afterglow_(physics)
          while (/\)$/.test(m[0].slice(0, url.length + 1)) && (url.match(/\(/g) || []).length > (url.match(/\)/g) || []).length) url += ")";
          flush();
          out += autoLink(/^www\./i.test(url) ? `https://${url}` : url, url, ctx);
          i += url.length;
          continue;
        }
      }

      if (c === "\n") {
        flush();
        out += "<br>\n";
        i++;
        continue;
      }

      buf += c;
      i++;
    }
    flush();
    return out;
  }

  /* Blocks ------------------------------------------------------------------------------------------ */

  const RE = {
    fence: /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/,
    heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/,
    hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
    quote: /^ {0,3}> ?/,
    list: /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*)|$)/,
    footdef: /^ {0,3}\[\^([^\]\s]{1,40})\]:[ \t]*(.*)$/,
    html: /^ {0,3}<(\/?)([a-zA-Z][a-zA-Z0-9-]*|!--)/,
    tableSep: /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
  };

  const BLOCK_TAGS = new Set(
    "address article aside audio blockquote canvas center details dialog div dl dd dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr iframe li main nav ol p picture pre section summary table tbody td tfoot th thead tr ul video svg math style object embed".split(" ")
  );

  const isBlockHtml = (m) => m && (m[2] === "!--" || BLOCK_TAGS.has(m[2].toLowerCase()));

  function splitRow(line) {
    let s = line.trim();
    if (s[0] === "|") s = s.slice(1);
    if (s[s.length - 1] === "|" && s[s.length - 2] !== "\\") s = s.slice(0, -1);
    const cells = [];
    let cur = "";
    let code = false;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === "\\" && s[k + 1] === "|") {
        cur += "|";
        k++;
        continue;
      }
      if (ch === "`") code = !code;
      if (ch === "|" && !code) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function isTableStart(lines, i) {
    return (
      i + 1 < lines.length &&
      lines[i].indexOf("|") !== -1 &&
      RE.tableSep.test(lines[i + 1]) &&
      lines[i + 1].indexOf("-") !== -1 &&
      (lines[i + 1].indexOf("|") !== -1 || splitRow(lines[i]).length === 1)
    );
  }

  function startsBlock(lines, i) {
    const l = lines[i];
    if (RE.fence.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.footdef.test(l)) return true;
    const h = RE.heading.exec(l);
    if (h && h[2]) return true;
    const m = RE.list.exec(l);
    if (m && (m[3] || "").trim() && (!/\d/.test(m[2]) || /^1[.)]$/.test(m[2]))) return true;
    if (isTableStart(lines, i)) return true;
    return isBlockHtml(RE.html.exec(l));
  }

  // An image on its own, or several on consecutive lines, with nothing else on those lines.
  const IMG_ONLY = /^\s*(?:!\[(?:\\.|[^\]\\])*\]\((?:\\.|[^()\\\s]|\((?:\\.|[^()\\])*\))*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)\s*)+$/;

  function figures(text, ctx) {
    const found = [];
    let at = 0;
    for (;;) {
      const k = text.indexOf("![", at);
      if (k === -1) break;
      const link = parseLink(text, k + 1);
      if (!link) break;
      found.push(link);
      at = link.end;
    }
    const one = (link, cls) => {
      const caption = link.text.trim();
      const wide = cls === "md-fig" && /^\s*wide\s*$/i.test(link.title) ? " md-fig--wide" : "";
      return `<figure class="${cls}${wide}">${imageTag(link, ctx)}${caption ? `<figcaption>${inline(caption, ctx)}</figcaption>` : ""}</figure>`;
    };
    if (found.length === 1) return `${one(found[0], "md-fig")}\n`;
    return `<div class="md-gallery md-gallery--${Math.min(found.length, 3)}">${found.map((link) => one(link, "md-gallery__item")).join("")}</div>\n`;
  }

  function paragraph(lines, ctx, tight) {
    if (lines.every((l) => IMG_ONLY.test(l))) return figures(lines.join(" "), ctx);
    const text = lines.map((l) => l.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "")).join("\n");
    const html = inline(text, ctx, false);
    return tight ? `${html}\n` : `<p>${html}</p>\n`;
  }

  function heading(level, text, ctx) {
    const html = inline(text.trim(), ctx, false);
    const plain = toPlain(html);
    const base = slugify(plain) || `section-${ctx.ids.size + 1}`;
    let id = base;
    let n = 1;
    while (ctx.ids.has(id)) id = `${base}-${++n}`;
    ctx.ids.add(id);
    // The post title is the page's only h1, so # in the text is shown the same as ##.
    const shown = Math.max(2, level);
    if (shown <= 3) ctx.toc.push({ level: shown, id, text: plain });
    return `<h${shown} id="${esc(id)}">${html}</h${shown}>\n`;
  }

  function list(lines, start, ctx) {
    const first = RE.list.exec(lines[start]);
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const startNumber = ordered ? parseInt(first[2], 10) : 1;
    const items = [];
    let loose = false;
    let i = start;
    while (i < lines.length) {
      const m = RE.list.exec(lines[i]);
      if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
      if (RE.hr.test(lines[i])) break;
      const contentIndent = m[1].length + m[2].length + 1;
      const body = [m[3] || ""];
      i++;
      let blanks = 0;
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          blanks++;
          i++;
          continue;
        }
        const ind = l.match(/^ */)[0].length;
        if (ind >= contentIndent || (ind > indent && RE.list.test(l))) {
          if (blanks) {
            body.push("");
            if (!RE.list.test(l.slice(Math.min(ind, contentIndent)))) loose = true;
          }
          body.push(l.slice(Math.min(ind, contentIndent)));
          blanks = 0;
          i++;
          continue;
        }
        if (!blanks && !RE.list.test(l) && !startsBlock(lines, i)) {
          body.push(l.trim());
          i++;
          continue;
        }
        break;
      }
      if (blanks && i < lines.length) {
        const next = RE.list.exec(lines[i]);
        if (next && next[1].length === indent && /\d/.test(next[2]) === ordered) loose = true;
      }
      items.push(body);
      if (blanks && !(i < lines.length && RE.list.test(lines[i]) && RE.list.exec(lines[i])[1].length === indent)) break;
    }
    const tag = ordered ? "ol" : "ul";
    let html = `<${tag}${ordered && startNumber !== 1 ? ` start="${startNumber}"` : ""}>\n`;
    for (const body of items) {
      const task = /^\[([ xX])\][ \t]+/.exec(body[0]);
      if (task) body[0] = body[0].slice(task[0].length);
      const inner = blocks(body, ctx, !loose).trim();
      const box = task ? `<input type="checkbox" disabled${task[1] === " " ? "" : " checked"}> ` : "";
      html += `<li${task ? ' class="task"' : ""}>${box}${inner}</li>\n`;
    }
    return { html: `${html}</${tag}>\n`, end: i };
  }

  function table(lines, start, ctx) {
    const head = splitRow(lines[start]);
    const aligns = splitRow(lines[start + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : ""));
    let i = start + 2;
    const rows = [];
    while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") !== -1) {
      rows.push(splitRow(lines[i]));
      i++;
    }
    const cell = (tag, text, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ""}>${inline(text || "", ctx, false)}</${tag}>`;
    let html = `<div class="table-wrap"><table>\n<thead><tr>${head.map((c, k) => cell("th", c, k)).join("")}</tr></thead>\n`;
    if (rows.length) html += `<tbody>\n${rows.map((r) => `<tr>${head.map((_, k) => cell("td", r[k], k)).join("")}</tr>`).join("\n")}\n</tbody>\n`;
    return { html: `${html}</table></div>\n`, end: i };
  }

  function blocks(lines, ctx, tight) {
    let out = "";
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      let m;

      if ((m = RE.fence.exec(line))) {
        const fence = m[1];
        const language = m[2];
        const closer = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
        const code = [];
        i++;
        while (i < lines.length && !closer.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        i++;
        const cls = language ? ` class="language-${esc(language.replace(/[^\w+-]/g, ""))}"` : "";
        out += `<pre class="code"><code${cls}>${esc(code.join("\n"))}</code></pre>\n`;
        continue;
      }

      if ((m = RE.heading.exec(line))) {
        if (m[2] && m[2].trim()) out += heading(m[1].length, m[2], ctx);
        i++;
        continue;
      }

      if (RE.hr.test(line)) {
        out += "<hr>\n";
        i++;
        continue;
      }

      if (RE.quote.test(line)) {
        const inner = [];
        while (i < lines.length && lines[i].trim()) {
          if (RE.quote.test(lines[i])) inner.push(lines[i].replace(RE.quote, ""));
          else if (!startsBlock(lines, i)) inner.push(lines[i]);
          else break;
          i++;
        }
        out += `<blockquote>\n${blocks(inner, ctx, false)}</blockquote>\n`;
        continue;
      }

      if ((m = RE.footdef.exec(line))) {
        const key = m[1].toLowerCase();
        const def = [m[2]];
        i++;
        while (i < lines.length && /^( {2,}|\t)\S/.test(lines[i])) {
          def.push(lines[i].trim());
          i++;
        }
        ctx.fnDefs[key] = def.join("\n");
        continue;
      }

      if (RE.list.test(line) && (RE.list.exec(line)[3] || "").trim()) {
        const r = list(lines, i, ctx);
        out += r.html;
        i = r.end;
        continue;
      }

      if (isTableStart(lines, i)) {
        const r = table(lines, i, ctx);
        out += r.html;
        i = r.end;
        continue;
      }

      if (isBlockHtml(RE.html.exec(line))) {
        const raw = [];
        while (i < lines.length && lines[i].trim()) {
          raw.push(lines[i]);
          i++;
        }
        out += `${cleanHtml(raw.join("\n"))}\n`;
        continue;
      }

      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
        para.push(lines[i]);
        i++;
      }
      out += paragraph(para, ctx, tight);
    }
    return out;
  }

  /* Public ------------------------------------------------------------------------------------------ */

  /**
   * Markdown to HTML.
   * options.resolveImage(src) maps an image path to the address to show (used by the preview).
   * options.origin is this site's address, so its own links don't open a new tab.
   * Returns { html, toc: [{ level, id, text }], images: [paths as written], text: plain text }.
   */
  function render(markdown, options) {
    const opts = options || {};
    const ctx = {
      resolveImage: opts.resolveImage,
      origin: opts.origin || "",
      ids: new Set(),
      toc: [],
      images: [],
      fnOrder: [],
      fnDefs: Object.create(null),
      fnRefs: Object.create(null),
    };
    const source = String(markdown || "")
      .replace(/^﻿/, "")
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ");
    let html = blocks(source.split("\n"), ctx, false);
    if (ctx.fnOrder.length) {
      const items = ctx.fnOrder.map((key, k) => {
        const sid = slugify(key) || String(k + 1);
        const def = ctx.fnDefs[key];
        return `<li id="fn-${sid}">${def ? inline(def, ctx, false) : ""} <a class="fn-back" href="#fnref-${sid}" aria-label="↩">↩</a></li>`;
      });
      html += `<section class="footnotes" role="doc-endnotes">\n<ol>\n${items.join("\n")}\n</ol>\n</section>\n`;
    }
    return { html, toc: ctx.toc, images: ctx.images, text: toPlain(html.replace(/<(\/p|br|\/li|\/h\d|\/figcaption)>/g, "$& ")) };
  }

  /* Front matter, reading time, summaries ------------------------------------------------------------- */

  function parseValue(value) {
    const v = value.trim();
    if (v === "") return "";
    if (/^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
    if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
    if (/^["[{]/.test(v)) {
      try {
        return JSON.parse(v);
      } catch (error) {
        // not JSON after all: keep the text as written
      }
    }
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  }

  function parseFrontMatter(source) {
    const s = String(source || "")
      .replace(/^﻿/, "")
      .replace(/\r\n?/g, "\n");
    const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(s);
    if (!m) return { meta: {}, body: s };
    const meta = {};
    m[1].split("\n").forEach((line) => {
      const k = /^([A-Za-z_][\w-]*)[ \t]*:(.*)$/.exec(line);
      if (k) meta[k[1]] = parseValue(k[2]);
    });
    return { meta, body: s.slice(m[0].length) };
  }

  function stringifyFrontMatter(meta, body) {
    const lines = ["---"];
    Object.keys(meta).forEach((key) => {
      const v = meta[key];
      if (v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && !v.length)) return;
      const plainDate = typeof v === "string" && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(v);
      lines.push(`${key}: ${plainDate || typeof v === "number" || typeof v === "boolean" ? v : JSON.stringify(v)}`);
    });
    lines.push("---", "");
    const text = String(body || "").replace(/^\n+/, "");
    return `${lines.join("\n")}${text}${text.endsWith("\n") ? "" : "\n"}`;
  }

  function normalizeTags(value) {
    const list = Array.isArray(value) ? value : String(value || "").split(/[,，、;；]/);
    const seen = new Set();
    const out = [];
    list.forEach((t) => {
      const tag = String(t).trim().replace(/^#/, "").slice(0, 30);
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        out.push(tag);
      }
    });
    return out.slice(0, 12);
  }

  const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/g;

  function readingMinutes(text) {
    const plain = String(text || "");
    const cjk = (plain.match(CJK) || []).length;
    const words = (plain.replace(CJK, " ").match(/[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*/g) || []).length;
    return Math.max(1, Math.round(cjk / 400 + words / 220));
  }

  function summarize(text, max) {
    const limit = max || 120;
    const plain = String(text || "").replace(/\s+/g, " ").trim();
    if (plain.length <= limit) return plain;
    const cut = plain.slice(0, limit);
    const stop = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"), cut.lastIndexOf(". "));
    return stop > limit * 0.55 ? cut.slice(0, stop + 1) : `${cut.replace(/[\s,，、;；:：]+$/, "")}…`;
  }

  return {
    render,
    parseFrontMatter,
    stringifyFrontMatter,
    normalizeTags,
    readingMinutes,
    summarize,
    slugify,
    esc,
    safeUrl,
    cleanHtml,
    toPlain,
  };
});
