// Bounded keyword retrieval against the existing governed M40 history endpoint.
// This is evidence retrieval, not a generative answer or a replacement for approval gates.
const STOP = new Set(['what','which','where','when','about','from','with','during','show','find','give','please','report','reports','card','cards','latest','recent','information','data','the','and','for','are','has','have','into','all','any','this','that']);
export function governedTerms(query, max=3) {
  const tokens = String(query||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[];
  const terms=[];
  for(const token of tokens) {
    const stem=token.endsWith('ies') ? token.slice(0,-3)+'y' : token.endsWith('s') && token.length>5 ? token.slice(0,-1) : token;
    if(STOP.has(stem)||terms.includes(stem))continue;
    terms.push(stem);
    if(terms.length===max)break;
  }
  return terms;
}
export async function retrieveGovernedEvidence(origin,query,{limit=10,fetchImpl=fetch}={}) {
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(String(origin||'')))throw Error('GOVERNED_ORIGIN_UNAVAILABLE');
  const searches=[String(query||'').trim().slice(0,120),...governedTerms(query)].filter(Boolean);
  const unique=[...new Set(searches)].slice(0,4);
  const records=new Map();
  for(const term of unique){
    const params=new URLSearchParams({view:'history-records',kind:'announcements',q:term,limit:String(Math.min(25,Math.max(1,limit))),offset:'0'});
    const response=await fetchImpl(origin.replace(/\/$/,'')+'/functions/v1/gpir-public-intelligence?'+params,{cache:'no-store',headers:{accept:'application/json'}});
    if(!response.ok)throw Error('GOVERNED_HISTORY_UNAVAILABLE');
    const data=await response.json();
    if(data?.status!=='OK'||!Array.isArray(data.records))throw Error('GOVERNED_HISTORY_INVALID');
    for(const item of data.records){
      if(!item?.id||records.has(item.id))continue;
      records.set(item.id,item);
    }
    if(records.size>=limit)break;
  }
  return [...records.values()].slice(0,limit);
}
