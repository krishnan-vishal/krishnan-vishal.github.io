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
