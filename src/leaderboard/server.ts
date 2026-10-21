import {createHash} from 'node:crypto';
import {scoredGame,validName,validScore,type Board,type Entry} from './shared';
export interface Database {
 query(text:string,values?:unknown[]):Promise<{rows:any[]}>;
 connect():Promise<{query(text:string,values?:unknown[]):Promise<unknown>;release():void}>;
}
export function createLeaderboardHandler(db:Database){
 async function board(game:string,playerId:string|null):Promise<Board>{
  const result=await db.query(`WITH ranked AS (
   SELECT row_number() OVER (ORDER BY s.score DESC,s.reached_at ASC,s.player_id ASC)::int AS rank,
    s.player_id AS "playerId",p.name,s.score
   FROM arcade_scores s JOIN arcade_players p ON p.id=s.player_id WHERE s.game_id=$1
  ) SELECT * FROM ranked WHERE rank<=25 OR "playerId"=$2 ORDER BY rank`,[game,playerId]);
  const rows=result.rows as Entry[];
  return {entries:rows.filter(r=>r.rank<=25),player:rows.find(r=>r.playerId===playerId)??null};
 }
 return async function handle(request:Request):Promise<Response>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
  if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, POST'}});
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const playerId=token?createHash('sha256').update(token).digest('hex'):null;
  try{
   if(request.method==='GET'){
    const game=new URL(request.url).searchParams.get('game');
    if(!scoredGame(game))return respond({error:'Choose a game with scores.'},400);
    return respond(await board(game,playerId));
   }
   if(!playerId)return respond({error:'A player identity is required.'},401);
   const origin=request.headers.get('origin');
   if(origin&&origin!==new URL(request.url).origin)return respond({error:'This request is not allowed.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({error:'Send JSON.'},415);
   if(Number(request.headers.get('content-length'))>2048)return respond({error:'Request too large.'},413);
   // Bound the streamed body too; Content-Length can be omitted or forged.
   const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();
   if(reader)try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>2048){await reader.cancel();return respond({error:'Request too large.'},413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
   let data:any;try{data=JSON.parse(text);}catch{return respond({error:'Invalid JSON.'},400);}
   if(!data||!scoredGame(data.game)||!validScore(data.score)||!validName(data.name))return respond({error:'Use a valid game, positive whole score and a name of 2–24 characters.'},400);
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    await client.query(`INSERT INTO arcade_players(id,name) VALUES ($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name`,[playerId,data.name]);
    await client.query(`INSERT INTO arcade_scores(game_id,player_id,score) VALUES ($1,$2,$3)
     ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,reached_at=now()
     WHERE excluded.score>arcade_scores.score`,[data.game,playerId,data.score]);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   return respond(await board(data.game,playerId));
  }catch{return respond({error:'Leaderboard temporarily unavailable. Your score stays on this device.'},503);}
 };
}
