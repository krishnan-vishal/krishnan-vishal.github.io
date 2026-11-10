// M40: idempotent Supabase -> Contentful editorial draft handoff.
//
// Creates (or, while untouched, refreshes) UNPUBLISHED `gpirPublication` drafts for T3 candidates
// that GPIR validation has fully source-verified but that cannot publish automatically because
// their confidence is below the T3 automatic threshold. It never publishes, never sets
// `validationStatus`, `publicationStatus` or `gpirPublicationId`, and never allocates identities:
// those remain explicit editorial acts. Once an editor publishes the entry, the existing
// `gpir-intelligence-publish` Contentful editorial route promotes it to the reader APIs.
//
// Server-side credentials only: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONTENTFUL_SPACE_ID,
// CONTENTFUL_ENVIRONMENT, CONTENTFUL_MANAGEMENT_TOKEN. Credentials are never logged or reported.
import { writeFileSync } from 'node:fs';
import { editorialUrlKey, T3_AUTOMATIC_PUBLICATION, validateCandidateSource }
    from '../../supabase/functions/_shared/gpir-intelligence-validation.mjs';

const CONTENT_TYPE = 'gpirPublication';
const LOCALE = 'en-US';
const THRESHOLD_REASON = 'AUTO_PUBLICATION_THRESHOLD_NOT_MET';
const OPEN_STATUSES = ['PENDING', 'REVIEW', 'VALIDATING'];
const VERIFIED_FLAGS = ['source_verified', 'canonical_verified', 'timestamp_verified', 'content_verified',
    'relevance_verified', 'summary_grounded'];
const DEFAULT_WINDOW_HOURS = 12;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const CANDIDATE_PAGE_SIZE = 100;
const MAX_CANDIDATE_SCAN = 1000;

export function draftEntryId(candidateId) {
    return `gpir-t3-${String(candidateId).toLowerCase()}`;
}

