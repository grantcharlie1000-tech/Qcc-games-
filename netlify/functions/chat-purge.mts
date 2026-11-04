import {getPool} from '../lib/db.mts';
import {boundDatabase,assertEnvironment,isWriteFrozen} from '../lib/runtime.mts';
import {netlifyMediaStore} from '../lib/media-store.mts';
import type {Config} from '@netlify/functions';
import {purgeExpiredChat} from '../../src/chat/server';
import {purgePendingMedia,sweepOrphanMedia,PURGE_BATCH_SIZE} from '../../src/media/store';
/** Time budget for one run; scheduled functions are time-limited too. */
export const PURGE_BUDGET_MS=7000;
// Hourly: delete expired chat messages (and their snap media) and stale pending uploads. Logs counts only.
export default async ()=>{
 const deadline=Date.now()+PURGE_BUDGET_MS;
 try{
  const pool=getPool(),db=boundDatabase(pool);
  try{await assertEnvironment(pool,{allowMissingMarker:false});}
  catch{console.warn('QCC chat purge skipped: environment check failed.');return new Response(null,{status:200});}
  if(await isWriteFrozen(db,process.env,Date.now())){console.warn('QCC chat purge skipped: writes are frozen.');return new Response(null,{status:200});}
  const store=await netlifyMediaStore();
  const deleted=await purgeExpiredChat(db.query,store,deadline);
  await purgePendingMedia(db.query,store,deadline);
  let orphans=0;
  for(;Date.now()<deadline;){const n=await sweepOrphanMedia(db.query,store,PURGE_BATCH_SIZE,deadline);orphans+=n;if(n<PURGE_BATCH_SIZE)break;}
  console.log(`QCC chat purge: ${deleted} expired messages deleted, ${orphans} orphaned media removed.`);
  return new Response(null,{status:200});
 }catch{console.error('QCC chat purge failed.');return new Response(null,{status:200});}
};
export const config:Config={schedule:'@hourly'};
