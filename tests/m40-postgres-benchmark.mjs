import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const artifactRoot = path.resolve('benchmark-artifacts/m40');
const planRoot = path.join(artifactRoot, 'plans');
mkdirSync(planRoot, { recursive: true });

const measurements = [];
let stage = 'initialization';
function writeFailure(error) {
    const message = error?.stack || String(error);
    writeFileSync(path.join(artifactRoot, 'benchmark-results.json'), JSON.stringify({
        status: 'FAIL', generatedAt: new Date().toISOString(), stage, error: message, measurements
    }, null, 2) + '\n');
    console.error(message);
    process.exitCode = 1;
}
process.on('uncaughtException', writeFailure);
process.on('unhandledRejection', writeFailure);

const baseEnv = {
    ...process.env,
    PGCONNECT_TIMEOUT: '5',
    PGPASSWORD: process.env.PGPASSWORD || 'postgres'
};

function psqlArgs() {
    return ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
}

function runSql(statement, { timeout = 120000 } = {}) {
    return execFileSync('psql', [...psqlArgs(), '-c', statement], {
        env: baseEnv,
        encoding: 'utf8',
        timeout,
        maxBuffer: 32 * 1024 * 1024
    }).trim();
}

function runFile(filePath, { timeout = 120000 } = {}) {
    return execFileSync('psql', [...psqlArgs(), '-f', filePath], {
        env: baseEnv,
        encoding: 'utf8',
        timeout,
        maxBuffer: 32 * 1024 * 1024
    }).trim();
}

function sqlString(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
    if (!values) return 'null';
    return `array[${values.map(sqlString).join(',')}]::text[]`;
}

function rpc({ topics = null, themes = null, categories = null, region = null, query = null,
    start = null, end = null, limit = 10, offset = 0 } = {}) {
    return `public.gpir_m40_repository_query_v2('announcements',${sqlArray(topics)},${sqlArray(themes)},` +
        `${sqlArray(categories)},${region ? sqlString(region) : 'null'},${query ? sqlString(query) : 'null'},` +
        `${start ? `${sqlString(start)}::timestamptz` : 'null'},${end ? `${sqlString(end)}::timestamptz` : 'null'},` +
        `${limit},${offset})`;
}

function historyRpc(offset, limit = 10) {
    return `public.gpir_m40_repository_records_v1('announcements',null,null,null,null,null,null,null,${limit},${offset})`;
}

function cursorRpc(afterTime = null, afterId = null, limit = 10) {
    const ts = afterTime === null ? 'null' : `'${afterTime}'::timestamptz`;
    const id = afterId === null ? 'null' : `'${afterId}'::uuid`;
    return `public.gpir_m40_repository_cursor_v1('announcements',null,null,null,null,null,null,null,${limit},${ts},${id})`;
}
function serviceQuery(expression, timeout = '20s') {
    return `set statement_timeout=${sqlString(timeout)}; set role service_role; select ${expression};`;
}

function jsonResult(expression) {
    return JSON.parse(runSql(serviceQuery(expression)));
}

console.log('Preparing isolated M40 benchmark schema...');
stage = 'schema and data preparation';
runFile('tests/fixtures/m40-postgres-benchmark-schema.sql');
runFile('supabase/sql/m40-governed-repository-aggregates-v2.sql');
stage = 'SQL correctness fixture';
runFile('tests/fixtures/m40-postgres-correctness.sql');
stage = 'synthetic data preparation';

