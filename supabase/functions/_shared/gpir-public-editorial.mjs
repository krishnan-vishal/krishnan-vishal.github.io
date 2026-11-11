import { classifyEditorialPublication, contentfulEditorialConfig, fetchPublishedEditorialEntries }
  from './gpir-contentful-editorial.mjs';
import { editorialUrlKey, isOfficialUrl } from './gpir-intelligence-validation.mjs';

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export async function loadPublicEditorialAuthority({ env, supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const contentful = contentfulEditorialConfig(env);
  if (!contentful) throw new Error('CONTENTFUL_CONFIGURATION_REQUIRED');
  const [entries, authorizations] = await Promise.all([
    fetchPublishedEditorialEntries({ config: contentful, fetchImpl }),
    (async () => {
      const rows = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
        const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/gpir_public_editorial_authorizations?${query}`, {
          headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
        });
        if (!response.ok) throw new Error(`PUBLIC_AUTHORITY_HTTP_${response.status}`);
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error('PUBLIC_AUTHORITY_INVALID_RESPONSE');
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) return rows;
      }
      throw new Error('PUBLIC_AUTHORITY_PAGE_LIMIT');
    })()
  ]);
  const entryMap = new Map(entries.map(entry => [entry.entryId, entry]));
  const counts = new Map();
  for (const entry of entries) {
    for (const value of [entry.fields?.supabaseRecordId, entry.fields?.gpirPublicationId]) {
      if (typeof value === 'string' && value.trim())
        counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  const eligible = [];
  for (const row of authorizations) {
    const parts = String(row.entry_reference || '').split('/');
    if (parts.length !== 3 || parts[0] !== contentful.spaceId || parts[1] !== contentful.environment) continue;
    const entry = entryMap.get(parts[2]);
    const fields = entry?.fields || {};
    if (fields.supabaseRecordId !== row.record_id || fields.gpirPublicationId !== row.publication_id ||
        fields.editionLineageId !== row.lineage_id ||
        fields.publicationType !== row.publication_type ||
        counts.get(row.record_id) !== 1 || counts.get(row.publication_id) !== 1 ||
        fields.publicationStatus !== 'CURRENT' || fields.validationStatus !== 'PASS' ||
        typeof fields.sourceValidationSummary !== 'string' || fields.sourceValidationSummary.trim().length < 40)
      continue;
    eligible.push({ row, entry });
  }
  return eligible;
}

export function authorizedEditorialCandidates({ authority, candidates, audits, sources }) {
  const candidatesById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const sourcesById = new Map(sources.filter(source => source.source_status === 'GREEN')
    .map(source => [source.source_id, source]));
  const approvals = new Map();
  const ambiguous = new Set();
  for (const item of authority) {
    const id = item.row.candidate_id;
    if (!id) continue;
    if (approvals.has(id)) ambiguous.add(id);
    approvals.set(id, item);
  }
  const accepted = new Set();
  for (const audit of audits) {
    if (!['PUBLISHED', 'DUPLICATE'].includes(audit.decision)) continue;
    const candidate = candidatesById.get(audit.candidate_id);
    const source = sourcesById.get(candidate?.source_id);
    const match = approvals.get(audit.candidate_id);
    const payload = audit.validation_payload || {};
    if (!candidate || !source || !match || ambiguous.has(audit.candidate_id) ||
        classifyEditorialPublication(match.entry.fields, candidate) !== 'EXECUTIVE' ||
        !['source_verified', 'canonical_verified', 'timestamp_verified', 'content_verified',
          'relevance_verified', 'summary_grounded'].every(key => payload[key] === true) ||
        payload.editorial_verified !== true ||
        payload.editorial_entry_reference !== match.row.entry_reference ||
        payload.editorial_entry_id !== match.entry.entryId ||
        payload.editorial_publication_id !== match.row.publication_id ||
        payload.editorial_supabase_record_id !== match.row.record_id ||
        editorialUrlKey(candidate.canonical_url) !== editorialUrlKey(match.entry.fields.legacySourceUrl) ||
        editorialUrlKey(candidate.canonical_url) !== editorialUrlKey(payload.editorial_source_url) ||
        !isOfficialUrl(candidate.canonical_url, source.official_url)) continue;
    accepted.add(candidate.id);
  }
  return accepted;
}

export function normalizeOwnerEditorialPublications({ authority, now, windowDays }) {
  return authority.filter(item => item.row.candidate_id == null &&
    classifyEditorialPublication(item.entry.fields) === 'EXECUTIVE').flatMap(({ row, entry }) => {
    const fields = entry.fields;
    const title = typeof fields.publicationTitle === 'string' ? fields.publicationTitle.trim() : '';
    const summary = typeof fields.executiveSummary === 'string' ? fields.executiveSummary.trim() : '';
    const route = typeof fields.canonicalUrlCandidate === 'string' ? fields.canonicalUrlCandidate.trim() : '';
    const time = Date.parse(fields.publicationDate || '');
    if (title.length < 12 || summary.length < 40 || !Number.isFinite(time) || time > now ||
        (windowDays !== null && time < now - windowDays * 86400000) ||
        !route.startsWith('/') || route.startsWith('//') || /[?#\\]/.test(route) ||
        route.split('/').includes('..')) return [];
    const canonicalUrl = `https://fintechoisis.com${route}`;
    const publishedAt = new Date(time).toISOString();
    const category = typeof fields.useCasePaymentCategory === 'string' && fields.useCasePaymentCategory.trim()
      ? fields.useCasePaymentCategory.trim() : String(fields.publicationType || '').trim();
    if (!category) return [];
    const region = typeof fields.region === 'string' && fields.region.trim() ? fields.region.trim() : null;
    const country = typeof fields.countryMarket === 'string' && fields.countryMarket.trim()
      ? fields.countryMarket.trim() : null;
    return [{
      id: row.record_id, status: 'GPIR_CLASSIFIED', contentStatus: 'CONTENT_VERIFIED',
      lifecycleStatus: 'HISTORICAL', displayLifecycleStatus: 'ARCHIVED',
      headline: title, title, summary, developments: [], category, topics: [category],
      subcategory: null, country, countryCode: /^[A-Z]{2}$/.test(country || '') ? country : null,
      region, eventGeography: { countryCode: /^[A-Z]{2}$/.test(country || '') ? country : null, region },
      publicationDate: publishedAt.slice(0, 10), publishedDate: publishedAt.slice(0, 10), publishedAt,
      publicationMonth: publishedAt.slice(5, 7), publicationYear: publishedAt.slice(0, 4),
      tickerEligible: false, canonicalUrl, pageUrl: canonicalUrl, keywords: [],
      outcomeStatus: 'PENDING', geography: region, eventId: null,
      sources: [{ name: 'GPIR', url: canonicalUrl, publishedAt }],
      source: { name: 'GPIR', publicationTitle: 'GPIR', url: canonicalUrl, trustTier: null, category }
    }];
  });
}
