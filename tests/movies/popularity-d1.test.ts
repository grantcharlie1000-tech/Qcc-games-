import {afterAll, describe, expect, it} from 'vitest';
import {MoviePopularity, parsePopularIds} from '../../src/movies/popularity';
import {POPULARITY_D1_COMPATIBILITY_DATE, startIsolatedPopularity} from './popularity-d1';
import {startLocalCleanup} from '../../scripts/movie-popularity-cleanup-local.mjs';

const preview=await startIsolatedPopularity();
afterAll(()=>preview.dispose());
const now=Date.UTC(2026,10,6,12);
const serverDay=Math.floor(Date.now()/86400000);
function memory(){const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
function contributor(n:number,address=`192.0.2.${n}`){
 const fetcher=async(_url:RequestInfo|URL,init?:RequestInit)=>{
  const headers=new Headers(init?.headers);
  headers.set('origin','https://qcc.test');
  headers.set('content-type','application/json');
  headers.set('cf-connecting-ip',address);
  return preview.call(new Request('https://qcc.test/api/movie-popularity',{...init,headers})) as unknown as Response;
 };
 const client=new MoviePopularity(()=>memory(),fetcher,()=>now,()=>n.toString(16).padStart(32,'0'));
 client.available=true;return client;
}
async function play(client:MoviePopularity,id='movie-157336'){for(let i=0;i<=60;i++)await client.sample(id,i,i*1000,true);await new Promise(resolve=>setTimeout(resolve,0));}
const counts=async()=>preview.call(new Request('http://pop.test/__isolated_preview/counts')).then(response=>response.json()) as Promise<{tokens:{n:number}[];daily:{title_id:string;views:number;day:number}[];rate:{bucket_hash:string;attempts:number}[]}>;
const ranking=async()=>parsePopularIds(await (await preview.call(new Request('https://qcc.test/api/movie-popularity'))).json());

describe('isolated local D1 preview',()=>{
 it('cleans an idle disabled database, then ranks real playback and rolls back a failed batch',async()=>{
  expect((await preview.call(new Request('http://pop.test/__isolated_preview/scheduled'))).status).toBe(200);
  expect(await counts()).toEqual({tokens:[{n:0}],daily:[],rate:[]});
  await preview.call(new Request('http://pop.test/__isolated_preview/sql',{method:'POST',body:`INSERT INTO movie_popularity_tokens (title_id, day, token_hash, expires_at) VALUES ('movie-9', 1, 'expired-hash', 1); INSERT INTO movie_popularity_daily (title_id, day, views) VALUES ('movie-9', 1, 8);`}));
  expect((await preview.call(new Request('http://pop.test/__isolated_preview/disabled'))).status).toBe(503);
  expect((await counts()).daily.some(row=>row.title_id==='movie-9')).toBe(true);
  expect((await preview.call(new Request('http://pop.test/__isolated_preview/scheduled'))).status).toBe(200);
  expect((await counts()).daily.some(row=>row.title_id==='movie-9')).toBe(false);
  expect((await counts()).tokens[0].n).toBe(0);

  for(let n=1;n<=4;n++)await play(contributor(n));
  expect(await ranking()).toEqual([]);
  await play(contributor(5));
  await play(contributor(5));
  expect(await ranking()).toEqual(['movie-157336']);
  const ranked=await counts();
  expect(ranked.daily.find(row=>row.title_id==='movie-157336')).toEqual({title_id:'movie-157336',views:5,day:serverDay});
  expect(JSON.stringify(ranked.rate)+JSON.stringify(ranked.tokens)).not.toMatch(/192\.0\.2|00000000000000000000000000000005/);

  const duplicate=new Request('https://qcc.test/api/movie-popularity',{method:'POST',headers:{origin:'https://qcc.test','content-type':'application/json','cf-connecting-ip':'192.0.2.40'},body:JSON.stringify({titleId:'movie-42',token:'ab'.repeat(16)})});
  await Promise.all(Array.from({length:8},()=>preview.call(duplicate.clone())));
  expect((await counts()).daily.find(row=>row.title_id==='movie-42')?.views).toBe(1);

  expect((await preview.call(new Request('http://pop.test/__isolated_preview/batch-rollback'))).status).toBe(500);
  expect((await counts()).daily.some(row=>row.title_id==='movie-2'||row.title_id==='movie-3')).toBe(false);

  await preview.call(new Request('http://pop.test/__isolated_preview/sql',{method:'POST',body:`CREATE TRIGGER fail_count BEFORE INSERT ON movie_popularity_daily BEGIN SELECT RAISE(ABORT, 'test failure'); END;`}));
  const failed=await preview.call(new Request('https://qcc.test/api/movie-popularity',{method:'POST',headers:{origin:'https://qcc.test','content-type':'application/json','cf-connecting-ip':'192.0.2.41'},body:JSON.stringify({titleId:'movie-11',token:'cd'.repeat(16)})}));
  expect(failed.status).toBe(503);
  expect((await counts()).daily.some(row=>row.title_id==='movie-11')).toBe(false);
  expect((await counts()).tokens[0].n).toBe(6);
  await preview.call(new Request('http://pop.test/__isolated_preview/sql',{method:'POST',body:'DROP TRIGGER fail_count;'}));
 });
 it('runs scheduled cleanup with no collection flag and no popularity route',async()=>{
  expect(POPULARITY_D1_COMPATIBILITY_DATE).toBe('2026-11-04');
  const preview=await startLocalCleanup();
  try{
   expect((await preview.call(new Request('http://cleanup.local/__local/schema',{method:'POST'}))).ok).toBe(true);
   const at=Date.UTC(2026,10,6,12),day=Math.floor(at/86400000);
   expect((await preview.call(new Request('http://cleanup.local/__local/sql',{method:'POST',body:`INSERT INTO movie_popularity_tokens (title_id, day, token_hash, expires_at) VALUES ('movie-9', ${day-8}, 'expired-hash', ${at})`}))).ok).toBe(true);
   expect((await preview.call(new Request('http://cleanup.local/api/movie-popularity'))).status).toBe(404);
   expect((await preview.call(new Request(`http://cleanup.local/cdn-cgi/local/scheduled?cron=${encodeURIComponent('15 * * * *')}&time=${at+8*86400000}`))).status).toBe(200);
   expect(await (await preview.call(new Request('http://cleanup.local/__local/counts'))).json()).toEqual({tokens:0,daily:0,rate:0});
  }finally{await preview.dispose();}
 });
});
