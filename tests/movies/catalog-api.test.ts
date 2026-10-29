import {describe,it,expect,vi} from "vitest";
import {handleMoviesCatalog} from "../../netlify/functions/movies-search.mts";
import {parseCatalog} from "../../src/movies/model";

const request=(query="")=>new Request(`https://qcc.test/api/movies${query}`);
const tmdb=(results:unknown[]=[],extra={})=>new Response(JSON.stringify({results,total_pages:3,total_results:71,...extra}),{status:200,headers:{"content-type":"application/json"}});

describe("full catalog metadata endpoint",()=>{
 it("requires a server-side token and never calls upstream without it",async()=>{
  const fetcher=vi.fn();
  const result=await handleMoviesCatalog(request("?q=arrival"),"",fetcher);
  expect(result.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
 });
 it("searches the entire TMDB movie and TV index without forwarding a search to FrameXTV",async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>String(url).includes("api.themoviedb.org")
   ?tmdb([{id:99,media_type:"tv",name:"Example",first_air_date:"2024-05-01",genre_ids:[18],poster_path:"/example.jpg",overview:"Series",vote_count:4,vote_average:8.1}])
   :new Response("",{status:500}));
  const result=await handleMoviesCatalog(request("?q=space%20opera&type=all&page=2"),"secret",fetcher);
  const payload=await result.json();
  expect(result.status).toBe(200);expect(payload).toMatchObject({page:2,totalPages:3,totalResults:71});
  expect(payload.titles[0]).toMatchObject({id:"tv-99",kind:"tv",name:"Example",genres:["Drama"],year:2024});
  const [url,init]=fetcher.mock.calls[0];
  expect(String(url)).toContain("/search/multi?query=space%20opera");
  expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
  expect(fetcher.mock.calls.every(([called])=>String(called).startsWith("https://api.themoviedb.org/"))).toBe(true);
  expect(result.headers.get("cache-control")).toBe("no-store");
 });
 it("returns selected season episodes on demand, without calling a playback host",async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>String(url).includes("/season/2?")
   ?new Response(JSON.stringify({episodes:[{episode_number:1,name:"First",overview:"Episode"}]}))
   :new Response(JSON.stringify({id:41,name:"Series",first_air_date:"2020-01-01",genres:[{id:18,name:"Drama"}],poster_path:"/series.jpg",seasons:[{season_number:1,name:"Season 1"},{season_number:2,name:"Season 2"}]})));
  const result=await handleMoviesCatalog(request("?id=tv-41&season=2"),"secret",fetcher);
  const payload=await result.json();
  expect(payload.title.seasons).toEqual([{number:1,name:"Season 1",episodes:[]},{number:2,name:"Season 2",episodes:[{number:1,name:"First",overview:"Episode"}]}]);
  expect(fetcher.mock.calls.map(([url])=>String(url))).toEqual([
   "https://api.themoviedb.org/3/tv/41?language=en-US",
   "https://api.themoviedb.org/3/tv/41/season/2?language=en-US",
  ]);
 });
 it("keeps searchable titles that have no TMDB poster or release date",async()=>{
  const fetcher=async()=>tmdb([{id:7,media_type:"movie",title:"Undated Film",genre_ids:[],overview:"Metadata exists without artwork.",poster_path:null,release_date:""}]);
  const result=await handleMoviesCatalog(request("?q=undated"),"secret",fetcher);
  const payload=await result.json();
  const catalog=parseCatalog({titles:payload.titles,source:"tmdb"});
  expect(catalog.titles[0]).toMatchObject({name:"Undated Film",year:0,poster:"movies/no-artwork.svg"});
 });
 it("bounds user input and translates upstream outages to generic errors",async()=>{
  expect((await handleMoviesCatalog(request("?q=a"),"secret")).status).toBe(400);
  expect((await handleMoviesCatalog(request("?q="+encodeURIComponent("a".repeat(101))),"secret")).status).toBe(400);
  const result=await handleMoviesCatalog(request("?q=hello"),"secret",async()=>new Response("",{status:429}));
  expect(result.status).toBe(502);expect(await result.json()).toEqual({error:"metadata_unavailable"});
 });
});

it('skips malformed search, season and episode entries',async()=>{
 const search=await handleMoviesCatalog(request('?q=example'), 'token', async()=>tmdb([null,42,'bad',{id:1,media_type:'movie',title:'Valid'}]));
 expect((await search.json()).titles.map((t:{id:string})=>t.id)).toEqual(['movie-1']);
 const detail=await handleMoviesCatalog(request('?id=tv-41'), 'token', async(url)=>new Response(JSON.stringify(String(url).includes('/season/')
  ?{episodes:[null,3,{episode_number:1,name:'First'}]}
  :{id:41,name:'Series',seasons:[null,'bad',{season_number:1,name:'One'}]})));
 expect((await detail.json()).title.seasons).toEqual([{number:1,name:'One',episodes:[{number:1,name:'First',overview:''}]}]);
});
it('returns a controlled error for malformed detail metadata',async()=>{
 const result=await handleMoviesCatalog(request('?id=tv-41'),'token',async()=>new Response('null'));
 expect(result.status).toBe(502);
});
