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

function world({ candidates, audits = {}, announced = [], entries = [], sourcePage = null,
    duplicateFingerprint = false, auditConflict = false, sources = [{ source_id: 'PYMNTS-GLOBAL-004', source_name: 'PYMNTS',
        official_url: 'https://www.pymnts.com/', source_status: 'GREEN', trust_tier: 'T3' }] }) {
    const state = { entries: new Map(entries.map(entry => [entry.sys.id, entry])), writes: [], auditWrites: [], reads: 0 };
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    state.fetch = async (url, init = {}) => {
        const target = new URL(url);
        const method = init.method || 'GET';
        if (target.origin === SUPABASE) {
            state.reads += 1;
            const table = target.pathname.split('/').pop();
            if (table === 'source_registry') return reply(200, sources);
            if (table === 'intelligence_candidates') {
                assert.equal(target.searchParams.has('confidence_score'), false);
                const id = target.searchParams.get('id')?.replace('eq.', '');
                const matched = id ? candidates.filter(item => item.id === id) : candidates;
                const offset = Number(target.searchParams.get('offset') || 0);
                return reply(200, matched.slice(offset, offset + Number(target.searchParams.get('limit') || 100)));
            }
            if (table === 'intelligence_publication_audits') {
                const id = target.searchParams.get('candidate_id')?.replace('eq.', '');
                if (!id) return reply(200, duplicateFingerprint ? [{ candidate_id: 'other' }] : []);
                if (method === 'PATCH') {
                    const previous = audits[id]?.[0];
                    if (auditConflict || !previous || target.searchParams.get('updated_at') !== `eq.${previous.updated_at}`)
                        return reply(200, []);
                    const updated = { ...previous, ...JSON.parse(init.body) };
                    audits[id] = [updated];
                    state.auditWrites.push(updated);
                    return reply(200, [updated]);
                }
                assert.equal(method, 'GET');
                return reply(200, audits[id] ?? [{ ...thresholdAudit,
                    source_published_at: candidates.find(item => item.id === id)?.published_at }]);
            }
            if (table === 'global_announcements')
                return reply(200, announced.includes(target.searchParams.get('canonical_url').replace('eq.', '')) ? [{ id: 'x' }] : []);
            throw new Error(`unexpected table ${table}`);
        }
        if (target.origin === 'https://www.pymnts.com' && sourcePage) {
            return { ok: true, status: 200, url: target.href, headers: new Headers({ 'content-type': 'text/html' }),
                text: async () => sourcePage };
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

test('all supported source tiers and high-confidence T3 create unpublished drafts without weakening thresholds', async () => {
    const sources = ['T1', 'T1.5', 'T2', 'T3'].map(tier => ({
        source_id: `SOURCE-${tier}`, source_name: `Source ${tier}`, official_url: 'https://www.pymnts.com/',
        source_status: 'GREEN', trust_tier: tier }));
    const items = [candidate(1, { source_id: 'SOURCE-T1', confidence_score: 70 }),
        candidate(2, { source_id: 'SOURCE-T1.5', confidence_score: 80 }),
        candidate(3, { source_id: 'SOURCE-T2', confidence_score: 90 }),
        candidate(4, { source_id: 'SOURCE-T3', confidence_score: 99 }),
        candidate(5, { source_id: 'SOURCE-T1', confidence_score: 69 })];
    const audits = Object.fromEntries(items.map(item => [item.id, [{ ...thresholdAudit,
        reason_code: 'CONTENTFUL_APPROVAL_REQUIRED', source_published_at: item.published_at,
        validation_payload: { ...flags, ...(item.source_id === 'SOURCE-T3' ? { t3_auto_verified: true } : {}) } }]]));
    const state = world({ candidates: items, sources, audits });
    const report = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW });
    assert.equal(report.created, 4);
    for (let i = 0; i < 4; i++) {
        const entry = state.entries.get(draftEntryId(items[i].id, sources[i].trust_tier));
        assert.ok(entry);
        assert.equal(entry.sys.publishedVersion, undefined);
        assert.equal(entry.fields.validationStatus, undefined);
        assert.equal(entry.fields.publicationStatus, undefined);
        assert.equal(entry.fields.gpirPublicationId, undefined);
    }
    assert.equal((await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW })).created, 0);
    assert.equal(state.writes.length, 4);
});

