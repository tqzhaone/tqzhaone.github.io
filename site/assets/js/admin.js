/*
 * Admin page of tqzhaone.github.io: write blog posts, post news, upload photos.
 *
 * There is no server of its own. The page talks to the GitHub API with a fine-grained token that
 * can change only this repository, and every save is one commit to main. The deploy workflow then
 * rebuilds the pages (tools/build-site.js) and they are online about a minute later; the page
 * watches for that and says when it's live.
 *
 * The token stays in this browser (localStorage, or sessionStorage if "remember" is off). Drafts
 * are kept on this device too: the text in localStorage, pictures not yet published in IndexedDB.
 *
 *  1. GitHub        6. Router and sign-in
 *  2. Pictures      7. Blog list
 *  3. Drafts        8. Blog editor
 *  4. Commits       9. News
 *  5. Small UI     10. Photos
 */
(function () {
  "use strict";

  const OWNER = "tqzhaone";
  const REPO = "tqzhaone.github.io";
  const BRANCH = "main";
  const API = "https://api.github.com";
  const R = `/repos/${OWNER}/${REPO}`;
  const TOKEN_KEY = "site-admin-token";
  const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
  const RESERVED = ["write", "tag", "tags", "feed", "page", "assets", "posts", "admin"];
  const MD = window.BlogRender;

  const $ = (selector, rootNode) => (rootNode || document).querySelector(selector);
  const $$ = (selector, rootNode) => Array.from((rootNode || document).querySelectorAll(selector));
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const clip = (text, n) => {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
  const plainOf = (md) => (MD ? MD.toPlain(MD.render(md || "").html) : String(md || ""));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach((c) => c !== null && c !== undefined && node.append(c));
    return node;
  }

  /* 1. GitHub -------------------------------------------------------------------------------------- */

  let token = "";
  try {
    token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
  } catch (error) {
    token = "";
  }

  function saveToken(value, remember) {
    token = value;
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, value);
    } catch (error) {
      // storage unavailable: the key lasts until the page is closed
    }
  }

  function forgetToken() {
    token = "";
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      // nothing stored
    }
  }

  class GhError extends Error {
    constructor(status, message) {
      super(message || `GitHub ${status}`);
      this.status = status;
    }
  }

  async function gh(path, options) {
    const o = options || {};
    let response;
    try {
      response = await fetch(API + path, {
        method: o.method || "GET",
        headers: Object.assign(
          { Accept: o.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", Authorization: `Bearer ${token}` },
          o.body ? { "Content-Type": "application/json" } : {}
        ),
        body: o.body ? JSON.stringify(o.body) : undefined,
        cache: "no-store",
      });
    } catch (error) {
      throw new GhError(0, "network");
    }
    if (!response.ok) {
      let message = "";
      try {
        message = (await response.json()).message || "";
      } catch (error) {
        message = "";
      }
      if (response.status === 401) signedOut("密钥失效或已过期，请重新连接。");
      throw new GhError(response.status, message);
    }
    if (response.status === 204) return null;
    return o.raw ? response.text() : response.json();
  }

  const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
  const readText = (path, ref) => gh(`${R}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref || BRANCH)}`, { raw: true });
  const listDir = (path, ref) => gh(`${R}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref || BRANCH)}`);

  async function readJson(path, fallback, ref) {
    try {
      return JSON.parse(await readText(path, ref));
    } catch (error) {
      if (error instanceof GhError && error.status !== 404) throw error;
      return fallback;
    }
  }

  function explain(error) {
    if (!(error instanceof GhError)) return `出错了：${(error && error.message) || "未知原因"}。请再试一次。`;
    if (error.status === 0) return "连不上 GitHub，检查一下网络再试。";
    if (error.status === 401) return "密钥失效或已过期，请重新连接。";
    if (error.status === 403) {
      return /rate limit/i.test(error.message)
        ? "GitHub 的调用次数暂时用完了，过几分钟再试。"
        : "这个密钥没有修改权限：生成密钥时 Contents 要选 Read and write。";
    }
    if (error.status === 404) return "找不到仓库：生成密钥时要勾选 tqzhaone.github.io。";
    if (error.status === 409 || error.status === 422) return "提交时仓库正好有别的改动，请再点一次。";
    return `GitHub 返回了错误（${error.status}）：${error.message || "未知原因"}`;
  }

  /* 2. Pictures ------------------------------------------------------------------------------------ */

  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" };

  async function decode(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (error) {
        // fall back to an <img>
      }
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw new Error("这张图片打不开，换一张试试");
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return img;
  }

  const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  // Shrinks a picture so its long side is at most `max` pixels and saves it as WebP (JPEG where the
  // browser can't write WebP). GIFs and SVGs are kept as they are.
  async function shrink(file, max, quality) {
    if (!/^image\//.test(file.type)) throw new Error("只能上传图片");
    if (file.type === "image/gif" || file.type === "image/svg+xml") {
      const img = await decode(file);
      return { blob: file, ext: EXT[file.type], w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
    }
    const source = await decode(file);
    const w0 = source.naturalWidth || source.width;
    const h0 = source.naturalHeight || source.height;
    const scale = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    if (source.close) source.close();
    let blob = await canvasBlob(canvas, "image/webp", quality);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      blob = await canvasBlob(canvas, "image/jpeg", quality);
      ext = "jpg";
    }
    if (!blob) throw new Error("图片处理失败，换一张试试");
    if (scale === 1 && file.size <= blob.size && EXT[file.type] && file.type !== "image/avif") {
      return { blob: file, ext: EXT[file.type], w, h };
    }
    return { blob, ext, w, h };
  }

  // The day a photo was taken, from its EXIF data (JPEG), or else the file's date.
  async function takenOn(file) {
    try {
      if (file.type === "image/jpeg") {
        const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
        if (v.getUint16(0) === 0xffd8) {
          let off = 2;
          while (off + 10 < v.byteLength) {
            const marker = v.getUint16(off);
            const len = v.getUint16(off + 2);
            if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
              const tiff = off + 10;
              const little = v.getUint16(tiff) === 0x4949;
              const u16 = (o) => v.getUint16(o, little);
              const u32 = (o) => v.getUint32(o, little);
              const ascii = (o) => {
                let s = "";
                for (let k = 0; k < 19; k++) s += String.fromCharCode(v.getUint8(o + k));
                return s;
              };
              let found = "";
              let exif = 0;
              const ifd0 = tiff + u32(tiff + 4);
              for (let k = 0, n = u16(ifd0); k < n; k++) {
                const e = ifd0 + 2 + k * 12;
                if (u16(e) === 0x8769) exif = u32(e + 8);
                if (u16(e) === 0x0132) found = ascii(tiff + u32(e + 8));
              }
              if (exif) {
                const ifd = tiff + exif;
                for (let k = 0, n = u16(ifd); k < n; k++) {
                  const e = ifd + 2 + k * 12;
                  if (u16(e) === 0x9003) found = ascii(tiff + u32(e + 8));
                }
              }
              const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(found);
              if (m && m[1] !== "0000") return `${m[1]}-${m[2]}-${m[3]}`;
              break;
            }
            if ((marker & 0xff00) !== 0xff00) break;
            off += 2 + len;
          }
        }
      }
    } catch (error) {
      // no readable EXIF
    }
    const d = new Date(file.lastModified || Date.now());
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const toBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const kb = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  /* 3. Drafts on this device ----------------------------------------------------------------------- */

  const drafts = {
    key: (k) => `admin-draft:${k}`,
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(this.key(k)) || "null");
      } catch (error) {
        return null;
      }
    },
    set(k, value) {
      try {
        localStorage.setItem(this.key(k), JSON.stringify(value));
        return true;
      } catch (error) {
        return false;
      }
    },
    drop(k) {
      try {
        localStorage.removeItem(this.key(k));
      } catch (error) {
        // nothing stored
      }
      pictures.clear(`${k}/`);
    },
    all() {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.indexOf("admin-draft:") === 0) {
            const value = this.get(key.slice(12));
            if (value) out.push({ k: key.slice(12), value });
          }
        }
      } catch (error) {
        // storage unavailable
      }
      return out.sort((a, b) => (b.value.saved || 0) - (a.value.saved || 0));
    },
  };

  // Pictures of a draft that aren't published yet, kept in IndexedDB so a reload doesn't lose them.
  const pictures = (function () {
    let opened = null;
    const open = () =>
      opened ||
      (opened = new Promise((resolve, reject) => {
        const request = indexedDB.open("site-admin", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("images");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }));
    const run = async (mode, work) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction("images", mode);
        const result = work(t.objectStore("images"));
        t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
        t.onerror = () => reject(t.error);
      });
    };
    return {
      put: (key, value) => run("readwrite", (store) => store.put(value, key)).catch(() => {}),
      del: (key) => run("readwrite", (store) => store.delete(key)).catch(() => {}),
      async list(prefix) {
        try {
          const db = await open();
          return await new Promise((resolve) => {
            const out = [];
            const request = db.transaction("images").objectStore("images").openCursor();
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) return resolve(out);
              if (String(cursor.key).indexOf(prefix) === 0) out.push([String(cursor.key), cursor.value]);
              cursor.continue();
            };
            request.onerror = () => resolve(out);
          });
        } catch (error) {
          return [];
        }
      },
      async clear(prefix) {
        const items = await this.list(prefix);
        for (const [key] of items) await this.del(key);
      },
    };
  })();

  /* 4. Commits ------------------------------------------------------------------------------------- */

  // One commit to main with new files (text or pictures), files removed, and JSON files changed by
  // `mutate` (applied to the newest version, so two devices can't overwrite each other's items).
  async function commit(job, progress) {
    const files = job.files || [];
    const blobs = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (progress) progress(i, files.length);
      const body = f.text !== undefined ? { content: f.text, encoding: "utf-8" } : { content: await toBase64(f.blob), encoding: "base64" };
      const blob = await gh(`${R}/git/blobs`, { method: "POST", body });
      blobs.push({ path: f.path, sha: blob.sha });
    }
    if (progress) progress(files.length, files.length);

    for (let attempt = 0; ; attempt++) {
      const head = (await gh(`${R}/git/ref/heads/${BRANCH}`)).object.sha;
      const base = await gh(`${R}/git/commits/${head}`);
      const tree = blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha }));
      const json = {};
      for (const j of job.json || []) {
        const next = j.mutate(await readJson(j.path, j.fallback, head));
        const text = `${JSON.stringify(next, null, 1)}\n`;
        const blob = await gh(`${R}/git/blobs`, { method: "POST", body: { content: text, encoding: "utf-8" } });
        tree.push({ path: j.path, mode: "100644", type: "blob", sha: blob.sha });
        json[j.path] = { sha: blob.sha, data: next };
      }
      // Only files that are really there can be removed.
      const byDir = new Map();
      (job.remove || []).forEach((p) => {
        const dir = p.slice(0, p.lastIndexOf("/"));
        if (!byDir.has(dir)) byDir.set(dir, []);
        byDir.get(dir).push(p);
      });
      for (const [dir, paths] of byDir) {
        let present = [];
        try {
          const entries = await listDir(dir, head);
          present = Array.isArray(entries) ? entries.map((e) => e.path) : [];
        } catch (error) {
          if (!(error instanceof GhError) || error.status !== 404) throw error;
        }
        paths.filter((p) => present.indexOf(p) !== -1 && !tree.some((t) => t.path === p)).forEach((p) => tree.push({ path: p, mode: "100644", type: "blob", sha: null }));
      }
      if (!tree.length) return { commit: head, blobs, json };
      const newTree = await gh(`${R}/git/trees`, { method: "POST", body: { base_tree: base.tree.sha, tree } });
      const made = await gh(`${R}/git/commits`, { method: "POST", body: { message: job.message, tree: newTree.sha, parents: [head] } });
      try {
        await gh(`${R}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: made.sha } });
        return { commit: made.sha, blobs, json };
      } catch (error) {
        // Someone else committed in between: build the same change on top of theirs.
        if (error instanceof GhError && (error.status === 422 || error.status === 409) && attempt < 3) continue;
        throw error;
      }
    }
  }

  // Waits until the published page shows this version (or is gone), up to about six minutes.
  async function waitLive(url, test) {
    const started = Date.now();
    await sleep(25000);
    while (Date.now() - started < 6 * 60 * 1000) {
      try {
        const response = await fetch(`${url}${url.indexOf("?") === -1 ? "?" : "&"}t=${Date.now()}`, { cache: "no-store" });
        if (await test(response)) return true;
      } catch (error) {
        // not there yet
      }
      await sleep(8000);
    }
    return false;
  }

  const hasVersion = (sha) => async (response) => response.ok && (await response.text()).indexOf(`name="content-version" content="${sha}"`) !== -1;
  const isGone = async (response) => response.status === 404;

  function announceLive(url, test, what) {
    waitLive(url, test).then((ok) => {
      if (ok) toast(`${what}已经上线。`, url, "打开看看");
      else toast(`${what}已提交，但还没看到上线。可以过几分钟刷新网站看看。`);
    });
  }

  /* 5. Small UI ------------------------------------------------------------------------------------ */

  const toastBox = $("[data-toast]");
  let toastTimer = 0;
  function toast(text, href, label) {
    toastBox.textContent = "";
    toastBox.append(el("span", { text }));
    if (href) toastBox.append(el("a", { href, target: "_blank", rel: "noopener", text: label || "打开" }));
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastBox.hidden = true), 9000);
  }

  const dialog = $("[data-dialog]");
  function ask(text, detail, okLabel) {
    $("[data-dialog-text]").textContent = text;
    const body = $("[data-dialog-body]");
    body.textContent = detail || "";
    body.hidden = !detail;
    $("[data-dialog-ok]").textContent = okLabel || "确定";
    if (!dialog || typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(`${text}\n\n${detail || ""}`));
    return new Promise((resolve) => {
      dialog.returnValue = "";
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
      dialog.showModal();
    });
  }

  function say(node, text, kind) {
    if (!node) return;
    node.textContent = text || "";
    node.dataset.kind = kind || "";
  }

  function busy(buttons, on) {
    buttons.forEach((b) => {
      if (b) b.disabled = on;
    });
  }

  /* 6. Router and sign-in -------------------------------------------------------------------------- */

  const views = new Map($$("[data-view]").map((v) => [v.dataset.view, v]));
  const tabs = $("[data-tabs]");
  const logout = $("[data-logout]");
  let wanted = "";

  function show(name) {
    views.forEach((view, key) => (view.hidden = key !== name));
    const tab = name === "editor" ? "blog" : name;
    $$("[data-tab]").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
    window.scrollTo(0, 0);
  }

  function route() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!token) {
      wanted = hash;
      tabs.hidden = true;
      logout.hidden = true;
      show("login");
      return;
    }
    tabs.hidden = false;
    logout.hidden = false;
    if (hash === "blog/new") openEditor(null);
    else if (hash.indexOf("blog/edit/") === 0) openEditor(hash.slice(10));
    else if (hash === "news") openNews();
    else if (hash === "photos") openPhotos();
    else openBlog();
  }

  function signedOut(message) {
    forgetToken();
    say($("[data-login-status]"), message, "error");
    route();
  }

  $("[data-login]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = form.token.value.trim();
    const status = $("[data-login-status]");
    if (!value) return say(status, "先粘贴密钥。", "error");
    if (!/^[A-Za-z0-9_]{20,}$/.test(value)) return say(status, "这看起来不像 GitHub 密钥：它应该以 github_pat_ 开头，中间没有空格。", "error");
    const button = form.querySelector("button");
    busy([button], true);
    say(status, "正在连接 GitHub……");
    token = value;
    try {
      const repo = await gh(R);
      if (String(repo.full_name).toLowerCase() !== `${OWNER}/${REPO}`.toLowerCase()) throw new GhError(404, "");
      saveToken(value, form.remember.checked);
      form.reset();
      say(status, "");
      if (location.hash.replace(/^#/, "") !== wanted && wanted) location.hash = wanted;
      else route();
    } catch (error) {
      token = "";
      say(status, explain(error), "error");
    } finally {
      busy([button], false);
    }
  });

  logout.addEventListener("click", async () => {
    if (!(await ask("在这台设备上退出？", "退出后要重新粘贴密钥才能修改网站。本机草稿会保留。", "退出"))) return;
    forgetToken();
    location.hash = "";
    route();
  });

  window.addEventListener("hashchange", () => {
    if (skipRoute) {
      skipRoute = false;
      return;
    }
    route();
  });
  let skipRoute = false;

  /* 7. Blog list ----------------------------------------------------------------------------------- */

  const blog = { posts: new Map(), loaded: false };

  async function loadPosts() {
    const tree = await gh(`${R}/git/trees/${BRANCH}?recursive=1`);
    const posts = new Map();
    (tree.tree || []).forEach((entry) => {
      const m = /^site\/blog\/([^/]+)\/([^/]+)$/.exec(entry.path);
      if (!m || entry.type !== "blob") return;
      if (!posts.has(m[1])) posts.set(m[1], { slug: m[1], files: [], md: null });
      const post = posts.get(m[1]);
      post.files.push({ name: m[2], path: entry.path, sha: entry.sha, size: entry.size });
      if (m[2] === "index.md") post.md = entry.sha;
    });
    [...posts.keys()].forEach((slug) => {
      if (!posts.get(slug).md) posts.delete(slug);
    });
    blog.posts = posts;
    blog.loaded = true;
    return posts;
  }

  async function openBlog() {
    show("blog");
    const list = $("[data-blog-list]");
    const state = $("[data-blog-state]");
    renderDrafts();
    say(state, "正在读取文章……");
    try {
      await loadPosts();
      let live = [];
      try {
        const response = await fetch(`/blog/posts.json?t=${Date.now()}`, { cache: "no-store" });
        if (response.ok) live = await response.json();
      } catch (error) {
        live = [];
      }
      const liveBy = new Map(live.map((p) => [p.slug, p]));
      const rows = [];
      for (const post of blog.posts.values()) {
        let meta = liveBy.get(post.slug);
        if (!meta || meta.version !== post.md) {
          try {
            const parsed = MD.parseFrontMatter(await readText(`site/blog/${post.slug}/index.md`));
            meta = { title: parsed.meta.title, date: String(parsed.meta.date || ""), draft: parsed.meta.draft === true };
          } catch (error) {
            meta = meta || { title: post.slug, date: "" };
          }
        }
        const isLive = liveBy.has(post.slug) && liveBy.get(post.slug).version === post.md;
        rows.push({ post, meta, isLive });
      }
      rows.sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));
      list.textContent = "";
      rows.forEach(({ post, meta, isLive }) => {
        const del = el("button", { class: "btn btn--quiet btn--small", type: "button", text: "删除" });
        del.addEventListener("click", () => deletePost(post.slug, meta.title || post.slug));
        list.append(
          el("li", { class: "row" }, [
            el("div", { class: "row__main" }, [
              el("a", { class: "row__title", href: `#blog/edit/${encodeURIComponent(post.slug)}`, text: meta.title || post.slug }),
              el("span", { class: "row__meta" }, [
                el("span", { text: meta.date || "" }),
                el("span", { class: `pill ${isLive ? "pill--live" : "pill--wait"}`, text: isLive ? "已上线" : "等待上线" }),
                el("span", { class: "muted", text: `/blog/${post.slug}/` }),
              ]),
            ]),
            el("div", { class: "row__actions" }, [
              el("a", { class: "btn btn--small", href: `#blog/edit/${encodeURIComponent(post.slug)}`, text: "编辑" }),
              el("a", { class: "btn btn--quiet btn--small", href: `/blog/${post.slug}/`, target: "_blank", rel: "noopener", text: "查看" }),
              del,
            ]),
          ])
        );
      });
      say(state, rows.length ? "" : "还没有文章。点右上角「写新文章」开始。");
    } catch (error) {
      say(state, explain(error), "error");
    }
  }

  function renderDrafts() {
    const box = $("[data-drafts]");
    const items = drafts.all();
    box.textContent = "";
    box.hidden = !items.length;
    if (!items.length) return;
    box.append(el("p", { class: "drafts__title", text: "本机草稿（还没发布）" }));
    items.forEach(({ k, value }) => {
      const when = value.saved ? new Date(value.saved) : null;
      const drop = el("button", { class: "btn btn--quiet btn--small", type: "button", text: "丢弃" });
      drop.addEventListener("click", async () => {
        if (!(await ask("丢弃这份草稿？", "只删除这台设备上的草稿，线上文章不受影响。", "丢弃"))) return;
        drafts.drop(k);
        renderDrafts();
      });
      box.append(
        el("div", { class: "row row--draft" }, [
          el("div", { class: "row__main" }, [
            el("a", { class: "row__title", href: k === "new" ? "#blog/new" : `#blog/edit/${encodeURIComponent(k)}`, text: value.title || "（还没有标题）" }),
            el("span", { class: "row__meta" }, [
              el("span", { text: k === "new" ? "新文章" : "修改中" }),
              el("span", { class: "muted", text: when ? `保存于 ${when.getMonth() + 1} 月 ${when.getDate()} 日 ${pad(when.getHours())}:${pad(when.getMinutes())}` : "" }),
            ]),
          ]),
          el("div", { class: "row__actions" }, [el("a", { class: "btn btn--small", href: k === "new" ? "#blog/new" : `#blog/edit/${encodeURIComponent(k)}`, text: "继续写" }), drop]),
        ])
      );
    });
  }

  async function deletePost(slug, title) {
    if (!(await ask(`删除《${title}》？`, "文章和它的图片都会从网站上删掉。删除后网站上就看不到了，只能从 GitHub 的历史记录里找回。", "删除"))) return false;
    const state = $("[data-blog-state]");
    say(state, "正在删除……");
    try {
      const entries = await listDir(`site/blog/${slug}`);
      const paths = (Array.isArray(entries) ? entries : []).filter((e) => e.type === "file").map((e) => e.path);
      await commit({ message: `博客：删除《${title}》`, remove: paths });
      drafts.drop(slug);
      say(state, "");
      toast(`《${title}》已删除，大约 1 分钟后从网站上消失。`);
      announceLive(`/blog/${slug}/`, isGone, `删除《${title}》`);
      if (location.hash !== "#blog") location.hash = "#blog";
      else openBlog();
      return true;
    } catch (error) {
      say(state, explain(error), "error");
      return false;
    }
  }

  /* 8. Blog editor --------------------------------------------------------------------------------- */

  const form = $("[data-editor]");
  const body = form.body;
  const preview = $("[data-preview]");
  const panes = $("[data-panes]");
  const status = $("[data-editor-status]");
  const notice = $("[data-editor-notice]");
  const imageInput = $("[data-image-input]");
  const ed = { key: "new", slug: "", isNew: true, base: "", existing: new Map(), pending: new Map(), removed: new Set(), slugTouched: false, loading: false, version: 0 };

  function editorValues() {
    return {
      title: form.title.value.trim(),
      date: form.date.value,
      slug: form.slug.value.trim(),
      tags: form.tags.value,
      summary: form.summary.value.trim(),
      cover: form.cover.value,
      lang: form.lang.value,
      pinned: form.pinned.checked,
      body: body.value,
    };
  }

  function fillEditor(v) {
    form.title.value = v.title || "";
    form.date.value = v.date || today();
    form.slug.value = v.slug || "";
    form.tags.value = Array.isArray(v.tags) ? v.tags.join(", ") : v.tags || "";
    form.summary.value = v.summary || "";
    form.lang.value = v.lang === "en" ? "en" : "zh";
    form.pinned.checked = v.pinned === true;
    body.value = v.body || "";
    refreshImages(v.cover || "");
    renderPreview();
  }

  const imageNames = () => [...new Set([...ed.existing.keys(), ...ed.pending.keys()])].filter((n) => !ed.removed.has(n));

  function imageUrl(name) {
    if (ed.pending.has(name)) return ed.pending.get(name).url;
    if (ed.existing.has(name)) return `/blog/${ed.slug}/${name}`;
    return name;
  }

  function refreshImages(keepCover) {
    const cover = keepCover !== undefined ? keepCover : form.cover.value;
    const names = imageNames();
    form.cover.textContent = "";
    form.cover.append(el("option", { value: "", text: "自动（正文第一张图）" }));
    names.forEach((n) => form.cover.append(el("option", { value: n, text: n })));
    form.cover.value = names.indexOf(cover) !== -1 ? cover : "";
    const box = $("[data-images]");
    const list = $("[data-image-list]");
    list.textContent = "";
    box.hidden = !names.length;
    const used = new Set(MD.render(body.value).images);
    names.forEach((n) => {
      const remove = el("button", { class: "images__x", type: "button", title: "从这篇文章删掉这张图", text: "×" });
      remove.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (used.has(n) && !(await ask("删掉这张图？", "正文里还在用它，删掉后那里会显示不出来。", "删掉"))) return;
        if (ed.pending.has(n)) {
          URL.revokeObjectURL(ed.pending.get(n).url);
          ed.pending.delete(n);
          pictures.del(`${ed.key}/${n}`);
        } else ed.removed.add(n);
        touched();
        refreshImages();
        renderPreview();
      });
      const item = el("li", { class: `images__item${used.has(n) ? "" : " is-unused"}`, title: used.has(n) ? n : `${n}（正文里还没用到）` }, [
        el("img", { src: imageUrl(n), alt: "", loading: "lazy" }),
        remove,
      ]);
      item.addEventListener("click", () => insertBlock(`![](${n})`));
      list.append(item);
    });
  }

  let previewTimer = 0;
  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const out = MD.render(body.value, { resolveImage: imageUrl, origin: location.origin });
      preview.innerHTML = out.html || '<p class="muted">预览会显示在这里。</p>';
      preview.setAttribute("lang", form.lang.value === "en" ? "en" : "zh-CN");
    }, 120);
  }

  let saveTimer = 0;
  function touched() {
    ed.version++;
    say(status, "");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(true), 900);
  }

  function saveDraft(quiet) {
    const v = editorValues();
    const ok = drafts.set(ed.key, Object.assign(v, { saved: Date.now(), base: ed.base, removed: [...ed.removed], pending: [...ed.pending.keys()] }));
    const t = new Date();
    if (ok) say(status, `${quiet ? "已自动存成" : "已存成"}本机草稿 ${pad(t.getHours())}:${pad(t.getMinutes())}`);
    else say(status, "草稿没存上：这台设备的浏览器不让保存。", "error");
  }

  async function restorePending(key) {
    for (const [fullKey, value] of await pictures.list(`${key}/`)) {
      const name = fullKey.slice(key.length + 1);
      if (value && value.blob && !ed.pending.has(name)) ed.pending.set(name, { blob: value.blob, url: URL.createObjectURL(value.blob) });
    }
  }

  function resetEditor() {
    ed.pending.forEach((p) => URL.revokeObjectURL(p.url));
    Object.assign(ed, { key: "new", slug: "", isNew: true, base: "", existing: new Map(), pending: new Map(), removed: new Set(), slugTouched: false, version: 0 });
    notice.hidden = true;
    say(status, "");
  }

  function showNotice(text, actions) {
    notice.textContent = "";
    notice.append(el("span", { text }));
    (actions || []).forEach(([label, fn]) => notice.append(el("button", { class: "btn btn--small", type: "button", text: label, onclick: fn })));
    notice.hidden = false;
  }

  async function suggestSlug(date) {
    if (!blog.loaded) {
      try {
        await loadPosts();
      } catch (error) {
        // checked again when publishing
      }
    }
    const base = (date || today()).replace(/[^0-9-]/g, "");
    let slug = base;
    for (let n = 2; blog.posts.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  }

  // While a post loads, the form can't be typed into (the loaded text would replace what was typed).
  function ready(on) {
    ed.loading = !on;
    form.inert = !on;
    form.classList.toggle("is-loading", !on);
    if (on) form.dataset.ready = "1";
    else delete form.dataset.ready;
  }

  async function openEditor(slug) {
    show("editor");
    resetEditor();
    ready(false);
    const title = $("[data-editor-title]");
    const live = $("[data-editor-live]");
    const del = $("[data-delete]");
    form.slug.readOnly = Boolean(slug);
    if (!slug) {
      title.textContent = "写新文章";
      live.hidden = true;
      del.hidden = true;
      $("[data-publish]").textContent = "发布";
      const draft = drafts.get("new");
      await restorePending("new");
      if (draft) {
        (draft.removed || []).forEach((n) => ed.removed.add(n));
        fillEditor(draft);
        ed.slugTouched = Boolean(draft.slug);
        showNotice("已恢复上次没发布的草稿。", [
          [
            "丢弃草稿，重新开始",
            async () => {
              if (!(await ask("丢弃这份草稿？", "", "丢弃"))) return;
              drafts.drop("new");
              openEditor(null);
            },
          ],
        ]);
      } else {
        fillEditor({ date: today() });
      }
      if (!form.slug.value) form.slug.value = await suggestSlug(form.date.value);
      $("[data-slug-hint]").textContent = `/blog/${form.slug.value || "…"}/`;
      ready(true);
      form.title.focus();
      return;
    }

    title.textContent = "修改文章";
    $("[data-publish]").textContent = "更新";
    live.hidden = false;
    live.href = `/blog/${slug}/`;
    del.hidden = false;
    ed.key = slug;
    ed.slug = slug;
    ed.isNew = false;
    say(status, "正在读取文章……");
    try {
      const [text, entries] = await Promise.all([readText(`site/blog/${slug}/index.md`), listDir(`site/blog/${slug}`)]);
      (Array.isArray(entries) ? entries : []).forEach((e) => {
        if (e.type !== "file") return;
        if (e.name === "index.md") ed.base = e.sha;
        else if (e.name !== "index.html") ed.existing.set(e.name, { path: e.path, size: e.size });
      });
      const { meta, body: markdown } = MD.parseFrontMatter(text);
      const online = { title: meta.title, date: String(meta.date || "").slice(0, 10), slug, tags: MD.normalizeTags(meta.tags), summary: meta.summary, cover: meta.cover, lang: meta.lang, pinned: meta.pinned === true, body: markdown.replace(/^\n+/, "") };
      ed.meta = meta;
      const draft = drafts.get(slug);
      if (draft) {
        fillEditor(online);
        showNotice(draft.base === ed.base ? "这篇文章在本机有一份没发布的草稿。" : "这篇文章在本机有一份旧草稿，线上版本后来又改过。", [
          [
            "恢复草稿",
            async () => {
              await restorePending(slug);
              (draft.removed || []).forEach((n) => ed.removed.add(n));
              fillEditor(draft);
              notice.hidden = true;
              say(status, "已恢复草稿。");
            },
          ],
          [
            "丢弃草稿",
            async () => {
              if (!(await ask("丢弃这份草稿？", "线上文章不受影响。", "丢弃"))) return;
              drafts.drop(slug);
              notice.hidden = true;
            },
          ],
        ]);
      } else {
        fillEditor(online);
      }
      $("[data-slug-hint]").textContent = `/blog/${slug}/`;
      say(status, "");
    } catch (error) {
      say(status, error instanceof GhError && error.status === 404 ? "找不到这篇文章，可能已经删除了。" : explain(error), "error");
    }
    ready(true);
  }

  // Editing helpers
  function insertBlock(text) {
    const before = body.value.slice(0, body.selectionStart);
    const after = body.value.slice(body.selectionEnd);
    const lead = !before || /\n\n$/.test(before) ? "" : /\n$/.test(before) ? "\n" : "\n\n";
    const tail = !after ? "\n" : /^\n\n/.test(after) ? "" : /^\n/.test(after) ? "\n" : "\n\n";
    insertText(lead + text + tail);
  }

  function insertText(text, selectFrom, selectTo) {
    const start = body.selectionStart;
    body.setRangeText(text, start, body.selectionEnd, "end");
    if (selectFrom !== undefined) body.setSelectionRange(start + selectFrom, start + selectTo);
    body.focus();
    onBody();
  }

  function wrap(before, after, placeholder) {
    const s = body.selectionStart;
    const e = body.selectionEnd;
    const selected = body.value.slice(s, e) || placeholder;
    body.setRangeText(before + selected + after, s, e, "end");
    body.setSelectionRange(s + before.length, s + before.length + selected.length);
    body.focus();
    onBody();
  }

  function eachLine(make) {
    const v = body.value;
    const start = v.lastIndexOf("\n", body.selectionStart - 1) + 1;
    let end = v.indexOf("\n", body.selectionEnd);
    if (end === -1) end = v.length;
    const lines = v.slice(start, end).split("\n");
    body.setRangeText(lines.map(make).join("\n"), start, end, "select");
    body.focus();
    onBody();
  }

  const FORMAT = {
    h2: () => eachLine((l) => (/^##\s/.test(l) ? l.replace(/^##\s+/, "") : `## ${l.replace(/^#+\s*/, "")}`)),
    bold: () => wrap("**", "**", "粗体文字"),
    italic: () => wrap("*", "*", "斜体文字"),
    quote: () => eachLine((l) => (/^>\s?/.test(l) ? l.replace(/^>\s?/, "") : `> ${l}`)),
    ul: () => eachLine((l) => (/^-\s/.test(l) ? l.slice(2) : `- ${l.replace(/^\d+\.\s/, "")}`)),
    ol: () => eachLine((l, i) => (/^\d+\.\s/.test(l) ? l.replace(/^\d+\.\s/, "") : `${i + 1}. ${l.replace(/^-\s/, "")}`)),
    link: () => {
      const s = body.selectionStart;
      const e = body.selectionEnd;
      const text = body.value.slice(s, e) || "链接文字";
      const insert = `[${text}](https://)`;
      body.setRangeText(insert, s, e, "end");
      body.setSelectionRange(s + text.length + 3, s + insert.length - 1);
      body.focus();
      onBody();
    },
    image: () => imageInput.click(),
    hr: () => insertBlock("---"),
  };

  $$("[data-md]").forEach((button) => button.addEventListener("click", () => FORMAT[button.dataset.md]()));
  body.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const k = event.key.toLowerCase();
    if (k === "b") {
      event.preventDefault();
      FORMAT.bold();
    } else if (k === "i") {
      event.preventDefault();
      FORMAT.italic();
    } else if (k === "s") {
      event.preventDefault();
      saveDraft(false);
    }
  });

  function onBody() {
    if (ed.loading) return;
    renderPreview();
    touched();
    clearTimeout(onBody.timer);
    onBody.timer = setTimeout(() => refreshImages(), 400);
  }
  body.addEventListener("input", onBody);
  ["title", "tags", "summary", "cover", "lang", "pinned"].forEach((name) =>
    form[name].addEventListener("input", () => {
      if (ed.loading) return;
      if (name === "lang") renderPreview();
      touched();
    })
  );
  form.date.addEventListener("input", async () => {
    if (ed.loading) return;
    touched();
    if (ed.isNew && !ed.slugTouched) {
      form.slug.value = await suggestSlug(form.date.value);
      $("[data-slug-hint]").textContent = `/blog/${form.slug.value}/`;
    }
  });
  form.slug.addEventListener("input", () => {
    if (form.slug.readOnly) return;
    const clean = form.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-/, "");
    if (clean !== form.slug.value) form.slug.value = clean;
    ed.slugTouched = true;
    $("[data-slug-hint]").textContent = `/blog/${clean || "…"}/`;
    touched();
  });

  // Panes: on a phone you switch between writing and the preview; on a wide screen both show.
  $$("[data-pane]").forEach((button) =>
    button.addEventListener("click", () => {
      panes.dataset.show = button.dataset.pane;
      $$("[data-pane]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      if (button.dataset.pane === "preview") renderPreview();
    })
  );

  // Pictures: the button, pasting, or dropping files on the text.
  async function addImages(files) {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    for (let i = 0; i < list.length; i++) {
      say(status, `正在处理图片 ${i + 1}/${list.length}……`);
      try {
        const out = await shrink(list[i], 1800, 0.84);
        const name = `${uid("img-")}.${out.ext}`;
        ed.pending.set(name, { blob: out.blob, url: URL.createObjectURL(out.blob) });
        pictures.put(`${ed.key}/${name}`, { blob: out.blob });
        insertBlock(`![](${name})`);
      } catch (error) {
        say(status, `有一张图片没加上：${error.message}`, "error");
      }
    }
    say(status, `已插入 ${list.length} 张图片。方括号里可以写图注。`);
    refreshImages();
  }
  imageInput.addEventListener("change", () => {
    addImages(imageInput.files);
    imageInput.value = "";
  });
  body.addEventListener("paste", (event) => {
    const files = event.clipboardData && event.clipboardData.files;
    if (files && files.length) {
      event.preventDefault();
      addImages(files);
    }
  });
  body.addEventListener("dragover", (event) => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf("Files") !== -1) {
      event.preventDefault();
      body.classList.add("is-drop");
    }
  });
  body.addEventListener("dragleave", () => body.classList.remove("is-drop"));
  body.addEventListener("drop", (event) => {
    body.classList.remove("is-drop");
    if (event.dataTransfer && event.dataTransfer.files.length) {
      event.preventDefault();
      addImages(event.dataTransfer.files);
    }
  });

  $("[data-save-draft]").addEventListener("click", () => saveDraft(false));
  $("[data-delete]").addEventListener("click", async () => {
    const done = await deletePost(ed.slug, form.title.value.trim() || ed.slug);
    if (done) resetEditor();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const v = editorValues();
    if (!v.title) return say(status, "先写个标题。", "error"), form.title.focus();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return say(status, "日期不对。", "error"), form.date.focus();
    if (!v.body.trim()) return say(status, "正文还是空的。", "error"), body.focus();
    if (ed.isNew) {
      if (!SLUG.test(v.slug) || RESERVED.indexOf(v.slug) !== -1) return say(status, "网址只能用小写字母、数字和连字符，比如 2026-11-26 或 afterglow-notes。", "error"), form.slug.focus();
    }
    const buttons = [$("[data-publish]"), $("[data-save-draft]"), $("[data-delete]")];
    busy(buttons, true);
    try {
      if (ed.isNew) {
        await loadPosts();
        if (blog.posts.has(v.slug)) {
          say(status, `网址 /blog/${v.slug}/ 已经有文章了，换一个。`, "error");
          busy(buttons, false);
          return;
        }
      }
      const slug = ed.isNew ? v.slug : ed.slug;
      const used = new Set(MD.render(v.body).images.filter((src) => src.indexOf("/") === -1));
      if (v.cover) used.add(v.cover);
      const missing = [...used].filter((n) => !ed.pending.has(n) && !ed.existing.has(n) && /\.(webp|jpe?g|png|gif|svg|avif)$/i.test(n));
      if (missing.length && !(await ask("有图片找不到", `正文里用到的 ${missing.join("、")} 不在这篇文章里，发布后那里会显示不出来。仍然发布吗？`, "仍然发布"))) {
        busy(buttons, false);
        return;
      }
      const meta = {
        title: v.title,
        date: v.date,
        updated: ed.isNew || v.date === today() ? undefined : today(),
        tags: MD.normalizeTags(v.tags),
        summary: v.summary || undefined,
        cover: v.cover || undefined,
        pinned: v.pinned || undefined,
        lang: v.lang === "en" ? "en" : undefined,
      };
      const text = MD.stringifyFrontMatter(meta, v.body.replace(/\s+$/, "") + "\n");
      const files = [{ path: `site/blog/${slug}/index.md`, text }];
      [...ed.pending.keys()].filter((n) => used.has(n)).forEach((n) => files.push({ path: `site/blog/${slug}/${n}`, blob: ed.pending.get(n).blob }));
      const remove = [...ed.removed].filter((n) => !used.has(n)).map((n) => `site/blog/${slug}/${n}`);
      const result = await commit({ message: `博客：${ed.isNew ? "发布" : "更新"}《${v.title}》`, files, remove }, (done, total) => {
        if (total > 1 && done < total) say(status, `正在上传 ${done + 1}/${total}……`);
        else say(status, "正在提交……");
      });
      const mdBlob = result.blobs.find((b) => b.path === `site/blog/${slug}/index.md`);
      // The draft is published: forget it, and keep editing the post as it now is online.
      const wasNew = ed.isNew;
      drafts.drop(ed.key);
      [...ed.pending.keys()].forEach((n) => {
        if (used.has(n)) ed.existing.set(n, { path: `site/blog/${slug}/${n}` });
        URL.revokeObjectURL(ed.pending.get(n).url);
      });
      ed.pending = new Map();
      ed.removed.forEach((n) => ed.existing.delete(n));
      ed.removed = new Set();
      Object.assign(ed, { key: slug, slug, isNew: false, base: mdBlob ? mdBlob.sha : ed.base });
      blog.posts.set(slug, { slug, files: [], md: ed.base });
      form.slug.readOnly = true;
      $("[data-editor-title]").textContent = "修改文章";
      $("[data-publish]").textContent = "更新";
      $("[data-delete]").hidden = false;
      $("[data-editor-live]").hidden = false;
      $("[data-editor-live]").href = `/blog/${slug}/`;
      notice.hidden = true;
      if (wasNew) {
        skipRoute = true;
        location.hash = `#blog/edit/${encodeURIComponent(slug)}`;
      }
      refreshImages();
      say(status, `${wasNew ? "已发布" : "已更新"}。大约 1 分钟后上线，上线了会提示你。`, "ok");
      if (mdBlob) announceLive(`/blog/${slug}/`, hasVersion(mdBlob.sha), `《${v.title}》`);
    } catch (error) {
      say(status, explain(error), "error");
    } finally {
      busy(buttons, false);
    }
  });

  /* 9. News ---------------------------------------------------------------------------------------- */

  const newsForm = $("[data-news-form]");
  const newsStatus = $("[data-news-status]");
  const KIND = { paper: "论文", talk: "会议", award: "获奖", other: "其他" };
  const news = { items: [], editing: null, pic: null, dropPic: false };
  const byDate = (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id));

  function resetNewsForm() {
    newsForm.reset();
    newsForm.date.value = today();
    news.editing = null;
    if (news.pic) URL.revokeObjectURL(news.pic.url);
    news.pic = null;
    news.dropPic = false;
    showNewsPic("");
    $("[data-news-title]").textContent = "发一条新闻";
    $("[data-news-submit]").textContent = "发布";
    $("[data-news-cancel]").hidden = true;
  }

  function showNewsPic(src) {
    const img = $("[data-news-pic]");
    img.hidden = !src;
    if (src) img.src = src;
    else img.removeAttribute("src");
    $("[data-news-unpick]").hidden = !src;
    $("[data-news-pick]").textContent = src ? "换一张" : "选择图片";
  }

  function renderNews() {
    const list = $("[data-news-list]");
    list.textContent = "";
    news.items.slice().sort(byDate).forEach((item) => {
      const edit = el("button", { class: "btn btn--small", type: "button", text: "编辑" });
      edit.addEventListener("click", () => {
        resetNewsForm();
        news.editing = item;
        newsForm.date.value = item.date || today();
        newsForm.kind.value = KIND[item.kind] ? item.kind : "other";
        newsForm.text.value = item.text || "";
        newsForm.text_en.value = item.text_en || "";
        newsForm.link.value = item.link || "";
        showNewsPic(item.image ? `/news/${item.image}` : "");
        $("[data-news-title]").textContent = "修改这条新闻";
        $("[data-news-submit]").textContent = "保存修改";
        $("[data-news-cancel]").hidden = false;
        newsForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const del = el("button", { class: "btn btn--quiet btn--small", type: "button", text: "删除" });
      del.addEventListener("click", () => deleteNews(item));
      list.append(
        el("li", { class: "row" }, [
          el("div", { class: "row__main" }, [
            el("span", { class: "row__meta" }, [el("span", { text: item.date }), el("span", { class: `pill pill--${KIND[item.kind] ? item.kind : "other"}`, text: KIND[item.kind] || "其他" }), item.image ? el("span", { class: "muted", text: "有配图" }) : null]),
            el("span", { class: "row__text", text: clip(plainOf(item.text || item.text_en), 140) }),
          ]),
          el("div", { class: "row__actions" }, [edit, del]),
        ])
      );
    });
    say($("[data-news-state]"), news.items.length ? "" : "还没有新闻。用上面的表单发第一条。");
  }

  async function openNews() {
    show("news");
    if (!news.editing) resetNewsForm();
    say($("[data-news-state]"), "正在读取……");
    try {
      news.items = await readJson("site/news/news.json", []);
      if (!Array.isArray(news.items)) news.items = [];
      renderNews();
    } catch (error) {
      say($("[data-news-state]"), explain(error), "error");
    }
  }

  $("[data-news-pick]").addEventListener("click", () => $("[data-news-input]").click());
  $("[data-news-input]").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    say(newsStatus, "正在处理图片……");
    try {
      const out = await shrink(file, 1400, 0.84);
      if (news.pic) URL.revokeObjectURL(news.pic.url);
      news.pic = { blob: out.blob, ext: out.ext, url: URL.createObjectURL(out.blob) };
      news.dropPic = false;
      showNewsPic(news.pic.url);
      say(newsStatus, `图片已准备好（${kb(out.blob.size)}）。`);
    } catch (error) {
      say(newsStatus, error.message, "error");
    }
  });
  $("[data-news-unpick]").addEventListener("click", () => {
    if (news.pic) URL.revokeObjectURL(news.pic.url);
    news.pic = null;
    news.dropPic = true;
    showNewsPic("");
  });
  $("[data-news-cancel]").addEventListener("click", () => {
    resetNewsForm();
    say(newsStatus, "");
  });

  newsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = newsForm.date.value;
    const text = newsForm.text.value.trim();
    const textEn = newsForm.text_en.value.trim();
    const link = newsForm.link.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return say(newsStatus, "日期不对。", "error");
    if (!text && !textEn) return say(newsStatus, "写点内容再发布。", "error");
    if (link && !/^https?:\/\/\S+$/i.test(link)) return say(newsStatus, "链接要以 http:// 或 https:// 开头。", "error");
    const editing = news.editing;
    const id = editing ? editing.id : uid("n-");
    const files = [];
    const remove = [];
    let image = editing ? editing.image : undefined;
    if (news.pic) {
      if (image) remove.push(`site/news/${image}`);
      image = `img/${uid(`${id}-`)}.${news.pic.ext}`;
      files.push({ path: `site/news/${image}`, blob: news.pic.blob });
    } else if (news.dropPic && image) {
      remove.push(`site/news/${image}`);
      image = undefined;
    }
    const item = { id, date, kind: newsForm.kind.value };
    if (text) item.text = text;
    if (textEn) item.text_en = textEn;
    if (link) item.link = link;
    if (image) item.image = image;
    const button = $("[data-news-submit]");
    busy([button], true);
    say(newsStatus, "正在提交……");
    try {
      const result = await commit({
        message: `新闻：${editing ? "修改" : "发布"}「${clip(plainOf(text || textEn), 30)}」`,
        files,
        remove,
        json: [{ path: "site/news/news.json", fallback: [], mutate: (list) => (Array.isArray(list) ? list.filter((n) => n.id !== id) : []).concat([item]).sort(byDate) }],
      });
      const saved = result.json["site/news/news.json"];
      news.items = saved.data;
      resetNewsForm();
      renderNews();
      say(newsStatus, `${editing ? "已保存" : "已发布"}。大约 1 分钟后上线。`, "ok");
      announceLive("/news/", hasVersion(saved.sha), "新闻");
    } catch (error) {
      say(newsStatus, explain(error), "error");
    } finally {
      busy([button], false);
    }
  });

  async function deleteNews(item) {
    if (!(await ask("删除这条新闻？", clip(plainOf(item.text || item.text_en), 80), "删除"))) return;
    const state = $("[data-news-state]");
    say(state, "正在删除……");
    try {
      const result = await commit({
        message: `新闻：删除「${clip(plainOf(item.text || item.text_en), 30)}」`,
        remove: item.image ? [`site/news/${item.image}`] : [],
        json: [{ path: "site/news/news.json", fallback: [], mutate: (list) => (Array.isArray(list) ? list.filter((n) => n.id !== item.id) : []) }],
      });
      const saved = result.json["site/news/news.json"];
      news.items = saved.data;
      if (news.editing && news.editing.id === item.id) resetNewsForm();
      renderNews();
      toast("已删除，大约 1 分钟后从网站上消失。");
      announceLive("/news/", hasVersion(saved.sha), "删除新闻");
    } catch (error) {
      say(state, explain(error), "error");
    }
  }

  /* 10. Photos ------------------------------------------------------------------------------------- */

  const photos = { items: [], uploads: [], local: new Map() };
  const uploadsBox = $("[data-uploads]");
  const uploadStatus = $("[data-upload-status]");
  const byTaken = (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id).localeCompare(String(a.id));

  function albums() {
    const set = new Set(photos.items.map((p) => p.album).filter(Boolean));
    photos.uploads.forEach((u) => u.album && set.add(u.album));
    const list = $("[data-albums]");
    list.textContent = "";
    [...set].sort().forEach((a) => list.append(el("option", { value: a })));
  }

  function photoFields(values, onChange) {
    const field = (label, name, attrs) => {
      const input = el("input", Object.assign({ class: "input", name, value: values[name] || "" }, attrs || {}));
      input.addEventListener("input", () => onChange(name, input.value.trim()));
      return el("label", { class: "field" }, [el("span", { class: "field__label", text: label }), input]);
    };
    return el("div", { class: "photo-fields" }, [
      field("说明", "caption", { placeholder: "比如：组会后的合影" }),
      field("English", "caption_en", { placeholder: "选填" }),
      field("地点", "place", { placeholder: "选填" }),
      field("日期", "date", { type: "date" }),
      field("相册", "album", { list: "album-list", placeholder: "比如：实验室、旅行" }),
    ]);
  }

  function renderShelf() {
    const list = $("[data-photo-list]");
    list.textContent = "";
    photos.items.slice().sort(byTaken).forEach((item) => {
      const img = el("img", { src: photos.local.get(item.id) || `/photos/${item.thumb || item.file}`, alt: "", loading: "lazy" });
      img.addEventListener("error", () => img.classList.add("is-missing"), { once: true });
      const edit = el("button", { class: "btn btn--small", type: "button", text: "编辑" });
      const del = el("button", { class: "btn btn--quiet btn--small", type: "button", text: "删除" });
      const tile = el("li", { class: "shelf__item" }, [
        el("div", { class: "shelf__img" }, [img]),
        el("div", { class: "shelf__text" }, [
          el("span", { class: "shelf__cap", text: item.caption || item.caption_en || "（没有说明）" }),
          el("span", { class: "muted", text: [item.album, item.place, item.date].filter(Boolean).join(" · ") }),
        ]),
        el("div", { class: "row__actions" }, [edit, del]),
      ]);
      edit.addEventListener("click", () => {
        const draft = { caption: item.caption, caption_en: item.caption_en, place: item.place, date: item.date, album: item.album };
        const save = el("button", { class: "btn btn--primary btn--small", type: "button", text: "保存" });
        const cancel = el("button", { class: "btn btn--quiet btn--small", type: "button", text: "取消", onclick: renderShelf });
        const note = el("p", { class: "status", role: "status" });
        save.addEventListener("click", async () => {
          busy([save, cancel], true);
          say(note, "正在保存……");
          try {
            const result = await commit({
              message: `照片：修改「${clip(draft.caption || draft.caption_en || item.id, 30)}」`,
              json: [
                {
                  path: "site/photos/photos.json",
                  fallback: [],
                  mutate: (listNow) =>
                    (Array.isArray(listNow) ? listNow : []).map((p) => {
                      if (p.id !== item.id) return p;
                      const next = Object.assign({}, p);
                      ["caption", "caption_en", "place", "date", "album"].forEach((k) => {
                        if (draft[k]) next[k] = draft[k];
                        else delete next[k];
                      });
                      return next;
                    }),
                },
              ],
            });
            const saved = result.json["site/photos/photos.json"];
            photos.items = saved.data;
            renderShelf();
            albums();
            toast("已保存，大约 1 分钟后上线。");
            announceLive("/photos/", hasVersion(saved.sha), "照片修改");
          } catch (error) {
            say(note, explain(error), "error");
            busy([save, cancel], false);
          }
        });
        tile.textContent = "";
        tile.classList.add("is-editing");
        tile.append(el("div", { class: "shelf__img" }, [img]), photoFields(draft, (k, value) => (draft[k] = value)), el("div", { class: "row__actions" }, [cancel, save]), note);
      });
      del.addEventListener("click", () => deletePhoto(item));
      list.append(tile);
    });
    say($("[data-photo-state]"), photos.items.length ? `共 ${photos.items.length} 张照片。` : "还没有照片。点右上角「上传照片」。");
  }

  async function openPhotos() {
    show("photos");
    say($("[data-photo-state]"), "正在读取……");
    try {
      photos.items = await readJson("site/photos/photos.json", []);
      if (!Array.isArray(photos.items)) photos.items = [];
      renderShelf();
      albums();
    } catch (error) {
      say($("[data-photo-state]"), explain(error), "error");
    }
  }

  function renderUploads() {
    const list = $("[data-upload-list]");
    list.textContent = "";
    uploadsBox.hidden = !photos.uploads.length;
    $("[data-upload-count]").textContent = photos.uploads.length ? `${photos.uploads.length} 张` : "";
    photos.uploads.forEach((u) => {
      const remove = el("button", { class: "images__x", type: "button", title: "不传这张", text: "×" });
      remove.addEventListener("click", () => {
        URL.revokeObjectURL(u.url);
        photos.uploads = photos.uploads.filter((x) => x !== u);
        renderUploads();
      });
      list.append(
        el("li", { class: "upload" }, [
          el("div", { class: "upload__img" }, [el("img", { src: u.url, alt: "" }), remove, el("span", { class: "upload__size", text: `${u.full.w}×${u.full.h} · ${kb(u.full.blob.size + u.thumb.blob.size)}` })]),
          photoFields(u, (k, value) => (u[k] = value)),
        ])
      );
    });
  }

  $("[data-photo-add]").addEventListener("click", () => $("[data-photo-input]").click());
  $("[data-photo-input]").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []).filter((f) => /^image\//.test(f.type));
    event.target.value = "";
    if (!files.length) return;
    uploadsBox.hidden = false;
    for (let i = 0; i < files.length; i++) {
      say(uploadStatus, `正在处理 ${i + 1}/${files.length}……`);
      try {
        const [full, thumb, date] = await Promise.all([shrink(files[i], 2000, 0.85), shrink(files[i], 720, 0.8), takenOn(files[i])]);
        photos.uploads.push({ id: uid("p-"), full, thumb, url: URL.createObjectURL(thumb.blob), date, caption: "", caption_en: "", place: "", album: "" });
        renderUploads();
      } catch (error) {
        say(uploadStatus, `有一张没处理好：${error.message}`, "error");
      }
    }
    say(uploadStatus, "可以给每张写说明，再点「全部上传」。");
    albums();
  });

  $("[data-bulk-apply]").addEventListener("click", () => {
    const album = $("[data-bulk-album]").value.trim();
    const date = $("[data-bulk-date]").value;
    photos.uploads.forEach((u) => {
      if (album) u.album = album;
      if (date) u.date = date;
    });
    renderUploads();
  });

  $("[data-upload-clear]").addEventListener("click", async () => {
    if (photos.uploads.length && !(await ask("清空准备上传的照片？", "还没上传的照片会被移除。", "清空"))) return;
    photos.uploads.forEach((u) => URL.revokeObjectURL(u.url));
    photos.uploads = [];
    renderUploads();
    say(uploadStatus, "");
  });

  $("[data-upload-go]").addEventListener("click", async () => {
    if (!photos.uploads.length) return;
    const go = $("[data-upload-go]");
    const clear = $("[data-upload-clear]");
    busy([go, clear], true);
    const batch = photos.uploads.slice();
    const files = [];
    const items = batch.map((u) => {
      const file = `img/${u.id}.${u.full.ext}`;
      const thumb = `img/${u.id}-s.${u.thumb.ext}`;
      files.push({ path: `site/photos/${file}`, blob: u.full.blob }, { path: `site/photos/${thumb}`, blob: u.thumb.blob });
      const item = { id: u.id, file, thumb, w: u.full.w, h: u.full.h };
      ["caption", "caption_en", "place", "date", "album"].forEach((k) => {
        if (u[k]) item[k] = u[k];
      });
      return item;
    });
    try {
      const result = await commit(
        {
          message: `照片：上传 ${items.length} 张`,
          files,
          json: [{ path: "site/photos/photos.json", fallback: [], mutate: (list) => (Array.isArray(list) ? list.filter((p) => !items.some((i) => i.id === p.id)) : []).concat(items).sort(byTaken) }],
        },
        (done, total) => say(uploadStatus, done < total ? `正在上传 ${Math.floor(done / 2) + 1}/${total / 2}……` : "正在提交……")
      );
      const saved = result.json["site/photos/photos.json"];
      photos.items = saved.data;
      batch.forEach((u) => photos.local.set(u.id, u.url));
      photos.uploads = [];
      renderUploads();
      renderShelf();
      albums();
      toast(`已上传 ${items.length} 张，大约 1 分钟后出现在网站上。`);
      announceLive("/photos/", hasVersion(saved.sha), "新照片");
    } catch (error) {
      say(uploadStatus, explain(error), "error");
    } finally {
      busy([go, clear], false);
    }
  });

  async function deletePhoto(item) {
    if (!(await ask("删除这张照片？", item.caption || item.caption_en || "", "删除"))) return;
    const state = $("[data-photo-state]");
    say(state, "正在删除……");
    try {
      const result = await commit({
        message: `照片：删除「${clip(item.caption || item.caption_en || item.id, 30)}」`,
        remove: [item.file, item.thumb].filter(Boolean).map((p) => `site/photos/${p}`),
        json: [{ path: "site/photos/photos.json", fallback: [], mutate: (list) => (Array.isArray(list) ? list.filter((p) => p.id !== item.id) : []) }],
      });
      const saved = result.json["site/photos/photos.json"];
      photos.items = saved.data;
      renderShelf();
      albums();
      toast("已删除，大约 1 分钟后从网站上消失。");
      announceLive("/photos/", hasVersion(saved.sha), "删除照片");
    } catch (error) {
      say(state, explain(error), "error");
    }
  }

  /* Start ------------------------------------------------------------------------------------------ */

  const bar = $(".admin-bar");
  const setBar = () => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
  if ("ResizeObserver" in window) new ResizeObserver(setBar).observe(bar);
  setBar();

  if (!MD) {
    document.body.textContent = "页面没有加载完整，请刷新。";
    return;
  }
  route();
})();
