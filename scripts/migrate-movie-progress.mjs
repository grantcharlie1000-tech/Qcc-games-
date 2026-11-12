// One release migration only. Never applies unrelated pending backend migrations.
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {migrate} from './db-migrate.mjs';
import {createPool} from './db-connection.mjs';
export const MOVIE_PROGRESS_MIGRATION='20261112220000_account_movie_progress';
export async function migrateMovieProgress(pool,{expectEnv='production',log=console.log}={}){
 const prerequisites=await pool.query("SELECT to_regclass('public.accounts') AS accounts,to_regclass('public.account_sessions') AS sessions,to_regclass('public.qcc_runtime_flags') AS flags");
 if(!prerequisites.rows[0]?.accounts||!prerequisites.rows[0]?.sessions||!prerequisites.rows[0]?.flags)throw new Error('Account backend prerequisites missing.');
 const directory=await mkdtemp(join(tmpdir(),'qcc-movie-progress-'));
 try{
  await copyFile(new URL(`../db/migrations/${MOVIE_PROGRESS_MIGRATION}.sql`,import.meta.url),join(directory,MOVIE_PROGRESS_MIGRATION+'.sql'));
  return await migrate(pool,{directory,expectEnv,log});
 }finally{await rm(directory,{recursive:true,force:true});}
}
async function main(){
 if(process.env.VERCEL_ENV!=='production'){console.log('Account movie progress migration skipped outside production.');return;}
 const pool=createPool();try{await migrateMovieProgress(pool);}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Account movie progress migration refused or failed. Deployment stopped; check account prerequisites, the production marker and migration history.');process.exitCode=1;});