test('high-confidence T3 cannot reuse evidence verified under the weaker editorial profile', async () => {
    const item = candidate(1, { confidence_score: 99 });
    const state = world({ candidates: [item], audits: { [item.id]: [{ ...thresholdAudit,
        reason_code: 'CONTENTFUL_APPROVAL_REQUIRED', source_published_at: item.published_at }] } });
    const report = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW });
    assert.equal(report.eligible, 0);
    assert.equal(state.writes.length, 0);
});

test('historical handoff is bounded to one verified candidate and preserves the original date', async () => {
    const item = candidate(1, { published_at: '2022-05-04T10:00:00.000Z' });
    const other = candidate(2, { published_at: '2022-05-04T10:00:00.000Z' });
    const state = world({ candidates: [item, other] });
    const options = { env, fetchImpl: state.fetch, now: NOW, historicalFrom: '2022-05-01',
        historicalTo: '2022-06-01', candidateId: item.id };
    const first = await syncEditorialDrafts(options);
    assert.equal(first.created, 1, JSON.stringify(first));
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
        { historicalTo: '' }, { candidateId: 'invalid' }, { historicalTo: '2022-05-40' }, { historicalFrom: '2021-10-31' },
        { historicalTo: '2022-07-01' }, { historicalTo: '2022-05-01' }
    ]) await assert.rejects(selectEligibleCandidates({ ...options, ...invalid }), /Historical/);
});

test('bounded historical batches page past ineligible candidates without duplicates', async () => {
    const candidates = Array.from({ length: 101 }, (_, index) =>
        candidate(index + 1, { published_at: '2022-05-04T10:00:00.000Z' }));
    const audits = Object.fromEntries(candidates.slice(0, 100).map(item => [item.id, []]));
    const state = world({ candidates, audits });
    const options = { env, fetchImpl: state.fetch, now: NOW, historicalFrom: '2022-05-01', historicalTo: '2022-06-01' };
    const first = await syncEditorialDrafts(options);
    assert.equal(first.created, 1);
    assert.equal(first.results[0].candidateId, candidates[100].id);
    assert.equal((await syncEditorialDrafts(options)).results[0].outcome, 'DRAFT_CURRENT');
    assert.equal(state.writes.length, 1);
});

test('historical sync verifies source evidence, preserves the prior audit and creates only an unpublished draft', async () => {
    const item = candidate(1, { published_at: '2022-05-04T10:00:00.000Z' });
    const previous = { decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET',
        updated_at: '2026-11-09T10:00:00Z', validation_payload: { evidence_verification: {
            attempted: false, status: 'NOT_ATTEMPTED', reason: 'OUTSIDE_LIVE_WINDOW' } } };
    const body = [
        'The payments network announced that cross-border settlement will expand to additional markets for banks, wallets and merchants across the region.',
        'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the payment network.',
        'The company described the compliance arrangements for remittance partners and fintech participants supporting the payment infrastructure.',
        'Independent reviewers will assess the operational results and published controls before the payments service expands to additional markets.',
        'Regulators will receive periodic reports on transaction monitoring, dispute handling and operational controls throughout the rollout programme.'
    ].join(' ');
    const sourcePage = `<link rel="canonical" href="${item.canonical_url}"><meta property="article:published_time" content="${item.published_at}"><article>${body}</article>`;
    const state = world({ candidates: [item], audits: { [item.id]: [previous] }, sourcePage });
    const options = { env, fetchImpl: state.fetch, now: NOW, historicalFrom: '2022-05-01', historicalTo: '2022-06-01', candidateId: item.id };
    const dryRun = await syncEditorialDrafts({ ...options, dryRun: true });
    assert.equal(dryRun.eligible, 0);
    assert.equal(state.auditWrites.length, 0);
    const first = await syncEditorialDrafts(options);
    assert.equal(first.created, 1, JSON.stringify(first));
    assert.deepEqual(first.verificationResults, [{ candidateId: item.id, outcome: 'VERIFIED' }]);
    assert.deepEqual(state.auditWrites[0].validation_payload.historical_review.previous_audit, previous);
    assert.equal(state.auditWrites[0].validation_payload.evidence_verification.status, 'SUCCEEDED');
    assert.equal(state.entries.get(draftEntryId(item.id)).sys.publishedVersion, undefined);
    const repeat = await syncEditorialDrafts(options);
    assert.equal(repeat.results[0].outcome, 'DRAFT_CURRENT');
    assert.equal(state.auditWrites.length, 1);
    assert.equal(state.writes.length, 1);
});

