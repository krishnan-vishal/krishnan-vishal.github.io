'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {snapshot,SIZE}=require('./m43-stream-archive.cjs');
test('large snapshot, interruption, deduplication and reconstruction',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gpir-m43-'));
 try {
 const file=path.join(dir,'fixture');
 const original=crypto.randomBytes(2*SIZE+123);
 await fs.writeFile(file,original);
 const store=new Map(); let calls=0;
 const send=async b=>{const id=crypto.createHash('sha256').update(b).digest('hex'); const reused=store.has(id); store.set(id,Buffer.from(b)); return {status:'READBACK_VERIFIED',reused};};
 await assert.rejects(snapshot(file,async b=>{if(++calls===2)throw Error('interrupted');return send(b);}),/interrupted/);
 assert.equal(store.size,1);
 const result=await snapshot(file,send);
 assert.equal(result.chunks,3);
 assert.equal(store.size,4);
 const manifest=JSON.parse(store.get(result.manifestSha256));
 const recovered=Buffer.concat(manifest.chunks.map(c=>store.get(c.sha256)));
 assert.deepEqual(recovered,original);
 assert.equal(crypto.createHash('sha256').update(recovered).digest('hex'),manifest.sha256);
 await assert.rejects(snapshot(file,async()=>({status:'FAILED'})),/not verified/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
