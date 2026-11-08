import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Database} from '../../src/leaderboard/server';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
import {createGuardedHandler} from '../../netlify/lib/runtime.mts';
const local=new LocalDB();let pool:Database&{end():Promise<void>};
beforeAll(async()=>{pool=createLocalPool(await local.start());await local.applyMigrations('db/migrations');},30000);
afterAll(async()=>{await pool.end();await local.stop();});
let clock=Date.now();
beforeEach(async()=>{clock+=30000;vi.spyOn(Date,'now').mockImplementation(()=>clock);await pool.query('DELETE FROM qcc_environment');await pool.query('UPDATE qcc_runtime_flags SET write_freeze=false');});
const req=(method='GET')=>new Request('http://localhost/api',{method});
const factory=()=>async()=>Response.json({ok:true});
for(const [context,marker,status] of [['production','production',200],['production','preview',503],['deploy-preview','preview',200],['branch-deploy','preview',200],['deploy-preview','production',503],['dev','development',200],['dev','preview',503]] as const)it(`${context} against ${marker} -> ${status}`,async()=>{
 await pool.query('INSERT INTO qcc_environment(name) VALUES ($1)',[marker]);
 expect((await createGuardedHandler(pool,factory,{context,log:()=>{}})(req())).status).toBe(status);
});
it('legacy missing marker allows deploy 1 but strict production and preview refuse',async()=>{
 for(const allowMissingMarker of [true,false])for(const context of ['production','deploy-preview'])expect((await createGuardedHandler(pool,factory,{context,allowMissingMarker,log:()=>{}})(req())).status).toBe(allowMissingMarker?200:503);
});
it('explicit expected env is an additional restriction and invalid contexts fail',async()=>{
 await pool.query("INSERT INTO qcc_environment(name) VALUES ('development')");
 expect((await createGuardedHandler(pool,factory,{context:'dev',expectedEnv:'production',log:()=>{}})(req())).status).toBe(503);
 expect((await createGuardedHandler(pool,factory,{context:'mystery',log:()=>{}})(req())).status).toBe(503);
});
for(const source of ['db','env'])it(`${source} freeze blocks every mutation, preserves reads, expires cache`,async()=>{
 let now=clock;const env:NodeJS.ProcessEnv={};const handle=createGuardedHandler(pool,factory,{context:'dev',allowMissingMarker:true,env,now:()=>now});
 expect((await handle(req('POST'))).status).toBe(200);
 if(source==='db')await pool.query('UPDATE qcc_runtime_flags SET write_freeze=true');else env.QCC_WRITE_FREEZE='1';
 if(source==='db')expect((await handle(req('POST'))).status).toBe(200);
 now+=10001;
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){const response=await handle(req(method));expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('120');expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toEqual({error:'read_only',retryable:true});}
 for(const method of ['GET','HEAD'])expect((await handle(req(method))).status).toBe(200);
});
for(const source of ['db','1','true','yes','on'])it(`${source} freeze protects both real handlers and leaves authenticated reads write-free`,async()=>{
 const queries:string[]=[];
 const db:Database={query:async(sql,values)=>{queries.push(sql);return pool.query(sql,values);},connect:async()=>{
  const client=await pool.connect();return {query:async(sql,values)=>{queries.push(sql);return client.query(sql,values);},release:()=>client.release()};
 }};
 const accounts=createAccountsHandler(db),leaderboard=createLeaderboardHandler(db);
 const endpoint='http://localhost/api';
 const signup=await accounts(new Request(endpoint+'?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Freeze_'+source,password:'test password'})}));
 expect(signup.status).toBe(201);const {token}=await signup.json();
 await pool.query("UPDATE account_sessions SET last_used=now()-interval '2 hours'");
 const before=(await pool.query('SELECT xmin::text,last_used FROM account_sessions ORDER BY token_hash')).rows;
 if(source==='db'){
  await pool.query('UPDATE qcc_runtime_flags SET write_freeze=true');
  clock+=10001;
 }else vi.stubEnv('QCC_WRITE_FREEZE',source);
 try{
  for(const [action,method] of [['signup','POST'],['login','POST'],['logout','POST'],['sync','PUT']]){
   const response=await accounts(new Request(endpoint+'?action='+action,{method,body:'{}'}));
   expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('120');expect(await response.json()).toEqual({error:'read_only',retryable:true});
  }
  const response=await leaderboard(new Request(endpoint,{method:'POST',body:'{}'}));
  expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('120');expect(await response.json()).toEqual({error:'read_only',retryable:true});
  queries.length=0;
  for(const action of ['me','sync&cursor=0'])expect((await accounts(new Request(endpoint+'?action='+action,{headers:{Authorization:'Bearer '+token,'X-QCC-Sync':'2'}}))).status).toBe(200);
  expect((await leaderboard(new Request(endpoint+'?game=snake&view=personal',{headers:{Authorization:'Bearer '+token}}))).status).toBe(200);
  expect((await leaderboard(new Request(endpoint+'?game=snake&view=public'))).status).toBe(200);
  expect(queries.some(sql=>/\b(UPDATE|INSERT|DELETE)\b|FOR UPDATE/i.test(sql))).toBe(false);
  expect((await pool.query('SELECT xmin::text,last_used FROM account_sessions ORDER BY token_hash')).rows).toEqual(before);
 }finally{vi.unstubAllEnvs();}
});
