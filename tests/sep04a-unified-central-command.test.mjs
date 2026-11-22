import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('admin/central-command/index.html','utf8');
test('intelligence controls are optional within the single command workspace',()=>{
 const workspace=html.indexOf('<div class="command-workspace">');
 const advanced=html.indexOf('id="intelligence-advanced"');
 const agents=html.indexOf('id="sep03-agent-heading"');
 assert.ok(workspace>=0&&advanced>workspace&&agents>advanced);
 assert.doesNotMatch(html,/<section class="card" aria-labelledby="intelligence-operations-heading">/);
 assert.match(html,/<details id="intelligence-advanced"/);
 assert.match(html,/id="directive-text"/);
 assert.match(html,/id="intelligence-source"/);
 assert.match(html,/id="intelligence-refresh"/);
});
test('one primary submit route retains distinct authorization gates',()=>{
 assert.match(html,/action:'intelligence_classify'/);
 assert.match(html,/action:'intelligence_submit'/);
 assert.match(html,/action:'submit_planned'/);
 assert.match(html,/AUTHORIZE_ONE_INTELLIGENCE_OPERATION/);
 assert.match(html,/AUTHORIZE_ONE_SEP_JOB/);
});
