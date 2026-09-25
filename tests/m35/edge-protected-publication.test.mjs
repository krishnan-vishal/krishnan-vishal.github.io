import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createProtectedPublicationHandler } from '../../supabase/functions/gpir-protected-publication/handler.mjs';
import { requestProtectedPublication } from '../../assets/js/gpir-protected-publication.mjs';

const require = createRequire(import.meta.url);
const { adaptPublication } = require('../../scripts/m35/contentful-publication-adapter');
const { renderPublicationPage } = require('../../scripts/m35/contentful-publication-renderer');
const { buildPublicationSite } = require('../../scripts/m35/render-contentful-publications');

const publicationId = 'VK-GPIR-P-000000000001-8';
const supabaseRecordId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const env = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  GPIR_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  CONTENTFUL_SPACE_ID: 'space-fixture',
  CONTENTFUL_ENVIRONMENT: 'master',
  CONTENTFUL_DELIVERY_TOKEN: 'contentful-server-secret'
});

function contentfulEntry(overrides = {}) {
  return { sys: { id: 'entry-1', contentType: { sys: { id: 'gpirPublication' } } }, fields: {
    gpirPublicationId: publicationId, supabaseRecordId,
    publicationTitle: 'Protected publication', publicationType: 'Research Chapter',
    executiveSummary: 'Protected summary',
    editorialBody: { nodeType: 'document', content: [{ nodeType: 'paragraph', content: [
      { nodeType: 'text', value: 'Protected body fixture.', marks: [] }
    ] }] }, sourceValidationSummary: 'Governed provenance.', ...overrides
  } };
}

