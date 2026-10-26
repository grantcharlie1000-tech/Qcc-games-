import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
let handle:ReturnType<typeof createLeaderboardHandler>;
const endpoint='https://arcade.test/.netlify/functions/leaderboard';
const submit=(token:string,name:string,score:number,game='snake')=>handle(new Request(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://arcade.test'},body:JSON.stringify({game,name,score})}));
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;handle=createLeaderboardHandler(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
beforeEach(async()=>{await pool.query('TRUNCATE arcade_players CASCADE');});
describe('shared leaderboard with real Postgres',()=>{
 it('shares ranked personal bests between independent players without duplicating updates',async()=>{
  const a='a'.repeat(64),b='b'.repeat(64);
  expect((await submit(a,'Ada',100)).status).toBe(200);await submit(b,'Bo',200);
  await submit(a,'Ada',50);await submit(a,'Ada',150);
  const response=await handle(new Request(endpoint+'?game=snake'));
  const result=await response.json();expect(response.headers.get('cache-control')).toBe('no-store');
  expect(result.entries.map((e:any)=>[e.rank,e.name,e.score])).toEqual([[1,'Bo',200],[2,'Ada',150]]);
  expect(result.player).toBeNull();
  const mine=await (await handle(new Request(endpoint+'?game=snake',{headers:{Authorization:`Bearer ${a}`}}))).json();
  expect(mine.player.name).toBe('Ada');expect(mine.player.rank).toBe(2);
  expect(result.entries.some((e:any)=>e.playerId===a||e.playerId===b)).toBe(false);
 });
 it('isolates games and identities, and updates the nickname without lowering a score',async()=>{
  const a='a'.repeat(64);await submit(a,'Ada',100);await submit('b'.repeat(64),'Other',5);
  await submit(a,'New name',10);await submit(a,'New name',8,'tower');
  const snake=await (await handle(new Request(endpoint+'?game=snake'))).json();
  expect(snake.entries.map((e:any)=>[e.name,e.score])).toEqual([['New name',100],['Other',5]]);
  const tower=await (await handle(new Request(endpoint+'?game=tower'))).json();expect(tower.entries).toHaveLength(1);expect(tower.entries[0].score).toBe(8);
 });
 it('ranks one place per nickname when the same player scores from another device',async()=>{
  const phone='a'.repeat(64),laptop='b'.repeat(64),other='c'.repeat(64);
  await submit(phone,'Ada',100);await submit(other,'Bo',150);await submit(laptop,'ada',300);await submit(phone,'Ada',120);
  const result=await (await handle(new Request(endpoint+'?game=snake'))).json();
  expect(result.entries.map((e:any)=>[e.rank,e.name,e.score])).toEqual([[1,'ada',300],[2,'Bo',150]]);
  const mine=await (await handle(new Request(endpoint+'?game=snake',{headers:{Authorization:`Bearer ${phone}`}}))).json();
  expect([mine.player.rank,mine.player.score]).toEqual([1,300]);
  expect(mine.entries.filter((e:any)=>e.playerId===mine.player.playerId)).toHaveLength(1);
  expect(mine.entries[0]).not.toHaveProperty('mine');
 });
 it.each([{game:'globle',score:12,name:'Ada'},{game:'snake',score:-1,name:'Ada'},{game:'snake',score:1.5,name:'Ada'},{game:'snake',score:99,name:'<script>'}])('rejects invalid public submissions %j',async data=>{
  expect((await submit('c'.repeat(64),data.name,data.score,data.game)).status).toBe(400);
  expect((await pool.query('SELECT * FROM arcade_scores')).rows).toHaveLength(0);
 });
 it('rejects missing identity, foreign origins and oversized bodies',async()=>{
  expect((await submit('invalid','Ada',1)).status).toBe(401);
  const headers={Authorization:`Bearer ${'d'.repeat(64)}`,'Content-Type':'application/json',Origin:'https://foreign.test'};
  expect((await handle(new Request(endpoint,{method:'POST',headers,body:'{}'}))).status).toBe(403);
  delete (headers as any).Origin;
  expect((await handle(new Request(endpoint,{method:'POST',headers,body:'x'.repeat(3000)}))).status).toBe(413);
 });
});

const WIPE=new URL('../../netlify/database/migrations/20261027090000_ball_run_leaderboard_wipe.sql',import.meta.url);
async function rerunBallRunWipe(){
 const sql=readFileSync(WIPE,'utf8');
 for(const statement of sql.split(';').map(part=>part.trim()).filter(part=>part.replace(/--[^\n]*/g,'').trim()))await pool.query(statement);
}
describe('Ball Run leaderboard wipe migration',()=>{
 it('backs up and deletes only Ball Run scores and synced bests, without copying them twice',async()=>{
  await rerunBallRunWipe();
  const ada='a'.repeat(64),bo='b'.repeat(64),cy='c'.repeat(64);
  await pool.query(`INSERT INTO arcade_players(id,name) VALUES ($1,'Ada'),($2,'Bo'),($3,'Cy')`,[ada,bo,cy]);
  await pool.query(`INSERT INTO accounts(id,username,password_hash,player_id) VALUES ('11111111-1111-4111-8111-111111111111','Ada_Run','scrypt$test',$1)`,[ada]);
  await pool.query(`INSERT INTO arcade_scores(game_id,player_id,score,reached_at) VALUES
   ('ball-run',$1,120,'2026-10-01T00:00:00Z'),('snake',$1,40,'2026-10-02T00:00:00Z'),
   ('ball-run',$2,90,'2026-10-03T00:00:00Z'),('tower',$2,7,'2026-10-04T00:00:00Z')`,[ada,bo]);
  await pool.query(`INSERT INTO account_saves(account_id,key,value,updated) VALUES
   ('11111111-1111-4111-8111-111111111111','best:ball-run','120'::jsonb,10),
   ('11111111-1111-4111-8111-111111111111','best:snake','40'::jsonb,11),
   ('11111111-1111-4111-8111-111111111111','save:ball-run','{"version":1,"data":{"distance":3},"updated":12}'::jsonb,12)`);
  await rerunBallRunWipe();
  const live=(await pool.query(`SELECT game_id,score FROM arcade_scores ORDER BY game_id`)).rows;
  expect(live).toEqual([{game_id:'snake',score:40},{game_id:'tower',score:7}]);
  const backed=(await pool.query(`SELECT player_id,score FROM arcade_scores_ballrun_backup_20261027 ORDER BY score`)).rows;
  expect(backed).toEqual([{player_id:bo,score:90},{player_id:ada,score:120}]);
  const saves=(await pool.query(`SELECT key FROM account_saves ORDER BY key`)).rows.map((row:any)=>row.key);
  expect(saves).toEqual(['best:snake','save:ball-run']);
  const bestBackup=(await pool.query(`SELECT key,value,updated FROM account_saves_ballrun_best_backup_20261027`)).rows;
  expect(bestBackup).toEqual([{key:'best:ball-run',value:120,updated:'10'}]);
  await pool.query(`INSERT INTO arcade_scores(game_id,player_id,score,reached_at)
   SELECT game_id,player_id,score,reached_at FROM arcade_scores_ballrun_backup_20261027`);
  await pool.query(`INSERT INTO arcade_scores(game_id,player_id,score,reached_at) VALUES ('ball-run',$1,15,'2026-10-05T00:00:00Z')`,[cy]);
  await pool.query(`INSERT INTO account_saves(account_id,key,value,updated)
   SELECT account_id,key,value,updated FROM account_saves_ballrun_best_backup_20261027`);
  await rerunBallRunWipe();
  expect((await pool.query(`SELECT count(*)::int AS n FROM arcade_scores WHERE game_id='ball-run'`)).rows[0].n).toBe(0);
  expect((await pool.query(`SELECT count(*)::int AS n FROM arcade_scores`)).rows[0].n).toBe(2);
  expect((await pool.query(`SELECT player_id,score FROM arcade_scores_ballrun_backup_20261027 ORDER BY score`)).rows).toEqual([
   {player_id:cy,score:15},{player_id:bo,score:90},{player_id:ada,score:120},
  ]);
  expect((await pool.query(`SELECT count(*)::int AS n FROM account_saves WHERE key='best:ball-run'`)).rows[0].n).toBe(0);
  expect((await pool.query(`SELECT count(*)::int AS n FROM account_saves_ballrun_best_backup_20261027`)).rows[0].n).toBe(1);
  await rerunBallRunWipe();
  expect((await pool.query(`SELECT count(*)::int AS n FROM arcade_scores_ballrun_backup_20261027`)).rows[0].n).toBe(3);
  expect((await pool.query(`SELECT game_id FROM arcade_scores ORDER BY game_id`)).rows.map((row:any)=>row.game_id)).toEqual(['snake','tower']);
 });
});
