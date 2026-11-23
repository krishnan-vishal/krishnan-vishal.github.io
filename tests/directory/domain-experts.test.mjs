import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expertError } from '../../apps/gpir-cms/src/lib/domain-expert.mjs';
import { expertDirectory } from '../../supabase/functions/_shared/gpir-expert-directory.mjs';

const id = 'gpir-expert:' + '1'.repeat(32);
const checkedAt = '2026-11-23';
const now = new Date(checkedAt);
const officialBio = { url: 'https://example.org/bio', publisher: 'Employer', checkedAt };
const claim = { text: 'Synthetic claim', source: officialBio };
const review = {
    identity: true, tenure: true, contribution: true, independentEvidence: true,
    publicationClearance: true, ownerApproved: true, releaseThrough: '2027-01-01',
    ownerApprovalReference: 'Fixture approval', sanctionsScreeningScope: 'Fixture clearance'
};
const profile = {
    id, kind: 'gpir-domain-expert', state: 'PUBLIC', name: 'Example Expert', sortKey: 'example expert',
    title: 'Director', employer: 'Employer', jurisdiction: 'Example', officialBio, checkedAt,
    regions: ['Global'], industries: ['Payments'], topics: ['Cards', 'FX', 'Treasury', 'Settlement'],
    summary: { ...claim, text: 'Synthetic profile summary '.repeat(16).trim() },
    career: [{ ...claim, period: '2010–2015' }, { ...claim, period: '2015–2026' }],
    verifiedYears: 16, tenureEvidence: claim, qualifications: [], recognition: [], corrections: [],
    contribution: { ...claim, source: { url: 'https://example.com/evidence', publisher: 'Independent', checkedAt } },
    review
};

test('Guests, unpaid readers and verification failures never query expert rows', async () => {
    for (const access of ['UNAUTHENTICATED', 'DENY', 'ERROR']) {
        const result = await expertDirectory(new URLSearchParams(), access, () => assert.fail('Unauthorized data lookup'));
        assert.deepEqual(result, { access });
    }
});

test('Entitled request passes bounded, parameterized combined filters', async () => {
    const query = new URLSearchParams({ q: 'Q'.repeat(128), region: 'Global', industry: 'Payments',
        topic: 'Cards', title: 'Director', letter: 'e', page: '9000' });
    const payload = await expertDirectory(query, 'ALLOW', async filters => {
        assert.deepEqual(filters, { p_query: 'Q'.repeat(100), p_region: 'Global', p_industry: 'Payments',
            p_topic: 'Cards', p_title: 'Director', p_letter: 'E', p_page: 1000 });
        return { cards: [], total: 0 };
    });
    assert.equal(payload.access, 'ALLOW');
});

test('A candidate requires independent evidence, tenure and current owner approval', () => {
    assert.equal(expertError(id, { ...profile, state: 'REVIEW' }, 'editor', now), null);
    assert.equal(expertError(id, profile, 'admin', now), null);
    assert.ok(expertError(id, profile, 'editor', now));
    assert.ok(expertError(id, { ...profile, contribution: claim }, 'admin', now));
    assert.ok(expertError(id, { ...profile, verifiedYears: 9 }, 'admin', now));
    assert.ok(expertError(id, { ...profile, review: { ...review, ownerApproved: false } }, 'admin', now));
    assert.ok(expertError(id, { ...profile, review: { ...review, releaseThrough: '2026-01-01' } }, 'admin', now));
    assert.ok(expertError(id, { ...profile, portrait: { url: 'javascript:alert(1)' } }, 'admin', now));
    assert.ok(expertError(id, { ...profile, summary: { ...profile.summary, privateNote: 'Withheld' } }, 'admin', now));
});

test('Both Repository menus replace the placeholder and retain Industry Participants', () => {
    for (const page of ['index.html', 'pages/intelligence/index.html']) {
        const markup = readFileSync(page, 'utf8');
        assert.match(markup, /<strong>Directory<\/strong>[\s\S]+?Industry Participants[\s\S]+?href="\/pages\/intelligence\/domain-experts.html"><strong>Domain Experts/);
    }
});
