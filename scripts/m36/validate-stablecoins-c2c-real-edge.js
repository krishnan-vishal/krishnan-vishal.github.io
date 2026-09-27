'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { adaptPublication } = require('../m35/contentful-publication-adapter');
const { controlledValidationAuthorization } = require('../m35/contentful-auth-boundary');
const { renderPublicationPage } = require('../m35/contentful-publication-renderer');

const root = path.resolve(__dirname, '..', '..');
const output = path.join(root, 'artifacts', 'm36', 'b3d');
const locale = 'en-US';
const supabaseUrl = 'https://qlnvhfapctcpzqyuhhth.supabase.co';
const publicationId = 'VK-GPIR-P-000000000033-1';
const supabaseRecordId = '09d86c5b-e508-4dab-8908-a40328842070';
const entryId = '6spQ5pgDwU7HBF561d4Umv';
const ownerAlt = 'GPIR Stablecoins Global Money Movements Intelligence dashboard covering cross-border payments, remittances, trade, treasury and financial inclusion, with C2C corridors, stablecoin networks, FX and off-ramping, regulation, AML and 2026–2035 outlook.';
const env = process.env;

for (const name of ['GPIR_SUPABASE_SECRET_KEY', 'CONTENTFUL_MANAGEMENT_TOKEN',
  'CONTENTFUL_SPACE_ID', 'CONTENTFUL_ENVIRONMENT']) {
  if (!env[name]) throw new Error(`Missing required configuration: ${name}`);
}

async function api(url, { method = 'GET', headers = {}, body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: { accept: 'application/json', ...headers,
      ...(body === null ? {} : { 'content-type': 'application/json' }) },
    body: body === null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; }
  catch { parsed = { message: 'non-JSON response' }; }
  if (!response.ok) throw new Error(`Provider request failed with status ${response.status}: ${parsed.message || parsed.error_description || parsed.error || 'unknown error'}`);
  return parsed;
}

