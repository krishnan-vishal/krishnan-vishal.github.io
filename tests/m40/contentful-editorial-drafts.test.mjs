import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftFields, draftEntryId, selectEligibleCandidates, syncEditorialDrafts }
    from '../../scripts/m40/sync-contentful-editorial-drafts.mjs';

const NOW = Date.parse('2026-11-10T08:00:00Z');
const SUPABASE = 'https://abcdefghijklmnopqrst.supabase.co';
const env = { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'service-key', CONTENTFUL_SPACE_ID: 'space',
    CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_MANAGEMENT_TOKEN: 'management-token' };
const flags = { source_verified: true, canonical_verified: true, timestamp_verified: true, content_verified: true,
    relevance_verified: true, summary_grounded: true, evidence_verification: { status: 'SUCCEEDED', attempted: true } };

function candidate(n, overrides = {}) {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    return { id, source_id: 'PYMNTS-GLOBAL-004', title: `Verified payments article number ${n}`,
        canonical_url: `https://www.pymnts.com/news/article-${n}/`, candidate_status: 'REVIEW', confidence_score: 70,
        published_at: new Date(NOW - n * 3600000).toISOString(), country_code: null, region: null,
        category: 'STABLECOINS_DIGITAL_ASSETS', subcategory: null, event_type: 'NEWS', ...overrides };
}

const thresholdAudit = { decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET',
    validation_payload: flags, evidence_excerpt: 'Verified source evidence excerpt for the editor.' };

function world({ candidates, audits = {}, announced = [], entries = [] }) {
    const state = { entries: new Map(entries.map(entry => [entry.sys.id, entry])), writes: [], reads: 0 };
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    state.fetch = async (url, init = {}) => {
        const target = new URL(url);
        const method = init.method || 'GET';
        if (target.origin === SUPABASE) {
            state.reads += 1;
            assert.equal(method, 'GET');
            const table = target.pathname.split('/').pop();
            if (table === 'source_registry') return reply(200, [{ source_id: 'PYMNTS-GLOBAL-004', source_name: 'PYMNTS',
                official_url: 'https://www.pymnts.com/' }]);
            if (table === 'intelligence_candidates') {
                assert.equal(target.searchParams.get('confidence_score'), 'lt.95');
                return reply(200, candidates);
            }
            if (table === 'intelligence_publication_audits') {
                const id = target.searchParams.get('candidate_id').replace('eq.', '');
                return reply(200, audits[id] ?? [thresholdAudit]);
            }
            if (table === 'global_announcements')
                return reply(200, announced.includes(target.searchParams.get('canonical_url').replace('eq.', '')) ? [{ id: 'x' }] : []);
            throw new Error(`unexpected table ${table}`);
        }
        assert.equal(target.origin, 'https://api.contentful.com');
        assert.match(init.headers.get('authorization'), /^Bearer management-token$/);
        const path = target.pathname.replace('/spaces/space/environments/master', '');
        if (method === 'GET' && path === '/entries') {
            const [[key, value]] = [...target.searchParams].filter(([name]) => name.startsWith('fields.'));
            const field = key.replace('fields.', '');
            return reply(200, { items: [...state.entries.values()].filter(entry => entry.fields[field]?.['en-US'] === value) });
        }
        const id = decodeURIComponent(path.replace('/entries/', ''));
        if (method === 'GET') return state.entries.has(id) ? reply(200, state.entries.get(id)) : reply(404, {});
        assert.equal(method, 'PUT');
        const body = JSON.parse(init.body);
        const existing = state.entries.get(id);
        state.writes.push({ id, method, version: init.headers.get('x-contentful-version') });
        if (!existing) {
            assert.equal(init.headers.get('x-contentful-content-type'), 'gpirPublication');
            const created = { sys: { id, version: 1 }, fields: body.fields };
            state.entries.set(id, created);
            return reply(201, created);
        }
        if (String(existing.sys.version) !== init.headers.get('x-contentful-version')) return reply(409, {});
        existing.fields = body.fields;
        existing.sys.version += 1;
        return reply(200, existing);
    };
    return state;
}

