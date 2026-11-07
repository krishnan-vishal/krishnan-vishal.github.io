const PERIOD_DAYS = Object.freeze({ '7D': 7, '15D': 15, '30D': 30, '1Y': 365, MAX: null });
const INTELLIGENCE_PATH = '/functions/v1/gpir-public-intelligence?scope=history&limit=100';
const EDITORIAL_PATH = '/assets/data/fx/editorial-public.json';

function clean(value, max = 500) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function safeHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function periodStart(period, now = Date.now()) {
  const days = PERIOD_DAYS[period];
  return days == null ? null : now - days * 86400000;
}

export function normalizeSmartRecords(value) {
  if (value?.status !== 'OK' || !Array.isArray(value.records)) return [];
  return value.records.flatMap(item => {
    const publishedAt = Date.parse(item?.publishedAt || '');
    const url = safeHttps(item?.canonicalUrl || item?.source?.url);
    const title = clean(item?.title || item?.headline, 200);
    const summary = clean(item?.summary, 1200);
    if (!Number.isFinite(publishedAt) || !url || !title || summary.length < 40) return [];
    return [{ id: clean(item.id, 80), title, summary, url,
      publishedAt: new Date(publishedAt).toISOString(),
      category: clean(item.category, 100) || 'Payments',
      country: clean(item.country, 100), region: clean(item.region, 100),
      geography: clean(item.geography, 160),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(value => clean(value, 80)).filter(Boolean) : [],
      sourceName: clean(item?.source?.name, 140) || 'Authoritative source',
      lifecycle: clean(item.displayLifecycleStatus || item.lifecycleStatus, 40) || 'ARCHIVED' }];
  }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function filterSmartRecords(records, { subject = '', kind = 'all', period = '15D', now = Date.now() } = {}) {
  const query = clean(subject, 80).toLowerCase();
  const start = periodStart(PERIOD_DAYS[period] === undefined ? '15D' : period, now);
  return records.filter(record => {
    if (start != null && Date.parse(record.publishedAt) < start) return false;
    if (!query) return true;
    const fields = kind === 'country' ? [record.country, record.geography] :
      kind === 'region' ? [record.region, record.geography] :
      kind === 'pair' ? [record.title, record.summary, ...record.keywords] :
      kind === 'topic' ? [record.category, record.title, record.summary, ...record.keywords] :
      [record.country, record.region, record.geography, record.category,
        record.title, record.summary, ...record.keywords];
    return fields.filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}

export function normalizeEditorial(value) {
  if (value?.source !== 'contentful-published-public' || !Array.isArray(value.records)) return [];
  return value.records.flatMap(item => /^[A-Z]{3}\/[A-Z]{3}$/.test(item?.pair || '') &&
    typeof item?.url === 'string' && item.url.startsWith('/')
    ? [{ pair: item.pair, title: clean(item.title, 200), summary: clean(item.summary, 500), url: item.url }]
    : []);
}

function contextMarkup(records, period) {
  const dates = records.map(record => record.publishedAt.slice(0, 10));
  const categories = [...new Set(records.map(record => record.category))];
  return `<p class="smi-kicker">COMPUTED CONTEXT · DESCRIPTIVE ONLY</p><h2>${records.length} matching validated record${records.length === 1 ? '' : 's'}</h2><p>${records.length ? `Evidence dates ${escapeHtml(dates.at(-1))} to ${escapeHtml(dates[0])}. Categories: ${escapeHtml(categories.join(', '))}.` : `No governed records match the selected subject and ${escapeHtml(period)} period.`} Counts and grouping do not imply impact or causality.</p>`;
}

function recordMarkup(record) {
  const geography = [record.country, record.region, record.geography].filter(Boolean).join(' · ') ||
    'Geography not classified in the governed source record';
  return `<article class="smi-record"><div><span>${escapeHtml(record.lifecycle)}</span><span>${escapeHtml(record.category)}</span></div><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.summary)}</p><dl><div><dt>Published</dt><dd>${escapeHtml(record.publishedAt.slice(0, 10))}</dd></div><div><dt>Geographical relevance</dt><dd>${escapeHtml(geography)}</dd></div><div><dt>Source</dt><dd>${escapeHtml(record.sourceName)}</dd></div></dl><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Read authoritative source</a></article>`;
}

function endpoint(global) {
  try {
    const url = new URL(global.GPIR_SUPABASE_PUBLIC_CONFIG?.url);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
      ? `${url.origin}${INTELLIGENCE_PATH}` : null;
  } catch { return null; }
}

export async function initializeSmartIntelligence({ global = window,
  document = global.document, fetchImpl = global.fetch?.bind(global), now = () => Date.now() } = {}) {
  const root = document?.querySelector?.('[data-smart-root]');
  if (!root) return false;
  let session = null;
  try { session = global.GPIRReaderAuth?.sessionReady
    ? await global.GPIRReaderAuth.sessionReady
    : (await global.GPIR_SUPABASE_CLIENT?.auth?.getSession())?.data?.session; } catch {}
  if (!session?.user || !session.access_token) {
    const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
    global.GPIRReaderAuth?.rememberReturnTo?.(returnTo);
    global.location.assign(`/reader/sign-in/?returnTo=${encodeURIComponent(returnTo)}`);
    return false;
  }
  const api = endpoint(global);
  if (!api) return false;
  const params = new URL(global.location.href).searchParams;
  const state = { subject: clean(params.get('subject'), 80),
    kind: ['all', 'country', 'region', 'pair', 'topic'].includes(params.get('kind')) ? params.get('kind') : 'all',
    period: Object.hasOwn(PERIOD_DAYS, params.get('period')) ? params.get('period') : '15D' };
  const subject = root.querySelector('[data-smart-subject]');
  const kind = root.querySelector('[data-smart-kind]');
  if (subject) subject.value = state.subject;
  if (kind) kind.value = state.kind;
  let records = []; let editorial = [];
  const status = root.querySelector('[data-smart-status]');
  try {
    const [intelligenceResponse, editorialResponse] = await Promise.all([
      fetchImpl(api, { cache: 'no-store', headers: { accept: 'application/json' } }),
      fetchImpl(EDITORIAL_PATH, { cache: 'no-store' })
    ]);
    if (!intelligenceResponse.ok) throw new Error('INTELLIGENCE_UNAVAILABLE');
    records = normalizeSmartRecords(await intelligenceResponse.json());
    editorial = editorialResponse.ok ? normalizeEditorial(await editorialResponse.json()) : [];
  } catch {
    root.dataset.state = 'unavailable';
    if (status) status.textContent = 'Governed intelligence is temporarily unavailable. No contextual conclusion has been inferred.';
    return false;
  }
  const render = () => {
    const matches = filterSmartRecords(records, { ...state, now: now() });
    root.querySelectorAll('[data-smart-period]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.smartPeriod === state.period)));
    const context = root.querySelector('[data-smart-context]');
    context.hidden = false; context.innerHTML = contextMarkup(matches, state.period);
    const results = root.querySelector('[data-smart-results]');
    results.innerHTML = matches.length ? matches.map(recordMarkup).join('') :
      '<div class="smi-empty"><strong>No validated records match this context.</strong><p>Try a broader subject or period. No market-impact statement has been manufactured.</p></div>';
    const pair = /^([A-Z]{3})\/([A-Z]{3})$/.test(state.subject.toUpperCase())
      ? state.subject.toUpperCase() : null;
    const related = pair ? editorial.filter(item => item.pair === pair) : [];
    const editorialTarget = root.querySelector('[data-smart-editorial]');
    editorialTarget.hidden = !related.length;
    editorialTarget.innerHTML = related.length ? `<p class="smi-kicker">PUBLISHED CONTENTFUL RESEARCH</p>${related.map(item => `<article><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p><a href="${escapeHtml(item.url)}">Read Published Research</a></article>`).join('')}` : '';
    if (status) status.textContent = `${matches.length} governed record${matches.length === 1 ? '' : 's'} shown. Live alerts remain limited to the preceding 12 hours; this contextual view preserves the selected historical period.`;
    root.dataset.state = 'ready';
    const url = new URL(global.location.href);
    state.subject ? url.searchParams.set('subject', state.subject) : url.searchParams.delete('subject');
    url.searchParams.set('kind', state.kind); url.searchParams.set('period', state.period);
    global.history?.replaceState?.(null, '', `${url.pathname}${url.search}`);
  };
  root.querySelector('[data-smart-form]')?.addEventListener('submit', event => {
    event.preventDefault(); state.subject = clean(subject?.value, 80); state.kind = kind?.value || 'all'; render();
  });
  root.querySelectorAll('[data-smart-period]').forEach(button => button.addEventListener('click', () => {
    state.period = button.dataset.smartPeriod; render();
  }));
  render(); return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {
    void initializeSmartIntelligence();
  }); else void initializeSmartIntelligence();
}