runSql(`
insert into public.source_registry(source_id,source_name,official_url,trust_tier,source_status,country,region_tags,category)
select format('SRC-%s',lpad(i::text,3,'0')),
       format('Benchmark Source %s',i),format('https://source-%s.example',i),
       case when i%3=0 then 'T2' else 'T1' end,
       case when i%20=0 then 'AMBER' else 'GREEN' end,
       case i%9 when 0 then 'Global' when 1 then 'Singapore' when 2 then 'Germany'
            when 3 then 'United States' when 4 then 'Brazil' when 5 then 'United Arab Emirates'
            when 6 then 'Nigeria' when 7 then 'Australia' else 'India' end,
       array[case i%9 when 0 then 'Global' when 1 then 'APAC' when 2 then 'Europe'
            when 3 then 'North America' when 4 then 'LATAM' when 5 then 'GCC'
            when 6 then 'Africa' when 7 then 'APAC' else 'APAC' end],
       'BENCHMARK'
from generate_series(1,100) i;

with generated as (
    select g,
      case g%12 when 0 then 'REGULATION' when 1 then 'CROSS_BORDER_PAYMENTS'
        when 2 then 'Cross-Border Payments' when 3 then 'Real-Time Payments'
        when 4 then 'Payments Infrastructure' when 5 then 'STABLECOINS_DIGITAL_ASSETS'
        when 6 then 'AML CFT' when 7 then 'FRAUD' when 8 then 'Wallets Digital Payments'
        when 9 then 'Deals Partnerships' when 10 then 'PAYMENTS' else 'MERCHANT_ACQUIRING' end category,
      case g%6 when 0 then 'AI powered payments compliance platform update'
        when 1 then 'Agentic AI payment agents launch settlement service'
        when 2 then 'Web3 blockchain payments infrastructure development'
        when 3 then 'Cross-border payment network regulatory development'
        when 4 then 'Real-time clearing and wallet payments expansion'
        else 'Merchant card payment partnership announcement' end title
    from generate_series(1,500000) g
)
insert into public.global_announcements
    (id,source_id,title,summary_narration,canonical_url,published_at,ticker_eligible,topic_headers,publication_status)
select gen_random_uuid(),format('SRC-%s',lpad(((g%100)+1)::text,3,'0')),title,
       title||' with governed evidence for settlement, financial services, merchants and payment operations.',
       format('https://benchmark.example/record/%s',g),
       '2026-11-12 12:00:00+00'::timestamptz-(g%730)*interval '1 day'-(g%86400)*interval '1 second',
       g%40=1,array[category],case when g%20=0 then 'review' else 'approved' end
from generated;

insert into public.gpir_intelligence_topics(announcement_id,keywords,outcome_status,geography,created_at)
select a.id,array['benchmark','payments'],'PUBLISHED',
       case substring(a.source_id from 5)::integer%9 when 0 then 'Global' when 1 then 'Singapore'
        when 2 then 'Germany' when 3 then 'United States' when 4 then 'Brazil'
        when 5 then 'United Arab Emirates' when 6 then 'Nigeria' when 7 then 'Australia' else 'India' end,
       a.published_at
from public.global_announcements a;

analyze public.source_registry;
analyze public.global_announcements;
analyze public.gpir_intelligence_topics;
`, { timeout: 600000 });

const rowCount = Number(runSql('select count(*) from public.global_announcements;'));
assert.equal(rowCount, 500000, 'benchmark must contain exactly 500,000 governed records');

stage = 'correctness';
const full = jsonResult(rpc({ limit: 10 }));
const total = full.total;
const middleOffset = Math.floor(total / 20) * 10;
const finalOffset = Math.max(0, total - 10);
const directBase = `from public.global_announcements a
    join public.source_registry s on s.source_id=a.source_id and s.source_status='GREEN'
    left join public.gpir_intelligence_topics t on t.announcement_id=a.id
    where a.publication_status='approved' and a.published_at is not null`;

const independentTotal = Number(runSql(`select count(*) ${directBase};`));
assert.equal(total, independentTotal, 'full aggregate total must match independent SQL');

const end = '2026-11-12T12:00:00.000Z';
const start24h = '2026-11-11T12:00:00.000Z';
const rpc24h = jsonResult(rpc({ start: start24h, end, limit: 10 }));
const direct24h = Number(runSql(`select count(*) ${directBase}
    and a.published_at>='${start24h}'::timestamptz and a.published_at<'${end}'::timestamptz;`));
