import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {Database} from '../leaderboard/server';
import {HttpError} from '../../server/api';
import type {MediaRef} from '../social/shared';
import {mediaKey,validMediaId,PENDING_TTL_MS,type Purpose} from './policy';

export const MEDIA_EXPIRED_MESSAGE='This photo took too long to post. Remove it and add it again.';
export interface MediaStore {
 put(key:string,bytes:Uint8Array):Promise<void>;
 get(key:string):Promise<Uint8Array|null>;
 delete(key:string):Promise<void>;
}
const KEY=/^m_[a-f0-9]{32}\/(full|thumb)$/;
export function createMemoryStore():MediaStore&{keys():string[]} {
 const objects=new Map<string,Uint8Array>();
 return {
  async put(key,bytes){objects.set(key,bytes.slice());},
  async get(key){return objects.get(key)?.slice()??null;},
  async delete(key){objects.delete(key);},
  keys:()=>[...objects.keys()].sort()
 };
}
export function createFileStore(dir:string):MediaStore {
 // Strict key validation is the only barrier against path traversal.
 const path=(key:string)=>{if(!KEY.test(key))throw new Error('Invalid media key.');return join(dir,key);};
 return {
  async put(key,bytes){const file=path(key);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);},
  async get(key){try{return new Uint8Array(await readFile(path(key)));}catch(error){if((error as {code?:string}).code==='ENOENT')return null;throw error;}},
  async delete(key){await rm(path(key),{force:true});}
 };
}
type Query=Database['query'];
/** Blob deletes run this many media ids at a time. */
export const BLOB_DELETE_CONCURRENCY=8;
/** Rows handled per purge batch, small enough to finish well inside a serverless time limit. */
export const PURGE_BATCH_SIZE=50;
const expired=(deadline?:number)=>deadline!==undefined&&Date.now()>=deadline;
async function deleteBlobs(store:MediaStore,id:string):Promise<boolean> {
 try{for(const variant of ['full','thumb'] as const)await store.delete(mediaKey(id,variant));return true;}catch{return false;}
}
/** Deletes blobs of the given ids with bounded parallelism. Returns the ids whose blobs are gone; failed or not-attempted ids (store missing, deadline passed) are left out so the caller keeps their rows. */
export async function deleteBlobsFor(store:MediaStore|null,ids:string[],deadline?:number):Promise<string[]> {
 if(!store)return [];
 const done:string[]=[];
 for(let i=0;i<ids.length&&!expired(deadline);i+=BLOB_DELETE_CONCURRENCY){
  const chunk=ids.slice(i,i+BLOB_DELETE_CONCURRENCY);
  const results=await Promise.all(chunk.map(id=>deleteBlobs(store,id)));
  results.forEach((deleted,index)=>{if(deleted)done.push(chunk[index]!);});
 }
 return done;
}
/** Blob first, then the row: a failed blob delete (or a missing store) keeps the row so a later sweep retries. Never throws; returns the ids whose rows were removed. */
export async function deleteMediaObjects(query:Query,store:MediaStore|null,ids:string[],deadline?:number):Promise<string[]> {
 const done=await deleteBlobsFor(store,ids,deadline);
 if(done.length)try{await query('DELETE FROM media_objects WHERE id=ANY($1::text[])',[done]);}catch{return [];}
 return done;
}
/** All-or-nothing in one statement: nothing is attached unless every id is a distinct pending row of this owner and purpose. */
export async function attachMedia(query:Query,ownerId:string,ids:string[],purpose:Purpose):Promise<MediaRef[]> {
 if(!ids.length)return [];
 if(new Set(ids).size!==ids.length||!ids.every(validMediaId))throw new HttpError(400,'invalid_media','Invalid media.');
 const result=await query(`WITH picked AS (
   SELECT id FROM media_objects WHERE id=ANY($1::text[]) AND owner_id=$2 AND purpose=$3 AND state='pending' AND created_at>now()-($4*interval '1 millisecond') FOR UPDATE
  ), attached AS (
   UPDATE media_objects SET state='attached'
   WHERE id IN (SELECT id FROM picked) AND (SELECT count(*) FROM picked)=cardinality($1::text[])
   RETURNING id,width,height,thumb_bytes>0 AS thumb
  ) SELECT id,width,height,thumb FROM attached`,[ids,ownerId,purpose,PENDING_TTL_MS]);
 const byId=new Map(result.rows.map(row=>[row.id as string,row]));
 if(byId.size!==ids.length){
  const stale=await query(`SELECT 1 FROM media_objects WHERE id=ANY($1::text[]) AND owner_id=$2 AND purpose=$3 AND state='pending' AND created_at<=now()-($4*interval '1 millisecond') LIMIT 1`,[ids,ownerId,purpose,PENDING_TTL_MS]);
  if(stale.rows.length)throw new HttpError(400,'media_expired',MEDIA_EXPIRED_MESSAGE);
  throw new HttpError(400,'invalid_media','Invalid media.');
 }
 return ids.map(id=>{const row=byId.get(id)!;return {id,width:Number(row.width),height:Number(row.height),thumb:!!row.thumb};});
}
/** Purge waits this long past the attach TTL so an attach that began at the edge cannot lose its blob. */
const PENDING_PURGE_MARGIN_MS=5*60*1000;
/** Removes blobs of stale pending rows, then the rows (guarded on state so a racing attach wins; attachMedia also refuses stale rows). No-op without a store (the rows keep pointing at blobs). Stops cleanly at `deadline` (epoch ms). */
export async function purgePendingMedia(query:Query,store:MediaStore|null,deadline?:number):Promise<void> {
 if(!store)return;
 while(!expired(deadline)){
  const found=await query(`SELECT id FROM media_objects WHERE state='pending' AND created_at<now()-(($1::bigint+$2::bigint)*interval '1 millisecond') ORDER BY created_at LIMIT ${PURGE_BATCH_SIZE}`,[PENDING_TTL_MS,PENDING_PURGE_MARGIN_MS]);
  const done=await deleteBlobsFor(store,found.rows.map(row=>row.id as string),deadline);
  if(done.length)await query(`DELETE FROM media_objects WHERE id=ANY($1::text[]) AND state='pending'`,[done]);
  // Stop when a batch was short or made no progress (a failing store would otherwise loop forever).
  if(found.rows.length<PURGE_BATCH_SIZE||done.length===0)return;
 }
}
/** Hourly job only (never per request: it scans all attached media). Reaps 'attached' media older than an hour that nothing references (failed cleanups, deleted accounts' counterparts). Blobs first, then rows. One batch per call; returns the rows removed. No-op without a store. */
export async function sweepOrphanMedia(query:Query,store:MediaStore|null,limit=PURGE_BATCH_SIZE,deadline?:number):Promise<number> {
 if(!store||expired(deadline))return 0;
 const found=await query(`SELECT m.id FROM media_objects m WHERE m.state='attached' AND m.created_at<now()-interval '1 hour'
   AND NOT EXISTS(SELECT 1 FROM social_post_media pm WHERE pm.media_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM social_profiles sp WHERE sp.avatar_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM social_profiles sp WHERE sp.banner_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.media_id=m.id)
   ORDER BY m.created_at LIMIT $1`,[limit]);
 const done=await deleteBlobsFor(store,found.rows.map(row=>row.id as string),deadline);
 if(!done.length)return 0;
 const removed=await query(`DELETE FROM media_objects m WHERE m.id=ANY($1::text[]) AND m.state='attached'
   AND NOT EXISTS(SELECT 1 FROM social_post_media pm WHERE pm.media_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM social_profiles sp WHERE sp.avatar_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM social_profiles sp WHERE sp.banner_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM chat_messages cm WHERE cm.media_id=m.id) RETURNING m.id`,[done]);
 return removed.rows.length;
}
