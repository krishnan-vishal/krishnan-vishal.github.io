import test from 'node:test';
import assert from 'node:assert/strict';
import {createTwoProviderCodingWorker} from './two-provider-coding-worker.mjs';
test('worker fails closed without both authorized credentials and runtime health',()=>{
 assert.throws(()=>createTwoProviderCodingWorker({providerHealth:[]}),/SEP01_WORKER_AUTH_AND_HEALTH_REQUIRED/);
});
