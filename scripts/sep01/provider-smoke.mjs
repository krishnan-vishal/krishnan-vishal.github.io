// SEP-01 bounded real provider connectivity check. Never logs tokens or response text.
// Only runs on explicit workflow_dispatch with a configured approved model.
import {openRouterAdapter} from './openrouter-adapter.mjs';
const apiKey=process.env.OPENROUTER_API_KEY;
const model=process.env.SEP01_OPENROUTER_MODEL;
if(!apiKey||!model)throw Error('SEP01_PROVIDER_CONFIGURATION_MISSING');
const invoke=openRouterAdapter({apiKey,model});
const result=await invoke({job_id:'sep01-connection-check',idempotency_key:'sep01-connection-check',branch:'feat/sep01-central-command-controller-20261120',locked_paths:['scripts/sep01/'],capability:'code'});
if(result.status==='QUOTA_EXHAUSTED')throw Error('SEP01_PROVIDER_QUOTA_EXHAUSTED');
if(result.status!=='ADVISORY_ONLY')throw Error('SEP01_UNEXPECTED_PROVIDER_RESULT');
console.log('SEP01_OPENROUTER_AUTHENTICATED_ADVISORY_OK');
