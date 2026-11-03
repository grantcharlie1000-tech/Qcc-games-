import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createAccountsHandler} from '../../src/accounts/server';
import type {Database} from '../../src/leaderboard/server';

const local=new LocalDB();let pool:ReturnType<typeof createLocalPool>;
let handle:ReturnType<typeof createAccountsHandler>,token:string,accountId:string;
const endpoint='https://arcade.test/api/accounts';
const quota={error:'storage_quota',message:'Your saves are over the 2 MB limit.'};
// These fixtures have an independently specified UTF-8 byte size, including both timestamps.
function record(bytes:number,updated=1,unicode=false){
 const make=(data:string)=>({value:{version:1,data,updated},updated});
 const length=bytes-Buffer.byteLength(JSON.stringify(make('')));
 return make(unicode?'é'.repeat(Math.floor(length/2))+'x'.repeat(length%2):'x'.repeat(length));
}
const read=()=>handle(new Request(endpoint+'?action=sync',{headers:{Authorization:'Bearer '+token}}));
function put(saves:unknown,v2=true,handler=handle){
 return handler(new Request(endpoint+'?action=sync',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(v2?{'X-QCC-Sync':'2'}:{})},body:JSON.stringify(v2?{cursor:'0',bases:{},saves}:{saves})}));
}
beforeAll(async()=>{pool=createLocalPool(await local.start());await local.applyMigrations('db/migrations');},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
beforeEach(async()=>{
 await pool.query('TRUNCATE arcade_players,account_attempts CASCADE');handle=createAccountsHandler(pool);
 const response=await handle(new Request(endpoint+'?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Storage_User',password:'test password'})}));
 expect(response.status).toBe(201);token=(await response.json()).token;accountId=(await pool.query('SELECT id FROM accounts')).rows[0].id;
});

describe('per-account stored save quota',()=>{
 it.each([false,true])('accepts exactly 2 MiB then rejects one more byte across separate v2=%s syncs',async v2=>{
  // Three records fit the 1 MiB request envelope. The JSON map adds 42 bytes
  // for these literal keys, separators and braces to the record byte counts.
  expect((await put({'save:snake':record(700000)},v2)).status).toBe(200);
  expect((await put({'save:tower':record(700000)},v2)).status).toBe(200);
  expect((await put({'save:pool':record(697110)},v2)).status).toBe(200);
  expect(Buffer.byteLength(JSON.stringify((await(await read()).json()).saves))).toBe(2097152);
  const before=(await read()).clone(),revision=(await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision;
  const response=await put({'save:pool':record(697111,2)},v2);
  expect(response.status).toBe(413);expect(await response.json()).toEqual(quota);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await(await read()).json()).toEqual(await before.json());
  expect((await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision).toBe(revision);
 });
 it('counts UTF-8 bytes of untouched records and rejects a multi-key batch atomically',async()=>{
  expect((await put({'save:snake':record(900000,1,true)})).status).toBe(200);
  expect((await put({'save:tower':record(900000,1,true)})).status).toBe(200);
  const before=await(await read()).json();
  const response=await put({'best:snake':{value:10,updated:2},'save:pool':record(400000,2,true)});
  expect(response.status).toBe(413);expect(await response.json()).toEqual(quota);
  expect(await(await read()).json()).toEqual(before);
 });
 it('counts replacements once and measures the winning merge rather than stale submissions',async()=>{
  expect((await put({'save:snake':record(700000,9)})).status).toBe(200);
  expect((await put({'save:tower':record(700000,9)})).status).toBe(200);
  expect((await put({'save:pool':record(697110,9)})).status).toBe(200);
  // Timestamp-only semantic no-ops retain their original timestamps at the exact cap.
  const unchanged={value:{...record(700000,9).value,updated:999},updated:999};
  expect((await put({'save:snake':unchanged})).status).toBe(200);
  expect((await(await read()).json()).saves['save:snake']).toEqual(record(700000,9));
  expect((await put({'save:snake':record(900000,1)})).status).toBe(200); // stale larger record loses
  expect((await put({'save:snake':record(100,11),'save:pool':record(900000,11)})).status).toBe(200);
  const data=await(await read()).json();
  expect(data.saves['save:snake']).toEqual(record(100,11));expect(data.saves['save:pool']).toEqual(record(900000,11));
 });
 it('permits reads of legacy oversized accounts and a replacement that brings them below the cap',async()=>{
  for(const key of ['save:blockcraft','save:tower'])await pool.query('INSERT INTO account_saves(account_id,key,value,updated) VALUES ($1,$2,$3::jsonb,1)',[accountId,key,JSON.stringify(record(1100000).value)]);
  expect((await read()).status).toBe(200);
  const over=await put({'best:snake':{value:10,updated:2}});expect(over.status).toBe(413);expect(await over.json()).toEqual(quota);
  expect((await put({'save:blockcraft':record(900000,2)})).status).toBe(200);
  expect((await(await read()).json()).saves['save:blockcraft']).toEqual(record(900000,2));
 });
 it('isolates account totals',async()=>{
  expect((await put({'save:snake':record(700000)})).status).toBe(200);
  expect((await put({'save:tower':record(700000)})).status).toBe(200);
  expect((await put({'save:pool':record(697110)})).status).toBe(200);
  const second=await handle(new Request(endpoint+'?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Other_User',password:'test password'})}));
  expect(second.status).toBe(201);token=(await second.json()).token;
  expect((await put({'save:snake':record(700000)})).status).toBe(200);
 });
 it('serializes concurrent batches from separate handler instances before counting stored records',async()=>{
  expect((await put({'save:snake':record(900000)})).status).toBe(200);
  const statements:string[]=[];
  const db:Database={query:pool.query.bind(pool),connect:async()=>{
   const client=await pool.connect();return {query:async(sql,values)=>{statements.push(sql);return client.query(sql,values);},release:()=>client.release()};
  }};
  const responses=await Promise.all([put({'save:tower':record(700000)},true,createAccountsHandler(db)),put({'save:pool':record(700000)},true,createAccountsHandler(db))]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,413]);
  expect((await pool.query('SELECT count(*)::int AS n FROM account_saves')).rows[0].n).toBe(2);
  const readIndex=statements.findIndex(sql=>sql.startsWith('SELECT key,value,updated FROM account_saves'));
  expect(statements.slice(0,readIndex)).toContain('SELECT id FROM accounts WHERE id=$1 FOR UPDATE');
 });
 it('rejects an oversized streamed sync body before writing any saves',async()=>{
  const response=await put({'save:snake':record(1048576),'save:tower':record(1048576)});
  expect(response.status).toBe(413);expect(await response.json()).toEqual({error:'Request too large.'});
  expect((await pool.query('SELECT * FROM account_saves')).rows).toHaveLength(0);
 });
});