async function readRows(fetchImpl, base, headers, table, params) {
    const response = await fetchImpl(`${base}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers });
    if (!response.ok) throw new Error(`${table} request failed with status ${response.status}`);
    return response.json();
}

function supabaseAccess(env) {
    const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(base) || !key)
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    const headers = new Headers();
    headers.set('apikey', key);
    headers.set('authorization', ['Bearer', key].join(' '));
    return { base, headers };
}

function evidenceVerified(payload) {
    return Boolean(payload) && VERIFIED_FLAGS.every(flag => payload[flag] === true) &&
        payload.evidence_verification?.status === 'SUCCEEDED';
}

async function verifyHistoricalCandidate({ candidate, source, audit, base, headers, fetchImpl, now }) {
    const validation = await validateCandidateSource({ candidate, source, fetchImpl, now: () => now,
        historicalReview: true });
    if (validation.decision !== 'REVIEW' || validation.reasonCode !== THRESHOLD_REASON ||
        !evidenceVerified(validation.validationPayload))
        return { verified: false, reason: validation.reasonCode };
    if (editorialUrlKey(validation.canonicalUrl) !== editorialUrlKey(candidate.canonical_url))
        return { verified: false, reason: 'SOURCE_CANONICAL_IDENTITY_MISMATCH' };
    const duplicates = await readRows(fetchImpl, base, headers, 'intelligence_publication_audits', {
        select: 'candidate_id', decision: 'eq.PUBLISHED', content_fingerprint: `eq.${validation.contentFingerprint}`,
        limit: '1' });
    if (duplicates.length) return { verified: false, reason: 'DUPLICATE_PUBLISHED_CONTENT' };
    const params = new URLSearchParams({ candidate_id: `eq.${candidate.id}`, decision: 'eq.REVIEW',
        reason_code: `eq.${THRESHOLD_REASON}`, updated_at: audit.updated_at ? `eq.${audit.updated_at}` : 'is.null' });
    const writeHeaders = new Headers(headers);
    writeHeaders.set('content-type', 'application/json');
    writeHeaders.set('prefer', 'return=representation');
    const response = await fetchImpl(`${base}/rest/v1/intelligence_publication_audits?${params}`, {
        method: 'PATCH', headers: writeHeaders, body: JSON.stringify({
            canonical_url: validation.canonicalUrl,
            content_fingerprint: validation.contentFingerprint,
            source_published_at: validation.sourcePublishedAt,
            source_checked_at: new Date(now).toISOString(),
            source_http_status: validation.sourceHttpStatus,
            evidence_excerpt: validation.evidenceExcerpt,
            validation_payload: { ...validation.validationPayload,
                historical_review: { previous_audit: audit, verified_at: new Date(now).toISOString() } }
        }) });
    if (!response.ok) throw new Error(`Historical audit update failed with status ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Historical audit changed during verification.');
    return { verified: true, audit: rows[0] };
}

// Eligible: a T3 GREEN source, an open candidate inside the selected window, below the T3 automatic
// threshold, whose latest audit is the threshold review with every verification flag true, and
// which is not already published, duplicated or announced through any route.
export async function selectEligibleCandidates({ env, fetchImpl = fetch, now = Date.now(),
    hours = DEFAULT_WINDOW_HOURS, limit = DEFAULT_LIMIT, historicalFrom, historicalTo, candidateId,
    verifyHistorical = false, verificationResults = [], verificationState = {} }) {
    const historical = Boolean(historicalFrom || historicalTo || candidateId);
    let since;
    let until;
    if (historical) {
        const validDate = value => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
            const timestamp = Date.parse(`${value}T00:00:00Z`);
            return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
        };
        if (!validDate(historicalFrom) || !validDate(historicalTo) ||
            (candidateId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)))
            throw new Error('Historical mode requires valid from/to dates and, if supplied, a candidate UUID.');
        since = `${historicalFrom}T00:00:00.000Z`;
        until = `${historicalTo}T00:00:00.000Z`;
        if (since < '2021-11-01T00:00:00.000Z' || until > '2026-12-01T00:00:00.000Z' ||
            Date.parse(until) <= Date.parse(since) || Date.parse(until) - Date.parse(since) > 31 * 86400000)
            throw new Error('Historical range must be at most 31 days within November 2021–November 2026.');
    } else {
        since = new Date(now - hours * 3600 * 1000).toISOString();
    }
    const { base, headers } = supabaseAccess(env);
    const sources = await readRows(fetchImpl, base, headers, 'source_registry', {
        select: 'source_id,source_name,official_url,trust_tier,source_status', trust_tier: 'eq.T3', source_status: 'eq.GREEN', limit: '100' });
    if (!sources.length) return [];
    const selected = [];
    for (let offset = 0; offset < MAX_CANDIDATE_SCAN; offset += CANDIDATE_PAGE_SIZE) {
        const candidates = await readRows(fetchImpl, base, headers, 'intelligence_candidates', {
            select: 'id,source_id,title,canonical_url,published_at,candidate_status,confidence_score,country_code,region,' +
                'category,subcategory,event_type',
            source_id: `in.(${sources.map(item => item.source_id).join(',')})`,
            candidate_status: `in.(${OPEN_STATUSES.join(',')})`,
            ...(historical ? { ...(candidateId ? { id: `eq.${candidateId}` } : {}),
                and: `(published_at.gte.${since},published_at.lt.${until})` } : { published_at: `gte.${since}` }),
            confidence_score: `lt.${T3_AUTOMATIC_PUBLICATION.minConfidence}`,
            order: 'published_at.desc,id.asc', limit: String(CANDIDATE_PAGE_SIZE), offset: String(offset) });
        for (const candidate of candidates) {
            if (selected.length >= limit) return selected;
            const candidateTime = Date.parse(candidate.published_at);
            if (!Number.isFinite(candidateTime) || candidateTime > now || candidateTime < Date.parse(since) ||
                (historical && ((candidateId && candidate.id.toLowerCase() !== candidateId.toLowerCase()) ||
                    candidateTime >= Date.parse(until))) || !editorialUrlKey(candidate.canonical_url)) continue;
            const audits = await readRows(fetchImpl, base, headers, 'intelligence_publication_audits', {
                select: '*',
                candidate_id: `eq.${candidate.id}`, order: 'attempted_at.desc', limit: '20' });
            let latest = audits[0];
            if (!latest || audits.some(item => item.decision === 'PUBLISHED' || item.decision === 'DUPLICATE')) continue;
            if (latest.decision !== 'REVIEW' || latest.reason_code !== THRESHOLD_REASON) continue;
            const announced = await readRows(fetchImpl, base, headers, 'global_announcements', {
                select: 'id', canonical_url: `eq.${candidate.canonical_url}`, limit: '1' });
            if (announced.length) continue;
            const source = sources.find(item => item.source_id === candidate.source_id);
            if (!evidenceVerified(latest.validation_payload) && historical && verifyHistorical &&
                latest.validation_payload?.evidence_verification?.status === 'NOT_ATTEMPTED') {
                if (verificationResults.length >= limit) {
                    verificationState.limitReached = true;
                    return selected;
                }
                const result = await verifyHistoricalCandidate({ candidate, source, audit: latest,
                    base, headers, fetchImpl, now });
                verificationResults.push({ candidateId: candidate.id, outcome: result.verified ? 'VERIFIED' : result.reason });
                if (result.verified) latest = result.audit;
            }
            if (!evidenceVerified(latest.validation_payload)) continue;
            if (historical) {
                const sourceTime = Date.parse(latest.source_published_at || '');
                if (!Number.isFinite(sourceTime) || sourceTime < Date.parse(since) ||
                    sourceTime >= Date.parse(until) || sourceTime > now) {
                    verificationResults.push({ candidateId: candidate.id, outcome: 'SOURCE_TIMESTAMP_OUTSIDE_WINDOW_OR_MISSING' });
                    continue;
                }
            }
            selected.push({ candidate, source, audit: latest });
        }
        if (selected.length >= limit || candidates.length < CANDIDATE_PAGE_SIZE) return selected;
    }
    throw new Error('Candidate scan limit reached; narrow the historical window.');
}

