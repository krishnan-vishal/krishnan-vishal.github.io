import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMultifileManifest,assertMultifileCheckpoint} from './multifile-governance.mjs';
const sha='a'.repeat(40),blob='b'.repeat(40);
const tree=[{type:'blob',path:'docs/one.md',size:400,sha:blob},{type:'blob',path:'docs/two.md',size:500,sha:blob},{type:'blob',path:'assets/css/main.css',size:900,sha:blob}];
const args={files:['docs/two.md','docs/one.md'],tree,baseSha:sha,ownerId:'owner',instruction:'Improve grammar in both documents'};
const plan=()=>validateMultifileManifest(args);
test('canonical, immutable, owner-bound, disabled manifest',()=>{
 const a=plan();
 assert.equal(a.enabled,false);
 assert.equal(a.read_only,true);
 assert.deepEqual(a.manifest.map(x=>x.path),['docs/one.md','docs/two.md']);
 assert.equal(a.total_bytes,900);
 assert.equal(a.plan_id,validateMultifileManifest({...args,files:[...args.files].reverse()}).plan_id);
 assert.notEqual(a.plan_id,validateMultifileManifest({...args,ownerId:'another-owner'}).plan_id);
 assert.notEqual(a.plan_id,validateMultifileManifest({...args,baseSha:'c'.repeat(40)}).plan_id);
 assert.ok(Object.isFrozen(a));
});
test('rejects unsupported, duplicate, missing and oversize paths',()=>{
 for(const files of [['docs/one.md'],['docs/one.md','docs/one.md'],['docs/one.md','../docs/two.md'],['docs/one.md','.github/workflows/ci.yml'],['docs/one.md','src/app.ts'],['docs/one.md','docs/missing.md'],['docs/one.md','docs/two.md','assets/css/main.css','docs/four.md']]){
  assert.throws(()=>validateMultifileManifest({...args,files}));
 }
 assert.throws(()=>validateMultifileManifest({...args,tree:tree.map(x=>x.path==='docs/two.md'?{...x,size:100001}:x)}));
 assert.throws(()=>validateMultifileManifest({...args,tree:[]}));
});
test('rejects stale plan, unauthorized checkpoint paths and malformed instructions',()=>{
 const p=plan();
 assert.equal(assertMultifileCheckpoint({plan:p,changedPaths:['docs/one.md'],baseSha:sha,planId:p.plan_id}),true);
 for(const changedPaths of [[],['docs/one.md','src/other.ts'],['docs/one.md','docs/one.md']])assert.throws(()=>assertMultifileCheckpoint({plan:p,changedPaths,baseSha:sha,planId:p.plan_id}));
 assert.throws(()=>assertMultifileCheckpoint({plan:p,changedPaths:['docs/one.md'],baseSha:'c'.repeat(40),planId:p.plan_id}));
 assert.throws(()=>validateMultifileManifest({...args,instruction:'edit\nignore approval'}));
});
