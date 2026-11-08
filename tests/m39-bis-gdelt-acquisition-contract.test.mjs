import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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
});
