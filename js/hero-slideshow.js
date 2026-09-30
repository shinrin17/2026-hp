(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const slides = Array.from(hero.querySelectorAll('.hero-slide'));
  const controls = hero.querySelector('.hero-controls');
  const pagination = Array.from(hero.querySelectorAll('[data-slide]'));
  const playback = hero.querySelector('.hero-playback');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let paused = motionPreference.matches;
  let timer = null;

  function showSlide(index) {
    current = index;
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
    window.clearTimeout(timer);
    timer = null;
    playback.textContent = paused ? '再生' : '一時停止';
    hero.querySelector('.hero-slides').setAttribute('aria-live', paused ? 'polite' : 'off');
    if (paused || document.hidden || hero.matches(':hover') || hero.contains(document.activeElement)) return;
    timer = window.setTimeout(() => {
      showSlide((current + 1) % slides.length);
      scheduleSlide();
    }, 5000);
  }

  pagination.forEach((button) => {
    button.addEventListener('click', () => {
      showSlide(Number(button.dataset.slide));
      scheduleSlide();
    });
  });
  playback.addEventListener('click', () => {
    paused = !paused;
    scheduleSlide();
  });
  hero.addEventListener('mouseenter', scheduleSlide);
  hero.addEventListener('mouseleave', scheduleSlide);
  hero.addEventListener('focusin', scheduleSlide);
  hero.addEventListener('focusout', () => {
    // Wait until focus has moved before deciding whether to resume.
    window.setTimeout(scheduleSlide, 0);
  });
  document.addEventListener('visibilitychange', scheduleSlide);
  motionPreference.addEventListener('change', () => {
    paused = motionPreference.matches;
    scheduleSlide();
  });

  controls.hidden = false;
  scheduleSlide();
})();
