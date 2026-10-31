document.addEventListener("DOMContentLoaded", () => {
  const compatBootstrap = Boolean(window.alFolio && window.alFolio.compatBootstrap);
  const computedTheme =
    typeof window.determineComputedTheme === "function"
      ? window.determineComputedTheme()
      : document.documentElement.dataset.theme || "light";

  document.querySelectorAll("table").forEach((table) => {
    if (computedTheme === "dark") {
      table.classList.add("table-dark");
    } else {
      table.classList.remove("table-dark");
    }

    const insideExcludedParent =
      table.closest('[class*="news"]') ||
      table.closest('[class*="card"]') ||
      table.closest('[class*="archive"]') ||
      table.closest("pre") ||
      table.closest("code");

    if (!insideExcludedParent) {
      table.classList.add("table", "table-hover");
      table.parentElement?.classList.add("table-responsive");

      if (compatBootstrap) {
        table.setAttribute("data-toggle", "table");
      }
    }
  });
});

// Language switch. This file replaces the theme script so the control is on every page.
(function () {
  const STORAGE_KEY = "site-lang";
  const PAIRS = [
    ["about", "关于"],
    ["publications", "论文"],
    ["CV", "简历"],
    ["selected publications", "代表论文"],
    ["Contact Information", "联系方式"],
    ["Name", "姓名"],
    ["Professional Title", "身份"],
    ["Professional Summary", "简介"],
    ["Education", "教育经历"],
    ["Publications", "论文"],
    ["Ph.D. Student", "博士研究生"],
    ["Ph.D.", "博士"],
    ["Nanjing Tech University", "南京工业大学"],
    ["Chemistry and Molecular Engineering", "化学与分子工程"],
    ["School of Chemistry and Molecular Engineering", "化学与分子工程学院"],
    ["Nanjing, China", "中国南京"],
    [
      "Ph.D. student, School of Chemistry and Molecular Engineering, Nanjing Tech University",
      "南京工业大学化学与分子工程学院博士研究生",
    ],
    [
      "School of Chemistry and Molecular Engineering, Nanjing Tech University, Nanjing, China.",
      "南京工业大学化学与分子工程学院，中国南京。",
    ],
    [
      "Journal articles from ORCID 0000-0002-2230-7690, newest first.",
      "论文来自 ORCID 0000-0002-2230-7690，按时间从新到旧排列。",
    ],
    [
      "Education and publications from the public ORCID record 0000-0002-2230-7690.",
      "教育和论文来自公开的 ORCID 记录 0000-0002-2230-7690。",
    ],
    [
      "Ph.D. student in the School of Chemistry and Molecular Engineering at Nanjing Tech University. Published work covers persistent luminescence nanoparticles, ratiometric temperature sensing, and related materials applications.",
      "南京工业大学化学与分子工程学院博士研究生。已发表工作主要涉及长余辉发光纳米材料、比率型温度传感及相关材料应用。",
    ],
    ["Type to filter", "输入以筛选"],
    ["Open search", "打开搜索"],
    ["Change color theme", "切换颜色主题"],
    ["Search", "搜索"],
  ];

  const normalize = (value) => value.replace(/\s+/g, " ").trim();

  const directText = (element) =>
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("");

  const setDirectText = (element, value) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && normalize(node.textContent));
    if (textNode) {
      textNode.textContent = value;
      return;
    }
    element.textContent = value;
  };

  const pairFor = (text) => PAIRS.find(([en, zh]) => text === en || text === zh);

  const preferredLang = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
    return (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
  };

  const ensureStyle = () => {
    if (document.getElementById("site-lang-style")) return;
    const style = document.createElement("style");
    style.id = "site-lang-style";
    style.textContent = `
      html[data-lang="en"] .lang-zh { display: none !important; }
      html[data-lang="zh"] .lang-en { display: none !important; }
      .lang-switch { display: flex; align-items: center; gap: 0.15rem; list-style: none; }
      .lang-switch button {
        background: transparent;
        border: 0;
        cursor: pointer;
        font: inherit;
        line-height: inherit;
        padding: 0.4rem 0.15rem;
      }
    `;
    document.head.appendChild(style);
  };

  const markElement = (element) => {
    if (element.dataset.i18nEn || element.closest(".lang-switch") || element.closest(".bibtex, pre, code")) return;
    const pair = pairFor(normalize(directText(element)));
    if (!pair) return;
    element.dataset.i18nAttr = "text";
    element.dataset.i18nEn = pair[0];
    element.dataset.i18nZh = pair[1];
  };

  const applyMarked = (lang) => {
    document.querySelectorAll("[data-i18n-en]").forEach((element) => {
      const value = lang === "zh" ? element.dataset.i18nZh : element.dataset.i18nEn;
      if (element.hasAttribute("placeholder")) element.setAttribute("placeholder", value);
      if (element.dataset.i18nAttr === "aria-label") element.setAttribute("aria-label", value);
      if (element.dataset.i18nAttr === "title") element.setAttribute("title", value);
      if (element.dataset.i18nAttr === "text" && normalize(directText(element))) setDirectText(element, value);
    });
  };

  const tagPage = () => {
    document.querySelectorAll("a, button, h1, h2, h3, h6, p, span, td, b, div").forEach(markElement);
    document.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
      if (element.closest(".lang-switch") || element.dataset.i18nEn) return;
      const attr = element.hasAttribute("placeholder") ? "placeholder" : element.hasAttribute("aria-label") ? "aria-label" : "title";
      const pair = pairFor(normalize(element.getAttribute(attr) || ""));
      if (!pair) return;
      element.dataset.i18nAttr = attr;
      element.dataset.i18nEn = pair[0];
      element.dataset.i18nZh = pair[1];
    });
  };

  const syncToc = () => {
    document.querySelectorAll("#toc-sidebar a").forEach((link) => {
      const id = decodeURIComponent((link.getAttribute("href") || "").replace(/^#/, ""));
      if (!id || typeof CSS === "undefined" || typeof CSS.escape !== "function") return;
      const heading = document.querySelector(`h2[id="${CSS.escape(id)}"], h3[id="${CSS.escape(id)}"]`);
      if (heading) link.textContent = heading.textContent.trim();
    });
  };

  const syncTitle = (lang) => {
    if (!document.documentElement.dataset.titleEn) {
      document.documentElement.dataset.titleEn = document.title;
    }
    let title = document.documentElement.dataset.titleEn;
    if (lang === "zh") {
      title = title.replace(/^publications/, "论文").replace(/^CV/, "简历");
    }
    document.title = title;
  };

  const updateSwitcher = (lang) => {
    document.querySelectorAll(".lang-switch button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
    });
  };

  const ensureSwitcher = (lang) => {
    const list = document.querySelector("#navbarNav .navbar-nav");
    if (!list) return;
    let item = list.querySelector(".lang-switch");
    if (!item) {
      item = document.createElement("li");
      item.className = "nav-item lang-switch";
      item.setAttribute("aria-label", "Language");
      item.innerHTML = '<button type="button" data-lang="zh">中文</button><span aria-hidden="true">/</span><button type="button" data-lang="en">EN</button>';
      const search = list.querySelector("#search-toggle")?.closest("li");
      if (search) list.insertBefore(item, search);
      else list.appendChild(item);
      item.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-lang]");
        if (!button) return;
        const next = button.dataset.lang;
        localStorage.setItem(STORAGE_KEY, next);
        applyLanguage(next);
      });
    }
    updateSwitcher(lang);
  };

  const applyLanguage = (lang) => {
    ensureStyle();
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.lang = lang;
    tagPage();
    applyMarked(lang);
    syncTitle(lang);
    syncToc();
    ensureSwitcher(lang);
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => applyLanguage(preferredLang()), 0);
  });
})();
