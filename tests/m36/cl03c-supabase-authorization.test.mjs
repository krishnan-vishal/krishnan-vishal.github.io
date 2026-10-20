import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(path.join(root,
  'supabase/migrations/20261020000000_m36_cl03c_supabase_authorization.sql'), 'utf8');
const syncScript = fs.readFileSync(path.join(root,
  'scripts/m36/synchronize-cl03c-contentful.js'), 'utf8');
const reconciliation = JSON.parse(fs.readFileSync(path.join(root,
  'artifacts/m36/cl03a-five/content-reconciliation-report.json'), 'utf8'));

test('identity RPC is restricted to the exact approved five-record set', () => {
  const approvedIds = reconciliation.publications.map(item => item.supabaseRecordId);
  const migrationIds = [...migration.matchAll(/'([0-9a-f-]{36})'::uuid/g)]
    .map(match => match[1]);

  assert.equal(approvedIds.length, 5);
  assert.deepEqual([...migrationIds].sort(), [...approvedIds].sort());
  assert.match(migration, /gpir_cl03c_identity_readback\(p_ids uuid\[\]\)/);
  assert.match(migration, /RETURNS TABLE\s*\(\s*id uuid,\s*gpir_publication_id text,\s*identity_status text,\s*collision_state text/s);
  assert.match(migration, /cardinality\(p_ids\)\s*<>\s*cardinality\(approved_ids\)/);
  assert.match(migration, /count\(DISTINCT supplied_id\)/);
  assert.match(migration, /p_ids @> approved_ids AND p_ids <@ approved_ids/);
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog, public/);
});

test('only the service role can execute the RPCs and only policy-table access is granted', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.gpir_cl03c_identity_readback\(uuid\[\]\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.gpir_cl03c_identity_readback\(uuid\[\]\)\s+TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.gpir_cl03c_policy_write_preflight\(\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.gpir_cl03c_policy_write_preflight\(\)\s+TO service_role/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE\s+ON TABLE public\.gpir_publication_access_policies\s+TO service_role/);
  assert.doesNotMatch(migration, /GRANT[\s\S]*?ON TABLE public\.gpir_identity_publications/i);
  assert.doesNotMatch(migration, /CREATE POLICY|DISABLE ROW LEVEL SECURITY/i);
});

test('policy preflight is invoker-scoped and checks all required table privileges', () => {
  assert.match(migration, /gpir_cl03c_policy_write_preflight\(\)\s+RETURNS boolean\s+LANGUAGE sql\s+STABLE\s+SECURITY INVOKER\s+SET search_path = pg_catalog, public/s);
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE'])
    assert.match(migration, new RegExp(`has_table_privilege\\([\\s\\S]*?'${privilege}'\\s*\\)`));
});

test('synchronization uses bounded RPCs and completes authorization checks before draft writes', () => {
  assert.match(syncScript, /POST', '\/rest\/v1\/rpc\/gpir_cl03c_identity_readback'/);
  assert.doesNotMatch(syncScript, /\/rest\/v1\/gpir_identity_publications/);
  const policyPreflight = syncScript.indexOf('/rest/v1/rpc/gpir_cl03c_policy_write_preflight');
  const contentfulPut = syncScript.indexOf("contentfulRequest('PUT'");
  assert.ok(policyPreflight >= 0);
  assert.ok(contentfulPut > policyPreflight);
  assert.match(syncScript, /policyWritePreflight !== true/);
  assert.doesNotMatch(syncScript, /premium_plan_id/);
});
