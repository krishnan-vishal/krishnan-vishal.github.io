import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('admin/central-command/index.html','utf8');
test('reference dashboard has five KPIs and five functional navigation tiles',()=>{
 const dashboard=page.slice(page.indexOf('<section id="gpir-smart-dashboard"'),page.indexOf('</nav></section>',page.indexOf('<section id="gpir-smart-dashboard"')));
 assert.equal((dashboard.match(/class="gpir-kpi-card"/g)||[]).length,5);
 assert.equal((dashboard.match(/class="gpir-smart-tile"/g)||[]).length,5);
 for(const anchor of ['directive-heading','plan-heading','execution-supervision-heading','governance-heading','provider-heading'])assert.ok(page.includes('id="'+anchor+'"'));
});
test('no invented completion, job or turnaround statistics',()=>{
 for(const id of ['kpi-commands','kpi-active','kpi-completed','kpi-turnaround'])assert.match(page,new RegExp('id="'+id+'">—<'));
 assert.match(page,/Requires verified job timestamps/);
 assert.match(page,/id="kpi-governance">GATED/);
});
test('original execution authorization, receipts and sign-out remain wired',()=>{
 for(const id of ['directive-text','submit-directive','intelligence-advanced','intelligence-refresh','owner-sign-out','live-job-receipt'])assert.ok(page.includes('id="'+id+'"'));
 assert.match(page,/AUTHORIZE_ONE_INTELLIGENCE_OPERATION/);
 assert.match(page,/AUTHORIZE_ONE_SEP_JOB/);
});
