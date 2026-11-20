// SEP-01 independent Google Gemini API coding transport.
// This route is separate from OpenRouter; requires its own authorized Gemini key.
// No shell commands, Git writes, or secret material returned to the caller.
export function createGeminiCodeEditor({apiKey,model,fetchImpl=fetch}){
 if(typeof apiKey!=='string'||!apiKey||typeof model!=='string'||!/^gemini-[a-zA-Z0-9._-]+$/.test(model))throw Error('GEMINI_CONFIGURATION_REQUIRED');
 return async ({job,path,content})=>{
  if(job?.sensitivity_tier==='TIER_1'||['auth','payments','entitlements','security','secrets','pii'].includes(job?.scope))throw Error('GEMINI_SENSITIVE_JOB_FORBIDDEN');
  if(typeof job?.instruction!=='string'||!job.instruction.trim()||job.instruction.length>3000||typeof path!=='string'||typeof content!=='string'||content.length>50000)throw Error('INVALID_GEMINI_EDIT_INPUT');
  const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
   body:JSON.stringify({systemInstruction:{parts:[{text:'You are a code editor. Reply only with a JSON object containing a content string holding the complete replacement file. No markdown or shell commands.'}]},contents:[{role:'user',parts:[{text:JSON.stringify({task:job.instruction,file:path,content})}]}],generationConfig:{temperature:0,maxOutputTokens:6000,responseMimeType:'application/json'}})
  });
  if(response.status===429)return {status:'QUOTA_EXHAUSTED',provider:'gemini'};
  if(response.status===401||response.status===403)return {status:'PROVIDER_UNAVAILABLE',reason:'AUTH_OR_PERMISSION'};
  if(!response.ok)throw Error('GEMINI_HTTP_'+response.status);
  const data=await response.json();
  const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
  if(typeof answer!=='string'||!answer)throw Error('INVALID_GEMINI_RESPONSE');
  let parsed;try{parsed=JSON.parse(answer);}catch{throw Error('INVALID_GEMINI_JSON');}
  if(typeof parsed.content!=='string'||!parsed.content||parsed.content.length>100000)throw Error('INVALID_GEMINI_CONTENT');
  return {status:'EDIT',content:parsed.content};
 };
}
