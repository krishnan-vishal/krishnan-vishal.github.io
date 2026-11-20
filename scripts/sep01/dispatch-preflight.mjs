// SEP-01 scheduled GitHub Actions dispatcher preflight.
// Resolve only approved job branches; never execute user-provided shell strings.
import {execFileSync} from 'node:child_process';
import {appendFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createDurableJobStore} from './durable-job-store.mjs';
const store=createDurableJobStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
const job=process.env.SEP01_JOB_ID?await store.get(process.env.SEP01_JOB_ID):await store.nextQueued();
if(!job){console.log('SEP01_NO_QUEUED_JOB');process.exit(0);}
if(job.status!=='QUEUED'||!/^sep01\/jobs\/[a-zA-Z0-9._-]+$/.test(job.branch))throw Error('UNAUTHORIZED_JOB_BRANCH_OR_STATE');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:30000}).trim();
git('fetch','--no-tags','origin','refs/heads/'+job.branch+':refs/remotes/origin/'+job.branch);
const worktree=resolve(process.cwd(),'../sep01-job-worktree');
mkdirSync(worktree,{recursive:true});
git('worktree','add','--force','-B',job.branch,worktree,'refs/remotes/origin/'+job.branch);
if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,'SEP01_WORKTREE='+worktree+'\n');
if(process.env.GITHUB_ENV)appendFileSync(process.env.GITHUB_ENV,'SEP01_JOB_ID='+job.job_id+'\n');
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'has_job=true\n');
console.log(JSON.stringify({event:'SEP01_JOB_SELECTED',job_id:job.job_id,branch:job.branch}));
