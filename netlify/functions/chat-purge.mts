import {getDatabase} from '@netlify/database';
import {netlifyMediaStore} from '../lib/media-store.mts';
import type {Config} from '@netlify/functions';
import {purgeExpiredChat} from '../../src/chat/server';
import {purgePendingMedia} from '../../src/media/store';
const BATCH=500,MAX_ITERATIONS=20;
// Hourly: delete expired chat messages (and their snap media) and stale pending uploads. Logs counts only.
export default async ()=>{
 try{
  const pool=getDatabase().pool,query=pool.query.bind(pool),store=await netlifyMediaStore();
  let deleted=0,runs=0;
  for(;runs<MAX_ITERATIONS;){
   const count=await purgeExpiredChat(query,store);runs++;deleted+=count;
   if(count<BATCH)break;
  }
  await purgePendingMedia(query,store);
  console.log(`QCC chat purge: ${deleted} expired messages deleted in ${runs} run(s).`);
  return new Response(null,{status:200});
 }catch{console.error('QCC chat purge failed.');return new Response(null,{status:200});}
};
export const config:Config={schedule:'@hourly'};
