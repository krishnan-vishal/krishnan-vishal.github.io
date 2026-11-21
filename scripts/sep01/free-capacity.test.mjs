import test from 'node:test';
import assert from 'node:assert/strict';
import {capacitySnapshot,capacityReport,freeRoutingProviders} from './free-capacity.mjs';
const p={id:'approved/model:free',approved:true,pricing_verified:true,free_verified:true,verified_at:'2026-11-20T00:00:00Z',source_url:'https://openrouter.ai/models',capabilities:['code'],limits:[{window:'day',max:10,used:10,reset_at:'2026-11-21T00:00:00Z'},{window:'minute',max:2,used:1,reset_at:'2026-11-20T12:01:00Z'}]};
test('exhausted daily quota pauses without guessing weekly/monthly allowances',()=>{assert.equal(capacitySnapshot([p],new Date('2026-11-20T12:00:00Z'))[0].reason,'QUOTA_PAUSED');});
test('known reset restores eligibility',()=>{assert.equal(capacitySnapshot([p],new Date('2026-11-21T12:00:00Z'))[0].remaining_requests,2);});
test('unknown or unverified free model fails closed',()=>{assert.equal(capacityReport([{...p,free_verified:false}],new Date('2026-11-20T12:00:00Z')).available,0);});
test('bad quota evidence fails closed',()=>{assert.equal(capacitySnapshot([{...p,limits:[{window:'month',max:10,used:11,reset_at:'2026-12-01T00:00:00Z'}]}])[0].reason,'UNVERIFIED');});

test('eligible free provider is directly routable through central controller',async()=>{
 const {claim}=await import('./controller.mjs');
 const available={...p,limits:p.limits.map(l=>({...l,used:0,reset_at:'2026-11-21T00:00:00Z'}))};
 const providers=freeRoutingProviders([available],new Date('2026-11-20T12:00:00Z'));
 const job={job_id:'job-1',idempotency_key:'key-1',branch:'fix/dashboard',locked_paths:['assets/js/dashboard.js'],scope:'dashboard',capability:'code',remaining_budget:0,status:'QUEUED'};
 assert.equal(claim(job,providers).provider,p.id);
 assert.equal(claim(job,freeRoutingProviders([p],new Date('2026-11-20T12:00:00Z'))).status,'QUOTA_PAUSED');
});
