import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createApp,originAllowed,routeOf,deployContext,RATE_LIMITS} from '../../server/app';
import type {Database} from '../../src/leaderboard/server';
import {createMemoryStore} from '../../src/media/store';
import {apiUrl,apiBase} from '../../src/core/api';

const local=new LocalDB();let pool:Pool;
const SITE='https://qcc-games.pages.dev',API='https://qcc-backend.example';
const env={QCC_ALLOWED_ORIGINS:`${SITE},https://*.qcc-games.pages.dev`,TMDB_READ_TOKEN:'tmdb-test'};
let app:ReturnType<typeof createApp>;
beforeAll(async()=>{const url=await local.start();await local.applyMigrations('db/migrations');pool=createLocalPool(url);
 app=createApp({env,database:()=>pool as unknown as Database,fetcher:async()=>Response.json({results:[]})});});
afterAll(async()=>{await pool?.end();await local.stop();});
const call=(path:string,init:RequestInit&{origin?:string}={})=>{const headers=new Headers(init.headers);if(init.origin)headers.set('Origin',init.origin);return app(new Request(API+path,{...init,headers}),'203.0.113.9');};

describe('host-neutral backend router',()=>{
 it('maps new and legacy paths to the same routes',()=>{
  expect(routeOf('/api/accounts')).toBe('accounts');expect(routeOf('/.netlify/functions/leaderboard')).toBe('leaderboard');
  expect(routeOf('/api/movies')).toBe('movies');expect(routeOf('/api/turn/')).toBe('turn');expect(routeOf('/api/nope')).toBeUndefined();
 });
 it('allows listed origins and one-label preview subdomains only',()=>{
  expect(originAllowed(SITE,env.QCC_ALLOWED_ORIGINS)).toBe(true);
  expect(originAllowed('https://abc123.qcc-games.pages.dev',env.QCC_ALLOWED_ORIGINS)).toBe(true);
  expect(originAllowed('https://a.b.qcc-games.pages.dev',env.QCC_ALLOWED_ORIGINS)).toBe(false);
  expect(originAllowed('https://evilqcc-games.pages.dev',env.QCC_ALLOWED_ORIGINS)).toBe(false);
  expect(originAllowed('https://evil.example',env.QCC_ALLOWED_ORIGINS)).toBe(false);
 });
 it('maps Vercel environments onto the database guard contexts',()=>{
  expect(deployContext({VERCEL_ENV:'production'})).toBe('production');expect(deployContext({VERCEL_ENV:'preview'})).toBe('deploy-preview');
  expect(deployContext({QCC_DEPLOY_CONTEXT:'production',VERCEL_ENV:'preview'})).toBe('production');expect(deployContext({})).toBeUndefined();
 });
 it('answers CORS preflight for allowed origins and refuses others',async()=>{
  const ok=await call('/api/accounts?action=signup',{method:'OPTIONS',origin:SITE});
  expect(ok.status).toBe(204);expect(ok.headers.get('access-control-allow-origin')).toBe(SITE);expect(ok.headers.get('access-control-allow-headers')).toContain('Authorization');
  expect((await call('/api/accounts?action=signup',{method:'OPTIONS',origin:'https://evil.example'})).status).toBe(403);
 });
 it('signs up cross-origin, submits a score and reads it back on the leaderboard',async()=>{
  const signup=await call('/api/accounts?action=signup',{method:'POST',origin:SITE,headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'CrossOrigin',password:'long enough password'})});
  expect(signup.status).toBe(201);expect(signup.headers.get('access-control-allow-origin')).toBe(SITE);
  const {token}=await signup.json();
  const post=await call('/api/leaderboard',{method:'POST',origin:SITE,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({game:'snake',score:42,name:'x'})});
  expect(post.status).toBe(200);
  const board=await call('/api/leaderboard?game=snake&view=public',{origin:SITE});
  expect(board.status).toBe(200);expect((await board.json()).entries[0]).toMatchObject({name:'CrossOrigin',score:42});
  expect(board.headers.get('cdn-cache-control')).toContain('s-maxage=60');expect(board.headers.get('netlify-cdn-cache-control')).toBeNull();expect(board.headers.get('netlify-cache-tag')).toBeNull();
 });
 it('keeps refusing writes from a foreign origin',async()=>{
  expect((await call('/api/accounts?action=signup',{method:'POST',origin:'https://evil.example',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(403);
 });
 it('serves the movies catalog with the server-held token and standard CDN headers',async()=>{
  const r=await call('/api/movies?rails=home',{origin:SITE});expect(r.status).toBe(200);expect(r.headers.get('netlify-cdn-cache-control')).toBeNull();
 });
 it('reports TURN as unconfigured without keys and rate-limits per client',async()=>{
  const r=await call('/api/turn',{method:'POST',origin:SITE,body:'{}'});expect(r.status).toBe(503);
  const limited=createApp({env:{},now:()=>0});let last=0;
  for(let i=0;i<21;i++)last=(await limited(new Request(API+'/api/turn',{method:'POST',body:'{}'}),'198.51.100.1')).status;
  expect(last).toBe(429);
 });
});

describe('social, chat, media and the purge cron',()=>{
 const CRON='cron-test-secret';
 const make=(extra:Record<string,string>={},mediaStore:()=>Promise<null>=async()=>null)=>createApp({env:{...env,...extra},database:()=>pool as unknown as Database,mediaStore});
 const get=(a:ReturnType<typeof createApp>,path:string,init:RequestInit={})=>a(new Request(API+path,init),'198.51.100.9');
 it('routes the new endpoints on both path styles',()=>{
  for(const name of ['social','chat','media']){expect(routeOf('/api/'+name)).toBe(name);expect(routeOf('/.netlify/functions/'+name)).toBe(name);}
  expect(routeOf('/api/chat-purge')).toBe('chat-purge');expect(RATE_LIMITS).toMatchObject({social:600,chat:600,media:1200});
 });
 it('serves social and chat through the guarded handler (auth required) and enforces the per-route limits',async()=>{
  const a=make();
  expect((await get(a,'/api/social?action=feed')).status).toBeLessThan(500);
  expect((await get(a,'/api/chat?action=conversations')).status).toBeLessThan(500);
  const limited=make();let last=0;
  for(let i=0;i<601;i++)last=(await get(limited,'/api/social?action=feed')).status;
  expect(last).toBe(429);
  expect((await get(limited,'/api/chat?action=conversations')).status).not.toBe(429);
 });
 it('keeps media disabled with 503 media_not_configured when no blob store exists',async()=>{
  const a=make();
  const r=await get(a,'/api/media?action=get&id=m_'+'a'.repeat(32));
  expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'media_not_configured'});
  const up=await get(a,'/api/media?action=upload&purpose=post',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array([1,2,3])});
  expect(up.status).toBe(503);
 });
 it('defaults to Vercel Blob, which is disabled without BLOB_READ_WRITE_TOKEN',async()=>{
  const a=createApp({env,database:()=>pool as unknown as Database});
  expect((await get(a,'/api/media?action=get&id=m_'+'a'.repeat(32))).status).toBe(503);
 });
 it('retries the lazy media store after 60 s instead of caching null forever',async()=>{
  let t=1_000_000,calls=0;const store=createMemoryStore();
  const a=createApp({env,now:()=>t,database:()=>pool as unknown as Database,mediaStore:async()=>++calls===1?null:store as never});
  const up=()=>get(a,'/api/media?action=upload&purpose=post',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array([1,2,3])});
  expect((await up()).status).toBe(503);t+=30_000;expect((await up()).status).toBe(503);expect(calls).toBe(1);
  t+=31_000;const r=await up();expect(calls).toBe(2);expect(r.status).not.toBe(503);
 });
 it('accepts a raw binary image upload with its Content-Type and stores the re-encoded WebP',async()=>{
  const {default:sharp}=await import('sharp');
  const png=await sharp({create:{width:64,height:48,channels:3,background:{r:200,g:30,b:90}}}).png().toBuffer();
  const store=createMemoryStore(),a=make({},async()=>store as never);
  const signup=await call('/api/accounts?action=signup',{method:'POST',origin:SITE,headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'BinaryUp',password:'long enough password 1'})});
  const {token}=await signup.json();
  const r=await get(a,'/api/media?action=upload&purpose=post',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},body:png});
  expect(r.status).toBe(201);
  expect(store.keys().length).toBeGreaterThan(0);
  const stored=await store.get(store.keys()[0]!);
  expect(Buffer.from(stored!.subarray(0,4)).toString('ascii')).toBe('RIFF');
 });
 it('requires the Bearer CRON_SECRET for /api/chat-purge',async()=>{
  const a=make({CRON_SECRET:CRON});
  expect((await get(a,'/api/chat-purge')).status).toBe(401);
  expect((await get(a,'/api/chat-purge',{headers:{Authorization:'Bearer wrong'}})).status).toBe(401);
  expect((await get(a,'/api/chat-purge',{headers:{Authorization:CRON}})).status).toBe(401);
  expect((await get(a,'/api/chat-purge',{method:'POST',headers:{Authorization:'Bearer '+CRON}})).status).toBe(401);
  expect((await get(make(),'/api/chat-purge',{headers:{Authorization:'Bearer undefined'}})).status).toBe(401);
 });
 it('runs the purge with the correct secret and logs counts only',async()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  try{
   const r=await get(make({CRON_SECRET:CRON}),'/api/chat-purge',{headers:{Authorization:'Bearer '+CRON}});
   expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});
   expect(log).toHaveBeenCalledOnce();expect(String(log.mock.calls[0]![0])).toMatch(/^QCC chat purge: \d+ expired messages deleted, \d+ orphaned media removed\.$/);
  }finally{log.mockRestore();}
 });
});

describe('frontend API base',()=>{
 it('keeps the old Netlify paths when no base is set',()=>{expect(apiUrl('accounts','')).toBe('/.netlify/functions/accounts');expect(apiUrl('movies','')).toBe('/api/movies');});
 it('uses the configured backend origin',()=>{expect(apiUrl('turn',apiBase('https://qcc-backend.vercel.app/'))).toBe('https://qcc-backend.vercel.app/api/turn');expect(apiBase('javascript:alert(1)')).toBe('');});
});
