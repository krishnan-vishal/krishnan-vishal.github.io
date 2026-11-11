import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createRestPublicationRepository, processEditorialApprovals } from '../../supabase/functions/gpir-intelligence-publish/handler.mjs';

const endpoint = process.env.GPIR_M40_TEST_POSTGREST;
const secret = process.env.GPIR_M40_TEST_JWT_SECRET;
const enabled = Boolean(endpoint === 'http://127.0.0.1:33074' && secret && process.env.PGHOST === '127.0.0.1' &&
  process.env.PGPORT === '55468' && process.env.PGDATABASE === 'postgres');

function jwt(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

test('real PostgREST enforces publisher credential separation and all-tier editorial gates',
  { skip: enabled ? false : 'requires the isolated PostgREST and PostgreSQL test environment' }, async () => {
    const url = new URL(endpoint);
    assert.equal(url.hostname, '127.0.0.1', 'integration test must never target production');
    assert.equal(url.port, '33074', 'integration test must target the isolated PostgREST server');
    const serviceJwt = jwt('service_role');
    const publisherJwt = jwt('gpir_editorial_publisher');
    const now = Date.now();
    const publishedAt = new Date(now - 3600000).toISOString();
    const variants = [
      ['T1', 70, true, 'PASS'],
      ['T1.5', 80, true, 'PASS'],
      ['T2', 90, true, 'PASS'],
      ['T3', 40, true, 'PASS'],
      ['T3', 95, true, 'PASS'],
      ['T1', 69, false, 'PASS'],
      ['T1.5', 79, false, 'PASS'],
      ['T2', 89, false, 'PASS'],
      ['T3', 40, false, 'Pending'],
      ['T2', 90, true, 'PASS', '2023-08-15T10:00:00.000Z']
    ];
    const records = variants.map(([tier, confidence, permitted, status, historicalDate]) => {
      const id = randomUUID();
      const sourceId = `TEST-SOURCE-${id}`;
      const canonical = `https://source.example/payments/record-${id}`;
      const title = `Payment network ${id} launches cross-border settlement`;
      return { id, sourceId, canonical, title, tier, confidence, permitted, status,
        publishedAt: historicalDate || publishedAt };
    });
    const countBefore = Number(execFileSync('psql', ['-X', '-At', '-c', 'select count(*) from public.global_announcements'], { env: process.env, encoding: 'utf8' }));
    const statements = records.map(record => `
      insert into public.source_registry(source_id,source_name,official_url,trust_tier,source_status)
        values('${record.sourceId}','Fixture source','https://source.example','${record.tier}','GREEN');
      insert into public.intelligence_candidates(id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status)
        values('${record.id}','${record.sourceId}','${record.canonical}','${record.title}','${record.publishedAt}','Payments','LAUNCH',${record.confidence},'PENDING');
      insert into public.intelligence_publication_audits(candidate_id,decision,reason_code,canonical_url,validation_payload)
        values('${record.id}','REVIEW','AUTO_PUBLICATION_THRESHOLD_NOT_MET','${record.canonical}',
          '{"source_verified":true,"canonical_verified":true,"timestamp_verified":true,
            "content_verified":true,"relevance_verified":true,"summary_grounded":true}'::jsonb);`).join('\n');
    execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-c', statements], { env: process.env });

    const requests = [];
    const fetchImpl = async (input, init = {}) => {
      const target = new URL(input);
      if (target.hostname === '127.0.0.1') {
        requests.push({ path: target.pathname, auth: new Headers(init.headers).get('authorization'), body: init.body });
        target.pathname = target.pathname.replace(/^\/rest\/v1/, '');
        return fetch(target, init);
      }
      if (target.hostname === 'source.example') {
        const record = records.find(item => item.canonical === target.href);
        assert.ok(record);
        const sentences = [
          `The payments network announced initiative ${record.id} to extend instant settlement to additional cross-border corridors for banks, wallets and merchants across several markets.`,
          'The operator said participating payment providers must complete certification, fraud controls and settlement testing before connecting to the expanded real-time payment rail.',
          'Executives explained that the rollout will be phased and that card, wallet and bank transfer flows will share common reconciliation and reporting standards.',
          'The company also described governance arrangements for remittance partners, regulators and fintech participants supporting the new payment infrastructure.'
        ];
        return new Response(`<link rel="canonical" href="${record.canonical}"><meta property="article:published_time" content="${record.publishedAt}"><article>${sentences.join(' ').repeat(2)}</article>`,
          { headers: { 'content-type': 'text/html' } });
      }
      if (target.hostname === 'cdn.contentful.com') {
        const id = target.searchParams.get('fields.supabaseRecordId');
        const canonical = target.searchParams.get('fields.legacySourceUrl');
        const entryId = target.searchParams.get('sys.id');
        const selected = records.filter(record =>
          (!id || record.identity?.supabaseRecordId === id) &&
          (!canonical || record.canonical === canonical) &&
          (!entryId || entryId === `gpir-${record.tier.toLowerCase().replace('.', '-')}-${record.id}`));
        return Response.json({ total: selected.length, items: selected.map(record => ({
          sys: { id: `gpir-${record.tier.toLowerCase().replace('.', '-')}-${record.id}`, updatedAt: new Date(now).toISOString() },
          fields: {
            ...(record.identity ? { gpirPublicationId: record.identity.gpirPublicationId,
              supabaseRecordId: record.identity.supabaseRecordId, editionLineageId: record.identity.editionLineageId } : {}),
            publicationType: 'Intelligence Brief', useCasePaymentCategory: 'B2B',
            publicationTitle: record.title, legacySourceUrl: record.canonical,
            publicationStatus: 'CURRENT', validationStatus: record.status,
            sourceValidationSummary: 'Editor checked the original source and its payments-sector relevance.'
          }
        })) });
      }
      throw new Error(`Unexpected integration request: ${target.hostname}`);
    };
    const config = { url: endpoint, key: serviceJwt, publicKey: 'fixture-public-key', publisherJwt };
    const repository = createRestPublicationRepository({ config, fetchImpl,
      contentful: { spaceId: 'fixture', environment: 'master', token: 'fixture-delivery' } });
    const errors = [];
    const registration = await processEditorialApprovals({ repository, fetchImpl, now: () => now, limit: 20,
      logger: { error(...args) { errors.push(args); } } });
    assert.deepEqual(errors, []);
    assert.equal(registration.published, 0);
    for (const record of records.filter(item => item.status === 'PASS')) {
      const review = registration.outcomes.find(item => item.candidateId === record.id);
      assert.equal(review.reasonCode, 'EDITORIAL_IDENTITY_REVIEW_REQUIRED');
      assert.notEqual(review.identity.supabaseRecordId, record.id);
      record.identity = review.identity;
    }
    const result = await processEditorialApprovals({ repository, fetchImpl, now: () => now, limit: 20,
      logger: { error(...args) { errors.push(args); } } });
    assert.deepEqual(errors, []);
    assert.equal(result.entries, records.length);
    for (const record of records) {
      const outcome = result.outcomes.find(item => item.candidateId === record.id);
      assert.ok(outcome, `${record.tier} ${record.confidence} must be processed`);
      assert.equal(outcome.decision === 'PUBLISHED', record.permitted, `${record.tier} ${record.confidence}: ${outcome.reasonCode}`);
    }
    const denied = await fetch(`${endpoint}/global_announcements`, {
      method: 'POST', headers: { authorization: `Bearer ${serviceJwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ canonical_url: 'https://source.example/direct', publication_status: 'approved' })
    });
    assert.equal(denied.ok, false, 'ordinary JWT must not write announcements');
    const rpcRequests = requests.filter(request => request.path.endsWith('/rpc/gpir_publish_t3_editorial_candidate'));
    assert.equal(rpcRequests.length, variants.filter(item => item[2]).length);
    const deniedRpc = await fetch(`${endpoint}/rpc/gpir_publish_t3_editorial_candidate`, {
      method: 'POST', headers: { authorization: `Bearer ${serviceJwt}`, 'content-type': 'application/json' },
      body: rpcRequests[0].body
    });
    assert.equal(deniedRpc.ok, false, 'ordinary JWT must not invoke the editorial publisher');
    const deniedCode = (await deniedRpc.json()).code;
    assert.ok(['42501', 'PGRST202'].includes(deniedCode), `expected privilege denial, got ${deniedCode}`);
    assert.ok(rpcRequests.every(request => request.auth === `Bearer ${publisherJwt}`));
    assert.ok(requests.filter(request => !request.path.includes('/rpc/'))
      .every(request => request.auth === `Bearer ${serviceJwt}`));
    const count = execFileSync('psql', ['-X', '-At', '-c', 'select count(*) from public.global_announcements'], { env: process.env, encoding: 'utf8' });
    assert.equal(Number(count) - countBefore, variants.filter(item => item[2]).length);
    const historical = records.find(record => record.publishedAt.startsWith('2023-'));
    const archived = execFileSync('psql', ['-X', '-At', '-c',
      `select ticker_eligible||':'||to_char(published_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.global_announcements where canonical_url='${historical.canonical}'`],
    { env: process.env, encoding: 'utf8' }).trim();
    assert.equal(archived, 'false:2023-08-15 10:00:00');
    const priorAudit = execFileSync('psql', ['-X', '-At', '-c',
      `select validation_payload->'previous_audit'->>'decision' from public.intelligence_publication_audits where candidate_id='${historical.id}'`],
    { env: process.env, encoding: 'utf8' }).trim();
    assert.equal(priorAudit, 'PROCESSING');
    const repeated = await processEditorialApprovals({ repository, fetchImpl, now: () => now, limit: 20,
      logger: { error(...args) { errors.push(args); } } });
    assert.equal(repeated.published, 0, 'a repeated editorial sweep must not publish again');
    assert.deepEqual(errors, []);
    const countAfterRepeat = execFileSync('psql', ['-X', '-At', '-c', 'select count(*) from public.global_announcements'], { env: process.env, encoding: 'utf8' });
    assert.equal(Number(countAfterRepeat), Number(count), 'repeated sweeps must not create duplicates');
  });
