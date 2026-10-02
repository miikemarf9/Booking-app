"use strict";

(() => {
  const page = document.querySelector(".crm-product-page");
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

  function finalText(el, attr) {
    return (el.dataset.prefix || "") + (el.dataset[attr] || "0") + (el.dataset.suffix || "");
  }

  function finishAll() {
    clearTimers();
    page.classList.remove("crm-motion-ready", "crm-hero-playing");

    document.querySelectorAll(".crm-reveal, .crm-stagger").forEach(el => {
      el.classList.add("reveal-in");
    });

    const hero = document.getElementById("crmHeroPreview");
    if (hero) {
      hero.classList.remove("crm-preview-playing");
      hero.classList.add("crm-preview-complete");
      hero.querySelectorAll("[data-crm-count]").forEach(el => {
        el.textContent = finalText(el, "crmCount");
      });
    }

    const analytics = document.getElementById("crmAnalyticsPreview");
    if (analytics) {
      analytics.classList.remove("analytics-playing");
      analytics.classList.add("analytics-complete");
      analytics.querySelectorAll("[data-crm-analytics-count]").forEach(el => {
        el.textContent = finalText(el, "crmAnalyticsCount");
      });
      analytics.querySelectorAll(".crm-status-step").forEach(el => el.classList.remove("status-active"));
    }
  }

  if (reduced.matches || !supportsObserver) {
    finishAll();
    return;
  }

  page.classList.add("crm-motion-ready");

  // Hero copy
  const heroCopy = document.querySelector(".crm-hero-copy");
  if (heroCopy) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      page.classList.add("crm-hero-playing");
      later(() => page.classList.remove("crm-motion-ready", "crm-hero-playing"), 950);
    }, { threshold: .12 });
    observer.observe(heroCopy);
  }

  // Customer profile builds from raw data into a useful profile.
  const hero = document.getElementById("crmHeroPreview");
  if (hero) {
    const counters = [...hero.querySelectorAll("[data-crm-count]")];
    let frame = 0;

    const setFinal = () => {
      counters.forEach(el => el.textContent = finalText(el, "crmCount"));
    };

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      hero.classList.add("crm-preview-playing");

      const started = performance.now();
      const tick = now => {
        if (reduced.matches || document.hidden) {
          if (frame) cancelAnimationFrame(frame);
          setFinal();
          hero.classList.remove("crm-preview-playing");
          hero.classList.add("crm-preview-complete");
          return;
        }

        const p = Math.min(1, Math.max(0, (now - started - 220) / 980));
        const eased = 1 - Math.pow(1 - p, 3);

        counters.forEach(el => {
          const target = Number(el.dataset.crmCount || 0);
          el.textContent = (el.dataset.prefix || "") + Math.round(target * eased) + (el.dataset.suffix || "");
        });

        if (p < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          later(() => {
            setFinal();
            hero.classList.remove("crm-preview-playing");
            hero.classList.add("crm-preview-complete");
          }, 520);
        }
      };

      frame = requestAnimationFrame(tick);
    }, { threshold: .15 });

    observer.observe(hero);
  }

  // Standard content reveals.
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -7% 0px" });

  document.querySelectorAll(".crm-reveal, .crm-stagger").forEach(el => revealObserver.observe(el));

  // Analytics: metrics → health bars → changing retention status.
  const analytics = document.getElementById("crmAnalyticsPreview");
  if (analytics) {
    const counters = [...analytics.querySelectorAll("[data-crm-analytics-count]")];
    const statuses = [...analytics.querySelectorAll(".crm-status-step")];
    let frame = 0;

    const setFinal = () => {
      counters.forEach(el => el.textContent = finalText(el, "crmAnalyticsCount"));
    };

    const setStatus = index => {
      statuses.forEach((el, i) => el.classList.toggle("status-active", i === index));
    };

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();

      analytics.classList.add("analytics-playing");
      setStatus(0);

      const started = performance.now();
      const tick = now => {
        if (reduced.matches || document.hidden) {
          if (frame) cancelAnimationFrame(frame);
          setFinal();
          analytics.classList.remove("analytics-playing");
          analytics.classList.add("analytics-complete");
          statuses.forEach(el => el.classList.remove("status-active"));
          return;
        }

        const p = Math.min(1, Math.max(0, (now - started - 140) / 1100));
        const eased = 1 - Math.pow(1 - p, 3);

        counters.forEach(el => {
          const target = Number(el.dataset.crmAnalyticsCount || 0);
          el.textContent = (el.dataset.prefix || "") + Math.round(target * eased) + (el.dataset.suffix || "");
        });

        if (p < 1) frame = requestAnimationFrame(tick);
        else setFinal();
      };

      frame = requestAnimationFrame(tick);

      later(() => setStatus(1), 1180);
      later(() => setStatus(2), 1580);
      later(() => {
        statuses.forEach(el => el.classList.remove("status-active"));
        analytics.classList.remove("analytics-playing");
        analytics.classList.add("analytics-complete");
      }, 2260);
    }, { threshold: .26 });

    observer.observe(analytics);
  }

  reduced.addEventListener("change", event => {
    if (event.matches) finishAll();
  });
})();
