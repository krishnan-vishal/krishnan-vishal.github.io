import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodexCliEditor,classifyCodexFailure} from './codex-cli-editor.mjs';
const job={scope:'fixture',instruction:'Replace fixture',sensitivity_tier:null};
const args={job,path:'scripts/sep01/acceptance-fixture.txt',content:'before'};
test('Codex CLI requires explicit opt-in and verified auth',()=>assert.throws(()=>createCodexCliEditor({model:'codex-test'}),/NOT_AUTHORIZED/));
test('Codex CLI read-only bounded execution produces replacement content',async()=>{
 let captured;
 const editor=createCodexCliEditor({model:'codex-test',enabled:true,authenticated:true,spawnImpl:(bin,argv,opts)=>{captured={bin,argv,opts};return {status:0,stdout:JSON.stringify({content:'after'})}}});
 assert.deepEqual(await editor(args),{status:'EDIT',content:'after'});
 assert.equal(captured.bin,'codex');assert.ok(captured.argv.includes('read-only'));assert.ok(!captured.argv.includes('danger-full-access'));
 assert.ok(!('OPENAI_API_KEY' in captured.opts.env));assert.ok(!('SUPABASE_SERVICE_ROLE_KEY' in captured.opts.env));
});
test('Codex CLI quota output safely pauses provider',async()=>{
 const editor=createCodexCliEditor({model:'codex-test',enabled:true,authenticated:true,spawnImpl:()=>({status:1,stderr:'Usage limit reached'})});
 assert.equal((await editor(args)).status,'QUOTA_EXHAUSTED');
});
test('Codex CLI auth failures are not treated as quota',()=>assert.equal(classifyCodexFailure('Authentication required'),'PROVIDER_UNAVAILABLE'));
test('Codex CLI invalid output never passes as edit',async()=>{
 const editor=createCodexCliEditor({model:'codex-test',enabled:true,authenticated:true,spawnImpl:()=>({status:0,stdout:'not-json'})});
 assert.equal((await editor(args)).status,'INVALID_EDIT');
});
test('Codex CLI sensitive job blocked',async()=>{
 const editor=createCodexCliEditor({model:'codex-test',enabled:true,authenticated:true,spawnImpl:()=>{throw Error('unexpected execution')}});
 await assert.rejects(()=>editor({...args,job:{...job,scope:'payments'}}),/SENSITIVE_JOB_FORBIDDEN/);
});

test('Windows Codex npm shim preserves sign-in home without forwarding GPIR secrets',async()=>{
 let captured;
 const editor=createCodexCliEditor({model:'gpt-5.6-sol',platformName:'win32',enabled:true,authenticated:true,spawnImpl:(bin,argv,opts)=>{captured={bin,argv,opts};return {status:0,stdout:JSON.stringify({content:'after'})}}});
 assert.equal((await editor(args)).status,'EDIT');
 assert.equal(captured.bin,'cmd.exe');
 assert.deepEqual(captured.argv.slice(0,3),['/d','/s','/c']);
 assert.match(captured.argv[3],/codex exec --sandbox read-only/);
 assert.ok(!('SUPABASE_SERVICE_ROLE_KEY' in captured.opts.env));
 assert.ok(!('GITHUB_TOKEN' in captured.opts.env));
 assert.ok(!('OPENAI_API_KEY' in captured.opts.env));
 assert.ok(!captured.argv.join(' ').includes('Replace fixture'));
});
