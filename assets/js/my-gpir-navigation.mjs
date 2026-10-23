const SECTIONS = new Set(['profile', 'library', 'payments', 'plan']);

export function activeSection(hash = '') {
  const section = String(hash).replace(/^#/, '').toLowerCase();
  return SECTIONS.has(section) ? section : 'overview';
}

export function syncMyGpirNavigation(document, hash = '') {
  const navigation = document?.querySelector?.('[data-my-gpir-navigation]');
  if (!navigation) return false;
  const active = activeSection(hash);
  const grid = document.querySelector('[data-reader-view]');
  if (grid) grid.dataset.readerView = active;
  const main = document.querySelector('[data-reader-dashboard]');
  if (main) main.dataset.activeView = active;
  for (const link of navigation.querySelectorAll('[data-gpir-section]')) {
    if (link.dataset.gpirSection === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const sync = () => syncMyGpirNavigation(document, window.location.hash);
  sync();
  window.addEventListener('hashchange', sync);
}
