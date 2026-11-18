// Record build identity and inspect emitted code. This is evidence, not an
// exposure attestation: marker presence alone cannot prove complete coverage.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const build=path.join(root,'.open-next');
const sha=b=>createHash('sha256').update(b).digest('hex');
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{
    const p=path.join(dir,e.name);
    if(e.isSymbolicLink()) throw Error('Unexpected artifact symlink: '+p);
    return e.isDirectory()?walk(p):e.isFile()?[p]:(()=>{throw Error('Unsupported artifact entry');})();
  });
}
if(!fs.statSync(path.join(build,'worker.js')).isFile()) throw Error('Worker entrypoint missing');
const files=walk(build).map(p=>{
  const b=fs.readFileSync(p);
  const relative=path.relative(build,p).split(path.sep).join('/');
  const code=/\.(?:js|mjs|cjs)$/.test(p);
  const text=code?b.toString('utf8'):'';
  return {path:relative,bytes:b.length,sha256:sha(b),...(code?{
    guardOccurrences:text.split('GPIR: unsafe or unsupported repeated extglob').length-1,
    parserIndicators:text.split('maxExtglobRecursion').length-1
  }:{})};
});
if(!files.length) throw Error('Empty build');
const evidence={schema:1,commit:process.env.GITHUB_SHA||null,lockSha256:sha(fs.readFileSync(path.join(root,'package-lock.json'))),artifactSha256:sha(JSON.stringify(files)),files,decision:'EXPOSURE_NOT_ATTESTED'};
const out=process.env.RUNNER_TEMP||root;
fs.writeFileSync(path.join(out,'gpir-worker-build-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({commit:evidence.commit,artifactSha256:evidence.artifactSha256,files:files.length,guardFiles:files.filter(f=>f.guardOccurrences).map(f=>f.path),parserFiles:files.filter(f=>f.parserIndicators).map(f=>f.path),decision:evidence.decision}));
