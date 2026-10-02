"use strict";
// An isolated, illustrative walkthrough. Never reads or writes customer data.
(() => {
  const demo = document.getElementById("gb-product-demo");
  if (!demo) return;
  const tabs = [...demo.querySelectorAll("[data-gb-step]")];
  const panels = [...demo.querySelectorAll('[role="tabpanel"]')];
  const control = demo.querySelector(".gb-demo-control");
  const caption = demo.querySelector(".gb-demo-caption");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const captions = ["Less booking admin. More time for your customers.", "Use customer history to encourage the next visit.", "Focus your marketing using recorded customer value."];
  let step = 0;
  let timer = null;
  let playing = false;
  let started = false;
  let visible = false;

  function updateControl() {
    control.textContent = playing ? "Pause Ⅱ" : started ? "Resume ▶" : "Play demo ▶";
    control.setAttribute("aria-label", playing ? "Pause product walkthrough" : "Play product walkthrough");
  }
  function stop() {
    clearTimeout(timer);
    timer = null;
    playing = false;
    updateControl();
  }
  function show(index, animate = true) {
    step = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
      panels[i].classList.remove("gb-panel-enter");
    });
    if (animate && !reduced.matches) {
      void panels[index].offsetWidth;
      panels[index].classList.add("gb-panel-enter");
    }
    caption.textContent = captions[index];
    demo.dataset.activeStep = String(index);
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden || !visible || reduced.matches) return stop();
      show((step + 1) % tabs.length);
      schedule();
    }, 5500);
  }
  function play() {
    stop();
    if (!started) show(0);
    started = true;
    // Reduced motion users keep manual, instantaneous tab navigation.
    if (!reduced.matches) {
      playing = true;
      schedule();
    }
    updateControl();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => { started = true; stop(); show(index); });
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      started = true;
      stop();
      show(next);
      tabs[next].focus();
    });
  });
  control.addEventListener("click", () => playing ? stop() : play());
  demo.addEventListener("focusin", event => {
    if (event.target !== control) stop();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  reduced.addEventListener("change", () => { if (reduced.matches) { stop(); show(step, false); } });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (!visible) return stop();
      if (!started && !reduced.matches) play();
    }, { threshold: .45 });
    observer.observe(demo);
  } else {
    visible = true;
  }
})();
