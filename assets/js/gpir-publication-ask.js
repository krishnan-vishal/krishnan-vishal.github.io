/* Single in-page ASK GPIR panel. Reuses the governed homepage content-search index. */
(() => {
  'use strict';
  const links = document.querySelectorAll('a[data-gpir-contextual-ask]');
  if (!links.length) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'gpir-publication-ask-dialog';
  dialog.setAttribute('aria-label', 'ASK GPIR published intelligence');
  dialog.innerHTML = '<div class="gpir-publication-ask-header"><strong>ASK GPIR · Published intelligence</strong><button type="button" data-ask-close aria-label="Close ASK GPIR">Close</button></div><div class="gpir-publication-ask-body"><label for="gpir-publication-ask-input">Search published GPIR intelligence</label><input id="gpir-publication-ask-input" type="search" autocomplete="off" placeholder="Search published research, markets and payment topics"><p class="gpir-publication-ask-status" role="status" aria-live="polite"></p><div class="gpir-publication-ask-results"></div></div>';
  document.body.append(dialog);
  const input = dialog.querySelector('input');
  const status = dialog.querySelector('[role="status"]');
  const results = dialog.querySelector('.gpir-publication-ask-results');
  let opener = null;
  let revision = 0;
  let debounce;

  const plainText = html => {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    return el.textContent || '';
  };
  const runSearch = async () => {
    const request = ++revision;
    const query = input.value.trim();
    results.replaceChildren();
    if (!query) { status.textContent = 'Enter a topic to search published intelligence.'; return; }
    status.textContent = 'Searching published GPIR intelligence…';
    try {
      await window.GPIRContentSearch.load();
      if (request !== revision || !dialog.open) return;
      const found = window.GPIRContentSearch.search(query, { limit: 15 });
      status.textContent = found.total + ' published GPIR matches';
      if (!found.results.length) { status.textContent = 'No published intelligence matched this query.'; return; }
      for (const item of found.results) {
        const a = document.createElement('a');
        a.className = 'gpir-publication-ask-result';
        const href = new URL(item.href, location.origin + '/');
        if (href.protocol !== 'https:' && href.protocol !== 'http:') continue;
        a.href = href.href;
        const heading = document.createElement('strong');
        heading.textContent = item.pageTitle + (item.sectionTitle && item.sectionTitle !== item.pageTitle ? ' — ' + item.sectionTitle : '');
        const category = document.createElement('small');
        category.textContent = [item.type, item.category].filter(Boolean).join(' · ');
        const excerpt = document.createElement('span');
        excerpt.textContent = plainText(item.excerptHtml).slice(0, 260);
        a.append(heading, category, excerpt);
        results.append(a);
      }
    } catch (_) {
      if (request === revision) status.textContent = 'Published intelligence search is temporarily unavailable.';
    }
  };

  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(runSearch, 180); });
  dialog.querySelector('[data-ask-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { revision++; clearTimeout(debounce); if (opener) opener.focus(); });

  const ensureIndex = () => new Promise((resolve, reject) => {
    if (window.GPIRContentSearch) { resolve(); return; }
    const script = document.createElement('script');
    script.src = '/assets/js/content-search.js';
    script.onload = () => window.GPIRContentSearch ? resolve() : reject(new Error('search unavailable'));
    script.onerror = reject;
    document.head.append(script);
  });
  links.forEach(link => link.addEventListener('click', async event => {
    event.preventDefault();
    opener = link;
    if (!dialog.open) dialog.showModal();
    input.value = 'Cross-border payments published research';
    input.focus();
    status.textContent = 'Loading published intelligence…';
    try { await ensureIndex(); if (dialog.open) await runSearch(); }
    catch (_) { if (dialog.open) status.textContent = 'Published intelligence search is temporarily unavailable.'; }
  }));
})();