function localized(value) {
    return { [LOCALE]: value };
}

// Only fields with governed evidence are populated. Approval, identity and routing fields are
// left for the editor; an unset `validationStatus` is denied by the publisher.
export function buildDraftFields({ candidate, source, audit }) {
    const confidence = Number(candidate.confidence_score);
    const publicationDate = new Date(audit.source_published_at || candidate.published_at).toISOString();
    const taxonomy = [candidate.category, candidate.subcategory, candidate.event_type].filter(Boolean).join(' / ');
    const note = [
        `Source-verified GPIR candidate ${candidate.id} from ${source?.source_name || candidate.source_id}.`,
        `Official-domain canonical URL, original timestamp ${publicationDate},`,
        'live source evidence, payments relevance and summary grounding were verified by GPIR validation.',
        `Confidence ${confidence} is below the T3 automatic threshold ${T3_AUTOMATIC_PUBLICATION.minConfidence}, so`,
        'publication requires explicit editorial approval.',
        taxonomy ? `Taxonomy: ${taxonomy}.` : '',
        audit.evidence_excerpt ? `Stored evidence excerpt: ${String(audit.evidence_excerpt).slice(0, 400)}` : ''
    ].filter(Boolean).join(' ');
    const fields = {
        supabaseRecordId: localized(candidate.id),
        legacySourceUrl: localized(candidate.canonical_url),
        publicationTitle: localized(candidate.title),
        publicationDate: localized(publicationDate),
        sourceValidationSummary: localized(note)
    };
    if (candidate.region) fields.region = localized(candidate.region);
    if (candidate.country_code) fields.countryMarket = localized(candidate.country_code);
    return fields;
}

