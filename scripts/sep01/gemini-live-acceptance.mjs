// SEP-01 one-time independent provider authentication, no repository writes.
import {createGeminiCodeEditor} from './gemini-code-editor.mjs';
const key=process.env.GEMINI_API_KEY,model=process.env.SEP01_GEMINI_MODEL;
if(!key||!model)throw Error('GEMINI_CREDENTIAL_AND_APPROVED_MODEL_REQUIRED');
const editor=createGeminiCodeEditor({apiKey:key,model});
const response=await editor({job:{scope:'dashboard',instruction:'Replace the supplied file with exactly: export const ready = true; followed by a newline.'},path:'fixture.js',content:'export const ready = false;\n'});
if(response.status!=='EDIT'||response.content!=='export const ready = true;\n')throw Error('GEMINI_INDEPENDENT_ACCEPTANCE_NOT_VERIFIED');
console.log(JSON.stringify({result:'SEP01_INDEPENDENT_GEMINI_ACCEPTANCE_PASS',model,workspace:'NO_GIT_WRITES',provider:'google-gemini-direct'}));
