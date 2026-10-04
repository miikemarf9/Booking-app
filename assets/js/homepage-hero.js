"use strict";
// Illustrative homepage product story. Never reads or writes customer data.
(() => {
  const demo = document.getElementById("gb-product-demo");
  if (!demo) return;

  const card = demo.querySelector(".gb-demo-window");
  const panels = [...demo.querySelectorAll("[data-gb-face]")];
  const dots = [...demo.querySelectorAll(".gb-story-dot")];
  const control = demo.querySelector(".gb-demo-control");
  const caption = demo.querySelector(".gb-demo-caption");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const captions = [
    "A booking lands in the diary.",
    "That booking becomes useful customer history.",
    "That customer history helps show where value began."
  ];

  const DWELL_MS = 5600;
  const TURN_OUT_MS = 620;
  const TURN_IN_MS = 700;

  let step = 0;
  let timer = null;
  let playing = false;
  let started = false;
  let visible = false;
  let turning = false;
  let transitionTimers = [];

  function clearTransitionTimers() {
    transitionTimers.forEach(clearTimeout);
    transitionTimers = [];
  }

  function updateControl() {
    if (reduced.matches) {
      control.textContent = "Next →";
      control.setAttribute("aria-label", "Show next product story");
      return;
    }
    control.textContent = playing ? "Pause Ⅱ" : started ? "Resume ▶" : "Play demo ▶";
    control.setAttribute("aria-label", playing ? "Pause product walkthrough" : "Play product walkthrough");
  }

  function renderFace(index, animateContents = true) {
    step = index;
    panels.forEach((panel, i) => {
      panel.hidden = i !== index;
      panel.classList.remove("gb-panel-enter");
    });
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));

    if (animateContents && !reduced.matches) {
      void panels[index].offsetWidth;
      panels[index].classList.add("gb-panel-enter");
    }

    caption.textContent = captions[index];
    demo.dataset.activeStep = String(index);
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
    playing = false;
    updateControl();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden || !visible || reduced.matches || !playing) return stop();
      rotateTo((step + 1) % panels.length);
    }, DWELL_MS);
  }

  function rotateTo(index) {
    if (turning || index === step) {
      if (playing) schedule();
      return;
    }

    if (reduced.matches) {
      renderFace(index, false);
      if (playing) schedule();
      return;
    }

    turning = true;
    clearTimeout(timer);
    timer = null;
    card.classList.remove("gb-turn-in");
    card.classList.add("gb-turn-out");

    transitionTimers.push(setTimeout(() => {
      renderFace(index, true);
      card.classList.remove("gb-turn-out");
      void card.offsetWidth;
      card.classList.add("gb-turn-in");

      transitionTimers.push(setTimeout(() => {
        card.classList.remove("gb-turn-in");
        turning = false;
        if (playing && visible && !document.hidden) schedule();
      }, TURN_IN_MS));
    }, TURN_OUT_MS));
  }

  function play() {
    stop();
    started = true;
    if (!reduced.matches) {
      playing = true;
      schedule();
    }
    updateControl();
  }

  control.addEventListener("click", () => {
    if (reduced.matches) {
      started = true;
      renderFace((step + 1) % panels.length, false);
      updateControl();
      return;
    }
    if (playing) {
      stop();
      return;
    }
    play();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });

  reduced.addEventListener("change", () => {
    clearTransitionTimers();
    turning = false;
    card.classList.remove("gb-turn-out", "gb-turn-in");
    if (reduced.matches) {
      stop();
      renderFace(step, false);
    }
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (!visible) {
        stop();
        return;
      }
      if (!started && !reduced.matches) play();
    }, { threshold: .45 });
    observer.observe(demo);
  } else {
    visible = true;
  }

  renderFace(0, false);
  updateControl();
})();