function contentfulClient(env, fetchImpl) {
    const read = name => String(env[name] || '').trim();
    const space = read('CONTENTFUL_SPACE_ID');
    const environment = read('CONTENTFUL_ENVIRONMENT');
    const token = read('CONTENTFUL_MANAGEMENT_TOKEN');
    if (!space || !environment || !token) return null;
    const root = `https://api.contentful.com/spaces/${encodeURIComponent(space)}/environments/${encodeURIComponent(environment)}`;
    async function call(method, path, body, extra = {}) {
        const headers = new Headers({ accept: 'application/vnd.contentful.management.v1+json', ...extra });
        headers.set('authorization', ['Bearer', token].join(' '));
        if (body) headers.set('content-type', 'application/vnd.contentful.management.v1+json');
        const response = await fetchImpl(`${root}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        if (response.status === 404 && method === 'GET') return null;
        if (response.status === 409) return { conflict: true };
        if (!response.ok) throw new Error(`Contentful ${method} failed with status ${response.status}`);
        return response.json();
    }
    return {
        entry: id => call('GET', `/entries/${encodeURIComponent(id)}`),
        search: async (field, value) => {
            const query = new URLSearchParams({ content_type: CONTENT_TYPE, [`fields.${field}`]: value, limit: '5' });
            return (await call('GET', `/entries?${query}`))?.items || [];
        },
        create: (id, fields) => call('PUT', `/entries/${encodeURIComponent(id)}`, { fields },
            { 'x-contentful-content-type': CONTENT_TYPE }),
        update: (entry, fields) => call('PUT', `/entries/${encodeURIComponent(entry.sys.id)}`,
            { fields: { ...entry.fields, ...fields } }, { 'x-contentful-version': String(entry.sys.version) })
    };
}

function sameFields(entryFields, fields) {
    return Object.entries(fields).every(([name, value]) =>
        JSON.stringify(entryFields?.[name]?.[LOCALE]) === JSON.stringify(value[LOCALE]));
}

async function reconcile(client, item) {
    const id = draftEntryId(item.candidate.id);
    const fields = buildDraftFields(item);
    const result = { candidateId: item.candidate.id, canonicalUrl: item.candidate.canonical_url,
        publishedAt: fields.publicationDate[LOCALE], entryId: id };
    const own = await client.entry(id);
    if (!own) {
        // An entry created by an editor (any id) for the same candidate or URL is authoritative.
        const linked = [...await client.search('supabaseRecordId', item.candidate.id),
            ...await client.search('legacySourceUrl', item.candidate.canonical_url)];
        if (linked.length) return { ...result, entryId: linked[0].sys.id, outcome: 'EXISTING_ENTRY_PRESERVED', writes: 0 };
        const created = await client.create(id, fields);
        if (created?.conflict) return { ...result, outcome: 'EXISTING_ENTRY_PRESERVED', writes: 0 };
        return { ...result, outcome: 'DRAFT_CREATED', writes: 1, version: created.sys.version,
            published: Boolean(created.sys.publishedVersion) };
    }
    const untouched = !own.sys.publishedVersion && !own.sys.archivedVersion && own.sys.version === 1;
    if (!untouched || sameFields(own.fields, fields))
        return { ...result, outcome: untouched ? 'DRAFT_CURRENT' : 'EDITED_ENTRY_PRESERVED', writes: 0,
            version: own.sys.version, published: Boolean(own.sys.publishedVersion) };
    const updated = await client.update(own, fields);
    return { ...result, outcome: 'DRAFT_UPDATED', writes: 1, version: updated.sys.version, published: false };
}

export async function syncEditorialDrafts({ env = process.env, fetchImpl = fetch, now = Date.now(),
    dryRun = false, hours = DEFAULT_WINDOW_HOURS, limit = DEFAULT_LIMIT,
    historicalFrom, historicalTo, candidateId } = {}) {
    const bounded = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const client = contentfulClient(env, fetchImpl);
    if (!dryRun && !client) throw new Error('Contentful credentials are required for a non-dry run.');
    const verificationResults = [];
    const verificationState = { limitReached: false };
    const eligible = await selectEligibleCandidates({ env, fetchImpl, now, hours, limit: bounded,
        historicalFrom, historicalTo, candidateId, verifyHistorical: Boolean(historicalFrom && !dryRun),
        verificationResults, verificationState });
    const report = { generatedAt: new Date(now).toISOString(), dryRun,
        ...(historicalFrom ? { historicalFrom, historicalTo, candidateId } : { windowHours: hours }), eligible: eligible.length,
        created: 0, updated: 0, preserved: 0, verificationResults,
        verificationLimitReached: verificationState.limitReached, results: [] };
    if (dryRun) {
        report.results = eligible.map(item => ({ candidateId: item.candidate.id, entryId: draftEntryId(item.candidate.id),
            canonicalUrl: item.candidate.canonical_url, publishedAt: new Date(item.audit.source_published_at || item.candidate.published_at).toISOString(),
            outcome: 'PLANNED', writes: 0 }));
        return report;
    }
    for (const item of eligible) {
        const result = await reconcile(client, item);
        report.results.push(result);
        if (result.outcome === 'DRAFT_CREATED') report.created += 1;
        else if (result.outcome === 'DRAFT_UPDATED') report.updated += 1;
        else report.preserved += 1;
    }
    return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const option = name => args.find(item => item.startsWith(`--${name}=`))?.split('=')[1];
    syncEditorialDrafts({ dryRun: args.includes('--dry-run'), hours: Number(option('hours')) || DEFAULT_WINDOW_HOURS,
        limit: option('limit') || DEFAULT_LIMIT, historicalFrom: process.env.GPIR_HISTORICAL_FROM,
        historicalTo: process.env.GPIR_HISTORICAL_TO, candidateId: process.env.GPIR_HISTORICAL_CANDIDATE_ID })
        .then(report => {
            const text = JSON.stringify(report, null, 2);
            if (option('report')) writeFileSync(option('report'), `${text}\n`);
            console.log(text);
        })
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
