const assert=require('node:assert/strict');
const {test}=require('node:test');
const {URL:ECB_URL,parseCsv,recoverFromEcbCsv}=require('../scripts/fx/ecb-csv-fallback');
const {recoverHistoricalReference}=require('../scripts/fx/historical-reference');
const csv='KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,TITLE_COMPL\n'+
 'EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-01-02,182,"ECB reference rate, JPY"\n'+
 'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-02,1.17,"ECB reference rate, USD"\n'+
 'EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-01-05,183,"ECB reference rate, JPY"\n'+
 'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-01-05,1.18,"ECB reference rate, USD"\n';
const catalog=['EUR','USD','JPY'].map(code=>({
    iso_code:code,name:code,start_date:'1999-01-04',end_date:null
}));
const config={featuredPairs:['USD/JPY'],targetRegionalCurrencies:{},marketRegions:{}};
test('parses exact ECB fixing dates and currency values',()=>{
 const {catalog,observations}=parseCsv(csv,'2026-01-01','2026-01-05');
 assert.equal(observations.size,2);assert.equal(observations.get('2026-01-02').get('JPY'),182);
 assert.equal(catalog.has('AED'),false);
});
test('rejects duplicate/conflicting dates',()=>assert.throws(()=>parseCsv(csv+
 'EXR.D.JPY.EUR.SP00.A,D,JPY,EUR,SP00,A,2026-01-02,183,"Duplicate"\n',
 '2026-01-01','2026-01-05'),/CONFLICTING/));
test('rejects invalid rates',()=>assert.throws(()=>parseCsv(csv.replace('182','-1'),'2026-01-01','2026-01-05'),/INVALID/));
test('rejects malformed CSV',()=>assert.throws(()=>parseCsv('Date,USD\n2026-01-02,1.17','2026-01-01','2026-01-05'),/INVALID/));
test('rejects dates outside actual observation range',()=>assert.throws(()=>parseCsv(csv,'2026-02-01','2026-02-05'),/NO_SOURCE/));
test('fetches CSV with source provenance',async()=>{
 const result=await recoverFromEcbCsv({config:{},from:'2026-01-01',to:'2026-01-05',
 fetchImpl:async url=>{assert.match(url,/startPeriod=2026-01-01/);return {ok:true,text:async()=>csv};},
 buildRecovery:({source,sourceUrl,observations})=>({source,sourceUrl,count:observations.size})});
 assert.deepEqual(result,{source:'ecb-official-csv',sourceUrl:ECB_URL,count:2});
});

const fallbackCases=[
    ['HTTP 522',async()=>({ok:false,status:522})],
    ['HTTP 429',async()=>({ok:false,status:429})],
    ['HTTP 5xx',async()=>({ok:false,status:503})],
    ['invalid rate payload',async()=>({ok:true,json:async()=>[
        {date:'2026-01-02',base:'EUR',quote:'JPY',rate:-1}
    ]})],
    ['malformed JSON',async()=>({ok:true,json:async()=>{
        throw new SyntaxError('Unexpected end of JSON input');
    }})],
    ['empty rate payload',async()=>({ok:true,json:async()=>[]})],
    ['network failure',async()=>{
        throw new TypeError('fetch failed');
    }]
];

for(const [label,ratesResponse] of fallbackCases){
    test(`falls back to official ECB CSV after ${label}`,async()=>{
        let ecbRequests=0;
        const result=await recoverHistoricalReference({config,from:'2026-01-01',to:'2026-01-05',
            fetchImpl:async url=>{
                const request=new URL(url);
                if(request.pathname==='/v2/currencies') return {ok:true,json:async()=>catalog};
                if(request.pathname==='/v2/providers/ecb/rates') return ratesResponse();
                if(url.startsWith(ECB_URL)){
                    ecbRequests++;
                    return {ok:true,text:async()=>csv};
                }
                throw new Error(`unexpected URL: ${url}`);
            }});
        assert.equal(ecbRequests,1);
        assert.equal(result.report.source,'ecb-official-csv');
        assert.equal(result.report.sourceUrl,ECB_URL);
        assert.equal(result.rows.length,2);
        assert.equal(result.rows[0].rate,182/1.17);
    });
}

test('does not mask non-recoverable Frankfurter HTTP failures',async()=>{
    let ecbRequests=0;
    await assert.rejects(recoverHistoricalReference({config,from:'2026-01-01',to:'2026-01-05',
        fetchImpl:async url=>{
            const request=new URL(url);
            if(request.pathname==='/v2/currencies') return {ok:true,json:async()=>catalog};
            if(request.pathname==='/v2/providers/ecb/rates') return {ok:false,status:404};
            ecbRequests++;
            return {ok:true,text:async()=>csv};
        }}),/FX_HISTORY_SOURCE_HTTP_404/);
    assert.equal(ecbRequests,0);
});
