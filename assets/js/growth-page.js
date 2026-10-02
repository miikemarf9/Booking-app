"use strict";

(() => {
  const page = document.querySelector(".growth-product-page");
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
    return id;
  }

  function clearTimers() {
    timers.forEach(id => clearTimeout(id));
    timers.clear();
  }

  function formatValue(el, attr) {
    const value = Number(el.dataset[attr] || 0);
    const format = el.dataset.format || "integer";
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    let number;

    if (format === "decimal") {
      number = value.toFixed(1);
    } else {
      number = Math.round(value).toLocaleString("en-GB");
    }

    return prefix + number + suffix;
  }

  function setCounterProgress(el, attr, progress) {
    const target = Number(el.dataset[attr] || 0);
    const format = el.dataset.format || "integer";
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    const current = target * progress;
    const number = format === "decimal"
      ? current.toFixed(1)
      : Math.round(current).toLocaleString("en-GB");
    el.textContent = prefix + number + suffix;
  }

  function finishAll() {
    clearTimers();
    page.classList.remove("growth-motion-enabled", "growth-motion-ready", "growth-hero-playing");

    document.querySelectorAll(".growth-reveal, .growth-stagger").forEach(el => {
      el.classList.add("reveal-in");
    });

    const hero = document.getElementById("growthHeroPreview");
    if (hero) {
      hero.classList.remove("growth-preview-playing");
      hero.classList.add("growth-preview-complete");
      hero.querySelectorAll("[data-growth-count]").forEach(el => {
        el.textContent = formatValue(el, "growthCount");
      });
    }

    const quality = document.getElementById("growthQualityPreview");
    if (quality) {
      quality.classList.remove("quality-playing");
      quality.classList.add("quality-complete");
      quality.querySelectorAll("[data-growth-quality-count]").forEach(el => {
        el.textContent = formatValue(el, "growthQualityCount");
      });
      quality.querySelectorAll(".growth-quality-card").forEach(el => el.classList.remove("quality-focus"));
    }

    const flow = document.getElementById("growthIntegrationFlow");
    if (flow) {
      flow.classList.remove("flow-playing");
      flow.classList.add("flow-complete");
    }
  }

  if (reduced.matches || !supportsObserver) {
    finishAll();
    return;
  }

  page.classList.add("growth-motion-enabled", "growth-motion-ready");

  // Hero copy.
  const heroCopy = document.querySelector(".growth-hero-copy");
  if (heroCopy) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      page.classList.add("growth-hero-playing");
      later(() => page.classList.remove("growth-motion-ready", "growth-hero-playing"), 950);
    }, { threshold: .12 });
    observer.observe(heroCopy);
  }

  // Growth overview: metrics first, then channels.
  const hero = document.getElementById("growthHeroPreview");
  if (hero) {
    const counters = [...hero.querySelectorAll("[data-growth-count]")];
    let frame = 0;

    const setFinal = () => counters.forEach(el => {
      el.textContent = formatValue(el, "growthCount");
    });

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();

      hero.classList.add("growth-preview-playing");
      const started = performance.now();

      const tick = now => {
        if (reduced.matches || document.hidden) {
          if (frame) cancelAnimationFrame(frame);
          setFinal();
          hero.classList.remove("growth-preview-playing");
          hero.classList.add("growth-preview-complete");
          return;
        }

        const p = Math.min(1, Math.max(0, (now - started - 220) / 1050));
        const eased = 1 - Math.pow(1 - p, 3);
        counters.forEach(el => setCounterProgress(el, "growthCount", eased));

        if (p < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          later(() => {
            setFinal();
            hero.classList.remove("growth-preview-playing");
            hero.classList.add("growth-preview-complete");
          }, 430);
        }
      };

      frame = requestAnimationFrame(tick);
    }, { threshold: .15 });

    observer.observe(hero);
  }

  // Standard section reveals.
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -7% 0px" });

  document.querySelectorAll(".growth-reveal, .growth-stagger").forEach(el => {
    revealObserver.observe(el);
  });

  // Customer quality: compare acquisition sources on what happens after the first booking.
  const quality = document.getElementById("growthQualityPreview");
  if (quality) {
    const counters = [...quality.querySelectorAll("[data-growth-quality-count]")];
    const google = quality.querySelector(".growth-quality-google");
    const instagram = quality.querySelector(".growth-quality-instagram");
    let frame = 0;

    const setFinal = () => counters.forEach(el => {
      el.textContent = formatValue(el, "growthQualityCount");
    });

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();

      quality.classList.add("quality-playing");
      const started = performance.now();

      const tick = now => {
        if (reduced.matches || document.hidden) {
          if (frame) cancelAnimationFrame(frame);
          setFinal();
          quality.classList.remove("quality-playing");
          quality.classList.add("quality-complete");
          return;
        }

        const p = Math.min(1, Math.max(0, (now - started - 160) / 980));
        const eased = 1 - Math.pow(1 - p, 3);
        counters.forEach(el => setCounterProgress(el, "growthQualityCount", eased));

        if (p < 1) frame = requestAnimationFrame(tick);
        else setFinal();
      };

      frame = requestAnimationFrame(tick);

      later(() => google?.classList.add("quality-focus"), 720);
      later(() => {
        google?.classList.remove("quality-focus");
        instagram?.classList.add("quality-focus");
      }, 1180);
      later(() => instagram?.classList.remove("quality-focus"), 1700);

      later(() => {
        quality.classList.remove("quality-playing");
        quality.classList.add("quality-complete");
        setFinal();
      }, 2100);
    }, { threshold: .28 });

    observer.observe(quality);
  }

  // Connected sources: four external contexts flow into one Growth workspace.
  const integrationFlow = document.getElementById("growthIntegrationFlow");
  if (integrationFlow) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();

      integrationFlow.classList.add("flow-playing");
      later(() => {
        integrationFlow.classList.remove("flow-playing");
        integrationFlow.classList.add("flow-complete");
      }, 1900);
    }, { threshold: .22 });

    observer.observe(integrationFlow);
  }

  reduced.addEventListener("change", event => {
    if (event.matches) finishAll();
  });
})();
