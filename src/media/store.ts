import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {Database} from '../leaderboard/server';
import {HttpError} from '../../server/api';
import type {MediaRef} from '../social/shared';
import {mediaKey,PENDING_TTL_MS,type Purpose} from './policy';

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
/** Deletes the objects first so a failed delete leaves the row for a later purge, then the rows. */
export async function deleteMediaObjects(query:Query,store:MediaStore|null,ids:string[]):Promise<void> {
 if(!ids.length)return;
 if(store)for(const id of ids)for(const variant of ['full','thumb'] as const)await store.delete(mediaKey(id,variant));
 await query('DELETE FROM media_objects WHERE id=ANY($1::text[])',[ids]);
}
export async function attachMedia(query:Query,ownerId:string,ids:string[],purpose:Purpose):Promise<MediaRef[]> {
 if(!ids.length)return [];
 const result=await query(`UPDATE media_objects SET state='attached'
  WHERE id=ANY($1::text[]) AND owner_id=$2 AND purpose=$3 AND state='pending'
  RETURNING id,width,height,thumb_bytes>0 AS thumb`,[ids,ownerId,purpose]);
 const byId=new Map(result.rows.map(row=>[row.id as string,row]));
 if(new Set(ids).size!==ids.length||byId.size!==ids.length)throw new HttpError(400,'invalid_media','Invalid media.');
 return ids.map(id=>{const row=byId.get(id)!;return {id,width:Number(row.width),height:Number(row.height),thumb:!!row.thumb};});
}
export async function purgePendingMedia(query:Query,store:MediaStore|null):Promise<void> {
 for(;;){
  const result=await query(`SELECT id FROM media_objects WHERE state='pending' AND created_at<now()-($1*interval '1 millisecond') ORDER BY created_at LIMIT 100`,[PENDING_TTL_MS]);
  const ids=result.rows.map(row=>row.id as string);
  if(!ids.length)return;
  await deleteMediaObjects(query,store,ids);
  if(ids.length<100)return;
 }
}
