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
