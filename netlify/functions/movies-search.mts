import type {Config} from "@netlify/functions";

const TMDB="https://api.themoviedb.org/3";
const JSON_HEADERS={
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
};
// Netlify's CDN reads this header, and browsers keep the no-store cache-control above.
const CDN_CACHE="public, durable, s-maxage=900, stale-while-revalidate=3600";
const genres:Record<number,string>={
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",
  18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",
  9648:"Mystery",10749:"Romance",878:"Science Fiction",10770:"TV Movie",53:"Thriller",
  10752:"War",37:"Western",10759:"Action & Adventure",10762:"Kids",10763:"News",
  10764:"Reality",10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",
};
// A Map keeps genre names such as "constructor" from matching object prototype keys.
const genreIds=new Map<string,number>(Object.keys(genres).map(id=>[genres[Number(id)],Number(id)] as const));
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
type MediaKind="movie"|"tv";
type RailName="home"|"movie"|"tv";
type RailSpec={id:string;title:string;path:string;kind?:MediaKind};
const response=(body:unknown,status=200,cdn=false)=>Response.json(body,{status,headers:cdn&&status===200?{...JSON_HEADERS,"netlify-cdn-cache-control":CDN_CACHE}:JSON_HEADERS});
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const integer=(v:string|null,min:number,max:number)=>{const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:undefined;};
const dateYear=(value:unknown)=>typeof value==="string"&&/^\d{4}/.test(value)?Number(value.slice(0,4)):0;
const artwork=(path:unknown,size:"w185"|"w300"|"w500"|"w1280")=>typeof path==="string"&&/^\/[a-zA-Z0-9]+\.(jpg|png|webp)$/.test(path)?`https://image.tmdb.org/t/p/${size}${path}`:undefined;
// The round trip rejects impossible days such as 2020-02-30.
const airDate=(value:unknown)=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
  const day=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime())&&day.toISOString().slice(0,10)===value?value:undefined;
};
// A rating needs at least one vote and must sit on the 0 to 10 scale that the browser parser accepts.
const ratingOf=(value:unknown,votes:unknown)=>typeof value==="number"&&typeof votes==="number"&&votes>0&&value>=0&&value<=10?value:undefined;
const discoverPath=(kind:MediaKind,genre:number)=>`discover/${kind}?with_genres=${genre}&sort_by=popularity.desc&include_adult=false`;
const withPage=(path:string,page:number)=>`${path}${path.includes("?")?"&":"?"}language=en-US&page=${page}`;
const pageParam=(url:URL)=>{const value=url.searchParams.get("page");return value===null?1:integer(value,1,500);};
// Only the home trending rail mixes movies and TV, so it alone leaves each item's kind to its media_type.
const RAILS:Record<RailName,RailSpec[]>={
  home:[
    {id:"trending",title:"Trending now",path:"trending/all/week"},
    {id:"popular-movies",title:"Popular movies",path:"movie/popular",kind:"movie"},
    {id:"popular-tv",title:"Popular TV",path:"tv/popular",kind:"tv"},
    {id:"top-movies",title:"Top rated movies",path:"movie/top_rated",kind:"movie"},
    {id:"action",title:"Action",path:discoverPath("movie",28),kind:"movie"},
    {id:"comedy",title:"Comedy",path:discoverPath("movie",35),kind:"movie"},
    {id:"scifi",title:"Science fiction",path:discoverPath("movie",878),kind:"movie"},
    {id:"thriller",title:"Thrillers",path:discoverPath("movie",53),kind:"movie"},
  ],
  movie:[
    {id:"trending",title:"Trending movies",path:"trending/movie/week",kind:"movie"},
    {id:"popular",title:"Popular",path:"movie/popular",kind:"movie"},
    {id:"now-playing",title:"In cinemas",path:"movie/now_playing",kind:"movie"},
    {id:"top",title:"Top rated",path:"movie/top_rated",kind:"movie"},
    {id:"action",title:"Action",path:discoverPath("movie",28),kind:"movie"},
    {id:"comedy",title:"Comedy",path:discoverPath("movie",35),kind:"movie"},
    {id:"drama",title:"Drama",path:discoverPath("movie",18),kind:"movie"},
    {id:"horror",title:"Horror",path:discoverPath("movie",27),kind:"movie"},
    {id:"scifi",title:"Science fiction",path:discoverPath("movie",878),kind:"movie"},
  ],
  tv:[
    {id:"trending",title:"Trending TV",path:"trending/tv/week",kind:"tv"},
    {id:"popular",title:"Popular",path:"tv/popular",kind:"tv"},
    {id:"on-air",title:"On the air",path:"tv/on_the_air",kind:"tv"},
    {id:"top",title:"Top rated",path:"tv/top_rated",kind:"tv"},
    {id:"drama",title:"Drama",path:discoverPath("tv",18),kind:"tv"},
    {id:"comedy",title:"Comedy",path:discoverPath("tv",35),kind:"tv"},
    {id:"crime",title:"Crime",path:discoverPath("tv",80),kind:"tv"},
    {id:"scifi",title:"Sci-Fi & Fantasy",path:discoverPath("tv",10765),kind:"tv"},
    {id:"mystery",title:"Mystery",path:discoverPath("tv",9648),kind:"tv"},
  ],
};