test('historical verification supports T1 and high-confidence T3 without publishing', async () => {
    const body = [
        'The payments network announced that cross-border settlement will expand to additional markets for banks, wallets and merchants across the region.',
        'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the payment network.',
        'The company described the compliance arrangements for remittance partners and fintech participants supporting the payment infrastructure.',
        'Independent reviewers will assess the operational results and published controls before the payments service expands to additional markets.',
        'Regulators will receive periodic reports on transaction monitoring, dispute handling and operational controls throughout the rollout programme.',
        'Participating banks will publish operational timetables and document the settlement controls before making the service available to their merchants.',
        'The network confirmed that its independent oversight committee will review performance and report material issues to all regulated participants.',
        'New payment gateways will only be enabled after certification verifies the governance, security and reconciliation standards for every participant.'
    ].join(' ');
    for (const [tier, confidence] of [['T1', 70], ['T3', 99]]) {
        const item = candidate(1, { confidence_score: confidence, published_at: '2022-05-04T10:00:00.000Z' });
        const previous = { decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET',
            updated_at: '2026-11-09T10:00:00Z', validation_payload: { evidence_verification: {
                attempted: false, status: 'NOT_ATTEMPTED', reason: 'OUTSIDE_LIVE_WINDOW' } } };
        const source = { source_id: item.source_id, source_name: 'Source', official_url: 'https://www.pymnts.com/',
            source_status: 'GREEN', trust_tier: tier };
        const sourcePage = `<link rel="canonical" href="${item.canonical_url}"><meta property="article:published_time" content="${item.published_at}"><article>${body}</article>`;
        const state = world({ candidates: [item], audits: { [item.id]: [previous] }, sourcePage, sources: [source] });
        const report = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW,
            historicalFrom: '2022-05-01', historicalTo: '2022-06-01', candidateId: item.id });
        assert.equal(report.created, 1, JSON.stringify(report));
        assert.deepEqual(state.auditWrites[0].validation_payload.historical_review.previous_audit, previous);
        assert.equal(state.auditWrites[0].reason_code, 'CONTENTFUL_APPROVAL_REQUIRED');
        assert.equal(state.entries.get(draftEntryId(item.id, tier)).sys.publishedVersion, undefined);
        if (tier === 'T3') assert.equal(state.auditWrites[0].validation_payload.t3_auto_verified, true);
    }
});

test('historical sync leaves the audit and CMS untouched when source verification fails', async () => {
    const item = candidate(1, { published_at: '2022-05-04T10:00:00.000Z' });
    const audit = { decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET',
        updated_at: '2026-11-09T10:00:00Z', validation_payload: { evidence_verification: {
            attempted: false, status: 'NOT_ATTEMPTED', reason: 'OUTSIDE_LIVE_WINDOW' } } };
    const state = world({ candidates: [item], audits: { [item.id]: [audit] },
        sourcePage: `<link rel="canonical" href="${item.canonical_url}"><article>Missing original timestamp.</article>` });
    const report = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW,
        historicalFrom: '2022-05-01', historicalTo: '2022-06-01', candidateId: item.id });
    assert.deepEqual(report.verificationResults, [{ candidateId: item.id, outcome: 'SOURCE_TIMESTAMP_MISSING' }]);
    assert.equal(state.auditWrites.length, 0);
    assert.equal(state.writes.length, 0);
});

