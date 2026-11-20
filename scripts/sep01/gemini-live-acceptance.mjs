// SEP-01 independent provider acceptance: only text-capable generation models.
// Avoid TTS/audio/image/video models, which can advertise generateContent but reject TEXT.
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
const key=process.env.GEMINI_API_KEY,requested=process.env.SEP01_GEMINI_MODEL;
if(!key)throw Error('GEMINI_CREDENTIAL_REQUIRED');
const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':key}});
if(!response.ok)throw Error('GEMINI_MODEL_DISCOVERY_HTTP_'+response.status);
const body=await response.json();
const eligible=(body.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-zA-Z0-9._-]+$/.test(m.name)&&!/tts|audio|speech|image|video|live|embedding/i.test(m.name)).map(m=>m.name.slice(7));
if(!eligible.length)throw Error('NO_TEXT_CAPABLE_GEMINI_MODELS');
const ordered=[...(eligible.includes(requested)?[requested]:[]),...eligible.filter(m=>m!==requested&&/flash/i.test(m)),...eligible.filter(m=>m!==requested&&!/flash/i.test(m))];
console.log(JSON.stringify({discovery:'GEMINI_TEXT_MODEL_DISCOVERY_PASS',requested_model:requested||null,requested_available:eligible.includes(requested),text_model_count:eligible.length}));
const errors=[];
let accepted=null;
for(const model of ordered.slice(0,4)){
 const editor=createGeminiCodeEditor({apiKey:key,model});
 const result=await editor({job:{scope:'dashboard',instruction:'Replace the supplied file with exactly: export const ready = true; followed by a newline.'},path:'fixture.js',content:'export const ready = false;\n'});
 if(result.status==='MODEL_UNAVAILABLE'||result.status==='PROVIDER_BUSY'){errors.push({model,status:result.status,reason:result.reason||null});continue;}
 if(result.status==='QUOTA_EXHAUSTED'||result.status==='PROVIDER_UNAVAILABLE')throw Error('GEMINI_ACCESS_'+result.status);
 if(result.status!=='EDIT'||result.content!=='export const ready = true;\n')throw Error('GEMINI_INDEPENDENT_ACCEPTANCE_NOT_VERIFIED_'+result.status);
 accepted=model;break;
}
if(!accepted)throw Error('GEMINI_NO_WORKING_TEXT_MODEL '+JSON.stringify(errors));
console.log(JSON.stringify({result:'SEP01_INDEPENDENT_GEMINI_ACCEPTANCE_PASS',model:accepted,workspace:'NO_GIT_WRITES',provider:'google-gemini-direct'}));
