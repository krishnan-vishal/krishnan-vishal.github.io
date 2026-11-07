import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const release = await readFile(new URL(
  'supabase/release/m39-smart-intelligence-source-registry-repair.sql', root), 'utf8');
const rollback = await readFile(new URL(
  'supabase/rollback/m39-smart-intelligence-source-registry-repair.rollback.sql', root), 'utf8');

test('source repair is bounded to three governed identities and official endpoints', () => {
  for (const source of ['AS-APAC-004', 'CB-EUR-001', 'TEST-RBA-01'])
    assert.match(release, new RegExp(`source_id = '${source}'`));
  assert.match(release, /https:\/\/www\.fintechaustralia\.org\.au\/fintech-australia-news/);
  assert.match(release, /https:\/\/www\.ecb\.europa\.eu\/rss\/press\.html/);
  assert.match(release, /https:\/\/www\.rba\.gov\.au\/rss\/rss-cb-media-releases\.xml/);
  assert.doesNotMatch(release, /trust_tier|confidence_score|ticker_eligible|publication_status/);
  assert.match(release, /begin;/);
  assert.match(release, /commit;/);
});

test('source repair has an exact rollback without deleting registry records', () => {
  for (const source of ['AS-APAC-004', 'CB-EUR-001', 'TEST-RBA-01'])
    assert.match(rollback, new RegExp(`source_id = '${source}'`));
  assert.doesNotMatch(rollback, /delete\s+from/i);
});
