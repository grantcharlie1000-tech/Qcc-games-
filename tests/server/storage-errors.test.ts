import {describe,expect,it,vi} from 'vitest';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler,type Database} from '../../src/leaderboard/server';
import {createGuardedHandler} from '../../netlify/lib/runtime.mts';
import {createApp} from '../../server/app';

const full={error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'};
const errors=[{code:'53100',message:'driver details must stay private'}, {code:'53400'},
 new Error('could not extend file because project size limit (512 MB) has been exceeded'),
 {code:'PROJECT_SIZE_LIMIT_EXCEEDED'},new Error('query failed',{cause:{code:'53100'}})];
const request=()=>new Request('https://backend.test/api/accounts?action=sync',{headers:{Authorization:'Bearer acct_'+'a'.repeat(64)}});
describe('safe capacity responses at database boundaries',()=>{
 it.each(errors)('returns 507 from accounts, leaderboard and environment guard for %j',async error=>{
  const db:Database={query:async()=>{throw error;},connect:async()=>{throw error;}};
  const handlers=[
   ()=>createAccountsHandler(db)(request()),
   ()=>createLeaderboardHandler(db)(new Request('https://backend.test/api/leaderboard?game=snake&view=public')),
   ()=>createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{log:()=>{}})(request()),
  ];
  for(const handle of handlers){const response=await handle();expect(response.status).toBe(507);expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toEqual(full);}
 });
 it('returns 507 if pool creation fails and keeps CORS headers on the response',async()=>{
  const app=createApp({env:{QCC_ALLOWED_ORIGINS:'https://site.test'},database:()=>{throw {code:'53100'};}});
  const response=await app(new Request('https://backend.test/api/accounts?action=me',{headers:{Origin:'https://site.test'}}));
  expect(response.status).toBe(507);expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://site.test');expect(await response.json()).toEqual(full);
 });
 it('returns 507 if runtime flag reads fail after a successful environment check',async()=>{
  const db:Database={query:async sql=>{if(sql==='SELECT name FROM qcc_environment WHERE id=true')return {rows:[{name:'development'}]};throw {code:'53400'};},connect:async()=>{throw Error('unused');}};
  const response=await createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{log:()=>{}})(request());
  expect(response.status).toBe(507);expect(await response.json()).toEqual(full);
 });
 it.each([{code:'53300'},new Error('password authentication failed'),new Error('connection timeout'),{code:'23514',constraint:'other_check'}])('preserves ordinary availability failures for %j',async error=>{
  const db:Database={query:async()=>{throw error;},connect:async()=>{throw error;}};
  const response=await createAccountsHandler(db)(request());expect(response.status).toBe(503);expect((await response.json()).error).not.toBe('storage_full');
 });
 it('never logs database error details through the guard',async()=>{
  const log=vi.fn(),db:Database={query:async()=>{throw {code:'53100',message:'private connection and row details'};},connect:async()=>{throw Error('unused');}};
  const response=await createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{log})(request());
  expect(response.status).toBe(507);expect(JSON.stringify(log.mock.calls)).not.toContain('private connection');
 });
});
