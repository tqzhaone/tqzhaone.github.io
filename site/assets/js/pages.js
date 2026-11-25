/*
 * The News, Blog and Photos pages of tqzhaone.github.io.
 *
 * 1. Language switch, top bar and phone menu (the home page has its own copy in site.js).
 * 2. The owner's buttons ("Write a post", "Add news", "Add photos", "Edit this post"), shown only in a
 *    browser that is signed in to the admin page.
 * 3. Filters: tags on the blog, kinds on the news, albums on the photos.
 * 4. Pictures open full screen; on the photos page and in a post you can go through them with the
 *    arrows, the keyboard or a swipe.
 * 5. Posts: reading progress, the contents list following the reader, copy link / share, and the
 *    read count (kept by the same Twikoo backend as the guestbook).
 */
(function () {
  "use strict";

  const root = document.documentElement;
  const lang = () => (root.getAttribute("data-lang") === "zh" ? "zh" : "en");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* 1. Language, top bar, menu --------------------------------------------------------------------- */

  function setLang(next, remember) {
    const value = next === "zh" ? "zh" : "en";
    root.setAttribute("data-lang", value);
    root.lang = value === "zh" ? "zh-CN" : "en";
    const title = root.getAttribute(`data-title-${value}`);
    if (title) document.title = title;
    document.querySelectorAll("[data-set-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.setLang === value));
    });
    if (remember) {
      try {
        localStorage.setItem("site-lang", value);
      } catch (error) {
        // Storage is unavailable (private mode); the choice lasts for this page only.
      }
    }
    document.dispatchEvent(new CustomEvent("site:lang"));
  }

  setLang(lang(), false);
  document.querySelectorAll("[data-set-lang]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.setLang, true));
  });

  const topbar = document.querySelector("[data-topbar]");
  const menuButton = document.querySelector("[data-menu]");
  if (topbar && menuButton) {
    const closeMenu = () => {
      topbar.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    };
    menuButton.addEventListener("click", () => {
      const open = !topbar.classList.contains("is-open");
      topbar.classList.toggle("is-open", open);
      menuButton.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  const status = document.querySelector("[data-status]");
  const announce = (en, zh) => {
    if (status) status.textContent = lang() === "zh" ? zh : en;
  };

  /* 2. Owner's buttons ---------------------------------------------------------------------------- */

  let owner = false;
  try {
    owner = Boolean(localStorage.getItem("site-admin-token") || sessionStorage.getItem("site-admin-token"));
  } catch (error) {
    owner = false;
  }
  if (owner) document.querySelectorAll("[data-owner]").forEach((node) => (node.hidden = false));

  /* 3. Filters ------------------------------------------------------------------------------------ */

  document.querySelectorAll("[data-filterbar]").forEach((bar) => {
    const param = bar.dataset.filterbar;
    const scope = bar.closest(".wrap") || document;
    const items = Array.from(scope.querySelectorAll("[data-filter-values]"));
    const groups = Array.from(scope.querySelectorAll("[data-filter-group]"));
    const none = scope.querySelector("[data-filter-none]");
    const buttons = Array.from(bar.querySelectorAll("[data-filter]"));
    const valuesOf = (item) => {
      try {
        return JSON.parse(item.dataset.filterValues || "[]");
      } catch (error) {
        return [];
      }
    };
    const apply = (value, remember) => {
      let shown = 0;
      items.forEach((item) => {
        const show = !value || valuesOf(item).indexOf(value) !== -1;
        item.hidden = !show;
        if (show) shown++;
      });
      groups.forEach((group) => (group.hidden = !group.querySelector("[data-filter-values]:not([hidden])")));
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === value)));
      if (none) none.hidden = shown > 0;
      if (remember) {
        const url = new URL(location.href);
        if (value) url.searchParams.set(param, value);
        else url.searchParams.delete(param);
        history.replaceState(null, "", url);
      }
      document.dispatchEvent(new CustomEvent("site:filter"));
    };
    buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.filter, true)));
    const asked = new URLSearchParams(location.search).get(param);
    if (asked && buttons.some((b) => b.dataset.filter === asked)) apply(asked, false);
  });

  /* 4. Pictures, full screen ---------------------------------------------------------------------- */

  const box = document.querySelector("[data-lightbox]");
  const lightbox = (function () {
    if (!box) return null;
    const img = box.querySelector("[data-lightbox-img]");
    const cap = box.querySelector("[data-lightbox-cap]");
    const count = box.querySelector("[data-lightbox-count]");
    const prev = box.querySelector("[data-lightbox-prev]");
    const next = box.querySelector("[data-lightbox-next]");
    const close = box.querySelector("[data-lightbox-close]");
    let list = [];
    let at = 0;
    let opener = null;

    const describe = (entry) => {
      cap.textContent = "";
      const text = lang() === "zh" ? entry.zh : entry.en;
      if (text) {
        const t = document.createElement("span");
        t.className = "lightbox__text";
        t.textContent = text;
        cap.append(t);
      }
      const meta = [entry.place, lang() === "zh" ? entry.dateZh : entry.dateEn].filter(Boolean).join(" · ");
      if (meta) {
        const m = document.createElement("span");
        m.className = "lightbox__meta";
        m.textContent = meta;
        cap.append(m);
      }
      cap.hidden = !cap.childNodes.length;
    };

    const show = (i) => {
      at = (i + list.length) % list.length;
      const entry = list[at];
      img.classList.remove("is-in");
      img.onload = () => img.classList.add("is-in");
      img.src = entry.src;
      img.alt = entry.alt || "";
      if (img.complete) img.classList.add("is-in");
      describe(entry);
      const many = list.length > 1;
      prev.hidden = !many;
      next.hidden = !many;
      count.textContent = many ? `${at + 1} / ${list.length}` : "";
      // Fetch the neighbours so the next swipe is instant.
      if (many) [list[(at + 1) % list.length], list[(at - 1 + list.length) % list.length]].forEach((e) => (new Image().src = e.src));
    };

    const hide = () => {
      box.hidden = true;
      img.removeAttribute("src");
      document.body.classList.remove("has-lightbox");
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };

    const open = (entries, index, from) => {
      if (!entries.length) return;
      list = entries;
      opener = from || null;
      box.hidden = false;
      document.body.classList.add("has-lightbox");
      show(index);
      close.focus({ preventScroll: true });
    };

    prev.addEventListener("click", (event) => {
      event.stopPropagation();
      show(at - 1);
    });
    next.addEventListener("click", (event) => {
      event.stopPropagation();
      show(at + 1);
    });
    close.addEventListener("click", hide);
    box.addEventListener("click", (event) => {
      if (event.target === box || event.target.hasAttribute("data-lightbox-stage")) hide();
    });
    document.addEventListener("keydown", (event) => {
      if (box.hidden) return;
      if (event.key === "Escape") hide();
      else if (event.key === "ArrowLeft" && list.length > 1) show(at - 1);
      else if (event.key === "ArrowRight" && list.length > 1) show(at + 1);
    });
    let startX = null;
    let startY = 0;
    box.addEventListener("pointerdown", (event) => {
      startX = event.clientX;
      startY = event.clientY;
    });
    box.addEventListener("pointerup", (event) => {
      if (startX === null) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      startX = null;
      if (list.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(at + (dx < 0 ? 1 : -1));
      else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) hide();
    });
    document.addEventListener("site:lang", () => {
      if (!box.hidden) describe(list[at]);
    });
    return { open };
  })();

  // Pictures in posts and news open on their own page-wide sequence.
  function zoomable(selector) {
    const pictures = Array.from(document.querySelectorAll(selector)).filter((p) => !p.closest("a"));
    if (!lightbox || !pictures.length) return;
    const entryOf = (p) => {
      const figure = p.closest("figure");
      const caption = figure && figure.querySelector("figcaption");
      const text = caption ? caption.textContent.trim() : "";
      return { src: p.currentSrc || p.src, alt: p.alt, zh: text, en: text };
    };
    const label = () => (lang() === "zh" ? "查看大图" : "View full size");
    pictures.forEach((picture, i) => {
      picture.tabIndex = 0;
      picture.setAttribute("role", "button");
      picture.setAttribute("aria-label", label());
      const go = () => lightbox.open(pictures.map(entryOf), i, picture);
      picture.addEventListener("click", go);
      picture.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          go();
        }
      });
    });
    document.addEventListener("site:lang", () => pictures.forEach((p) => p.setAttribute("aria-label", label())));
  }
  zoomable(".prose img, .post__cover img");
  zoomable("img[data-zoom]");

  // Photos: open the one tapped, then browse the photos the current album shows.
  const photoData = document.getElementById("photo-data");
  if (lightbox && photoData) {
    let data = [];
    try {
      data = JSON.parse(photoData.textContent);
    } catch (error) {
      data = [];
    }
    document.querySelectorAll("[data-photo]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        const visible = Array.from(document.querySelectorAll("[data-photo]")).filter((a) => !a.closest("[hidden]"));
        const entries = visible.map((a) => {
          const d = data[Number(a.dataset.photo)] || {};
          return { ...d, alt: d.zh || d.en || "" };
        });
        lightbox.open(entries, visible.indexOf(link), link);
      });
    });
  }

  /* 5. Posts -------------------------------------------------------------------------------------- */

  const post = document.querySelector("[data-post]");
  if (!post) return;
  const prose = post.querySelector(".prose");

  // Reading progress: a thin line under the top bar.
  const bar = post.querySelector("[data-readbar] i");
  if (bar && prose) {
    let queued = false;
    const update = () => {
      queued = false;
      const rect = prose.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const done = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      bar.style.transform = `scaleX(${done})`;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!queued) {
          queued = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }

  // Contents: the section being read is highlighted.
  const toc = post.querySelector(".toc");
  if (toc && "IntersectionObserver" in window) {
    const links = new Map(Array.from(toc.querySelectorAll("a"), (a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const heads = Array.from(links.keys())
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    let current = null;
    const pick = () => {
      let found = null;
      const line = window.innerHeight * 0.32;
      heads.forEach((h) => {
        if (h.getBoundingClientRect().top < line) found = h;
      });
      if (found !== current) {
        if (current) links.get(current.id).classList.remove("is-active");
        current = found;
        if (current) links.get(current.id).classList.add("is-active");
      }
    };
    const observer = new IntersectionObserver(pick, { rootMargin: "0px 0px -60% 0px" });
    heads.forEach((h) => observer.observe(h));
    window.addEventListener("scroll", () => requestAnimationFrame(pick), { passive: true });
  }

  // Copy link / share.
  const canonical = document.querySelector('link[rel="canonical"]');
  const link = canonical ? canonical.href : location.href.split("#")[0];
  const copyButton = post.querySelector("[data-copy-link]");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(link);
        ok = true;
      } catch (error) {
        const area = document.createElement("textarea");
        area.value = link;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        try {
          ok = document.execCommand("copy");
        } catch (ignored) {
          ok = false;
        }
        area.remove();
      }
      if (ok) {
        copyButton.classList.add("is-done");
        announce("Link copied.", "链接已复制。");
        clearTimeout(copyButton.doneTimer);
        copyButton.doneTimer = setTimeout(() => copyButton.classList.remove("is-done"), 2000);
      } else {
        announce("The link couldn't be copied.", "链接没能复制。");
      }
    });
  }
  const shareButton = post.querySelector("[data-share]");
  if (shareButton && navigator.share) {
    shareButton.hidden = false;
    shareButton.addEventListener("click", () => {
      const title = post.querySelector(".post__title");
      navigator.share({ title: title ? title.textContent : document.title, url: link }).catch(() => {});
    });
  }

  // Read count: once per post per browser session, and only on the published site.
  const views = post.querySelector("[data-views]");
  const counter = document.querySelector("[data-visits]");
  const api = counter ? (counter.dataset.api || "").trim() : "";
  let home = "";
  try {
    home = canonical ? new URL(canonical.href).hostname : "";
  } catch (error) {
    home = "";
  }
  if (views && api && home && location.hostname === home) {
    const path = `/blog/${post.dataset.post}/`;
    const key = `post-views:${path}`;
    const show = (n) => {
      const number = new Intl.NumberFormat("en").format(n);
      views.textContent = "";
      const en = document.createElement("span");
      en.dataset.l = "en";
      en.textContent = `${number} ${n === 1 ? "read" : "reads"}`;
      const zh = document.createElement("span");
      zh.dataset.l = "zh";
      zh.lang = "zh-CN";
      zh.textContent = `阅读 ${number}`;
      views.append(en, zh);
      views.hidden = false;
    };
    let known = null;
    try {
      known = sessionStorage.getItem(key);
    } catch (error) {
      known = null;
    }
    if (known && /^\d+$/.test(known)) {
      show(Number(known));
    } else {
      const title = post.querySelector(".post__title");
      const count = () =>
        fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "COUNTER_GET", url: path, title: title ? title.textContent : "" }),
          credentials: "omit",
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((result) => {
            if (!result || typeof result.time !== "number") return;
            const n = result.time + 1;
            try {
              sessionStorage.setItem(key, String(n));
            } catch (error) {
              // without session storage a reload counts again
            }
            show(n);
          })
          .catch(() => {});
      if ("requestIdleCallback" in window) requestIdleCallback(count, { timeout: 3000 });
      else setTimeout(count, 1200);
    }
  }

  if (reduceMotion.matches) root.style.scrollBehavior = "auto";
})();
