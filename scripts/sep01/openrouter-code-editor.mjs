import {prepareEditorTask} from './editor-output-contract.mjs';
// SEP-01 bounded OpenRouter code-edit transport. The caller controls the file and tests.
export function createOpenRouterCodeEditor({apiKey,model,fetchImpl=fetch}) {
 if(!apiKey||!model)throw Error('PROVIDER_CONFIGURATION_REQUIRED');
 return async ({job,path,content})=>{
  if(typeof content!=='string'||content.length>50000)throw Error('INPUT_TOO_LARGE');
  const contract=prepareEditorTask({job,path,content});
  const response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({model,stream:false,temperature:0,max_tokens:6000,
    messages:[
     {role:'system',content:contract.prompt},
     {role:'user',content:JSON.stringify({task:job.instruction,file:path,content:contract.context})}
    ]})
  });
  if(response.status===429)return {status:'QUOTA_EXHAUSTED'};
  if([502,503,504].includes(response.status))return {status:'PROVIDER_BUSY',provider:'openrouter',http_status:response.status};
  if(response.status===404)return {status:'MODEL_UNAVAILABLE',provider:'openrouter'};
  if(!response.ok)throw Error('CODE_EDITOR_HTTP_'+response.status);
  const data=await response.json();
  if(data?.choices?.[0]?.finish_reason==='length')return {status:'PROVIDER_RESPONSE_INVALID',provider:'openrouter',reason:'TRUNCATED_OUTPUT'};
  const answer=data?.choices?.[0]?.message?.content;
  if(typeof answer!=='string')throw Error('INVALID_EDITOR_RESPONSE');
  let parsed;
  try{parsed=JSON.parse(answer);}catch{return {status:'PROVIDER_RESPONSE_INVALID',provider:'openrouter',reason:'NON_JSON_OUTPUT'};}
  if(typeof parsed.content!=='string')throw Error('INVALID_EDITOR_CONTENT');
  return {status:'EDIT',content:contract.materialize(parsed.content)};
 };
}
