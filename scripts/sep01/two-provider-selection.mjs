// SEP-01 production-safe provider selection for the two previously accepted API routes.
// Provider availability must be supplied by an authenticated worker at execution time.
// This module never reads credentials, edits files, dispatches models or deploys.
import {eligible} from './controller.mjs';
const ALLOWED=new Set(['gemini','openrouter']);
export function selectApiCodingProvider({job,providers,excluded=[]}={}){
 if(!Array.isArray(providers)||!Array.isArray(excluded))throw Error('INVALID_PROVIDER_SELECTION');
 const excludedSet=new Set(excluded);
 const candidates=eligible(job,providers.filter(p=>ALLOWED.has(p.id)&&!excludedSet.has(p.id)));
 return candidates.length?{status:'SELECTED',provider:candidates[0].id,candidates:candidates.map(p=>p.id)}:
  {status:'QUOTA_PAUSED',provider:null,reason:'NO_APPROVED_CAPABLE_API_PROVIDER',candidates:[]};
}
export function classifyApiCodingOutcome(outcome){
 if(outcome?.status==='SUCCESS'&&/^[a-f0-9]{40}$/.test(outcome.commit)&&outcome.step)
  return {status:'CHECKPOINT_READY',commit:outcome.commit,step:outcome.step};
 if(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE'].includes(outcome?.status))
  return {status:'PAUSED_NEEDS_CHECKPOINT',reason:outcome.status};
 return {status:'BLOCKED',reason:'UNVERIFIED_PROVIDER_OUTCOME'};
}
