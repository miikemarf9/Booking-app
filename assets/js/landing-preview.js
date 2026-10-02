"use strict";

// Homepage motion runs once, explains the product, and fully respects reduced motion.
(() => {
  const landing = document.getElementById("landingView");
  const preview = document.getElementById("dashboardPreview");
  if (!landing) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const supportsObserver = "IntersectionObserver" in window;

  const formatCounter = el => {
    const value = Number(el.dataset.previewCount || 0);
    const decimals = Number(el.dataset.decimals || 0);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    return prefix + value.toFixed(decimals) + suffix;
  };

  const finishPreview = () => {
    if (!preview) return;
    preview.querySelectorAll("[data-preview-count]").forEach(el => {
      el.textContent = formatCounter(el);
    });
    preview.classList.remove("preview-playing");
    preview.classList.add("preview-complete");
  };

  const finishEverything = () => {
    landing.classList.remove("homepage-motion-ready");
    landing.classList.add("homepage-hero-complete");
    document.querySelectorAll("#landingView .saas-reveal, #landingView .saas-stagger").forEach(el => {
      el.classList.add("reveal-in");
    });
    finishPreview();
  };

  if (reducedMotion.matches || !supportsObserver) {
    finishEverything();
    return;
  }

  landing.classList.add("homepage-motion-ready");

  // Hero copy enters only when the public homepage is actually shown.
  const heroTarget = landing.querySelector(".homepage-hero-copy");
  if (heroTarget) {
    const heroObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      heroObserver.disconnect();
      landing.classList.add("homepage-hero-playing");
      window.setTimeout(() => {
        landing.classList.remove("homepage-motion-ready", "homepage-hero-playing");
        landing.classList.add("homepage-hero-complete");
      }, 1150);
    }, { threshold: .12 });
    heroObserver.observe(heroTarget);
  }

  // Hero dashboard: finite build-up + accurate demo counters.
  if (preview) {
    const counters = [...preview.querySelectorAll("[data-preview-count]")];
    let frame = 0;
    let started = 0;

    const stopCounter = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      finishPreview();
    };

    const previewObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      previewObserver.disconnect();

      preview.classList.add("preview-playing");
      started = performance.now();

      const tick = now => {
        if (reducedMotion.matches || document.hidden) {
          stopCounter();
          return;
        }

        const progress = Math.min(1, Math.max(0, (now - started - 320) / 1050));
        const eased = 1 - Math.pow(1 - progress, 3);

        counters.forEach(el => {
          const target = Number(el.dataset.previewCount || 0);
          const decimals = Number(el.dataset.decimals || 0);
          const prefix = el.dataset.prefix || "";
          const suffix = el.dataset.suffix || "";
          const current = target * eased;
          el.textContent = prefix + current.toFixed(decimals) + suffix;
        });

        if (progress < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          window.setTimeout(stopCounter, 420);
        }
      };

      frame = requestAnimationFrame(tick);
    }, { threshold: .14 });

    previewObserver.observe(preview);
  }

  // Lower-page reveals. Each element runs once and then becomes ordinary static content.
  const revealTargets = [...document.querySelectorAll("#landingView .saas-reveal, #landingView .saas-stagger")];
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -7% 0px" });

  revealTargets.forEach(el => revealObserver.observe(el));

  reducedMotion.addEventListener("change", event => {
    if (event.matches) finishEverything();
  });
})();
