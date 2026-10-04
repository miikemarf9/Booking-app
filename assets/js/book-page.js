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
      const appointments = preview.querySelector("[data-book-appointments]");
      const freeTime = preview.querySelector("[data-book-free-time]");
      const nextSlot = preview.querySelector("[data-book-next-slot]");
      const nextDuration = preview.querySelector("[data-book-next-duration]");
      const slot = preview.querySelector(".book-available-slot");
      if (appointments) appointments.textContent = "8";
      if (freeTime) freeTime.textContent = "2h 15m";
      if (nextSlot) nextSlot.textContent = "16:00";
      if (nextDuration) nextDuration.textContent = "60 min";
      if (slot) {
        slot.classList.add("slot-booked");
        slot.querySelector(".book-slot-confirmed-state")?.setAttribute("aria-hidden", "false");
      }
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

  // Diary demo: show an available slot becoming a confirmed booking.
  const preview = document.getElementById("bookHeroPreview");
  if (preview) {
    const counters = [...preview.querySelectorAll("[data-book-count]")];
    const appointments = preview.querySelector("[data-book-appointments]");
    const freeTime = preview.querySelector("[data-book-free-time]");
    const nextSlot = preview.querySelector("[data-book-next-slot]");
    const nextDuration = preview.querySelector("[data-book-next-duration]");
    const availableSlot = preview.querySelector(".book-available-slot");
    const confirmedState = preview.querySelector(".book-slot-confirmed-state");
    let frame = 0;

    const setCounterValues = useFinal => {
      counters.forEach(el => {
        const value = useFinal ? el.dataset.bookCount : (el.dataset.bookStart ?? el.dataset.bookCount ?? "0");
        el.textContent = (el.dataset.prefix || "") + value;
      });
    };

    const setSummary = useFinal => {
      if (appointments) appointments.textContent = useFinal ? "8" : "7";
      if (freeTime) freeTime.textContent = useFinal ? "2h 15m" : "3h";
      if (nextSlot) nextSlot.textContent = useFinal ? "16:00" : "14:30";
      if (nextDuration) nextDuration.textContent = useFinal ? "60 min" : "45 min";
    };

    const completeBooking = () => {
      availableSlot?.classList.add("slot-booked");
      confirmedState?.setAttribute("aria-hidden", "false");
      setSummary(true);

      const moneyCounter = counters.find(el => el.dataset.prefix === "£");
      if (!moneyCounter) {
        setCounterValues(true);
        return;
      }

      const from = Number(moneyCounter.dataset.bookStart || 0);
      const to = Number(moneyCounter.dataset.bookCount || from);
      const started = performance.now();

      const tickMoney = now => {
        const p = Math.min(1, (now - started) / 520);
        const eased = 1 - Math.pow(1 - p, 3);
        moneyCounter.textContent = "£" + Math.round(from + (to - from) * eased);
        if (p < 1) frame = requestAnimationFrame(tickMoney);
        else moneyCounter.textContent = "£" + to;
      };
      frame = requestAnimationFrame(tickMoney);
    };

    setCounterValues(false);
    setSummary(false);

    const previewObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      previewObserver.disconnect();
      preview.classList.add("book-preview-playing");

      later(() => completeBooking(), 1550);

      later(() => {
        setCounterValues(true);
        setSummary(true);
        preview.classList.remove("book-preview-playing");
        preview.classList.add("book-preview-complete");
      }, 2400);
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
