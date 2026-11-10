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
import { editorialUrlKey, T3_AUTOMATIC_PUBLICATION } from '../../supabase/functions/_shared/gpir-intelligence-validation.mjs';

const CONTENT_TYPE = 'gpirPublication';
const LOCALE = 'en-US';
const THRESHOLD_REASON = 'AUTO_PUBLICATION_THRESHOLD_NOT_MET';
const OPEN_STATUSES = ['PENDING', 'REVIEW', 'VALIDATING'];
const VERIFIED_FLAGS = ['source_verified', 'canonical_verified', 'timestamp_verified', 'content_verified',
    'relevance_verified', 'summary_grounded'];
const DEFAULT_WINDOW_HOURS = 12;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

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

// Eligible: a T3 GREEN source, an open candidate inside the selected window, below the T3 automatic
// threshold, whose latest audit is the threshold review with every verification flag true, and
// which is not already published, duplicated or announced through any route.
export async function selectEligibleCandidates({ env, fetchImpl = fetch, now = Date.now(),
    hours = DEFAULT_WINDOW_HOURS, limit = DEFAULT_LIMIT, historicalFrom, historicalTo, candidateId }) {
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
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId || ''))
            throw new Error('Historical mode requires valid from/to dates and one candidate UUID.');
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
        select: 'source_id,source_name,official_url', trust_tier: 'eq.T3', source_status: 'eq.GREEN', limit: '100' });
    if (!sources.length) return [];
    const candidates = await readRows(fetchImpl, base, headers, 'intelligence_candidates', {
        select: 'id,source_id,title,canonical_url,published_at,candidate_status,confidence_score,country_code,region,' +
            'category,subcategory,event_type',
        source_id: `in.(${sources.map(item => item.source_id).join(',')})`,
        candidate_status: `in.(${OPEN_STATUSES.join(',')})`,
        ...(historical ? { id: `eq.${candidateId}`, and: `(published_at.gte.${since},published_at.lt.${until})` }
            : { published_at: `gte.${since}` }),
        confidence_score: `lt.${T3_AUTOMATIC_PUBLICATION.minConfidence}`,
        order: 'published_at.desc', limit: '200' });
    const selected = [];
    for (const candidate of candidates) {
        if (selected.length >= limit) break;
        const candidateTime = Date.parse(candidate.published_at);
        if (!Number.isFinite(candidateTime) || candidateTime > now || candidateTime < Date.parse(since) ||
            (historical && (candidate.id.toLowerCase() !== candidateId.toLowerCase() ||
                candidateTime >= Date.parse(until))) || !editorialUrlKey(candidate.canonical_url)) continue;
        const audits = await readRows(fetchImpl, base, headers, 'intelligence_publication_audits', {
            select: 'decision,reason_code,validation_payload,evidence_excerpt,completed_at',
            candidate_id: `eq.${candidate.id}`, order: 'attempted_at.desc', limit: '20' });
        const latest = audits[0];
        if (!latest || audits.some(item => item.decision === 'PUBLISHED' || item.decision === 'DUPLICATE')) continue;
        if (latest.decision !== 'REVIEW' || latest.reason_code !== THRESHOLD_REASON ||
            !evidenceVerified(latest.validation_payload)) continue;
        const announced = await readRows(fetchImpl, base, headers, 'global_announcements', {
            select: 'id', canonical_url: `eq.${candidate.canonical_url}`, limit: '1' });
        if (announced.length) continue;
        selected.push({ candidate, source: sources.find(item => item.source_id === candidate.source_id),
            audit: latest });
    }
    return selected;
}

function localized(value) {
    return { [LOCALE]: value };
}

// Only fields with governed evidence are populated. Approval, identity and routing fields are
// left for the editor; an unset `validationStatus` is denied by the publisher.
export function buildDraftFields({ candidate, source, audit }) {
    const confidence = Number(candidate.confidence_score);
    const taxonomy = [candidate.category, candidate.subcategory, candidate.event_type].filter(Boolean).join(' / ');
    const note = [
        `Source-verified GPIR candidate ${candidate.id} from ${source?.source_name || candidate.source_id}.`,
        `Official-domain canonical URL, original timestamp ${new Date(candidate.published_at).toISOString()},`,
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
        publicationDate: localized(new Date(candidate.published_at).toISOString()),
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
        publishedAt: new Date(item.candidate.published_at).toISOString(), entryId: id };
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
    const eligible = await selectEligibleCandidates({ env, fetchImpl, now, hours, limit: bounded,
        historicalFrom, historicalTo, candidateId });
    const client = contentfulClient(env, fetchImpl);
    if (!dryRun && !client) throw new Error('Contentful credentials are required for a non-dry run.');
    const report = { generatedAt: new Date(now).toISOString(), dryRun,
        ...(historicalFrom ? { historicalFrom, historicalTo, candidateId } : { windowHours: hours }), eligible: eligible.length,
        created: 0, updated: 0, preserved: 0, results: [] };
    if (dryRun) {
        report.results = eligible.map(item => ({ candidateId: item.candidate.id, entryId: draftEntryId(item.candidate.id),
            canonicalUrl: item.candidate.canonical_url, publishedAt: new Date(item.candidate.published_at).toISOString(),
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
