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

test('reconciliation rejects schema, inventory, count and SHA-256 record discrepancies',()=>{
 const {reconcile}=require('./m43-production-archive.cjs');
 const source={inventory:[['public','example','r']],records:[['public','example','2','a'.repeat(64)]],schema:['a'.repeat(64)]};
 assert.deepEqual(reconcile(source,structuredClone(source)),{tables:1,inventoryObjects:1,schemaObjects:1});
 for(const key of ['inventory','records','schema']){
  const changed=structuredClone(source);changed[key]=[];
  assert.throws(()=>reconcile(source,changed),/mismatch/);
 }
 for(const index of [2,3]){
  const changed=structuredClone(source);
  changed.records[0][index]=index===2?'3':'b'.repeat(64);
  assert.throws(()=>reconcile(source,changed),/mismatch/);
 }
});

const sampleSha='a'.repeat(64);
function sampleManifest(){
 return {format:'GPIR-M43-POSTGRES-RECONCILIATION-v2',
  rowHashMethod:'SHA256_SORTED_ROW_JSON_LENGTH_PREFIXED',
  dumpSha256:sampleSha,inventory:[['public','example','r']],schema:[sampleSha],
  records:[['public','example','2',sampleSha]]};
}
test('recovered PostgreSQL manifest rejects mismatched dump identity and malformed hashes',()=>{
 const {validateReconciliationManifest}=require('./m43-production-archive.cjs');
 const manifest=sampleManifest();
 assert.deepEqual(validateReconciliationManifest(manifest,sampleSha),manifest);
 assert.throws(()=>validateReconciliationManifest(manifest,'b'.repeat(64)),/identity mismatch/);
 for(const edit of [
  m=>{m.format='GPIR-UNKNOWN';},m=>{m.rowHashMethod='MD5';},
  m=>{m.dumpSha256='broken';},m=>{m.records[0][3]='broken';},
  m=>{m.records[0][2]='-1';},m=>{m.schema[0]='broken';}
 ]){
  const changed=structuredClone(manifest);edit(changed);
  assert.throws(()=>validateReconciliationManifest(changed,sampleSha),/invalid/);
 }
});
test('independently reconstructed encrypted manifest is bound to its dump',async()=>{
 const {verifyDriveSnapshot,validateReconciliationManifest}=require('./m43-production-archive.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'m43-pg-manifest-'));
 try{
  const source=sampleManifest(), file=path.join(dir,'reconciliation.json');
  await fs.writeFile(file,JSON.stringify(source));
  const storage=new Map();
  const send=async bytes=>{
   const hash=sha(bytes);storage.set(hash,Buffer.from(bytes));
   return {status:'READBACK_VERIFIED',identity:hash};
  };
  const result=await snapshot(file,send);
  const load=async(digest,identity)=>{
   assert.equal(digest,identity);
   return storage.get(digest);
  };
  const recovered=await verifyDriveSnapshot(result,sha(await fs.readFile(file)),load,'reconciliation-manifest');
  assert.deepEqual(recovered.recoveredManifest,source);
  assert.deepEqual(validateReconciliationManifest(recovered.recoveredManifest,source.dumpSha256),source);
  assert.throws(()=>validateReconciliationManifest(recovered.recoveredManifest,'b'.repeat(64)),/identity mismatch/);
  const manifestBytes=storage.get(result.manifestSha256);
  storage.set(result.manifestSha256,Buffer.from('tampered'));
  await assert.rejects(verifyDriveSnapshot(result,sha(await fs.readFile(file)),load,'reconciliation-manifest'),/Downloaded manifest differs/);
  storage.set(result.manifestSha256,manifestBytes);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
