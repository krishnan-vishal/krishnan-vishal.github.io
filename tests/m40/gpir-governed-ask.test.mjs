import test from 'node:test';
import assert from 'node:assert/strict';
import { governedTerms, retrieveGovernedCountryEvidence, retrieveGovernedEvidence, contextualAskQuery, summarizeGovernedAsk } from '../../assets/js/gpir-governed-ask.mjs';

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

test('ranked ASK completes exact and keyword retrieval in one request', async () => {
  let requests = 0;
  const results = await retrieveGovernedEvidence('https://example.supabase.co', 'money movement', {
    fetchImpl: async url => {
      requests += 1;
      const params = new URL(url).searchParams;
      assert.equal(params.get('match'), 'ranked');
      assert.deepEqual(params.getAll('term'), ['money', 'movement']);
      return { ok: true, json: async () => ({
        status: 'OK', access: 'preview', match: 'ranked', records: [{ id: 'a' }]
      }) };
    }
  });
  assert.equal(requests, 1);
  assert.deepEqual(results, [{ id: 'a' }]);
});

test('country evidence refuses an Edge revision without explicit geography matching', async () => {
  await assert.rejects(() => retrieveGovernedCountryEvidence('https://example.supabase.co',
    { countryCode2: 'JP', countryCode: 'JPN', countryName: 'Japan' }, async url => {
      assert.deepEqual(new URL(url).searchParams.getAll('geo'), ['JP', 'JPN', 'Japan']);
      return { ok: true, json: async () => ({ status: 'OK', access: 'preview', records: [{ id: 'a' }] }) };
    }), /GOVERNED_COUNTRY_EVIDENCE_UNAVAILABLE/);
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
      sources: [{source_id:'bank',source_name:'Bank',source_status:'GREEN',official_url:'https://bank.example',country:'Japan'}],
      topics: [{id:'topic-19',announcement_id:'19',geography:'Japan'}],
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
  assert.equal((await (await request('&match=ranked&term=bounded')).json()).total, 0);
  assert.equal((await (await request('&match=ranked&geo=Japan')).json()).total, 0);
  const scoped = await (await request('&match=ranked&geo=Japan', 'allowed')).json();
  assert.equal(scoped.match, 'ranked');
  assert.deepEqual(scoped.records.map(record => record.id), ['19']);
  assert.equal((await request('&match=ranked&term=%3Cwrong%3E')).status, 400);
  assert.equal((await request('&topicContext=19')).status, 400);
});

test('historical evidence load coalesces across queries while access and expiry are reevaluated', async () => {
  const { createPublicIntelligenceHandler } = await import('../../supabase/functions/gpir-public-intelligence/handler.mjs');
  const cutoff = Date.parse('2026-11-28T12:00:00Z');
  let time = cutoff - 1000;
  let announcementLoads = 0;
  let fail = false;
  const handler = createPublicIntelligenceHandler({
    env: { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture' },
    now: () => time,
    entitlement: async ({ accessToken }) => ({ decision: accessToken === 'allowed' ? 'ALLOW' : 'DENY' }),
    fetchImpl: async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/source_registry')) {
        return Response.json([{ source_id: 'bank', source_name: 'Bank',
          source_status: 'GREEN', official_url: 'https://bank.example' }]);
      }
      if (!path.endsWith('/global_announcements')) return Response.json([]);
      announcementLoads += 1;
      if (fail) return Response.json({}, { status: 503 });
      return Response.json(Array.from({ length: 10 }, (_, index) => ({
        id: String(index), source_id: 'bank', title: 'Verified payments notice ' + index,
        summary_narration: 'Official payment oversight documentation and evidence from the authority.',
        canonical_url: 'https://bank.example/notices/' + index, published_at: '2026-11-28T00:00:00Z',
        publication_status: 'approved', ticker_eligible: true
      })));
    }
  });
  const ask = token => handler(new Request('https://example.test?view=ask&match=ranked&term=payments', {
    headers: token ? { authorization: 'Bearer ' + token } : {}
  }));
  const [preview, full] = await Promise.all([ask(), ask('allowed')]);
  assert.equal(announcementLoads, 1);
  assert.equal((await preview.json()).total, 1);
  assert.equal((await full.json()).total, 10);
  time = cutoff + 1;
  assert.equal((await (await ask()).json()).records[0].displayLifecycleStatus, 'ARCHIVED');
  assert.equal(announcementLoads, 1);
  time += 30_000;
  fail = true;
  assert.equal((await ask()).status, 503);
  fail = false;
  assert.equal((await ask()).status, 200);
  assert.equal(announcementLoads, 3);
});
