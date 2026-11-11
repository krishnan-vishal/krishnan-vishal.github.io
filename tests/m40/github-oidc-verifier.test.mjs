import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGithubPublisherOIDC } from '../../supabase/functions/_shared/gpir-github-oidc.mjs';
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', use: 'sig', alg: 'RS256' };
const now = Math.floor(Date.now() / 1000);
const repo = 'krishnan-vishal/krishnan-vishal.github.io';
const claims = {
 iss:'https://token.actions.githubusercontent.com', aud:'gpir-m40-draft-registration',
 repository:repo, ref:'refs/heads/main', environment:'gpir-editorial-publisher',
 workflow_ref:repo+'/.github/workflows/m40-governed-editorial-publisher.yml@refs/heads/main',
 sub:'repo:'+repo+':environment:gpir-editorial-publisher',
 event_name:'workflow_dispatch',iat:now-10,nbf:now-10,exp:now+120,run_id:'123'
};
function token(overrides = {}, key = privateKey) {
 const body=b64({...claims,...overrides});
 const head=b64({alg:'RS256',kid:'fixture',typ:'JWT'});
 const input=head+'.'+body;
 return input+'.'+sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
}
const fetchImpl=async()=>({ok:true,json:async()=>({keys:[jwk]})});
test('accepts a cryptographically valid exact workflow token',async()=>{
 const result=await verifyGithubPublisherOIDC(token(),{audience:claims.aud,fetchImpl,now});
 assert.equal(result.repository,repo);
});
for(const [label,changes] of Object.entries({
 'wrong audience':{aud:'elsewhere'}, 'wrong repository':{repository:'attacker/repo'},
 'wrong branch':{ref:'refs/heads/dev'}, 'wrong environment':{environment:'unprotected'},
 'wrong workflow':{workflow_ref:'attacker/repo/.github/workflows/other.yml@refs/heads/main'},
 'wrong event':{event_name:'pull_request'}, 'expired':{exp:now-1},
 'too long lived':{exp:now+3600}, 'future token':{iat:now+300}
})) test('rejects '+label,async()=>{
 await assert.rejects(verifyGithubPublisherOIDC(token(changes),{audience:claims.aud,fetchImpl,now}),/OIDC_DENIED/);
});
test('rejects tampered signature',async()=>{
 const parts=token().split('.');parts[2]=parts[2].slice(0,-2)+'aa';
 await assert.rejects(verifyGithubPublisherOIDC(parts.join('.'),{audience:claims.aud,fetchImpl,now}),/OIDC_DENIED/);
});
test('rejects unknown signing key',async()=>{
 await assert.rejects(verifyGithubPublisherOIDC(token(),{audience:claims.aud,fetchImpl:async()=>({ok:true,json:async()=>({keys:[]})}),now}),/OIDC_DENIED/);
});
