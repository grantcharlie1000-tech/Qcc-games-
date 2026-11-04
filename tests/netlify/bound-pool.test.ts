import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import type {Database} from '../../src/leaderboard/server';
import {createSocialHandler} from '../../src/social/server';
import {createChatHandler,purgeExpiredChat} from '../../src/chat/server';
import {createMediaHandler} from '../../src/media/server';
import {createMemoryStore,purgePendingMedia,sweepOrphanMedia} from '../../src/media/store';
import {createGuardedHandler,boundDatabase} from '../../netlify/lib/runtime.mts';
// A real pg.Pool: `query` is a class method that needs `this`, so unbound calls like rateLimit(db.query,...) throw.
const local=new NetlifyDB({logger:()=>{}});let real:ReturnType<typeof getDatabase>['pool'];
class StrictPool {
 async query(text:string,values?:unknown[]){if(this!==strict)throw new TypeError('unbound query');return real.query(text,values);}
 async connect(){if(this!==strict)throw new TypeError('unbound connect');return real.connect();}
}
const strict=new StrictPool() as unknown as Database;
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');real=getDatabase({connectionString}).pool;},30000);
afterAll(async()=>{await real?.end();await local.stop();});
async function account(){
 const name='bp_'+randomBytes(4).toString('hex'),id=randomUUID(),player=randomBytes(32).toString('hex'),token='acct_'+randomBytes(32).toString('hex');
 await real.query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,name]);
 await real.query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,name,'scrypt$test',player]);
 await real.query(`INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '1 day')`,[createHash('sha256').update(token).digest('hex'),id]);
 return {id,token,name};
}
const opts={allowMissingMarker:true,context:'dev',log:()=>{}};
const json=(token:string,url:string,body:unknown)=>new Request(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
describe('guarded handlers with a strict pg.Pool-like database',()=>{
 it('social post reaches rateLimit',async()=>{
  const a=await account(),handle=createGuardedHandler(strict,db=>createSocialHandler(db,null),opts);
  expect((await handle(json(a.token,'https://qcc.test/social?action=post',{body:'hello'}))).status).toBe(201);
 });
 it('chat request reaches accountByUsername and rateLimit',async()=>{
  const a=await account(),b=await account(),handle=createGuardedHandler(strict,db=>createChatHandler(db,null),opts);
  const r=await handle(json(a.token,'https://qcc.test/chat?action=request',{username:b.name}));
  expect(r.status).toBe(200);expect(await r.json()).toEqual({status:'sent'});
 });
 it('media upload reaches rateLimit (bad image is a 4xx, never 503)',async()=>{
  const a=await account(),handle=createGuardedHandler(strict,db=>createMediaHandler(db,createMemoryStore()),opts);
  const r=await handle(new Request('https://qcc.test/media?action=upload&purpose=post',{method:'POST',headers:{'content-type':'image/png',authorization:'Bearer '+a.token},body:new Uint8Array([1,2,3])}));
  expect(r.status).toBeGreaterThanOrEqual(400);expect(r.status).toBeLessThan(500);
 });
 it('chat purge helpers work through boundDatabase(strict).query',async()=>{
  const {query}=boundDatabase(strict);
  await expect(purgeExpiredChat(query,null)).resolves.toBe(0);
  await expect(purgePendingMedia(query,null)).resolves.toBeUndefined();
  await expect(sweepOrphanMedia(query,null,100)).resolves.toBeTypeOf('number');
 });
});
