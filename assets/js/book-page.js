"use strict";

(() => {
  const page = document.querySelector(".book-product-page");
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

  function finishAll() {
    clearTimers();
    page.classList.remove("book-motion-enabled", "book-motion-ready", "book-hero-playing");
    document.querySelectorAll(".book-reveal, .book-stagger").forEach(el => el.classList.add("reveal-in"));

    const preview = document.getElementById("bookHeroPreview");
    if (preview) {
      preview.classList.remove("book-preview-playing");
      preview.classList.add("book-preview-complete");
      preview.querySelectorAll("[data-book-count]").forEach(el => {
        el.textContent = (el.dataset.prefix || "") + (el.dataset.bookCount || "0");
      });
    }

    const journey = document.getElementById("bookJourneyPreview");
    if (journey) {
      journey.classList.remove("journey-playing");
      journey.classList.add("journey-complete");
      journey.querySelectorAll(".book-service-option,.product-slot,.book-confirm-preview").forEach(el => el.classList.add("show"));
      journey.querySelectorAll(".book-journey-step").forEach((el, i, all) => el.classList.toggle("active", i === all.length - 1));
    }
  }

  if (reduced.matches || !supportsObserver) {
    finishAll();
    return;
  }

  page.classList.add("book-motion-enabled", "book-motion-ready");

  // Hero copy: brief entry, then return to ordinary static content.
  const heroCopy = document.querySelector(".book-hero-copy");
  if (heroCopy) {
    const heroObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      heroObserver.disconnect();
      page.classList.add("book-hero-playing");
      later(() => page.classList.remove("book-motion-ready", "book-hero-playing"), 950);
    }, { threshold: .12 });
    heroObserver.observe(heroCopy);
  }

  // Diary demo: build the working day in a logical order and count live metrics.
  const preview = document.getElementById("bookHeroPreview");
  if (preview) {
    const counters = [...preview.querySelectorAll("[data-book-count]")];
    let frame = 0;

    const setFinalCounters = () => {
      counters.forEach(el => {
        el.textContent = (el.dataset.prefix || "") + (el.dataset.bookCount || "0");
      });
    };

    const previewObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      previewObserver.disconnect();
      preview.classList.add("book-preview-playing");

      const started = performance.now();
      const tick = now => {
        if (reduced.matches || document.hidden) {
          if (frame) cancelAnimationFrame(frame);
          setFinalCounters();
          preview.classList.remove("book-preview-playing");
          preview.classList.add("book-preview-complete");
          return;
        }

        const p = Math.min(1, Math.max(0, (now - started - 220) / 950));
        const eased = 1 - Math.pow(1 - p, 3);

        counters.forEach(el => {
          const target = Number(el.dataset.bookCount || 0);
          el.textContent = (el.dataset.prefix || "") + Math.round(target * eased);
        });

        if (p < 1) frame = requestAnimationFrame(tick);
        else later(() => {
          setFinalCounters();
          preview.classList.remove("book-preview-playing");
          preview.classList.add("book-preview-complete");
        }, 460);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: .15 });

    previewObserver.observe(preview);
  }

  // Standard page reveals.
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -7% 0px" });

  document.querySelectorAll(".book-reveal, .book-stagger").forEach(el => revealObserver.observe(el));

  // Customer journey: Service → Staff → Time → Details → Confirm.
  const journey = document.getElementById("bookJourneyPreview");
  if (journey) {
    const steps = [...journey.querySelectorAll(".book-journey-step")];
    const services = [...journey.querySelectorAll(".book-service-option")];
    const slots = [...journey.querySelectorAll(".product-slot")];
    const selectedService = journey.querySelector(".book-service-selected");
    const selectedTime = journey.querySelector(".book-time-selected");
    const confirm = journey.querySelector(".book-confirm-preview");

    const activateStep = index => {
      steps.forEach((step, i) => step.classList.toggle("active", i === index));
    };

    const journeyObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      journeyObserver.disconnect();
      journey.classList.add("journey-playing");

      activateStep(0);
      services.forEach((el, i) => later(() => el.classList.add("show"), 120 + i * 90));
      later(() => selectedService?.classList.add("selected-pulse"), 430);
      later(() => selectedService?.classList.remove("selected-pulse"), 720);

      later(() => activateStep(1), 760);

      later(() => {
        activateStep(2);
        slots.forEach((el, i) => later(() => el.classList.add("show"), i * 65));
      }, 1080);
      later(() => selectedTime?.classList.add("selected-pulse"), 1530);
      later(() => selectedTime?.classList.remove("selected-pulse"), 1810);

      later(() => activateStep(3), 1880);

      later(() => {
        activateStep(4);
        confirm?.classList.add("show");
      }, 2220);

      later(() => {
        activateStep(steps.length - 1);
        journey.classList.remove("journey-playing");
        journey.classList.add("journey-complete");
        services.forEach(el => el.classList.add("show"));
        slots.forEach(el => el.classList.add("show"));
        confirm?.classList.add("show");
      }, 2900);
    }, { threshold: .28 });

    journeyObserver.observe(journey);
  }

  reduced.addEventListener("change", event => {
    if (event.matches) finishAll();
  });
})();
