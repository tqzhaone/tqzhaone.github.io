/*
 * The Publications page (/publications/): the All / First author filter and the Copy BibTeX
 * buttons. The list and the BibTeX data (#bibtex) are written by tools/build.py and put into the
 * page by tools/build-site.js.
 */
(function () {
  "use strict";

  const pubs = document.querySelector("[data-pubs]");
  if (!pubs) return;

  const lang = () => (document.documentElement.dataset.lang === "zh" ? "zh" : "en");
  const status = document.querySelector("[data-status]");
  const announce = (en, zh) => {
    if (status) status.textContent = lang() === "zh" ? zh : en;
  };

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

  // All / First author. The counts on the buttons follow the list.
  const filterButtons = pubs.querySelectorAll("[data-filter]");
  const counts = { all: pubs.querySelectorAll(".pub").length, first: pubs.querySelectorAll('.pub[data-first="true"]').length };
  filterButtons.forEach((button) => {
    const n = button.querySelector(".filter__n");
    if (n) n.textContent = String(counts[button.dataset.filter]);
    button.addEventListener("click", () => {
      const firstOnly = button.dataset.filter === "first";
      filterButtons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      pubs.querySelectorAll(".pub").forEach((item) => {
        item.hidden = firstOnly && item.dataset.first !== "true";
      });
      pubs.querySelectorAll(".year").forEach((year) => {
        year.hidden = !year.querySelector(".pub:not([hidden])");
      });
    });
  });

  // Copy BibTeX.
  const data = document.getElementById("bibtex");
  const bibtex = data ? JSON.parse(data.textContent) : {};

  pubs.querySelectorAll("[data-bib]").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = bibtex[button.dataset.bib];
      if (!text) return;
      if (await copyText(text)) {
        showDone(button);
        announce("BibTeX copied", "已复制 BibTeX");
        return;
      }
      // The browser refused the clipboard: show the entry so it can be copied by hand.
      const item = button.closest(".pub");
      let pre = item.querySelector(".bibtex");
      if (!pre) {
        pre = document.createElement("pre");
        pre.className = "bibtex";
        pre.tabIndex = 0;
        pre.textContent = text;
        item.appendChild(pre);
      }
      pre.focus();
      window.getSelection().selectAllChildren(pre);
    });
  });
})();
