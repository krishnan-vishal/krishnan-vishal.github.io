import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEditorialPublication } from '../../supabase/functions/_shared/gpir-contentful-editorial.mjs';
import { authorizedEditorialCandidates, loadPublicEditorialAuthority, normalizeOwnerEditorialPublications }
  from '../../supabase/functions/_shared/gpir-public-editorial.mjs';

const env = { CONTENTFUL_SPACE_ID: 'space', CONTENTFUL_ENVIRONMENT: 'master',
  CONTENTFUL_DELIVERY_TOKEN: 'fixture-delivery' };
const identity = { record_id: 'publication-record', publication_id: 'publication-id',
  lineage_id: 'lineage-id', candidate_id: 'candidate-id', entry_reference: 'space/master/entry-id',
  publication_type: 'Intelligence' };
const fields = { supabaseRecordId: identity.record_id, gpirPublicationId: identity.publication_id,
  editionLineageId: identity.lineage_id, publicationStatus: 'CURRENT', validationStatus: 'PASS',
  publicationType: 'Intelligence', useCasePaymentCategory: 'Payments',
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
  assert.deepEqual(await load(provider({ entries: [{ ...item, fields: { ...fields, editionLineageId: 'other' } }] })), []);
  assert.deepEqual(await load(provider({ authorizations: [{ ...identity, publication_type: 'Research Publication' }] })), []);
  assert.deepEqual(await load(provider({ authorizations: [{ ...identity, publication_type: null }] })), []);
  assert.deepEqual(await load(provider({ entries: [item, { ...item, sys: { ...item.sys, id: 'second-entry' } }] })), []);
  await assert.rejects(load(provider({ failure: 'cdn.contentful.com' })), /CONTENTFUL_HTTP_503/);
  await assert.rejects(load(provider({ failure: 'supabase.example' })), /PUBLIC_AUTHORITY_HTTP_503/);
});

test('candidate and corroboration require matching published audit, CMS identity, source and URL', () => {
  const authority = [{ row: identity, entry: { entryId: 'entry-id', fields } }];
  const candidates = [{ id: identity.candidate_id, source_id: 'source', canonical_url: fields.legacySourceUrl }];
  const sources = [{ source_id: 'source', source_status: 'GREEN', official_url: 'https://source.example' }];
  const audit = { candidate_id: identity.candidate_id, decision: 'PUBLISHED', validation_payload: {
    editorial_verified: true, editorial_entry_reference: identity.entry_reference, editorial_entry_id: 'entry-id',
    editorial_publication_id: identity.publication_id, editorial_supabase_record_id: identity.record_id,
    editorial_source_url: fields.legacySourceUrl } };
  const accepted = audits => authorizedEditorialCandidates({ authority, candidates, audits, sources });
  assert.deepEqual([...accepted([audit])], [identity.candidate_id]);
  assert.deepEqual([...accepted([{ ...audit, validation_payload: { ...audit.validation_payload, editorial_verified: false } }])], []);
  assert.deepEqual([...accepted([{ ...audit, validation_payload: { ...audit.validation_payload,
    editorial_entry_reference: 'space/master/other' } }])], []);
  assert.deepEqual([...authorizedEditorialCandidates({ authority: [...authority, ...authority], candidates,
    audits: [audit], sources })], []);
  for (const override of [
    { publicationType: 'Research Publication' },
    { useCasePaymentCategory: 'FX Intelligence; Cross-Border Payments' },
    { useCasePaymentCategory: '' }
  ]) {
    const changed = [{ ...authority[0], entry: { ...authority[0].entry, fields: { ...fields, ...override } } }];
    assert.deepEqual([...authorizedEditorialCandidates({ authority: changed, candidates, audits: [audit], sources })], []);
  }
});

test('approved classification uses explicit existing type and topic metadata, not keywords', () => {
  for (const category of ['Payments', 'Regulatory Actions', 'Cross-Border Payments',
    'Payment Infrastructure', 'Remittances', 'Deals & Partnerships', 'regulatory']) {
    assert.equal(classifyEditorialPublication({ publicationType: 'Intelligence',
      useCasePaymentCategory: category }), 'EXECUTIVE', category);
  }
  assert.equal(classifyEditorialPublication({ publicationType: 'Research Publication',
    useCasePaymentCategory: 'Payments' }), 'RESEARCH');
  assert.equal(classifyEditorialPublication({ publicationType: 'Regional Directory' }), 'RESEARCH');
  assert.equal(classifyEditorialPublication({ publicationType: 'Research Publication',
    useCasePaymentCategory: 'FX Intelligence; Cross-Border Payments' }), 'FX');
  assert.equal(classifyEditorialPublication({ publicationType: 'Intelligence',
    useCasePaymentCategory: 'FX Intelligence; Cross-Border Payments' }), 'FX');
  assert.equal(classifyEditorialPublication({ publicationType: 'Intelligence' }), 'REVIEW');
  assert.equal(classifyEditorialPublication({ publicationType: 'Intelligence',
    useCasePaymentCategory: 'Payments; unclassified topic' }), 'REVIEW');
  assert.equal(classifyEditorialPublication({ publicationType: 'Other',
    publicationTitle: 'A new payments partnership', useCasePaymentCategory: 'Payments' }), 'REVIEW');
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
    { useCasePaymentCategory: 'FX Intelligence' }, { useCasePaymentCategory: '' }]) {
    const entry = { ...owner.entry, fields: { ...owner.entry.fields, ...override } };
    assert.deepEqual(normalize({ ...owner, entry }), []);
  }
});
