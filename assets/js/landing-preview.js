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


// Interactive homepage diary preview. Demo-only local data; no customer data is read.
(() => {
  const demo = document.getElementById("homepageDiaryDemo");
  if (!demo) return;

  const buttons = [...demo.querySelectorAll("[data-diary-day]")];
  const dateEl = document.getElementById("homepageDiaryDate");
  const summaryEl = document.getElementById("homepageDiarySummary");
  const freeEl = document.getElementById("homepageDiaryFree");
  const agendaEl = document.getElementById("homepageDiaryAgenda");
  if (!buttons.length || !dateEl || !summaryEl || !freeEl || !agendaEl) return;

  const days = {
    "2": {
      date: "Friday 2 October",
      appointments: 3,
      value: 195,
      free: 3,
      agenda: [
        ["09:30", "Consultation", "Mia · 30 min", 45],
        ["12:00", "Signature treatment", "Ella · 60 min", 65],
        ["15:30", "Premium treatment", "Grace · 60 min", 85]
      ]
    },
    "7": {
      date: "Wednesday 7 October",
      appointments: 4,
      value: 285,
      free: 2,
      agenda: [
        ["09:00", "Consultation", "Ava · 30 min", 45],
        ["10:30", "Premium treatment", "Isla · 60 min", 85],
        ["13:30", "Signature treatment", "Ruby · 60 min", 65],
        ["16:00", "Extended treatment", "Chloe · 60 min", 90]
      ]
    },
    "9": {
      date: "Friday 9 October",
      appointments: 4,
      value: 310,
      free: 2,
      agenda: [
        ["09:00", "Consultation", "James · 30 min", 45],
        ["11:00", "Premium treatment", "Sophie · 60 min", 85],
        ["14:30", "Signature treatment", "Amelia · 60 min", 65],
        ["16:00", "Extended treatment", "Olivia · 90 min", 115]
      ]
    },
    "16": {
      date: "Friday 16 October",
      appointments: 3,
      value: 215,
      free: 3,
      agenda: [
        ["10:00", "Consultation", "Emily · 30 min", 45],
        ["13:00", "Premium treatment", "Freya · 60 min", 85],
        ["15:30", "Premium treatment", "Lily · 60 min", 85]
      ]
    },
    "23": {
      date: "Friday 23 October",
      appointments: 5,
      value: 345,
      free: 1,
      agenda: [
        ["09:00", "Consultation", "Lucy · 30 min", 45],
        ["10:00", "Signature treatment", "Evie · 60 min", 65],
        ["12:00", "Premium treatment", "Maya · 60 min", 85],
        ["14:30", "Signature treatment", "Alice · 60 min", 65],
        ["16:00", "Premium treatment", "Sophia · 60 min", 85]
      ]
    },
    "30": {
      date: "Friday 30 October",
      appointments: 2,
      value: 150,
      free: 4,
      agenda: [
        ["10:30", "Signature treatment", "Hannah · 60 min", 65],
        ["14:30", "Premium treatment", "Charlotte · 60 min", 85]
      ]
    }
  };

  const escapeText = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function render(day) {
    const data = days[day];
    if (!data) return;

    buttons.forEach(button => {
      const active = button.dataset.diaryDay === day;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    });

    dateEl.textContent = data.date;
    summaryEl.textContent = `${data.appointments} appointment${data.appointments === 1 ? "" : "s"} · £${data.value} booked`;
    freeEl.textContent = `${data.free} slot${data.free === 1 ? "" : "s"} free`;

    agendaEl.innerHTML = data.agenda.map(([time, service, customer, value]) => `
      <div class="landing-calendar-appointment">
        <time>${escapeText(time)}</time>
        <span><strong>${escapeText(service)}</strong><small>${escapeText(customer)}</small></span>
        <b>£${Number(value).toFixed(0)}</b>
      </div>
    `).join("");

    agendaEl.classList.remove("is-changing");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void agendaEl.offsetWidth;
      agendaEl.classList.add("is-changing");
    }
  }

  buttons.forEach(button => {
    button.addEventListener("click", () => render(button.dataset.diaryDay));
  });
})();