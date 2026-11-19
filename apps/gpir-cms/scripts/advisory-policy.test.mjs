import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify,releaseDecision,advisory,expiry} from './advisory-policy.mjs';
const direct={name:'picomatch',severity:'high',url:advisory};
const entry=(name,via,severity='high')=>({name,via,severity,nodes:['node_modules/'+name]});
function report(...vs){const counts={info:0,low:0,moderate:0,high:0,critical:0,total:vs.length};for(const v of vs)counts[v.severity]++;return {auditReportVersion:2,vulnerabilities:Object.fromEntries(vs.map(v=>[v.name,v])),metadata:{vulnerabilities:counts}};}
test('clean audit passes',()=>assert.equal(releaseDecision(report()),'PASS'));
test('withdrawn advisory and inherited cycle recognized but unrelated findings remain blocked',()=>{const r=report(entry('picomatch',[direct]),entry('a',['b','picomatch']),entry('b',['a']));assert.equal(classify(r),'EXCEPTION_CANDIDATE');assert.equal(releaseDecision(r,expiry-1),'BLOCK_UNVERIFIED_WITHDRAWAL');assert.equal(releaseDecision(r,expiry,true),'PASS_WITHDRAWN_ADVISORY');});
test('unrelated high blocked',()=>assert.equal(classify(report(entry('picomatch',[direct]),entry('other',[{...direct,name:'other'}]))),'BLOCK'));
test('critical blocked',()=>assert.equal(classify(report(entry('picomatch',[{...direct,severity:'critical'}],'critical'))),'BLOCK'));
test('cycle without advisory blocked',()=>assert.equal(classify(report(entry('a',['b']),entry('b',['a']))),'BLOCK'));
test('malformed report blocked',()=>{assert.throws(()=>classify({error:'registry unavailable'}));assert.throws(()=>classify(report(entry('a',['missing']))));});
