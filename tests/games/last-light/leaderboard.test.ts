import {beforeAll,afterAll,it,expect} from 'vitest';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../../src/accounts/server';
import {createLeaderboardHandler} from '../../../src/leaderboard/server';
import {createRun,serialize,restore,rankScore} from '../../../src/games/last-light/model';
import {SCORED_GAMES} from '../../../src/leaderboard/shared';
const db=new NetlifyDB({logger:()=>{}});
let pool:ReturnType<typeof getDatabase>['pool'],accounts:ReturnType<typeof createAccountsHandler>,leaderboard:ReturnType<typeof createLeaderboardHandler>;
const origin='https://arcade.test',endpoint=origin+'/.netlify/functions/';
beforeAll(async()=>{const connectionString=await db.start();await db.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;const bound={query:pool.query.bind(pool),connect:pool.connect.bind(pool)};accounts=createAccountsHandler(bound);leaderboard=createLeaderboardHandler(bound);},30000);
afterAll(async()=>{await pool?.end();await db.stop();});
async function signup(username:string){const r=await accounts(new Request(endpoint+'accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'test password'})}));expect(r.status).toBe(201);return (await r.json()).token as string;}
const submit=(token:string,score:number,game='last-light')=>leaderboard(new Request(endpoint+'leaderboard',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:origin},body:JSON.stringify({game,score,name:'Spoofed'})}));
it('the migrated database accepts every scored game, including Last Light',async()=>{const token=await signup('All_Games');for(const id of SCORED_GAMES)expect((await submit(token,1,id)).status,id).toBe(200);},15000);
it('ranks real campaign scores, preserves personal bests and resolves account identity',async()=>{
 const a=await signup('Light_Ada'),b=await signup('Light_Bobby');const fast=rankScore(2,4,45000,1),farther=rankScore(3,2,160000,12);
 expect((await submit(a,fast)).status).toBe(200);expect((await submit(b,farther)).status).toBe(200);await submit(a,rankScore(1,3,15000,0));
 const response=await leaderboard(new Request(endpoint+'leaderboard?game=last-light&view=public'));expect(response.status).toBe(200);
 const board=await response.json();expect(board.entries.slice(0,2).map((e:any)=>[e.name,e.score])).toEqual([['Light_Bobby',farther],['Light_Ada',fast]]);
 const personal=await (await leaderboard(new Request(endpoint+'leaderboard?game=last-light&view=personal',{headers:{Authorization:`Bearer ${a}`}}))).json();expect(personal.player).toMatchObject({name:'Light_Ada',rank:2,score:fast,account:true});
 expect((await submit('invalid',9999999)).status).toBe(401);
});
it('round-trips Last Light progress and best scores through the account cloud-save handler',async()=>{
 const token=await signup('Light_Save');const s=createRun();s.stage=5;s.cleared=5;s.checkpoint=true;s.time=105000;s.stageTime=5000;s.deaths=2;s.sparks=10;s.best=rankScore(5,10,100000,2);
 const data=serialize(s),updated=1234,saves={'best:last-light':{value:s.best,updated},'save:last-light':{value:{version:1,data,updated},updated},favourites:{value:['last-light'],updated}};
 const put=await accounts(new Request(endpoint+'accounts?action=sync',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({saves})}));expect(put.status).toBe(200);
 const get=await accounts(new Request(endpoint+'accounts?action=sync',{headers:{Authorization:`Bearer ${token}`}}));expect(get.status).toBe(200);const pulled=await get.json();
 expect(pulled.saves['best:last-light'].value).toBe(s.best);expect(pulled.saves.favourites.value).toEqual(['last-light']);const restored=restore(pulled.saves['save:last-light'].value.data)!;expect(restored.stage).toBe(5);expect(restored.checkpoint).toBe(true);expect(restored.sparks).toBe(10);expect(restored.deaths).toBe(2);
});
it('normalizes legacy server ranks and replaces them with better readable points',async()=>{
 const token=await signup('Legacy_Light');
 await submit(token,20000);
 await pool.query("UPDATE arcade_scores SET score=20600000 WHERE game_id='last-light' AND player_id=(SELECT player_id FROM accounts WHERE username=$1)",['Legacy_Light']);
 const old=await (await leaderboard(new Request(endpoint+'leaderboard?game=last-light&view=personal',{headers:{Authorization:`Bearer ${token}`}}))).json();expect(old.player.score).toBe(20000);
 expect((await (await submit(token,26700)).json()).player.score).toBe(26700);
 expect((await submit(token,62001)).status).toBe(400);expect((await submit(token,62001,'snake')).status).toBe(200);
 const updated=1234;
 await accounts(new Request(endpoint+'accounts?action=sync',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({saves:{'best:last-light':{value:20600000,updated}}})}));
 const r=await accounts(new Request(endpoint+'accounts?action=sync',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({saves:{'best:last-light':{value:26700,updated:updated+1}}})}));expect(r.status).toBe(200);
 const cloud=await (await accounts(new Request(endpoint+'accounts?action=sync',{headers:{Authorization:`Bearer ${token}`}}))).json();expect(cloud.saves['best:last-light'].value).toBe(26700);
});