function mapResult(item:Record<string,any>,forcedKind?:MediaKind):Record<string,any>|undefined{
  if(!object(item))return undefined;
  const kind=forcedKind??(item.media_type==="movie"||item.media_type==="tv"?item.media_type:undefined);
  const id=Number(item.id),name=kind==="movie"?item.title:item.name,year=dateYear(item.release_date??item.first_air_date);
  const poster=artwork(item.poster_path,"w500");
  if(!kind||!Number.isSafeInteger(id)||id<1||typeof name!=="string"||!name)return undefined;
  const ids=Array.isArray(item.genre_ids)?item.genre_ids:Array.isArray(item.genres)?item.genres.map((g:any)=>g?.id):[];
  const named=Array.isArray(item.genres)?item.genres.map((g:any)=>g?.name):[];
  const categories=[...new Set([...ids.map((n:unknown)=>typeof n==="number"?genres[n]:undefined),...named].filter((g):g is string=>typeof g==="string"&&g.length>0&&g.length<=80))];
  return {
    id:`${kind}-${id}`,kind,name:name.slice(0,200),year,genres:categories,
    overview:typeof item.overview==="string"&&item.overview.trim()?item.overview.slice(0,2000):"No description supplied.",
    poster:poster??"movies/no-artwork.svg",backdrop:artwork(item.backdrop_path,"w1280"),
    rating:ratingOf(item.vote_average,item.vote_count),
    runtime:integer(String(item.runtime??""),1,9999),seasons:[],
  };
}
// A forced kind wins over each item's own media_type.
const titlesOf=(data:Record<string,any>,kind?:MediaKind)=>(Array.isArray(data.results)?data.results:[]).flatMap((item:any):Record<string,any>[]=>{const title=mapResult(item,kind);return title?[title]:[];});
const browseBody=(data:Record<string,any>,page:number,kind?:MediaKind)=>{
  const titles=titlesOf(data,kind);
  return {titles,page,totalPages:Number.isInteger(data.total_pages)?Math.max(1,Math.min(500,data.total_pages)):1,totalResults:Number.isInteger(data.total_results)?data.total_results:titles.length};
};
// Cast comes from the credits append. A member needs a name, and a missing character becomes an empty string.
const castOf=(detail:Record<string,any>)=>(object(detail.credits)&&Array.isArray(detail.credits.cast)?detail.credits.cast:[]).flatMap((c:any):Record<string,any>[]=>{
  const name=object(c)&&typeof c.name==="string"?c.name.trim().slice(0,120):"";
  return name?[{name,character:typeof c.character==="string"?c.character.trim().slice(0,120):"",photo:artwork(c.profile_path,"w185")}]:[];
}).slice(0,12);
// Related titles come from the recommendations append and always take the parent's kind.
const relatedOf=(detail:Record<string,any>,kind:MediaKind)=>(object(detail.recommendations)?titlesOf(detail.recommendations,kind):[]).slice(0,12);

