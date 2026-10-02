"use strict";

(() => {
  const page = document.querySelector(".case-studies-page");
  if (!page) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const supportsObserver = "IntersectionObserver" in window;
  const timers = new Set();

  function later(fn, delay) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, delay);
    timers.add(id);
  }

  function finishAll() {
    timers.forEach(id => clearTimeout(id));
    timers.clear();
    page.classList.remove("case-motion-enabled", "case-hero-playing");
    document.querySelectorAll(".case-reveal").forEach(el => el.classList.add("reveal-in"));
    const flow = document.getElementById("caseMethodFlow");
    if (flow) {
      flow.classList.remove("flow-playing");
      flow.querySelectorAll(".case-method-step").forEach(el => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    }
  }

  if (reduced.matches || !supportsObserver) {
    finishAll();
    return;
  }

  page.classList.add("case-motion-enabled");

  const hero = document.querySelector(".case-hero-copy");
  if (hero) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      page.classList.add("case-hero-playing");
      later(() => page.classList.remove("case-motion-enabled", "case-hero-playing"), 850);
    }, { threshold: .12 });
    observer.observe(hero);
  }

  const method = document.getElementById("caseMethodFlow");
  if (method) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      method.classList.add("flow-playing");
      later(() => {
        method.classList.remove("flow-playing");
        method.querySelectorAll(".case-method-step").forEach(el => {
          el.style.opacity = "1";
          el.style.transform = "none";
        });
      }, 900);
    }, { threshold: .2 });
    observer.observe(method);
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealObserver.unobserve(entry.target);

      const metrics = entry.target.querySelector(".case-metric-grid");
      if (metrics) {
        metrics.classList.add("metrics-playing");
        later(() => metrics.classList.remove("metrics-playing"), 900);
      }
    });
  }, { threshold: .14, rootMargin: "0px 0px -7% 0px" });

  document.querySelectorAll(".case-reveal").forEach(el => revealObserver.observe(el));

  reduced.addEventListener("change", event => {
    if (event.matches) finishAll();
  });
})();
