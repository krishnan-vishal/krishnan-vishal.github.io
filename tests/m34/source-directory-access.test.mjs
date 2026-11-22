import assert from 'node:assert/strict';
import { test } from 'node:test';

test('fintech directory enforces preview and full responses for each reader state', async t => {
    const projectUrl = 'https://qlnvhfapctcpzqyuhhth.supabase.co';
    const readerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const qaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const record = {
        name: 'Example source', regions: ['GCC'], category: 'Association', approved: true,
        sets: ['Payments'], summary: 'Restricted summary',
        site: 'https://example.org', target: 'https://example.org/news'
    };
    let handler;
    globalThis.Deno = {
        env: { get: name => ({
            SUPABASE_URL: projectUrl, SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
            GPIR_SOURCE_DIRECTORY_QA_READER_ID: qaId
        })[name] },
        serve: callback => { handler = callback; }
    };
    const originalFetch = globalThis.fetch;
    t.after(() => {
        delete globalThis.Deno;
        globalThis.fetch = originalFetch;
    });
    await import('../../supabase/functions/gpir-source-directory/index.ts');

    for (const [reader, decision] of [
        ['guest', 'UNAUTHENTICATED'], ['unpaid', 'DENY'], ['subscriber', 'ALLOW'], ['qa', 'ALLOW']
    ]) {
        await t.test(reader, async () => {
            let subscriptionReads = 0;
            globalThis.fetch = async (input, { headers }) => {
                const { pathname, searchParams } = new URL(input);
                if (pathname === '/auth/v1/user') {
                    assert.equal(headers.get('authorization'), 'Bearer ' + reader);
                    return Response.json({
                        id: reader === 'qa' ? qaId : readerId,
                        email_confirmed_at: '2026-11-01T00:00:00Z'
                    });
                }
                if (pathname.endsWith('/gpir_paypal_subscriptions')) {
                    subscriptionReads++;
                    assert.equal(searchParams.get('user_id'), 'eq.' + readerId);
                    assert.equal(searchParams.get('environment'), 'eq.PRODUCTION');
                    return Response.json(reader === 'subscriber' ? [{ status: 'ACTIVE' }] : []);
                }
                assert.equal(pathname, '/rest/v1/gpir_fintech_source_catalog');
                return Response.json([{ record }]);
            };
            const response = await handler(new Request(projectUrl + '/functions/v1/gpir-source-directory?catalog=fintech', {
                headers: reader === 'guest' ? {} : { Authorization: 'Bearer ' + reader }
            }));
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'private, no-store');
            const body = await response.json();
            assert.equal(body.access, decision);
            assert.equal(subscriptionReads, Number(reader === 'subscriber' || reader === 'unpaid'));
            assert.equal(body.totals.sources, 1);
            const { summary, site, target, ...preview } = record;
            assert.deepEqual(body.cards, [decision === 'ALLOW' ? record : preview]);
        });
    }
});
