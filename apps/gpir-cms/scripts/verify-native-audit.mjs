// Preserve native npm audit evidence and enforce the approved, fail-closed policy.
// The exception is deliberately NOT activated without independently verified
// runtime exposure and deployment-integrity attestations.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {classify,releaseDecision} from './advisory-policy.mjs';
const cmd=process.platform==='win32'?'npm.cmd':'npm';
const run=spawnSync(cmd,['audit','--json','--audit-level=high'],{encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000,shell:process.platform==='win32'});
if(run.error){console.error('Native audit execution failed:',run.error.message);process.exit(1);}
if(run.signal||![0,1].includes(run.status)){console.error('Native audit unavailable:',run.signal||run.status,run.stderr?.slice(-1500));process.exit(1);}
let report;
try{report=JSON.parse(run.stdout);}catch{console.error('Native audit did not return valid JSON');process.exit(1);}
const evidence=process.env.RUNNER_TEMP?process.env.RUNNER_TEMP+'/gpir-native-audit.json':'gpir-native-audit.json';
writeFileSync(evidence,JSON.stringify(report,null,2));
let classification,decision;
try{classification=classify(report);decision=releaseDecision(report);}catch(e){console.error('Audit policy rejected malformed evidence:',e.message);process.exit(1);}
console.log(JSON.stringify({classification,decision,report:evidence,counts:report.metadata?.vulnerabilities}));
if(decision!=='PASS')process.exit(1);
