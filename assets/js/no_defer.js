// This file shadows the theme's assets/js/no_defer.js (al_folio_core), so it runs on every page.
// Part 1 is the theme's own table handling, unchanged. Part 2 is the English / 中文 switch.

document.addEventListener("DOMContentLoaded", () => {
  const compatBootstrap = Boolean(window.alFolio && window.alFolio.compatBootstrap);
  const computedTheme =
    typeof window.determineComputedTheme === "function" ? window.determineComputedTheme() : document.documentElement.dataset.theme || "light";

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

// English / 中文 switch.
// - Content written in both languages carries class="lang-en" or class="lang-zh".
//   main.scss hides the inactive one; English is the default, so nothing flashes without JavaScript.
// - Text the theme renders (menu, page headers, CV labels) is swapped using PAIRS below.
//   When you change one of those English strings (in _config.yml, a page's front matter or _data/cv.yml),
//   update its pair here too.
// - The choice is remembered in this browser. A link ending in ?lang=zh or ?lang=en opens that language.
(function () {
  const STORAGE_KEY = "site-lang";

  const PAIRS = [
    // Menu and page titles
    ["About", "关于"],
    ["Publications", "论文"],
    ["CV", "简历"],
    ["selected publications", "代表论文"],
    // Page headers
    ["Ph.D. student · School of Chemistry and Molecular Engineering, Nanjing Tech University", "博士研究生 · 南京工业大学化学与分子工程学院"],
    ["Peer-reviewed journal articles, newest first.", "期刊论文，按发表时间从新到旧排列。"],
    ["Education and publications.", "教育经历与发表论文。"],
    ["Type to filter", "输入关键词筛选"],
    // Contact note under the home page
    ["School of Chemistry and Molecular Engineering, Nanjing Tech University, Nanjing, China.", "南京工业大学化学与分子工程学院，中国南京。"],
    // CV
    ["Contact Information", "联系方式"],
    ["Name", "姓名"],
    ["Professional Title", "身份"],
    ["Professional Summary", "简介"],
    ["Education", "教育经历"],
    ["Ph.D. Student", "博士研究生"],
    ["Ph.D.", "博士"],
    ["Nanjing Tech University", "南京工业大学"],
    ["Chemistry and Molecular Engineering", "化学与分子工程"],
    ["School of Chemistry and Molecular Engineering", "化学与分子工程学院"],
    ["Research: organic afterglow materials for tumor imaging and therapy", "研究方向：用于肿瘤成像与治疗的有机余辉材料"],
    ["Nanjing, China", "中国南京"],
    [
      "Ph.D. student in the School of Chemistry and Molecular Engineering at Nanjing Tech University. Published work covers persistent luminescence nanomaterials for ratiometric temperature sensing, information encryption and near-infrared imaging; Ph.D. research develops organic afterglow materials for tumor imaging and therapy.",
      "南京工业大学化学与分子工程学院博士研究生。已发表工作涉及长余辉发光纳米材料及其在比率型温度传感、信息加密和近红外成像中的应用；博士阶段研究用于肿瘤成像与治疗的有机余辉材料。",
    ],
    // Menu controls (tooltips and screen-reader labels)
    ["Search", "搜索"],
    ["Open search", "打开搜索"],
    ["Change theme", "切换主题"],
    ["Change color theme", "切换颜色主题"],
    ["Toggle navigation", "展开导航"],
  ];

  const TEXT_SELECTOR = "a, button, h1, h2, h3, h4, h5, h6, p, span, td, th, b, strong, li, div, label";
  const SKIP_SELECTOR = ".lang-switch, .lang-en, .lang-zh, .bibtex, pre, code, script, style";
  const ATTRIBUTES = ["placeholder", "aria-label", "title"];

  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

  const lookup = new Map();
  PAIRS.forEach((pair) => {
    lookup.set(pair[0], pair);
    lookup.set(pair[1], pair);
  });
  const pairFor = (text) => lookup.get(normalize(text));

  const readStored = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  };

  const store = (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      // Private mode or storage disabled: the choice just won't be remembered.
    }
  };

  const fromQuery = () => {
    try {
      const value = new URLSearchParams(window.location.search).get("lang");
      return value === "zh" || value === "en" ? value : null;
    } catch (error) {
      return null;
    }
  };

  const preferredLang = () => {
    const requested = fromQuery();
    if (requested) {
      store(requested);
      return requested;
    }
    return readStored() === "zh" ? "zh" : "en";
  };

  // Elements whose own text or attributes have a translation: element -> { text, attrs }.
  const registry = new Map();

  const directText = (element) =>
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("");

  const firstTextNode = (element) => Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && normalize(node.textContent));

  const entryFor = (element) => {
    let entry = registry.get(element);
    if (!entry) {
      entry = { text: null, attrs: {} };
      registry.set(element, entry);
    }
    return entry;
  };

  const collect = () => {
    document.querySelectorAll(TEXT_SELECTOR).forEach((element) => {
      if (element.closest(SKIP_SELECTOR)) return;
      const existing = registry.get(element);
      if (existing && existing.text) return;
      const pair = pairFor(directText(element));
      if (pair) entryFor(element).text = pair;
    });

    document.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
      if (element.closest(".lang-switch")) return;
      ATTRIBUTES.forEach((name) => {
        if (!element.hasAttribute(name)) return;
        const existing = registry.get(element);
        if (existing && existing.attrs[name]) return;
        const pair = pairFor(element.getAttribute(name));
        if (pair) entryFor(element).attrs[name] = pair;
      });
    });
  };

  const translate = (lang) => {
    const index = lang === "zh" ? 1 : 0;
    registry.forEach((entry, element) => {
      if (entry.text) {
        const node = firstTextNode(element);
        if (node) {
          const lead = node.textContent.match(/^\s*/)[0];
          const trail = node.textContent.match(/\s*$/)[0];
          node.textContent = lead + entry.text[index] + trail;
        }
      }
      Object.keys(entry.attrs).forEach((name) => element.setAttribute(name, entry.attrs[name][index]));
    });
  };

  const originalTitle = document.title;

  const syncTitle = (lang) => {
    const parts = originalTitle.split(" | ");
    const pair = pairFor(parts[0]);
    if (pair) parts[0] = pair[lang === "zh" ? 1 : 0];
    document.title = parts.join(" | ");
  };

  let current = "en";

  const updateSwitcher = () => {
    document.querySelectorAll(".lang-switch button[data-lang]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === current));
    });
  };

  const ensureSwitcher = () => {
    const list = document.querySelector("#navbarNav .navbar-nav");
    if (!list || list.querySelector(".lang-switch")) return;

    const item = document.createElement("li");
    item.className = "nav-item lang-switch-item";
    item.innerHTML =
      '<div class="lang-switch" role="group" aria-label="Language / 语言">' +
      '<button type="button" data-lang="en" lang="en">EN</button>' +
      '<button type="button" data-lang="zh" lang="zh-CN">中文</button>' +
      "</div>";

    const searchButton = list.querySelector("#search-toggle");
    const searchItem = searchButton ? searchButton.closest("li") : null;
    if (searchItem) list.insertBefore(item, searchItem);
    else list.appendChild(item);

    item.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-lang]");
      if (!button) return;
      store(button.dataset.lang);
      applyLanguage(button.dataset.lang);
    });
  };

  const applyLanguage = (lang) => {
    current = lang === "zh" ? "zh" : "en";
    const root = document.documentElement;
    root.dataset.lang = current;
    root.lang = current === "zh" ? "zh-CN" : "en";
    collect();
    translate(current);
    syncTitle(current);
    ensureSwitcher();
    updateSwitcher();
  };

  // The theme loads this script at the end of <body>, so the page is already parsed: switch right away
  // to avoid a flash of English. Run again once everything (table of contents, search) has loaded.
  applyLanguage(preferredLang());
  document.addEventListener("DOMContentLoaded", () => applyLanguage(current));
  window.addEventListener("load", () => applyLanguage(current));
})();
