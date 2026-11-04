import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Pool} from 'pg';
import sharp from 'sharp';
import {createMediaHandler} from '../../src/media/server';
import {createMemoryStore} from '../../src/media/store';
import type {Database} from '../../src/leaderboard/server';
const local=new LocalDB();let pool:Pool;
const query=(text:string,values?:unknown[])=>pool.query(text,values);
const db:Database={query:(text,values)=>pool.query(text,values) as any,connect:()=>pool.connect() as any};
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('db/migrations');pool=createLocalPool(connectionString);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
async function account(name:string){
 const id=randomUUID(),player=randomBytes(32).toString('hex'),token='acct_'+randomBytes(32).toString('hex');
 await query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,name]);
 await query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,name,'scrypt$test',player]);
 await query(`INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '1 day')`,[createHash('sha256').update(token).digest('hex'),id]);
 return {id,token};
}
const URL_='https://qcc.test/.netlify/functions/media';
const png=async()=>new Uint8Array(await sharp({create:{width:200,height:150,channels:3,background:'#2468ac'}}).png().toBuffer());
const gif=async()=>new Uint8Array(await sharp({create:{width:50,height:50,channels:3,background:'#ac6824'}}).gif().toBuffer());
function upload(token:string|null,body:Uint8Array|string,purpose='post',type='image/png',extra:Record<string,string>={}){
 return new Request(`${URL_}?action=upload&purpose=${purpose}`,{method:'POST',body:body as BodyInit,headers:{'content-type':type,...(token?{authorization:'Bearer '+token}:{}),...extra}});
}
const get=(id:string,token:string|null,v='full')=>new Request(`${URL_}?action=get&id=${id}&v=${v}`,{headers:token?{authorization:'Bearer '+token}:{}});
describe('media handler',()=>{
 it('uploads, stores full and thumb blobs and records a pending row',async()=>{
  const {id:owner,token}=await account('mu_ok'),store=createMemoryStore(),handler=createMediaHandler(db,store);
  const response=await handler(upload(token,await png()));
  expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('no-store');
  const body=await response.json();
  expect(body).toMatchObject({width:200,height:150,thumb:true});expect(body.id).toMatch(/^m_[a-f0-9]{32}$/);
  expect(store.keys()).toEqual([body.id+'/full',body.id+'/thumb']);
  const row=(await query('SELECT * FROM media_objects WHERE id=$1',[body.id])).rows[0];
  expect(row).toMatchObject({owner_id:owner,purpose:'post',state:'pending',width:200,height:150});
  expect(row.bytes).toBe(body.bytes);expect(row.thumb_bytes).toBeGreaterThan(0);
 });
 it('strips EXIF and GPS from a small upload sent unchanged by the browser',async()=>{
  const {token}=await account('mu_exif'),store=createMemoryStore(),handler=createMediaHandler(db,store);
  const noisy=sharp(randomBytes(800*600*3),{raw:{width:800,height:600,channels:3}}).blur(2).jpeg({quality:90}).withMetadata({orientation:6,exif:{IFD0:{Make:'TestCam'},IFD3:{GPSLatitudeRef:'S',GPSLatitude:'41/1 17/1 0/1'}}});
  const jpeg=new Uint8Array(await noisy.toBuffer());
  expect((await sharp(jpeg).metadata()).exif).toBeDefined();
  const response=await handler(upload(token,jpeg,'post','image/jpeg'));expect(response.status).toBe(201);
  const body=await response.json();
  const meta=await sharp((await store.get(body.id+'/full'))!).metadata();
  expect(meta.format).toBe('webp');expect(meta.exif).toBeUndefined();
  expect([meta.width,meta.height]).toEqual([600,800]);expect([body.width,body.height]).toEqual([600,800]);
 });
 it('sniffs content, not the declared type',async()=>{
  const {token}=await account('mu_sniff'),handler=createMediaHandler(db,createMemoryStore());
  expect((await handler(upload(token,await gif(),'post','image/png'))).status).toBe(201);
  expect((await handler(upload(token,await png(),'post','application/octet-stream'))).status).toBe(201);
 });
 it('rejects svg, bad content types, bad purposes, oversize bodies',async()=>{
  const {token}=await account('mu_bad'),handler=createMediaHandler(db,createMemoryStore());
  const svg='<svg xmlns="http://www.w3.org/2000/svg"/>';
  const r=await handler(upload(token,svg,'post','image/svg+xml'));expect(r.status).toBe(415);
  expect((await handler(upload(token,svg,'post','image/png'))).status).toBe(415);
  expect((await handler(upload(token,await png(),'post','text/html'))).status).toBe(415);
  expect((await handler(upload(token,await png(),'nope'))).status).toBe(400);
  const big=await handler(upload(token,new Uint8Array(4194305),'post','image/png'));
  expect(big.status).toBe(413);expect((await big.json()).error).toBe('too_large');
  const corrupt=await handler(upload(token,new Uint8Array(64).fill(7).map((v,i)=>i<8?[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][i]!:v),'post'));
  expect(corrupt.status).toBe(422);expect(await corrupt.json()).toEqual({error:'corrupt',message:"That photo couldn't be read."});
 });
 it('requires a token, the same origin, and a configured store',async()=>{
  const {token}=await account('mu_auth'),handler=createMediaHandler(db,createMemoryStore());
  expect((await handler(upload(null,await png()))).status).toBe(401);
  expect((await handler(upload(token,await png(),'post','image/png',{origin:'https://evil.test'}))).status).toBe(403);
  const none=await createMediaHandler(db,null)(upload(token,await png()));
  expect(none.status).toBe(503);expect(await none.json()).toMatchObject({error:'media_not_configured'});
  expect((await createMediaHandler(db,null)(get('m_'+'a'.repeat(32),null))).status).toBe(503);
 });
 it('limits uploads to 60 a day',async()=>{
  const {id,token}=await account('mu_rate'),handler=createMediaHandler(db,createMemoryStore());
  await query('INSERT INTO account_attempts(subject,attempts) VALUES ($1,60)',['media:upload:'+id]);
  const response=await handler(upload(token,await png()));
  expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBeTruthy();
 });
 it('enforces the per-account and global quotas',async()=>{
  const {id,token}=await account('mu_quota'),store=createMemoryStore(),handler=createMediaHandler(db,store,{maxTotalBytes:1});
  await query(`INSERT INTO media_objects(id,owner_id,purpose,state,bytes,thumb_bytes,width,height) VALUES ($1,$2,'post','attached',10,0,1,1)`,['m_'+randomBytes(16).toString('hex'),id]);
  const full=await handler(upload(token,await png()));
  expect(full.status).toBe(507);expect(await full.json()).toMatchObject({error:'storage_full'});expect(store.keys()).toEqual([]);
  for(let i=0;i<100;i++)await query(`INSERT INTO media_objects(id,owner_id,purpose,state,bytes,thumb_bytes,width,height) VALUES ($1,$2,'post','attached',1048576,0,10,10)`,['m_'+randomBytes(16).toString('hex'),id]);
  const over=await createMediaHandler(db,store)(upload(token,await png()));
  expect(over.status).toBe(413);expect(await over.json()).toMatchObject({error:'quota_exceeded'});
 },60000);
 it('deletes blobs when the row insert fails',async()=>{
  const {token}=await account('mu_fail'),store=createMemoryStore();
  const failing:Database={connect:db.connect,query:(text,values)=>text.startsWith('INSERT INTO media_objects')?Promise.reject(new Error('boom')):db.query(text,values)};
  const response=await createMediaHandler(failing,store)(upload(token,await png()));
  expect(response.status).toBe(503);expect(store.keys()).toEqual([]);
 });
 it('purges stale pending uploads on upload',async()=>{
  const {id,token}=await account('mu_purge'),store=createMemoryStore(),old='m_'+randomBytes(16).toString('hex');
  await query(`INSERT INTO media_objects(id,owner_id,purpose,bytes,width,height,created_at) VALUES ($1,$2,'post',10,1,1,now()-interval '2 hours')`,[old,id]);
  await store.put(old+'/full',new Uint8Array([1]));
  await createMediaHandler(db,store)(upload(token,await png()));
  expect((await query('SELECT 1 FROM media_objects WHERE id=$1',[old])).rows).toHaveLength(0);
  expect(store.keys().some(k=>k.startsWith(old))).toBe(false);
 });
 describe('GET',()=>{
  async function put(token:string,purpose='post'){
   const store=createMemoryStore();const handler=createMediaHandler(db,store);
   const body=await (await handler(upload(token,await png(),purpose))).json();return {store,handler,id:body.id as string};
  }
  it('never serves snaps, not even to the owner',async()=>{
   const {token}=await account('mg_snap'),{handler,id}=await put(token,'snap');
   expect((await handler(get(id,token))).status).toBe(404);expect((await handler(get(id,null))).status).toBe(404);
  });
  it('serves pending media to its owner only, privately',async()=>{
   const {token}=await account('mg_own'),stranger=await account('mg_str'),{handler,id}=await put(token);
   expect((await handler(get(id,null))).status).toBe(404);
   expect((await handler(get(id,stranger.token))).status).toBe(404);
   const ok=await handler(get(id,token));
   expect(ok.status).toBe(200);expect(ok.headers.get('content-type')).toBe('image/webp');
   expect(ok.headers.get('cache-control')).toBe('private, no-store');expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
   expect((await sharp(new Uint8Array(await ok.arrayBuffer())).metadata()).format).toBe('webp');
  });
  it('serves post media only while the post is visible, with public caching',async()=>{
   const author=await account('mg_post'),{handler,id}=await put(author.token),post=randomUUID();
   await query('INSERT INTO social_posts(id,author_id) VALUES ($1,$2)',[post,author.id]);
   await query('INSERT INTO social_post_media(post_id,position,media_id) VALUES ($1,0,$2)',[post,id]);
   await query("UPDATE media_objects SET state='attached' WHERE id=$1",[id]);
   const ok=await handler(get(id,null));
   expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('public, max-age=600');
   expect((await handler(get(id,null,'thumb'))).status).toBe(200);
   await query('UPDATE social_posts SET hidden=true WHERE id=$1',[post]);
   expect((await handler(get(id,null))).status).toBe(404);
   const mine=await handler(get(id,author.token));expect(mine.status).toBe(200);expect(mine.headers.get('cache-control')).toBe('private, no-store');
   expect((await handler(get(id,(await account('mg_other')).token))).status).toBe(404);
   await query('UPDATE social_posts SET hidden=false,deleted=true WHERE id=$1',[post]);
   expect((await handler(get(id,null))).status).toBe(404);expect((await handler(get(id,author.token))).status).toBe(404);
  });
  it('serves avatars and banners only when set on a profile; thumb 404 when absent',async()=>{
   const a=await account('mg_prof'),{handler,id}=await put(a.token,'avatar'),ban=await put(a.token,'banner');
   await query("UPDATE media_objects SET state='attached' WHERE id=ANY($1)",[[id,ban.id]]);
   expect((await handler(get(id,null))).status).toBe(404);
   await query('INSERT INTO social_profiles(account_id,avatar_id,banner_id) VALUES ($1,$2,$3)',[a.id,id,ban.id]);
   expect((await handler(get(id,null))).status).toBe(200);expect((await ban.handler(get(ban.id,null))).status).toBe(200);
   await query('UPDATE social_profiles SET avatar_id=NULL WHERE account_id=$1',[a.id]);
   expect((await handler(get(id,null))).status).toBe(404);
   await query('UPDATE media_objects SET thumb_bytes=0 WHERE id=$1',[ban.id]);
   expect((await ban.handler(get(ban.id,null,'thumb'))).status).toBe(404);
  });
  it('404s malformed ids and unknown variants',async()=>{
   const handler=createMediaHandler(db,createMemoryStore());
   expect((await handler(get('../x',null))).status).toBe(404);
   expect((await handler(get('m_'+'a'.repeat(32),null))).status).toBe(404);
   expect((await handler(get('m_'+'a'.repeat(32),null,'huge'))).status).toBe(400);
  });
 });
});
