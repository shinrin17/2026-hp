function initHeroSlideshow() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const controller = new AbortController();
  const { signal } = controller;

  const slides = Array.from(hero.querySelectorAll('.hero-slide'));
  const controls = hero.querySelector('.hero-controls');
  const pagination = Array.from(hero.querySelectorAll('[data-slide]'));
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let paused = motionPreference.matches;
  const duration = 5000;
  let frame = null;
  let elapsed = 0;
  let startedAt = null;

  function updateProgress() {
    pagination.forEach((button, index) => {
      button.style.setProperty('--progress', String(index === current ? elapsed / duration : 0));
    });
  }

  function showSlide(index) {
    current = index;
    elapsed = 0;
    startedAt = null;
    updateProgress();
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle('is-active', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
    });
    pagination.forEach((button, slideIndex) => {
      button.setAttribute('aria-pressed', String(slideIndex === current));
    });
  }

  function scheduleSlide() {
    window.cancelAnimationFrame(frame);
    frame = null;
    if (startedAt !== null) elapsed = Math.min(duration, elapsed + performance.now() - startedAt);
    startedAt = null;
    updateProgress();
    hero.querySelector('.hero-slides').setAttribute('aria-live', paused ? 'polite' : 'off');
    if (slides.length < 2 || paused || document.hidden) return;
    startedAt = performance.now();
    frame = window.requestAnimationFrame(tick);
  }

  function tick(now) {
    elapsed = Math.min(duration, elapsed + now - startedAt);
    startedAt = now;
    updateProgress();
    if (elapsed >= duration) {
      showSlide((current + 1) % slides.length);
      startedAt = now;
    }
    frame = window.requestAnimationFrame(tick);
  }

  pagination.forEach((button) => {
    button.addEventListener('click', () => {
      showSlide(Number(button.dataset.slide));
      scheduleSlide();
    }, { signal });
  });
  document.addEventListener('visibilitychange', scheduleSlide, { signal });
  motionPreference.addEventListener('change', () => {
    paused = motionPreference.matches;
    scheduleSlide();
  }, { signal });

  document.addEventListener('astro:before-swap', () => {
    controller.abort();
    window.cancelAnimationFrame(frame);
  }, { once: true, signal });

  controls.hidden = false;
  scheduleSlide();
}

document.addEventListener('astro:page-load', initHeroSlideshow);
