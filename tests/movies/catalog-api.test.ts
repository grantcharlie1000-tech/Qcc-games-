import {describe,it,expect,vi} from "vitest";
import {handleMoviesCatalog} from "../../netlify/functions/movies-search.mts";
import {parseCatalog,parseRails,parseTitle} from "../../src/movies/model";

const request=(query="")=>new Request(`https://qcc.test/api/movies${query}`);
const tmdb=(results:unknown[]=[],extra={})=>new Response(JSON.stringify({results,total_pages:3,total_results:71,...extra}),{status:200,headers:{"content-type":"application/json"}});
// Movie items for movie paths and TV items for tv paths. Only trending/all carries media_type, so the other rails must force their kind.
const railResponse=(url:string)=>{
 const tv=/(^|\/)tv(\/|\?)/.test(url),all=url.includes("trending/all/");
 const item=(id:number)=>tv?{id,name:`Show ${id}`,genre_ids:[18],poster_path:"/show.jpg",overview:"Show overview",vote_count:1,vote_average:7}:{id,title:`Movie ${id}`,genre_ids:[28],poster_path:"/movie.jpg",overview:"Movie overview",vote_count:1,vote_average:6};
 return tmdb(Array.from({length:all?25:2},(_,i)=>all?{...item(i+1),media_type:"movie"}:item(i+1)));
};

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
   "https://api.themoviedb.org/3/tv/41?language=en-US&append_to_response=credits,recommendations",
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
 it("rails fan out and omit a failing rail",async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>String(url).includes("/movie/popular?")?new Response("",{status:500}):railResponse(String(url)));
  const result=await handleMoviesCatalog(request("?rails=home"),"secret",fetcher);
  const payload=await result.json();
  expect(result.status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(8);
  expect(payload.rails.map((rail:{id:string})=>rail.id)).toEqual(["trending","popular-tv","top-movies","action","comedy","scifi","thriller"]);
  expect(payload.rails[0].titles).toHaveLength(20);
  expect(payload.rails.find((rail:{id:string})=>rail.id==="popular-tv").titles[0]).toMatchObject({id:"tv-1",kind:"tv",name:"Show 1"});
  expect(payload.rails.find((rail:{id:string})=>rail.id==="action").titles[0]).toMatchObject({id:"movie-1",kind:"movie",name:"Movie 1"});
  expect(parseRails(payload)).toHaveLength(7);
 });
 it("rails fail with 502 only when every rail fails",async()=>{
  const down=await handleMoviesCatalog(request("?rails=movie"),"secret",async()=>new Response("",{status:429}));
  expect(down.status).toBe(502);expect(await down.json()).toEqual({error:"metadata_unavailable"});
  expect(down.headers.get("cache-control")).toBe("no-store");
  const oneLeft=await handleMoviesCatalog(request("?rails=movie"),"secret",async(url:RequestInfo|URL)=>String(url).includes("/movie/now_playing?")?railResponse(String(url)):new Response("",{status:503}));
  const payload=await oneLeft.json();
  expect(oneLeft.status).toBe(200);
  expect(payload.rails.map((rail:{id:string})=>rail.id)).toEqual(["now-playing"]);
  expect(payload.rails[0].title).toBe("In cinemas");
 });
 it("leaves out a rail that maps to no titles without failing the response",async()=>{
  const result=await handleMoviesCatalog(request("?rails=tv"),"secret",async(url:RequestInfo|URL)=>String(url).includes("/tv/on_the_air?")?tmdb([]):railResponse(String(url)));
  const payload=await result.json();
  expect(result.status).toBe(200);
  expect(payload.rails.map((rail:{id:string})=>rail.id)).toEqual(["trending","popular","top","drama","comedy","crime","scifi","mystery"]);
 });
 it("rejects unknown rails and genres with 400",async()=>{
  const fetcher=vi.fn(async()=>tmdb([]));
  for(const query of ["?rails=all","?rails=","?rails=constructor","?rails=home,movie"]){
   const result=await handleMoviesCatalog(request(query),"secret",fetcher);
   expect(result.status).toBe(400);expect(await result.json()).toEqual({error:"invalid_rails"});
  }
  for(const query of ["?type=tv&genre=Nope","?type=movie&genre=constructor","?type=movie&genre=drama","?type=movie&genre=Drama&q=arrival"]){
   const result=await handleMoviesCatalog(request(query),"secret",fetcher);
   expect(result.status).toBe(400);expect(await result.json()).toEqual({error:"invalid_genre"});
  }
  for(const query of ["?genre=Drama","?type=all&genre=Drama"]){
   const result=await handleMoviesCatalog(request(query),"secret",fetcher);
   expect(result.status).toBe(400);expect(await result.json()).toEqual({error:"invalid_type"});
  }
  const badPage=await handleMoviesCatalog(request("?type=movie&genre=Drama&page=0"),"secret",fetcher);
  expect(badPage.status).toBe(400);expect(await badPage.json()).toEqual({error:"invalid_page"});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("genre discovery maps the name to the TMDB id",async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>String(url).includes("/discover/tv?")
   ?tmdb([{id:3,name:"Genre Show",first_air_date:"2021-03-04",genre_ids:[10765],poster_path:"/genre.jpg",overview:"Genre overview",vote_count:1,vote_average:5}],{total_pages:9,total_results:161})
   :new Response("",{status:500}));
  const result=await handleMoviesCatalog(request("?type=tv&genre=Sci-Fi%20%26%20Fantasy&page=2"),"secret",fetcher);
  const payload=await result.json();
  expect(result.status).toBe(200);
  expect(String(fetcher.mock.calls[0][0])).toBe("https://api.themoviedb.org/3/discover/tv?with_genres=10765&sort_by=popularity.desc&include_adult=false&language=en-US&page=2");
  expect(payload).toMatchObject({page:2,totalPages:9,totalResults:161});
  expect(payload.titles[0]).toMatchObject({id:"tv-3",kind:"tv",name:"Genre Show",year:2021,genres:["Sci-Fi & Fantasy"]});
  expect(result.headers.get("cache-control")).toBe("no-store");
 });
 it("details carry cast and related titles",async()=>{
  const fetcher=vi.fn(async(_url:RequestInfo|URL)=>new Response(JSON.stringify({id:12,name:"Parent",first_air_date:"2010-07-16",genres:[{id:18,name:"Drama"}],poster_path:"/parent.jpg",overview:"Parent overview",vote_count:9,vote_average:8.2,
   credits:{cast:[{name:"Ada Actor",character:"Hero",profile_path:"/ada.jpg"},{name:"Bo Bit",character:"",profile_path:null},{name:"",character:"Dropped"},{name:"Cy Crowd",character:"Background"}]},
   recommendations:{results:[{id:55,name:"Sibling Show",first_air_date:"2011-01-01",genre_ids:[18],poster_path:"/sibling.jpg",overview:"Next",vote_count:1,vote_average:6}]}})));
  const result=await handleMoviesCatalog(request("?id=tv-12"),"secret",fetcher);
  const payload=await result.json();
  expect(String(fetcher.mock.calls[0][0])).toBe("https://api.themoviedb.org/3/tv/12?language=en-US&append_to_response=credits,recommendations");
  expect(payload.title.cast).toEqual([{name:"Ada Actor",character:"Hero",photo:"https://image.tmdb.org/t/p/w185/ada.jpg"},{name:"Bo Bit",character:""},{name:"Cy Crowd",character:"Background"}]);
  expect(payload.title.related).toMatchObject([{id:"tv-55",kind:"tv",name:"Sibling Show",year:2011}]);
  expect(parseTitle(payload.title)).toMatchObject({cast:[{photo:"https://image.tmdb.org/t/p/w185/ada.jpg"},{name:"Bo Bit"},{name:"Cy Crowd"}],related:[{id:"tv-55",kind:"tv"}]});
 });
 it("season episodes carry w300 stills, air dates and ratings",async()=>{
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>String(url).includes("/season/1?")
   ?new Response(JSON.stringify({episodes:[
    {episode_number:1,name:"Pilot",overview:"Start",runtime:44,still_path:"/still.jpg",air_date:"2020-02-29",vote_average:8.25,vote_count:12},
    {episode_number:2,name:"Leap",overview:"Bad date and rating",still_path:"/bad.gif",air_date:"2020-02-30",vote_average:11,vote_count:3},
    {episode_number:3,name:"Unrated",overview:"No votes yet",still_path:null,air_date:null,vote_average:0,vote_count:0},
   ]}))
   :new Response(JSON.stringify({id:41,name:"Series",first_air_date:"2020-01-01",genres:[{id:18,name:"Drama"}],poster_path:"/series.jpg",seasons:[{season_number:1,name:"Season 1"}]})));
  const result=await handleMoviesCatalog(request("?id=tv-41&season=1"),"secret",fetcher);
  const payload=await result.json();
  expect(payload.title.seasons[0].episodes).toEqual([
   {number:1,name:"Pilot",overview:"Start",runtime:44,still:"https://image.tmdb.org/t/p/w300/still.jpg",airDate:"2020-02-29",rating:8.25},
   {number:2,name:"Leap",overview:"Bad date and rating"},
   {number:3,name:"Unrated",overview:"No votes yet"},
  ]);
  expect(parseTitle(payload.title)?.seasons[0].episodes[0]).toMatchObject({still:"https://image.tmdb.org/t/p/w300/still.jpg",airDate:"2020-02-29",rating:8.25});
 });
 it("CDN caching applies to rails and details but not search",async()=>{
  const cdn="public, durable, s-maxage=900, stale-while-revalidate=3600";
  const listing=async()=>tmdb([{id:1,media_type:"movie",title:"Cached",genre_ids:[28],poster_path:"/cached.jpg",overview:"Cache",vote_count:0}]);
  const detail=async()=>new Response(JSON.stringify({id:1,title:"Cached",release_date:"2020-01-01",genres:[],poster_path:"/cached.jpg",overview:"Cache"}));
  for(const [query,fetcher] of [["?rails=home",listing],["?id=movie-1",detail],["?type=movie&genre=Drama",listing],["?type=movie",listing]] as const){
   const result=await handleMoviesCatalog(request(query),"secret",fetcher);
   expect(result.status).toBe(200);
   expect(result.headers.get("netlify-cdn-cache-control")).toBe(cdn);expect(result.headers.get("cache-control")).toBe("no-store");
  }
  const search=await handleMoviesCatalog(request("?q=arrival"),"secret",listing);
  expect(search.status).toBe(200);
  expect(search.headers.get("netlify-cdn-cache-control")).toBeNull();expect(search.headers.get("cache-control")).toBe("no-store");
  const missing=await handleMoviesCatalog(request("?id=movie-404"),"secret",async()=>new Response("",{status:404}));
  expect(missing.status).toBe(404);
  expect(missing.headers.get("netlify-cdn-cache-control")).toBeNull();expect(missing.headers.get("cache-control")).toBe("no-store");
 });
});
