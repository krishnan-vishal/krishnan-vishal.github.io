/* Reuse the existing GPIR homepage search and its governed retrieval without navigating away from a publication. */
(() => {
  'use strict';
  const links = document.querySelectorAll('a[data-gpir-contextual-ask]');
  if (!links.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'gpir-publication-ask-dialog';
  dialog.setAttribute('aria-label', 'ASK GPIR research intelligence');
  const header = document.createElement('div');
  header.className = 'gpir-publication-ask-header';
  const label = document.createElement('strong');
  label.textContent = 'ASK GPIR · Published intelligence';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close ASK GPIR and return to research');
  header.append(label, close);
  const frame = document.createElement('iframe');
  frame.className = 'gpir-publication-ask-frame';
  frame.title = 'GPIR search and published research results';
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  dialog.append(header, frame);
  document.body.append(dialog);
  let opener = null;
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { frame.removeAttribute('src'); if (opener) opener.focus(); });
  links.forEach(link => link.addEventListener('click', event => {
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.searchParams.has('ask') || typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    opener = link;
    frame.src = url.pathname + url.search + url.hash;
    dialog.showModal();
  }));
})();