test('selects only source-verified T3 candidates awaiting an editorial decision', async () => {
    const [a, b, c, d, e, f] = [1, 2, 3, 4, 5, 6].map(n => candidate(n));
    const world1 = world({ candidates: [a, b, c, d, e, f], announced: [e.canonical_url], audits: {
        [b.id]: [{ ...thresholdAudit, validation_payload: { ...flags, content_verified: false } }],
        [c.id]: [{ decision: 'REVIEW', reason_code: 'INSUFFICIENT_PAYMENTS_RELEVANCE', validation_payload: {} }],
        [d.id]: [thresholdAudit, { decision: 'PUBLISHED', reason_code: 'T3_AUTOMATIC_PUBLICATION' }],
        [f.id]: [{ ...thresholdAudit, validation_payload: { ...flags, evidence_verification: { status: 'NOT_ATTEMPTED' } } }] } });
    const selected = await selectEligibleCandidates({ env, fetchImpl: world1.fetch, now: NOW });
    assert.deepEqual(selected.map(item => item.candidate.id), [a.id]);
});

test('historical handoff is bounded to one verified candidate and preserves the original date', async () => {
    const item = candidate(1, { published_at: '2022-05-04T10:00:00.000Z' });
    const other = candidate(2, { published_at: '2022-05-04T10:00:00.000Z' });
    const state = world({ candidates: [item, other] });
    const options = { env, fetchImpl: state.fetch, now: NOW, historicalFrom: '2022-05-01',
        historicalTo: '2022-06-01', candidateId: item.id };
    const first = await syncEditorialDrafts(options);
    assert.equal(first.created, 1);
    assert.equal(state.entries.get(draftEntryId(item.id)).fields.publicationDate['en-US'], item.published_at);
    assert.equal((await syncEditorialDrafts(options)).results[0].outcome, 'DRAFT_CURRENT');
    assert.equal(state.writes.length, 1);
    const unverified = world({ candidates: [item], audits: { [item.id]: [
        { ...thresholdAudit, validation_payload: { ...flags, relevance_verified: false } }] } });
    assert.equal((await syncEditorialDrafts({ ...options, fetchImpl: unverified.fetch })).eligible, 0);
});

test('historical handoff rejects missing, invalid and unbounded selections', async () => {
    const options = { env, now: NOW, historicalFrom: '2022-05-01', historicalTo: '2022-06-01',
        candidateId: candidate(1).id };
    for (const invalid of [
        { candidateId: '' }, { historicalTo: '2022-05-40' }, { historicalFrom: '2021-10-31' },
        { historicalTo: '2022-07-01' }, { historicalTo: '2022-05-01' }
    ]) await assert.rejects(selectEligibleCandidates({ ...options, ...invalid }), /Historical/);
});

test('draft fields preserve identity, source URL, original date and governed evidence only', () => {
    const item = { candidate: candidate(1, { country_code: 'US', region: 'North America' }),
        source: { source_name: 'PYMNTS' }, audit: thresholdAudit };
    const fields = buildDraftFields(item);
    assert.equal(fields.supabaseRecordId['en-US'], item.candidate.id);
    assert.equal(fields.legacySourceUrl['en-US'], item.candidate.canonical_url);
    assert.equal(fields.publicationDate['en-US'], item.candidate.published_at);
    assert.equal(fields.region['en-US'], 'North America');
    assert.equal(fields.countryMarket['en-US'], 'US');
    assert.ok(fields.sourceValidationSummary['en-US'].length >= 40);
    assert.match(fields.sourceValidationSummary['en-US'], /STABLECOINS_DIGITAL_ASSETS/);
    for (const forbidden of ['validationStatus', 'publicationStatus', 'gpirPublicationId', 'slug'])
        assert.equal(forbidden in fields, false);
});