assert.equal(rpc24h.total, direct24h, 'rolling 24-hour total must match independent SQL');

const multiTopics = ['regulatory','cross-border'];
const rpcMulti = jsonResult(rpc({ topics: multiTopics, limit: 10 }));
const directMulti = Number(runSql(`select count(*) ${directBase} and
    lower(regexp_replace(btrim(coalesce(a.topic_headers[1],'Payments')),'[^a-zA-Z0-9]+',' ','g'))
    in ('regulation','regulatory','regulatory actions','central bank','monetary policy',
        'cross border payments','cross border banking','correspondent banking');`));
assert.equal(rpcMulti.total, directMulti, 'multi-topic OR total must match independent SQL');

function rpcIds(offset) {
    return jsonResult(rpc({ limit: 10, offset })).records.map(record => record.id);
}

function directIds(offset) {
    const output = runSql(`select coalesce(json_agg(id),'[]'::json)::text from (
        select a.id::text id ${directBase} order by a.published_at desc,a.id limit 10 offset ${offset}
    ) page;`);
    return JSON.parse(output);
}

for (const [label, offset] of [['first',0],['middle',middleOffset],['final',finalOffset]]) {
    assert.deepEqual(rpcIds(offset),directIds(offset),`${label} page must match independent stable pagination`);
}
for (const offset of [0,middleOffset,finalOffset]) {
    const page = jsonResult(historyRpc(offset));
    assert.deepEqual(page.records.map(record=>record.id),directIds(offset),
        'records-only page must preserve governed stable ordering');
}
const recordPrivileges = JSON.parse(runSql(`select json_build_object(
    'anon',has_function_privilege('anon','public.gpir_m40_repository_records_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute'),
    'authenticated',has_function_privilege('authenticated','public.gpir_m40_repository_records_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute'),
    'serviceRole',has_function_privilege('service_role','public.gpir_m40_repository_records_v1(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute'))::text;`));
assert.deepEqual(recordPrivileges,{anon:false,authenticated:false,serviceRole:true});
assert.equal(new Set([...rpcIds(0),...rpcIds(middleOffset),...rpcIds(finalOffset)]).size,30,
    'first, middle and final pages must not overlap');

const privileges = JSON.parse(runSql(`select json_build_object(
    'anon',has_function_privilege('anon','public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute'),
    'authenticated',has_function_privilege('authenticated','public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute'),
    'serviceRole',has_function_privilege('service_role','public.gpir_m40_repository_query_v2(text,text[],text[],text[],text,text,timestamptz,timestamptz,integer,integer)','execute'))::text;`));
assert.deepEqual(privileges,{anon:false,authenticated:false,serviceRole:true});
assert.doesNotMatch(readFileSync('assets/js/smart-intelligence.mjs','utf8'),/await fetchHistory/,
    'dashboard initialization must not download unbounded history');

const monthStart = '2026-10-12T12:00:00.000Z';
const dashboardQueries = [
    rpc({topics:['regulatory'],start:start24h,end,limit:1}),
    rpc({topics:multiTopics,region:'apac',start:monthStart,end,limit:1}),
    rpc({themes:['ai'],limit:1}),
    rpc({region:'europe',start:monthStart,end,limit:1}),
    rpc({limit:1})
];
const cardQueries = [
    rpc({topics:['payments'],start:start24h,end,limit:10,offset:0}),
    rpc({themes:['web3'],region:'apac',start:monthStart,end,limit:10,offset:0}),
    rpc({topics:multiTopics,start:monthStart,end,limit:10,offset:10}),
    rpc({themes:['aml'],region:'afr',start:monthStart,end,limit:10,offset:20})
];
// Legacy offset pagination is retained only for deterministic correctness and plan evidence.
// The production reader uses the governed cursor RPC; offset is not a release latency gate.
const historicalQueries = [historyRpc(0), historyRpc(middleOffset), historyRpc(finalOffset)];

