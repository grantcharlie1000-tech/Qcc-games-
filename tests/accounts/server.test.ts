import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash,scrypt,timingSafeEqual} from 'node:crypto';
vi.mock('node:crypto',async original=>{const crypto=await original<typeof import('node:crypto')>();return {...crypto,scrypt:vi.fn(crypto.scrypt),timingSafeEqual:vi.fn(crypto.timingSafeEqual)};});
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler,verifyPassword} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
let handle:ReturnType<typeof createAccountsHandler>;
const endpoint='https://arcade.test/.netlify/functions/accounts';
function request(action:string,body?:unknown,token?:string,method=body===undefined?'GET':'POST',extra:Record<string,string>={}){
 return handle(new Request(endpoint+'?action='+action,{method,headers:{'Content-Type':'application/json',Origin:'https://arcade.test',...(token?{Authorization:`Bearer ${token}`}:{ } ),...extra},body:body===undefined?undefined:JSON.stringify(body)}));
}
const signup=async(username='Player_One',guestToken?:string)=>{const response=await request('signup',{username,password:'secret password',...(guestToken?{guestToken}:{})});expect(response.status).toBe(201);return response.json();};
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;handle=createAccountsHandler(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
beforeEach(async()=>{await pool.query('TRUNCATE arcade_players,account_attempts CASCADE');});
describe('optional accounts with real Postgres',()=>{
 it('stores salted self-describing hashes and hashed sessions, never plaintext credentials',async()=>{
  const account=await signup();expect(account).toMatchObject({username:'Player_One'});expect(account.token).toMatch(/^acct_[a-f0-9]{64}$/);
  const users=(await pool.query('SELECT * FROM accounts')).rows;expect(users).toHaveLength(1);
  expect(users[0].password_hash).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32,}\$[a-f0-9]{128}$/);
  expect(await verifyPassword('secret password',users[0].password_hash)).toBe(true);
  const sessions=(await pool.query('SELECT * FROM account_sessions')).rows;expect(sessions[0].token_hash).toBe(createHash('sha256').update(account.token).digest('hex'));
  for(const table of ['accounts','account_sessions','account_attempts','account_saves','arcade_players','arcade_scores']){const text=JSON.stringify((await pool.query(`SELECT * FROM ${table}`)).rows);expect(text).not.toContain('secret password');expect(text).not.toContain(account.token);}
  const second=await signup('Other_User');expect((await pool.query('SELECT password_hash FROM accounts ORDER BY username')).rows[0].password_hash).not.toBe(users[0].password_hash);
  expect(second.token).not.toBe(account.token);
 });
 it('treats usernames case-insensitively and only accepts username/password input',async()=>{
  await signup();expect((await request('signup',{username:'player_one',password:'another password'})).status).toBe(409);
  for(const username of ['ab','has space','<script>','x'.repeat(25)])expect((await request('signup',{username,password:'valid password'})).status).toBe(400);
  for(const password of ['short','x'.repeat(129),123])expect((await request('signup',{username:'Another',password})).status).toBe(400);
  expect((await request('signup',{username:'Another',password:'valid password',email:'private@example.test'})).status).toBe(400);
 });
 it('logs in case-insensitively, rejects wrong passwords and hashes unknown usernames too',async()=>{
  await signup();const response=await request('login',{username:'PLAYER_ONE',password:'secret password'});expect(response.status).toBe(200);
  const account=await response.json();expect((await request('me',undefined,account.token)).status).toBe(200);
  expect((await request('login',{username:'Player_One',password:'wrong password'})).status).toBe(401);
  vi.mocked(scrypt).mockClear();vi.mocked(timingSafeEqual).mockClear();
  expect((await request('login',{username:'Unknown',password:'wrong password'})).status).toBe(401);
  // Wrap the real crypto functions: skipping the costed dummy path must fail this test.
  expect(scrypt).toHaveBeenCalledOnce();expect(timingSafeEqual).toHaveBeenCalledOnce();
  expect(vi.mocked(scrypt).mock.calls[0]![3]).toEqual(expect.objectContaining({N:16384,r:8,p:1}));
  // A malformed hash and the unknown-user route both use the real costed dummy hash path.
  expect(await verifyPassword('wrong password',null)).toBe(false);
 });
 it('revokes logout and rejects expired sessions and guest tokens',async()=>{
  const a=await signup();expect((await request('me',undefined,'a'.repeat(64))).status).toBe(401);
  expect((await request('logout',{},a.token)).status).toBe(200);expect((await request('me',undefined,a.token)).status).toBe(401);
  const b=await (await request('login',{username:a.username,password:'secret password'})).json();
  await pool.query('UPDATE account_sessions SET expires_at=now()-interval \'1 second\'');
  expect((await request('me',undefined,b.token)).status).toBe(401);expect((await pool.query('SELECT * FROM account_sessions WHERE token_hash=$1',[createHash('sha256').update(a.token).digest('hex')])).rows).toHaveLength(0);
 });
 it('revokes an offline-queued session hash without granting hash authentication',async()=>{
  const a=await signup(),sessionHash=createHash('sha256').update(a.token).digest('hex');
  expect((await request('me',undefined,sessionHash)).status).toBe(401);
  expect((await request('logout',{sessionHash})).status).toBe(200);
  expect((await request('me',undefined,a.token)).status).toBe(401);
  expect((await request('logout',{sessionHash})).status).toBe(200);
 });
 it('keeps accounts independent from same-named guest leaderboard identities',async()=>{
  const a=await signup('Account_Name'),leaderboard=createLeaderboardHandler(pool);
  const submit=(token:string,name:string,score:number)=>leaderboard(new Request('https://arcade.test/.netlify/functions/leaderboard',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({game:'snake',name,score})}));
  await submit(a.token,'Account_Name',100);await submit('b'.repeat(64),'account_name',999);
  const board=await (await leaderboard(new Request('https://arcade.test/.netlify/functions/leaderboard?game=snake',{headers:{Authorization:`Bearer ${a.token}`}}))).json();
  expect(board.entries).toHaveLength(2);expect(board.player.score).toBe(100);expect(board.player.name).toBe('Account_Name');
  const guest=await (await leaderboard(new Request('https://arcade.test/.netlify/functions/leaderboard?game=snake',{headers:{Authorization:`Bearer ${'b'.repeat(64)}`}}))).json();expect(guest.player.score).toBe(999);
 });
 it('persistently limits ten failed username logins across IPs and thirty IP attempts',async()=>{
  await signup();for(let i=0;i<10;i++)expect((await request('login',{username:'PLAYER_ONE',password:'wrong password'},undefined,'POST',{'x-nf-client-connection-ip':`192.0.2.${i}`})).status).toBe(401);
  const limited=await request('login',{username:'player_one',password:'secret password'},undefined,'POST',{'x-nf-client-connection-ip':'192.0.2.99'});expect(limited.status).toBe(429);expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  for(let i=0;i<30;i++)expect((await request('signup',{username:'bad',password:'short'},undefined,'POST',{'x-nf-client-connection-ip':'203.0.113.7'})).status).toBe(400);
  expect((await request('signup',{username:'Allowed',password:'valid password'},undefined,'POST',{'x-nf-client-connection-ip':'203.0.113.7'})).status).toBe(429);
 });
 it('rejects cross-origin, non-JSON, malformed and oversized streamed bodies without caching',async()=>{
  const a=await signup();expect((await request('sync',{saves:{}},a.token,'PUT',{Origin:'https://evil.test'})).status).toBe(403);
  expect((await request('login',{},undefined,'POST',{'Content-Type':'text/plain'})).status).toBe(415);
  const response=await handle(new Request(endpoint+'?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(2100)}));expect(response.status).toBe(413);expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await handle(new Request(endpoint+'?action=login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}))).status).toBe(400);
  expect((await request('sync',{saves:{'best:snake':{value:1,updated:1}},padding:'x'.repeat(2097152)},a.token,'PUT')).status).toBe(413);
 });
 it('merges and pulls allowlisted saves while isolating accounts and refusing invalid values',async()=>{
  const a=await signup(),b=await signup('Second_User');
  const first={'best:snake':{value:200,updated:1},favourites:{value:['snake'],updated:1},settings:{value:{sound:false,reducedMotion:false,colorBlind:false},updated:1},'save:snake':{value:{version:1,data:{score:3},updated:10},updated:10}};
  expect((await request('sync',{saves:first},a.token,'PUT')).status).toBe(200);
  const second={'best:snake':{value:100,updated:2},favourites:{value:['tower'],updated:2},settings:{value:{sound:true,reducedMotion:false,colorBlind:false},updated:2},'save:snake':{value:{version:1,data:{score:9},updated:20},updated:20}};
  const merged=await (await request('sync',{saves:second},a.token,'PUT')).json();expect(merged.saves['best:snake'].value).toBe(200);expect(merged.saves.favourites.value).toEqual(['snake','tower']);expect(merged.saves.settings.value.sound).toBe(true);expect(merged.saves['save:snake'].value.data.score).toBe(9);
  expect((await (await request('sync',undefined,a.token)).json()).saves).toEqual(merged.saves);expect((await (await request('sync',undefined,b.token)).json()).saves).toEqual({});
  for(const saves of [{'account:token':{value:'secret',updated:1}},{'best:snake':{value:-1,updated:1}},{'save:corn-clicker':{value:'x',updated:1}},{'save:blockcraft':{value:{version:1,data:{text:'x'.repeat(1050000)},updated:1},updated:1}}])expect((await request('sync',{saves},a.token,'PUT')).status).toBe(400);
 });
 it('serializes concurrent save merges so updates from separate devices are retained',async()=>{
  const a=await signup();await Promise.all([request('sync',{saves:{'best:snake':{value:200,updated:1}}},a.token,'PUT'),request('sync',{saves:{'best:tower':{value:300,updated:1}}},a.token,'PUT')]);
  const result=await (await request('sync',undefined,a.token)).json();expect(result.saves['best:snake'].value).toBe(200);expect(result.saves['best:tower'].value).toBe(300);
 });
 it('migrates guest scores only at signup and uses account identity/name on leaderboard',async()=>{
  const leaderboard=createLeaderboardHandler(pool),guest='a'.repeat(64);
  const post=(token:string,name:string,score:number)=>leaderboard(new Request('https://arcade.test/.netlify/functions/leaderboard',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({game:'snake',name,score})}));
  expect((await post(guest,'Guest',250)).status).toBe(200);const a=await signup('Account_Name',guest);
  expect((await post(a.token,'Forged name',100)).status).toBe(200);
  const board=await (await leaderboard(new Request('https://arcade.test/.netlify/functions/leaderboard?game=snake',{headers:{Authorization:`Bearer ${a.token}`}}))).json();expect(board.player.name).toBe('Account_Name');expect(board.player.score).toBe(250);expect(board.entries.filter((e:any)=>e.name==='Guest')).toHaveLength(0);
  expect((await post(guest,'New guest',20)).status).toBe(200);
  expect((await request('login',{username:a.username,password:'secret password',guestToken:guest})).status).toBe(200);
  const scores=(await pool.query('SELECT score FROM arcade_scores ORDER BY score DESC')).rows;expect(scores.map((s:any)=>s.score)).toEqual([250,20]);
  expect((await request('signup',{username:'Invalid_Guest',password:'valid password',guestToken:a.token})).status).toBe(400);
  expect((await request('me',undefined,guest)).status).toBe(401);
 });
});
