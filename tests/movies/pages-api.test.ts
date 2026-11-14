import {afterEach,describe,expect,it,vi} from "vitest";
import {onRequest} from "../../functions/api/movies";

const env={TMDB_READ_TOKEN:crypto.randomUUID()};
const request=(query="",method="GET")=>new Request(`https://qcc.test/api/movies${query}`,{method});
const movie={id:99,media_type:"movie",title:"Example Film",release_date:"2024-05-01",genre_ids:[28],poster_path:"/film.jpg",overview:"Film overview",vote_count:4,vote_average:8.1};
const show={id:41,name:"Example Series",first_air_date:"2020-01-01",genres:[{id:18,name:"Drama"}],poster_path:"/series.jpg",seasons:[{season_number:1,name:"Season 1"},{season_number:2,name:"Season 2"}]};
const listing=(results:unknown[]=[])=>Response.json({results,total_pages:3,total_results:71});
const railResponse=(input:RequestInfo|URL)=>listing(/\/tv[/?]/.test(String(input))
 ?[{id:41,name:"Example Series",genre_ids:[18]}]:[movie]);
const expectHeaders=(result:Response,cdn=false)=>expect(Object.fromEntries(result.headers)).toEqual({
 "content-type":"application/json; charset=utf-8",
 "cache-control":"no-store",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 ...(cdn?{"netlify-cdn-cache-control":"public, durable, s-maxage=900, stale-while-revalidate=3600"}:{}),
});

afterEach(()=>vi.unstubAllGlobals());

