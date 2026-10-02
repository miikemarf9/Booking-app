"use strict";

(() => {
  const page = document.querySelector(".contact-product-page");
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
    page.classList.remove("contact-motion-enabled", "contact-hero-playing");

    document.querySelectorAll(".contact-reveal, .contact-stagger").forEach(el => {
      el.classList.add("reveal-in");
    });

    const principles = document.querySelector(".contact-principles");
    if (principles) {
      principles.classList.remove("principles-playing");
      principles.querySelectorAll(".contact-principle-item").forEach(el => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    }
  }

  const form = document.querySelector('form[name="grabandbook-contact"]');
  const submit = document.getElementById("contactSubmitBtn");
  const label = submit?.querySelector(".contact-submit-label");

  function resetSubmit() {
    if (!submit) return;
    submit.disabled = false;
    submit.classList.remove("is-sending");
    submit.removeAttribute("aria-busy");
    if (label) label.textContent = "Send message";
  }

  window.addEventListener("pageshow", resetSubmit);

  if (form && submit) {
    form.addEventListener("submit", event => {
      if (!form.checkValidity()) {
        resetSubmit();
        return;
      }
      submit.disabled = true;
      submit.classList.add("is-sending");
      if (label) label.textContent = "Sending…";
      submit.setAttribute("aria-busy", "true");
    });
  }

  if (reduced.matches || !supportsObserver) {
    finishAll();
    return;
  }

  page.classList.add("contact-motion-enabled");

  const hero = document.querySelector(".contact-hero-copy");
  if (hero) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      page.classList.add("contact-hero-playing");

      const principles = document.querySelector(".contact-principles");
      if (principles) principles.classList.add("principles-playing");

      later(() => {
        page.classList.remove("contact-hero-playing");
        hero.querySelectorAll(".contact-hero-item").forEach(el => {
          el.style.opacity = "1";
          el.style.transform = "none";
        });
        if (principles) {
          principles.classList.remove("principles-playing");
          principles.querySelectorAll(".contact-principle-item").forEach(el => {
            el.style.opacity = "1";
            el.style.transform = "none";
          });
        }
      }, 1000);
    }, { threshold: .12 });
    observer.observe(hero);
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("reveal-in");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .14, rootMargin: "0px 0px -7% 0px" });

  document.querySelectorAll(".contact-reveal, .contact-stagger").forEach(el => revealObserver.observe(el));

  reduced.addEventListener("change", event => {
    if (event.matches) finishAll();
  });
})();
