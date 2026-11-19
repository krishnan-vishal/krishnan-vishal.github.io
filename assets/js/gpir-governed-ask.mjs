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

/**
 * Build a bounded question from the active GPIR context. Context is an optional
 * search hint, never an authorization bypass or evidence of a regulatory claim.
 */
export function contextualAskQuery(question, context = {}) {
  const clean = value => String(value ?? '').replace(/[<>\\x00-\\x1f]/g, ' ').trim().slice(0, 80);
  const questionText = clean(question).slice(0, 120);
  if (!questionText) throw Error('ASK_QUESTION_REQUIRED');
  const hints = [context.topic, context.country, context.currencyPair, context.period]
    .map(clean).filter(Boolean);
  return [questionText, ...hints].join(' ').slice(0, 240);
}

/**
 * Deterministic answer framing for governed retrieval results. Never assert
 * unsupported causal conclusions or convert search matches into legal advice.
 */
export function summarizeGovernedAsk(question, records, context = {}) {
  const query = String(question || '').trim().slice(0, 120);
  const items = Array.isArray(records) ? records.filter(record => {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') return false;
    const publication = record.publication_status || record.publicationStatus;
    return !publication || String(publication).toLowerCase() === 'approved';
  }) : [];
  const seen = new Set();
  const cited = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const title = String(item.title || item.headline || 'Verified intelligence record').slice(0, 180);
    const candidates = [item.source_url, item.canonical_url, item.canonicalUrl, item.url, item.source?.url];
    const url = candidates.find(value => typeof value === 'string' && /^https:\/\//.test(value)) || null;
    cited.push({ id: item.id, title, url });
    if (cited.length === 5) break;
  }
  const scope = [context.topic, context.country, context.currencyPair, context.period]
    .filter(Boolean).map(value => String(value).slice(0, 60)).join(' · ');
  return Object.freeze({
    question: query,
    context: scope,
    status: cited.length ? 'EVIDENCE_FOUND' : 'NO_APPROVED_EVIDENCE',
    answer: cited.length
      ? 'Found ' + cited.length + ' distinct approved intelligence reference(s)'
        + (scope ? ' for ' + scope : '') + '. Review the source records for verified details; the available evidence does not by itself establish causation, sanctions applicability or a forecast.'
      : 'No approved evidence was found for this question'
        + (scope ? ' in ' + scope : '') + '. No conclusion can be supported from the available records.',
    citations: Object.freeze(cited.map(item => Object.freeze(item)))
  });
}
