import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { registerEditorialDraft, runEditorialPublisher, writebackEditorialDraftIdentity } from '../../scripts/m40/run-editorial-publisher.mjs';
import { createPublicationHandler } from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';

const env = {
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'processing-fixture',
    SUPABASE_ANON_KEY: 'public-fixture',
    GPIR_EDITORIAL_PUBLISHER_JWT: 'publisher-fixture',
    CONTENTFUL_SPACE_ID: 'fixture',
    CONTENTFUL_ENVIRONMENT: 'master',
    CONTENTFUL_DELIVERY_TOKEN: 'delivery-fixture'
};

test('worker runs the existing processor and reports provider failure', async () => {
    const calls = [];
    const fetchImpl = async input => {
        const url = new URL(input);
        calls.push(url.hostname);
        if (url.hostname.endsWith('.supabase.co')) return Response.json([]);
        if (url.hostname === 'cdn.contentful.com') return Response.json({ total: 0, items: [] });
        throw new Error('UNEXPECTED_TEST_REQUEST');
    };
    const result = await runEditorialPublisher({ env, fetchImpl });
    assert.equal(result.status, 'OK');
    assert.equal(result.editorial.status, 'OK');
    assert.equal(result.editorial.entries, 0);
    assert.ok(calls.includes('cdn.contentful.com'));

    await assert.rejects(runEditorialPublisher({ env, fetchImpl: async input => {
        if (new URL(input).hostname === 'cdn.contentful.com') return new Response(null, { status: 503 });
        return Response.json([]);
    }, logger: { error() {} } }), /EDITORIAL_PUBLISHER_RUN_FAILED/);
});

test('worker rejects missing or shared publisher credentials before network access', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; throw new Error('UNEXPECTED_TEST_REQUEST'); };
    for (const publisher of ['', env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY]) {
        await assert.rejects(runEditorialPublisher({
            env: { ...env, GPIR_EDITORIAL_PUBLISHER_JWT: publisher }, fetchImpl
        }), /EDITORIAL_PUBLISHER_CONFIGURATION_REQUIRED/);
    }
    assert.equal(called, false);
});

