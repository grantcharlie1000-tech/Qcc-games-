import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {describe,expect,it} from 'vitest';
import {FAILURE_POST_LIMIT,handleMovieFailureReport} from '../../server/movie-failure-report';
import {cleanupMoviePopularity,type PopularityDatabase,type PopularityStatement} from '../../server/movie-popularity';

const origin='https://nceastudy.pages.dev';
const secret='12345678901234567890123456789012';
const event={reason:'frame-load-timeout',stage:'connecting',online:true};
function localDb(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync('docs/movie-failure-schema.sql','utf8'));
 type Statement={query:string;values:(string|number)[];bind(...args:(string|number)[]):Statement;all<T=Record<string,unknown>>():Promise<{results:T[]}>};
 const statement=(query:string,values:(string|number)[]=[]):Statement=>({
  query,values,
  bind(...args:(string|number)[]){return statement(query,args);},
  async all<T=Record<string,unknown>>(){return {results:sql.prepare(query).all(...values) as T[]};},
 });
 const db:PopularityDatabase={
  prepare(query:string){return statement(query);},
  async batch(statements:PopularityStatement[]){
   sql.exec('BEGIN IMMEDIATE');
   try{
    const results=statements.map(s=>{const q=s as Statement;return sql.prepare(q.query).all(...q.values);});
    sql.exec('COMMIT');return results;
   }catch(error){sql.exec('ROLLBACK');throw error;}
  },
 };
 return {sql,db};
}
function post(body:unknown=event,headers:Record<string,string>={}):Request{
 return new Request(origin+'/api/movie-failure-report',{
  method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.5',...headers},
  body:typeof body==='string'?body:JSON.stringify(body),
 });
}
const env=(db:ReturnType<typeof localDb>['db'])=>({MOVIE_POPULARITY_DB:db,MOVIE_POPULARITY_SECRET:secret});

