import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareEditorTask} from './editor-output-contract.mjs';
const original='# Existing M41 report\n'+'Existing content. '.repeat(2300);
const job={scope:'development',instruction:'Append a clearly labelled section titled "SEP-01 Owner Command Acceptance Test" stating that this is a non-production test. Preserve conclusions.'};
test('40KB document append requests only bounded context and retains all original bytes',()=>{
 const contract=prepareEditorTask({job,path:'docs/M41-FULL-CUTOVER-REPORT.md',content:original});
 assert.ok(original.length>39000);
 assert.ok(contract.context.length<=4000);
 const result=contract.materialize('## SEP-01 Owner Command Acceptance Test\n\nNon-production test of authenticated command execution.');
 assert.ok(result.startsWith(original));
 assert.match(result,/^## SEP-01 Owner Command Acceptance Test/m);
 assert.equal(result.slice(0,original.length),original);
});
test('duplicate named section is rejected and unrelated file rewrites retain existing contract',()=>{
 const contract=prepareEditorTask({job,path:'docs/M41-FULL-CUTOVER-REPORT.md',content:original+'\n## SEP-01 Owner Command Acceptance Test\n'});
 assert.throws(()=>contract.materialize('## SEP-01 Owner Command Acceptance Test\n\nRepeat.'),/SECTION_ALREADY_EXISTS/);
 assert.throws(()=>prepareEditorTask({job,path:'docs/M41-FULL-CUTOVER-REPORT.md',content:original}).materialize('Existing body rewritten.'),/INVALID_APPEND_SECTION/);
 const css=prepareEditorTask({job,path:'assets/css/site.css',content:'body{}'});
 assert.equal(css.materialize('p{}'),'p{}');
});
