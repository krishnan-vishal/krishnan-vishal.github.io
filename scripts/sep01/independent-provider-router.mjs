// SEP-01: bounded cross-provider routing; never retry an invalid edit or validation failure.
const FAILOVER=new Set(['QUOTA_EXHAUSTED','PROVIDER_BUSY','MODEL_UNAVAILABLE','PROVIDER_UNAVAILABLE']);
export async function requestWithIndependentFallback({geminiModels,geminiEdit,openrouterEdit,allowOpenRouter=false,onAttempt=()=>{}}){
 if(!Array.isArray(geminiModels)||typeof geminiEdit!=='function')throw Error('INVALID_PROVIDER_ROUTING');
 const attempts=[];
 for(const model of geminiModels.slice(0,4)){
  const result=await geminiEdit(model);
  attempts.push({provider:'gemini',model,status:result?.status||'MISSING'});
  onAttempt(attempts.at(-1));
  if(!FAILOVER.has(result?.status))return {result,attempts};
 }
 if(allowOpenRouter&&typeof openrouterEdit==='function'){
  const result=await openrouterEdit();
  attempts.push({provider:'openrouter',status:result?.status||'MISSING'});
  onAttempt(attempts.at(-1));
  return {result,attempts};
 }
 return {result:{status:attempts.some(x=>x.status==='QUOTA_EXHAUSTED')?'QUOTA_EXHAUSTED':attempts.some(x=>x.status==='PROVIDER_BUSY')?'PROVIDER_BUSY':'MODEL_UNAVAILABLE'},attempts};
}
