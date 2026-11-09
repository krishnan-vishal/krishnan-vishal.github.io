import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { matchGdeltPublisherSource } from '../supabase/functions/_shared/gpir-public-source-adapters.mjs';

const fetchSource = fs.readFileSync(new URL('../supabase/functions/gpir-intelligence-fetch/index.ts', import.meta.url), 'utf8');
const registration = fs.readFileSync(new URL('../supabase/release/m39-bis-gdelt-source-registration.sql', import.meta.url), 'utf8');

test('registry keeps BIS authoritative and GDELT unverified', () => {
  assert.match(registration, /'BIS-GLOBAL-001'[\s\S]*?'T1'[\s\S]*?'GREEN'/);
  assert.match(registration, /'GDELT-GLOBAL-001'[\s\S]*?'T3'[\s\S]*?'AMBER'/);
  assert.doesNotMatch(registration, /'GDELT-GLOBAL-001'[\s\S]{0,500}'GREEN'/);
});
test('BIS rows bypass announcement classification and remain non-publishable references', () => {
  assert.match(fetchSource, /ingestion_status:\s*"PROCESSED"/);
  assert.match(fetchSource, /data_class:\s*"STATISTICAL_REFERENCE"/);
  assert.match(fetchSource, /publication_eligible:\s*false/);
  assert.match(fetchSource, /alert_eligible:\s*false/);
  assert.match(fetchSource, /global_announcements_modified:\s*false/);
});

test('GDELT write mode stages original pages but has no discovery-only early return', () => {
  assert.match(fetchSource, /\["AMBER", "GREEN"\]\.includes/);
  assert.match(fetchSource, /parseGdeltDiscovery\(JSON\.parse\(indexHtml\)/);
  assert.match(fetchSource, /source_verification_required:/);
  assert.doesNotMatch(fetchSource, /GDELT_DISCOVERY_WRITE_NOT_AUTHORIZED/);
  assert.doesNotMatch(fetchSource, /if \(requestedSource === GDELT_SOURCE_ID\) return Response\.json/);
  assert.match(fetchSource, /matchGdeltPublisherSource\(item\.url, approvedSources/);
  assert.match(fetchSource, /source_id: articleSource\.source_id/);
  assert.match(fetchSource, /GDELT_CANONICAL_DOMAIN_MISMATCH/);
  assert.doesNotMatch(fetchSource, /publication_eligible:\s*requestedSource === GDELT_SOURCE_ID \? false/);
});

test('GDELT discoveries route only to a unique GREEN original publisher domain', () => {
  const sources = [
    { source_id: 'RBA', official_url: 'https://www.rba.gov.au', source_status: 'GREEN' },
    { source_id: 'GDELT-GLOBAL-001', official_url: 'https://api.gdeltproject.org', source_status: 'AMBER' },
    { source_id: 'UNAPPROVED', official_url: 'https://example.com', source_status: 'AMBER' }
  ];
  assert.equal(matchGdeltPublisherSource('https://www.rba.gov.au/media-releases/a.html', sources), sources[0]);
  assert.equal(matchGdeltPublisherSource('https://news.rba.gov.au/media/a.html', sources), sources[0]);
  assert.equal(matchGdeltPublisherSource('https://evil.example/a.html', sources), null);
  assert.equal(matchGdeltPublisherSource('http://www.rba.gov.au/a.html', sources), null);
  assert.equal(matchGdeltPublisherSource('https://www.rba.gov.au@evil.example/a.html', sources), null);
  assert.equal(matchGdeltPublisherSource('https://www.rba.gov.au/a.html', [
    sources[0], { ...sources[0], source_id: 'DUPLICATE' }
  ]), null);
});
