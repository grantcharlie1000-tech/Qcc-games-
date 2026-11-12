import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];let handle:ReturnType<typeof createAccountsHandler>;
const endpoint='https://arcade.test/.netlify/functions/accounts';
const entry=(time=120,updated=100)=>({time,updated,snapshot:{id:'movie-1',kind:'movie',name:'Test film',year:2020,poster:'https://image.tmdb.org/t/p/w500/test.jpg'}});
const call=(action:string,token?:string,body?:unknown)=>handle(new Request(endpoint+'?action='+action,{method:body===undefined?'GET':action==='movies'?'PUT':'POST',headers:{'Content-Type':'application/json',Origin:'https://arcade.test',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
const signup=async(username:string)=>(await (await call('signup',undefined,{username,password:'secret password'})).json()).token as string;
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;handle=createAccountsHandler(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
beforeEach(async()=>{await pool.query('TRUNCATE arcade_players,account_attempts CASCADE');});
it('requires live account sessions and isolates progress from another account and game saves',async()=>{
 const a=await signup('Movie_A'),b=await signup('Movie_B');
 expect((await call('movies')).status).toBe(401);
 expect((await call('movies',a,{entries:{'movie-1':entry()},cleared:0})).status).toBe(200);
 expect(await (await call('movies',a)).json()).toEqual({entries:{'movie-1':entry()},cleared:0});
 expect(await (await call('movies',b)).json()).toEqual({entries:{},cleared:0});
 expect((await pool.query('SELECT * FROM account_saves')).rows).toEqual([]);
 await call('logout',a,{});expect((await call('movies',a)).status).toBe(401);
});
it('merges individual updates and preserves completion and clear against stale devices',async()=>{
 const token=await signup('Movie_A');
 await call('movies',token,{entries:{'movie-1':entry()},cleared:0});
 await call('movies',token,{entries:{'movie-1':entry(0,200)},cleared:0});
 await call('movies',token,{entries:{'movie-1':entry(500,150)},cleared:0});
 expect((await (await call('movies',token)).json()).entries['movie-1'].time).toBe(0);
 await call('movies',token,{entries:{},cleared:300});
 await call('movies',token,{entries:{'movie-1':entry(500,250)},cleared:0});
 expect(await (await call('movies',token)).json()).toEqual({entries:{},cleared:300});
 await call('movies',token,{entries:{'movie-1':entry(40,301)},cleared:0});
 expect((await (await call('movies',token)).json()).entries['movie-1'].time).toBe(40);
});
it('preserves two independent device writes',async()=>{
 const token=await signup('Movie_A');const second={...entry(),snapshot:{...entry().snapshot,id:'movie-2'}};
 const responses=await Promise.all([call('movies',token,{entries:{'movie-1':entry()},cleared:0}),call('movies',token,{entries:{'movie-2':second},cleared:0})]);
 expect(responses.map(r=>r.status)).toEqual([200,200]);expect(Object.keys((await (await call('movies',token)).json()).entries).sort()).toEqual(['movie-1','movie-2']);
});
it('rejects invalid keys, artwork, timestamps, unbounded data and cross-origin writes',async()=>{
 const token=await signup('Movie_A');
 for(const entries of [{'bad':entry()},{'movie-1':{...entry(),updated:Date.now()+120000}},{'movie-1':{...entry(),time:-1}},{'movie-1':{...entry(),snapshot:{...entry().snapshot,poster:'https://evil.test/image.jpg'}}}])expect((await call('movies',token,{entries,cleared:0})).status).toBe(400);
 expect((await call('movies',token,{entries:{},cleared:0,accountId:'other'})).status).toBe(400);
 expect((await call('movies',token,{entries:{},cleared:0,padding:'x'.repeat(131072)})).status).toBe(413);
 expect((await handle(new Request(endpoint+'?action=movies',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://evil.test'},body:'{"entries":{},"cleared":0}'}))).status).toBe(403);
});
it('honors write freeze without blocking reads',async()=>{
 const token=await signup('Movie_A');process.env.QCC_WRITE_FREEZE='true';try{expect((await call('movies',token,{entries:{},cleared:0})).status).toBe(503);expect((await call('movies',token)).status).toBe(200);}finally{delete process.env.QCC_WRITE_FREEZE;}
});
it('rejects growth at capacity without deleting existing resume points',async()=>{
 const token=await signup('Movie_A'),entries=Object.fromEntries(Array.from({length:200},(_,n)=>['movie-'+n,{...entry(),snapshot:{...entry().snapshot,id:'movie-'+n}}]));
 expect((await call('movies',token,{entries,cleared:0})).status).toBe(200);
 expect((await call('movies',token,{entries:{'movie-extra':{...entry(),snapshot:{...entry().snapshot,id:'movie-extra'}}},cleared:0})).status).toBe(413);
 expect(Object.keys((await (await call('movies',token)).json()).entries)).toHaveLength(200);
});
it('rolls back a storage-full write and preserves the last saved progress',async()=>{
 const token=await signup('Movie_A');await call('movies',token,{entries:{'movie-1':entry()},cleared:0});
 const failing=createAccountsHandler({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,values)=>{if(sql.startsWith('INSERT INTO account_movie_progress'))throw {code:'53100'};return client.query(sql,values);},release:()=>client.release()};}});
 const response=await failing(new Request(endpoint+'?action=movies',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({entries:{'movie-1':entry(500,200)},cleared:0})}));
 expect(response.status).toBe(507);expect((await (await call('movies',token)).json()).entries['movie-1'].time).toBe(120);
});
