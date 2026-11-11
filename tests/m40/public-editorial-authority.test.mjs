import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { classifyEditorialPublication } from '../../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { authorizedEditorialCandidates, loadPublicEditorialAuthority, normalizeOwnerEditorialPublications }
  from '../../supabase/functions/_shared/gpir-public-editorial.mjs';

const env = { CONTENTFUL_SPACE_ID: 'space', CONTENTFUL_ENVIRONMENT: 'master',
  CONTENTFUL_DELIVERY_TOKEN: 'fixture-delivery' };
const identity = { record_id: 'publication-record', publication_id: 'publication-id',
  lineage_id: 'lineage-id', candidate_id: 'candidate-id', entry_reference: 'space/master/entry-id',
  publication_type: 'Intelligence Brief' };
const fields = { supabaseRecordId: identity.record_id, gpirPublicationId: identity.publication_id,
  editionLineageId: identity.lineage_id, publicationStatus: 'CURRENT', validationStatus: 'PASS',
  publicationType: 'Intelligence Brief', useCasePaymentCategory: 'B2B',
  publicationTitle: 'Payments network expands cross-border settlement',
  sourceValidationSummary: 'Editor checked the original source and its payments-sector relevance.',
  legacySourceUrl: 'https://source.example/article' };
const item = { sys: { id: 'entry-id', updatedAt: '2026-11-10T12:00:00Z' }, fields };

function provider({ entries = [item], authorizations = [identity], failure = null } = {}) {
  return async input => {
    const url = new URL(input);
    if (failure === url.hostname) return new Response('unavailable', { status: 503 });
    if (url.hostname === 'cdn.contentful.com') return Response.json({ total: entries.length, items: entries });
    if (url.hostname === 'supabase.example') return Response.json(authorizations);
    throw new Error('Unexpected fixture provider');
  };
}
const load = fetchImpl => loadPublicEditorialAuthority({ env, supabaseUrl: 'https://supabase.example',
  serviceKey: 'fixture-service', fetchImpl });

test('public authority requires a unique, published, approved CMS and policy identity', async () => {
  assert.equal((await load(provider())).length, 1);
  assert.deepEqual(await load(provider({ entries: [] })), []);
  assert.deepEqual(await load(provider({ authorizations: [] })), []);
  assert.deepEqual(await load(provider({ entries: [{ ...item, fields: { ...fields, validationStatus: 'Pending' } }] })), []);
  assert.deepEqual(await load(provider({ entries: [{ ...item, fields: { ...fields, validationStatus: 'pass' } }] })), []);
  assert.deepEqual(await load(provider({ entries: [{ ...item, fields: { ...fields, publicationStatus: 'current' } }] })), []);
  assert.deepEqual(await load(provider({ entries: [{ ...item, fields: { ...fields, editionLineageId: 'other' } }] })), []);
  assert.deepEqual(await load(provider({ authorizations: [{ ...identity, publication_type: 'Research Publication' }] })), []);
  assert.deepEqual(await load(provider({ authorizations: [{ ...identity, publication_type: null }] })), []);
  assert.deepEqual(await load(provider({ entries: [item, { ...item, sys: { ...item.sys, id: 'second-entry' } }] })), []);
  await assert.rejects(load(provider({ failure: 'cdn.contentful.com' })), /CONTENTFUL_HTTP_503/);
  await assert.rejects(load(provider({ failure: 'supabase.example' })), /PUBLIC_AUTHORITY_HTTP_503/);
});

