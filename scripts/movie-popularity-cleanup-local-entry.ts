// Local simulator entry only. It is not under functions/ and is not a Pages route.
import worker from '../workers/movie-popularity-cleanup';
import {popularitySqlStatements} from '../tests/movies/popularity-sql';
import schema from '../docs/movie-popularity-schema.sql';
import type {PopularityDatabase, PopularityEnv} from '../server/movie-popularity';

interface CleanupEnv extends PopularityEnv {MOVIE_POPULARITY_DB:PopularityDatabase}

export default {
 async fetch(request:Request,env:CleanupEnv){
  const url=new URL(request.url);
  const db=env.MOVIE_POPULARITY_DB;
  if(url.pathname==='/__local/schema'){
   for(const statement of popularitySqlStatements(schema)){const prepared=db.prepare(statement);if(!prepared.run)return new Response('no run',{status:500});await prepared.run();}
   return new Response('schema');
  }
  if(url.pathname==='/__local/sql'){
   for(const statement of popularitySqlStatements(await request.text())){const prepared=db.prepare(statement);if(!prepared.run)return new Response('no run',{status:500});await prepared.run();}
   return new Response('sql');
  }
  if(url.pathname==='/__local/counts'){
   const tokens=await db.prepare('SELECT COUNT(*) AS n FROM movie_popularity_tokens').all<{n:number}>();
   const daily=await db.prepare('SELECT COUNT(*) AS n FROM movie_popularity_daily').all<{n:number}>();
   const rate=await db.prepare('SELECT COUNT(*) AS n FROM movie_popularity_rate').all<{n:number}>();
   return Response.json({tokens:tokens.results[0]?.n??0,daily:daily.results[0]?.n??0,rate:rate.results[0]?.n??0});
  }
  return worker.fetch();
 },
 scheduled:worker.scheduled,
};
