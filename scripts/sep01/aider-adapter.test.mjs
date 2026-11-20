import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createAiderAdapter} from './aider-adapter.mjs';import {agentReadiness,selectAuthorizedAgent} from './agent-registry.mjs';
test('verified Aider adapter becomes routable only with quota and matching capability',()=>{
 const config={aider:{approved:true,adapter_verified:true,credential_verified:true,execute:async()=>{}}};
 assert.equal(agentReadiness(config).find(x=>x.id==='aider').ready,true);
 const provider={id:'aider-model',agent_id:'aider',approved:true,healthy:true,remaining_quota:1,capabilities:['code'],estimated_cost:0,tier:'PUBLIC'};
 const job={scope:'dashboard',capability:'code',remaining_budget:0};
 assert.equal(selectAuthorizedAgent(job,[provider],config).id,provider.id);
 assert.equal(selectAuthorizedAgent(job,[{...provider,remaining_quota:0}],config),null);
 assert.equal(selectAuthorizedAgent({...job,scope:'security'},[provider],config),null);
});
test('Aider refuses sensitive and unbounded edits before invoking CLI',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sep01-adapter-test-'));
 try{
  writeFileSync(join(root,'safe.js'),'export const x=1;\n');
  const run=createAiderAdapter({cwd:root,model:'nvidia/nemotron-3-ultra-550b-a55b:free',apiKey:'fixture'});
  await assert.rejects(run({scope:'security',locked_paths:['safe.js'],instruction:'change it'}),/TIER1/);
  await assert.rejects(run({scope:'dashboard',locked_paths:['../outside.js'],instruction:'change it'}),/UNSAFE_PATH/);
  await assert.rejects(run({scope:'dashboard',locked_paths:['safe.js','other.js'],instruction:'change it'}),/BOUNDED_JOB/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
