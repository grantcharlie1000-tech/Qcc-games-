interface ProxyContext {
 request:Request;
 env:{QCC_API_ORIGIN?:string};
 next:()=>Promise<Response>;
}

const PREFIX='/.netlify/functions/';
const ROUTES=new Set(['accounts','leaderboard','turn']);
const UPSTREAM_TIMEOUT_MS=10_000;
const HOP_HEADERS=['connection','keep-alive','proxy-authenticate','proxy-authorization','proxy-connection','te','trailer','transfer-encoding','upgrade'];

function endToEndHeaders(source:Headers):Headers {
 const headers=new Headers(source);
 // Connection can nominate additional hop-by-hop headers, regardless of case.
 for(const name of (source.get('connection')??'').split(','))if(name.trim())headers.delete(name.trim());
 for(const name of HOP_HEADERS)headers.delete(name);
 return headers;
}
const error=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

// Root middleware avoids relying on Pages discovering a `.netlify` directory.
// public/_routes.json limits invocations to PREFIX, so static requests stay free.
export async function onRequest({request,env,next}:ProxyContext):Promise<Response> {
 const url=new URL(request.url);
 if(!url.pathname.startsWith(PREFIX))return next();
 if(!ROUTES.has(url.pathname.slice(PREFIX.length)))return error('not found',404);
 const configured=env.QCC_API_ORIGIN?.trim();
 if(!configured)return error('backend not configured',503);
 try{
  const origin=new URL(configured);
  if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Invalid backend origin');
  const headers=endToEndHeaders(request.headers);headers.delete('host');
  // Cloudflare sets CF-Connecting-IP. Replace visitor-supplied forwarding chains.
  // The account auth limiter still reads the legacy Netlify client-IP header.
  const ip=request.headers.get('CF-Connecting-IP')?.trim();
  for(const name of ['X-Forwarded-For','X-Real-IP','X-Nf-Client-Connection-Ip']){
   headers.delete(name);if(ip)headers.set(name,ip);
  }
  const upstream=await fetch(new Request(origin.origin+url.pathname+url.search,{
   method:request.method,headers,body:request.body,redirect:'manual',signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
   // Node's Web Request requires this for streams; the Workers runtime ignores it.
   duplex:'half'
  } as RequestInit));
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:endToEndHeaders(upstream.headers)});
 }catch{return error('backend unavailable',502);}
}
