// Independent release gate. Audit triage acceptance cannot authorize deployment.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {releaseDecision} from './advisory-policy.mjs';
const file=join(process.env.RUNNER_TEMP||process.cwd(),'gpir-native-audit.json');
let report;
try{report=JSON.parse(readFileSync(file,'utf8'));}catch(e){console.error('Release denied: audit evidence missing or invalid:',e.message);process.exit(1);}
let decision;
try{decision=releaseDecision(report);}catch(e){console.error('Release denied: invalid audit evidence:',e.message);process.exit(1);}
console.log(JSON.stringify({releaseDecision:decision,releaseAuthorized:decision==='PASS'}));
if(decision!=='PASS')process.exit(1);
