"use strict";

(() => {
  const page = document.querySelector(".contact-thanks-page");
  if (!page) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduced.matches) return;

  page.classList.add("thanks-motion-enabled");
  requestAnimationFrame(() => {
    page.classList.add("thanks-playing");
    window.setTimeout(() => {
      page.classList.remove("thanks-motion-enabled", "thanks-playing");
    }, 900);
  });
})();
