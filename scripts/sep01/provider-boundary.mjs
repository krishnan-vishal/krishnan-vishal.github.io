// SEP-01 authorized provider boundary. No real credentials or external calls.
// Production adapters must implement invoke(job,checkpoint) and return structured outcomes.
import {claim,checkpoint,quotaFailure} from './controller.mjs';
export async function executeWithFailover({job,providers,invoke,persist,activeJobs=[]}) {
  if (typeof invoke!=='function'||typeof persist!=='function')throw Error('MISSING_ADAPTER');
  let state=claim(job,providers,activeJobs);
  state=await persist(state);
  if(state.status!=='CLAIMED')return state;
  const attempted=new Set();
  while(state.status==='CLAIMED') {
    const provider=providers.find(p=>p.id===state.provider);
    if(!provider || attempted.has(provider.id))throw Error('PROVIDER_LOOP');
    attempted.add(provider.id);
    // A provider must never be invoked without a recorded claim.
    const outcome=await invoke(provider,state);
    if(outcome?.status==='SUCCESS') {
      if(!/^[a-f0-9]{40}$/.test(outcome.commit)||!outcome.step)throw Error('UNVERIFIED_SUCCESS');
      return persist(checkpoint(state,outcome.commit,outcome.step));
    }
    if(outcome?.status!=='QUOTA_EXHAUSTED')throw Error('PROVIDER_FAILED');
    // Quota exhaustion may only hand off from a verified persisted checkpoint.
    if(!state.checkpoint_commit) {
      state=await persist({...state,status:'QUOTA_PAUSED',reason:'NO_DURABLE_CHECKPOINT',provider:null});
      return state;
    }
    const next=quotaFailure(state,providers.filter(p=>!attempted.has(p.id)));
    state=await persist(next);
  }
  return state;
}