const cursorAnchors = [null, middleOffset, finalOffset].map(offset => {
    if (offset === null) return [null,null];
    const row = JSON.parse(runSql(`select row_to_json(x)::text from (
      select a.published_at, a.id from public.global_announcements a
      join public.source_registry s on s.source_id=a.source_id and s.source_status='GREEN'
      where a.publication_status='approved' and a.published_at is not null
      order by a.published_at desc,a.id limit 1 offset ${offset-1}) x;`));
    return [row.published_at,row.id];
});
const cursorQueries = cursorAnchors.map(([ts,id])=>cursorRpc(ts,id));

function invoke(expression, group = 'dashboardAggregates') {
    return new Promise(resolve => {
        const started = performance.now();
        const child = spawn('psql',[...psqlArgs(),'-c',serviceQuery(expression)],{
            env:baseEnv,stdio:['ignore','pipe','pipe']
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
        },25000);
        child.stdout.on('data',chunk => { stdout += chunk; });
        child.stderr.on('data',chunk => { stderr += chunk; });
        child.on('close',code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const latencyMs = performance.now()-started;
            let valid = false;
            if (code === 0) {
                try {
                    const payload = JSON.parse(stdout.trim());
                    valid = payload.status === 'OK' &&
                        (['historicalPagination','historicalCursor'].includes(group) ?
                            !Object.hasOwn(payload,'total') && typeof payload.hasMore === 'boolean' :
                            Number.isInteger(payload.total)) &&
                        Array.isArray(payload.records) && payload.records.length <= 10;
                } catch {}
            }
            resolve({ok:code===0&&valid,latencyMs,code,error:stderr.trim().slice(0,500)});
        });
        child.on('error',error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ok:false,latencyMs:performance.now()-started,code:null,error:error.message});
        });
    });
}

function percentile(values, ratio) {
    if (!values.length) return null;
    const ordered = [...values].sort((a,b)=>a-b);
    return ordered[Math.max(0,Math.ceil(ordered.length*ratio)-1)];
}

async function runWave(group, concurrency, queries) {
    const started = performance.now();
    const results = await Promise.all(Array.from({length:concurrency},(_,index)=>invoke(queries[index%queries.length],group)));
    const wallMs = performance.now()-started;
    const successful = results.filter(result=>result.ok);
    const latencies = successful.map(result=>result.latencyMs);
    return {
        group,concurrency,requests:results.length,successes:successful.length,
        errors:results.length-successful.length,errorRate:(results.length-successful.length)/results.length,
        p50Ms:percentile(latencies,0.50),p95Ms:percentile(latencies,0.95),
        throughputRps:successful.length/(wallMs/1000),wallMs,
        errorSamples:results.filter(result=>!result.ok).slice(0,3).map(result=>result.error)
    };
}

console.log('Warming representative query paths...');
stage = 'warmup';
for (const [group,queries] of [['dashboardAggregates',dashboardQueries],['filteredSmartCards',cardQueries],
    ['historicalCursor',cursorQueries]])
    for (const expression of queries) await invoke(expression,group);

stage = 'query plans';
const plans = {
    dashboardSingle24h:dashboardQueries[0],
    dashboardMultiMonthlyRegion:dashboardQueries[1],
    dashboardThemeHistorical:dashboardQueries[2],
    cardsFirst24h:cardQueries[0],
    cardsFilteredMonthly:cardQueries[1],
    paginationFirst:historicalQueries[0],
    paginationMiddle:historicalQueries[1],
    paginationFinal:historicalQueries[2],
    cursorFirst:cursorQueries[0],cursorMiddle:cursorQueries[1],cursorFinal:cursorQueries[2]
};
for (const [name,expression] of Object.entries(plans)) {
    const plan = runSql(`set statement_timeout='60s'; set role service_role;
        explain (analyze,buffers,settings,format json) select ${expression};`,{timeout:90000});
    writeFileSync(path.join(planRoot,`${name}.json`),plan+'\n');
}

