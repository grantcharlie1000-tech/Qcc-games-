export interface Episode {number:number;name:string;overview:string;runtime?:number}
export interface Season {number:number;name:string;episodes:Episode[]}
export interface Title {id:string;kind:'movie'|'tv';name:string;year:number;genres:string[];overview:string;poster:string;rating?:number;runtime?:number;seasons:Season[]}
export interface Catalog {titles:Title[];source:'starter'|'tmdb';updated?:string;attributionLogo?:string;trending:string[]}
export interface MovieRoute {id?:string;season?:number;episode?:number;play:boolean}
export interface LicensedMedia {key:string;path:string;license:string;credit:string;evidence:string;reviewed:true;territory:'Worldwide';expires:string}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=2000):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const integer=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<10000;
export function localAsset(value:unknown):string|undefined {
 return typeof value==='string'&&/^movies\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:svg|webp|jpg|png|mp4|webm|vtt)$/.test(value)?value:undefined;
}
export function parseCatalog(value:unknown):Catalog {
 const result:Catalog={titles:[],source:'starter',trending:[]};
 if(!object(value)||!Array.isArray(value.titles))return result;
 result.source=value.source==='tmdb'?'tmdb':'starter';
 if(text(value.updated,40))result.updated=value.updated;
 if(localAsset(value.attributionLogo))result.attributionLogo=value.attributionLogo;
 const seen=new Set<string>();
 for(const v of value.titles.slice(0,200)){
  if(!object(v)||!text(v.id,80)||!/^((movie|tv)-[a-z0-9-]+)$/.test(v.id)||seen.has(v.id)||(v.kind!=='movie'&&v.kind!=='tv')||!text(v.name,200)||!integer(v.year)||!text(v.overview)||!localAsset(v.poster)||!Array.isArray(v.genres)||!v.genres.every((g:unknown)=>text(g,80)))continue;
  const seasons:Season[]=[];
  for(const s of (Array.isArray(v.seasons)?v.seasons:[]).slice(0,100)){
   if(!object(s)||!integer(s.number)||!text(s.name,200)||!Array.isArray(s.episodes))continue;
   const episodes:Episode[]=s.episodes.slice(0,300).filter((e:unknown)=>object(e)&&integer(e.number)&&text(e.name,200)&&typeof e.overview==='string').map((e:any)=>({number:e.number,name:e.name,overview:e.overview.slice(0,2000),runtime:integer(e.runtime)?e.runtime:undefined}));
   seasons.push({number:s.number,name:s.name,episodes});
  }
  result.titles.push({id:v.id,kind:v.kind,name:v.name,year:v.year,genres:v.genres,overview:v.overview,poster:v.poster,rating:typeof v.rating==='number'&&v.rating>=0&&v.rating<=10?v.rating:undefined,runtime:integer(v.runtime)?v.runtime:undefined,seasons});seen.add(v.id);
 }
 if(Array.isArray(value.trending))result.trending=value.trending.filter((id:unknown)=>typeof id==='string'&&seen.has(id));
 return result;
}
export function filterTitles(titles:Title[],query:string,kind:string,genre:string):Title[]{
 const q=query.trim().toLocaleLowerCase();
 return titles.filter(t=>(kind==='all'||kind==='list'||t.kind===kind)&&(genre==='All'||t.genres.includes(genre))&&`${t.name} ${t.overview} ${t.genres.join(' ')}`.toLocaleLowerCase().includes(q));
}
export function parseMovieRoute(hash:string):MovieRoute|undefined {
 if(hash==='#/movies')return {play:false};
 const m=hash.match(/^#\/movies\/((?:movie|tv)-[a-z0-9-]+)(?:\/season\/([1-9]\d{0,3})\/episode\/([1-9]\d{0,3}))?(\/play)?$/);
 return m?{id:m[1],...(m[2]?{season:Number(m[2]),episode:Number(m[3])}:{}),play:!!m[4]}:undefined;
}
export function licensedSource(value:unknown,key:string,now=new Date()):LicensedMedia|undefined {
 if(!Array.isArray(value))return;
 return value.find(v=>object(v)&&v.key===key&&v.reviewed===true&&v.territory==='Worldwide'&&['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','LicenseRef-QCC'].includes(v.license)&&text(v.credit,1000)&&text(v.evidence,500)&&/^docs\/rights\/[a-z0-9-]+\.md$/.test(v.evidence)&&localAsset(v.path)&&/^movies\/media\/[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(v.path)&&/^\d{4}-\d{2}-\d{2}$/.test(v.expires)&&Date.parse(v.expires+'T23:59:59Z')>=now.getTime());
}
export const mediaKey=(title:Title,route:MovieRoute)=>title.kind==='tv'?`${title.id}:s${route.season}:e${route.episode}`:title.id;
export const titleHash=(id:string)=>`#/movies/${id}`;
