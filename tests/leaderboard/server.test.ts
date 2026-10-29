import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
import {createAccountsHandler} from '../../src/accounts/server';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];let handle:ReturnType<typeof createLeaderboardHandler>,accounts:ReturnType<typeof createAccountsHandler>;
const endpoint='https://arcade.test/.netlify/functions/leaderboard';
const submit=(token:string,name:string,score:number,game='snake')=>handle(new Request(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://arcade.test'},body:JSON.stringify({game,name,score})}));
async function signup(username:string){const r=await accounts(new Request('https://arcade.test/.netlify/functions/accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'test password'})}));expect(r.status).toBe(201);return (await r.json()).token as string;}
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;handle=createLeaderboardHandler(pool);accounts=createAccountsHandler(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});beforeEach(async()=>{await pool.query('TRUNCATE arcade_players CASCADE');});
describe('shared leaderboard with real Postgres',()=>{
 it('ranks Tetris scores and retains each player’s best',async()=>{const a=await signup('Ada'),b=await signup('Bobby');expect((await submit(a,'ignored',1200,'quadfall')).status).toBe(200);expect((await submit(b,'ignored',2000,'quadfall')).status).toBe(200);await submit(a,'ignored',500,'quadfall');const board=await (await handle(new Request(endpoint+'?game=quadfall'))).json();expect(board.entries.map((e:any)=>[e.name,e.score])).toEqual([['Bobby',2000],['Ada',1200]]);});
 it('accepts signed-in Slipline scores',async()=>{const token=await signup('Ada');expect((await submit(token,'ignored',320,'slipline')).status).toBe(200);const board=await (await handle(new Request(endpoint+'?game=slipline'))).json();expect(board.entries[0].score).toBe(320);expect(board.entries[0].account).toBe(true);});
 it('shares ranked personal bests between accounts without duplicating updates',async()=>{const a=await signup('Ada'),b=await signup('Bobby');expect((await submit(a,'Ada',100)).status).toBe(200);await submit(b,'Bobby',200);await submit(a,'Ada',50);await submit(a,'Ada',150);const response=await handle(new Request(endpoint+'?game=snake')),result=await response.json();expect(response.headers.get('cache-control')).toBe('no-store');expect(result.entries.map((e:any)=>[e.rank,e.name,e.score])).toEqual([[1,'Bobby',200],[2,'Ada',150]]);expect(result.player).toBeNull();const mine=await (await handle(new Request(endpoint+'?game=snake',{headers:{Authorization:`Bearer ${a}`}}))).json();expect(mine.player.name).toBe('Ada');expect(mine.player.rank).toBe(2);expect(result.entries.some((e:any)=>e.playerId===a||e.playerId===b)).toBe(false);});
 it('isolates games and uses the account username instead of a supplied nickname',async()=>{const a=await signup('Ada'),b=await signup('Other');await submit(a,'Spoofed',100);await submit(b,'Other',5);await submit(a,'New name',10);await submit(a,'New name',8,'tower');const snake=await (await handle(new Request(endpoint+'?game=snake'))).json();expect(snake.entries.map((e:any)=>[e.name,e.score])).toEqual([['Ada',100],['Other',5]]);const tower=await (await handle(new Request(endpoint+'?game=tower'))).json();expect(tower.entries).toHaveLength(1);expect(tower.entries[0].score).toBe(8);});
 it('still reads existing guest records without changing them or treating a nickname as account ownership',async()=>{const phone='a'.repeat(64),laptop='b'.repeat(64),other='c'.repeat(64);for(const [token,name,score] of [[phone,'Ada',100],[laptop,'ada',300],[other,'Bo',150]] as const){const id=createHash('sha256').update(token).digest('hex');await pool.query('INSERT INTO arcade_players(id,name) VALUES($1,$2)',[id,name]);await pool.query("INSERT INTO arcade_scores(game_id,player_id,score) VALUES('snake',$1,$2)",[id,score]);}const result=await (await handle(new Request(endpoint+'?game=snake'))).json();expect(result.entries.map((e:any)=>[e.rank,e.name,e.score])).toEqual([[1,'ada',300],[2,'Bo',150]]);expect(result.entries.every((e:any)=>e.account===false)).toBe(true);expect((await submit(phone,'Ada',999)).status).toBe(401);expect((await pool.query('SELECT count(*)::int AS n FROM arcade_scores')).rows[0].n).toBe(3);});
 it.each([{game:'globle',score:12},{game:'snake',score:-1},{game:'snake',score:1.5}])('rejects invalid authenticated submissions %j',async data=>{const token=await signup('Ada');expect((await submit(token,'Ada',data.score,data.game)).status).toBe(400);expect((await pool.query('SELECT * FROM arcade_scores')).rows).toHaveLength(0);});
 it('rejects missing sessions, foreign origins and oversized bodies',async()=>{expect((await submit('invalid','Ada',1)).status).toBe(401);const token=await signup('Ada'),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://foreign.test'};expect((await handle(new Request(endpoint,{method:'POST',headers,body:'{}'}))).status).toBe(403);delete (headers as any).Origin;expect((await handle(new Request(endpoint,{method:'POST',headers,body:'x'.repeat(3000)}))).status).toBe(413);});
});

it('isolates all three Minesweeper difficulty boards and ranks milliseconds',async()=>{
 const token=await signup('MinesPlayer');
 for(const [key,ms] of [['easy',12345],['medium',67890],['hard',123456]] as const){
  const game='minesweeper-'+key,score=2147483647-ms;
  expect((await submit(token,'ignored',score,game)).status).toBe(200);
  await submit(token,'ignored',score-1000,game);
  const board=await (await handle(new Request(endpoint+'?game='+game))).json();
  expect(board.entries).toHaveLength(1);expect(board.entries[0].score).toBe(score);
 }
 expect((await (await handle(new Request(endpoint+'?game=minesweeper'))).json()).entries).toHaveLength(0);
});

it('public v2 boards are cacheable and never resolve a session or return personal fields',async()=>{
 const token=await signup('Public_Reader');await submit(token,'ignored',100);
 const queries:string[]=[];const observed={query:async(sql:string,values?:unknown[])=>{queries.push(sql);return pool.query(sql,values);},connect:()=>pool.connect()};
 const response=await createLeaderboardHandler(observed)(new Request(endpoint+'?game=snake&view=public',{headers:{Authorization:'Bearer acct_'+'f'.repeat(64)}}));
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('public, max-age=30');expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');expect(response.headers.get('Netlify-Cache-Tag')).toBe('qcc-board-snake');
 const data=await response.json();expect(Object.keys(data)).toEqual(['entries']);expect(data.entries[0].name).toBe('Public_Reader');expect(data.entries[0]).not.toHaveProperty('mine');expect(queries.some(sql=>sql.includes('account_sessions'))).toBe(false);
});
it('personal v2 reads validate the account and are always private',async()=>{
 const token=await signup('Personal_Reader');await submit(token,'ignored',100);
 const response=await handle(new Request(endpoint+'?game=snake&view=personal',{headers:{Authorization:'Bearer '+token}}));expect(response.headers.get('Cache-Control')).toBe('private, no-store');const body=await response.json();expect(Object.keys(body)).toEqual(['player']);expect(body.player.name).toBe('Personal_Reader');
 expect((await handle(new Request(endpoint+'?game=snake&view=personal'))).status).toBe(401);
});
it('equal and lower scores never rewrite the score or player row',async()=>{
 const token=await signup('Unchanged');await submit(token,'ignored',100);
 const rows=()=>pool.query('SELECT p.xmin::text AS player_version,s.xmin::text AS score_version,s.reached_at FROM arcade_players p JOIN arcade_scores s ON s.player_id=p.id');
 const before=(await rows()).rows;await submit(token,'Spoofed',100);await submit(token,'Spoofed',50);expect((await rows()).rows).toEqual(before);
});

it('freeze rejects leaderboard writes before opening a transaction while public reads stay available',async()=>{
 const token=await signup('Frozen_Player');await submit(token,'ignored',50);
 vi.stubEnv('QCC_WRITE_FREEZE','1');try{
  const queries:string[]=[];const observed={query:async(sql:string,values?:unknown[])=>{queries.push(sql);return pool.query(sql,values);},connect:async()=>{throw Error('must not connect for frozen writes');}};
  const handler=createLeaderboardHandler(observed);const response=await handler(new Request(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({game:'snake',score:100})}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'read_only',retryable:true});expect(response.headers.get('Retry-After')).toBe('120');expect(queries).toEqual([]);
  expect((await handler(new Request(endpoint+'?game=snake&view=public'))).status).toBe(200);expect((await pool.query("SELECT score FROM arcade_scores WHERE game_id='snake'")).rows[0].score).toBe(50);
 }finally{vi.unstubAllEnvs();}
});
