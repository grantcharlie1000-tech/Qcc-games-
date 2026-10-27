import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];let accounts:ReturnType<typeof createAccountsHandler>,leaderboard:ReturnType<typeof createLeaderboardHandler>;
const origin='https://arcade.test',endpoint=origin+'/.netlify/functions/leaderboard';
const auth=async(username:string)=>{const r=await accounts(new Request(origin+'/.netlify/functions/accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'test password'})}));expect(r.status).toBe(201);return r.json();};
const post=(token?:string,data:unknown={game:'snake',score:100,name:'Spoofed'})=>leaderboard(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}));
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;accounts=createAccountsHandler(pool);leaderboard=createLeaderboardHandler(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});beforeEach(async()=>{await pool.query('TRUNCATE arcade_players CASCADE');});
it('rejects anonymous, legacy guest, fabricated, expired and revoked sessions without adding scores',async()=>{
 for(const token of [undefined,'a'.repeat(64),'acct_'+'b'.repeat(64)])expect((await post(token)).status).toBe(401);
 const expired=await auth('Expired');await pool.query("UPDATE account_sessions SET expires_at=now()-interval '1 second'");expect((await post(expired.token)).status).toBe(401);
 const revoked=await auth('Revoked');await pool.query('DELETE FROM account_sessions WHERE token_hash=$1',[createHash('sha256').update(revoked.token).digest('hex')]);expect((await post(revoked.token)).status).toBe(401);
 expect((await pool.query('SELECT count(*)::int AS n FROM arcade_scores')).rows[0].n).toBe(0);
});
it('derives ownership and public name from the validated session even when client identifiers are spoofed',async()=>{
 const alice=await auth('Alice'),bob=await auth('Bobby');const victim=(await pool.query('SELECT id,player_id FROM accounts WHERE username=$1',['Bobby'])).rows[0];
 expect((await post(alice.token,{game:'snake',score:123,name:'Bobby',accountId:victim.id,playerId:victim.player_id,account:true})).status).toBe(200);
 const rows=(await pool.query('SELECT a.username,s.player_id,s.score FROM arcade_scores s JOIN accounts a ON a.player_id=s.player_id')).rows;
 expect(rows).toEqual([{username:'Alice',player_id:expect.any(String),score:123}]);expect(rows[0].player_id).not.toBe(victim.player_id);
 expect((await post(bob.token,{game:'snake',score:50})).status).toBe(200);
});
it('checks revocation after a slow request body arrives before writing any score',async()=>{
 const account=await auth('Slow_Request');let release!:(value:Uint8Array)=>void;
 const stream=new ReadableStream<Uint8Array>({start(controller){release=value=>{controller.enqueue(value);controller.close();};}});
 const request=new Request(endpoint,{method:'POST',headers:{Authorization:'Bearer '+account.token,'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit);const pending=leaderboard(request);
 await vi.waitFor(()=>expect(request.bodyUsed).toBe(true));await pool.query('DELETE FROM account_sessions WHERE token_hash=$1',[createHash('sha256').update(account.token).digest('hex')]);release(new TextEncoder().encode(JSON.stringify({game:'snake',score:900,name:'Slow_Request'})));
 expect((await pending).status).toBe(401);expect((await pool.query('SELECT count(*)::int AS n FROM arcade_scores')).rows[0].n).toBe(0);
});
it('does not import or delete legacy guest leaderboard rows when an older client signs up',async()=>{
 const guestToken='c'.repeat(64),guestId=createHash('sha256').update(guestToken).digest('hex');await pool.query('INSERT INTO arcade_players(id,name) VALUES($1,$2)',[guestId,'Old Guest']);await pool.query("INSERT INTO arcade_scores(game_id,player_id,score) VALUES('snake',$1,700)",[guestId]);
 const response=await accounts(new Request(origin+'/.netlify/functions/accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Fresh_Account',password:'test password',guestToken})}));expect(response.status).toBe(201);
 expect((await pool.query('SELECT player_id,score FROM arcade_scores')).rows).toEqual([{player_id:guestId,score:700}]);
});