test('creates unpublished drafts and a repeat run creates no duplicates and writes nothing', async () => {
    const items = [candidate(1), candidate(2)];
    const state = world({ candidates: items });
    const first = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW });
    assert.equal(first.created, 2);
    assert.deepEqual(state.writes.map(item => item.id), items.map(item => draftEntryId(item.id)));
    assert.ok([...state.entries.values()].every(entry => entry.sys.publishedVersion === undefined));
    const second = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW });
    assert.equal(second.created, 0);
    assert.equal(second.updated, 0);
    assert.deepEqual(second.results.map(item => item.outcome), ['DRAFT_CURRENT', 'DRAFT_CURRENT']);
    assert.equal(state.writes.length, 2);
    assert.equal(state.entries.size, 2);
});

test('an editor-created entry for the candidate or URL is preserved and never duplicated', async () => {
    const item = candidate(1);
    const state = world({ candidates: [item], entries: [{ sys: { id: 'editor-entry', version: 4, publishedVersion: 3 },
        fields: { supabaseRecordId: { 'en-US': item.id }, legacySourceUrl: { 'en-US': item.canonical_url } } }] });
    const report = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW });
    assert.equal(report.results[0].outcome, 'EXISTING_ENTRY_PRESERVED');
    assert.equal(report.results[0].entryId, 'editor-entry');
    assert.equal(state.writes.length, 0);
});

test('an untouched draft is refreshed once; an edited or published draft is never overwritten', async () => {
    const item = candidate(1);
    const stale = { sys: { id: draftEntryId(item.id), version: 1 }, fields: { publicationTitle: { 'en-US': 'Old title' },
        supabaseRecordId: { 'en-US': item.id } } };
    const state = world({ candidates: [item], entries: [stale] });
    assert.equal((await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW })).updated, 1);
    assert.equal(state.entries.get(draftEntryId(item.id)).fields.publicationTitle['en-US'], item.title);
    // The refresh itself raised the version, so any later source change is now treated as an editor change.
    const edited = world({ candidates: [item], entries: [{ ...stale, sys: { id: draftEntryId(item.id), version: 3 } }] });
    assert.equal((await syncEditorialDrafts({ env, fetchImpl: edited.fetch, now: NOW })).results[0].outcome, 'EDITED_ENTRY_PRESERVED');
    const published = world({ candidates: [item], entries: [{ ...stale, sys: { id: draftEntryId(item.id), version: 1, publishedVersion: 1 } }] });
    assert.equal((await syncEditorialDrafts({ env, fetchImpl: published.fetch, now: NOW })).results[0].outcome, 'EDITED_ENTRY_PRESERVED');
    assert.equal(edited.writes.length + published.writes.length, 0);
});

test('dry run writes nothing, needs no Contentful credentials and reports no secrets', async () => {
    const state = world({ candidates: [candidate(1)] });
    const { CONTENTFUL_MANAGEMENT_TOKEN, ...supabaseOnly } = env;
    const report = await syncEditorialDrafts({ env: supabaseOnly, fetchImpl: state.fetch, now: NOW, dryRun: true });
    assert.equal(report.results[0].outcome, 'PLANNED');
    assert.equal(state.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(report), /service-key|management-token/);
    await assert.rejects(syncEditorialDrafts({ env: supabaseOnly, fetchImpl: state.fetch, now: NOW }), /Contentful credentials/);
});

test('the sync never publishes, approves or touches Contentful publication endpoints', async () => {
    const state = world({ candidates: [candidate(1)] });
    const seen = [];
    const spy = async (url, init) => { seen.push(`${init?.method || 'GET'} ${new URL(url).pathname}`); return state.fetch(url, init); };
    await syncEditorialDrafts({ env, fetchImpl: spy, now: NOW });
    assert.ok(seen.every(line => !/published|archived/.test(line)));
    assert.ok(seen.filter(line => line.startsWith('PUT')).every(line => /\/entries\/gpir-t3-[0-9a-f-]+$/.test(line)));
});