for (const concurrency of [10,25,50,100]) {
    stage = `measurements: ${concurrency} readers`;
    measurements.push(await runWave('dashboardAggregates',concurrency,dashboardQueries));
    measurements.push(await runWave('filteredSmartCards',concurrency,cardQueries));
    measurements.push(await runWave('historicalCursor',concurrency,cursorQueries));
    writeFileSync(path.join(artifactRoot,'benchmark-results.json'),JSON.stringify({
        status:'IN_PROGRESS',generatedAt:new Date().toISOString(),stage,measurements
    },null,2)+'\n');
    console.log(`Completed concurrency ${concurrency}`);
}

stage = 'report';
const rounded = value => value === null ? null : Math.round(value*100)/100;
for (const measurement of measurements) {
    for (const key of ['p50Ms','p95Ms','throughputRps','wallMs']) measurement[key]=rounded(measurement[key]);
}
const groupTargets = {dashboardAggregates:3000,filteredSmartCards:3000,historicalCursor:5000};
const failures = measurements.filter(item => item.errors || item.p95Ms === null || item.p95Ms>groupTargets[item.group]);
const environment = JSON.parse(runSql(`select json_build_object(
    'version',version(),'maxConnections',current_setting('max_connections'),
    'sharedBuffers',current_setting('shared_buffers'),'serverEncoding',current_setting('server_encoding'))::text;`));
environment.runnerCpuCount=os.cpus().length;
environment.runnerCpuModel=os.cpus()[0]?.model||'unknown';
environment.runnerMemoryBytes=os.totalmem();

const evidence = {
    status:failures.length?'FAIL':'PASS',generatedAt:new Date().toISOString(),recordCount:rowCount,
    eligibleRecordCount:total,environment,correctness:{independentTotal,rpcTotal:total,direct24h,rpc24h:rpc24h.total,
        directMulti,rpcMulti:rpcMulti.total,middleOffset,finalOffset,privileges,recordPrivileges,pagination:'MATCH'},
    targetsMs:groupTargets,measurements,failures
};
writeFileSync(path.join(artifactRoot,'benchmark-results.json'),JSON.stringify(evidence,null,2)+'\n');

const lines = [
    '# GPIR M40 PostgreSQL benchmark', '', `**Status:** ${evidence.status}`, '',
    `Records: ${rowCount.toLocaleString()} synthetic governed rows; eligible aggregate rows: ${total.toLocaleString()}.`, '',
    '| Workload | Readers | Requests | p50 ms | p95 ms | Throughput req/s | Errors |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...measurements.map(item=>`| ${item.group} | ${item.concurrency} | ${item.requests} | ${item.p50Ms??'n/a'} | ${item.p95Ms??'n/a'} | ${item.throughputRps} | ${item.errors} |`),
    '', '## Correctness', '',
    `- Exact aggregate: direct ${independentTotal}; RPC ${total}.`,
    `- Rolling 24 hours: direct ${direct24h}; RPC ${rpc24h.total}.`,
    `- Multi-topic OR: direct ${directMulti}; RPC ${rpcMulti.total}.`,
    `- First/middle/final pagination: exact ID match; offsets 0/${middleOffset}/${finalOffset}.`,
    `- Direct execution grants: anon=${privileges.anon}, authenticated=${privileges.authenticated}, service_role=${privileges.serviceRole}.`,
    '', '## Environment', '', '```json', JSON.stringify(environment,null,2), '```', '',
    'Representative query plans are stored in `plans/`.'
];
writeFileSync(path.join(artifactRoot,'benchmark-report.md'),lines.join('\n')+'\n');
console.log(lines.join('\n'));
if (failures.length) process.exitCode=1;
