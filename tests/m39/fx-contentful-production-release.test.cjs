'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const index=JSON.parse(fs.readFileSync(path.join(root,'assets/data/fx/editorial-public.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m39/fx-contentful-batch.json'),'utf8'));
test('26 public FX links have governed matching production HTML pages',()=>{
 assert.equal(index.source,'contentful-published-public');assert.equal(index.records.length,26);assert.equal(new Set(index.records.map(r=>r.pair)).size,26);
 for(const e of manifest.entries){assert.equal(e.accessClass,'PUBLIC');assert.equal(e.ownerApproved,true);const r=index.records.find(r=>r.pair===e.pair);assert.ok(r);assert.equal(r.publicationId,e.publicationIdentity);assert.equal(r.url,e.canonicalRoute);
 const html=fs.readFileSync(path.join(root,e.canonicalRoute.slice(1),'index.html'),'utf8');assert.match(html,/data-gpir-access-class="PUBLIC"/);assert.ok(html.includes(e.publicationIdentity));assert.ok(html.includes('https://fintechoisis.com'+e.canonicalRoute));assert.doesNotMatch(html,/controlled-validation|gpir-protected-publication|gpir-reader-summary|data-gpir-auth-state/);}
});
