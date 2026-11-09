// Host-neutral QCC backend: one fetch-style router for accounts, leaderboards, TURN credentials, the movies
// catalog, Social/Chat/media and Predictions. Runs on Vercel (api/[route].ts), as a plain Node server (server/node.ts), or behind any Web-standard host.
// Server-only: never import this module from src/.
import type {Database} from '../src/leaderboard/server';
import {createStudyLinkHandler} from './study-pairing';
import {studyServiceAuthorized,studyBrowserProof} from './study-service-auth';
import {createAccountsHandler} from '../src/accounts/server';
import {createLeaderboardHandler} from '../src/leaderboard/server';
import {createSocialHandler} from '../src/social/server';
import {createChatHandler,purgeExpiredChat} from '../src/chat/server';
import {createMediaHandler} from '../src/media/server';
import {createPredictionsHandler,runGrantJob} from '../src/predictions/server';
import {purgePendingMedia,sweepOrphanMedia,PURGE_BATCH_SIZE,type MediaStore} from '../src/media/store';
import {vercelBlobMediaStore} from './media-store';
import {createTurnHandler} from '../src/multiplayer/turn-server';
import {handleMoviesCatalog} from './movies-catalog';
import {createGuardedHandler,isWriteFrozen} from '../netlify/lib/runtime.mts';
import {storageFullResponse} from '../src/accounts/storage-errors';
import {createHash,timingSafeEqual} from 'node:crypto';

export type Route='study-link'|'accounts'|'leaderboard'|'turn'|'movies'|'social'|'chat'|'media'|'predictions';
type Env=Record<string,string|undefined>;
export interface AppOptions{
 env?:Env;
 /** Lazily opens the Postgres pool on the first database request. */
 database?:()=>Database;
 fetcher?:typeof fetch;
 now?:()=>number;
 /** Lazily creates the media blob store; null disables photos. Defaults to Vercel Blob (needs BLOB_READ_WRITE_TOKEN). */
 mediaStore?:()=>Promise<MediaStore|null>;
}
// Same per-IP windows as the old Netlify rate-limit rules (requests per 60 s, per instance).
export const RATE_LIMITS:Record<Route,number>={'study-link':600,accounts:600,leaderboard:300,turn:20,movies:600,social:600,chat:600,media:1200,predictions:600};
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

export function routeOf(pathname:string):Route|'health'|'chat-purge'|'predictions-grants'|undefined{
 const match=pathname.match(/^\/(?:api|\.netlify\/functions)\/([a-z-]+)\/?$/);
 const name=match?.[1];
 if(name==='movies'||name==='movies-search')return 'movies';
 if(name==='study-link'||name==='accounts'||name==='leaderboard'||name==='turn'||name==='social'||name==='chat'||name==='media'||name==='predictions'||name==='health'||name==='chat-purge'||name==='predictions-grants')return name;
 return undefined;
}

