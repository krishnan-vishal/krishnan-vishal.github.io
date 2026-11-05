const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parseCsv,recoverFromEcbCsv}=require('../scripts/fx/ecb-csv-fallback');
const csv='Date, USD, JPY, INR, \n2026-01-02, 1.17, 182, 104, \n2026-01-05, 1.18, 183, 105, \n';
test('parses exact ECB fixing dates and currency values',()=>{
 const {catalog,observations}=parseCsv(csv,'2026-01-01','2026-01-05');
 assert.equal(observations.size,2);assert.equal(observations.get('2026-01-02').get('JPY'),182);
 assert.equal(catalog.has('AED'),false);
});
test('rejects duplicate/conflicting dates',()=>assert.throws(()=>parseCsv(csv+'2026-01-02, 1.19, 183, 104, \n','2026-01-01','2026-01-05'),/CONFLICTING/));
test('rejects invalid rates',()=>assert.throws(()=>parseCsv(csv.replace('182','-1'),'2026-01-01','2026-01-05'),/INVALID/));
test('rejects malformed CSV',()=>assert.throws(()=>parseCsv('Date, USD\n2026-01-02','2026-01-01','2026-01-05'),/INVALID/));
test('rejects dates outside actual observation range',()=>assert.throws(()=>parseCsv(csv,'2026-02-01','2026-02-05'),/NO_SOURCE/));
test('fetches CSV with source provenance',async()=>{
 const result=await recoverFromEcbCsv({config:{},from:'2026-01-01',to:'2026-01-05',
 fetchImpl:async()=>({ok:true,text:async()=>csv}),buildRecovery:({source,observations})=>({source,count:observations.size})});
 assert.deepEqual(result,{source:'ecb-official-csv',count:2});
});
