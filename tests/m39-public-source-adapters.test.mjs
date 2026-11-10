import assert from 'node:assert/strict';
import {
  BIS_DATAFLOWS, buildGdeltQueryUrl, GDELT_TOPICS, parseGdeltDiscovery
} from '../scripts/intelligence/public-source-adapters.mjs';

const url = new URL(buildGdeltQueryUrl('remittances', {
  start: '20260901000000', end: '20260902000000'
}));
assert.equal(url.hostname, 'api.gdeltproject.org');
assert.equal(url.searchParams.get('mode'), 'artlist');
assert.equal(url.searchParams.get('startdatetime'), '20260901000000');
for (const topic of ['remittances', 'cross-border-payments', 'wallets', 'fintech', 'licensing',
  'banking-as-a-service', 'payments-as-a-service', 'on-behalf-of', 'payment-gateways',
  'aml-fraud', 'blockchain-web3', 'agentic-ai']) assert.ok(GDELT_TOPICS[topic]);
assert.equal(Object.keys(BIS_DATAFLOWS).length, 4);
assert.throws(() => buildGdeltQueryUrl('sanctions'), /UNAPPROVED/);
assert.throws(() => buildGdeltQueryUrl('wallets', {
  start: '20260902000000', end: '20260901000000'
}), /INVALID_DATE_WINDOW/);
assert.throws(() => buildGdeltQueryUrl('wallets', {
  start: '20260801000000', end: '20260901000000'
}), /SEVEN_DAYS/);
assert.throws(() => buildGdeltQueryUrl('wallets', { maxRecords: 51 }), /INVALID_MAX_RECORDS/);

const candidates = parseGdeltDiscovery({ articles: [
  { url: 'https://centralbank.example/notice#top', title: 'Payments notice', seendate: '20261108090000', language: 'English', sourcecountry: 'India', domain: 'centralbank.example' },
  { url: 'https://centralbank.example/notice', title: 'Duplicate', seendate: '20261108090000' },
  { url: 'http://unsafe.example/', title: 'Insecure', seendate: '20261108090000' },
  { url: 'https://bank.example/', title: 'Missing date' },
  { url: 'https://bank.example/valid', title: 'Wallet news', seendate: '20261107T090000Z' },
  { url: 'https://bank.example/invalid', title: 'Invalid date', seendate: '20261131T090000Z' }
] }, 'wallets');
assert.equal(candidates.length, 2);
assert.equal(candidates[0].discovery.verificationStatus, 'SOURCE_VERIFICATION_REQUIRED');
assert.equal(candidates[0].discovery.publicationStatus, 'NOT_PUBLISHED');
assert.equal(candidates[0].discovery.sourcePublicationTimestamp, null);
assert.equal(candidates[0].discovery.gdeltSeenAt, '2026-11-08T09:00:00Z');
assert.equal(candidates[0].discovery.language, 'English');
assert.equal(candidates[0].discovery.sourceCountry, 'India');
assert.equal(candidates[0].url, 'https://centralbank.example/notice');
assert.equal(candidates[1].discovery.gdeltSeenAt, '2026-11-07T09:00:00Z');
console.log('Public source adapter checks PASS; GDELT remains discovery-only until original-source validation');
