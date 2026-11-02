// Host-neutral QCC backend: one fetch-style router for accounts, leaderboards, TURN credentials and the movies
// catalog. Runs on Vercel (api/[route].ts), as a plain Node server (server/node.ts), or behind any Web-standard host.
// Server-only: never import this module from src/.
import type {Database} from '../src/leaderboard/server';
import {createAccountsHandler} from '../src/accounts/server';
import {createLeaderboardHandler} from '../src/leaderboard/server';
import {createTurnHandler} from '../src/multiplayer/turn-server';
import {handleMoviesCatalog} from './movies-catalog';
import {createGuardedHandler} from '../netlify/lib/runtime.mts';
import {storageFullResponse} from '../src/accounts/storage-errors';

export type Route='accounts'|'leaderboard'|'turn'|'movies';
type Env=Record<string,string|undefined>;
export interface AppOptions{
 env?:Env;
 /** Lazily opens the Postgres pool on the first database request. */
 database?:()=>Database;
 fetcher?:typeof fetch;
 now?:()=>number;
}
// Same per-IP windows as the old Netlify rate-limit rules (requests per 60 s, per instance).
export const RATE_LIMITS:Record<Route,number>={accounts:600,leaderboard:300,turn:20,movies:600};
const ALLOW_HEADERS='Authorization, Content-Type, X-QCC-Sync';
const ALLOW_METHODS='GET, POST, PUT, DELETE, OPTIONS';

/** Maps a host's environment name to the deploy context the database guard expects. */
export function deployContext(env:Env):string|undefined{
 if(env.QCC_DEPLOY_CONTEXT)return env.QCC_DEPLOY_CONTEXT;
 if(env.VERCEL_ENV==='production')return 'production';
 if(env.VERCEL_ENV==='preview')return 'deploy-preview';
 if(env.VERCEL_ENV==='development')return 'dev';
 return env.CONTEXT;
}

/** QCC_ALLOWED_ORIGINS is a comma list; an entry like https://*.qcc-games.pages.dev allows any one-label subdomain. */
export function originAllowed(origin:string,list:string|undefined):boolean{
 for(const raw of (list??'').split(',')){
  const entry=raw.trim().replace(/\/$/,'');if(!entry)continue;
  if(entry===origin)return true;
  const star=entry.indexOf('://*.');
  if(star>0){
   const scheme=entry.slice(0,star+3),suffix=entry.slice(star+4);
   if(origin.startsWith(scheme)&&origin.endsWith(suffix)){
    const label=origin.slice(scheme.length,origin.length-suffix.length);
    if(/^[a-z0-9-]{1,63}$/i.test(label))return true;
   }
  }
 }
 return false;
}

export function routeOf(pathname:string):Route|'health'|undefined{
 const match=pathname.match(/^\/(?:api|\.netlify\/functions)\/([a-z-]+)\/?$/);
 const name=match?.[1];
 if(name==='movies'||name==='movies-search')return 'movies';
 if(name==='accounts'||name==='leaderboard'||name==='turn'||name==='health')return name;
 return undefined;
}

export function createApp(options:AppOptions={}){
 const env=options.env??process.env,now=options.now??Date.now,fetcher=options.fetcher??globalThis.fetch.bind(globalThis);
 const context=deployContext(env);
 let db:Database|undefined;const database=()=>db??=options.database!();
 const handlers:Partial<Record<Route,(request:Request,ip:string)=>Promise<Response>>>={};
 const handler=(route:Route)=>handlers[route]??=build(route);
 function build(route:Route):(request:Request,ip:string)=>Promise<Response>{
  if(route==='movies')return request=>handleMoviesCatalog(request,env.TMDB_READ_TOKEN??'',fetcher);
  if(route==='turn'){const turn=createTurnHandler({keyId:env.CLOUDFLARE_TURN_KEY_ID,apiToken:env.CLOUDFLARE_TURN_API_TOKEN},fetcher,now);return (request,ip)=>turn(request,ip);}
  const factory=route==='accounts'?createAccountsHandler:createLeaderboardHandler;
  let guarded:((request:Request)=>Promise<Response>)|undefined;
  return async request=>{
   try{guarded??=createGuardedHandler(database(),factory,{allowMissingMarker:false,context,env:env as NodeJS.ProcessEnv,now});return await guarded(request);}
   catch(error){return storageFullResponse(error)??Response.json({error:'Service temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
  };
 }
 const hits=new Map<string,number[]>();
 function limited(key:string,limit:number):boolean{
  const t=now(),recent=(hits.get(key)??[]).filter(at=>t-at<60_000);
  if(recent.length>=limit){hits.set(key,recent);return true;}
  recent.push(t);hits.set(key,recent);
  if(hits.size>10_000)for(const [k,list] of hits)if(!list.some(at=>t-at<60_000))hits.delete(k);
  return false;
 }
 return async function handle(request:Request,clientIp=''):Promise<Response>{
  const url=new URL(request.url),route=routeOf(url.pathname),origin=request.headers.get('origin');
  const sameOrigin=origin===url.origin,allowed=!origin||sameOrigin||originAllowed(origin,env.QCC_ALLOWED_ORIGINS);
  const cors:Record<string,string>=origin&&allowed&&!sameOrigin?{'Access-Control-Allow-Origin':origin,'Access-Control-Expose-Headers':'Retry-After'}:{};
  const finish=(response:Response)=>{
   const headers=new Headers(response.headers);
   // Netlify-only cache headers become the standard CDN-Cache-Control that Vercel and Cloudflare honour.
   const cdn=headers.get('netlify-cdn-cache-control');
   if(cdn){headers.set('CDN-Cache-Control',cdn.replace(/,\s*durable/,''));headers.delete('netlify-cdn-cache-control');}
   headers.delete('netlify-cache-tag');
   headers.append('Vary','Origin');
   for(const [k,v] of Object.entries(cors))headers.set(k,v);
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  };
  if(!route)return finish(Response.json({error:'Not found.'},{status:404,headers:{'Cache-Control':'no-store'}}));
  if(!allowed)return finish(Response.json({error:'This request is not allowed.'},{status:403,headers:{'Cache-Control':'no-store'}}));
  if(request.method==='OPTIONS')return finish(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':ALLOW_METHODS,'Access-Control-Allow-Headers':ALLOW_HEADERS,'Access-Control-Max-Age':'86400','Cache-Control':'no-store'}}));
  if(route==='health')return finish(Response.json({ok:true},{headers:{'Cache-Control':'no-store'}}));
  const ip=clientIp||'unknown';
  if(limited(route+'|'+ip,RATE_LIMITS[route]))return finish(Response.json({error:'Too many requests. Try again in a minute.'},{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}}));
  // The handlers reject any Origin that differs from the request URL. The allow-list check above already ran,
  // so pass an allowed cross-origin call through without its Origin header.
  let inner=request;
  if(origin&&!sameOrigin){const headers=new Headers(request.headers);headers.delete('origin');inner=new Request(request,{headers});}
  return finish(await handler(route)(inner,ip));
 };
}
