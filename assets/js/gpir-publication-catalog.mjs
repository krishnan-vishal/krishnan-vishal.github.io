// Presentation-only directory of published route metadata.
// Supabase's protected-publication endpoint remains the sole body-content authority.
export function publicCatalogItems(manifest, approved) {
  if (!manifest || !Array.isArray(manifest.routes) || !Array.isArray(approved?.identities)) return [];
  const permitted = new Set(approved.identities);
  if (permitted.size !== approved.recordCount || permitted.size === 0) return [];
  const seen = new Set();
  return manifest.routes.flatMap(item => {
    const id = item?.identity;
    const route = item?.route;
    if (!permitted.has(id) || item?.accessClass !== 'ENTITLED' || item?.authAuthority !== 'supabase' ||
        typeof id !== 'string' || seen.has(id) || typeof route !== 'string' ||
        !/^\/[a-z0-9][a-z0-9-]*\/$/.test(route)) return [];
    seen.add(id);
    const title = String(item.title || id).slice(0,180);
    const summary = String(item.summary || '').slice(0,280);
    const category = Array.isArray(item.categoryPath) ?
      item.categoryPath.map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
    return [{ id, route, title, summary, category }];
  });
}
export function renderCatalog(document, items, search = '', categoryFilter = '') {
  const list = document.querySelector('#catalog-list');
  const status = document.querySelector('#catalog-status');
  if (!list || !status) return 0;
  const term = String(search).toLocaleLowerCase().trim();
  const filtered = items.filter(item => (!categoryFilter || item.category[0] === categoryFilter) &&
    (!term || (item.title + ' ' + item.summary + ' ' + item.category.join(' ')).toLocaleLowerCase().includes(term)));
  const fragment = document.createDocumentFragment();
  for (const item of filtered) {
    const li = document.createElement('li');
    const kicker = document.createElement('p'); kicker.className = 'gpir-catalog-kicker';
    kicker.textContent = item.category.join(' / ') || 'GPIR research';
    const heading = document.createElement('h2'); heading.textContent = item.title;
    const summary = document.createElement('p'); summary.textContent = item.summary;
    const link = document.createElement('a'); link.href = item.route;
    link.textContent = 'Open publication'; link.setAttribute('aria-label', 'Open ' + item.title);
    li.append(kicker, heading, summary, link); fragment.append(li);
  }
  list.replaceChildren(fragment);
  status.textContent = filtered.length + ' published intelligence dashboards' +
    (term || categoryFilter ? ' matching your filters.' : '.');
  return filtered.length;
}
export async function initializeCatalog(document = globalThis.document, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  const status = document?.querySelector('#catalog-status');
  if (!status || !fetchImpl) return false;
  try {
    const [routesResponse, approvedResponse] = await Promise.all([
      fetchImpl('/routes.json', { cache: 'no-store' }),
      fetchImpl('/assets/data/approved-dashboard-catalog.json', { cache: 'no-store' })
    ]);
    if (!routesResponse.ok || !approvedResponse.ok) throw Error('CATALOG_UNAVAILABLE');
    const items = publicCatalogItems(await routesResponse.json(), await approvedResponse.json());
    if (items.length !== 43) throw Error('CATALOG_INCOMPLETE');
    const filter = document.querySelector('#catalog-region');
    const search = document.querySelector('#catalog-search');
    if (!filter || !search) return false;
    for (const category of [...new Set(items.map(item => item.category[0]).filter(Boolean))].sort()) {
      const option = document.createElement('option'); option.value = category;
      option.textContent = category; filter.append(option);
    }
    const update = () => renderCatalog(document, items, search.value, filter.value);
    search.addEventListener('input', update);
    filter.addEventListener('change', update);
    update(); return true;
  } catch {
    status.textContent = 'The publication catalog is temporarily unavailable. Existing GPIR pages remain accessible.';
    return false;
  }
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => { void initializeCatalog(); });
  else void initializeCatalog();
}
