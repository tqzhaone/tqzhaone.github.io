/*
 * The drop-downs in the top bar: the "Updates" group (News, Blog, Photos) and the weather.
 *
 * On a wide screen it opens on hover or click and closes on Escape, on a click elsewhere, or when
 * focus leaves it. In the phone menu the three links are simply listed under the group's name.
 */
(function () {
  "use strict";

  const wide = window.matchMedia("(min-width: 981px)");

  document.querySelectorAll("[data-navgroup]").forEach((group) => {
    const button = group.querySelector(".nav__toggle");
    if (!button) return;
    let timer = 0;
    let hoverOpened = -1e9;

    const set = (open) => {
      group.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", String(open));
    };

    // A click just after the pointer opened the menu by hovering is the visitor reaching for it, not
    // asking to close it again.
    button.addEventListener("click", () => {
      if (group.classList.contains("is-open") && performance.now() - hoverOpened < 600) return;
      set(!group.classList.contains("is-open"));
    });

    group.addEventListener("pointerenter", (event) => {
      if (!wide.matches || event.pointerType !== "mouse") return;
      clearTimeout(timer);
      if (!group.classList.contains("is-open")) hoverOpened = performance.now();
      set(true);
    });
    group.addEventListener("pointerleave", (event) => {
      if (!wide.matches || event.pointerType !== "mouse") return;
      clearTimeout(timer);
      timer = setTimeout(() => set(false), 220);
    });

    group.addEventListener("focusout", (event) => {
      if (!group.contains(event.relatedTarget)) set(false);
    });
    document.addEventListener("click", (event) => {
      if (!group.contains(event.target)) set(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && group.classList.contains("is-open")) {
        set(false);
        button.focus();
      }
    });
    wide.addEventListener("change", () => set(false));
  });
})();
