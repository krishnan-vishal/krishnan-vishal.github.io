// SEP-01 local durable checkpoint store for single-runner execution.
// This adapter does not claim distributed locks or cross-runner persistence.
import {mkdir,open,readFile,rename,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const KEY=/^[a-zA-Z0-9_-]{1,100}$/;
export class FileJobStore {
  constructor(directory){this.directory=directory;}
  file(id){if(!KEY.test(id))throw Error('INVALID_JOB_ID');return join(this.directory,id+'.json');}
  async read(id){try{return JSON.parse(await readFile(this.file(id),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async save(job,expectedRevision=null){
    if(!job?.job_id || !job.idempotency_key)throw Error('INVALID_JOB');
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const target=this.file(job.job_id),lock=target+'.lock';
    let handle;
    try{handle=await open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('JOB_LOCKED');throw e;}
    try{
      const current=await this.read(job.job_id);
      if(current && current.idempotency_key!==job.idempotency_key)throw Error('IDEMPOTENCY_CONFLICT');
      if((current?.revision??null)!==expectedRevision)throw Error('STALE_REVISION');
      const record={...job,revision:(current?.revision??0)+1};
      const tmp=target+'.'+randomUUID()+'.tmp';
      try{
        const out=await open(tmp,'wx',0o600);
        try{await out.writeFile(JSON.stringify(record)+'\n');await out.sync();}finally{await out.close();}
        await rename(tmp,target);
        const dir=await open(dirname(target),'r');try{await dir.sync();}finally{await dir.close();}
      }finally{await rm(tmp,{force:true});}
      return record;
    }finally{await handle.close();await rm(lock,{force:true});}
  }
}
