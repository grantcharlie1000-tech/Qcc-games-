import type {Database} from '../leaderboard/server';
import {resolveAccount} from './server';
import {writeFrozen} from './write-freeze';
import {respond} from '../../server/api';
import {MAX_PROGRESS_BODY_BYTES,MAX_PROGRESS_ENTRIES,mergeMovieProgress,parseMovieProgress,type MovieProgressDocument} from '../movies/progress-shared';

/** This path is deliberately independent of game-save sync and public popularity. */
export async function movieProgress(db:Database,request:Request,data:unknown):Promise<Response>{
 const submitted=request.method==='PUT'?parseMovieProgress(data):undefined;
 if(request.method==='PUT'&&!submitted)return respond({error:'Invalid movie progress.'},400);
 const client=await db.connect();
 try{
  const readonly=request.method==='GET'&&await writeFrozen(db);
  await client.query(readonly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
  const scoped={query:client.query.bind(client)};
  // Session lock prevents logout from completing between this check and the write.
  const account=await resolveAccount(scoped,request,!readonly);
  if(!account){await client.query('ROLLBACK');return respond({error:'Please log in again.'},401);}
  await client.query('SELECT id FROM accounts WHERE id=$1'+(readonly?'':' FOR UPDATE'),[account.id]);
  const row=(await client.query('SELECT value FROM account_movie_progress WHERE account_id=$1',[account.id])).rows[0];
  const current:MovieProgressDocument=row?parseMovieProgress(row.value,Number.MAX_SAFE_INTEGER)!:{entries:{},cleared:0};
  if(!current)throw new Error('Invalid saved movie progress.');
  if(submitted){
   const result=mergeMovieProgress(current,submitted),json=JSON.stringify(result);
   // Never evict an older resume point just to make an unrelated write fit.
   if(Object.keys(result.entries).length>MAX_PROGRESS_ENTRIES||new TextEncoder().encode(json).length>MAX_PROGRESS_BODY_BYTES){await client.query('ROLLBACK');return respond({error:'Movie history is full. Clear history to save more titles.'},413);}
   await client.query('INSERT INTO account_movie_progress(account_id,value) VALUES ($1,$2::jsonb) ON CONFLICT(account_id) DO UPDATE SET value=excluded.value',[account.id,json]);
   await client.query('COMMIT');return respond(result);
  }
  await client.query('COMMIT');return respond(current);
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
