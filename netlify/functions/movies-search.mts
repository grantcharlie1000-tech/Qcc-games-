import type {Config} from "@netlify/functions";

const TMDB="https://api.themoviedb.org/3";
const JSON_HEADERS={
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
};
const genres:Record<number,string>={
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",
  18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",
  9648:"Mystery",10749:"Romance",878:"Science Fiction",10770:"TV Movie",53:"Thriller",
  10752:"War",37:"Western",10759:"Action & Adventure",10762:"Kids",10763:"News",
  10764:"Reality",10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",
};
type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
type MediaKind="movie"|"tv";
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:JSON_HEADERS});
const integer=(v:string|null,min:number,max:number)=>{const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:undefined;};
const dateYear=(value:unknown)=>typeof value==="string"&&/^\d{4}/.test(value)?Number(value.slice(0,4)):0;
const artwork=(path:unknown,size:"w500"|"w1280")=>typeof path==="string"&&/^\/[a-zA-Z0-9]+\.(jpg|png|webp)$/.test(path)?`https://image.tmdb.org/t/p/${size}${path}`:undefined;

function mapResult(item:Record<string,any>,forcedKind?:MediaKind):Record<string,any>|undefined{
  if(!item||typeof item!=="object"||Array.isArray(item))return undefined;
  const kind=forcedKind??(item.media_type==="movie"||item.media_type==="tv"?item.media_type:undefined);
  const id=Number(item.id),name=kind==="movie"?item.title:item.name,year=dateYear(item.release_date??item.first_air_date);
  const poster=artwork(item.poster_path,"w500");
  if(!kind||!Number.isSafeInteger(id)||id<1||typeof name!=="string"||!name)return undefined;
  const ids=Array.isArray(item.genre_ids)?item.genre_ids:Array.isArray(item.genres)?item.genres.map((g:any)=>g?.id):[];
  const named=Array.isArray(item.genres)?item.genres.map((g:any)=>g?.name):[];
  const categories=[...new Set([...ids.map((n:unknown)=>typeof n==="number"?genres[n]:undefined),...named].filter((g):g is string=>typeof g==="string"&&g.length<=80))];
  return {
    id:`${kind}-${id}`,kind,name,year,genres:categories,
    overview:typeof item.overview==="string"&&item.overview.trim()?item.overview.slice(0,2000):"No description supplied.",
    poster:poster??"movies/no-artwork.svg",backdrop:artwork(item.backdrop_path,"w1280"),
    rating:typeof item.vote_average==="number"&&item.vote_count>0?item.vote_average:undefined,
    runtime:integer(String(item.runtime??""),1,9999),seasons:[],
  };
}

export async function handleMoviesCatalog(req:Request,token:string,fetcher:Fetcher=fetch){
  if(req.method!=="GET")return response({error:"method_not_allowed"},405);
  if(!token)return response({error:"catalog_not_configured",message:"The full catalog is temporarily unavailable."},503);
  const url=new URL(req.url);
  const id=url.searchParams.get("id");
  if(id){
    const match=id.match(/^(movie|tv)-([1-9]\d{0,7})$/);
    const seasonNo=integer(url.searchParams.get("season"),1,999);
    if(!match)return response({error:"invalid_title"},400);
    const kind=match[1] as MediaKind,tmdbId=match[2];
    const detail=await fetchTmdb(`${kind}/${tmdbId}?language=en-US`,token,fetcher);
    if(detail instanceof Response)return detail;
    let seasons:any[]=[];
    if(kind==="tv"){
      const summaries=Array.isArray(detail.seasons)?detail.seasons.filter((s:any)=>s&&typeof s==="object"&&!Array.isArray(s)&&Number.isInteger(s.season_number)&&s.season_number>0):[];
      seasons=summaries.slice(0,100).map((s:any)=>({number:s.season_number,name:typeof s.name==="string"?s.name:`Season ${s.season_number}`,episodes:[]}));
      const selected=seasonNo??seasons[0]?.number;
      if(selected&&seasons.some(s=>s.number===selected)){
        const episodeData=await fetchTmdb(`tv/${tmdbId}/season/${selected}?language=en-US`,token,fetcher);
        if(episodeData instanceof Response)return episodeData;
        const current=seasons.find(s=>s.number===selected);
        current.episodes=(Array.isArray(episodeData.episodes)?episodeData.episodes:[]).slice(0,300).flatMap((e:any)=>{
          if(!e||typeof e!=="object"||Array.isArray(e)||!Number.isInteger(e.episode_number)||e.episode_number<1||typeof e.name!=="string"||!e.name)return[];
          return [{number:e.episode_number,name:e.name.slice(0,200),overview:typeof e.overview==="string"?e.overview.slice(0,2000):"",runtime:integer(String(e.runtime??""),1,9999)}];
        });
      }
    }
    const title=mapResult(detail,kind);
    if(!title)return response({error:"title_unavailable"},404);
    title.seasons=seasons;
    return response({title});
  }
  const query=(url.searchParams.get("q")??"").trim();
  if(query.length>100)return response({error:"query_too_long"},400);
  if(query.length===1)return response({error:"query_too_short"},400);
  const kindValue=url.searchParams.get("type")??"all";
  if(!["all","movie","tv"].includes(kindValue))return response({error:"invalid_type"},400);
  const pageValue=url.searchParams.get("page");
  const page=pageValue===null?1:integer(pageValue,1,500);
  if(!page)return response({error:"invalid_page"},400);
  const path=query
    ?`search/${kindValue==="all"?"multi":kindValue}?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`
    :`trending/${kindValue==="all"?"all":kindValue}/week?language=en-US&page=${page}`;
  const data=await fetchTmdb(path,token,fetcher);
  if(data instanceof Response)return data;
  const titles=(Array.isArray(data.results)?data.results:[]).flatMap((item:any)=>{const title=mapResult(item,kindValue==="all"?undefined:kindValue as MediaKind);return title?[title]:[];});
  const totalPages=Number.isInteger(data.total_pages)?Math.max(1,Math.min(500,data.total_pages)):1;
  return response({titles,page,totalPages,totalResults:Number.isInteger(data.total_results)?data.total_results:titles.length});
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
