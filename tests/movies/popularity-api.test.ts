import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it} from 'vitest';
import {handleMoviePopularity, POPULARITY_POST_LIMIT, type PopularityDatabase, type PopularityStatement} from '../../server/movie-popularity';
import {onMoviePopularityScheduled} from '../../workers/movie-popularity-cleanup';
import {onRequest} from '../../functions/api/movie-popularity';

// D1 adapter backed by real SQLite: runs the production schema, trigger and transactions.
const open:DatabaseSync[]=[];
function database(){
 const sql=new DatabaseSync(':memory:');open.push(sql);
 sql.exec(readFileSync(new URL('../../docs/movie-popularity-schema.sql',import.meta.url),'utf8'));
 class Statement implements PopularityStatement {
  constructor(readonly query:string,readonly values:(string|number)[]=[]){ }
  bind(...values:(string|number)[]){return new Statement(this.query,values);}
  async all<T>(){return {results:sql.prepare(this.query).all(...this.values) as T[]};}
 }
 const db:PopularityDatabase={prepare:q=>new Statement(q),async batch(statements){
  sql.exec('BEGIN IMMEDIATE');try{const result=[];for(const s of statements){const stmt=s as Statement;result.push({results:sql.prepare(stmt.query).all(...stmt.values)});}sql.exec('COMMIT');return result;}
  catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 return {sql,env:{MOVIE_POPULARITY_DB:db,MOVIE_POPULARITY_ENABLED:'true',MOVIE_POPULARITY_SECRET:'test-only-secret-not-for-production-123456'}};
}
afterEach(()=>{for(const db of open.splice(0))db.close();});
const now=Date.UTC(2026,10,6,12);
const token=(n:number)=>n.toString(16).padStart(32,'0');
const get=()=>new Request('https://qcc.test/api/movie-popularity');
const post=(n=1,titleId='movie-7',extra:Record<string,string>={})=>new Request(get(),{method:'POST',headers:{origin:'https://qcc.test','content-type':'application/json','cf-connecting-ip':'192.0.2.1',...extra},body:JSON.stringify({titleId,token:token(n)})});
describe('movie popularity aggregate API',()=>{
 it('fails closed until all bindings exist',async()=>{
  for(const env of [{},{...database().env,MOVIE_POPULARITY_ENABLED:'false'},{...database().env,MOVIE_POPULARITY_SECRET:'short'}])expect((await handleMoviePopularity(get(),env,now)).status).toBe(503);
 });
 it('qualifies a single watch and never exposes counts',async()=>{
  const {env}=database();for(let n=1;n<=1;n++)expect((await handleMoviePopularity(post(n),env,now)).status).toBe(204);
  expect(await (await handleMoviePopularity(get(),env,now)).json()).toEqual({titleIds:['movie-7'],windowDays:null});
  await handleMoviePopularity(post(5),env,now);
  const result=await handleMoviePopularity(get(),env,now);expect(await result.json()).toEqual({titleIds:['movie-7'],windowDays:null});expect(result.headers.get('cache-control')).toBe('no-store');
 });
 it('atomically deduplicates concurrent attempts and isolates titles',async()=>{
  const {env,sql}=database();await Promise.all(Array.from({length:20},()=>handleMoviePopularity(post(),env,now)));
  await handleMoviePopularity(post(1,'movie-8'),env,now);
  expect(sql.prepare('SELECT title_id,views FROM movie_popularity_daily ORDER BY title_id').all()).toEqual([{title_id:'movie-7',views:1},{title_id:'movie-8',views:1}]);
  const stored=JSON.stringify(sql.prepare('SELECT * FROM movie_popularity_tokens').all());expect(stored).not.toContain(token(1));expect(stored).not.toContain('192.0.2.1');
 });
 it('rolls back dedup insertion when aggregate increment fails',async()=>{
  const {env,sql}=database();sql.exec("CREATE TRIGGER fail_count BEFORE INSERT ON movie_popularity_daily BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  expect((await handleMoviePopularity(post(),env,now)).status).toBe(503);
  expect(sql.prepare('SELECT COUNT(*) n FROM movie_popularity_tokens').get()?.n).toBe(0);
  sql.exec('DROP TRIGGER fail_count');expect((await handleMoviePopularity(post(),env,now)).status).toBe(204);
  expect(sql.prepare('SELECT views FROM movie_popularity_daily').get()?.views).toBe(1);
 });
 it('counts qualifying watches on different days',async()=>{
  const {env}=database();for(let day=0;day<7;day++)await handleMoviePopularity(post(),env,now+day*86400000);
  expect((await (await handleMoviePopularity(get(),env,now+6*86400000)).json()).titleIds).toEqual(['movie-7']);
 });
 it('keeps lifetime totals through scheduled expiry and GET performs no writes',async()=>{
  const {env,sql}=database();await handleMoviePopularity(post(),env,now);
  await onMoviePopularityScheduled({scheduledTime:now+8*86400000,cron:'* * * * *'},{MOVIE_POPULARITY_DB:env.MOVIE_POPULARITY_DB},{waitUntil(){}});
  for(const table of ['tokens','rate','daily'])expect(sql.prepare(`SELECT COUNT(*) n FROM movie_popularity_${table}`).get()?.n).toBe(0);
  sql.exec('PRAGMA query_only = ON');
  const result=await handleMoviePopularity(get(),env,now+365*86400000);
  expect(result.status).toBe(200);expect(await result.json()).toEqual({titleIds:['movie-7'],windowDays:null});
 });
 it('ranks qualifying buckets deterministically, at most 10 titles',async()=>{
  const {env,sql}=database();
  for(let n=1;n<=25;n++)sql.prepare('INSERT INTO movie_popularity_totals VALUES (?, ?)').run(`movie-${n}`,1);
  sql.prepare('UPDATE movie_popularity_totals SET views=2 WHERE title_id=?').run('movie-9');
  const data=await (await handleMoviePopularity(get(),env,now)).json();expect(data.titleIds).toHaveLength(10);expect(data.titleIds[0]).toBe('movie-9');expect(data.titleIds.slice(1)).toEqual([...data.titleIds.slice(1)].sort());
 });
 it('migrates only surviving counts and is safe to rerun',async()=>{
  const {env,sql}=database();sql.exec('DROP TRIGGER movie_popularity_count_insert; DROP TABLE movie_popularity_totals;');
  sql.exec("INSERT INTO movie_popularity_daily VALUES ('movie-7',1,2),('movie-7',2,3),('movie-8',2,1);");
  const migration=readFileSync(new URL('../../docs/movie-popularity-alltime-migration.sql',import.meta.url),'utf8');
  sql.exec(migration);sql.exec(migration);
  expect(sql.prepare('SELECT * FROM movie_popularity_totals ORDER BY title_id').all()).toEqual([{title_id:'movie-7',views:5},{title_id:'movie-8',views:1}]);
  await handleMoviePopularity(post(),env,now);sql.exec(migration);
  expect(sql.prepare("SELECT views FROM movie_popularity_totals WHERE title_id='movie-7'").get()?.views).toBe(6);
 });
 it('requires same-origin JSON POST, valid exact schema and a trusted platform IP',async()=>{
  const {env}=database();
  for(const headers of ([{origin:'https://evil.test'},{origin:''},{'content-type':'text/plain'},{'cf-connecting-ip':''}] as Record<string,string>[]))expect((await handleMoviePopularity(post(1,'movie-7',headers),env,now)).status).toBeGreaterThanOrEqual(400);
  for(const value of [{titleId:'tv-1',token:token(1)},{titleId:'movie-0',token:token(1)},{titleId:'movie-7',token:'a'},{titleId:'movie-7',token:'A'.repeat(32)},{titleId:'movie-7',token:token(1),history:[]}]){
   const req=post();expect((await handleMoviePopularity(new Request(req,{body:JSON.stringify(value)}),env,now)).status).toBe(400);
  }
  expect((await handleMoviePopularity(new Request(post(),{body:' '.repeat(1025)}),env,now)).status).toBe(413);
  expect((await handleMoviePopularity(new Request(get(),{method:'DELETE'}),env,now)).status).toBe(405);
 });
 it('throttles one shared address per hour without a device identifier',async()=>{
  const {env,sql}=database();
  for(let n=1;n<=POPULARITY_POST_LIMIT;n++)expect((await handleMoviePopularity(post(n),env,now)).status).toBe(204);
  expect((await handleMoviePopularity(post(POPULARITY_POST_LIMIT+1),env,now)).status).toBe(429);
  expect(sql.prepare('SELECT views FROM movie_popularity_daily WHERE title_id=?').get('movie-7')?.views).toBe(POPULARITY_POST_LIMIT);
  expect((await handleMoviePopularity(post(POPULARITY_POST_LIMIT+2,'movie-8',{'cf-connecting-ip':'192.0.2.2'}),env,now)).status).toBe(204);
  const rate=sql.prepare('SELECT * FROM movie_popularity_rate').all();expect(rate).toHaveLength(2);expect(JSON.stringify(rate)).not.toMatch(/192\.0\.2\.1|192\.0\.2\.2|movie-7|movie-8/);
  expect(rate.every(row=>Number(row.attempts)<=POPULARITY_POST_LIMIT+1)).toBe(true);
  expect((await handleMoviePopularity(post(POPULARITY_POST_LIMIT+1),env,now+3600000)).status).toBe(204);
 },20000);
 it('cleans with no traffic and while collection is disabled, and does not log failures',async()=>{
  const {env,sql}=database();const disabled={...env,MOVIE_POPULARITY_ENABLED:'false' as const};
  const day=Math.floor(now/86400000);
  sql.prepare('INSERT INTO movie_popularity_tokens VALUES (?, ?, ?, ?)').run('movie-7',day-8,'hashed-token',now);
  sql.prepare('INSERT INTO movie_popularity_rate VALUES (?, ?, ?)').run('hashed-bucket',4,now);
  sql.prepare('INSERT INTO movie_popularity_daily VALUES (?, ?, ?)').run('movie-8',day+8,6);
  expect((await handleMoviePopularity(get(),disabled,now+8*86400000)).status).toBe(503);
  expect(sql.prepare('SELECT COUNT(*) n FROM movie_popularity_tokens').get()?.n).toBe(1);
  expect(sql.prepare('SELECT views FROM movie_popularity_daily WHERE title_id=?').get('movie-7')?.views).toBe(1);
  const empty=database();await onMoviePopularityScheduled({scheduledTime:now,cron:'15 * * * *'},{MOVIE_POPULARITY_DB:empty.env.MOVIE_POPULARITY_DB,MOVIE_POPULARITY_ENABLED:'false'},{waitUntil(){}});
  expect(empty.sql.prepare('SELECT COUNT(*) n FROM movie_popularity_daily').get()?.n).toBe(0);
  await onMoviePopularityScheduled({scheduledTime:now+8*86400000,cron:'15 * * * *'},{MOVIE_POPULARITY_DB:env.MOVIE_POPULARITY_DB},{waitUntil(){}});
  expect(sql.prepare('SELECT COUNT(*) n FROM movie_popularity_tokens').get()?.n).toBe(0);
  expect(sql.prepare('SELECT COUNT(*) n FROM movie_popularity_rate').get()?.n).toBe(0);
  expect(sql.prepare('SELECT title_id, day, views FROM movie_popularity_daily').all()).toEqual([{title_id:'movie-8',day:day+8,views:6}]);
  await onMoviePopularityScheduled({scheduledTime:now,cron:'15 * * * *'},{},{waitUntil(){}});
  sql.exec('DROP TABLE movie_popularity_tokens');
  await expect(onMoviePopularityScheduled({scheduledTime:now,cron:'15 * * * *'},env,{waitUntil(){}})).rejects.toThrow(/^movie_popularity_cleanup_failed$/);
 });
 it('Pages adapter fails closed and datastore errors do not disclose details',async()=>{
  expect((await onRequest({request:get(),env:{}})).status).toBe(503);
  const {env,sql}=database();sql.exec('DROP TABLE movie_popularity_totals');const response=await handleMoviePopularity(get(),env,now);expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'popularity_unavailable'});
 });
});
