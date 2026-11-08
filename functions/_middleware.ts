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
   for(const cookie of readSetCookies(upstream.headers)){
    // Exactly one existing host-only authority cookie, not arbitrary backend cookies.
    if(!/^__Host-nceastudy_browser=[a-f0-9]{64};/i.test(cookie)||/;\s*domain\s*=/i.test(cookie)
     ||!/;\s*path=\/\s*(?:;|$)/i.test(cookie)||!/;\s*secure\s*(?:;|$)/i.test(cookie)
     ||!/;\s*httponly\s*(?:;|$)/i.test(cookie)||!/;\s*samesite=strict\s*(?:;|$)/i.test(cookie))continue;
    responseHeaders.append('Set-Cookie',cookie);
   }
  }
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
 }catch{return error('backend unavailable',502);}
}
