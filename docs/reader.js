/* Reading/navigation enhancements; no research data or chart scales are changed. */
(() => {
  const main = document.querySelector('main');
  if (!main) return;

  const help = document.createElement('p');
  help.id = 'chart-keyboard-help';
  help.className = 'sr-only';
  help.textContent = '선 그래프에서 왼쪽과 오른쪽 방향키로 시점을 이동합니다. Home은 처음, End는 마지막 시점입니다. Escape로 수치 표시를 닫습니다.';
  document.body.append(help);

  const regions = [...main.querySelectorAll('.chart, .wrap')];
  const headingFor = region => {
    let node = region.previousElementSibling;
    while (node && !node.matches('h2, h3')) node = node.previousElementSibling;
    return node?.textContent.trim() || '분석 자료';
  };
  const updateRegion = region => {
    const scrollable = region.scrollWidth > region.clientWidth + 1;
    if (scrollable) {
      region.dataset.scrollable = 'true';
      region.tabIndex = 0;
      region.setAttribute('role', 'region');
      region.setAttribute('aria-label', `${headingFor(region)} ${region.classList.contains('chart') ? '그래프' : '표'}, 좌우로 스크롤할 수 있습니다.`);
    } else {
      delete region.dataset.scrollable;
      region.removeAttribute('tabindex');
      region.removeAttribute('role');
      region.removeAttribute('aria-label');
    }
  };
  let scheduled = false;
  const update = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      regions.forEach(updateRegion);
    });
  };
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(update);
    regions.forEach(region => observer.observe(region));
  }
  new MutationObserver(update).observe(main, { childList: true, subtree: true });
  window.addEventListener('resize', update, { passive: true });
  document.fonts?.ready.then(update);
  update();

  const links = [...main.querySelectorAll('.toc a[href^="#"]')];
  const targets = links.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
  let navScheduled = false;
  const updateLocation = () => {
    if (navScheduled) return;
    navScheduled = true;
    requestAnimationFrame(() => {
      navScheduled = false;
      let current = null;
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= 120) current = target.id;
      }
      for (const link of links) {
        if (link.hash === `#${current}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    });
  };
  window.addEventListener('scroll', updateLocation, { passive: true });
  window.addEventListener('hashchange', updateLocation);
  window.addEventListener('resize', updateLocation, { passive: true });
  new MutationObserver(updateLocation).observe(main, { childList: true, subtree: true });
  updateLocation();
})();