export async function handleMoviesCatalog(req:Request,token:string,fetcher:Fetcher=fetch){
  if(req.method!=="GET")return response({error:"method_not_allowed"},405);
  if(!token)return response({error:"catalog_not_configured",message:"The full catalog is temporarily unavailable."},503);
  const url=new URL(req.url);
  // Search text is personal and too varied to cache, so any request that carries q is never cached at the CDN.
  const cdn=!url.searchParams.has("q");
  const id=url.searchParams.get("id");
  if(id){
    const match=id.match(/^(movie|tv)-([1-9]\d{0,7})$/);
    const seasonNo=integer(url.searchParams.get("season"),1,999);
    if(!match)return response({error:"invalid_title"},400);
    const kind=match[1] as MediaKind,tmdbId=match[2];
    const detail=await fetchTmdb(`${kind}/${tmdbId}?language=en-US&append_to_response=credits,recommendations`,token,fetcher);
    if(detail instanceof Response)return detail;
    let seasons:any[]=[];
    if(kind==="tv"){
      const summaries=Array.isArray(detail.seasons)?detail.seasons.filter((s:any)=>object(s)&&Number.isInteger(s.season_number)&&s.season_number>0):[];
      seasons=summaries.slice(0,100).map((s:any)=>{const name=typeof s.name==="string"?s.name.trim().slice(0,200):"";return {number:s.season_number,name:name||`Season ${s.season_number}`,episodes:[]};});
      const selected=seasonNo??seasons[0]?.number;
      if(selected&&seasons.some(s=>s.number===selected)){
        const episodeData=await fetchTmdb(`tv/${tmdbId}/season/${selected}?language=en-US`,token,fetcher);
        if(episodeData instanceof Response)return episodeData;
        const current=seasons.find(s=>s.number===selected);
        current.episodes=(Array.isArray(episodeData.episodes)?episodeData.episodes:[]).slice(0,300).flatMap((e:any)=>{
          if(!object(e)||!Number.isInteger(e.episode_number)||e.episode_number<1||typeof e.name!=="string"||!e.name)return[];
          return [{number:e.episode_number,name:e.name.slice(0,200),overview:typeof e.overview==="string"?e.overview.slice(0,2000):"",runtime:integer(String(e.runtime??""),1,9999),still:artwork(e.still_path,"w300"),airDate:airDate(e.air_date),rating:ratingOf(e.vote_average,e.vote_count)}];
        });
      }
    }
    const title=mapResult(detail,kind);
    if(!title)return response({error:"title_unavailable"},404);
    title.seasons=seasons;
    title.cast=castOf(detail);
    title.related=relatedOf(detail,kind);
    return response({title},200,cdn);
  }
  const railsName=url.searchParams.get("rails");
  if(railsName!==null){
    const specs=["home","movie","tv"].includes(railsName)?RAILS[railsName as RailName]:undefined;
    if(!specs)return response({error:"invalid_rails"},400);
    const settled=await Promise.allSettled(specs.map(spec=>fetchTmdb(withPage(spec.path,1),token,fetcher)));
    const failed=settled.filter(result=>result.status==="rejected"||result.value instanceof Response).length;
    if(failed===settled.length)return response({error:"metadata_unavailable"},502);
    const rails=specs.flatMap((spec,i)=>{
      const result=settled[i];
      if(result.status!=="fulfilled"||result.value instanceof Response)return [];
      const titles=titlesOf(result.value,spec.kind).slice(0,20);
      return titles.length?[{id:spec.id,title:spec.title,titles}]:[];
    });
    // Only a complete rails response is shared at the CDN, so a failed or empty rail never reaches every viewer.
    return response({rails},200,cdn&&failed===0&&rails.length===specs.length);
  }
  const query=(url.searchParams.get("q")??"").trim();
  const genreName=url.searchParams.get("genre");
  if(genreName!==null){
    const genreKind=url.searchParams.get("type");
    if(genreKind!=="movie"&&genreKind!=="tv")return response({error:"invalid_type"},400);
    const genreId=genreIds.get(genreName);
    if(genreId===undefined||query)return response({error:"invalid_genre"},400);
    const genrePage=pageParam(url);
    if(!genrePage)return response({error:"invalid_page"},400);
    const genreData=await fetchTmdb(withPage(discoverPath(genreKind,genreId),genrePage),token,fetcher);
    if(genreData instanceof Response)return genreData;
    return response(browseBody(genreData,genrePage,genreKind),200,cdn);
  }
  if(query.length>100)return response({error:"query_too_long"},400);
  if(query.length===1)return response({error:"query_too_short"},400);
  const kindValue=url.searchParams.get("type")??"all";
  if(!["all","movie","tv"].includes(kindValue))return response({error:"invalid_type"},400);
  const page=pageParam(url);
  if(!page)return response({error:"invalid_page"},400);
  const path=query
    ?`search/${kindValue==="all"?"multi":kindValue}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`
    :`trending/${kindValue==="all"?"all":kindValue}/week?language=en-US&page=${page}`;
  const data=await fetchTmdb(path,token,fetcher);
  if(data instanceof Response)return data;
  return response(browseBody(data,page,kindValue==="all"?undefined:kindValue as MediaKind),200,cdn);
}

async function fetchTmdb(path:string,token:string,fetcher:Fetcher){
  try{
    const result=await fetcher(`${TMDB}/${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!result.ok)return response({error:result.status===404?"title_unavailable":"metadata_unavailable"},result.status===404?404:502);
    const data=await result.json();
    if(!data||typeof data!=="object"||Array.isArray(data))return response({error:"invalid_metadata"},502);
    return data as Record<string,any>;
  }catch{return response({error:"metadata_unavailable"},502);}
}

export default async (req:Request)=>handleMoviesCatalog(req,Netlify.env.get("TMDB_READ_TOKEN")??"");
export const config:Config={path:"/api/movies",method:["GET"]};
