'use strict';

// Static gate only: never opens a database connection or executes migration SQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkDigit, governedId } = require('../../scripts/m35/identity-authority');

const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260922000000_m35_identity_registry.sql'), 'utf8');
const has = pattern => assert.match(sql, pattern);

test('four isolated identity tables are declared', () => {
  for (const name of ['lineages', 'publications', 'related_identifiers', 'events'])
    has(new RegExp(`CREATE TABLE public\\.gpir_identity_${name} \\(`));
  assert.equal((sql.match(/CREATE TABLE public\.gpir_identity_/g) || []).length, 4);
});
test('both native sequences are declared without cycling', () => {
  has(/CREATE SEQUENCE public\.gpir_identity_publication_seq AS bigint START WITH 1 NO CYCLE/);
  has(/CREATE SEQUENCE public\.gpir_identity_lineage_seq AS bigint START WITH 1 NO CYCLE/);
});
test('all four tables use internal UUID primary keys', () => {
  assert.equal((sql.match(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/g) || []).length, 4);
});
test('source unit key is required, unique and rejects fixtures', () => {
  has(/source_unit_key text NOT NULL UNIQUE/);
  has(/source_unit_key !~\* '\^\(fixture\|test\):'/);
});
test('non-null publication IDs and lineage IDs are unique', () => {
  has(/gpir_publication_id text UNIQUE/);
  has(/edition_lineage_id text NOT NULL UNIQUE/);
});
test('all five identity states are constrained', () => {
  has(/CHECK \(identity_status IN \('PROVISIONAL', 'SOURCE_NATIVE', 'GOVERNED_ASSIGNED', 'COLLISION_REVIEW', 'BLOCKED'\)\)/);
});
test('provisional and blocked rows persist without public IDs', () => {
  has(/identity_status IN \('PROVISIONAL', 'BLOCKED'\) AND gpir_publication_id IS NULL/);
  has(/identity_status text NOT NULL DEFAULT 'PROVISIONAL'/);
});
test('assigned states require public and lineage IDs', () => {
  has(/identity_status IN \('SOURCE_NATIVE', 'GOVERNED_ASSIGNED'\) AND\s+gpir_publication_id IS NOT NULL AND lineage_id IS NOT NULL/);
});
test('an assigned public ID and source key cannot be changed', () => {
  has(/OLD\.gpir_publication_id IS NOT NULL AND\s+NEW\.gpir_publication_id IS DISTINCT FROM OLD\.gpir_publication_id/);
  has(/NEW\.source_unit_key IS DISTINCT FROM OLD\.source_unit_key/);
});
test('related identifiers are unique within publication, type, value and relationship', () => {
  has(/UNIQUE \(publication_id, identifier_type, identifier_value, relationship\)/);
  assert.doesNotMatch(sql, /UNIQUE\s*\(identifier_type, identifier_value\)/);
});
test('lineage and predecessor relationships have restrictive foreign keys', () => {
  has(/lineage_id uuid REFERENCES public\.gpir_identity_lineages\(id\) ON DELETE RESTRICT/);
  has(/predecessor_publication_id uuid REFERENCES public\.gpir_identity_publications\(id\) ON DELETE RESTRICT/);
});
test('related rows cannot outlive their publication', () => {
  has(/publication_id uuid NOT NULL REFERENCES public\.gpir_identity_publications\(id\) ON DELETE RESTRICT/);
  has(/BEFORE DELETE ON public\.gpir_identity_related_identifiers/);
});
test('audit events reject update and delete', () => {
  has(/BEFORE UPDATE OR DELETE ON public\.gpir_identity_events/);
  has(/RAISE EXCEPTION 'Identity events are append-only'/);
});
test('RLS is enabled on all four tables', () => {
  for (const name of ['lineages', 'publications', 'related_identifiers', 'events'])
    has(new RegExp(`ALTER TABLE public\\.gpir_identity_${name} ENABLE ROW LEVEL SECURITY`));
});
test('no anonymous or website-user allocation policy exists', () => {
  assert.doesNotMatch(sql, /CREATE POLICY/i);
  has(/REVOKE ALL ON FUNCTION public\.gpir_identity_resolve[\s\S]*FROM PUBLIC, anon, authenticated/);
});
test('controlled allocation is a security-definer function granted only to service role', () => {
  has(/CREATE FUNCTION public\.gpir_identity_resolve\(/);
  has(/RETURNS public\.gpir_identity_publications LANGUAGE plpgsql SECURITY INVOKER/);
  has(/GRANT EXECUTE ON FUNCTION public\.gpir_identity_resolve[\s\S]*TO service_role/);
  has(/ALTER FUNCTION public\.gpir_identity_resolve[\s\S]*SECURITY DEFINER/);
  assert.ok(sql.lastIndexOf('SECURITY DEFINER;') > sql.lastIndexOf('FROM PUBLIC, anon, authenticated;'));
  assert.ok(sql.lastIndexOf('SECURITY DEFINER;') > sql.lastIndexOf('ENABLE ROW LEVEL SECURITY;'));
});
test('allocation never uses MAX plus one', () => {
  assert.doesNotMatch(sql, /MAX\s*\([^)]*\)\s*\+\s*1/i);
});
test('allocation consumes the publication sequence', () => {
  has(/nextval\('public\.gpir_identity_publication_seq'::regclass\)/);
});
test('allocation consumes the lineage sequence', () => {
  has(/nextval\('public\.gpir_identity_lineage_seq'::regclass\)/);
});
test('Luhn digit follows F4A algorithm across boundary vectors', () => {
  has(/expanded := p_digits \|\| '0'/);
  has(/FOR i IN REVERSE length\(expanded\)\.\.1 LOOP/);
  has(/IF n > 9 THEN n := n - 9/);
  has(/RETURN \(\(10 - \(total % 10\)\) % 10\)::text/);
  // Independent model of the SQL loop; execution against PostgreSQL remains a deployment gate.
  function sqlModel(digits) {
    let total = 0;
    let doubled = false;
    for (let i = (digits + '0').length - 1; i >= 0; i--) {
      let n = Number((digits + '0')[i]);
      if (doubled) { n *= 2; if (n > 9) n -= 9; }
      total += n;
      doubled = !doubled;
    }
    return String((10 - (total % 10)) % 10);
  }
  for (const digits of ['000000000001', '000000000009', '000000123456', '999999999999'])
    assert.equal(sqlModel(digits), checkDigit(digits));
  assert.equal(governedId('P', 123456), `VK-GPIR-P-000000123456-${sqlModel('000000123456')}`);
});
test('collision review preserves assigned IDs and blocks eligibility', () => {
  has(/identity_status = 'COLLISION_REVIEW'/);
  has(/collision_state = 'review'/);
  has(/UPDATE public\.gpir_identity_publications SET identity_status = 'COLLISION_REVIEW'/);
  has(/OLD\.gpir_publication_id IS NOT NULL/);
  has(/SELECT \* INTO incumbent FROM public\.gpir_identity_publications[\s\S]*WHERE gpir_publication_id = p_claimed_publication_id AND id <> rec\.id FOR UPDATE/);
  has(/UPDATE public\.gpir_identity_publications SET identity_status = 'COLLISION_REVIEW',\s+collision_state = 'review' WHERE id = incumbent\.id/);
  has(/'conflictingSourceUnitKey', p_source_unit_key/);
});
test('same source unit is locked and returned without a second allocation', () => {
  has(/ON CONFLICT \(source_unit_key\) DO NOTHING/);
  has(/WHERE source_unit_key = p_source_unit_key FOR UPDATE/);
  has(/IF rec\.identity_status IN \('SOURCE_NATIVE', 'GOVERNED_ASSIGNED', 'COLLISION_REVIEW', 'BLOCKED'\) THEN\s+RETURN rec/);
  has(/IF rec\.claimed_publication_id IS NOT NULL AND p_claimed_publication_id IS NULL THEN\s+-- A pending source-native claim cannot be bypassed/);
});
test('fixture identities cannot enter production assignment', () => {
  has(/p_source_unit_key ~\* '\^\(fixture\|test\):'/);
  has(/source_unit_key !~\* '\^\(fixture\|test\):'/);
  has(/gpir_publication_id !~ '\^VK-GPIR-\[PL\]-\[0-9\]\{12\}-\[0-9\]\$'/);
  has(/p_claimed_publication_id !~ '\^VK-GPIR-\[PL\]-\[0-9\]\{12\}-\[0-9\]\$'/);
});
test('legacy CMS and source registry are not coupled to identity tables', () => {
  assert.doesNotMatch(sql, /REFERENCES\s+(?:public\.)?cms_articles/i);
  assert.doesNotMatch(sql, /(?:ALTER|UPDATE|INSERT INTO|DELETE FROM)\s+(?:TABLE\s+)?(?:public\.)?source_registry/i);
});
test('FX, announcement and ingestion tables are untouched', () => {
  assert.doesNotMatch(sql, /(?:ALTER|UPDATE|INSERT INTO|DELETE FROM|REFERENCES)\s+(?:TABLE\s+)?(?:public\.)?(?:fx_historical_archive|global_announcements|country_intelligence|intelligence_[a-z_]+)/i);
});
test('forward correction and no sequence recycling are documented', () => {
  has(/Forward correction only after the first assignment/);
  has(/never reset sequences, delete/);
});
test('mutation privileges are denied on registry tables and sequences', () => {
  has(/REVOKE ALL ON TABLE public\.gpir_identity_lineages/);
  has(/REVOKE ALL ON SEQUENCE public\.gpir_identity_publication_seq/);
});