export function createApp(options:AppOptions={}){
 const env=options.env??process.env,now=options.now??Date.now,fetcher=options.fetcher??globalThis.fetch.bind(globalThis);
 const context=deployContext(env);
 let db:Database|undefined;const database=()=>db??=options.database!();
 // A null store (media not configured, or the SDK failed to load) is only remembered for a minute, so fixing the env needs no cold start.
 const STORE_RETRY_MS=60_000;
 let store:Promise<MediaStore|null>|undefined,storeAt=0;
 async function mediaStore():Promise<MediaStore|null>{
  if(store){const cached=await store;if(cached||now()-storeAt<STORE_RETRY_MS)return cached;}
  storeAt=now();
  const created=(options.mediaStore??(()=>vercelBlobMediaStore(env)))().catch(()=>null);
  store=created;return created;
 }
 const handlers:Partial<Record<Route,(request:Request,ip:string)=>Promise<Response>>>={};
 const handler=(route:Route)=>handlers[route]??=build(route);
 function build(route:Route):(request:Request,ip:string)=>Promise<Response>{
  if(route==='movies')return request=>handleMoviesCatalog(request,env.TMDB_READ_TOKEN??'',fetcher);
  if(route==='turn'){const turn=createTurnHandler({keyId:env.CLOUDFLARE_TURN_KEY_ID,apiToken:env.CLOUDFLARE_TURN_API_TOKEN},fetcher,now);return (request,ip)=>turn(request,ip);}
  let guarded:((request:Request)=>Promise<Response>)|undefined,builtAt=0,builtWithoutStore=false;
  return async request=>{
   try{
    if(guarded&&builtWithoutStore&&now()-builtAt>=STORE_RETRY_MS)guarded=undefined;
    if(!guarded){
     const blobs=route==='social'||route==='chat'||route==='media'?await mediaStore():null;
     builtAt=now();builtWithoutStore=!blobs&&(route==='social'||route==='chat'||route==='media');
     const maxTotalBytes=Number(env.QCC_MEDIA_MAX_TOTAL_BYTES)||undefined;
     const factory=route==='study-link'?(db:Database)=>createStudyLinkHandler(db,{env,fetcher,now}):route==='accounts'?(db:Database)=>createAccountsHandler(db,{trustedStudyProxy:request=>env.QCC_WHETU_PAIRING==='on'&&request.headers.get('x-qcc-internal-study-account-origin')===env.QCC_NCEASTUDY_ORIGIN}):route==='leaderboard'?createLeaderboardHandler:route==='social'?(db:Database)=>createSocialHandler(db,blobs)
      :route==='chat'?(db:Database)=>createChatHandler(db,blobs):route==='predictions'?(db:Database)=>createPredictionsHandler(db)
      :(db:Database)=>createMediaHandler(db,blobs,{maxTotalBytes});
     guarded=createGuardedHandler(database(),factory,{allowMissingMarker:false,context,env:env as NodeJS.ProcessEnv,now});
    }
    return await guarded(request);}
   catch(error){return storageFullResponse(error)??Response.json({error:'Service temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
  };
 }
 const digest=(value:string)=>createHash('sha256').update(value).digest();
 let guardedPurge:((request:Request)=>Promise<Response>)|undefined;
 /** Time budget for one purge; the function limit is 10 s and a killed run would leave blobs without rows. */
 const PURGE_BUDGET_MS=7000;
 /** Vercel cron: expired chat, stale pending uploads, orphaned blobs, within a time budget. Bearer CRON_SECRET only; logs counts only. */
 async function chatPurge(request:Request):Promise<Response>{
  const secret=env.CRON_SECRET,supplied=request.headers.get('authorization')??'';
  if(!secret||request.method!=='GET'||!timingSafeEqual(digest('Bearer '+secret),digest(supplied)))return Response.json({error:'Unauthorized.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const deadline=now()+PURGE_BUDGET_MS;
  try{
   // Same environment-marker guard as the other routes, so a purge can never touch the wrong database.
   guardedPurge??=createGuardedHandler(database(),db=>async()=>{
    if(await isWriteFrozen(db,env as NodeJS.ProcessEnv,now())){console.warn('QCC chat purge skipped: writes are frozen.');return Response.json({ok:true,skipped:'frozen'},{headers:{'Cache-Control':'no-store'}});}
    const query=db.query.bind(db),blobs=await mediaStore();
    const deleted=await purgeExpiredChat(query,blobs,deadline);
    await purgePendingMedia(query,blobs,deadline);
    let orphans=0;
    for(;now()<deadline;){const n=await sweepOrphanMedia(query,blobs,PURGE_BATCH_SIZE,deadline);orphans+=n;if(n<PURGE_BATCH_SIZE)break;}
    console.log(`QCC chat purge: ${deleted} expired messages deleted, ${orphans} orphaned media removed.`);
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
   },{allowMissingMarker:false,context,env:env as NodeJS.ProcessEnv,now});
   return await guardedPurge(request);
  }catch{console.error('QCC chat purge failed.');return Response.json({error:'Purge failed.'},{status:500,headers:{'Cache-Control':'no-store'}});}
 }
 let guardedGrants:((request:Request)=>Promise<Response>)|undefined;
 /**
  * Vercel cron: issue missing weekly Predictions allowances (Monday 00:00 Pacific/Auckland weeks). Uses the same
  * idempotent grant operation as wallet reads and trades, so a missed, late or repeated run neither skips nor
  * doubles a grant; accounts not reached before the time budget are repaired lazily on their next visit.
  * Does nothing while Predictions is disabled, not launched, or writes are frozen. Bearer CRON_SECRET only.
  */
 async function predictionsGrants(request:Request):Promise<Response>{
  const secret=env.CRON_SECRET,supplied=request.headers.get('authorization')??'';
  if(!secret||request.method!=='GET'||!timingSafeEqual(digest('Bearer '+secret),digest(supplied)))return Response.json({error:'Unauthorized.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const deadline=now()+PURGE_BUDGET_MS;
  try{
   guardedGrants??=createGuardedHandler(database(),db=>async()=>{
    const result=await runGrantJob(db,{deadline,now});
    console.log(`QCC predictions grants: ${result.grants} issued across ${result.accounts} accounts, ${result.failed} failed${result.stopped?', stopped at the time budget':''}.`);
    return Response.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
   },{allowMissingMarker:false,context,env:env as NodeJS.ProcessEnv,now});
   return await guardedGrants(request);
  }catch{console.error('QCC predictions grants failed.');return Response.json({error:'Grant job failed.'},{status:500,headers:{'Cache-Control':'no-store'}});}
 }
 const hits=new Map<string,number[]>();
 function limited(key:string,limit:number):boolean{
  const t=now(),recent=(hits.get(key)??[]).filter(at=>t-at<60_000);
  if(recent.length>=limit){hits.set(key,recent);return true;}
  recent.push(t);hits.set(key,recent);
  if(hits.size>10_000)for(const [k,list] of hits)if(!list.some(at=>t-at<60_000))hits.delete(k);
  return false;
 }
 return async function handle(request:Request,clientIp='',trusted:{studyAccountOrigin?:string}={}):Promise<Response>{
  const sanitized=new Headers(request.headers);
  for(const name of [...sanitized.keys()])if(name.startsWith('x-qcc-internal-'))sanitized.delete(name);
  sanitized.delete('x-qcc-public-origin');
  if(env.QCC_WHETU_PAIRING==='on'&&env.QCC_NCEASTUDY_ORIGIN&&trusted.studyAccountOrigin===env.QCC_NCEASTUDY_ORIGIN){
   const parsed=new URL(request.url);
   if(routeOf(parsed.pathname)==='accounts')sanitized.set('x-qcc-internal-study-account-origin',trusted.studyAccountOrigin);
  }
  request=new Request(request,{headers:sanitized});
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
  if(route==='study-link'&&env.QCC_WHETU_PAIRING!=='on')return finish(Response.json({error:'Not found.'},{status:404,headers:{'Cache-Control':'no-store'}}));
  if(request.method==='OPTIONS')return finish(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':ALLOW_METHODS,'Access-Control-Allow-Headers':ALLOW_HEADERS,'Access-Control-Max-Age':'86400','Cache-Control':'no-store'}}));
  if(route==='health')return finish(Response.json({ok:true},{headers:{'Cache-Control':'no-store'}}));
  if(route==='chat-purge')return finish(await chatPurge(request));
  if(route==='predictions-grants')return finish(await predictionsGrants(request));
  const ip=clientIp||'unknown';
  const rejectBudget=()=>finish(Response.json({error:'Too many requests. Try again in a minute.'},{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}}));
  const verifyAction=route==='study-link'&&url.searchParams.get('action')==='verify';
  const capabilityAction=route==='study-link'&&url.searchParams.get('action')==='capabilities';
  if(capabilityAction&&!studyServiceAuthorized(request,env)){
   if(limited('study-capabilities:untrusted|'+ip,120))return rejectBudget();
   return finish(Response.json({error:'Unauthorized.'},{status:401,headers:{'Cache-Control':'no-store'}}));
  }
  // The private runtime has no end-user trusted IP. Do not pool its entire
  // classroom behind Cloudflare egress under the former browser IP ceiling.
  // Authenticate BEFORE choosing this lane; invalid secrets never get it.
  const internalStudy=(verifyAction||capabilityAction)&&request.method==='POST'&&url.searchParams.size===1&&studyServiceAuthorized(request,env);
  if(internalStudy){
   if(limited(capabilityAction?'study-capabilities:service':'study-verify:service',capabilityAction?300:6000))return rejectBudget();
   const browser=studyBrowserProof(request);
   if(browser&&limited('study-verify:browser:'+digest(browser).toString('hex'),300))return rejectBudget();
  }else if(limited(verifyAction?'study-verify:untrusted|'+ip:route+'|'+ip,verifyAction?120:RATE_LIMITS[route]))return rejectBudget();
  // The handlers reject any Origin that differs from the request URL. The allow-list check above already ran,
  // so pass an allowed cross-origin call through without its Origin header.
  let inner=request;
  if(origin&&!sameOrigin&&route!=='study-link'){const headers=new Headers(request.headers);headers.delete('origin');inner=new Request(request,{headers});}
  if(route==='study-link'){
   // Only the host adapter's authenticated clientIp may drive the durable budget.
   const headers=new Headers(inner.headers);headers.delete('x-nf-client-connection-ip');
   if(clientIp)headers.set('x-nf-client-connection-ip',clientIp);
   inner=new Request(inner,{headers});
  }
  return finish(await handler(route)(inner,ip));
 };
}
