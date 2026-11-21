import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const directory=dirname(fileURLToPath(import.meta.url));
const worker=join(directory,'durable-actions-worker.mjs');
test('entire production dispatcher parses under Node before deployment',()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',worker],{encoding:'utf8',timeout:15000}));
});
test('development path and stylesheet guards remain present in both validation gates',()=>{
 const source=readFileSync(worker,'utf8');
 assert.equal((source.match(/DEVELOPMENT_PATH_NOT_AUTHORIZED/g)||[]).length,2);
 assert.match(source,/DEVELOPMENT_OUTPUT_INVALID/);
 assert.match(source,/UNSAFE_STYLESHEET_OUTPUT/);
 assert.match(source,/job\.locked_paths\.length!==1/);
});

test('one-shot SEP-02 fixture has a separately allowlisted output contract',()=>{
 const source=readFileSync(worker,'utf8');
 assert.match(source,/expectedSep02Fixture/);
 assert.match(source,/scripts\/sep01\/sep02-acceptance-fixture\.txt/);
 assert.match(source,/job\.acceptance_series==='SEP02'/);
 assert.match(source,/job\.single_attempt===true/);
 assert.match(source,/FIXTURE_PATH_NOT_AUTHORIZED/);
 assert.match(source,/ACCEPTANCE_FIXTURE_VALIDATION_FAILED/);
});
