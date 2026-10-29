export interface Episode {number:number;name:string;overview:string;runtime?:number;still?:string;airDate?:string;rating?:number}
export interface Season {number:number;name:string;episodes:Episode[]}
export interface CastMember {name:string;character:string;photo?:string}
export interface Title {id:string;kind:'movie'|'tv';name:string;year:number;genres:string[];overview:string;poster:string;backdrop?:string;rating?:number;runtime?:number;seasons:Season[];cast?:CastMember[];related?:Title[]}
export interface Catalog {titles:Title[];source:'starter'|'tmdb';updated?:string;attributionLogo?:string;trending:string[]}
export interface MovieRoute {id?:string;season?:number;episode?:number;play:boolean;kind?:'movie'|'tv'|'list'}
export type MovieKind='all'|'movie'|'tv'|'list';
export interface Rail {id:string;title:string;titles:Title[]}
export interface LicensedMedia {key:string;path:string;license:string;credit:string;evidence:string;reviewed:true;territory:'Worldwide';expires:string}
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=2000):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const integer=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>0&&v<10000;
const ratingOf=(v:unknown)=>typeof v==='number'&&v>=0&&v<=10?v:undefined;
// The round trip rejects impossible days such as 2020-02-31, which Date rolls over into March.
const airDateOf=(v:unknown):string|undefined=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return;
 const day=new Date(v+'T00:00:00Z');
 return !Number.isNaN(day.getTime())&&day.toISOString().slice(0,10)===v?v:undefined;
};
export function localAsset(value:unknown):string|undefined {
 return typeof value==='string'&&/^movies\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:svg|webp|jpg|png|mp4|webm|vtt)$/.test(value)?value:undefined;
}
export function imageAsset(value:unknown):string|undefined {
 return localAsset(value)??(typeof value==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/(w92|w185|w300|w500|w780|w1280|original)\/[a-zA-Z0-9]+\.(jpg|png|webp)$/.test(value)?value:undefined);
}
// Optional fields are added only when valid, so absent or invalid input keeps the shape it had before.
function parseEpisode(e:any):Episode {
 const still=imageAsset(e.still),airDate=airDateOf(e.airDate),rating=ratingOf(e.rating);
 return {number:e.number,name:e.name,overview:e.overview.slice(0,2000),runtime:integer(e.runtime)?e.runtime:undefined,...(still===undefined?{}:{still}),...(airDate===undefined?{}:{airDate}),...(rating===undefined?{}:{rating})};
}
function parseCast(value:unknown):CastMember[] {
 return Array.isArray(value)?value.slice(0,12).filter((c:any)=>object(c)&&text(c.name,120)&&typeof c.character==='string'&&c.character.length<=120).map((c:any)=>{const photo=imageAsset(c.photo);return {name:c.name,character:c.character,...(photo===undefined?{}:{photo})};}):[];
}
// Nested titles (related entries) skip their own cast and related lists, which keeps the nesting to one level.
export function parseTitle(value:unknown,nested=false):Title|undefined {
 if(!object(value)||!text(value.id,80)||!/^((movie|tv)-[a-z0-9-]+)$/.test(value.id)||(value.kind!=='movie'&&value.kind!=='tv')||!text(value.name,200)||!(value.year===0||integer(value.year))||!text(value.overview)||!imageAsset(value.poster)||!Array.isArray(value.genres)||!value.genres.every((g:unknown)=>text(g,80)))return;
 const seasons:Season[]=[];
 for(const s of (Array.isArray(value.seasons)?value.seasons:[]).slice(0,100)){
  if(!object(s)||!integer(s.number)||!text(s.name,200)||!Array.isArray(s.episodes))continue;
  const episodes:Episode[]=s.episodes.slice(0,300).filter((e:unknown)=>object(e)&&integer(e.number)&&text(e.name,200)&&typeof e.overview==='string').map(parseEpisode);
  seasons.push({number:s.number,name:s.name,episodes});
 }
 const cast:CastMember[]=nested?[]:parseCast(value.cast);
 const related:Title[]=nested||!Array.isArray(value.related)?[]:value.related.slice(0,12).flatMap((r:unknown)=>parseTitle(r,true)??[]);
 return {id:value.id,kind:value.kind,name:value.name,year:value.year,genres:value.genres,overview:value.overview,poster:value.poster,backdrop:imageAsset(value.backdrop),rating:ratingOf(value.rating),runtime:integer(value.runtime)?value.runtime:undefined,seasons,...(cast.length?{cast}:{}),...(related.length?{related}:{})};
}
export function parseCatalog(value:unknown):Catalog {
 const result:Catalog={titles:[],source:'starter',trending:[]};
 if(!object(value)||!Array.isArray(value.titles))return result;
 result.source=value.source==='tmdb'?'tmdb':'starter';
 if(text(value.updated,40))result.updated=value.updated;
 if(localAsset(value.attributionLogo))result.attributionLogo=value.attributionLogo;
 const seen=new Set<string>();
 for(const v of value.titles.slice(0,200)){
  const title=parseTitle(v);
  if(!title||seen.has(title.id))continue;
  result.titles.push(title);seen.add(title.id);
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
 const section=hash.match(/^#\/movies\/(?:browse\/(movie|tv)|list)$/);
 if(section)return {play:false,kind:section[1]==='tv'?'tv':section[1]==='movie'?'movie':'list'};
 const m=hash.match(/^#\/movies\/((?:movie|tv)-[a-z0-9-]+)(?:\/season\/([1-9]\d{0,3})\/episode\/([1-9]\d{0,3}))?(\/play)?$/);
 return m?{id:m[1],...(m[2]?{season:Number(m[2]),episode:Number(m[3])}:{}),play:!!m[4]}:undefined;
}
export function licensedSource(value:unknown,key:string,now=new Date()):LicensedMedia|undefined {
 if(!Array.isArray(value))return;
 return value.find(v=>object(v)&&v.key===key&&v.reviewed===true&&v.territory==='Worldwide'&&['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','LicenseRef-QCC'].includes(v.license)&&text(v.credit,1000)&&text(v.evidence,500)&&/^docs\/rights\/[a-z0-9-]+\.md$/.test(v.evidence)&&localAsset(v.path)&&/^movies\/media\/[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(v.path)&&/^\d{4}-\d{2}-\d{2}$/.test(v.expires)&&Date.parse(v.expires+'T23:59:59Z')>=now.getTime());
}
export const mediaKey=(title:Title,route:MovieRoute)=>title.kind==='tv'?`${title.id}:s${route.season}:e${route.episode}`:title.id;
export const titleHash=(id:string)=>`#/movies/${id}`;
export const kindHash=(kind:MovieKind)=>kind==='all'?'#/movies':kind==='list'?'#/movies/list':`#/movies/browse/${kind}`;

export function nextEpisode(title:Title,season:number,episode:number):{season:number;episode:number;name?:string}|undefined {
 if(title.kind!=='tv')return;
 const current=title.seasons.find(s=>s.number===season),index=current?.episodes.findIndex(e=>e.number===episode)??-1;
 if(!current||index<0)return;
 const following=current.episodes[index+1];
 if(following)return {season,episode:following.number,name:following.name};
 const next=title.seasons.filter(s=>s.number>season).sort((a,b)=>a.number-b.number)[0];
 if(next)return {season:next.number,episode:next.episodes[0]?.number??1,name:next.episodes[0]?.name};
}
// Mirrors nextEpisode. A previous season without loaded episodes gives nothing, since its last episode is unknown.
export function previousEpisode(title:Title,season:number,episode:number):{season:number;episode:number;name?:string}|undefined {
 if(title.kind!=='tv')return;
 const current=title.seasons.find(s=>s.number===season),index=current?.episodes.findIndex(e=>e.number===episode)??-1;
 if(!current||index<0)return;
 if(index>0){const previous=current.episodes[index-1];return {season,episode:previous.number,name:previous.name};}
 const last=title.seasons.filter(s=>s.number<season).sort((a,b)=>b.number-a.number)[0],episodes=last?.episodes??[],final=episodes[episodes.length-1];
 if(last&&final)return {season:last.number,episode:final.number,name:final.name};
}
// Accepts the response body {rails:[...]} or a bare array of rails. Anything else gives no rails.
export function parseRails(value:unknown):Rail[] {
 const list=object(value)&&Array.isArray(value.rails)?value.rails:value;
 if(!Array.isArray(list))return [];
 return list.slice(0,12).flatMap((r:any):Rail[]=>{
  if(!object(r)||typeof r.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(r.id)||!text(r.title,80)||!Array.isArray(r.titles))return [];
  const seen=new Set<string>(),titles:Title[]=[];
  for(const v of r.titles.slice(0,40)){const title=parseTitle(v);if(!title||seen.has(title.id))continue;seen.add(title.id);titles.push(title);}
  return titles.length?[{id:r.id,title:r.title,titles}]:[];
 });
}
