import {createHash} from 'node:crypto';
import {resolveAccount} from '../accounts/server';
import {writeFrozen} from '../accounts/write-freeze';
import {scoredGame,validScore,type Board,type Entry} from './shared';
export interface Database {
 query(text:string,values?:unknown[]):Promise<{rows:any[]}>;
 connect():Promise<{query(text:string,values?:unknown[]):Promise<{rows:any[]}>;release():void}>;
}
export function createLeaderboardHandler(db:Database){
 async function board(game:string,playerId:string|null,publicOnly=false):Promise<Board>{
  // Guests retain nickname deduplication. Account identities stand alone, so a same-named
  // guest cannot replace an account's personal score or steal its highlighting.
  const result=await db.query(`WITH identities AS (
   SELECT s.player_id,p.name,s.score,s.reached_at,a.id IS NOT NULL AS account,
    CASE WHEN a.id IS NULL THEN 'guest:'||lower(p.name) ELSE 'account:'||a.id::text END AS identity
   FROM arcade_scores s JOIN arcade_players p ON p.id=s.player_id LEFT JOIN accounts a ON a.player_id=p.id WHERE s.game_id=$1
  ),best AS (
   SELECT DISTINCT ON (identity) * FROM identities ORDER BY identity,score DESC,reached_at ASC,player_id ASC
  ),ranked AS (
   SELECT row_number() OVER (ORDER BY score DESC,reached_at ASC,player_id ASC)::int AS rank,player_id AS "playerId",name,score,account,
    ${publicOnly?'false':`identity=(SELECT CASE WHEN a.id IS NULL THEN 'guest:'||lower(p.name) ELSE 'account:'||a.id::text END
     FROM arcade_players p LEFT JOIN accounts a ON a.player_id=p.id WHERE p.id=$2)`} AS mine FROM best
  ) SELECT * FROM ranked WHERE rank<=25 OR mine ORDER BY rank`,publicOnly?[game]:[game,playerId]);
  const rows=(result.rows as (Entry&{mine:boolean|null})[]).map(({mine,...entry})=>({entry,mine:mine===true}));
  return {entries:rows.filter(r=>r.entry.rank<=25).map(r=>r.entry),player:rows.find(r=>r.mine)?.entry??null};
 }
 return async function handle(request:Request):Promise<Response>{
  const view=new URL(request.url).searchParams.get('view');
  const headers={'Cache-Control':view==='personal'?'private, no-store':'no-store','X-Content-Type-Options':'nosniff'};
  const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
  if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, POST'}});
  let playerId:string|null=null;
  try{
   if(request.method==='GET'){
    const game=new URL(request.url).searchParams.get('game');
    if(!scoredGame(game))return respond({error:'Choose a game with scores.'},400);
    // Opt-in v2 public reads never inspect credentials or resolve a session.
    if(view==='public'){
     const result=await board(game,null,true);
     return Response.json({entries:result.entries},{headers:{...headers,'Cache-Control':'public, max-age=30','Netlify-CDN-Cache-Control':'public, s-maxage=60, stale-while-revalidate=300','Netlify-Cache-Tag':'qcc-board-'+game}});
    }
    if(view&&view!=='personal')return respond({error:'Choose a valid leaderboard view.'},400);
    const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    playerId=token?createHash('sha256').update(token).digest('hex'):null;
    const account=await resolveAccount(db,request);if(account)playerId=account.playerId;
    if(request.headers.get('authorization')?.startsWith('Bearer acct_')&&!account)return respond({error:'Please log in again.'},401);
    if(view==='personal'){
     if(!account)return respond({error:'Please log in again.'},401);
     return respond({player:(await board(game,account.playerId)).player});
    }
    return respond(await board(game,playerId));
   }
   if(writeFrozen())return Response.json({error:'read_only',retryable:true},{status:503,headers:{...headers,'Retry-After':'120'}});
   if(!/^Bearer acct_[a-f0-9]{64}$/.test(request.headers.get('authorization')??''))return respond({error:'Log in to submit leaderboard scores.'},401);
   const origin=request.headers.get('origin');
   if(origin&&origin!==new URL(request.url).origin)return respond({error:'This request is not allowed.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({error:'Send JSON.'},415);
   if(Number(request.headers.get('content-length'))>2048)return respond({error:'Request too large.'},413);
   // Bound the streamed body too; Content-Length can be omitted or forged.
   const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();
   if(reader)try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>2048){await reader.cancel();return respond({error:'Request too large.'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
   let data:any;try{data=JSON.parse(text);}catch{return respond({error:'Invalid JSON.'},400);}
   if(!data||typeof data!=='object'||Array.isArray(data)||!scoredGame(data.game)||!validScore(data.score))return respond({error:'Use a valid game and a positive whole score.'},400);
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    // Validate and lock this session in the score transaction, after the streamed body arrives.
    const account=await resolveAccount({query:client.query.bind(client)},request,true);
    if(!account){await client.query('ROLLBACK');return respond({error:'Please log in again.'},401);}
    playerId=account.playerId;
    await client.query(`INSERT INTO arcade_players(id,name) VALUES ($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name WHERE arcade_players.name IS DISTINCT FROM excluded.name`,[playerId,account.username]);
    await client.query(`INSERT INTO arcade_scores(game_id,player_id,score) VALUES ($1,$2,$3)
     ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,reached_at=now()
     WHERE excluded.score>arcade_scores.score`,[data.game,playerId,data.score]);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   return respond(await board(data.game,playerId));
  }catch{return respond({error:'Leaderboard temporarily unavailable. Your score stays on this device.'},503);}
 };
}
