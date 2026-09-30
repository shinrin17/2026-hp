function initWorksFilter() {
  const filters = document.querySelectorAll('.works-filters button');
  const works = document.querySelectorAll('#works-results .work');
  const grid = document.getElementById('works-results');
  if (!grid) return;
  const controller = new AbortController();
  const { signal } = controller;

  const cards = Array.from(works, (work) => {
    const image = work.querySelector('img');
    return { work, image, ratio: Number(image.getAttribute('height')) / Number(image.getAttribute('width')) };
  });
  let layoutFrame = null;
  let activeCategory = 'all';
  let previousLayout = '';

  // Place works in date order, filling the shortest column each time.
  function layoutWorks() {
    const styles = getComputedStyle(grid);
    const columns = Number(styles.getPropertyValue('--works-columns'));
    const gap = parseFloat(styles.getPropertyValue('--works-gap'));
    const gridWidth = grid.clientWidth;
    const layoutKey = `${gridWidth}:${columns}:${gap}:${activeCategory}`;
    if (gridWidth === 0 || layoutKey === previousLayout) return;
    previousLayout = layoutKey;

    const width = (gridWidth - gap * (columns - 1)) / columns;
    const visibleCards = cards.filter(({ work }) => !work.hidden);
    const heights = Array(columns).fill(0);

    // Dimensions in the HTML reserve the image space before lazy loading.
    // Calculate positions without measuring cards or forcing layout after writes.
    grid.classList.add('is-masonry');
    visibleCards.forEach(({ work, ratio }) => {
      const column = heights.indexOf(Math.min(...heights));
      work.style.width = `${width}px`;
      work.style.transform = `translate(${column * (width + gap)}px, ${heights[column]}px)`;
      heights[column] += width * ratio + gap;
    });
    grid.style.height = `${Math.max(0, ...heights) - (visibleCards.length ? gap : 0)}px`;
  }

  function scheduleLayout() {
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      layoutWorks();
    });
  }

  // Observe the container only; image loads never change the reserved geometry.
  let previousWidth = grid.clientWidth;
  const gridObserver = new ResizeObserver(() => {
    if (grid.clientWidth !== previousWidth) {
      previousWidth = grid.clientWidth;
      scheduleLayout();
    }
  });
  gridObserver.observe(grid);
  window.addEventListener('resize', scheduleLayout, { signal });
  window.addEventListener('pageshow', scheduleLayout, { signal });

  function filterWorks(category) {
    activeCategory = category;
    works.forEach((work) => {
      work.hidden = category !== 'all' && !work.dataset.category.split(' ').includes(category);
    });

    filters.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === category));
    });

    layoutWorks();
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => filterWorks(button.dataset.filter), { signal });
  });

  // Keep category links from the home page and links to individual works usable.
  function revealLinkedWork() {
    const hash = window.location.hash.slice(1);
    const categories = {
      photo: 'photo',
      movie: 'movie',
      'production-staff': 'production-staff',
      photography: 'photo',
      directing: 'movie',
      production: 'production-staff',
    };
    if (Object.hasOwn(categories, hash)) {
      filterWorks(categories[hash]);
      document.getElementById('works-results').scrollIntoView();
      return;
    }

    const target = document.getElementById(hash);
    const work = target?.closest('.work');
    if (work) {
      if (work.hidden) filterWorks(work.dataset.category.split(' ')[0]);
      target.scrollIntoView();
    }
  }

  window.addEventListener('hashchange', revealLinkedWork, { signal });

  filterWorks('all');
  revealLinkedWork();

  // Native lazy loading can finish well below the viewport. Reveal each image
  // only once it is decoded AND on screen, including images already in cache.
  const readyImages = new WeakSet();
  const visibleImages = new WeakSet();
  function revealImage(image) {
    if (!readyImages.has(image) || !visibleImages.has(image)) return;
    image.classList.add('is-visible');
    revealObserver.unobserve(image);
  }
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ target: image, isIntersecting }) => {
      if (isIntersecting) {
        visibleImages.add(image);
        revealImage(image);
      } else {
        visibleImages.delete(image);
      }
    });
  });

  grid.classList.add('is-revealing');
  cards.forEach(({ image }) => {
    async function prepareImage() {
      // A failed image must still expose its alt text and keep its reserved space.
      try { await image.decode(); } catch { /* Load errors also become visible. */ }
      if (signal.aborted) return;
      readyImages.add(image);
      revealImage(image);
    }
    if (image.complete) {
      void prepareImage();
    } else {
      image.addEventListener('load', prepareImage, { once: true, signal });
      image.addEventListener('error', prepareImage, { once: true, signal });
    }
    revealObserver.observe(image);
  });
  document.addEventListener('astro:before-swap', () => {
    controller.abort();
    cancelAnimationFrame(layoutFrame);
    gridObserver.disconnect();
    revealObserver.disconnect();
  }, { once: true, signal });
}

document.addEventListener('astro:page-load', initWorksFilter);