describe("Pages /api/movies",()=>{
 it("searches TMDB using the Pages secret and preserves the response and private cache headers",async()=>{
  const fetcher=vi.fn(async()=>listing([movie]));
  vi.stubGlobal("fetch",fetcher);
  const result=await onRequest({request:request("?q=space%20opera&type=all&page=2"),env});
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({titles:[{
   id:"movie-99",kind:"movie",name:"Example Film",year:2024,genres:["Action"],overview:"Film overview",
   poster:"https://image.tmdb.org/t/p/w500/film.jpg",rating:8.1,seasons:[],
  }],page:2,totalPages:3,totalResults:71});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toEqual([
   "https://api.themoviedb.org/3/search/multi?query=space%20opera&include_adult=false&language=en-US&page=2",
   {headers:{Authorization:`Bearer ${env.TMDB_READ_TOKEN}`,Accept:"application/json"},redirect:"manual",signal:expect.any(AbortSignal)},
  ]);
  expectHeaders(result);
 });

 it.each([["home",9],["movie",10],["tv",9]] as const)("returns complete %s rails with the existing CDN header",async(name,count)=>{
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>railResponse(input));
  vi.stubGlobal("fetch",fetcher);
  const result=await onRequest({request:request(`?rails=${name}`),env});
  const payload=await result.json();
  expect(result.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(count);
  expect(payload.rails).toHaveLength(count);
  expect(payload.rails[0]).toMatchObject({id:"trending",titles:[{id:name==="tv"?"tv-41":"movie-99",kind:name==="tv"?"tv":"movie"}]});
  expect(String(fetcher.mock.calls[0][0])).toBe(`https://api.themoviedb.org/3/trending/${name==="home"?"all":name}/week?language=en-US&page=1`);
  expectHeaders(result,true);
 });

 it("omits failed rails and does not cache a partial answer",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>String(input).includes("/movie/popular?")
   ?new Response(null,{status:429}):railResponse(input)));
  const result=await onRequest({request:request("?rails=home"),env});
  expect(result.status).toBe(200);
  expect((await result.json()).rails.map((rail:{id:string})=>rail.id)).toEqual(["trending","christmas","popular-tv","top-movies","action","comedy","scifi","thriller"]);
  expectHeaders(result);
 });

 it("returns the existing error when every rail fails",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:401})));
  const result=await onRequest({request:request("?rails=tv"),env});
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({error:"metadata_unavailable"});
  expectHeaders(result);
 });

 it.each([["?id=tv-41&season=2",2],["?id=tv-41",1]] as const)("loads episodes for %s with the existing detail shape",async(query,selected)=>{
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes(`/season/${selected}?`)
   ?Response.json({episodes:[{episode_number:1,name:"First",overview:"Episode",runtime:44,still_path:"/still.jpg",air_date:"2020-02-29",vote_average:8.25,vote_count:12}]}):Response.json(show));
  vi.stubGlobal("fetch",fetcher);
  const result=await onRequest({request:request(query),env});
  expect(result.status).toBe(200);
  const payload=await result.json();
  expect(payload.title).toMatchObject({id:"tv-41",kind:"tv",name:"Example Series",year:2020,genres:["Drama"],cast:[],related:[]});
  expect(payload.title.seasons.find((season:{number:number})=>season.number===selected).episodes).toEqual([
   {number:1,name:"First",overview:"Episode",runtime:44,still:"https://image.tmdb.org/t/p/w300/still.jpg",airDate:"2020-02-29",rating:8.25},
  ]);
  expect(payload.title.seasons.find((season:{number:number})=>season.number!==selected).episodes).toEqual([]);
  expect(fetcher.mock.calls.map(([input])=>String(input))).toEqual([
   "https://api.themoviedb.org/3/tv/41?language=en-US&append_to_response=credits,recommendations",
   `https://api.themoviedb.org/3/tv/41/season/${selected}?language=en-US`,
  ]);
  expectHeaders(result,true);
 });

 it.each([undefined,""])("fails gracefully without a configured Pages secret (%s)",async(token)=>{
  const fetcher=vi.fn();
  vi.stubGlobal("fetch",fetcher);
  const result=await onRequest({request:request("?q=arrival"),env:{TMDB_READ_TOKEN:token}});
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({error:"catalog_not_configured",message:"The full catalog is temporarily unavailable."});
  expect(fetcher).not.toHaveBeenCalled();
  expectHeaders(result);
 });

 it("rejects non-GET requests through the shared handler even without a secret",async()=>{
  const fetcher=vi.fn();
  vi.stubGlobal("fetch",fetcher);
  const result=await onRequest({request:request("","POST"),env:{}});
  expect(result.status).toBe(405);
  expect(await result.json()).toEqual({error:"method_not_allowed"});
  expect(fetcher).not.toHaveBeenCalled();
  expectHeaders(result);
 });

 it.each([
  ["?q=a","query_too_short"],
  [`?q=${"a".repeat(101)}`,"query_too_long"],
  ["?type=person","invalid_type"],
  ["?page=501","invalid_page"],
  ["?id=tv-invalid","invalid_title"],
  ["?id=tv-41&season=0","invalid_season"],
  ["?rails=constructor","invalid_rails"],
  ["?type=movie&genre=constructor","invalid_genre"],
 ])("preserves validation for %s",async(query,error)=>{
  const fetcher=vi.fn();
  vi.stubGlobal("fetch",fetcher);
  const result=await onRequest({request:request(query),env});
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({error});
  expect(fetcher).not.toHaveBeenCalled();
  expectHeaders(result);
 });

 it.each([[401,502,"metadata_unavailable"],[429,502,"metadata_unavailable"],[404,404,"title_unavailable"]] as const)("translates upstream %s without exposing its response",async(upstream,status,error)=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("Private upstream diagnostic",{status:upstream})));
  const result=await onRequest({request:request("?q=arrival"),env});
  expect(result.status).toBe(status);
  expect(await result.json()).toEqual({error});
  expectHeaders(result);
 });

 it("handles a failed upstream connection without exposing diagnostics",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>{throw new TypeError("Private upstream diagnostic");}));
  const result=await onRequest({request:request("?q=arrival"),env});
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({error:"metadata_unavailable"});
  expectHeaders(result);
 });

 it("rejects malformed upstream metadata without caching it",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({page:1})));
  const result=await onRequest({request:request("?type=movie"),env});
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({error:"invalid_metadata"});
  expectHeaders(result);
 });

 it.each([["?id=tv-41&season=2",502],["?id=tv-41",200]] as const)("preserves the uncached season-failure fallback for %s",async(query,status)=>{
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>String(input).includes("/season/")
   ?new Response(null,{status:503}):Response.json(show)));
  const result=await onRequest({request:request(query),env});
  expect(result.status).toBe(status);
  if(status===502)expect(await result.json()).toEqual({error:"metadata_unavailable"});
  else expect((await result.json()).title.seasons).toEqual([{number:1,name:"Season 1",episodes:[]},{number:2,name:"Season 2",episodes:[]}]);
  expectHeaders(result);
 });
});
