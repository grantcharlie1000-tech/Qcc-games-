import {readSetCookies,routeWhetuIntegration,type WhetuIntegrationEnv} from '../server/whetu-integration';

interface ProxyContext {
 request:Request;
 env:WhetuIntegrationEnv;
 next:()=>Promise<Response>;
}

const PREFIX='/.netlify/functions/';
const ROUTES=new Set(['accounts','leaderboard','turn','social','chat','media','predictions']);
const UPSTREAM_TIMEOUT_MS=10_000;
const REQUEST_HEADERS=['Authorization','Content-Type','X-QCC-Sync','Accept'];
const RESPONSE_HEADERS=['Content-Type','Retry-After','Cache-Control','ETag','Vary'];

function allowedHeaders(source:Headers,names:string[]):Headers {
 const headers=new Headers();
 for(const name of names){const value=source.get(name);if(value!==null)headers.set(name,value);}
 return headers;
}
const error=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

// Root middleware avoids relying on Pages discovering a `.netlify` directory.
// public/_routes.json invokes this middleware for PREFIX and native /api routes;
// next() leaves /api/movies to its own Function and static requests stay free.
export async function onRequest({request,env,next}:ProxyContext):Promise<Response> {
 const study=await routeWhetuIntegration(request,env);if(study)return study;
 const url=new URL(request.url);
 if(!url.pathname.startsWith(PREFIX))return next();
 if(!ROUTES.has(url.pathname.slice(PREFIX.length)))return error('not found',404);
 const configured=env.QCC_API_ORIGIN?.trim(),secret=env.QCC_PROXY_SECRET?.trim();
 if(!configured||!secret)return error('backend not configured',503);
 try{
  const origin=new URL(configured);
  if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Invalid backend origin');
  const headers=allowedHeaders(request.headers,REQUEST_HEADERS);
  // This fixed origin is server-owned context, never a browser-supplied header.
  const studyAuth=env.QCC_WHETU_INTEGRATION==='on'&&env.WHETU_PUBLIC_ORIGIN===url.origin&&url.pathname===PREFIX+'accounts';
  if(studyAuth)headers.set('X-QCC-Public-Origin',url.origin);
  // Only Cloudflare's visitor IP and the server binding may populate these.
  const ip=request.headers.get('CF-Connecting-IP')?.trim();
  if(ip)headers.set('X-QCC-Client-IP',ip);
  headers.set('X-QCC-Proxy-Secret',secret);
  const upstream=await fetch(new Request(origin.origin+url.pathname+url.search,{
   method:request.method,headers,body:request.body,redirect:'manual',signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
   // Node's Web Request requires this for streams; the Workers runtime ignores it.
   duplex:'half'
  } as RequestInit));
  const responseHeaders=allowedHeaders(upstream.headers,RESPONSE_HEADERS);
  if(studyAuth&&['login','signup'].includes(url.searchParams.get('action')??'')&&[200,201].includes(upstream.status)){
   let cookies:string[]=[];try{cookies=readSetCookies(upstream.headers);}catch{/* Never make optional Study cookie handling block QCC login. */}
   const authority=cookies.filter(cookie=>cookie.slice(0,cookie.indexOf('='))==='__Host-nceastudy_browser');
   let approved:string|undefined;
   if(authority.length===1){
    const [value,...attributes]=authority[0]!.split(';').map(part=>part.trim());
    const fields=new Map<string,string>();let valid=true;
    for(const attribute of attributes){
     const equal=attribute.indexOf('='),name=(equal<0?attribute:attribute.slice(0,equal)).toLowerCase(),setting=equal<0?'':attribute.slice(equal+1);
     if(fields.has(name)||!['path','secure','httponly','samesite','max-age'].includes(name)){valid=false;break;}
     fields.set(name,setting);
    }
    if(valid&&/^__Host-nceastudy_browser=[a-f0-9]{64}$/.test(value!)&&fields.size===5&&fields.get('path')==='/'
     &&fields.get('secure')===''&&fields.get('httponly')===''&&fields.get('samesite')?.toLowerCase()==='strict'&&fields.get('max-age')==='2592000')approved=authority[0];
   }
   if(!approved){
    // Old/malformed/ambiguous backend responses cannot retain a previous account's authority.
    // This fresh, unbound proof has no database row: QCC succeeds, only Study fails closed.
    const unbound=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
    approved=`__Host-nceastudy_browser=${unbound}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
   }
   responseHeaders.append('Set-Cookie',approved);
  }
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
 }catch{return error('backend unavailable',502);}
}
