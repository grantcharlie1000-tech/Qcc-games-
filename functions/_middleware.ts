interface ProxyContext {
 request:Request;
 env:{QCC_API_ORIGIN?:string;QCC_PROXY_SECRET?:string};
 next:()=>Promise<Response>;
}

const PREFIX='/.netlify/functions/';
const ROUTES=new Set(['accounts','leaderboard','turn','social','chat','media']);
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
 const url=new URL(request.url);
 if(!url.pathname.startsWith(PREFIX))return next();
 if(!ROUTES.has(url.pathname.slice(PREFIX.length)))return error('not found',404);
 const configured=env.QCC_API_ORIGIN?.trim(),secret=env.QCC_PROXY_SECRET?.trim();
 if(!configured||!secret)return error('backend not configured',503);
 try{
  const origin=new URL(configured);
  if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Invalid backend origin');
  const headers=allowedHeaders(request.headers,REQUEST_HEADERS);
  // Only Cloudflare's visitor IP and the server binding may populate these.
  const ip=request.headers.get('CF-Connecting-IP')?.trim();
  if(ip)headers.set('X-QCC-Client-IP',ip);
  headers.set('X-QCC-Proxy-Secret',secret);
  const upstream=await fetch(new Request(origin.origin+url.pathname+url.search,{
   method:request.method,headers,body:request.body,redirect:'manual',signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
   // Node's Web Request requires this for streams; the Workers runtime ignores it.
   duplex:'half'
  } as RequestInit));
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:allowedHeaders(upstream.headers,RESPONSE_HEADERS)});
 }catch{return error('backend unavailable',502);}
}
