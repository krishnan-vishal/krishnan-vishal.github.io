import test from 'node:test';
import assert from 'node:assert/strict';
import { governedTerms, retrieveGovernedEvidence } from '../../assets/js/gpir-governed-ask.mjs';

test('extracts bounded meaningful keywords from natural language',()=>{
  assert.deepEqual(governedTerms('Show recent money movement and remittances'),['money','movement','remittance']);
  assert.deepEqual(governedTerms('Frauds Report card'),['fraud']); 
});
test('queries existing governed M40 API with exact phrase then bounded keyword fallback',async()=>{
  const queries=[];
  const fetchImpl=async url=>{
    const term=new URL(url).searchParams.get('q');
    queries.push(term);
    return {ok:true,json:async()=>({status:'OK',records:term==='movement'?[{id:'a',title:'Money movement compliance'}]:[]})};
  };
  const records=await retrieveGovernedEvidence('https://example.supabase.co','money movement',{fetchImpl});
  assert.equal(records.length,1);
  assert.deepEqual(queries,['money movement','money','movement']);
});
test('does not invent records when governed endpoint fails',async()=>{
  await assert.rejects(()=>retrieveGovernedEvidence('https://example.supabase.co','fraud',{fetchImpl:async()=>({ok:false})}),/GOVERNED_HISTORY_UNAVAILABLE/);
});
