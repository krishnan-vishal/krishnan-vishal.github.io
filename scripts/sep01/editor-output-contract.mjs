// Compact append-only contract for authorized documentation additions.
// Large reports are never regenerated in full by a model.
export function prepareEditorTask({job,path,content}){
 const instruction=job?.instruction;
 const appendOnly=job?.scope==='development'&&typeof instruction==='string'&&/^append\b/i.test(instruction.trim())&&/^docs\/[a-zA-Z0-9/_-]+\.md$/.test(path);
 if(!appendOnly)return {
  prompt:'You are a code editor. Return only JSON with a content string containing the complete replacement file. No markdown fences, shell commands or secrets.',
  context:content,
  materialize:fragment=>fragment
 };
 const title=/\bsection titled\s*["“']([^"”']{3,160})["”']/i.exec(instruction)?.[1]||null;
 return {
  prompt:'You are a Markdown documentation editor. Return ONLY JSON with a content string containing the NEW Markdown section to append, beginning with a Markdown heading. Do not reproduce, summarize, rewrite or remove any existing document content. No code fences, shell commands or secrets.',
  context:content.slice(-4000),
  materialize:fragment=>{
   const addition=fragment.trim();
   if(!/^#{1,4}\s+\S/.test(addition)||addition.length>12000||(title&&!addition.includes(title)))throw Error('INVALID_APPEND_SECTION');
   if(title&&content.includes(title))throw Error('SECTION_ALREADY_EXISTS');
   const separator=content.endsWith('\n\n')?'':content.endsWith('\n')?'\n':'\n\n';
   return content+separator+addition+'\n';
  }
 };
}
