// SEP-01 authorized provider boundary. No real credentials or external calls.
// Adapter must return a verified commit/step; checkpoint is persisted before any handoff.
import {claim,checkpoint,quotaFailure} from './controller.mjs';
export async function executeWithFailover({job,providers,invoke,persist,activeJobs=[]}) {
  if(typeof invoke!=='function'||typeof persist!=='function')throw Error('MISSING_ADAPTER');
  let state=await persist(claim(job,providers,activeJobs));
  if(state.status!=='CLAIMED')return state;
  const attempted=new Set();
  while(state.status==='CLAIMED') {
    const provider=providers.find(p=>p.id===state.provider);
    if(!provider||attempted.has(provider.id))throw Error('PROVIDER_LOOP');
    attempted.add(provider.id);
    const outcome=await invoke(provider,state);
    if(outcome?.status==='SUCCESS') {
      if(!/^[a-f0-9]{40}$/.test(outcome.commit)||!outcome.step)throw Error('UNVERIFIED_SUCCESS');
      return persist(checkpoint(state,outcome.commit,outcome.step));
    }
    if(outcome?.status!=='QUOTA_EXHAUSTED')throw Error('PROVIDER_FAILED');
    // A 429 cannot cause a second provider to run until a durable checkpoint exists.
    if(outcome.commit && outcome.step) {
      if(!/^[a-f0-9]{40}$/.test(outcome.commit))throw Error('INVALID_CHECKPOINT');
      state=await persist(checkpoint(state,outcome.commit,outcome.step));
    } else if(state.checkpoint_commit && state.last_safe_step) {
      state=await persist({...state,status:'CHECKPOINTED'});
    } else {
      return persist({...state,status:'QUOTA_PAUSED',reason:'NO_DURABLE_CHECKPOINT',provider:null});
    }
    // Only after the checkpoint write succeeds may another provider be claimed.
    const next=quotaFailure(state,providers.filter(p=>!attempted.has(p.id)));
    state=await persist(next);
  }
  return state;
}
