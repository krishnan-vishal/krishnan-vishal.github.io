const SECTIONS = new Set(['profile', 'library', 'payments', 'plan']);
const navigationGlobals = new WeakSet();

export function activeSection(hash = '') {
  const section = String(hash).replace(/^#/, '').toLowerCase();
  return SECTIONS.has(section) ? section : 'overview';
}

export function navigationKeyIndex(key, currentIndex, length) {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(length) || length < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + length) % length;
  return null;
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

export function enableMyGpirKeyboardNavigation(document) {
  const navigation = document?.querySelector?.('[data-my-gpir-navigation]');
  if (!navigation || navigation.dataset.keyboardNavigation === 'ready') return false;
  navigation.dataset.keyboardNavigation = 'ready';
  navigation.addEventListener('keydown', event => {
    const current = event.target?.closest?.('[data-gpir-section]');
    if (!current) return;
    const links = [...navigation.querySelectorAll('[data-gpir-section]')];
    const nextIndex = navigationKeyIndex(event.key, links.indexOf(current), links.length);
    if (nextIndex === null) return;
    event.preventDefault();
    links[nextIndex].focus();
  });
  return true;
}

export function initializeMyGpirNavigation(global, document) {
  if (!global || !document) return false;
  const sync = () => syncMyGpirNavigation(document, global.location.hash);
  enableMyGpirKeyboardNavigation(document); sync();
  if (navigationGlobals.has(global)) return false;
  navigationGlobals.add(global);
  global.addEventListener('hashchange', sync);
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initializeMyGpirNavigation(window, document);
}
