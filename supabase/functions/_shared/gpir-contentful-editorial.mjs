import { editorialUrlKey, isOfficialUrl } from './gpir-intelligence-validation.mjs';

// Editorial approval reuses the existing Contentful `gpirPublication` model.
// Only the read-only Delivery API is used, so an entry is visible here solely
// when an editor has published it in Contentful. Mapping, with no new fields:
//   supabaseRecordId       -> gpir_identity_publications.id
//   legacySourceUrl        -> the candidate's canonical source article URL
//   publicationStatus      -> CURRENT
//   validationStatus       -> PASS (explicit editorial approval; Pending, WARN and FAIL are denied)
//   sourceValidationSummary-> editor's evidence note
//   gpirPublicationId      -> governed VK-GPIR publication identifier
const PUBLICATION_ID = /^VK-GPIR?-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_TYPE = 'gpirPublication';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const MIN_EVIDENCE_LENGTH = 40;
const EDITORIAL_SOURCE_TIERS = new Set(['T1', 'T1.5', 'T2', 'T3']);
const SELECTED_FIELDS = ['sys.id', 'sys.updatedAt', 'fields.gpirPublicationId', 'fields.supabaseRecordId',
  'fields.editionLineageId', 'fields.publicationType',
  'fields.publicationTitle', 'fields.executiveSummary', 'fields.publicationDate',
  'fields.canonicalUrlCandidate', 'fields.region', 'fields.countryMarket', 'fields.useCasePaymentCategory',
  'fields.legacySourceUrl', 'fields.publicationStatus', 'fields.validationStatus',
  'fields.sourceValidationSummary'].join(',');

// Approvals are unforgeable: only evaluateEditorialEntry can create one, and the
// validator accepts nothing that is not registered here. Request bodies, plain
// objects and copies of a real approval are never trusted.
const VERIFIED_APPROVALS = new WeakSet();

export function isVerifiedEditorialApproval(approval) {
  return approval !== null && typeof approval === 'object' && VERIFIED_APPROVALS.has(approval);
}

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

function entriesUrl(config, params) {
  return `https://cdn.contentful.com/spaces/${encodeURIComponent(config.spaceId)}` +
    `/environments/${encodeURIComponent(config.environment)}/entries?${new URLSearchParams({
      content_type: CONTENT_TYPE, select: SELECTED_FIELDS, ...params })}`;
}

async function readEntries(config, fetchImpl, params) {
  let response;
  try { response = await fetchImpl(entriesUrl(config, params), { headers: { Authorization: `Bearer ${config.token}` } }); }
  catch { throw new Error('CONTENTFUL_REQUEST_FAILED'); }
  if (!response.ok) throw new Error(`CONTENTFUL_HTTP_${response.status}`);
  const page = await response.json();
  if (!Array.isArray(page?.items) || !Number.isInteger(page.total)) throw new Error('CONTENTFUL_INVALID_RESPONSE');
  return {
    total: page.total,
    items: page.items.map(item => ({
      entryId: text(item?.sys?.id),
      updatedAt: text(item?.sys?.updatedAt),
      fields: item?.fields && typeof item.fields === 'object' ? item.fields : {}
    })).filter(item => item.entryId)
  };
}

