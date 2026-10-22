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
