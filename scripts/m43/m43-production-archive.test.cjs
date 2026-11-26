'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {snapshot}=require('./m43-stream-archive.cjs');
const {restore}=require('./m43-restore.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('M43 production manifests drive independent reconstruction, preserving identity',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'m43-prod-'));
 try{
  const file=path.join(dir,'fixture');const original=crypto.randomBytes(1024*1024+37);
  await fs.writeFile(file,original);
  const storage=new Map();
  const send=async bytes=>{const digest=sha(bytes);storage.set(digest,Buffer.from(bytes));return {status:'READBACK_VERIFIED',identity:digest,reused:false};};
  const receipt=await snapshot(file,send);
  assert.equal(receipt.status,'CHUNKS_AND_MANIFEST_READBACK_VERIFIED');
  assert.equal(receipt.manifest.chunks[0].identity,sha(original));
  const downloaded=storage.get(receipt.manifestSha256);
  assert.deepEqual(JSON.parse(downloaded),receipt.manifest);
  const chunks=[];const verified=await restore(receipt.manifest,async(digest,identity)=>{
   assert.equal(digest,identity);return storage.get(digest);
  },async bytes=>chunks.push(bytes));
  assert.equal(verified.status,'SNAPSHOT_RECOVERY_VERIFIED');
  assert.deepEqual(Buffer.concat(chunks),original);
  const corrupt=Buffer.from(original);corrupt[0]^=1;storage.set(sha(original),corrupt);
  await assert.rejects(restore(receipt.manifest,async digest=>storage.get(digest),async()=>{}),/integrity/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('production exports refuse to run without existing source credentials',async()=>{
 const {exportSupabase}=require('./m43-production-archive.cjs');
 await assert.rejects(exportSupabase({}),/REQUIRED_EXISTING_CREDENTIAL_UNAVAILABLE/);
});

test('reconciliation rejects schema, inventory and record discrepancies',()=>{
 const {reconcile}=require('./m43-production-archive.cjs');
 const source={inventory:[['public','example','r']],records:[['public','example',['2','10','20']]],schema:['definition']};
 assert.deepEqual(reconcile(source,structuredClone(source)),{tables:1,inventoryObjects:1,schemaObjects:1});
 for(const key of ['inventory','records','schema']){
  const changed=structuredClone(source);changed[key]=[];
  assert.throws(()=>reconcile(source,changed),/mismatch/);
 }
});
