// Read-only: lists T3 candidates awaiting editorial approval and the existing Contentful
// entry (if any) that governs each. It writes nothing and approves nothing. Run with
// server-side credentials only: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and, optionally,
// CONTENTFUL_SPACE_ID, CONTENTFUL_ENVIRONMENT, CONTENTFUL_DELIVERY_TOKEN.
import { contentfulEditorialConfig, fetchPublishedEditorialEntries } from '../../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { editorialUrlKey } from '../../supabase/functions/_shared/gpir-intelligence-validation.mjs';

async function rows(fetchImpl, base, headers, table, params) {
  const response = await fetchImpl(`${base}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers });
  if (!response.ok) throw new Error(`${table} request failed with status ${response.status}`);
  return response.json();
}

export async function buildEditorialQueue({ env = process.env, fetchImpl = fetch, now = Date.now(), hours = 12 } = {}) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(base) || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const headers = new Headers();
  headers.set('apikey', key);
  headers.set('authorization', ['Bearer', key].join(' '));
  const sources = await rows(fetchImpl, base, headers, 'source_registry', {
    select: 'source_id,source_name,official_url', trust_tier: 'eq.T3', source_status: 'eq.GREEN', limit: '100' });
  if (!sources.length) return { generatedAt: new Date(now).toISOString(), awaiting: [], approved: [] };
  const since = new Date(now - hours * 3600 * 1000).toISOString();
  const candidates = await rows(fetchImpl, base, headers, 'intelligence_candidates', {
    select: 'id,source_id,title,canonical_url,published_at,candidate_status',
    source_id: `in.(${sources.map(item => item.source_id).join(',')})`,
    candidate_status: 'in.(PENDING,REVIEW,VALIDATING)', published_at: `gte.${since}`,
    order: 'published_at.desc', limit: '200' });
  const config = contentfulEditorialConfig(env);
  const entries = config ? await fetchPublishedEditorialEntries({ config, fetchImpl }) : [];
  const byId = new Map(entries.map(entry => [String(entry.fields.supabaseRecordId || '').toLowerCase(), entry]));
  const byUrl = new Map(entries.map(entry => [editorialUrlKey(String(entry.fields.legacySourceUrl || '')), entry]));
  const queue = { generatedAt: new Date(now).toISOString(), contentfulChecked: Boolean(config), awaiting: [], approved: [] };
  for (const candidate of candidates) {
    const linked = byId.get(candidate.id.toLowerCase()) || byUrl.get(editorialUrlKey(candidate.canonical_url));
    const item = { candidateId: candidate.id, sourceId: candidate.source_id, title: candidate.title,
      canonicalUrl: candidate.canonical_url, publishedAt: candidate.published_at };
    if (linked) queue.approved.push({ ...item, contentfulEntryId: linked.entryId });
    else queue.awaiting.push({ ...item, contentfulDraftFields: {
      supabaseRecordId: candidate.id, legacySourceUrl: candidate.canonical_url, publicationTitle: candidate.title,
      publicationStatus: 'CURRENT', validationStatus: 'PASS (only after editorial verification)',
      sourceValidationSummary: 'Editor evidence note required', gpirPublicationId: 'Governed VK-GPIR identifier required' } });
  }
  return queue;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildEditorialQueue().then(queue => console.log(JSON.stringify(queue, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