describe('database capacity errors preserve saves',()=>{
 it('returns 507 on connection acquisition failure and releases the account lock for a later retry',async()=>{
  let full=true;
  const handler=createAccountsHandler({query:pool.query.bind(pool),connect:async()=>{if(full)throw {code:'53100'};return pool.connect();}});
  expect((await put({'best:snake':{value:10,updated:2}},true,handler)).status).toBe(507);
  full=false;const retry=await Promise.race([put({'best:snake':{value:10,updated:2}},true,handler),new Promise<null>(resolve=>setTimeout(()=>resolve(null),1000))]);
  expect(retry?.status).toBe(200);
 });
 it('preserves a capacity error when rollback cleanup also fails',async()=>{
  const db:Database={query:pool.query.bind(pool),connect:async()=>{
   const client=await pool.connect();return {query:async(sql,values)=>{
    if(sql.startsWith('INSERT INTO account_saves'))throw {code:'53100'};
    if(sql==='ROLLBACK'){await client.query(sql);throw Error('connection lost during cleanup');}
    return client.query(sql,values);
   },release:()=>client.release()};
  }};
  const response=await put({'best:snake':{value:10,updated:2}},true,createAccountsHandler(db));
  expect(response.status).toBe(507);expect(await response.json()).toEqual({error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'});
 });
 it('rolls back signup if COMMIT reports a full database',async()=>{
  const db:Database={query:pool.query.bind(pool),connect:async()=>{
   const client=await pool.connect();return {query:async(sql,values)=>{if(sql==='COMMIT')throw {code:'53100'};return client.query(sql,values);},release:()=>client.release()};
  }};
  const response=await createAccountsHandler(db)(new Request(endpoint+'?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Failed_Signup',password:'test password'})}));
  expect(response.status).toBe(507);
  // Force the same test pool connection: a leaked open transaction would expose the new account here.
  expect((await pool.query("SELECT id FROM accounts WHERE username='Failed_Signup'")).rows).toHaveLength(0);
 });
 it.each([
  {code:'53100',message:'disk full'},
  {code:'53400',message:'configuration limit exceeded'},
  new Error('could not extend file because project size limit (512 MB) has been exceeded'),
  new Error('database write failed',{cause:{code:'53100'}}),
 ])('returns 507 and rolls back partial writes for %j',async error=>{
  expect((await put({'save:snake':record(100)})).status).toBe(200);
  const before=await(await read()).json(),revision=(await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision;
  const db:Database={query:pool.query.bind(pool),connect:async()=>{
   const client=await pool.connect();let inserts=0;
   return {query:async(sql,values)=>{if(sql.startsWith('INSERT INTO account_saves')&&++inserts===2)throw error;return client.query(sql,values);},release:()=>client.release()};
  }};
  const response=await put({'best:snake':{value:10,updated:2},'save:tower':record(100,2)},true,createAccountsHandler(db));
  expect(response.status).toBe(507);expect(await response.json()).toEqual({error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'});
  expect(await(await read()).json()).toEqual(before);expect((await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision).toBe(revision);
 });
 it('handles a capacity failure at COMMIT, releases the connection and keeps the old revision',async()=>{
  const db:Database={query:pool.query.bind(pool),connect:async()=>{
   const client=await pool.connect();return {query:async(sql,values)=>{if(sql==='COMMIT')throw {code:'53100'};return client.query(sql,values);},release:()=>client.release()};
  }};
  const response=await put({'best:snake':{value:10,updated:2}},true,createAccountsHandler(db));
  expect(response.status).toBe(507);expect((await pool.query('SELECT * FROM account_saves')).rows).toHaveLength(0);
  expect((await pool.query('SELECT sync_revision::text FROM accounts')).rows[0].sync_revision).toBe('0');
 });
});
