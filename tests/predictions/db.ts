import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import type {Database} from '../../src/leaderboard/server';
import {createPredictionsHandler} from '../../src/predictions/server';

/**
 * Predictions database tests run against real PostgreSQL when QCC_TEST_PG_URL names a server the tests may create
 * scratch databases on (e.g. postgres://postgres@127.0.0.1:55432/postgres). Row locks, isolation and concurrent
 * transactions are only meaningful there. Without it, the sequential suites fall back to the local PGlite emulator
 * and the concurrency suite is skipped (and says so).
 */
export const REAL_PG=process.env.QCC_TEST_PG_URL??'';
type Pool=ReturnType<typeof getDatabase>['pool'];
export interface TestDb {pool:Pool;db:Database;real:boolean;stop():Promise<void>}
const MIGRATIONS='netlify/database/migrations';
export async function startDb():Promise<TestDb> {
 if(REAL_PG){
  const name='predictions_'+randomBytes(6).toString('hex');
  const admin=getDatabase({connectionString:REAL_PG}).pool;
  await admin.query(`CREATE DATABASE ${name}`);
  const url=new URL(REAL_PG);url.pathname='/'+name;
  const pool=getDatabase({connectionString:url.toString()}).pool;
  // DROP … WITH (FORCE) terminates any idle pooled connection; that is expected during teardown.
  pool.on('error',()=>{});
  for(const file of readdirSync(MIGRATIONS).filter(f=>f.endsWith('.sql')).sort())await pool.query(readFileSync(join(MIGRATIONS,file),'utf8'));
  return {pool,db:bound(pool),real:true,async stop(){await pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();}};
 }
 const local=new NetlifyDB({logger:()=>{}});
 const connectionString=await local.start();await local.applyMigrations(MIGRATIONS);
 const pool=getDatabase({connectionString}).pool;
 return {pool,db:bound(pool),real:false,async stop(){await pool.end();await local.stop();}};
}
const bound=(pool:Pool):Database=>({query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as unknown as Database);

export interface User {id:string;username:string;token:string}
export async function makeUser(pool:Pool,username:string):Promise<User> {
 const id=randomUUID(),player=randomBytes(32).toString('hex'),token='acct_'+randomBytes(32).toString('hex');
 await pool.query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,username]);
 await pool.query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,username,'scrypt$test',player]);
 await pool.query(`INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '1 day')`,[createHash('sha256').update(token).digest('hex'),id]);
 return {id,username,token};
}
export async function enable(pool:Pool,launchDaysAgo=60){
 await pool.query(`UPDATE predictions_config SET enabled=true,launch_at=now()-($1*interval '1 day')`,[launchDaysAgo]);
}
export function client(db:Database){
 const handle=createPredictionsHandler(db);
 const call=async(method:'GET'|'POST',action:string,user:User|null,body?:unknown,params:Record<string,string>={})=>{
  const url=new URL('https://qcc.test/.netlify/functions/predictions');
  url.searchParams.set('action',action);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const headers:Record<string,string>={};
  if(user)headers.authorization=`Bearer ${user.token}`;
  if(method==='POST')headers['content-type']='application/json';
  const response=await handle(new Request(url,{method,headers,body:method==='POST'?JSON.stringify(body??{}):undefined}));
  const json=await response.json() as any;
  return {status:response.status,body:json};
 };
 return {
  call,
  get:(action:string,user:User|null,params:Record<string,string>={})=>call('GET',action,user,undefined,params),
  post:(action:string,user:User|null,body:unknown)=>call('POST',action,user,body),
 };
}
export const opKey=()=>randomBytes(12).toString('hex');
export function draft(overrides:Record<string,unknown>={}){
 const close=new Date(Date.now()+3*86_400_000).toISOString(),resolve=new Date(Date.now()+4*86_400_000).toISOString();
 return {question:`Will the library quiz night run on its scheduled day ${randomBytes(3).toString('hex')}?`,category:'school',audience:'public',
  yesRule:'The organiser confirms the quiz ran on the scheduled day.',noRule:'The organiser confirms it was moved or did not run.',
  voidRule:'No official notice is published within 7 days of the scheduled day.',source:'Library events noticeboard',sourceFallback:'',disclosure:'',
  closeAt:close,resolveAt:resolve,...overrides};
}
/** Ledger invariants that must hold after every scenario. */
export async function reconcile(pool:Pool){
 const unbalanced=(await pool.query('SELECT journal_id FROM predictions_postings GROUP BY journal_id HAVING sum(amount)<>0')).rows;
 const wallets=(await pool.query(`SELECT w.account_id,w.balance,COALESCE((SELECT sum(amount) FROM predictions_postings p WHERE p.book='wallet' AND p.owner=w.account_id),0) AS posted FROM predictions_wallets w`)).rows;
 const reserves=(await pool.query(`SELECT m.id,m.reserve,COALESCE((SELECT sum(amount) FROM predictions_postings p WHERE p.book='reserve' AND p.owner=m.id),0) AS posted FROM predictions_markets m`)).rows;
 const shares=(await pool.query(`SELECT m.id,m.q_yes,m.q_no,COALESCE((SELECT sum(shares) FROM predictions_positions p WHERE p.market_id=m.id AND p.side='yes'),0) AS yes,
  COALESCE((SELECT sum(shares) FROM predictions_positions p WHERE p.market_id=m.id AND p.side='no'),0) AS no FROM predictions_markets m WHERE m.state NOT IN ('resolved','void')`)).rows;
 const solvent=(await pool.query(`SELECT id FROM predictions_markets WHERE state NOT IN ('resolved','void') AND reserve<greatest(q_yes,q_no)`)).rows;
 return {
  unbalanced:unbalanced.length,
  walletMismatch:wallets.filter((w:any)=>String(w.balance)!==String(w.posted)).length,
  reserveMismatch:reserves.filter((r:any)=>String(r.reserve)!==String(r.posted)).length,
  shareMismatch:shares.filter((s:any)=>String(s.q_yes)!==String(s.yes)||String(s.q_no)!==String(s.no)).length,
  insolvent:solvent.length,
 };
}
export async function unfrozen(pool:Pool,sql:string,values:unknown[]){
 // Test-only time travel: move a published market's clock without tripping the freeze trigger.
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  // Skips user triggers for this transaction only (test databases run as a superuser).
  await client.query(`SET LOCAL session_replication_role=replica`);
  await client.query(sql,values);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
