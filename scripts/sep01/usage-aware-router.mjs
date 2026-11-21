// SEP-01 usage-aware route selection. Subscription labels are never treated as API authorization.
// Missing quota telemetry means unknown, not unlimited; never infer entitlement from a paid plan.
export function rankUsageAwareRoutes(job,providers,readiness={},now=Date.now()){
 if(!Array.isArray(providers)||!job||!Number.isFinite(now))throw Error('INVALID_USAGE_ROUTING_INPUT');
 const sensitive=job.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job.scope);
 return providers.filter(p=>{
  const ready=readiness[p.agent_id];
  if(!ready?.ready||p.approved!==true||p.healthy!==true||p.capabilities?.includes(job.capability)!==true)return false;
  if(sensitive&&(p.tier!=='TIER_1'||p.private_environment!==true))return false;
  if(!sensitive&&!['PUBLIC','TIER_1'].includes(p.tier))return false;
  if(!Number.isFinite(p.estimated_cost)||p.estimated_cost<0||p.estimated_cost>(job.remaining_budget??0))return false;
  if(p.quota_state==='EXHAUSTED'||p.quota_state==='BLOCKED')return false;
  if(Number.isFinite(p.retry_after_epoch_ms)&&p.retry_after_epoch_ms>now)return false;
  if(Number.isFinite(p.remaining_quota)&&p.remaining_quota<=0)return false;
  // Unknown quota is eligible only when the adapter can safely classify quota failures.
  if(!Number.isFinite(p.remaining_quota)&&p.quota_failure_detection_verified!==true)return false;
  return true;
 }).sort((a,b)=>{
  const cost=a.estimated_cost-b.estimated_cost;
  if(cost)return cost;
  const ar=Number.isFinite(a.remaining_quota)?a.remaining_quota:-1;
  const br=Number.isFinite(b.remaining_quota)?b.remaining_quota:-1;
  return br-ar||String(a.id).localeCompare(String(b.id));
 });
}
export function recordQuotaOutcome(provider,status,now=Date.now(),retryAfterMs=null){
 if(!provider||typeof status!=='string'||!Number.isFinite(now))throw Error('INVALID_QUOTA_OUTCOME');
 if(status==='QUOTA_EXHAUSTED'||status==='PROVIDER_BUSY'){
  return {...provider,quota_state:'EXHAUSTED',remaining_quota:0,retry_after_epoch_ms:Number.isFinite(retryAfterMs)&&retryAfterMs>0?now+retryAfterMs:null};
 }
 if(status==='PROVIDER_UNAVAILABLE'||status==='MODEL_UNAVAILABLE')return {...provider,quota_state:'BLOCKED'};
 return {...provider};
}
