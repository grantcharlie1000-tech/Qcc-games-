import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createAccountsHandler} from '../../src/accounts/server';
import {AccountsClient,type AccountStorage} from '../../src/accounts/client';
const local=new LocalDB();
let pool:ReturnType<typeof createLocalPool>,handle:ReturnType<typeof createAccountsHandler>;
const endpoint='https://arcade.test/.netlify/functions/accounts';
const snapshot=(data:unknown,updated=1)=>({value:{version:1,data,updated},updated});
async function request(action:string,token?:string,body?:unknown,v2=false,cursor='0'){
 const method=body===undefined?'GET':action==='sync'?'PUT':'POST';
 return handle(new Request(endpoint+'?action='+action+(v2?'&cursor='+encodeURIComponent(cursor):''),{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(v2?{'X-QCC-Sync':'2'}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
}
async function signup(){const response=await request('signup',undefined,{username:'Sync_User',password:'secret password'});expect(response.status).toBe(201);return response.json() as Promise<{token:string}>;}
async function sync(token:string,saves:unknown,cursor='0',bases:Record<string,string>={}){const response=await request('sync',token,{cursor,bases,saves},true);expect(response.status).toBe(200);return response.json();}
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('db/migrations');pool=createLocalPool(connectionString);handle=createAccountsHandler(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
beforeEach(async()=>{vi.unstubAllEnvs();await pool.query('TRUNCATE arcade_players,account_attempts CASCADE');});
describe('incremental accounts sync against Postgres',()=>{
 it('releases the account lock when acquiring a database connection fails',async()=>{
  const {token}=await signup();let fail=true;
  const flaky=createAccountsHandler({query:pool.query.bind(pool),connect:async()=>{if(fail){fail=false;throw Error('temporary connection failure');}return pool.connect();}});
  const req=()=>new Request(endpoint+'?action=sync&cursor=0',{headers:{Authorization:`Bearer ${token}`,'X-QCC-Sync':'2'}});
  expect((await flaky(req())).status).toBe(503);
  const retry=await Promise.race([flaky(req()),new Promise<null>(resolve=>setTimeout(()=>resolve(null),250))]);expect(retry?.status).toBe(200);
 });
 it('acknowledges accepted saves without echo and makes lost-response retries idempotent',async()=>{
  const {token}=await signup(),saves={favourites:{value:['snake'],updated:1}};
  const first=await sync(token,saves);expect(first).toEqual({protocolVersion:2,cursor:'1',saves:{},revisions:{favourites:'1'},acks:{favourites:'1'},conflicts:{}});
  const before=(await pool.query('SELECT xmin::text FROM account_saves')).rows[0].xmin;
  const retry=await sync(token,saves);expect(retry).toEqual(first);expect((await pool.query('SELECT xmin::text FROM account_saves')).rows[0].xmin).toBe(before);
  expect(await (await request('sync',token,undefined,true,'1')).json()).toEqual({protocolVersion:2,cursor:'1',saves:{},revisions:{},acks:{},conflicts:{}});
 });
 it('exchanges deltas with deployed v1 clients in both directions',async()=>{
  const {token}=await signup();
  await request('sync',token,{saves:{favourites:{value:['snake'],updated:1}}});
  const pulled=await (await request('sync',token,undefined,true)).json();expect(pulled).toMatchObject({protocolVersion:2,cursor:'1',saves:{favourites:{value:['snake'],updated:1}},revisions:{favourites:'1'}});
  await sync(token,{'best:snake':{value:100,updated:2}},pulled.cursor);
  const legacy=await (await request('sync',token)).json();expect(Object.keys(legacy)).toEqual(['saves']);expect(legacy.saves['best:snake']).toEqual({value:100,updated:2});
  expect(legacy).toMatchInlineSnapshot(`
    {
      "saves": {
        "best:snake": {
          "updated": 2,
          "value": 100,
        },
        "favourites": {
          "updated": 1,
          "value": [
            "snake",
          ],
        },
      },
    }
  `);
  const delta=await (await request('sync',token,undefined,true,'1')).json();expect(delta.saves).toEqual({'best:snake':{value:100,updated:2}});expect(delta.revisions).toEqual({'best:snake':'2'});
 });
 it('returns deterministic authoritative conflicts and retains concurrent independent keys',async()=>{
  const {token}=await signup();
  await sync(token,{favourites:{value:['snake'],updated:3},'best:snake':{value:200,updated:1}});
  const stale=await sync(token,{favourites:{value:[],updated:2},'best:snake':{value:100,updated:4}},'0',{favourites:'0','best:snake':'0'});
  expect(stale.acks).toEqual({});expect(stale.conflicts).toEqual({favourites:{value:['snake'],updated:3},'best:snake':{value:200,updated:1}});expect(stale.cursor).toBe('2');
  await Promise.all([sync(token,{'best:tower':{value:20,updated:1}}),sync(token,{'best:pool':{value:30,updated:1}})]);
  const all=await (await request('sync',token,undefined,true)).json();expect(all.cursor).toBe('4');expect(all.saves['best:tower'].value).toBe(20);expect(all.saves['best:pool'].value).toBe(30);
  const tied=await sync(token,{favourites:{value:['tower'],updated:3}},all.cursor,{favourites:'1'});expect(tied.acks).toHaveProperty('favourites');
  const loses=await sync(token,{favourites:{value:['snake'],updated:3}},tied.cursor,{favourites:'1'});expect(loses.conflicts.favourites.value).toEqual(['tower']);
 });
 it('keeps unchanged bests and snapshots from changing timestamps or revisions, including legacy SQL writers',async()=>{
  const {token}=await signup();await sync(token,{'best:snake':{value:100,updated:1},'save:snake':snapshot({score:10})});
  const before=(await pool.query('SELECT key,xmin::text,updated,revision::text FROM account_saves ORDER BY key')).rows;
  await request('sync',token,{saves:{'best:snake':{value:100,updated:99},'save:snake':snapshot({score:10},99)}});
  await request('sync',token,{saves:{'best:snake':{value:50,updated:100}}});
  expect((await pool.query('SELECT key,xmin::text,updated,revision::text FROM account_saves ORDER BY key')).rows).toEqual(before);
  const cursorBefore=(await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision;
  await pool.query("UPDATE account_saves SET updated=999 WHERE key='best:snake'");
  await pool.query(`INSERT INTO account_saves(account_id,key,value,updated)
   SELECT account_id,key,value,888 FROM account_saves WHERE key='best:snake'
   ON CONFLICT(account_id,key) DO UPDATE SET value=excluded.value,updated=excluded.updated`);
  expect((await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision).toBe(cursorBefore);
  expect((await pool.query('SELECT key,xmin::text,updated,revision::text FROM account_saves ORDER BY key')).rows).toEqual(before);
 });
 it('does not transfer an unchanged large legacy save during a small delta',async()=>{
  const {token}=await signup(),account=(await pool.query('SELECT id FROM accounts')).rows[0].id;
  await pool.query('INSERT INTO account_saves(account_id,key,value,updated) VALUES($1,$2,$3::jsonb,1)',[account,'save:blockcraft',JSON.stringify(snapshot({world:'x'.repeat(1500000)}).value)]);
  const initial=await request('sync',token,undefined,true);expect(initial.status).toBe(200);const state=await initial.json();expect(state.saves['save:blockcraft'].value.data.world.length).toBe(1500000);
  const small=await sync(token,{favourites:{value:[],updated:2}},state.cursor);expect(JSON.stringify(small).length).toBeLessThan(300);expect(small.acks).toEqual({favourites:'2'});
  const retry=await sync(token,{favourites:{value:[],updated:2}},state.cursor);expect(JSON.stringify(retry).length).toBeLessThan(300);
 });
 it('rejects malformed cursors and bases while preserving the write record cap',async()=>{
  const {token}=await signup();
  for(const cursor of ['-1','1e2','01','9007199254740992000000000000000000000000'])expect((await request('sync',token,undefined,true,cursor)).status).toBe(400);
  for(const body of [{cursor:0,bases:{},saves:{}},{cursor:'0',bases:{favourites:0},saves:{}},{cursor:'0',bases:{bad:'1'},saves:{}},{cursor:'0',bases:{},saves:{'save:blockcraft':snapshot({world:'x'.repeat(1100000)})}}])expect((await request('sync',token,body,true)).status).toBe(400);
 });
 it('throttles last_used writes but checks revocation and expiry on every read',async()=>{
  const {token}=await signup(),hash=createHash('sha256').update(token).digest('hex');
  const before=(await pool.query('SELECT last_used,xmin::text FROM account_sessions')).rows[0];
  expect((await request('me',token)).status).toBe(200);expect((await request('sync',token)).status).toBe(200);
  expect((await pool.query('SELECT last_used,xmin::text FROM account_sessions')).rows[0]).toEqual(before);
  await pool.query("UPDATE account_sessions SET last_used=now()-interval '2 hours'");expect((await request('me',token)).status).toBe(200);
  expect(new Date((await pool.query('SELECT last_used FROM account_sessions')).rows[0].last_used).getTime()).toBeGreaterThan(new Date(before.last_used).getTime()-1000);
  await pool.query("UPDATE account_sessions SET expires_at=now()-interval '1 second'");expect((await request('me',token)).status).toBe(401);
  await pool.query("UPDATE account_sessions SET expires_at=now()+interval '1 day'");await pool.query('DELETE FROM account_sessions WHERE token_hash=$1',[hash]);expect((await request('sync',token)).status).toBe(401);
 });
 it('freezes every mutation and leaves authenticated GETs completely read only',async()=>{
  const {token}=await signup();await sync(token,{favourites:{value:['snake'],updated:1}});await pool.query("UPDATE account_sessions SET last_used=now()-interval '2 hours'");
  const before=(await pool.query('SELECT xmin::text,last_used FROM account_sessions')).rows;
  vi.stubEnv('QCC_WRITE_FREEZE','1');
  for(const [action,body] of [['signup',{username:'Other',password:'secret password'}],['login',{username:'Sync_User',password:'secret password'}],['logout',{}],['sync',{saves:{}}]] as const){const response=await request(action,token,body);expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'read_only',retryable:true});expect(response.headers.get('Retry-After')).toBe('120');}
  expect((await request('me',token)).status).toBe(200);expect((await request('sync',token,undefined,true)).status).toBe(200);
  expect((await pool.query('SELECT xmin::text,last_used FROM account_sessions')).rows).toEqual(before);
  const readOnly=createAccountsHandler({query:pool.query.bind(pool),connect:async()=>{
   const client=await pool.connect();return {query:(text:string,values?:unknown[])=>client.query(text==='BEGIN'?'BEGIN READ ONLY':text,values),release:()=>client.release()};
  }});
  const read=await readOnly(new Request(endpoint+'?action=sync&cursor=0',{headers:{Authorization:`Bearer ${token}`,'X-QCC-Sync':'2'}}));
  expect(read.status).toBe(200);

 });
 it('backfills existing saves and can reapply the additive migration without changing values or timestamps',async()=>{
  const {token}=await signup();await request('sync',token,{saves:{favourites:{value:[],updated:123},'best:snake':{value:10,updated:456}}});
  const before=(await pool.query('SELECT account_id,key,value,updated FROM account_saves ORDER BY key')).rows;
  await pool.query('DROP TRIGGER account_saves_assign_revision ON account_saves');
  await pool.query('DROP FUNCTION account_save_revision()');
  await pool.query('ALTER TABLE account_saves DROP COLUMN revision');
  await pool.query('ALTER TABLE accounts DROP COLUMN sync_revision');
  const migration=await readFile('db/migrations/20261028003000_account_sync_revisions.sql','utf8');
  await pool.query(migration);await pool.query(migration);
  expect((await pool.query('SELECT account_id,key,value,updated FROM account_saves ORDER BY key')).rows).toEqual(before);
  const pulled=await (await request('sync',token,undefined,true)).json();expect(pulled.cursor).toBe('2');expect(pulled.revisions).toEqual({'best:snake':'1',favourites:'2'});
 });
 it('preserves bigint cursor precision beyond JavaScript safe integers',async()=>{
  const {token}=await signup();await pool.query('UPDATE accounts SET sync_revision=9007199254740992');
  const written=await sync(token,{favourites:{value:[],updated:1}},'9007199254740992');
  expect(written.cursor).toBe('9007199254740993');expect(written.acks).toEqual({favourites:'9007199254740993'});
  const delta=await (await request('sync',token,undefined,true,'9007199254740992')).json();expect(delta.revisions).toEqual({favourites:'9007199254740993'});
 });
 it('converges two real clients after snapshot conflicts, favourite removal and a lost PUT response',async()=>{
  const makeStorage=():AccountStorage=>{const values=new Map<string,unknown>();return {read:<T>(key:string,fallback:T)=>(values.has(key)?structuredClone(values.get(key)):fallback) as T,write:(key,value)=>{values.set(key,structuredClone(value));return true;},remove:key=>{values.delete(key);return true;},keys:()=>[...values.keys()]};};
  const left=makeStorage(),right=makeStorage(),syncRequests:Request[]=[];let loseNextPut=false;
  const fetcher:typeof fetch=async(input,init)=>{
   const req=new Request(new URL(String(input),'https://arcade.test'),init);if(req.url.includes('action=sync'))syncRequests.push(req.clone());
   const response=await handle(req);
   if(req.method==='PUT'&&loseNextPut){loseNextPut=false;throw new Error('Response lost after commit');}
   return response;
  };
  const a=new AccountsClient(left,fetcher),b=new AccountsClient(right,fetcher);
  try{
   await a.authenticate('signup','Sync_User','secret password');await b.authenticate('login','Sync_User','secret password');
   left.write('save:snake',{version:1,data:{score:9},updated:10});left.write('favourites',['snake']);left.write('updated:favourites',1);await a.flush();
   right.write('save:snake',{version:1,data:{score:1},updated:10});right.write('favourites',[]);right.write('updated:favourites',2);await b.flush();await a.flush();
   expect(left.read('save:snake',null)).toEqual({version:1,data:{score:9},updated:10});expect(right.read('save:snake',null)).toEqual({version:1,data:{score:9},updated:10});expect(left.read('favourites',null)).toEqual([]);expect(right.read('favourites',null)).toEqual([]);
   left.write('best:snake',123);left.write('updated:best:snake',11);loseNextPut=true;await expect(a.flush()).rejects.toThrow('Response lost');
   const revision=(await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision;
   await a.flush();await b.flush();expect(right.read('best:snake',0)).toBe(123);expect((await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision).toBe(revision);
   expect(syncRequests.length).toBeGreaterThan(4);for(const req of syncRequests)expect(req.headers.get('X-QCC-Sync')).toBe('2');
  }finally{a.dispose();b.dispose();}
 });

});
