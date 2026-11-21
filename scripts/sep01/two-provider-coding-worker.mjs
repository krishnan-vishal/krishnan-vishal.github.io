// SEP-01 API coding worker wiring. Invoke only in an authenticated isolated checkout.
// No model-generated commands, no production deployment, no blind retries.
import {selectApiCodingProvider} from './two-provider-selection.mjs';
import {createCodingRunner} from './coding-runner.mjs';
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
import {createOpenRouterCodeEditor} from './openrouter-code-editor.mjs';
export function createTwoProviderCodingWorker({root,allowedPaths,runTests,providerHealth,gemini,openrouter}={}){
 if(!Array.isArray(providerHealth)||!gemini?.apiKey||!gemini?.model||!openrouter?.apiKey||!openrouter?.model)throw Error('SEP01_WORKER_AUTH_AND_HEALTH_REQUIRED');
 const editors={
  gemini:createGeminiCodeEditor(gemini),
  openrouter:createOpenRouterCodeEditor(openrouter)
 };
 const run=createCodingRunner({root,allowedPaths,runTests,requestEdit:({provider,...request})=>{
  const edit=editors[provider.id];
  if(!edit)throw Error('SEP01_UNAPPROVED_PROVIDER');
  return edit(request);
 }});
 return async(job)=>{
  const selected=selectApiCodingProvider({job,providers:providerHealth});
  if(selected.status!=='SELECTED')return selected;
  const provider=providerHealth.find(p=>p.id===selected.provider);
  const outcome=await run({job,provider});
  if(outcome.status==='SUCCESS')return {status:'CHECKPOINTED',provider:provider.id,checkpoint_commit:outcome.commit,last_safe_step:outcome.step};
  // Runner did not commit: stop. A different provider may only resume
  // through the separately governed durable-checkpoint recovery protocol.
  return {status:'QUOTA_PAUSED',provider:null,reason:outcome.status,checkpoint_commit:null};
 };
}
