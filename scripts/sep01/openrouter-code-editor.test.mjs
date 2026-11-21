import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
test('model edit returns bounded replacement without executing instructions',async()=>{
 let payload;
 const edit=createOpenRouterCodeEditor({apiKey:'fixture',model:'approved/model',fetchImpl:async(_url,opts)=>{
  payload=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({content:'export const x=2;'})}}]})};
 }});
 assert.deepEqual(await edit({job:{instruction:'change value'},path:'src/file.js',content:'export const x=1;'}),{status:'EDIT',content:'export const x=2;'});
 assert.equal(payload.messages[1].role,'user');
});
test('HTTP 429 fails over without generating a replacement',async()=>{
 const edit=createOpenRouterCodeEditor({apiKey:'fixture',model:'approved/model',fetchImpl:async()=>({status:429,ok:false})});
 assert.deepEqual(await edit({job:{instruction:'change'},path:'src/file.js',content:'old'}),{status:'QUOTA_EXHAUSTED'});
});

test('OpenRouter receives bounded append context and preserves the complete baseline',async()=>{
 let payload;
 const original='# Existing M41 report\n'+'Baseline. '.repeat(5000);
 const job={scope:'development',instruction:'Append a clearly labelled section titled "SEP-01 Owner Command Acceptance Test" without altering existing content.'};
 const edit=createOpenRouterCodeEditor({apiKey:'fixture',model:'approved/model',fetchImpl:async(_url,opts)=>{
  payload=JSON.parse(opts.body);
  return {ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({content:'## SEP-01 Owner Command Acceptance Test\n\nNon-production test.'})}}]})};
 }});
 const result=await edit({job,path:'docs/M41-FULL-CUTOVER-REPORT.md',content:original});
 assert.equal(result.status,'EDIT');assert.ok(result.content.startsWith(original));
 assert.ok(JSON.parse(payload.messages[1].content).content.length<=4000);
});
test('OpenRouter malformed JSON and truncated output cannot become edits',async()=>{
 const input={job:{scope:'fixture',instruction:'Change file'},path:'fixture.txt',content:'before'};
 const malformed=createOpenRouterCodeEditor({apiKey:'fixture',model:'approved/model',fetchImpl:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:'not JSON'}}]})})});
 assert.equal((await malformed(input)).status,'PROVIDER_RESPONSE_INVALID');
 const truncated=createOpenRouterCodeEditor({apiKey:'fixture',model:'approved/model',fetchImpl:async()=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:'length',message:{content:'partial'}}]})})});
 assert.equal((await truncated(input)).reason,'TRUNCATED_OUTPUT');
});
