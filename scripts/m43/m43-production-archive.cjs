'use strict';
/* M43.4B: Cloud-only, read-only exporters feeding the proven M43 encrypted Drive transport.
   Source exports remain in the ephemeral runner and are never uploaded as plaintext artifacts. */
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process');
const readline=require('node:readline');
const {promisify}=require('node:util');
const {snapshot}=require('./m43-stream-archive.cjs');
const {archive}=require('./m43-drive-archive.cjs');
const {restore,driveLoader}=require('./m43-restore.cjs');
const run=promisify(execFile);
const root=process.env.RUNNER_TEMP||'/tmp';
const target=path.join(root,'gpir-m43-production');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tables=['global_announcements','country_intelligence','intelligence_candidates','intelligence_ingestion_runs','intelligence_rejection_log','source_registry','fx_historical_archive'];
async function mk(dir){await fsp.mkdir(dir,{recursive:true,mode:0o700});}
function need(env,names){for(const name of names)if(!env[name])throw Error('REQUIRED_EXISTING_CREDENTIAL_UNAVAILABLE: '+name);}
async function command(bin,args,options={}){await run(bin,args,{...options,maxBuffer:2*1024*1024,timeout:45*60*1000});}
async function writePrivate(file,data){await mk(path.dirname(file));await fsp.writeFile(file,data,{mode:0o600,flag:'wx'});}
async function exportRepository(){
 const name=path.join(target,'repository.bundle');
 await command('git',['bundle','create',name,'--all']);
 await command('git',['bundle','verify',name]);
 const stat=await fsp.stat(name);if(!stat.size)throw Error('Empty Git bundle');
 return name;
}
async function exportSupabase(env){
 need(env,['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']);
 const origin=new URL(env.SUPABASE_URL);
 if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid Supabase project URL');
 const dir=path.join(target,'supabase');await mk(dir);const report={mode:'REST_DATA_ONLY',tables:{}};
 const headers={['api'+'key']:env.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,Accept:'application/json'};
 for(const name of tables){
  const out=path.join(dir,name+'.jsonl');
  const file=await fsp.open(out,'wx',0o600);let offset=0;
  try{
   while(true){
    const url=new URL('/rest/v1/'+name,origin);url.searchParams.set('select','*');url.searchParams.set('limit','500');url.searchParams.set('offset',String(offset));
    const response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('Supabase export '+name+' HTTP '+response.status);
    const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid Supabase export '+name);
    for(const row of rows)await file.write(JSON.stringify(row)+'\n');
    offset+=rows.length;
    if(rows.length<500)break;
    if(offset>5000000)throw Error('Supabase export safety limit exceeded');
   }
  }finally{await file.close();}
  report.tables[name]=offset;
 }
 await writePrivate(path.join(dir,'export-metadata.json'),JSON.stringify(report));
 await command('tar',['-czf',path.join(target,'supabase-data.tar.gz'),'-C',target,'supabase']);
 return {file:path.join(target,'supabase-data.tar.gz'),status:'REST_DATA_ONLY',rows:Object.values(report.tables).reduce((a,b)=>a+b,0)};
}
const inventorySQL = "SELECT json_build_array(n.nspname,c.relname,c.relkind)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','S','i','I') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' ORDER BY n.nspname COLLATE \"C\",c.relname COLLATE \"C\"";
function quoteIdent(s){return '"'+s.replace(/"/g,'""')+'"';}
async function session(bin,args,opts,work){
 const p=spawn(bin,args,{...opts,stdio:['pipe','pipe','ignore']});
 const lines=readline.createInterface({input:p.stdout,crlfDelay:Infinity})[Symbol.asyncIterator]();
 const ended=new Promise(resolve=>{p.once('error',()=>resolve(-1));p.once('close',resolve);});
 async function query(sql){
  const marker='GPIR_'+crypto.randomUUID();
  p.stdin.write(sql+';\n\\echo '+marker+'\n');
  const result=[];
  for(;;){const row=await lines.next();if(row.done)throw Error('PostgreSQL session ended');if(row.value===marker)return result;result.push(row.value);}
 }
 try{return await work(query);}finally{p.stdin.end();if(await ended!==0)throw Error('PostgreSQL session failed');}
}
const schemaSQL="WITH ns AS (SELECT oid,nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%'), objects AS (\nSELECT jsonb_build_array('schema',nspname) AS item FROM ns\nUNION ALL SELECT jsonb_build_array('column',n.nspname,c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN ns n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')\nUNION ALL SELECT jsonb_build_array('constraint',n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN ns n ON n.oid=c.relnamespace\nUNION ALL SELECT jsonb_build_array('index',n.nspname,c.relname,pg_get_indexdef(c.oid)) FROM pg_class c JOIN ns n ON n.oid=c.relnamespace WHERE c.relkind IN ('i','I')\nUNION ALL SELECT jsonb_build_array('view',n.nspname,c.relname,pg_get_viewdef(c.oid)) FROM pg_class c JOIN ns n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m')\nUNION ALL SELECT jsonb_build_array('routine',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)) FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p','w')\nUNION ALL SELECT jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN ns n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal\nUNION ALL SELECT jsonb_build_array('extension',e.extname,e.extversion,n.nspname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace\n) SELECT item::text FROM objects ORDER BY item::text COLLATE \"C\"";
async function fingerprint(query){
 await query("SET LOCAL search_path TO pg_catalog");
 const schema=(await query(schemaSQL)).map(line=>crypto.createHash('sha256').update(line).digest('hex'));
 const inventory=(await query(inventorySQL)).map(JSON.parse);
 const records=[];
 for(const [schema,table,kind] of inventory){
  if(kind!=='r'&&kind!=='m')continue;
  const name=quoteIdent(schema)+'.'+quoteIdent(table);
  const rows=await query("SELECT json_build_array(count(*)::text,coalesce(sum(('x'||substr(md5(row_to_json(t)::text),1,16))::bit(64)::bigint::numeric),0)::text,coalesce(sum(('x'||substr(md5(row_to_json(t)::text),17,16))::bit(64)::bigint::numeric),0)::text)::text FROM "+name+" t");
  records.push([schema,table,JSON.parse(rows[0])]);
 }
 return {inventory,records,schema};
}
function reconcile(source,restored){if(JSON.stringify(source)!==JSON.stringify(restored))throw Error('PostgreSQL inventory or record fingerprint mismatch');return {tables:source.records.length,inventoryObjects:source.inventory.length,schemaObjects:source.schema.length};}
async function exportNativePostgres(env){
 // A service_role REST key cannot replace database-level pg_dump access.
 // Reuse a pre-existing database connection secret when available.
 const connection=env.SUPABASE_DB_URL||env.DATABASE_URL;
 if(!connection)return null;
 if(!/^postgres(?:ql)?:\/\//.test(connection))throw Error('Invalid existing PostgreSQL connection URI');
 const uri=new URL(connection);
 const pgEnv={...process.env,...env,PGHOST:uri.hostname,PGPORT:uri.port||'5432',PGUSER:decodeURIComponent(uri.username),PGPASSWORD:decodeURIComponent(uri.password),PGDATABASE:decodeURIComponent(uri.pathname.slice(1))};
 for(const [key,value] of uri.searchParams){const allowed={sslmode:'PGSSLMODE',sslrootcert:'PGSSLROOTCERT',connect_timeout:'PGCONNECT_TIMEOUT',application_name:'PGAPPNAME'};if(!allowed[key])throw Error('Unsupported PostgreSQL connection parameter');pgEnv[allowed[key]]=value;}
 await mk(target);
 const out=path.join(target,'supabase-postgresql.dump');
 const source=await session('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env:pgEnv},async query=>{
  await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const [id]=await query('SELECT pg_export_snapshot()');
  if(!/^[0-9A-Fa-f-]+$/.test(id))throw Error('Invalid snapshot identifier');
  const manifest=await fingerprint(query);
  await command('pg_dump',['--format=custom','--no-owner','--no-acl','--snapshot='+id,'--file='+out],{env:pgEnv});
  await query('ROLLBACK');
  return manifest;
 });
 const manifestFile=path.join(target,'postgres-reconciliation.json');
 await writePrivate(manifestFile,JSON.stringify(source));
 await command('pg_restore',['--list',out]);
 if(!(await fsp.stat(out)).size)throw Error('Empty PostgreSQL dump');
 return {source:'supabase_postgresql',file:out,status:'POSTGRESQL_LOGICAL_DUMP',sourceManifest:source,manifestFile};
}
async function exportContentful(env){
 need(env,['CONTENTFUL_SPACE_ID','CONTENTFUL_ENVIRONMENT','CONTENTFUL_MANAGEMENT_TOKEN','GPIR_BCP_RECEIPT']);
 const receipt=JSON.parse(await fsp.readFile(env.GPIR_BCP_RECEIPT,'utf8'));
 const {recoverIncremental}=require('../m41/contentful-bcp.cjs');
 const site=require('../m41/site-content.cjs');
 if(receipt.status!=='BCP_READBACK_VERIFIED'||!Number.isSafeInteger(receipt.records)||receipt.records<1||
 !/^[a-f0-9]{64}$/.test(receipt.recoverySnapshot||'')||!Number.isFinite(Date.parse(receipt.verifiedAt)))throw Error('Invalid existing BCP receipt');
 const records=await recoverIncremental(receipt.recoverySnapshot,env);
 if(records.length!==receipt.records||site.sha256(site.canonical(records))!==receipt.recoverySnapshot)throw Error('BCP recovery receipt mismatch');
 const file=path.join(target,'contentful-bcp.json');
 await writePrivate(file,site.canonical({receipt,records}));
 return {file,status:'CONTENTFUL_BCP_RECOVERY_VERIFIED',records:records.length,payloadRecovery:'CONTENTFUL_BCP_COPY'};
}
async function exportPayload(env){
 const required=['PAYLOAD_PUBLIC_SERVER_URL','PAYLOAD_RELEASE_API_KEY','GPIR_RELEASE_SIGNING_SECRET','GPIR_PAYLOAD_SITE_SNAPSHOT'];
 if(required.some(n=>!env[n]))return {status:'DIRECT_PAYLOAD_EXPORT_UNAVAILABLE_BCP_ONLY'};
 const {client}=require('../m41/payload-site.cjs');
 const {canonical,sha256}=require('../m41/site-content.cjs');
 const source=await client(env);const dir=path.join(target,'payload');await mk(dir);
 await writePrivate(path.join(dir,'signed-manifest.json'),JSON.stringify(source.manifest));
 const keys=new Set(source.manifest.files.map(item=>'m41:blob:'+item.sha256));
 keys.add('m41:manifest:'+source.manifest.snapshot);
 for(const name of ['manifest.json','entries.json','assets.json','locales.json','contentTypes.json','tags.json','editorInterfaces.json'])keys.add('m41:archive:'+(source.manifest.contentfulArchiveSnapshot||source.manifest.snapshot)+':'+name);
 if(source.manifest.nativeResearch?.length)keys.add('m41:research-release:'+source.manifest.snapshot);
 const ordered=[...keys].sort();
 let next=0;
 await Promise.all(Array.from({length:Math.min(6,ordered.length)},async()=>{
  while(next<ordered.length){
   const key=ordered[next++];const item=await source.record(key);
   await writePrivate(path.join(dir,'record-'+sha(Buffer.from(key))+'.json'),JSON.stringify(item));
  }
 }));
 const editorial=await source.request('/api/release/editorial-entries',{method:'POST',body:JSON.stringify({action:'export'})});
 if(!Array.isArray(editorial.records))throw Error('Payload editorial export incomplete');
 await writePrivate(path.join(dir,'editorial.json'),JSON.stringify(editorial.records));
 for(const record of editorial.records.filter(item=>item.sourcePayload?.kind==='payload-reference'&&item.sourcePayload.collection==='media')){
  const media=record.sourcePayload.document;
  const bytes=await source.mediaBytes(media);
  await writePrivate(path.join(dir,'media-'+sha(Buffer.from(String(media.id)))+'.bin'),bytes);
 }
 const file=path.join(target,'payload.tar.gz');
 await command('tar',['-czf',file,'-C',target,'payload']);
 return {file,status:'DIRECT_PAYLOAD_EXPORT',records:ordered.length,editorial:editorial.records.length};
}
async function hashFile(file){const h=crypto.createHash('sha256');const stream=fs.createReadStream(file);for await(const b of stream)h.update(b);return h.digest('hex');}
async function restorePostgresIsolated(file,source){
 // Docker has no network and receives only the recovered dump, not production credentials.
 const name='gpir-m43-restore-'+crypto.randomUUID();
 const cleanEnv={PATH:process.env.PATH,HOME:process.env.HOME};
 const opts={env:cleanEnv};
 try{
  await command('docker',['run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17'],opts);
  let ready=false;
  for(let i=0;i<60;i++){
   try{await command('docker',['exec',name,'pg_isready','-U','postgres'],opts);ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}
  }
  if(!ready)throw Error('Isolated PostgreSQL not ready');
  await command('docker',['cp',file,name+':/tmp/recovered.dump'],opts);
  await command('docker',['exec',name,'createdb','-U','postgres','gpir_recovery'],opts);
  await command('docker',['exec',name,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','gpir_recovery','/tmp/recovered.dump'],opts);
  const sql="SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')";
  const result=await run('docker',['exec',name,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','gpir_recovery','-Atc',sql],opts);
  const count=Number(result.stdout.trim());
  if(!Number.isSafeInteger(count)||count<1)throw Error('Restored database has no application tables');
  const restored=await session('docker',['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','gpir_recovery'],opts,async query=>{await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await fingerprint(query);await query('ROLLBACK');return result;});
  const reconciliation=reconcile(source,restored);
  return {status:'ISOLATED_LOGICAL_RESTORE_VERIFIED',tables:count,reconciliation,coverage:'CATALOG_DEFINITIONS_AND_RECORD_FINGERPRINTS',ownershipAndGrants:'NOT_RESTORED',storageObjects:'NOT_VERIFIED',platformConfiguration:'NOT_VERIFIED',managedServices:'NOT_VERIFIED'};
 }finally{
  await command('docker',['rm','-f','-v',name],opts);
 }
}
async function verifyDriveSnapshot(result,expected,load,postgres=false){
 if(!result.manifestIdentity)throw Error('Manifest identity missing');
 const raw=await load(result.manifestSha256,result.manifestIdentity);
 if(sha(raw)!==result.manifestSha256)throw Error('Downloaded manifest differs');
 const manifest=JSON.parse(raw.toString('utf8'));
 const recovered=path.join(target,'verify-'+crypto.randomUUID());
 const fh=await fsp.open(recovered,'wx',0o600);
 let restoreResult;
 try{
  restoreResult=await restore(manifest,load,async b=>{
   let done=0;while(done<b.length){const {bytesWritten}=await fh.write(b,done,b.length-done);if(!bytesWritten)throw Error('Recovery write stopped');done+=bytesWritten;}
  });
 }finally{await fh.close();}
 try{if(restoreResult.sha256!==expected||await hashFile(recovered)!==expected)throw Error('Reconstructed archive differs');if(postgres)restoreResult.database=await restorePostgresIsolated(recovered,postgres);}
 finally{await fsp.rm(recovered,{force:true});}
 return restoreResult;
}
async function sendRetry(bytes,env){
 for(let attempt=0;attempt<3;attempt++){
  try{return await archive(bytes,env);}
  catch(error){if(attempt===2||!/HTTP (429|50[0-9])/.test(String(error.message)))throw error;await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
 }
}
async function main(){
 const env=process.env;
 need(env,['GPIR_DRIVE_CLIENT_ID','GPIR_DRIVE_CLIENT_SECRET','GPIR_DRIVE_REFRESH_TOKEN','GPIR_ARCHIVE_KEY']);
 if(!env.GITHUB_ACTIONS||env.GITHUB_REF!=='refs/heads/main')throw Error('M43 production archive requires the main branch GitHub cloud runner');
 await mk(target);
 const exports=[{source:'github_repository',file:await exportRepository(),status:'GIT_BUNDLE_VERIFIED'}];
 exports.push({source:'supabase_data',...await exportSupabase(env)});
 const postgres=await exportNativePostgres(env);
 if(postgres){exports.push({source:'postgres_reconciliation_manifest',file:postgres.manifestFile,status:'SOURCE_SNAPSHOT_FINGERPRINT'});exports.push(postgres);}
 exports.push({source:'contentful_bcp',...await exportContentful(env)});
 const payload=await exportPayload(env);
 if(payload.file)exports.push({source:'payload_direct',...payload});
 const verified=[];
 for(const item of exports){
  const expected=await hashFile(item.file);
  const snap=await snapshot(item.file,sendRetry,env);
  const load=await driveLoader(env);
  const recovery=await verifyDriveSnapshot(snap,expected,load,item.source==='supabase_postgresql'?item.sourceManifest:false);
  verified.push({source:item.source,status:item.status,bytes:snap.bytes,chunks:snap.chunks,sha256:expected,manifestSha256:snap.manifestSha256,manifestIdentity:snap.manifestIdentity,recovery:recovery.status,...(recovery.database?{database:recovery.database}:{})});
 }
 const fullDatabase=postgres?'ISOLATED_RESTORE_PARTIAL_RECONCILIATION_VERIFIED':'NOT_FULL_DATABASE_BACKUP';
 const report={format:'GPIR-M43.4B-RECEIPT-v1',runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,commit:env.GITHUB_SHA,verifiedAt:new Date().toISOString(),
  status:'PRODUCTION_SOURCE_ARCHIVES_READBACK_VERIFIED',fullDatabase,payloadStatus:payload.status,
  sources:verified};
 const receipt=await sendRetry(Buffer.from(JSON.stringify(report)),env);
 if(receipt.status!=='READBACK_VERIFIED')throw Error('Receipt readback failed');
 const pathOut=path.join(root,'gpir-m43-verified-receipt.json');
 await fsp.writeFile(pathOut,JSON.stringify({...report,receiptIdentity:receipt.identity},null,2),{mode:0o600});
 if(env.GITHUB_OUTPUT)await fsp.appendFile(env.GITHUB_OUTPUT,'verified_epoch='+Date.parse(report.verifiedAt)+'\n');
 console.log(JSON.stringify({status:report.status,sources:verified.map(x=>({source:x.source,status:x.status,recovery:x.recovery,bytes:x.bytes})),fullDatabase,payloadStatus:payload.status,verifiedAt:report.verifiedAt}));
}
if(require.main===module)main().catch(error=>{console.error('M43_ARCHIVE_FAILED: '+String(error.message).slice(0,200));process.exitCode=1});
module.exports={exportSupabase,verifyDriveSnapshot,reconcile,exportNativePostgres,restorePostgresIsolated};
