// Stage 3 governance contract only. No worker, dispatch, merge or deployment activation.
import {createHash} from 'node:crypto';

export const MULTIFILE_LIMITS=Object.freeze({minFiles:2,maxFiles:3,maxFileBytes:100000,maxTotalBytes:300000});
const eligible=/^(?:docs\/[A-Za-z0-9/_-]+\.md|assets\/css\/[A-Za-z0-9/_-]+\.css)$/;
const protectedNames=/(?:^|\/)(?:\.env(?:\..*)?|secrets?|credentials?|node_modules|\.github|supabase)(?:\/|$)/i;

export function validateMultifileManifest({files,tree,baseSha,instruction,ownerId,limits=MULTIFILE_LIMITS}){
 if(!Array.isArray(files)||files.length<limits.minFiles||files.length>limits.maxFiles)throw Error('MULTIFILE_COUNT_NOT_AUTHORIZED');
 if(!Array.isArray(tree)||!tree.length)throw Error('REPOSITORY_DISCOVERY_INCOMPLETE');
 if(typeof baseSha!=='string'||!/^[a-f0-9]{40}$/.test(baseSha))throw Error('INVALID_BASE_SHA');
 if(typeof ownerId!=='string'||!ownerId.trim())throw Error('OWNER_REQUIRED');
 if(typeof instruction!=='string'||!instruction.trim()||instruction.length>1000||/[\x00-\x1f]/.test(instruction))throw Error('INVALID_INSTRUCTION');
 const paths=new Set();
 let totalBytes=0;
 const indexed=new Map(tree.filter(entry=>entry?.type==='blob'&&typeof entry.path==='string').map(entry=>[entry.path,entry]));
 const manifest=files.map(file=>{
  if(typeof file!=='string'||!eligible.test(file)||file.includes('..')||file.includes('//')||protectedNames.test(file)||paths.has(file))throw Error('MULTIFILE_PATH_NOT_AUTHORIZED');
  paths.add(file);
  const entry=indexed.get(file);
  if(!entry||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>limits.maxFileBytes||typeof entry.sha!=='string'||!/^[a-f0-9]{40}$/.test(entry.sha))throw Error('MULTIFILE_FILE_NOT_ELIGIBLE');
  totalBytes+=entry.size;
  if(totalBytes>limits.maxTotalBytes)throw Error('MULTIFILE_TOTAL_BYTES_EXCEEDED');
  return Object.freeze({path:file,size:entry.size,blob_sha:entry.sha});
 }).sort((a,b)=>a.path.localeCompare(b.path));
 const planId=createHash('sha256').update(JSON.stringify([ownerId,baseSha,instruction,manifest])).digest('hex');
 return Object.freeze({execution_route:'bounded_multifile_v1',enabled:false,read_only:true,owner_approval_required:true,requires_review:true,production_deployment:false,provider_route:'gemini_openrouter',base_sha:baseSha,manifest,total_bytes:totalBytes,plan_id:planId});
}

export function assertMultifileCheckpoint({plan,changedPaths,baseSha,planId}){
 if(!plan||plan.execution_route!=='bounded_multifile_v1'||plan.enabled!==false||baseSha!==plan.base_sha||planId!==plan.plan_id)throw Error('MULTIFILE_PLAN_STALE');
 if(!Array.isArray(changedPaths)||changedPaths.length<1||changedPaths.length>plan.manifest.length||new Set(changedPaths).size!==changedPaths.length)throw Error('MULTIFILE_UNEXPECTED_CHANGES');
 const allowed=new Set(plan.manifest.map(item=>item.path));
 if(changedPaths.some(path=>!allowed.has(path)))throw Error('MULTIFILE_UNEXPECTED_CHANGES');
 return true;
}
