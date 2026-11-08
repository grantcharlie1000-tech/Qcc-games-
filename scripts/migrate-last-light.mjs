// Targeted, idempotent release migration. Never runs the backend's unrelated pending migrations.
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {migrate} from './db-migrate.mjs';
import {createPool} from './db-connection.mjs';
export const LAST_LIGHT_MIGRATION='20261108223000_last_light_score';
export async function migrateLastLight(pool,{expectEnv='production',log=console.log}={}){
 const directory=await mkdtemp(join(tmpdir(),'qcc-last-light-'));
 try{
  await copyFile(new URL(`../db/migrations/${LAST_LIGHT_MIGRATION}.sql`,import.meta.url),join(directory,LAST_LIGHT_MIGRATION+'.sql'));
  return await migrate(pool,{directory,expectEnv,log});
 }finally{await rm(directory,{recursive:true,force:true});}
}
async function main(){
 if(process.env.VERCEL_ENV!=='production'){console.log('Last Light production migration skipped outside production.');return;}
 const pool=createPool();try{await migrateLastLight(pool);}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Last Light migration refused or failed. Deployment stopped; check the production environment marker and migration history.');process.exitCode=1;});
