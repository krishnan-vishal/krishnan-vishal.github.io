'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildFxEditorialIndex} = require('../../scripts/m39/build-fx-editorial-bridge');
const record = (overrides = {}) => ({
  fields: {publicationTitle:'USD/JPY — Monetary policy',executiveSummary:'Cited research.',
    canonicalUrlCandidate:'/pages/intelligence/usd-jpy/',publicationStatus:'CURRENT',
    gpirPublicationId:'fx-1',...overrides.fields},
  presentation:{accessClass:'PUBLIC',...overrides.presentation}
});
test('exports only explicitly public current pair research from delivery', () => {
  const index=buildFxEditorialIndex({source:{mode:'delivery'},records:[
    record(),record({fields:{publicationStatus:'HISTORICAL'}}),
    record({fields:{publicationStatus:'PUBLISHED'}}),
    record({presentation:{accessClass:'PREMIUM'}}),
    record({fields:{publicationTitle:'Japan policy overview'}})
  ]});
  assert.equal(index.records.length,1);
  assert.equal(index.records[0].pair,'USD/JPY');
  assert.equal(index.records[0].url,'/pages/intelligence/usd-jpy/');
});
test('rejects preview source', () => {
  assert.throws(()=>buildFxEditorialIndex({source:{mode:'preview'},records:[record()]}),/delivery/);
});
test('does not export unsafe canonical URLs', () => {
  assert.equal(buildFxEditorialIndex({source:{mode:'delivery'},records:[
    record({fields:{canonicalUrlCandidate:'https://evil.example/'}})
  ]}).records.length,0);
});
