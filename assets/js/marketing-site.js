"use strict";

(function () {
  function emitMarketingEvent(name, detail) {
    const payload = Object.assign({
      event: name,
      page: window.location.pathname
    }, detail || {});

    window.dispatchEvent(new CustomEvent("grabandbook:marketing", { detail: payload }));

    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(payload);
    }
  }

  document.addEventListener("click", function (event) {
    const target = event.target.closest("[data-cta]");
    if (!target) return;
    emitMarketingEvent("marketing_cta_click", {
      cta: target.dataset.cta || "unknown"
    });
  });

  const contactForm = document.querySelector('form[name="grabandbook-contact"]');
  if (contactForm) {
    contactForm.addEventListener("submit", function () {
      emitMarketingEvent("contact_form_submit", {
        form: "grabandbook-contact"
      });
    });
  }
})();
