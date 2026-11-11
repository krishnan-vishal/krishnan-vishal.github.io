import test from 'node:test';
import assert from 'node:assert/strict';
import { handleM40OIDC } from '../../supabase/functions/gpir-m40-oidc-gate/handler.mjs';
const url='https://example.test/functions/v1/gpir-m40-oidc-gate';
const request=(body,auth,method='POST')=>new Request(url,{method,headers:{
 'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})
},...(method==='POST'?{body:JSON.stringify(body)}:{})});
test('missing authorization denied without invoking verifier',async()=>{
 const response=await handleM40OIDC(request({operation:'verify-only'}),()=>{throw Error('called');});
 assert.equal(response.status,401);
});
test('invalid OIDC rejected',async()=>{
 const response=await handleM40OIDC(request({operation:'verify-only'},'invalid.jwt.token'));
 assert.equal(response.status,401);
});
test('registration request forbidden even with a valid verifier',async()=>{
 const response=await handleM40OIDC(request({operation:'register'},'valid.token'),async()=>{throw Error('should not run');});
 assert.equal(response.status,403);
});
test('valid OIDC permits verification only and never registration',async()=>{
 const response=await handleM40OIDC(request({operation:'verify-only'},'valid.token'),async()=>({repository:'expected'}));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{status:'OIDC_VERIFIED',registration:'DISABLED'});
});
test('GET cannot invoke verifier',async()=>{
 const response=await handleM40OIDC(request(null,null,'GET'),()=>{throw Error('called');});
 assert.equal(response.status,405);
});
