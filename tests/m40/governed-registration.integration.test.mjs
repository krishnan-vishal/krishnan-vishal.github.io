import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { createRestPublicationRepository, processEditorialApprovals }
  from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';
import { createPublicIntelligenceHandler }
  from '../../supabase/functions/gpir-public-intelligence/handler.mjs';
import { createProtectedPublicationHandler }
  from '../../supabase/functions/gpir-protected-publication/handler.mjs';

const endpoint = process.env.GPIR_M40_TEST_POSTGREST;
const secret = process.env.GPIR_M40_TEST_JWT_SECRET;
const enabled = endpoint === 'http://127.0.0.1:33074' &&
  process.env.PGHOST === '127.0.0.1' && process.env.PGPORT === '55468' &&
  process.env.PGDATABASE === 'postgres' && Boolean(secret);
const token = (role, sub) => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, sub, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};
const sql = command => execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', command],
  { env: process.env, encoding: 'utf8' }).trim();

test('isolated governed registration, publication and reader acceptance',
  { skip: enabled ? false : 'requires the dedicated local PostgreSQL and PostgREST fixture' }, async () => {
    const now = Date.now();
    const liveDate = new Date(now - 3600000).toISOString();
    const historicalDate = '2023-08-15T10:00:00.000Z';
    const serviceJwt = token('service_role');
    const publisherJwt = token('gpir_editorial_publisher');
    const readerId = randomUUID();
    const nonce = randomUUID();
    const sourceId = `INTEGRATION-${nonce}`;
    const readerJwt = token('authenticated', readerId);
    const candidates = [
      { id: randomUUID(), url: `https://source.example/payments/${nonce}/live`, date: liveDate, status: 'PASS' },
      { id: randomUUID(), url: `https://source.example/payments/${nonce}/history`, date: historicalDate, status: 'PASS' },
      { id: randomUUID(), url: `https://source.example/payments/${nonce}/unapproved`, date: liveDate, status: 'Pending' }
    ];
    const evidence = JSON.stringify({ source_verified: true, canonical_verified: true,
      timestamp_verified: true, content_verified: true, relevance_verified: true, summary_grounded: true });
    sql(`insert into public.source_registry(source_id,source_name,official_url,trust_tier,source_status)
      values('${sourceId}','Fixture source','https://source.example','T2','GREEN');
      ${candidates.map((item, index) => `
      insert into public.intelligence_candidates(id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status)
      values('${item.id}','${sourceId}','${item.url}','Cross-border payment initiative ${nonce} number ${index + 1}',
        '${item.date}','Payments','LAUNCH',90,'REVIEW');
      insert into public.intelligence_publication_audits(candidate_id,decision,reason_code,canonical_url,validation_payload)
      values('${item.id}','REVIEW','AUTO_PUBLICATION_THRESHOLD_NOT_MET','${item.url}','${evidence}'::jsonb);`).join('')}`);
    const ownerIdentity = type => {
      const row = JSON.parse(sql(`select to_jsonb(p) from public.gpir_identity_resolve(
        'gpir:intake:publication:owner:${type}:${nonce}', 'Research Publication','isolated-acceptance') p`));
      return { id: row.id, publication: row.gpir_publication_id,
        lineage: sql(`select edition_lineage_id from public.gpir_identity_lineages where id='${row.lineage_id}'`) };
    };
    const owner = ownerIdentity('public');
    const restricted = ownerIdentity('restricted');
    sql(`insert into public.gpir_publication_access_policies
      (supabase_record_id,publication_id,access_class,classification_source,review_state)
      values ('${owner.id}','${owner.publication}','PUBLIC','isolated-editorial-fixture','EVIDENCED'),
             ('${restricted.id}','${restricted.publication}','AUTHENTICATED','isolated-editorial-fixture','EVIDENCED')`);
    const entryFor = item => ({
      sys: { id: `gpir-t2-${item.id}`, updatedAt: new Date(now).toISOString() },
      fields: { publicationType: 'Intelligence', publicationStatus: 'CURRENT',
        validationStatus: item.status, legacySourceUrl: item.url,
        sourceValidationSummary: 'Editor checked the original source and its payments-sector relevance.' }
    });
    const ownerEntry = (identity, id) => ({
      sys: { id, updatedAt: new Date(now).toISOString() },
      fields: { gpirPublicationId: identity.publication, supabaseRecordId: identity.id,
        editionLineageId: identity.lineage, publicationType: 'Research Publication',
        publicationStatus: 'CURRENT', validationStatus: 'PASS',
        sourceValidationSummary: 'Owner checked the evidence and its payments-sector relevance.',
        publicationTitle: 'Owner authored payments sector research',
        executiveSummary: 'This owner-authored publication describes a verified payments-sector development.',
        publicationDate: historicalDate, canonicalUrlCandidate: `/pages/research/${id}/` }
    });
    const entries = [...candidates.map(entryFor), ownerEntry(owner, `owner-public-${nonce}`),
      ownerEntry(restricted, `owner-restricted-${nonce}`)];
    const requests = [];
    const originalFetch = globalThis.fetch;
    const fetchImpl = async (input, init = {}) => {
      const target = new URL(input);
      if (target.hostname === 'abcdefghijklmnopqrst.supabase.co' || target.hostname === '127.0.0.1') {
        if (target.pathname === '/auth/v1/user') return Response.json({ id: readerId });
        const path = target.pathname.replace(/^\/rest\/v1/, '');
        requests.push(path);
        return originalFetch(`${endpoint}${path}${target.search}`, init);
      }
      if (target.hostname === 'cdn.contentful.com') {
        let selected = entries;
        for (const key of ['sys.id', 'fields.supabaseRecordId', 'fields.legacySourceUrl', 'fields.gpirPublicationId']) {
          if (!target.searchParams.has(key)) continue;
          const value = target.searchParams.get(key);
          selected = selected.filter(entry => key === 'sys.id' ? entry.sys.id === value : entry.fields[key.slice(7)] === value);
        }
        const total = selected.length;
        const skip = Number(target.searchParams.get('skip') || 0);
        const limit = Number(target.searchParams.get('limit') || 100);
        return Response.json({ total, items: selected.slice(skip, skip + limit) });
      }
      if (target.hostname === 'source.example') {
        const item = candidates.find(candidate => candidate.url === target.href);
        assert.ok(item);
        const article = [
          `The payments network announced initiative ${item.id} to extend instant settlement to additional cross-border corridors for banks, wallets and merchants across several markets.`,
          'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the expanded real-time payment rail.',
          'Executives explained that the rollout will be phased and that card, wallet and bank transfer flows will share common reconciliation and reporting standards.',
          'The company also described governance arrangements for remittance partners, regulators and fintech participants supporting the new payment infrastructure.'
        ].join(' ');
        return new Response(`<link rel="canonical" href="${item.url}"><meta property="article:published_time" content="${item.date}"><article>${article}</article>`,
          { headers: { 'content-type': 'text/html' } });
      }
      throw new Error(`Unexpected integration target ${target.hostname}`);
    };
    const config = { url: 'https://abcdefghijklmnopqrst.supabase.co', key: serviceJwt,
      publicKey: 'fixture-public', publisherJwt };
    const contentful = { spaceId: 'space', environment: 'master', token: 'fixture-delivery' };
    const repository = createRestPublicationRepository({ config, fetchImpl, contentful });
    const logger = { error(message, details) {
      throw new Error(`publisher failure: ${message}: ${details?.error?.message || details?.message || String(details)}`);
    } };
    const first = await processEditorialApprovals({ repository, fetchImpl, now: () => now, limit: 20, logger });
    assert.equal(first.published, 0);
    for (const item of candidates.slice(0, 2)) {
      const review = first.outcomes.find(outcome => outcome.candidateId === item.id);
      assert.equal(review.reasonCode, 'EDITORIAL_IDENTITY_REVIEW_REQUIRED');
      assert.notEqual(review.identity.supabaseRecordId, item.id);
      Object.assign(entries.find(entry => entry.sys.id === `gpir-t2-${item.id}`).fields, {
        supabaseRecordId: review.identity.supabaseRecordId, gpirPublicationId: review.identity.gpirPublicationId,
        editionLineageId: review.identity.editionLineageId
      });
      sql(`update public.gpir_publication_access_policies set access_class='PUBLIC',
        classification_source='isolated-editorial-fixture',review_state='EVIDENCED'
        where supabase_record_id='${review.identity.supabaseRecordId}'`);
    }
    assert.equal(first.outcomes.find(outcome => outcome.candidateId === candidates[2].id).decision, 'REVIEW');
    const second = await processEditorialApprovals({ repository, fetchImpl, now: () => now, limit: 20, logger });
    assert.equal(second.published, 2, JSON.stringify(second));

    const env = { SUPABASE_URL: config.url, SUPABASE_SERVICE_ROLE_KEY: serviceJwt,
      CONTENTFUL_SPACE_ID: 'space', CONTENTFUL_ENVIRONMENT: 'master', CONTENTFUL_DELIVERY_TOKEN: 'fixture-delivery' };
    const reader = createPublicIntelligenceHandler({ env, fetchImpl, now: () => now });
    const archiveResponse = await reader(new Request('https://example.test/?scope=history'));
    assert.equal(archiveResponse.status, 200);
    const archive = (await archiveResponse.json()).records;
    assert.equal(archive.length, 3, JSON.stringify(archive));
    assert.ok(archive.some(record => record.canonicalUrl === candidates[1].url && record.publishedAt === historicalDate));
    assert.ok(archive.some(record => record.id === owner.id));
    assert.ok(!archive.some(record => record.id === restricted.id || record.canonicalUrl === candidates[2].url));
    const relay = await (await reader(new Request('https://example.test/?view=relay'))).json();
    assert.equal(relay.items.length, 1);
    assert.equal(relay.items[0].publishedAt, liveDate);

    const protectedReader = createProtectedPublicationHandler({ env: { ...env, GPIR_SUPABASE_PUBLISHABLE_KEY: 'fixture-public' }, fetchImpl });
    const input = JSON.stringify({ publicationId: restricted.publication, supabaseRecordId: restricted.id });
    assert.equal((await protectedReader(new Request('https://example.test/', { method: 'POST', body: input }))).status, 401);
    const authenticated = await protectedReader(new Request('https://example.test/', {
      method: 'POST', headers: { authorization: `Bearer ${readerJwt}` }, body: input
    }));
    assert.equal(authenticated.status, 200);
    assert.equal((await authenticated.json()).publication.identity, restricted.publication);

    const sourcePath = new URL('../../supabase/functions/gpir-public-alerts/index.ts', import.meta.url);
    let source = await readFile(sourcePath, 'utf8');
    source = source.replace(/^import "jsr:[^"]+";\n/m, '');
    source = source.replaceAll('"../_shared/', `"${new URL('../../supabase/functions/_shared/', import.meta.url).href}`);
    const compiled = stripTypeScriptTypes(source, { mode: 'transform' });
    let alertsHandler;
    const oldDeno = globalThis.Deno;
    globalThis.Deno = { env: { get: name => ({ ...env, SUPABASE_SERVICE_ROLE_KEY: serviceJwt })[name] },
      serve: handler => { alertsHandler = handler; } };
    globalThis.fetch = fetchImpl;
    try {
      await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
      const result = await alertsHandler(new Request('https://example.test/'));
      assert.equal(result.status, 200);
      const alertBody = await result.json();
      assert.equal(alertBody.windowHours, 12);
      assert.deepEqual(alertBody.alerts.map(item => item.sourceUrl), [candidates[0].url]);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Deno = oldDeno;
    }
    assert.ok(requests.includes('/rpc/gpir_register_editorial_identity'));
    assert.ok(requests.includes('/rpc/gpir_publish_t3_editorial_candidate'));
    assert.ok(requests.includes('/rpc/resolve_publication_entitlement'));
  });
