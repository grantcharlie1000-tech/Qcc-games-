import {getDatabase} from '@netlify/database';
import {boundDatabase,assertEnvironment} from '../lib/runtime.mts';
import type {Config} from '@netlify/functions';
import {runGrantJob} from '../../src/predictions/server';
// Hourly: issue any missing weekly Predictions allowances (Monday 00:00 Pacific/Auckland weeks). The same idempotent
// operation runs lazily on wallet reads and trades, so a missed or doubled run can neither skip nor repeat a grant.
// runGrantJob does nothing while the feature is disabled, not launched, or writes are frozen. Logs counts only.
export default async ()=>{
 try{
  const pool=getDatabase().pool,db=boundDatabase(pool);
  try{await assertEnvironment(pool,{allowMissingMarker:false});}
  catch{console.warn('QCC predictions grants skipped: environment check failed.');return new Response(null,{status:200});}
  const result=await runGrantJob(db);
  console.log(`QCC predictions grants: ${result.grants} issued across ${result.accounts} accounts, ${result.failed} failed.`);
  return new Response(null,{status:200});
 }catch{console.error('QCC predictions grants failed.');return new Response(null,{status:200});}
};
export const config:Config={schedule:'@hourly'};