describe('automatic movie playback failure telemetry',()=>{
 it('stores a server timestamp and minimal enum fields in an existing D1 database',async()=>{
  const {sql,db}=localDb();
  try{
   const at=Date.UTC(2026,10,17,1,2,3);
   const response=await handleMovieFailureReport(post(),env(db),at);
   expect(response.status).toBe(204);
   expect(response.headers.get('cache-control')).toBe('no-store');
   expect(sql.prepare('SELECT received_at,reason,stage,online FROM movie_playback_failures').all()).toEqual([
    {received_at:at,reason:'frame-load-timeout',stage:'connecting',online:1},
   ]);
   const columns=(sql.prepare('PRAGMA table_info(movie_playback_failures)').all() as {name:string}[]).map(col=>col.name);
   expect(columns).toEqual(['id','received_at','reason','stage','online']);
   const rate=JSON.stringify(sql.prepare('SELECT * FROM movie_playback_failure_rate').all());
   expect(rate).not.toContain('192.0.2.5');
  }finally{sql.close();}
 });

 it.each([
  'frame-load-timeout','frame-ready-timeout','frame-error','frame-csp-blocked',
  'no-playback-after-ready','local-media-error','archive-frame-error',
 ] as const)('accepts the specific failure reason %s',async reason=>{
  const {sql,db}=localDb();
  try{
   const response=await handleMovieFailureReport(post({reason,stage:'loaded',online:false}),env(db));
   expect(response.status).toBe(204);
   expect(sql.prepare('SELECT reason,stage,online FROM movie_playback_failures').get()).toEqual({reason,stage:'loaded',online:0});
  }finally{sql.close();}
 });

 it('needs no email service, diagnostic access code or user account',async()=>{
  const {sql,db}=localDb();
  try{
   const result=await handleMovieFailureReport(post(),env(db));
   expect(result.status).toBe(204);
   expect(sql.prepare('SELECT count(*) AS n FROM movie_playback_failures').get()).toEqual({n:1});
  }finally{sql.close();}
 });

 it('rejects non-POST, cross-origin and non-JSON requests',async()=>{
  const {sql,db}=localDb();
  try{
   const replies=await Promise.all([
    handleMovieFailureReport(new Request(origin+'/api/movie-failure-report'),env(db)),
    handleMovieFailureReport(post(event,{Origin:'https://another.example'}),env(db)),
    handleMovieFailureReport(post(event,{'Content-Type':'text/plain'}),env(db)),
    handleMovieFailureReport(post(event,{'Sec-Fetch-Site':'cross-site'}),env(db)),
   ]);
   expect(replies.map(r=>r.status)).toEqual([405,403,415,403]);
   expect(sql.prepare('SELECT count(*) AS n FROM movie_playback_failures').get()).toEqual({n:0});
  }finally{sql.close();}
 });

 it('rejects tracking fields, invalid enums, and oversized payloads',async()=>{
  const {sql,db}=localDb();
  try{
   const replies=await Promise.all([
    handleMovieFailureReport(post({...event,title:'Private film'}),env(db)),
    handleMovieFailureReport(post({...event,accountId:'do-not-store'}),env(db)),
    handleMovieFailureReport(post({...event,reason:'dns_is_blocked'}),env(db)),
    handleMovieFailureReport(post({...event,stage:'foobar'}),env(db)),
    handleMovieFailureReport(post('x'.repeat(513)),env(db)),
   ]);
   expect(replies.map(r=>r.status)).toEqual([400,400,400,400,413]);
   expect(sql.prepare('SELECT count(*) AS n FROM movie_playback_failures').get()).toEqual({n:0});
  }finally{sql.close();}
 });

 it('requires the trusted Cloudflare address and rate-limit secret',async()=>{
  const {sql,db}=localDb();
  try{
   expect((await handleMovieFailureReport(post(event,{'CF-Connecting-IP':''}),env(db))).status).toBe(503);
   expect((await handleMovieFailureReport(post(),{MOVIE_POPULARITY_DB:db})).status).toBe(503);
   expect((await handleMovieFailureReport(post(),{})).status).toBe(503);
  }finally{sql.close();}
 });

 it('throttles abusive clients without inserting additional event rows',async()=>{
  const {sql,db}=localDb();
  try{
   expect((await handleMovieFailureReport(post(),env(db))).status).toBe(204);
   expect(sql.prepare('SELECT count(*) AS n FROM movie_playback_failure_rate').get()).toEqual({n:1});
   sql.prepare('UPDATE movie_playback_failure_rate SET attempts=?').run(FAILURE_POST_LIMIT);
   expect((await handleMovieFailureReport(post(),env(db))).status).toBe(429);
   expect(sql.prepare('SELECT count(*) AS n FROM movie_playback_failures').get()).toEqual({n:1});
  }finally{sql.close();}
 });


 it('expires rows after 30 days and short-lived abuse buckets using existing cleanup',async()=>{
  const {sql,db}=localDb();
  try{
   sql.exec(readFileSync('docs/movie-popularity-schema.sql','utf8'));
   const at=Date.UTC(2026,10,17);
   const expired=at-31*86400000, recent=at-2*86400000;
   sql.prepare("INSERT INTO movie_playback_failures(received_at,reason,stage,online) VALUES(?,?,?,?)").run(expired,'frame-error','connecting',1);
   sql.prepare("INSERT INTO movie_playback_failures(received_at,reason,stage,online) VALUES(?,?,?,?)").run(recent,'frame-error','connecting',1);
   sql.prepare("INSERT INTO movie_playback_failure_rate(bucket_hash,attempts,expires_at) VALUES(?,?,?)").run('old',1,at-100);
   sql.prepare("INSERT INTO movie_playback_failure_rate(bucket_hash,attempts,expires_at) VALUES(?,?,?)").run('new',1,at+100);
   await cleanupMoviePopularity(db,at);
   expect(sql.prepare('SELECT received_at FROM movie_playback_failures').all()).toEqual([{received_at:recent}]);
   expect(sql.prepare('SELECT bucket_hash FROM movie_playback_failure_rate').all()).toEqual([{bucket_hash:'new'}]);
  }finally{sql.close();}
 });

 it('fails closed when the telemetry table has not been migrated',async()=>{
  const {sql,db}=localDb();
  try{
   sql.exec('DROP TABLE movie_playback_failures');
   expect((await handleMovieFailureReport(post(),env(db))).status).toBe(503);
  }finally{sql.close();}
 });
});
