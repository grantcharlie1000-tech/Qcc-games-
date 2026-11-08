// Test harness only. It is not under functions/ and must not be deployed.
import {handleMoviePopularity, type PopularityEnv} from '../../server/movie-popularity';
import {onMoviePopularityScheduled} from '../../workers/movie-popularity-cleanup';
import {popularitySqlStatements} from './popularity-sql';

export interface HarnessEnv extends PopularityEnv {MOVIE_POPULARITY_DB:NonNullable<PopularityEnv['MOVIE_POPULARITY_DB']>}

export default {
 async fetch(request:Request,env:HarnessEnv):Promise<Response>{
  const url=new URL(request.url);
  const db=env.MOVIE_POPULARITY_DB;
  if(url.pathname==='/__isolated_preview/schema'||url.pathname==='/__isolated_preview/sql'){
   for(const statement of popularitySqlStatements(await request.text())){const prepared=db.prepare(statement);if(!prepared.run)return new Response('no run',{status:500});await prepared.run();}
   return new Response('sql');
  }
  if(url.pathname==='/__isolated_preview/disabled')return handleMoviePopularity(new Request('https://qcc.test/api/movie-popularity'),{...env,MOVIE_POPULARITY_ENABLED:'false'});
  if(url.pathname==='/__isolated_preview/scheduled'){
   try{await onMoviePopularityScheduled({scheduledTime:Date.now(),cron:'15 * * * *'},{...env,MOVIE_POPULARITY_ENABLED:'false'},{waitUntil(){}});return new Response('scheduled');}
   catch{return new Response('movie_popularity_cleanup_failed',{status:500});}
  }
  if(url.pathname==='/__isolated_preview/batch-rollback'){
   try{
    await db.batch([
     db.prepare('INSERT INTO movie_popularity_daily (title_id, day, views) VALUES (?, ?, 1)').bind('movie-2',1),
     db.prepare('INSERT INTO movie_popularity_daily (title_id, day, views) VALUES (?, ?, -1)').bind('movie-3',1),
    ]);
    return new Response('committed');
   }catch{return new Response('rolled',{status:500});}
  }
  if(url.pathname==='/__isolated_preview/counts'){
   const tokens=await db.prepare('SELECT COUNT(*) AS n FROM movie_popularity_tokens').all<{n:number}>();
   const daily=await db.prepare('SELECT title_id, views, day FROM movie_popularity_daily ORDER BY title_id').all();
   const rate=await db.prepare('SELECT bucket_hash, attempts FROM movie_popularity_rate').all();
   return Response.json({tokens:tokens.results,daily:daily.results,rate:rate.results});
  }
  return handleMoviePopularity(request,env);
 },
};