test('candidate and corroboration require matching published audit, CMS identity, source and URL', () => {
  const authority = [{ row: identity, entry: { entryId: 'entry-id', fields } }];
  const candidates = [{ id: identity.candidate_id, source_id: 'source', title: fields.publicationTitle,
    canonical_url: fields.legacySourceUrl }];
  const sources = [{ source_id: 'source', source_status: 'GREEN', official_url: 'https://source.example' }];
  const audit = { candidate_id: identity.candidate_id, decision: 'PUBLISHED', validation_payload: {
    source_verified: true, canonical_verified: true, timestamp_verified: true, content_verified: true,
    relevance_verified: true, summary_grounded: true, editorial_verified: true,
    editorial_entry_reference: identity.entry_reference, editorial_entry_id: 'entry-id',
    editorial_publication_id: identity.publication_id, editorial_supabase_record_id: identity.record_id,
    editorial_source_url: fields.legacySourceUrl } };
  const accepted = audits => authorizedEditorialCandidates({ authority, candidates, audits, sources });
  assert.deepEqual([...accepted([audit])], [identity.candidate_id]);
  assert.deepEqual([...accepted([{ ...audit, validation_payload: { ...audit.validation_payload, editorial_verified: false } }])], []);
  assert.deepEqual([...accepted([{ ...audit, validation_payload: { ...audit.validation_payload, relevance_verified: false } }])], []);
  assert.deepEqual([...accepted([{ ...audit, validation_payload: { ...audit.validation_payload,
    editorial_entry_reference: 'space/master/other' } }])], []);
  assert.deepEqual([...authorizedEditorialCandidates({ authority: [...authority, ...authority], candidates,
    audits: [audit], sources })], []);
  for (const override of [
    { publicationType: 'Research Publication' },
    { publicationTitle: 'USD/JPY exchange rates and payment settlement' },
    { useCasePaymentCategory: '' }
  ]) {
    const changed = [{ ...authority[0], entry: { ...authority[0].entry, fields: { ...fields, ...override } } }];
    assert.deepEqual([...authorizedEditorialCandidates({ authority: changed, candidates, audits: [audit], sources })], []);
  }
});

test('classification uses actual CMS types, payment use cases and independently relevant editorial text', () => {
  for (const publicationType of ['Intelligence Brief', 'Regulatory Intelligence', 'Market Intelligence'])
    for (const useCasePaymentCategory of [undefined, 'C2C', 'B2B', 'B2C', 'C2B', 'Multi-use-case', 'Not Applicable'])
      assert.equal(classifyEditorialPublication({ ...fields, publicationType, useCasePaymentCategory }), 'EXECUTIVE');
  for (const publicationType of ['Research Publication', 'Research Chapter', 'Methodology',
    'Country Intelligence', 'Regional Directory', 'Dashboard'])
    assert.equal(classifyEditorialPublication({ ...fields, publicationType }), 'RESEARCH');
  assert.equal(classifyEditorialPublication({ ...fields, publicationTitle: 'USD/JPY exchange rates and payment settlement' }), 'FX');
  assert.equal(classifyEditorialPublication({ ...fields, canonicalUrlCandidate: '/fx/usd-jpy/' }), 'FX');
  assert.equal(classifyEditorialPublication({ ...fields, publicationType: 'Intelligence' }), 'REVIEW');
  assert.equal(classifyEditorialPublication({ ...fields, useCasePaymentCategory: 'Payments' }), 'REVIEW');
  assert.equal(classifyEditorialPublication({ ...fields, useCasePaymentCategory: 'FX Intelligence' }), 'REVIEW');
  assert.equal(classifyEditorialPublication({ ...fields, publicationTitle: 'Unspecified business development' }), 'REVIEW');
  assert.equal(classifyEditorialPublication(fields, { title: 'Unspecified business development' }), 'REVIEW');
  assert.equal(classifyEditorialPublication(fields, { title: 'Currency exchange rates affect payment settlement' }), 'FX');
});

test('owner records enter executive history only with explicit intelligence classification', () => {
  const owner = { row: { ...identity, candidate_id: null }, entry: { entryId: 'entry-id', fields: {
    ...fields, publicationTitle: 'Payments network partnership launches',
    executiveSummary: 'An editor-verified payments network partnership expands settlement coverage.',
    publicationDate: '2023-08-15T10:00:00Z', canonicalUrlCandidate: '/payments-partnership/'
  } } };
  const normalize = item => normalizeOwnerEditorialPublications({ authority: [item],
    now: Date.parse('2026-11-11T00:00:00Z'), windowDays: null });
  const records = normalize(owner);
  assert.equal(records.length, 1);
  assert.equal(records[0].publishedAt, '2023-08-15T10:00:00.000Z');
  assert.equal(records[0].tickerEligible, false);
  for (const override of [{ publicationType: 'Research Publication' },
    { publicationTitle: 'USD/JPY exchange rates and payment settlement' }, { useCasePaymentCategory: '' }]) {
    const entry = { ...owner.entry, fields: { ...owner.entry.fields, ...override } };
    assert.deepEqual(normalize({ ...owner, entry }), []);
  }
});

