// SEP-01 deterministic routing core. No provider calls, credentials or production writes.
// State persistence and provider adapters are deliberately separate release gates.
export const SENSITIVE = new Set(['secrets','auth','payments','entitlements','security','pii']);
export const TERMINAL = new Set(['DEPLOYED_VERIFIED','BLOCKED']);
export function classify(job) {
  if (!job?.job_id || !job?.idempotency_key || !job?.branch || !Array.isArray(job.locked_paths) || !job.locked_paths.length) throw Error('INVALID_JOB_CONTRACT');
  return SENSITIVE.has(job.scope) || job.sensitivity_tier === 'TIER_1' ? 'TIER_1' : 'PUBLIC';
}
export function eligible(job, providers) {
  const tier = classify(job);
  return providers.filter(p => p.approved === true && p.healthy === true &&
    p.remaining_quota > 0 && p.capabilities?.includes(job.capability) &&
    (tier !== 'TIER_1' || (p.tier === 'TIER_1' && p.private_environment === true)) &&
    (tier === 'TIER_1' || p.tier === 'TIER_1' || p.tier === 'PUBLIC') &&
    Number.isFinite(p.estimated_cost) && p.estimated_cost >= 0 &&
    p.estimated_cost <= (job.remaining_budget ?? 0))
    .sort((a,b) => a.estimated_cost-b.estimated_cost || a.id.localeCompare(b.id));
}
export function claim(job, providers, activeJobs = []) {
  if (TERMINAL.has(job.status)) throw Error('TERMINAL_JOB');
  const conflict = activeJobs.some(other => other.job_id !== job.job_id &&
    ['CLAIMED','CHECKPOINTED','PR_READY','CI_VERIFIED','RELEASE_ELIGIBLE'].includes(other.status) &&
    (other.branch === job.branch || other.locked_paths.some(path => job.locked_paths.includes(path))));
  if (conflict) return {...job,status:'BLOCKED',reason:'WRITER_LOCK_CONFLICT'};
  const chosen = eligible(job,providers)[0];
  if (!chosen) return {...job,status:'QUOTA_PAUSED',reason:'NO_APPROVED_CAPABLE_PROVIDER'};
  return {...job,status:'CLAIMED',provider:chosen.id,reason:null};
}
export function checkpoint(job, commit, step) {
  if (job.status !== 'CLAIMED' || !/^[a-f0-9]{40}$/.test(commit) || !step) throw Error('UNSAFE_CHECKPOINT');
  return {...job,status:'CHECKPOINTED',checkpoint_commit:commit,last_safe_step:step};
}
export function quotaFailure(job, providers) {
  if (job.status !== 'CHECKPOINTED' || !job.checkpoint_commit) throw Error('NO_DURABLE_CHECKPOINT');
  const next = claim({...job,status:'QUEUED',provider:null},providers.filter(p=>p.id!==job.provider));
  return next.status === 'CLAIMED' ? {...next,checkpoint_commit:job.checkpoint_commit,last_safe_step:job.last_safe_step} :
    {...job,status:'QUOTA_PAUSED',provider:null,reason:'NO_SAFE_FAILOVER'};
}
export function advance(job,next,evidence) {
  const allowed = {CLAIMED:['CHECKPOINTED'],CHECKPOINTED:['PR_READY'],PR_READY:['CI_VERIFIED'],CI_VERIFIED:['RELEASE_ELIGIBLE'],RELEASE_ELIGIBLE:['DEPLOYED_VERIFIED']};
  if (!allowed[job.status]?.includes(next) || !evidence) throw Error('INVALID_TRANSITION_OR_EVIDENCE');
  if (next==='DEPLOYED_VERIFIED' && (!evidence.production_url || !evidence.deployment_id || !evidence.rollback_ref)) throw Error('PRODUCTION_EVIDENCE_REQUIRED');
  return {...job,status:next,evidence};
}
