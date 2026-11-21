// Local acceptance: invokes the existing Codex adapter against an in-memory fixture.
// Never writes to the repo, pushes commits, or connects to Supabase.
import {createCodexCliEditor} from './codex-cli-editor.mjs';
const model=process.argv[2]||'gpt-5.6-sol';
const editor=createCodexCliEditor({model,enabled:true,authenticated:true});
const result=await editor({
 job:{scope:'fixture',instruction:'Return the exact content unchanged. This is a read-only adapter connectivity test.',sensitivity_tier:null},
 path:'scripts/sep01/acceptance-fixture.txt',
 content:'SEP-01 durable checkpoint acceptance fixture.\nSTATE: CHECKPOINT_VERIFIED\n'
});
const pass=result.status==='EDIT'&&result.content==='SEP-01 durable checkpoint acceptance fixture.\nSTATE: CHECKPOINT_VERIFIED\n';
console.log(JSON.stringify({test:'SEP01_CODEX_LOCAL_ADAPTER',status:pass?'PASS':'FAIL',provider_status:result.status,model}));
if(!pass)process.exitCode=1;
