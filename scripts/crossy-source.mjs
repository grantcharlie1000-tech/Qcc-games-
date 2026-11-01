/** Capture/probe provenance includes untracked runtime files as well as git diffs. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('..',import.meta.url));
export async function crossySourceHash(){
  const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--',
    'src','scripts/capture-crossy.mjs','scripts/perf-crossy.mjs','scripts/crossy-source.mjs'],{cwd:repo,encoding:'utf8'});
  const hash=createHash('sha256');
  for(const file of [...new Set(files.split('\0').filter(Boolean))].sort()){
    hash.update(file).update('\0');
    try{hash.update(await readFile(new URL(file,new URL('../',import.meta.url))));}
    catch(error){if(error.code!=='ENOENT')throw error;hash.update('<deleted>');}
  }
  return hash.digest('hex');
}