test('the Edge entry point does not read the publisher JWT and the job is main-only', async () => {
    const index = await readFile(new URL('../../supabase/functions/gpir-intelligence-publish/index.ts', import.meta.url), 'utf8');
    const workflow = await readFile(new URL('../../.github/workflows/m40-governed-editorial-publisher.yml', import.meta.url), 'utf8');
    assert.doesNotMatch(index, /GPIR_EDITORIAL_PUBLISHER_JWT/);
    assert.match(workflow, /environment: gpir-editorial-publisher/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
});

test('ordinary Edge processing does not attempt the editorial sweep', async () => {
    const calls = [];
    const handler = createPublicationHandler({
        env: { ...env, GPIR_EDITORIAL_PUBLISHER_JWT: '' },
        fetchImpl: async input => {
            calls.push(new URL(input).hostname);
            return Response.json([]);
        }
    });
    const response = await handler(new Request('https://example.test/', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).editorial.status, 'NOT_CONFIGURED');
    assert.ok(calls.length);
    assert.ok(calls.every(host => host.endsWith('.supabase.co')));
});

test('a verified unpublished draft registers a separate identity and synchronizes without publishing', async () => {
    const candidateId = '9f9d9e2f-03e8-44a4-90a8-b66f90c3c908';
    const entryId = `gpir-t3-${candidateId}`;
    const recordId = '44444444-4444-4444-8444-444444444444';
    const sourceUrl = 'https://source.example/payments/cross-border-settlement';
    const item = { sys: { id: entryId, version: 1, updatedAt: '2026-11-10T12:00:00Z',
        contentType: { sys: { id: 'gpirPublication' } } }, fields: {
        supabaseRecordId: { 'en-US': candidateId },
        publicationType: { 'en-US': 'Intelligence Brief' },
        publicationTitle: { 'en-US': 'Payments network expands cross-border settlement' },
        legacySourceUrl: { 'en-US': sourceUrl },
        sourceValidationSummary: { 'en-US': 'Editor checked the original source and its payments-sector relevance.' }
    } };
    const identity = { supabaseRecordId: recordId, gpirPublicationId: 'VK-GPIR-P-000000000001-8',
        editionLineageId: 'VK-GPIR-LINEAGE-000001', candidateId, entryReference: `fixture/master/${entryId}`,
        policyStatus: 'INACTIVE', policyReviewState: 'OWNER_REVIEW' };
    const requests = [];
    const fetchImpl = async (input, init = {}) => {
        const url = new URL(input);
        requests.push({ url, method: init.method || 'GET', body: init.body });
        if (url.hostname === 'api.contentful.com') {
            if (url.pathname.endsWith(`/entries/${entryId}`)) {
                if (init.method === 'PUT') {
                    assert.equal(init.headers.get('x-contentful-version'), '1');
                    item.fields = JSON.parse(init.body).fields;
                    return Response.json(item);
                }
                return Response.json(item);
            }
            return Response.json({ total: 1, items: [{ sys: { id: entryId } }] });
        }
        if (url.pathname.endsWith('/intelligence_candidates')) return Response.json([{
            id: candidateId, source_id: 'SOURCE', canonical_url: sourceUrl,
            title: 'Payments network expands cross-border settlement', candidate_status: 'REVIEW'
        }]);
        if (url.pathname.endsWith('/source_registry')) return Response.json([{
            source_id: 'SOURCE', official_url: 'https://source.example', trust_tier: 'T3', source_status: 'GREEN'
        }]);
        if (url.pathname.endsWith('/rpc/gpir_register_editorial_identity')) return Response.json(identity);
        throw new Error('UNEXPECTED_TEST_REQUEST');
    };
    const result = await registerEditorialDraft({ env: { ...env, CONTENTFUL_MANAGEMENT_TOKEN: 'management-fixture' },
        entryId, fetchImpl });
    assert.equal(result.legacyCandidateId, true);
    assert.equal(result.identity.supabaseRecordId, recordId);
    const writes = requests.filter(request => request.method !== 'GET');
    assert.equal(writes.length, 2);
    assert.equal(writes[1].method, 'PUT');
    assert.equal(result.synchronization.status, 'SYNCHRONIZED');
    assert.equal(item.fields.supabaseRecordId['en-US'], recordId);
    assert.equal(item.fields.gpirPublicationId['en-US'], identity.gpirPublicationId);
    assert.equal(item.sys.publishedVersion, undefined);
    const body = JSON.parse(writes[0].body);
    assert.equal(body.p_candidate_id, candidateId);
    assert.equal(body.p_record_id, null);
    assert.equal(body.p_evidence.contentful_draft_verified, true);
    assert.equal(body.p_evidence.contentful_delivery_verified, undefined);
    assert.equal(requests.filter(request => request.url.hostname === 'api.contentful.com' && request.method === 'PUT').length, 1);

    item.sys.publishedVersion = 1;
    await assert.rejects(registerEditorialDraft({ env: { ...env, CONTENTFUL_MANAGEMENT_TOKEN: 'management-fixture' },
        entryId, fetchImpl }), /CONTENTFUL_DRAFT_NOT_UNPUBLISHED/);
    delete item.sys.publishedVersion;
    item.fields.supabaseRecordId = { 'en-US': candidateId };
    item.fields.editionLineageId = undefined;
    item.fields.gpirPublicationId = { 'en-US': identity.gpirPublicationId };
    await assert.rejects(registerEditorialDraft({ env: { ...env, CONTENTFUL_MANAGEMENT_TOKEN: 'management-fixture' },
        entryId, fetchImpl }), /EDITORIAL_DRAFT_IDENTITY_REVIEW_REQUIRED/);
    delete item.fields.gpirPublicationId;
    identity.policyStatus = 'ACTIVE';
    await assert.rejects(registerEditorialDraft({ env: { ...env, CONTENTFUL_MANAGEMENT_TOKEN: 'management-fixture' },
        entryId, fetchImpl }), /EDITORIAL_DRAFT_IDENTITY_REVIEW_REQUIRED/);
});

test('owner-authored unpublished drafts register without manufacturing a discovery candidate', async () => {
    const entryId = 'owner-payments-draft';
    const fetchImpl = async (input, init = {}) => {
        const url = new URL(input);
        if (url.hostname === 'api.contentful.com' && init.method === 'PUT') {
            const fields = JSON.parse(init.body).fields;
            assert.equal(fields.gpirPublicationId['en-US'], 'VK-GPIR-P-000000000001-8');
            return Response.json({ sys: { id: entryId, version: 2 }, fields });
        }
        if (url.hostname === 'api.contentful.com') return Response.json({
            sys: { id: entryId, version: 1, updatedAt: '2026-11-10T12:00:00Z',
                contentType: { sys: { id: 'gpirPublication' } } },
            fields: {
                publicationType: { 'en-US': 'Market Intelligence' },
                publicationTitle: { 'en-US': 'Payments network expands cross-border settlement' },
                sourceValidationSummary: { 'en-US': 'Owner checked the evidence and its payments-sector relevance.' }
            }
        });
        assert.ok(url.pathname.endsWith('/rpc/gpir_register_editorial_identity'));
        const body = JSON.parse(init.body);
        assert.equal(body.p_candidate_id, null);
        assert.equal(body.p_record_id, null);
        return Response.json({ supabaseRecordId: '44444444-4444-4444-8444-444444444444',
            gpirPublicationId: 'VK-GPIR-P-000000000001-8', editionLineageId: 'VK-GPIR-LINEAGE-000001',
            candidateId: null, entryReference: `fixture/master/${entryId}`, policyStatus: 'INACTIVE' });
    };
    const result = await registerEditorialDraft({ env: { ...env, CONTENTFUL_MANAGEMENT_TOKEN: 'management-fixture' },
        entryId, fetchImpl });
    assert.equal(result.candidateId, null);
    assert.equal(result.identity.policyStatus, 'INACTIVE');
    assert.equal(result.synchronization.status, 'SYNCHRONIZED');
});

test('blank manual registration input never falls back to the publication sweep', () => {
    const runner = new URL('../../scripts/m40/run-editorial-publisher.mjs', import.meta.url);
    const result = spawnSync(process.execPath, [runner.pathname], { encoding: 'utf8',
        env: { ...process.env, ...env, CONTENTFUL_MANAGEMENT_TOKEN: 'management-fixture',
            GPIR_EDITORIAL_OPERATION: 'register-draft', GPIR_REGISTER_DRAFT_ENTRY_ID: '   ' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CONTENTFUL_DRAFT_CONFIGURATION_REQUIRED/);
});

test('draft registration SQL remains publisher-only and creates no active policy', async () => {
    const sql = await readFile(new URL('../../supabase/migrations/20261111000000_m40_editorial_identity_registration.sql',
        import.meta.url), 'utf8');
    assert.match(sql, /case when is_draft then 'INACTIVE' else 'ACTIVE' end/);
    assert.match(sql, /if is_draft and policy_row\.status <> 'INACTIVE'/);
    assert.match(sql, /p_candidate_id is not null and p_record_id = p_candidate_id/);
    assert.match(sql, /p_candidate_id is not null and identity_row\.id = p_candidate_id/);
    for (const flag of ['source_verified', 'canonical_verified', 'timestamp_verified', 'content_verified',
        'relevance_verified', 'summary_grounded']) assert.match(sql, new RegExp(`validation_payload->>'${flag}'`));
    assert.match(sql, /from public, anon, authenticated, service_role;/);
    assert.match(sql, /to gpir_editorial_publisher;/);
});


test('writeback is idempotent and rejects identity conflict or changed draft', async () => {
    const entryId = 'owner-payments-draft';
    const contentful = { spaceId: 'fixture', environment: 'master', token: 'delivery-fixture' };
    const identity = { supabaseRecordId: '44444444-4444-4444-8444-444444444444',
        gpirPublicationId: 'VK-GPIR-P-000000000001-8', editionLineageId: 'VK-GPIR-LINEAGE-000001' };
    const item = { sys: { id: entryId, version: 3, updatedAt: '2026-11-10T12:00:00Z',
        contentType: { sys: { id: 'gpirPublication' } } }, fields: Object.fromEntries(
        Object.entries(identity).map(([key, value]) => [key, { 'en-US': value }])) };
    let writes = 0;
    const fetchImpl = async (_input, init = {}) => {
        if (init.method === 'PUT') { writes++; return Response.json(item); }
        return Response.json(item);
    };
    const args = { contentful, managementToken: 'management-fixture', entryId, identity,
        expectedUpdatedAt: item.sys.updatedAt, candidateId: null, fetchImpl };
    assert.equal((await writebackEditorialDraftIdentity(args)).status, 'ALREADY_SYNCHRONIZED');
    assert.equal(writes, 0);
    item.fields.supabaseRecordId = { 'en-US': '55555555-5555-4555-8555-555555555555' };
    await assert.rejects(writebackEditorialDraftIdentity(args), /CONTENTFUL_WRITEBACK_IDENTITY_CONFLICT/);
    item.fields.supabaseRecordId = { 'en-US': identity.supabaseRecordId };
    item.sys.updatedAt = '2026-11-11T12:00:00Z';
    await assert.rejects(writebackEditorialDraftIdentity(args), /CONTENTFUL_WRITEBACK_DRAFT_CHANGED/);
    assert.equal(writes, 0);
});
