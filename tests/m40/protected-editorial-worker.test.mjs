import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runEditorialPublisher } from '../../scripts/m40/run-editorial-publisher.mjs';
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