// Complete, paginated read of published entries, including those awaiting identity. A result that
// cannot be read completely fails closed instead of silently dropping approvals.
export async function fetchPublishedEditorialEntries({ config, fetchImpl = fetch }) {
  const entries = [];
  for (let page = 0; ; page += 1) {
    if (page >= MAX_PAGES) throw new Error('CONTENTFUL_ENTRY_LIMIT_EXCEEDED');
    const { items, total } = await readEntries(config, fetchImpl, {
      order: 'sys.id', limit: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
    if (total > PAGE_SIZE * MAX_PAGES) throw new Error('CONTENTFUL_ENTRY_LIMIT_EXCEEDED');
    if (items.length !== Math.min(PAGE_SIZE, Math.max(0, total - page * PAGE_SIZE)))
      throw new Error('CONTENTFUL_INCOMPLETE_PAGE');
    entries.push(...items);
    if ((page + 1) * PAGE_SIZE >= total) break;
  }
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.entryId.localeCompare(b.entryId));
}

// Fresh, targeted authorization read made immediately before publication.
export async function fetchEditorialEntriesForCandidate({ config, fetchImpl = fetch, candidate, recordId }) {
  const found = new Map();
  for (const params of [{ 'fields.supabaseRecordId': String(recordId) },
    { 'fields.legacySourceUrl': String(candidate.canonical_url) }]) {
    const { items, total } = await readEntries(config, fetchImpl, { ...params, limit: '10', order: 'sys.id' });
    if (total > items.length) throw new Error('CONTENTFUL_ENTRY_AMBIGUOUS_RESULT');
    for (const item of items) found.set(item.entryId, item);
  }
  return [...found.values()];
}

export async function fetchEditorialEntryById({ config, fetchImpl = fetch, entryId }) {
  const { items, total } = await readEntries(config, fetchImpl, { 'sys.id': entryId, limit: '2' });
  if (total !== 1 || items.length !== 1 || items[0].entryId !== entryId)
    throw new Error('CONTENTFUL_ENTRY_NOT_UNIQUE_OR_WITHDRAWN');
  return items[0];
}

// Entries that share a candidate identifier or source URL are ambiguous: none is trusted.
export function ambiguousEditorialKeys(entries) {
  const seen = new Map();
  const ambiguous = new Set();
  for (const entry of entries) {
    const record = text(entry.fields.supabaseRecordId).toLowerCase();
    const url = editorialUrlKey(text(entry.fields.legacySourceUrl));
    for (const key of [record && `id:${record}`, url && `url:${url}`].filter(Boolean)) {
      if (seen.has(key) && seen.get(key) !== entry.entryId) ambiguous.add(key);
      seen.set(key, entry.entryId);
    }
  }
  return ambiguous;
}

export function evaluateEditorialEntry({ entry, candidate, source, identity, ambiguous = new Set() }) {
  const denied = reasonCode => ({ approved: false, reasonCode });
  if (!source || !EDITORIAL_SOURCE_TIERS.has(source.trust_tier) || source.source_status !== 'GREEN')
    return denied('EDITORIAL_SOURCE_NOT_ELIGIBLE');
  const fields = entry?.fields || {};
  const recordId = text(fields.supabaseRecordId).toLowerCase();
  const sourceUrl = text(fields.legacySourceUrl);
  const urlKey = editorialUrlKey(sourceUrl);
  if (!PUBLICATION_ID.test(text(fields.gpirPublicationId))) return denied('EDITORIAL_PUBLICATION_ID_INVALID');
  if (!UUID.test(recordId) || !identity || recordId !== String(identity.supabaseRecordId).toLowerCase() ||
      text(fields.gpirPublicationId) !== identity.gpirPublicationId ||
      text(fields.editionLineageId) !== identity.editionLineageId ||
      identity.candidateId !== String(candidate.id).toLowerCase() ||
      String(identity.entryReference || '').split('/').pop() !== entry?.entryId || !urlKey)
    return denied('EDITORIAL_IDENTITY_MISMATCH');
  if (ambiguous.has(`id:${recordId}`) || ambiguous.has(`url:${urlKey}`))
    return denied('EDITORIAL_ENTRY_AMBIGUOUS');
  if (urlKey !== editorialUrlKey(candidate.canonical_url) || !isOfficialUrl(sourceUrl, source.official_url))
    return denied('EDITORIAL_SOURCE_URL_MISMATCH');
  if (text(fields.publicationStatus).toUpperCase() !== 'CURRENT' ||
      text(fields.validationStatus).toUpperCase() !== 'PASS')
    return denied('EDITORIAL_APPROVAL_NOT_EXPLICIT');
  if (text(fields.sourceValidationSummary).length < MIN_EVIDENCE_LENGTH)
    return denied('EDITORIAL_EVIDENCE_MISSING');
  const approval = Object.freeze({
    approved: true,
    entryId: entry.entryId,
    candidateId: String(candidate.id).toLowerCase(),
    supabaseRecordId: recordId,
    entryReference: identity.entryReference,
    publicationId: text(fields.gpirPublicationId),
    sourceUrl: urlKey
  });
  VERIFIED_APPROVALS.add(approval);
  return approval;
}

// Authorization comes only from the freshly read set of published entries for this
// candidate id and URL; exactly one distinct entry must exist.
export function verifyEditorialApproval({ entries, candidate, source, identity, ambiguous = new Set() }) {
  const distinct = new Map((entries || []).map(item => [item.entryId, item]));
  if (distinct.size === 0) return { approved: false, reasonCode: 'EDITORIAL_ENTRY_NOT_FOUND' };
  if (distinct.size > 1) return { approved: false, reasonCode: 'EDITORIAL_ENTRY_AMBIGUOUS' };
  return evaluateEditorialEntry({ entry: [...distinct.values()][0], candidate, source, identity, ambiguous });
}