function fetchPlan(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/auth/v1/user')) {
      if (options.authThrow) throw new Error('auth unavailable');
      return new Response(options.authBody === undefined ? JSON.stringify({ id: userId }) : options.authBody,
        { status: options.authStatus ?? 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('/rpc/resolve_publication_entitlement')) {
      if (options.rpcThrow) throw new Error('rpc unavailable');
      const body = options.rpcBody === undefined ? [{ decision: options.decision || 'ALLOW' }] : options.rpcBody;
      return new Response(typeof body === 'string' ? body : JSON.stringify(body),
        { status: options.rpcStatus ?? 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('cdn.contentful.com')) {
      if (options.contentfulThrow) throw new Error('content unavailable');
      const body = options.contentfulBody || { items: options.items || [contentfulEntry()] };
      return new Response(JSON.stringify(body), { status: options.contentfulStatus ?? 200,
        headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  return { fetchImpl, calls };
}

function edgeRequest({ token = 'fixture.session.token', origin = 'https://fintechoisis.com',
  body = { publicationId, supabaseRecordId }, method = 'POST' } = {}) {
  const headers = { origin, 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request('https://project.supabase.co/functions/v1/gpir-protected-publication', {
    method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

async function invoke(options = {}, requestOptions = {}) {
  const plan = fetchPlan(options);
  const handler = createProtectedPublicationHandler({ env, fetchImpl: plan.fetchImpl });
  const response = await handler(edgeRequest(requestOptions));
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null, calls: plan.calls };
}

test('01 missing bearer returns no protected body', async () => {
  const result = await invoke({}, { token: null });
  assert.equal(result.response.status, 401); assert.equal(result.calls.length, 0);
});
test('02 malformed token returns no protected body', async () => {
  const result = await invoke({ authStatus: 401 }, { token: 'malformed' });
  assert.equal(result.body.status, 'DENY'); assert.equal(result.calls.length, 1);
});
test('03 expired token returns no protected body', async () => {
  const result = await invoke({ authStatus: 401 }, { token: 'expired.token.value' });
  assert.equal(result.response.status, 401); assert.equal(result.calls.length, 1);
});
test('04 unauthorized authenticated user returns no protected body', async () => {
  const result = await invoke({ decision: 'DENY' });
  assert.equal(result.response.status, 403); assert.equal(result.calls.length, 2);
});
test('05 entitled authenticated user receives minimum protected payload', async () => {
  const result = await invoke();
  assert.equal(result.body.status, 'ALLOW'); assert.equal(result.body.publication.identity, publicationId);
  assert.equal(result.calls.length, 3); assert.equal(result.body.publication.body.content[0].content[0].value, 'Protected body fixture.');
  assert.equal(result.body.publication.entryId, undefined);
});
test('06 entitlement RPC error returns no protected body', async () => {
  const result = await invoke({ rpcStatus: 500 });
  assert.equal(result.body.status, 'ERROR'); assert.equal(result.calls.length, 2);
});
test('07 malformed entitlement decision returns no protected body', async () => {
  const result = await invoke({ rpcBody: [{ decision: 'MAYBE' }] });
  assert.equal(result.body.status, 'DENY'); assert.equal(result.calls.length, 2);
});
test('08 unknown publication returns no protected body', async () => {
  const result = await invoke({ items: [] });
  assert.equal(result.body.reason, 'UNKNOWN_PUBLICATION');
});
test('09 publicationId mismatch returns no protected body', async () => {
  const result = await invoke({ items: [contentfulEntry({ gpirPublicationId: 'VK-GPIR-P-000000000002-6' })] });
  assert.equal(result.body.reason, 'CONTENT_IDENTITY_MISMATCH');
});
test('10 supabaseRecordId mismatch returns no protected body', async () => {
  const result = await invoke({ items: [contentfulEntry({ supabaseRecordId: '33333333-3333-4333-8333-333333333333' })] });
  assert.equal(result.body.reason, 'CONTENT_IDENTITY_MISMATCH');
});
test('11 Contentful zero result returns no protected body', async () => {
  const result = await invoke({ contentfulBody: { items: [] } });
  assert.equal(result.body.status, 'DENY');
});
test('12 Contentful duplicate result returns no protected body', async () => {
  const result = await invoke({ items: [contentfulEntry(), contentfulEntry()] });
  assert.equal(result.body.reason, 'DUPLICATE_PUBLICATION');
});
test('13 Contentful identity mismatch cannot leak body', async () => {
  const result = await invoke({ items: [contentfulEntry({ supabaseRecordId: '33333333-3333-4333-8333-333333333333' })] });
  assert.doesNotMatch(JSON.stringify(result.body), /Protected body fixture/);
});
test('14 Contentful API failure returns no protected body', async () => {
  const result = await invoke({ contentfulStatus: 500 });
  assert.equal(result.body.status, 'ERROR'); assert.doesNotMatch(JSON.stringify(result.body), /Protected body fixture/);
});

function staticRecord(index = 1) {
  const digits = String(index).padStart(12, '0');
  return { entryId: `entry-${index}`, fields: {
    gpirPublicationId: `VK-GPIR-P-${digits}-0`, editionLineageId: `VK-GPIR-L-${digits}-0`,
    supabaseRecordId: `00000000-0000-4000-8000-${digits}`,
    publicationTitle: `Publication ${index}`, publicationType: index % 2 ? 'Country Intelligence' : 'Research Chapter',
    canonicalUrlCandidate: `/publication-${index}/`, executiveSummary: `Summary ${index}`,
    editorialBody: { nodeType: 'document', content: [{ nodeType: 'paragraph', content: [
      { nodeType: 'text', value: `PROTECTED-${index}`, marks: [] }] }] }, sourceValidationSummary: `Provenance ${index}`
  } };
}

test('15 browser cannot retrieve protected content directly from static artifact', () => {
  assert.doesNotMatch(renderPublicationPage(adaptPublication(staticRecord())), /PROTECTED-1/);
});
test('16 routes.json contains no protected body', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'gpir-edge-routes-'));
  try {
    buildPublicationSite({ source: { contentType: 'gpirPublication' }, records: [staticRecord()] },
      { output, expected: 1, controlledValidation: false });
    assert.doesNotMatch(fs.readFileSync(path.join(output, 'routes.json'), 'utf8'), /PROTECTED-1/);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});
test('17 static HTML contains no protected body', () => {
  assert.doesNotMatch(renderPublicationPage(adaptPublication(staticRecord())), /PROTECTED-1/);
});
test('18 JavaScript-disabled static request contains no protected body', () => {
  const html = renderPublicationPage(adaptPublication(staticRecord()));
  assert.match(html, /gpir-protected-content/); assert.doesNotMatch(html, /PROTECTED-1/);
  assert.match(html, /data-gpir-edge-endpoint="https:\/\/qlnvhfapctcpzqyuhhth\.supabase\.co\/functions\/v1\/gpir-protected-publication"/);
});
test('19 renderer cannot bypass authorization with a manufactured ALLOW', () => {
  const publication = adaptPublication(staticRecord());
  const html = renderPublicationPage(publication, { authorization: { authority: 'supabase', decision: 'ALLOW',
    publicationId: publication.identity, supabaseRecordId: publication.supabaseRecordId } });
  assert.doesNotMatch(html, /PROTECTED-1/);
});
test('20 protected response is private and no-store', async () => {
  const result = await invoke();
  assert.match(result.response.headers.get('cache-control'), /private/);
  assert.match(result.response.headers.get('cache-control'), /no-store/);
});
test('21 server-held Contentful secret is absent from frontend artifact', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'assets/js/gpir-protected-publication.mjs'), 'utf8');
  assert.doesNotMatch(source, /contentful-server-secret|CONTENTFUL_DELIVERY_TOKEN/);
});
test('22 service-role secret is absent from frontend artifact', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'assets/js/gpir-protected-publication.mjs'), 'utf8');
  assert.doesNotMatch(source, /service[_-]?role|sb_secret_/i);
});
test('23 raw session token is absent from rendered output', async () => {
  const supabase = { auth: { async getSession() { return { data: { session: {
    user: { id: userId }, expires_at: 2000000000, access_token: 'raw-session-secret' } } }; } } };
  const publication = await requestProtectedPublication({ supabase,
    endpoint: 'https://project.supabase.co/functions/v1/gpir-protected-publication', publicationId,
    supabaseRecordId, nowSeconds: 1000000000, fetchImpl: async () => new Response(JSON.stringify({
      status: 'ALLOW', publication: { identity: publicationId, supabaseRecordId, body: null }
    }), { status: 200 }) });
  assert.doesNotMatch(JSON.stringify(publication), /raw-session-secret/);
});
test('24 invalid origin gains no protected access', async () => {
  const result = await invoke({}, { origin: 'https://attacker.example' });
  assert.equal(result.response.status, 403); assert.equal(result.calls.length, 0);
  assert.equal(result.response.headers.get('access-control-allow-origin'), null);
});
test('25 all 32 governed shells remain unique and contain zero protected static bodies', () => {
  const publications = Array.from({ length: 32 }, (_, index) => adaptPublication(staticRecord(index + 1)));
  assert.equal(new Set(publications.map(item => item.route)).size, 32);
  assert.equal(new Set(publications.map(item => `${item.identity}|${item.supabaseRecordId}`)).size, 32);
  for (const publication of publications)
    assert.doesNotMatch(renderPublicationPage(publication), /PROTECTED-[0-9]+/);
});
test('26 production-origin preflight is bounded and contains no response body', async () => {
  const result = await invoke({}, { token: null, method: 'OPTIONS' });
  assert.equal(result.response.status, 204);
  assert.equal(result.response.headers.get('access-control-allow-origin'), 'https://fintechoisis.com');
  assert.equal(result.calls.length, 0);
});
