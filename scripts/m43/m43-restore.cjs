'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const {open}=require('./m43-drive-archive.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const folder='1xuLLW2zCn_IRreNwBdQRuETzAcLDmgKz';
async function restore(manifest,load,write){
 const hash=crypto.createHash('sha256');let offset=0;
 if(manifest.format!=='GPIR-M43-v1'||!Array.isArray(manifest.chunks))throw Error('Invalid manifest');
 for(const [index,c] of manifest.chunks.entries()){
  if(c.index!==index||c.offset!==offset||!Number.isSafeInteger(c.bytes)||c.bytes<1||c.bytes>16*1024*1024)throw Error('Invalid chunk layout');
  const b=await load(c.sha256,c.identity);
  if(b.length!==c.bytes||sha(b)!==c.sha256)throw Error('Chunk integrity failure');
  hash.update(b);await write(b);offset+=b.length;
 }
 if(offset!==manifest.bytes||hash.digest('hex')!==manifest.sha256)throw Error('Snapshot integrity failure');
 return {status:'SNAPSHOT_RECOVERY_VERIFIED',bytes:offset,sha256:manifest.sha256};
}
async function driveLoader(env){
 if(!/^[a-f0-9]{64}$/i.test(env.GPIR_ARCHIVE_KEY||''))throw Error('Invalid archive key');
 const key=Buffer.from(env.GPIR_ARCHIVE_KEY,'hex');
 async function checked(url,opts){const r=await fetch(url,{...opts,redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Recovery HTTP '+r.status);return r;}
 const t=await (await checked('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GPIR_DRIVE_CLIENT_ID,client_secret:env.GPIR_DRIVE_CLIENT_SECRET,refresh_token:env.GPIR_DRIVE_REFRESH_TOKEN,grant_type:'refresh_token'})})).json();
 if(!t.access_token)throw Error('Missing access token');
 const headers={authorization:'Bearer '+t.access_token};
 // Existing archives are indexed by keyed plaintext identity, not public SHA.
 // Enumerate authorized archive objects and build a verified digest index on demand.
 const base='https://www.googleapis.com/drive/v3';
 const index=new Map();let pageToken;
 do{
 const q=new URLSearchParams({q:"'"+folder+"' in parents and trashed = false",fields:'nextPageToken,files(id,appProperties)',pageSize:'1000'});
 if(pageToken)q.set('pageToken',pageToken);
 const p=await(await checked(base+'/files?'+q,{headers})).json();
 for(const f of p.files||[])if(f.appProperties?.gpirIdentity)index.set(f.appProperties.gpirIdentity,f.id);
 pageToken=p.nextPageToken;
 }while(pageToken);
 return async(expectedSha,identity)=>{
 if(!/^[a-f0-9]{64}$/i.test(identity||'')||!/^[a-f0-9]{64}$/i.test(expectedSha||''))throw Error('Invalid manifest identity');
 const id=index.get(identity);if(!id)throw Error('Archive object missing');
 const b=open(Buffer.from(await(await checked(base+'/files/'+encodeURIComponent(id)+'?alt=media',{headers})).arrayBuffer()),key);
 if(sha(b)!==expectedSha||crypto.createHmac('sha256',key).update(b).digest('hex')!==identity)throw Error('Archive identity mismatch');
 return b;
 };
}
module.exports={restore,driveLoader};
