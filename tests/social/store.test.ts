import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createFileStore,createMemoryStore,attachMedia,deleteMediaObjects,purgePendingMedia} from '../../src/media/store';
import {setBlock,isBlockedEitherWay,accountByUsername} from '../../src/social/blocks';
import {HttpError,readJson} from '../../server/api';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
const query=(text:string,values?:unknown[])=>pool.query(text,values);
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
async function account(name:string){
 const id=randomUUID(),player=randomBytes(32).toString('hex');
 await query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,name]);
 await query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,name,'scrypt$test',player]);return id;
}
const mid=()=>'m_'+randomBytes(16).toString('hex');
async function media(owner:string,purpose='post',state='pending',age='0 seconds'){
 const id=mid();
 await query(`INSERT INTO media_objects(id,owner_id,purpose,state,bytes,thumb_bytes,width,height,created_at) VALUES ($1,$2,$3,$4,1000,100,640,480,now()-$5::interval)`,[id,owner,purpose,state,age]);return id;
}
const states=async(ids:string[])=>Object.fromEntries((await query('SELECT id,state FROM media_objects WHERE id=ANY($1)',[ids])).rows.map((r:any)=>[r.id,r.state]));
describe('media stores',()=>{
 it('round-trips and deletes in memory',async()=>{
  const id=mid(),store=createMemoryStore();await store.put(id+'/full',new Uint8Array([1,2]));
  expect([...(await store.get(id+'/full'))!]).toEqual([1,2]);expect(store.keys()).toEqual([id+'/full']);
  await store.delete(id+'/full');expect(await store.get(id+'/full')).toBeNull();
 });
 it('file store rejects traversal keys and returns null when absent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'media-')),id=mid();
  try{
   const store=createFileStore(dir);
   for(const key of ['../x',id+'/../../x',id+'/other','/etc/passwd'])await expect(store.put(key,new Uint8Array([1]))).rejects.toThrow('Invalid media key');
   await store.put(id+'/thumb',new Uint8Array([9]));expect([...(await store.get(id+'/thumb'))!]).toEqual([9]);
   expect(await store.get(id+'/full')).toBeNull();await store.delete(id+'/thumb');expect(await store.get(id+'/thumb')).toBeNull();
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
describe('attachMedia with real Postgres',()=>{
 it('attaches in input order and reports dimensions and thumb',async()=>{
  const o=await account('att_ok'),a=await media(o),b=await media(o);
  const refs=await attachMedia(query,o,[b,a],'post');
  expect(refs).toEqual([{id:b,width:640,height:480,thumb:true},{id:a,width:640,height:480,thumb:true}]);
  expect(await states([a,b])).toEqual({[a]:'attached',[b]:'attached'});
 });
 it('changes nothing for another owner, wrong purpose, already attached, duplicates or bad ids',async()=>{
  const o=await account('att_own'),other=await account('att_other'),good=await media(o);
  const foreign=await media(other),avatar=await media(o,'avatar'),done=await media(o,'post','attached');
  for(const ids of [[good,foreign],[good,avatar],[good,done],[good,good],[good,'../x'],[good,mid()]])
   await expect(attachMedia(query,o,ids,'post')).rejects.toMatchObject({status:400,code:'invalid_media'});
  expect(await states([good,foreign,avatar,done])).toEqual({[good]:'pending',[foreign]:'pending',[avatar]:'pending',[done]:'attached'});
  await expect(attachMedia(query,o,[good,foreign],'post')).rejects.toBeInstanceOf(HttpError);
 });
});
describe('purge and delete with real Postgres',()=>{
 it('purges old pending rows with blobs and keeps attached and fresh ones',async()=>{
  const o=await account('purge_o'),old=await media(o,'post','pending','2 hours'),fresh=await media(o),kept=await media(o,'post','attached','2 hours');
  const store=createMemoryStore();for(const id of [old,fresh,kept])for(const v of ['full','thumb'])await store.put(`${id}/${v}`,new Uint8Array([1]));
  await purgePendingMedia(query,store);
  expect(await states([old,fresh,kept])).toEqual({[fresh]:'pending',[kept]:'attached'});
  expect(store.keys()).toEqual([`${fresh}/full`,`${fresh}/thumb`,`${kept}/full`,`${kept}/thumb`].sort());
 });
 it('deleteMediaObjects removes rows and both variants',async()=>{
  const o=await account('del_o'),id=await media(o),store=createMemoryStore();
  await store.put(id+'/full',new Uint8Array([1]));await store.put(id+'/thumb',new Uint8Array([1]));
  await deleteMediaObjects(query,store,[id]);expect(store.keys()).toEqual([]);expect(await states([id])).toEqual({});
 });
});
describe('blocks with real Postgres',()=>{
 const count=async(table:string)=>Number((await query(`SELECT count(*) FROM ${table}`)).rows[0].count);
 it('block severs follows and contacts both ways; unblock removes only the block',async()=>{
  const a=await account('blk_a'),b=await account('blk_b'),c=await account('blk_c');
  await query('INSERT INTO social_follows(follower_id,followee_id) VALUES ($1,$2),($2,$1),($1,$3)',[a,b,c]);
  await query('INSERT INTO chat_contacts(owner_id,contact_id) VALUES ($1,$2),($2,$1),($1,$3)',[a,b,c]);
  await setBlock(query,b,a,true);await setBlock(query,b,a,true);
  expect(await isBlockedEitherWay(query,a,b)).toBe(true);expect(await isBlockedEitherWay(query,b,a)).toBe(true);expect(await isBlockedEitherWay(query,a,c)).toBe(false);
  expect((await query('SELECT follower_id FROM social_follows WHERE follower_id=ANY($1) AND followee_id=ANY($1)',[[a,b]])).rows).toEqual([]);
  expect((await query('SELECT owner_id FROM chat_contacts WHERE owner_id=ANY($1) AND contact_id=ANY($1)',[[a,b]])).rows).toEqual([]);
  expect((await query('SELECT 1 FROM social_follows WHERE follower_id=$1 AND followee_id=$2',[a,c])).rows.length).toBe(1);
  expect((await query('SELECT 1 FROM chat_contacts WHERE owner_id=$1 AND contact_id=$2',[a,c])).rows.length).toBe(1);
  await query('INSERT INTO social_follows(follower_id,followee_id) VALUES ($1,$2)',[c,b]);
  await setBlock(query,b,a,false);
  expect(await isBlockedEitherWay(query,a,b)).toBe(false);expect((await query('SELECT 1 FROM social_follows WHERE follower_id=$1',[c])).rows.length).toBe(1);
  expect(await count('social_blocks')).toBe(0);
 });
 it('finds accounts case-insensitively',async()=>{
  const id=await account('CaseUser');
  expect(await accountByUsername(query,'caseUSER')).toEqual({id,username:'CaseUser'});expect(await accountByUsername(query,'nobody_here')).toBeNull();
 });
});
describe('readJson',()=>{
 const post=(body:BodyInit,headers:Record<string,string>={})=>new Request('https://x.test/',{method:'POST',body,headers});
 it('parses valid JSON',async()=>{expect(await readJson(post('{"a":1}'),100)).toEqual({a:1});});
 it('rejects a streamed body over the limit with 413',async()=>{
  const chunk=new TextEncoder().encode('x'.repeat(60));
  const body=new ReadableStream({start(c){c.enqueue(chunk);c.enqueue(chunk);c.close();}});
  const request=new Request('https://x.test/',{method:'POST',body,duplex:'half'} as RequestInit);
  await expect(readJson(request,100)).rejects.toMatchObject({status:413});
 });
 it('rejects a declared oversize body with 413 and bad JSON with 400',async()=>{
  await expect(readJson(post('{}',{'content-length':'500'}),100)).rejects.toMatchObject({status:413});
  await expect(readJson(post('{nope'),100)).rejects.toMatchObject({status:400,code:'invalid_json'});
 });
});