async function previewToken() {
  if (env.CONTENTFUL_PREVIEW_TOKEN) return env.CONTENTFUL_PREVIEW_TOKEN;
  const keys = await api(`https://api.contentful.com/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
    '/preview_api_keys?limit=100', { headers: {
      authorization: `Bearer ${env.CONTENTFUL_MANAGEMENT_TOKEN}`
    } });
  const candidates = (keys.items || []).filter(key => typeof key.accessToken === 'string' && key.accessToken);
  if (candidates.length !== 1)
    throw new Error(`Expected one usable Contentful Preview API key, found ${candidates.length}.`);
  return candidates[0].accessToken;
}

async function invoke(handler, input, token = null) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await handler(new Request(`${supabaseUrl}/functions/v1/gpir-protected-publication`, {
    method: 'POST', headers, body: JSON.stringify(input)
  }));
  const text = await response.text();
  return { statusCode: response.status, body: text ? JSON.parse(text) : null };
}

function localizeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([name, value]) => [name, value?.[locale] ?? value]));
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

async function main() {
  const secret = env.GPIR_SUPABASE_SECRET_KEY.trim();
  const adminHeaders = { apikey: secret, authorization: `Bearer ${secret}` };
  const password = crypto.randomBytes(36).toString('base64url');
  const email = `gpir-m36-b3d-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
  let userId = null;
  let userDeleted = false;
  let finalResult = null;
  try {
    const user = await api(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST', headers: adminHeaders,
      body: { email, password, email_confirm: true, user_metadata: { purpose: 'M36-B3D controlled validation' } }
    });
    userId = user.id;
    if (typeof userId !== 'string') throw new Error('Supabase temporary validation user was not created deterministically.');
    const session = await api(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: secret }, body: { email, password }
    });
    if (typeof session.access_token !== 'string') throw new Error('Supabase temporary validation session was not issued.');

    const token = await previewToken();
    const handlerModule = await import(pathToFileURL(path.join(root, 'supabase', 'functions',
      'gpir-protected-publication', 'handler.mjs')).href);
    const handler = handlerModule.createProtectedPublicationHandler({ env: {
      SUPABASE_URL: supabaseUrl,
      GPIR_SUPABASE_PUBLISHABLE_KEY: secret,
      CONTENTFUL_SPACE_ID: env.CONTENTFUL_SPACE_ID,
      CONTENTFUL_ENVIRONMENT: env.CONTENTFUL_ENVIRONMENT,
      CONTENTFUL_DELIVERY_TOKEN: token,
      CONTENTFUL_HOST: 'preview.contentful.com'
    } });
    const anonymous = await invoke(handler, { publicationId, supabaseRecordId });
    const exact = await invoke(handler, { publicationId, supabaseRecordId }, session.access_token);
    const mismatch = await invoke(handler, {
      publicationId: 'VK-GPIR-P-000000000034-9', supabaseRecordId
    }, session.access_token);
    const missingPolicy = await invoke(handler, {
      publicationId: 'VK-GPIR-P-999999999999-9', supabaseRecordId: crypto.randomUUID()
    }, session.access_token);

    if (anonymous.body?.status !== 'DENY' || exact.body?.status !== 'ALLOW' ||
        mismatch.body?.status !== 'DENY' || missingPolicy.body?.status !== 'DENY')
      throw new Error('Real protected-path authorization matrix did not match the owner-approved policy.');
    if (exact.body.publication?.primaryDashboard?.alt !== ownerAlt)
      throw new Error('Real Edge payload did not resolve the approved dashboard asset and alt text.');

    const query = new URLSearchParams({ content_type: 'gpirPublication', 'sys.id': entryId,
      include: '2', limit: '2', access_token: token });
    const collection = await api(`https://preview.contentful.com/spaces/${encodeURIComponent(env.CONTENTFUL_SPACE_ID)}` +
      `/environments/${encodeURIComponent(env.CONTENTFUL_ENVIRONMENT)}/entries?${query}`);
    if (collection.items?.length !== 1) throw new Error('Real Contentful Draft readback became ambiguous.');
    const fields = localizeFields(collection.items[0].fields);
    fields.executiveSummary = exact.body.publication.summary;
    fields.editorialBody = exact.body.publication.body;
    const fixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'm36', 'b3c',
      'stablecoins-render-fixture.json'), 'utf8'));
    const publication = adaptPublication({ entryId, fields, presentation: {
      ...fixture.record.presentation,
      primaryDashboard: exact.body.publication.primaryDashboard
    } });
    if (publication.researchModules.length !== 10)
      throw new Error('Real Edge payload did not render 10 governed modules.');
    const anonymousHtml = renderPublicationPage(publication);
    const authorizedHtml = renderPublicationPage(publication,
      { authorization: controlledValidationAuthorization(publication) });
    const source = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'm36', 'b3b',
      'stablecoins-normalized-intake-record.json'), 'utf8'));
    const protectedNeedle = source.editorialNarrative[0].slice(0, 80);
    if (anonymousHtml.includes(protectedNeedle) || anonymousHtml.includes(ownerAlt) ||
        anonymousHtml.includes('VK-GPIR-STBL-C2C-2026-001'))
      throw new Error('Anonymous static HTML exposed protected real-path content.');
    if (!authorizedHtml.includes(protectedNeedle) || !authorizedHtml.includes(ownerAlt))
      throw new Error('Controlled real-path owner preview is incomplete.');
    const route = 'stablecoins-cross-border-money-movement-c2c';
    const anonymousFile = path.join(output, 'preview', 'anonymous', route, 'index.html');
    const authorizedFile = path.join(output, 'preview', 'authorized', route, 'index.html');
    write(anonymousFile, anonymousHtml);
    write(authorizedFile, authorizedHtml);

    finalResult = {
      schemaVersion: 'M36-B3D-1.0', status: 'PASS',
      path: 'REAL_SUPABASE_AUTH_RPC_TO_CONTENTFUL_PREVIEW_TO_RENDERER',
      authorization: {
        anonymous: anonymous.body.status,
        authenticatedExactIdentity: exact.body.status,
        identityMismatch: mismatch.body.status,
        missingPolicy: missingPolicy.body.status
      },
      edgePayload: {
        moduleCount: publication.researchModules.length,
        dashboardResolved: Boolean(exact.body.publication.primaryDashboard),
        dashboardAltExact: exact.body.publication.primaryDashboard.alt === ownerAlt
      },
      staticExposure: 'PASS_NO_PROTECTED_MODULE_OR_DASHBOARD_CONTENT',
      controlledPreview: path.relative(root, authorizedFile).replace(/\\/g, '/'),
      supabaseValidationWrites: { temporaryUserCreated: 1, temporaryUserDeleted: 1,
        accessPolicyWrites: 0, publicationIdentityWrites: 0 }
    };
  } finally {
    if (userId) {
      await api(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE', headers: adminHeaders
      });
      userDeleted = true;
    }
  }
  if (!userDeleted) throw new Error('Supabase temporary validation user cleanup was not verified.');
  write(path.join(output, 'real-edge-validation.json'), `${JSON.stringify(finalResult, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(finalResult, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
