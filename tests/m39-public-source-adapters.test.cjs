#!/usr/bin/env node
const assert = require("node:assert/strict");
const { gdeltQueryUrl, gdeltDiscoveryCandidates, bisSourceDescriptor } = require("../scripts/intelligence/public-source-adapters.cjs");
const url = new URL(gdeltQueryUrl("remittances", {start:"20260901000000",end:"20260902000000"}));
assert.equal(url.hostname,"api.gdeltproject.org");
assert.equal(url.searchParams.get("mode"),"artlist");
assert.equal(url.searchParams.get("startdatetime"),"20260901000000");
assert.throws(()=>gdeltQueryUrl("sanctions"),/UNAPPROVED/);
assert.throws(()=>gdeltQueryUrl("wallets",{start:"20260902000000",end:"20260901000000"}),/INVALID_DATE_WINDOW/);
assert.throws(()=>gdeltQueryUrl("wallets",{maxRecords:251}),/INVALID_MAX_RECORDS/);
const candidates = gdeltDiscoveryCandidates({articles:[
 {url:"https://centralbank.example/notice",title:"Payments notice",seendate:"20261108090000"},
 {url:"https://centralbank.example/notice",title:"Duplicate",seendate:"20261108090000"},
 {url:"http://unsafe.example/",title:"Insecure",seendate:"20261108090000"},
 {url:"https://bank.example/",title:"Missing date"},
 {url:"https://bank.example/valid",title:"Wallet news",seendate:"20261107090000"}
]}, "wallets");
assert.equal(candidates.length,2);
assert.equal(candidates[0].verificationStatus,"SOURCE_VERIFICATION_REQUIRED");
assert.equal(candidates[0].publicationStatus,"NOT_PUBLISHED");
assert.equal(candidates[0].sourcePublicationTimestamp,null);
assert.equal(candidates[0].gdeltSeenAt,"2026-11-08T09:00:00Z");
assert.equal(bisSourceDescriptor().requiresApprovedDataflow,true);
assert.equal(bisSourceDescriptor().publicationStatus,"NOT_PUBLISHED");
console.log("Public source adapter tests passed: 12 assertions; no network or database writes.");
