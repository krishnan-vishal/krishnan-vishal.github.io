import { editorialUrlKey, isOfficialUrl } from './gpir-intelligence-validation.mjs';

// T3 editorial approval reuses the existing Contentful `gpirPublication` model.
// Only the read-only Delivery API is used, so an entry is visible here solely
// when an editor has published it in Contentful. Mapping, with no new fields:
//   supabaseRecordId       -> intelligence_candidates.id
//   legacySourceUrl        -> the candidate's canonical source article URL
//   publicationStatus      -> CURRENT
//   validationStatus       -> VALIDATED (explicit editorial approval)
//   sourceValidationSummary-> editor's evidence note
//   gpirPublicationId      -> governed VK-GPIR publication identifier
const PUBLICATION_ID = /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPE = 'gpirPublication';
const MAX_ENTRIES = 100;
const MIN_EVIDENCE_LENGTH = 40;

export function contentfulEditorialConfig(env) {
  const read = name => (typeof env[name] === 'string' ? env[name].trim() : '');
  const spaceId = read('CONTENTFUL_SPACE_ID');
  const environment = read('CONTENTFUL_ENVIRONMENT');
  const token = read('CONTENTFUL_DELIVERY_TOKEN');
  if (!spaceId || !environment || !token) return null;
  const management = read('CONTENTFUL_MANAGEMENT_TOKEN');
  if (management && management === token) return null;
  return { spaceId, environment, token };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function fetchPublishedEditorialEntries({ config, fetchImpl = fetch, limit = MAX_ENTRIES }) {
  const query = new URLSearchParams({
    content_type: CONTENT_TYPE,
    'fields.supabaseRecordId[exists]': 'true',
    'fields.legacySourceUrl[exists]': 'true',
    select: ['sys.id', 'sys.updatedAt', 'fields.gpirPublicationId', 'fields.supabaseRecordId',
      'fields.legacySourceUrl', 'fields.publicationStatus', 'fields.validationStatus',
      'fields.sourceValidationSummary'].join(','),
    order: '-sys.updatedAt',
    limit: String(Math.max(1, Math.min(MAX_ENTRIES, limit)))
  });
  const url = `https://cdn.contentful.com/spaces/${encodeURIComponent(config.spaceId)}` +
    `/environments/${encodeURIComponent(config.environment)}/entries?${query}`;
  let response;
  try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${config.token}` } }); }
  catch { throw new Error('CONTENTFUL_REQUEST_FAILED'); }
  if (!response.ok) throw new Error(`CONTENTFUL_HTTP_${response.status}`);
  const page = await response.json();
  if (!Array.isArray(page?.items)) throw new Error('CONTENTFUL_INVALID_RESPONSE');
  return page.items.map(item => ({
    entryId: text(item?.sys?.id),
    updatedAt: text(item?.sys?.updatedAt),
    fields: item?.fields && typeof item.fields === 'object' ? item.fields : {}
  })).filter(item => item.entryId);
}

// Entries that share a candidate identifier or source URL are ambiguous: none is trusted.
export function ambiguousEditorialKeys(entries) {
  const seen = new Map();
  const ambiguous = new Set();
  for (const entry of entries) {
    for (const key of [`id:${text(entry.fields.supabaseRecordId).toLowerCase()}`,
      `url:${editorialUrlKey(text(entry.fields.legacySourceUrl))}`]) {
      if (seen.has(key) && seen.get(key) !== entry.entryId) ambiguous.add(key);
      seen.set(key, entry.entryId);
    }
  }
  return ambiguous;
}

export function evaluateEditorialEntry({ entry, candidate, source, ambiguous = new Set() }) {
  const denied = reasonCode => ({ approved: false, reasonCode });
  if (!source || source.trust_tier !== 'T3' || source.source_status !== 'GREEN')
    return denied('EDITORIAL_SOURCE_NOT_T3');
  const fields = entry?.fields || {};
  const recordId = text(fields.supabaseRecordId).toLowerCase();
  const sourceUrl = text(fields.legacySourceUrl);
  const urlKey = editorialUrlKey(sourceUrl);
  if (!UUID.test(recordId) || recordId !== String(candidate.id).toLowerCase() || !urlKey)
    return denied('EDITORIAL_IDENTITY_MISMATCH');
  if (ambiguous.has(`id:${recordId}`) || ambiguous.has(`url:${urlKey}`))
    return denied('EDITORIAL_ENTRY_AMBIGUOUS');
  if (urlKey !== editorialUrlKey(candidate.canonical_url) || !isOfficialUrl(sourceUrl, source.official_url))
    return denied('EDITORIAL_SOURCE_URL_MISMATCH');
  if (text(fields.publicationStatus).toUpperCase() !== 'CURRENT' ||
      text(fields.validationStatus).toUpperCase() !== 'VALIDATED')
    return denied('EDITORIAL_APPROVAL_NOT_EXPLICIT');
  if (!PUBLICATION_ID.test(text(fields.gpirPublicationId))) return denied('EDITORIAL_PUBLICATION_ID_INVALID');
  if (text(fields.sourceValidationSummary).length < MIN_EVIDENCE_LENGTH)
    return denied('EDITORIAL_EVIDENCE_MISSING');
  return {
    approved: true,
    entryId: entry.entryId,
    publicationId: text(fields.gpirPublicationId),
    sourceUrl: urlKey
  };
}
