// SEP-01 one-time independent provider authentication, no repository writes.
// Discover accessible models from the credential itself; do not guess model IDs.
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
const key=process.env.GEMINI_API_KEY,requested=process.env.SEP01_GEMINI_MODEL;
if(!key)throw Error('GEMINI_CREDENTIAL_REQUIRED');
const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key}});
if(!response.ok)throw Error('GEMINI_MODEL_DISCOVERY_HTTP_'+response.status);
const body=await response.json();
const eligible=(body.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-zA-Z0-9._-]+$/.test(m.name)).map(m=>m.name.slice(7));
if(!eligible.length)throw Error('NO_ACCESSIBLE_GEMINI_GENERATION_MODELS');
const model=eligible.includes(requested)?requested:eligible.find(m=>/flash/i.test(m))||eligible[0];
console.log(JSON.stringify({discovery:'GEMINI_MODEL_DISCOVERY_PASS',requested_model:requested||null,selected_model:model,requested_available:eligible.includes(requested),available_model_count:eligible.length}));
const editor=createGeminiCodeEditor({apiKey:key,model});
const result=await editor({job:{scope:'dashboard',instruction:'Replace the supplied file with exactly: export const ready = true; followed by a newline.'},path:'fixture.js',content:'export const ready = false;\n'});
if(result.status!=='EDIT'||result.content!=='export const ready = true;\n')throw Error('GEMINI_INDEPENDENT_ACCEPTANCE_NOT_VERIFIED_'+result.status);
console.log(JSON.stringify({result:'SEP01_INDEPENDENT_GEMINI_ACCEPTANCE_PASS',model,workspace:'NO_GIT_WRITES',provider:'google-gemini-direct'}));
