import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './cloudflare-acquisition-preview.mjs';
import {probe} from './cloudflare-acquisition-probe.mjs';
const base='https://preview.example';
const env={GPIR_PROBE_TOKEN:'synthetic-test-only',ASSETS:{fetch:async()=>new Response('asset')}};
test('existing asset routing preserved',async()=>assert.equal(await (await worker.fetch(new Request(base+'/'),env)).text(),'asset'));
test('probe denies unauthenticated requests',async()=>assert.equal((await worker.fetch(new Request(base+'/__gpir_acquisition_probe',{method:'POST'}),env)).status,403));
test('probe denies unknown sources',async()=>assert.equal((await worker.fetch(new Request(base+'/__gpir_acquisition_probe?source=unknown',{method:'POST',headers:{Authorization:'Bearer '+env.GPIR_PROBE_TOKEN}}),env)).status,400));
test('probe rejects arbitrary URLs',async()=>assert.rejects(probe('https://example.com'),/SOURCE_NOT_ALLOWED/));
test('probe reports upstream status without following redirects',async()=>{
 const result=await probe('OFAC-US-001',async(url,options)=>{
 assert.equal(options.redirect,'manual');
 assert.equal(new URL(url).hostname,'ofac.treasury.gov');
 return new Response(null,{status:403});
 });
 assert.equal(result.status,403); assert.equal(result.ok,false);
});
