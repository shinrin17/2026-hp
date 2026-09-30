(() => {
  const filters = document.querySelectorAll('.works-filters button');
  const works = document.querySelectorAll('#works-results .work');
  const status = document.querySelector('.filter-status');
  const grid = document.getElementById('works-results');
  let layoutFrame = null;

  // Place works in date order, filling the shortest column each time.
  function layoutWorks() {
    const styles = getComputedStyle(grid);
    const columns = Number(styles.getPropertyValue('--works-columns'));
    const gap = parseFloat(styles.getPropertyValue('--works-gap'));
    const width = (grid.clientWidth - gap * (columns - 1)) / columns;
    const visibleWorks = Array.from(works).filter((work) => !work.hidden);
    const heights = Array(columns).fill(0);

    grid.classList.add('is-masonry');
    visibleWorks.forEach((work) => {
      work.style.width = `${width}px`;
    });

    // Read all heights together before updating positions.
    const workHeights = visibleWorks.map((work) => work.getBoundingClientRect().height);
    visibleWorks.forEach((work, index) => {
      const column = heights.indexOf(Math.min(...heights));
      work.style.transform = `translate(${column * (width + gap)}px, ${heights[column]}px)`;
      heights[column] += workHeights[index] + gap;
    });
    grid.style.height = `${Math.max(0, ...heights) - (visibleWorks.length ? gap : 0)}px`;
  }

  function scheduleLayout() {
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      layoutWorks();
    });
  }

  works.forEach((work) => {
    const image = work.querySelector('img');
    image.addEventListener('load', scheduleLayout);
    image.addEventListener('error', scheduleLayout);
  });

  // Recalculate for responsive widths and images that finish loading later.
  const imageObserver = new ResizeObserver(scheduleLayout);
  works.forEach((work) => imageObserver.observe(work.querySelector('img')));
  let previousWidth = grid.clientWidth;
  const gridObserver = new ResizeObserver(() => {
    if (grid.clientWidth !== previousWidth) {
      previousWidth = grid.clientWidth;
      scheduleLayout();
    }
  });
  gridObserver.observe(grid);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('pageshow', scheduleLayout);

  function filterWorks(category) {
    let count = 0;

    works.forEach((work) => {
      work.hidden = category !== 'all' && !work.dataset.category.split(' ').includes(category);
      if (!work.hidden) count += 1;
    });

    filters.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === category));
    });

    const selected = Array.from(filters).find((button) => button.dataset.filter === category);
    status.textContent = `${selected.textContent}：${count}件の作品を表示`;
    layoutWorks();
  }

  filters.forEach((button) => {
    button.addEventListener('click', () => filterWorks(button.dataset.filter));
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
      private: 'private',
    };
    if (Object.hasOwn(categories, hash)) {
      filterWorks(categories[hash]);
      document.getElementById('works-results').scrollIntoView();
      return;
    }

    const target = document.getElementById(hash);
    const work = target?.closest('.work');
    if (work?.hidden) {
      filterWorks(work.dataset.category.split(' ')[0]);
      target.scrollIntoView();
    }
  }

  window.addEventListener('hashchange', revealLinkedWork);

  filterWorks('all');
  revealLinkedWork();
})();
