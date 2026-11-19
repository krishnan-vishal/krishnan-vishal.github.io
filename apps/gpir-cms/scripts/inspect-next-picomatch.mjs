// Inspect the actual OpenNext output for the additional Next-bundled picomatch.
// Evidence only: static references cannot establish runtime reachability.
import {existsSync,readFileSync,writeFileSync,readdirSync,lstatSync,readlinkSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const base=join(root,'.open-next');
const target='server-functions/default/node_modules/next/dist/compiled/picomatch/index.js';
const entry=join(base,target);
const hash=b=>createHash('sha256').update(b).digest('hex');
const refs=[];
const signals=['next/dist/compiled/picomatch','compiled/picomatch','picomatch/index.js'];
let scanned=0;
function visit(dir){
 for(const e of readdirSync(dir,{withFileTypes:true})){
  const p=join(dir,e.name);
  if(e.isSymbolicLink())continue;
  if(e.isDirectory()){visit(p);continue;}
  if(!e.isFile()||! /\.(?:js|mjs|cjs)$/.test(e.name))continue;
  scanned++;
  const data=readFileSync(p,'utf8');
  if(signals.some(s=>data.includes(s)))refs.push(relative(base,p).replaceAll('\\','/'));
 }
}
if(!existsSync(join(base,'worker.js')))throw Error('Missing compiled Worker');
visit(base);
const found=existsSync(entry);
const evidence={schema:1,commit:process.env.GITHUB_SHA||null,compiledPicomatch:found?{path:target,sha256:hash(readFileSync(entry)),bytes:readFileSync(entry).length}:null,scannedJavaScriptFiles:scanned,staticReferenceFiles:refs,conclusion:'REACHABILITY_UNPROVEN',exceptionAuthorized:false};
const dest=join(process.env.RUNNER_TEMP||root,'gpir-next-picomatch-exposure.json');
writeFileSync(dest,JSON.stringify(evidence,null,2));
console.log(JSON.stringify({compiledPicomatch:evidence.compiledPicomatch,staticReferences:refs.length,conclusion:evidence.conclusion,evidence:dest}));
