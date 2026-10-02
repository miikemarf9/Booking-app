// Run once when the preview becomes visible, including after the loading view.
    (() => {
      const preview = document.getElementById("dashboardPreview");
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (!preview || motion.matches || !("IntersectionObserver" in window)) return;
      const counters = [...preview.querySelectorAll("[data-preview-count]")];
      let frame;
      const finish = () => {
        cancelAnimationFrame(frame);
        counters.forEach(el => { el.textContent = (el.dataset.prefix || "") + el.dataset.previewCount; });
        preview.classList.remove("preview-playing");
      };
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        if (motion.matches) return;
        preview.classList.add("preview-playing");
        const started = performance.now();
        const tick = now => {
          if (motion.matches || document.hidden) { finish(); return; }
          const progress = Math.min(1, Math.max(0, (now - started - 250) / 1100));
          const eased = 1 - Math.pow(1 - progress, 3);
          counters.forEach(el => {
            el.textContent = (el.dataset.prefix || "") + Math.round(Number(el.dataset.previewCount) * eased);
          });
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }, { threshold: .15 });
      observer.observe(preview);
      motion.addEventListener("change", event => { if (event.matches) finish(); });
    })();
