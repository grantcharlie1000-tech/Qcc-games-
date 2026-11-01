import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createApp,originAllowed,routeOf,deployContext} from '../../server/app';
import type {Database} from '../../src/leaderboard/server';
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

describe('frontend API base',()=>{
 it('keeps the old Netlify paths when no base is set',()=>{expect(apiUrl('accounts','')).toBe('/.netlify/functions/accounts');expect(apiUrl('movies','')).toBe('/api/movies');});
 it('uses the configured backend origin',()=>{expect(apiUrl('turn',apiBase('https://qcc-backend.vercel.app/'))).toBe('https://qcc-backend.vercel.app/api/turn');expect(apiBase('javascript:alert(1)')).toBe('');});
});
