import {getPool} from '../lib/db.mts';
import {boundDatabase} from '../lib/runtime.mts';
import {netlifyMediaStore} from '../lib/media-store.mts';
import type {Config} from '@netlify/functions';
import {purgeExpiredChat} from '../../src/chat/server';
import {purgePendingMedia,sweepOrphanMedia} from '../../src/media/store';
const BATCH=500,MAX_ITERATIONS=20;
// Hourly: delete expired chat messages (and their snap media) and stale pending uploads. Logs counts only.
export default async ()=>{
 try{
  const query=boundDatabase(getPool()).query,store=await netlifyMediaStore();
  let deleted=0,runs=0;
  for(;runs<MAX_ITERATIONS;){
   const count=await purgeExpiredChat(query,store);runs++;deleted+=count;
   if(count<BATCH)break;
  }
  await purgePendingMedia(query,store);
  let orphans=0;
  for(let i=0;i<MAX_ITERATIONS;i++){const n=await sweepOrphanMedia(query,store,100);orphans+=n;if(n<100)break;}
  console.log(`QCC chat purge: ${deleted} expired messages deleted in ${runs} run(s), ${orphans} orphaned media removed.`);
  return new Response(null,{status:200});
 }catch{console.error('QCC chat purge failed.');return new Response(null,{status:200});}
};
export const config:Config={schedule:'@hourly'};