test('existing Global Alerts route enforces CMS classification, verified evidence and source-time expiry', async () => {
  const candidateId = '11111111-1111-4111-8111-111111111111';
  const announcementId = '22222222-2222-4222-8222-222222222222';
  const row = { ...identity, candidate_id: candidateId };
  const source = { source_id: 'source', source_name: 'Official', source_status: 'GREEN',
    official_url: 'https://source.example' };
  const title = 'Payments network expands cross-border settlement';
  const summary = 'The approved payment network expands cross-border settlement for banks and providers.';
  const timestamp = new Date(Date.now() - 2 * 3600000).toISOString();
  const candidate = { id: candidateId, source_id: source.source_id, title,
    canonical_url: fields.legacySourceUrl, published_at: timestamp };
  const announcement = { id: announcementId, source_id: source.source_id, title,
    summary_narration: summary, canonical_url: candidate.canonical_url, published_at: timestamp,
    topic_headers: ['Payments'], publication_status: 'approved', ticker_eligible: true };
  const audit = { candidate_id: candidateId, announcement_id: announcementId, decision: 'PUBLISHED',
    validation_payload: { source_verified: true, canonical_verified: true, timestamp_verified: true,
      content_verified: true, relevance_verified: true, summary_grounded: true, editorial_verified: true,
      editorial_entry_reference: row.entry_reference, editorial_entry_id: item.sys.id,
      editorial_publication_id: row.publication_id, editorial_supabase_record_id: row.record_id,
      editorial_source_url: candidate.canonical_url } };
  const state = { row, entry: item, candidate, announcement, audit };
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  const originalDateNow = Date.now;
  const fixedNow = originalDateNow();
  Date.now = () => fixedNow;
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname === 'cdn.contentful.com') return Response.json({ total: 1, items: [state.entry] });
    if (url.pathname.endsWith('/rpc/gpir_public_editorial_authorizations')) return Response.json([state.row]);
    if (url.pathname.endsWith('/global_announcements')) return Response.json([state.announcement]);
    if (url.pathname.endsWith('/source_registry')) return Response.json([source]);
    if (url.pathname.endsWith('/intelligence_publication_audits')) return Response.json([state.audit]);
    if (url.pathname.endsWith('/intelligence_candidates')) return Response.json([state.candidate]);
    throw new Error(`Unexpected alert fixture request: ${url.pathname}`);
  };
  let handler;
  globalThis.Deno = { env: { get: name => ({ ...env, SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' })[name] }, serve: value => { handler = value; } };
  try {
    let sourceCode = await readFile(new URL('../../supabase/functions/gpir-public-alerts/index.ts', import.meta.url), 'utf8');
    sourceCode = sourceCode.replace(/^import "jsr:[^"]+";\n/m, '');
    sourceCode = sourceCode.replaceAll('"../_shared/', `"${new URL('../../supabase/functions/_shared/', import.meta.url).href}`);
    const compiled = stripTypeScriptTypes(sourceCode, { mode: 'transform' });
    await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    const alerts = async () => {
      const response = await handler(new Request('https://example.test/'));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.windowHours, 12);
      return body.alerts;
    };
    assert.equal((await alerts()).length, 1);
    for (const override of [{ publicationType: 'Research Publication' },
      { publicationTitle: 'USD/JPY exchange rates and payment settlement' },
      { validationStatus: 'Pending' }, { useCasePaymentCategory: 'Payments' }]) {
      state.entry = { ...item, fields: { ...fields, ...override } };
      state.row = { ...row, publication_type: override.publicationType || row.publication_type };
      assert.deepEqual(await alerts(), [], JSON.stringify(override));
    }
    state.entry = item;
    state.row = { ...row, publication_type: 'Research Publication' };
    assert.deepEqual(await alerts(), []);
    state.row = row;
    state.audit = { ...audit, validation_payload: { ...audit.validation_payload, relevance_verified: false } };
    assert.deepEqual(await alerts(), []);
    state.audit = audit;
    state.candidate = { ...candidate, title: 'USD/JPY exchange rates and payment settlement' };
    assert.deepEqual(await alerts(), []);
    state.candidate = candidate;
    const boundary = new Date(fixedNow - 12 * 3600000).toISOString();
    state.candidate = { ...candidate, published_at: boundary };
    state.announcement = { ...announcement, published_at: boundary };
    assert.equal((await alerts()).length, 1);
    const older = new Date(fixedNow - 12 * 3600000 - 1).toISOString();
    state.candidate = { ...candidate, published_at: older };
    state.announcement = { ...announcement, published_at: older };
    assert.deepEqual(await alerts(), []);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
    Date.now = originalDateNow;
  }
});
