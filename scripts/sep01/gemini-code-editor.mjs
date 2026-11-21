// SEP-01 independent Google Gemini API coding transport.
// This route is separate from OpenRouter; requires its own authorized Gemini key.
// No shell commands, Git writes, or secret material returned to the caller.
const MODEL_ID=/^gemini-[a-zA-Z0-9._-]+$/;
const NON_TEXT_MODEL=/tts|audio|speech|image|video|live|embedding/i;
export function normalizeGeminiModel(value){
 const model=typeof value==='string'?value.trim().replace(/^models\//,''):'';
 return MODEL_ID.test(model)?model:null;
}
export async function discoverGeminiTextModels({apiKey,preferred,fetchImpl=fetch,maxCandidates=4}){
 if(typeof apiKey!=='string'||!apiKey||typeof fetchImpl!=='function'||!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>8)throw Error('GEMINI_DISCOVERY_CONFIGURATION_REQUIRED');
 const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':apiKey}});
 if(response.status===401||response.status===403)throw Error('GEMINI_DISCOVERY_AUTH_FAILED');
 if(!response.ok)throw Error('GEMINI_MODEL_DISCOVERY_HTTP_'+response.status);
 const body=await response.json();
 const eligible=[...new Set((body.models||[])
  .filter(item=>item?.supportedGenerationMethods?.includes('generateContent')&&!NON_TEXT_MODEL.test(item.name||''))
  .map(item=>normalizeGeminiModel(item.name)).filter(Boolean))];
 const requested=normalizeGeminiModel(preferred);
 const rank=model=>model===requested?0:/flash-lite/i.test(model)?1:/flash/i.test(model)?2:3;
 const models=eligible.sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).slice(0,maxCandidates);
 if(!models.length)throw Error('NO_AUTHORIZED_GEMINI_TEXT_MODEL');
 return {models,preferred:requested,preferredMatched:Boolean(requested&&eligible.includes(requested))};
}
export function createGeminiCodeEditor({apiKey,model,fetchImpl=fetch}){
 model=normalizeGeminiModel(model);
 if(typeof apiKey!=='string'||!apiKey||!model||typeof fetchImpl!=='function')throw Error('GEMINI_CONFIGURATION_REQUIRED');
 return async ({job,path,content})=>{
  if(job?.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job?.scope))throw Error('GEMINI_SENSITIVE_JOB_FORBIDDEN');
  if(typeof job?.instruction!=='string'||!job.instruction.trim()||job.instruction.length>3000||typeof path!=='string'||typeof content!=='string'||content.length>50000)throw Error('INVALID_GEMINI_EDIT_INPUT');
  const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({systemInstruction:{parts:[{text:'You are a code editor. Reply only with a JSON object containing a content string holding the complete replacement file. No markdown or shell commands.'}]},contents:[{role:'user',parts:[{text:JSON.stringify({task:job.instruction,file:path,content})}]}],generationConfig:{temperature:0,maxOutputTokens:8192,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{content:{type:'STRING'}},required:['content']}}})
  });
  if(response.status===429)return {status:'QUOTA_EXHAUSTED',provider:'gemini'};
  if([500,502,503,504].includes(response.status))return {status:'PROVIDER_BUSY',provider:'gemini',http_status:response.status};
  if(response.status===401||response.status===403)return {status:'PROVIDER_UNAVAILABLE',reason:'AUTH_OR_PERMISSION'};
  if(!response.ok){
   const detail=await response.json().catch(()=>({}));
   const reason=String(detail?.error?.message||'').slice(0,240).replace(/[\r\n]/g,' ');
   if(response.status===404)return {status:'MODEL_UNAVAILABLE',reason:reason||'MODEL_NOT_FOUND'};
   throw Error('GEMINI_HTTP_'+response.status+(reason?' '+reason:''));
  }
  const data=await response.json();
  const candidate=data?.candidates?.[0];
  const finish=String(candidate?.finishReason||'');
  if(['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII'].includes(finish))return {status:'PROVIDER_UNAVAILABLE',reason:'RESPONSE_BLOCKED'};
  const answer=candidate?.content?.parts?.map(part=>typeof part?.text==='string'?part.text:'').join('');
  if(typeof answer!=='string'||!answer.trim()){
   if(finish==='MAX_TOKENS')return {status:'PROVIDER_BUSY',provider:'gemini',reason:'INCOMPLETE_RESPONSE'};
   throw Error('INVALID_GEMINI_RESPONSE');
  }
  let parsed;try{parsed=JSON.parse(answer.trim());}catch{throw Error('INVALID_GEMINI_JSON');}
  if(typeof parsed.content!=='string'||!parsed.content||parsed.content.length>100000)throw Error('INVALID_GEMINI_CONTENT');
  return {status:'EDIT',content:parsed.content};
 };
}
