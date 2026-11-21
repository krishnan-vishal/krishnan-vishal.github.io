// SEP-01: provider inventory contract acceptance. No provider is declared live by this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const registry=JSON.parse(readFileSync(new URL('./provider-registry.json',import.meta.url),'utf8'));
const expected=['gemini','openrouter','codex','cline','copilot','aider'];
test('all six registered providers have unique stable identifiers',()=>{
 assert.equal(registry.schema_version,1);
 assert.deepEqual(registry.providers.map(p=>p.id),expected);
 assert.equal(new Set(registry.providers.map(p=>p.id)).size,6);
});
test('registry cannot misrepresent an unimplemented adapter as executable',()=>{
 for(const p of registry.providers){
  assert.match(p.id,/^[a-z][a-z0-9-]*$/);
  assert.ok(p.kind&&p.health&&p.status);
  if(!p.adapter)assert.equal(p.status,'registered_only');
 }
});
test('all future providers require authenticated checkpoint-gated contract',()=>{
 const fields=registry.integration_contract.required;
 for(const field of ['adapter','health','approval_scope','checkpoint_protocol','idempotency','sensitivity_policy'])assert.ok(fields.includes(field));
 assert.match(registry.integration_contract.policy,/acceptance pass/);
});
