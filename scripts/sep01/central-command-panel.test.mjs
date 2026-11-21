import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../admin/central-command/index.html',import.meta.url),'utf8');
test('Central Command is a read-only supervisor, not a new dispatcher',()=>{
 assert.match(page,/Central Command/);
 assert.match(page,/api\.github\.com\/repos\/krishnan-vishal/);
 assert.match(page,/No autonomous dispatch/);
 assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|GEMINI_API_KEY/);
 assert.doesNotMatch(page,/fetch\([^\n]*method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});
test('Every registered provider is represented without claiming unverified readiness',()=>{
 for(const id of ['Codex CLI','Gemini','OpenRouter','GitHub Copilot','Cline','Aider'])assert.ok(page.includes(id));
 assert.match(page,/cross-CLI acceptance pending/);
 assert.match(page,/not a live heartbeat/);
});
