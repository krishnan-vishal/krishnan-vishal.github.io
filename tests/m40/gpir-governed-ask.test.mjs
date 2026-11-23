import test from 'node:test';
import assert from 'node:assert/strict';
import { governedTerms, retrieveGovernedEvidence, contextualAskQuery, summarizeGovernedAsk } from '../../assets/js/gpir-governed-ask.mjs';

test('extracts bounded meaningful keywords from natural language',()=>{
  assert.deepEqual(governedTerms('Show recent money movement and remittances'),['money','movement','remittance']);
  assert.deepEqual(governedTerms('Frauds Report card'),['fraud']); 
});
test('queries the governed ASK API with exact phrase then bounded keyword fallback',async()=>{
  const queries=[];
  const fetchImpl=async url=>{
    const params = new URL(url).searchParams;
    assert.equal(params.get('view'), 'ask');
    const term = params.get('q');
    queries.push(term);
    return {ok:true,json:async()=>({status:'OK',access:'preview',records:term==='movement'?[{id:'a',title:'Money movement compliance'}]:[]})};
  };
  const records=await retrieveGovernedEvidence('https://example.supabase.co','money movement',{fetchImpl});
  assert.equal(records.length,1);
  assert.deepEqual(queries,['money movement','money','movement']);
});
test('does not invent records when governed endpoint fails',async()=>{
  await assert.rejects(()=>retrieveGovernedEvidence('https://example.supabase.co','fraud',{fetchImpl:async()=>({ok:false})}),/GOVERNED_HISTORY_UNAVAILABLE/);
});

test('builds bounded context-aware queries for governed ASK retrieval', () => {
  assert.equal(contextualAskQuery('What changed?', { topic: 'FATF', country: 'Nepal' }),
    'What changed? FATF Nepal');
  assert.equal(contextualAskQuery('What is the trend?', { currencyPair: 'USD/JPY', period: '1M' }),
    'What is the trend? USD/JPY 1M');
  assert.throws(() => contextualAskQuery(''), /ASK_QUESTION_REQUIRED/);
});

test('returns cited evidence summaries without inventing regulatory conclusions', () => {
  const result = summarizeGovernedAsk('Latest changes?', [
    { id: 'a', title: 'Official update', source_url: 'https://example.org/a' },
    { id: 'a', title: 'Duplicate' },
    { id: 'b', title: 'Additional notice', canonical_url: 'https://example.org/b' },
    { id: 'c', title: 'Unapproved draft', canonical_url: 'https://example.org/c', publication_status: 'draft' }
  ], { topic: 'FATF', country: 'Nepal' });
  assert.equal(result.status, 'EVIDENCE_FOUND');
  assert.equal(result.citations.length, 2);
  assert.equal(result.citations[1].url, 'https://example.org/b');
  assert.match(result.answer, /approved intelligence reference/);
  assert.doesNotMatch(result.answer, /Nepal is sanctioned/);
  const empty = summarizeGovernedAsk('What changed?', [], { country: 'Nepal' });
  assert.equal(empty.status, 'NO_APPROVED_EVIDENCE');
  assert.deepEqual(empty.citations, []);
});

test('Smart Intelligence uses the shared ASK core in the existing in-page panel', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../assets/js/smart-intelligence.mjs', import.meta.url), 'utf8');
  assert.match(source, /contextualAskQuery\(query, activeContext\)/);
  assert.match(source, /summarizeGovernedAsk\(query, intelligence \|\| \[\], activeContext\)/);
  assert.match(source, /askResults\.append\(answerHeading, answerText\)/);
  assert.match(source, /askPanel\.id='gpir-ask-panel'/);
  assert.match(source, /if\(request!==askRequest\)return/);
});

test('ASK preview applies a fixed 10% cap before search; entitled readers can retrieve the full set', async () => {
  const { createPublicIntelligenceHandler } = await import('../../supabase/functions/gpir-public-intelligence/handler.mjs');
  const handler = createPublicIntelligenceHandler({
    env: {},
    now: () => Date.parse('2026-11-23T00:00:00Z'),
    entitlement: async ({accessToken}) => ({decision: accessToken === 'allowed' ? 'ALLOW' : 'DENY'}),
    loadRows: async () => ({
      sources: [{source_id:'bank',source_name:'Bank',source_status:'GREEN',official_url:'https://bank.example'}],
      announcements: Array.from({length: 20}, (_, i) => ({
        id:String(i).padStart(2,'0'),source_id:'bank',publication_status:'approved',
        title: 'Verified payment announcement ' + (i === 19 ? 'Bounded private example' : i),
        summary_narration:'Official evidence for verified payment changes, including the scope and timing.',
        canonical_url:'https://bank.example/actions/'+i,
        ticker_eligible: i === 0,
        published_at: i === 0 ? '2026-11-22T21:00:00Z' : '2026-11-20T08:00:00Z'
      }))
    })
  });
  const request = (query='', token) => handler(new Request('https://example.test?view=ask&limit=25'+query, {
    headers: token ? {authorization: 'Bearer '+token} : {}
  }));
  const preview = await request();
  assert.match(preview.headers.get('cache-control'), /no-store/);
  const previewData = await preview.json();
  assert.equal(previewData.total, 2);
  assert.deepEqual(previewData.records.map(record => record.displayLifecycleStatus), ['LIVE', 'ARCHIVED']);
  assert.equal((await (await request('&q=Bounded%20private')).json()).total, 0);
  assert.equal((await (await request('&q=Bounded%20private', 'allowed')).json()).total, 1);
  assert.equal((await request('&topicContext=19')).status, 400);
});
