// SEP-01 capacity policy. Explicitly approved models only; never assume a free-tier quota.
const windows=new Set(['minute','hour','day','week','month','rolling']);
export function validateCapacityProfile(p){
 if(!p||typeof p.id!=='string'||!p.id||p.approved!==true||p.pricing_verified!==true||p.free_verified!==true)throw Error('UNVERIFIED_FREE_PROVIDER');
 if(!Array.isArray(p.capabilities)||!p.capabilities.includes('code'))throw Error('CODING_CAPABILITY_REQUIRED');
 if(!Array.isArray(p.limits)||!p.limits.length)throw Error('LIMIT_EVIDENCE_REQUIRED');
 for(const l of p.limits)if(!windows.has(l.window)||!Number.isSafeInteger(l.max)||l.max<=0||!Number.isSafeInteger(l.used)||l.used<0||l.used>l.max||typeof l.reset_at!=='string'||!Number.isFinite(Date.parse(l.reset_at)))throw Error('INVALID_LIMIT');
 if(!Number.isFinite(Date.parse(p.verified_at))||typeof p.source_url!=='string'||!/^https:\/\//.test(p.source_url))throw Error('EVIDENCE_REQUIRED');
 return p;
}
export function capacitySnapshot(profiles,now=new Date()){
 const at=now instanceof Date?now.getTime():new Date(now).getTime();
 if(!Number.isFinite(at))throw Error('INVALID_TIME');
 return profiles.map(p=>{
  try{
   validateCapacityProfile(p);
   const remaining=p.limits.map(l=>Date.parse(l.reset_at)<=at?l.max:l.max-l.used);
   return {id:p.id,eligible:remaining.every(n=>n>0),remaining_requests:Math.min(...remaining),reason:remaining.every(n=>n>0)?'AVAILABLE':'QUOTA_PAUSED'};
  }catch{return {id:p?.id??null,eligible:false,remaining_requests:0,reason:'UNVERIFIED'};}
 });
}
export function capacityReport(profiles,now=new Date()){
 const snapshot=capacitySnapshot(profiles,now);
 return {as_of:new Date(now).toISOString(),providers:snapshot,available:snapshot.filter(p=>p.eligible).length,paused:snapshot.filter(p=>!p.eligible).length};
}

/**
 * Adapt verified free-model capacity into the existing SEP-01 routing contract.
 * Unknown quota/cost, unavailable models and missing approval fail closed.
 * Paid tools must be supplied separately with their own authenticated adapters.
 */
export function freeRoutingProviders(profiles, now=new Date()) {
 const snapshot=capacitySnapshot(profiles,now);
 return snapshot.filter(s=>s.eligible).map(s=>{
  const p=profiles.find(item=>item.id===s.id);
  return {id:s.id,approved:true,healthy:true,remaining_quota:s.remaining_requests,
   capabilities:p.capabilities,estimated_cost:0,tier:'PUBLIC',private_environment:false};
 });
}