test('historical verification refuses duplicate content and concurrent audit changes', async () => {
    const item = candidate(1, { published_at: '2022-05-04T10:00:00.000Z' });
    const audit = { decision: 'REVIEW', reason_code: 'AUTO_PUBLICATION_THRESHOLD_NOT_MET',
        updated_at: '2026-11-09T10:00:00Z', validation_payload: { evidence_verification: {
            attempted: false, status: 'NOT_ATTEMPTED', reason: 'OUTSIDE_LIVE_WINDOW' } } };
    const body = [
        'The payments network announced that cross-border settlement will expand to additional markets for banks, wallets and merchants across the region.',
        'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the payment network.',
        'The company described the compliance arrangements for remittance partners and fintech participants supporting the payment infrastructure.',
        'Independent reviewers will assess the operational results and published controls before the payments service expands to additional markets.',
        'Regulators will receive periodic reports on transaction monitoring, dispute handling and operational controls throughout the rollout programme.'
    ].join(' ');
    const sourcePage = `<link rel="canonical" href="${item.canonical_url}"><meta property="article:published_time" content="${item.published_at}"><article>${body}</article>`;
    const options = { env, now: NOW, historicalFrom: '2022-05-01', historicalTo: '2022-06-01', candidateId: item.id };
    const duplicate = world({ candidates: [item], audits: { [item.id]: [audit] }, sourcePage, duplicateFingerprint: true });
    const report = await syncEditorialDrafts({ ...options, fetchImpl: duplicate.fetch });
    assert.equal(report.verificationResults[0].outcome, 'DUPLICATE_PUBLISHED_CONTENT');
    assert.equal(duplicate.auditWrites.length, 0);
    assert.equal(duplicate.writes.length, 0);
    const conflict = world({ candidates: [item], audits: { [item.id]: [audit] }, sourcePage, auditConflict: true });
    await assert.rejects(syncEditorialDrafts({ ...options, fetchImpl: conflict.fetch }), /audit changed/);
    assert.equal(conflict.auditWrites.length, 0);
    assert.equal(conflict.writes.length, 0);
});

test('draft fields preserve candidate lineage without claiming a publication identity', () => {
    const item = { candidate: candidate(1, { country_code: 'US', region: 'North America' }),
        source: { source_name: 'PYMNTS' }, audit: thresholdAudit };
    const fields = buildDraftFields(item);
    assert.equal('supabaseRecordId' in fields, false);
    assert.equal(fields.legacySourceUrl['en-US'], item.candidate.canonical_url);
    assert.equal(fields.publicationDate['en-US'], item.candidate.published_at);
    assert.equal(fields.region['en-US'], 'North America');
    assert.equal(fields.countryMarket['en-US'], 'US');
    assert.ok(fields.sourceValidationSummary['en-US'].length >= 40);
    assert.match(fields.sourceValidationSummary['en-US'], new RegExp(item.candidate.id));
    assert.match(fields.sourceValidationSummary['en-US'], /STABLECOINS_DIGITAL_ASSETS/);
    for (const forbidden of ['validationStatus', 'publicationStatus', 'gpirPublicationId', 'slug'])
        assert.equal(forbidden in fields, false);
    const sourceDate = '2026-11-09T23:00:00.000Z';
    const withSourceDate = buildDraftFields({ ...item, audit: { ...thresholdAudit, source_published_at: sourceDate } });
    assert.equal(withSourceDate.publicationDate['en-US'], sourceDate);
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
    assert.equal(report.results[0].outcome, 'IDENTITY_REVIEW_REQUIRED');
    assert.equal(report.results[0].entryId, 'editor-entry');
    assert.equal(state.writes.length, 0);
});

test('an untouched draft is refreshed once; an edited or published draft is never overwritten', async () => {
    const item = candidate(1);
    const stale = { sys: { id: draftEntryId(item.id), version: 1 }, fields: { publicationTitle: { 'en-US': 'Old title' } } };
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

test('a legacy draft with the candidate UUID in the publication field is preserved for review', async () => {
    const item = candidate(1);
    for (const sys of [{ version: 1 }, { version: 3 }, { version: 4, publishedVersion: 3 }]) {
        const state = world({ candidates: [item], entries: [{
            sys: { id: draftEntryId(item.id), ...sys },
            fields: { supabaseRecordId: { 'en-US': item.id } }
        }] });
        const report = await syncEditorialDrafts({ env, fetchImpl: state.fetch, now: NOW });
        assert.equal(report.results[0].outcome, 'IDENTITY_REVIEW_REQUIRED');
        assert.equal(state.writes.length, 0);
    }
    const localized = world({ candidates: [item], entries: [{
        sys: { id: draftEntryId(item.id), version: 1 },
        fields: { supabaseRecordId: { 'fr-FR': item.id.toUpperCase() } }
    }] });
    const report = await syncEditorialDrafts({ env, fetchImpl: localized.fetch, now: NOW });
    assert.equal(report.results[0].outcome, 'IDENTITY_REVIEW_REQUIRED');
    assert.equal(localized.writes.length, 0);
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
