// SEP-01 three-agent readiness: non-invasive host inventory, not an authentication claim.
// Does not start agents, read credentials, modify files, or enable routing.
import {spawnSync} from 'node:child_process';
import {BRIDGE_PROVIDERS} from './agent-bridge.mjs';
const commands={copilot:['copilot','--version'],aider:['aider','--version'],cline:null};
const results=[];
for(const provider of BRIDGE_PROVIDERS){
 const command=commands[provider];
 if(!command){results.push({provider,status:'HOST_TRANSPORT_REQUIRED',authenticated:false,eligible:false});continue;}
 const result=spawnSync(command[0],command.slice(1),{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,Path:process.env.Path,SystemRoot:process.env.SystemRoot},stdio:'pipe'});
 const installed=!result.error&&result.status===0;
 results.push({provider,status:installed?'CLI_PRESENT_AUTH_UNVERIFIED':'CLI_UNAVAILABLE',authenticated:false,eligible:false});
}
console.log(JSON.stringify({gate:'SEP01_THREE_AGENT_READINESS',results,production_writes:false}));
