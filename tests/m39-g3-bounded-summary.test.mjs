import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { articleSpecificDescription, collapseOfficialPathSlashes } from '../supabase/functions/_shared/gpir-official-evidence.mjs';
import { AUTO_PUBLICATION_THRESHOLDS, T3_AUTOMATIC_PUBLICATION } from '../supabase/functions/_shared/gpir-intelligence-validation.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20261109062044_m39_g3_bounded_summary_assessment.sql', import.meta.url), 'utf8');
const fetchFunction = readFileSync(new URL('../supabase/functions/gpir-intelligence-fetch/index.ts', import.meta.url), 'utf8');

test('repository migration is the exact production m39_g3_bounded_summary_assessment record', () => {
    const digest = createHash('md5').update(readFileSync(new URL('../supabase/migrations/20261109062044_m39_g3_bounded_summary_assessment.sql', import.meta.url))).digest('hex');
    assert.equal(digest, 'ce0f2a654b3aff90a3d7cf9f16767031');
});

test('bounded summary scoring is additive, capped and never lowers or re-bands governance thresholds', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.gpir_intelligence_assessment\(p_title text, p_url text, p_summary text\)/);
    assert.match(migration, /left\(coalesce\(p_summary,''\),2000\)/);
    assert.match(migration, /least\(100,/);
    assert.match(migration, /final_score>=60 THEN 'CANDIDATE' WHEN final_score>=30 THEN 'REVIEW'/);
    assert.match(migration, /length\(btrim\(evidence\)\) < 70 THEN 0/);
    assert.doesNotMatch(migration, /DROP |DELETE |TRUNCATE |ALTER TABLE/i);
    assert.deepEqual({ ...AUTO_PUBLICATION_THRESHOLDS }, { T1: 70, 'T1.5': 80, T2: 90 });
    assert.equal(T3_AUTOMATIC_PUBLICATION.minConfidence, 95);
});

test('the summary-aware assessment feeds ingestion only through raw_content', () => {
    assert.match(migration, /raw_record\.raw_content/);
    assert.match(migration, /gpir_intelligence_assessment\(p_title,p_url\) AS assessment/);
});

test('the ECB site-wide description is never article evidence; other sources are untouched', () => {
    const site = 'The European Central Bank (ECB) is the central bank of the European Union countries which have adopted the euro. Our main task is to maintain price stability in the euro area and so preserve the purchasing power of the single currency.';
    assert.equal(articleSpecificDescription('CB-EUR-001', site), null);
    assert.equal(articleSpecificDescription('CB-EUR-001', 'The ECB published consolidated banking data covering payment services.'), 'The ECB published consolidated banking data covering payment services.');
    assert.equal(articleSpecificDescription('PYMNTS-GLOBAL-004', site), site);
    assert.equal(articleSpecificDescription('CB-EUR-001', ''), null);
});

test('official double-slash paths collapse only for the exact official host', () => {
    assert.equal(
        collapseOfficialPathSlashes('https://www.ecb.europa.eu//press/pr/date/2026/html/ecb.pr261106~356f2fc73a.en.html', 'www.ecb.europa.eu'),
        'https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr261106~356f2fc73a.en.html'
    );
    const foreign = 'https://evil.example//press/x.html';
    assert.equal(collapseOfficialPathSlashes(foreign, 'www.ecb.europa.eu'), foreign);
    assert.equal(collapseOfficialPathSlashes('http://www.ecb.europa.eu//press/x', 'www.ecb.europa.eu'), 'http://www.ecb.europa.eu//press/x');
    assert.equal(collapseOfficialPathSlashes('not a url', 'www.ecb.europa.eu'), 'not a url');
});

test('the fetch function applies ECB evidence hygiene without touching other source routes', () => {
    assert.match(fetchFunction, /gpir-official-evidence\.mjs/);
    assert.match(fetchFunction, /requestedSource === ECB_SOURCE_ID\) \{\s*meta\.canonicalUrl = collapseOfficialPathSlashes\(/);
    assert.match(fetchFunction, /meta\.description = articleSpecificDescription\(articleSource\.source_id, meta\.description\)/);
});
