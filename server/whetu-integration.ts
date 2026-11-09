import routes from './whetu-routes.json';

const INTEGRATION='nceastudy-whetu-v1';
const LINK_PREFIX='/api/integrations/nceastudy/link/';
const LINK_ACTIONS=new Set(['start','review','confirm','cancel','status','select']);
const UPSTREAM_TIMEOUT=10_000;
const BILLING_PAGE='/nceastudy/billing',BILLING_RETURN='/nceastudy/billing/return';
const REQUEST_HEADERS=['Accept','Accept-Language','Content-Type','Origin','Referer','Sec-Fetch-Site','Sec-Fetch-Mode','Sec-Fetch-Dest','RSC','Next-Router-State-Tree','Next-Router-Prefetch','Next-Url','Next-Action','X-Nextjs-Data','X-Deployment-Id'];
const RESPONSE_HEADERS=['Content-Type','Content-Disposition','Content-Length','Content-Encoding','Cache-Control','ETag','Vary','Link','Retry-After','Content-Security-Policy','X-Frame-Options','X-Content-Type-Options','Referrer-Policy','Permissions-Policy','Strict-Transport-Security','X-Robots-Tag','X-Whetu-Integration','X-Nextjs-Cache','X-Nextjs-Prerender','X-Nextjs-Stale-Time','X-Deployment-Id','X-Action-Revalidated'];
const CONTEXT_COOKIE='__Host-nceastudy_context',PAIR_COOKIE='__Host-nceastudy_pair',BROWSER_COOKIE='__Host-nceastudy_browser';

export interface WhetuIntegrationEnv {
 QCC_WHETU_INTEGRATION?:string;
 WHETU_PUBLIC_ORIGIN?:string;
 WHETU_SUPABASE_COOKIE?:string;
 WHETU_INTEGRATION?:{fetch(request:Request):Promise<Response>};
 QCC_API_ORIGIN?:string;
 QCC_PROXY_SECRET?:string;
}
const matches=(pathname:string,prefix:string)=>pathname===prefix||pathname.startsWith(prefix+'/');
const error=(status:number,reason:string)=>Response.json({integration:INTEGRATION,ready:false,error:reason},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
function exactHttpsOrigin(value:string|undefined):string|null {
 try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash?url.origin:null;}catch{return null;}
}
const copyHeaders=(source:Headers,names:readonly string[])=>{const target=new Headers();for(const name of names){const value=source.get(name);if(value!==null)target.set(name,value);}return target;};
function familyCookie(name:string,family:string,verifier:boolean):boolean {
 for(const base of verifier?[family,family+'-code-verifier']:[family]){
  if(name===base||(name.startsWith(base+'.')&&/^\d+$/.test(name.slice(base.length+1))))return true;
 }return false;
}
function cookieHeader(raw:string|null,allowed:(name:string)=>boolean):string {
 return (raw??'').split(';').map(part=>part.trim()).filter(part=>{
  const at=part.indexOf('=');return at>0&&!/[\r\n]/.test(part)&&allowed(part.slice(0,at));
 }).join('; ');
}
export function readSetCookies(source:Headers):string[]{
 if(typeof source.getSetCookie==='function')return source.getSetCookie();
 const legacy=source as Headers&{getAll?:(name:string)=>string[]};
 if(typeof legacy.getAll==='function')return legacy.getAll('Set-Cookie');
 if(source.has('Set-Cookie'))throw new Error('Runtime cannot safely preserve multiple cookies.');
 return [];
}
function approvedSetCookies(source:Headers,target:Headers,allowed:(name:string)=>boolean,strict=false){
 for(const value of readSetCookies(source)){
  const name=value.slice(0,value.indexOf('='));
  if(!allowed(name)||/;\s*domain\s*=/i.test(value)||!/(?:^|;)\s*secure\s*(?:;|$)/i.test(value))continue;
  if(strict&&(!/;\s*path=\/\s*(?:;|$)/i.test(value)||!/;\s*httponly\s*(?:;|$)/i.test(value)||!/;\s*samesite=strict\s*(?:;|$)/i.test(value)))continue;
  target.append('Set-Cookie',value);
 }
}
function runtimePath(path:string):boolean {
 return routes.pageExact.includes(path)||routes.pages.some(prefix=>matches(path,prefix))||routes.apiPrefixes.some(prefix=>matches(path,prefix))||routes.apiExact.includes(path)
  ||routes.assetPrefixes.some(prefix=>matches(path,prefix))||routes.assetExact.includes(path);
}

/**
 * Dedicated service binding only, never a user-configurable HTTP proxy.
 * A null result leaves all existing QCC behavior exactly with the old router.
 */
export async function routeWhetuIntegration(request:Request,env:WhetuIntegrationEnv):Promise<Response|null> {
 const url=new URL(request.url);
 if(env.QCC_WHETU_INTEGRATION!=='on')return url.pathname==='/api/integrations/nceastudy'?error(503,'integration unavailable'):null;
 const link=url.pathname.startsWith(LINK_PREFIX);
 if(routes.denied.some(prefix=>matches(url.pathname,prefix))||(matches(url.pathname,'/nceastudy')&&!routes.pageExact.includes(url.pathname)))return error(404,'not found');
 if(!link&&!runtimePath(url.pathname))return null;
 const billingPage=url.pathname===BILLING_PAGE||url.pathname===BILLING_RETURN,publicReturn=url.pathname===BILLING_RETURN;
 if(billingPage&&!['GET','HEAD'].includes(request.method))return error(405,'method not allowed');
 // Next's internal RSC cache key is not a destination, payment result or identity proof.
 if(publicReturn&&url.search&&(url.searchParams.size!==1||url.searchParams.getAll('_rsc').length!==1||!/^[A-Za-z0-9_.-]{1,128}$/.test(url.searchParams.get('_rsc')??'')))return error(400,'return query not allowed');
 const origin=exactHttpsOrigin(env.WHETU_PUBLIC_ORIGIN),family=env.WHETU_SUPABASE_COOKIE??'';
 if(!origin||origin!==url.origin||!/^sb-[a-z0-9-]+-auth-token$/.test(family)||family.length>120)return error(503,'integration not configured');
 if(link)return proxyLink(request,env,origin,family);
 if(!env.WHETU_INTEGRATION)return error(503,'private runtime not configured');
 if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.get('Origin')!==origin)return error(403,'request not allowed');
 const immutable=url.pathname.startsWith('/_next/static/');
 const allowedCookie=(name:string)=>familyCookie(name,family,true)||['kk_device','kk_password_recovery',CONTEXT_COOKIE,BROWSER_COOKIE].includes(name);
 const runtimeOwnedCookie=(name:string)=>familyCookie(name,family,true)||['kk_device','kk_password_recovery'].includes(name);
 const headers=copyHeaders(request.headers,REQUEST_HEADERS);
 if(billingPage)headers.delete('Next-Action');
 if(publicReturn)headers.delete('Referer');
 if(!immutable&&!publicReturn){const cookies=cookieHeader(request.headers.get('Cookie'),allowedCookie);if(cookies)headers.set('Cookie',cookies);}
 const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),UPSTREAM_TIMEOUT);
 try{
  const upstream=await env.WHETU_INTEGRATION.fetch(new Request(request.url,{
   method:request.method,headers,body:request.body,redirect:'manual',signal:AbortSignal.any([request.signal,abort.signal]),duplex:'half',
  } as RequestInit));
  // Marking/tutor bodies can legitimately stream longer than the header budget.
  // The original caller's abort still propagates, but this deadline must not.
  clearTimeout(deadline);
  if(upstream.headers.get('X-Whetu-Integration')!==INTEGRATION){await upstream.body?.cancel();return error(502,'unexpected private runtime');}
  const responseHeaders=copyHeaders(upstream.headers,RESPONSE_HEADERS);
  if(publicReturn&&((upstream.status>=300&&upstream.status<400)||upstream.headers.has('Location')||upstream.headers.has('X-Action-Redirect'))){
   await upstream.body?.cancel();return error(502,'unexpected return redirect');
  }
  const location=upstream.headers.get('Location');
  if(location){
   const next=new URL(location,origin);
   if(next.origin!==origin||!runtimePath(next.pathname)){await upstream.body?.cancel();return error(502,'unexpected runtime redirect');}
   responseHeaders.set('Location',next.pathname+next.search+next.hash);
  }
  const actionRedirect=upstream.headers.get('X-Action-Redirect');
  if(actionRedirect){
   const delimiter=actionRedirect.lastIndexOf(';'),kind=actionRedirect.slice(delimiter+1),next=new URL(actionRedirect.slice(0,delimiter),origin);
   if(delimiter<1||!['push','replace'].includes(kind)||next.origin!==origin||!runtimePath(next.pathname)){
    await upstream.body?.cancel();return error(502,'unexpected action redirect');
   }
   responseHeaders.set('X-Action-Redirect',next.pathname+next.search+next.hash+';'+kind);
  }
  if(!immutable){responseHeaders.set('Cache-Control','private, no-store');if(!publicReturn)approvedSetCookies(upstream.headers,responseHeaders,runtimeOwnedCookie);}
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
 }catch{return error(502,'private runtime unavailable');}finally{clearTimeout(deadline);}
}

async function proxyLink(request:Request,env:WhetuIntegrationEnv,origin:string,family:string):Promise<Response>{
 const action=new URL(request.url).pathname.slice(LINK_PREFIX.length);
 if(!LINK_ACTIONS.has(action))return error(404,'not found');
 if(request.method!=='POST')return error(405,'method not allowed');
 if(request.headers.get('Origin')!==origin||!['same-origin',null].includes(request.headers.get('Sec-Fetch-Site')))return error(403,'request not allowed');
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))return error(415,'send JSON');
 const backend=exactHttpsOrigin(env.QCC_API_ORIGIN),secret=env.QCC_PROXY_SECRET?.trim();
 if(!backend||!secret)return error(503,'pairing backend not configured');
 const headers=copyHeaders(request.headers,['Authorization','Content-Type','Origin','Sec-Fetch-Site','Accept']);
 const cookies=cookieHeader(request.headers.get('Cookie'),name=>familyCookie(name,family,false)||[PAIR_COOKIE,CONTEXT_COOKIE,BROWSER_COOKIE].includes(name));
 if(cookies)headers.set('Cookie',cookies);
 headers.set('X-QCC-Proxy-Secret',secret);
 const ip=request.headers.get('CF-Connecting-IP')?.trim();if(ip)headers.set('X-QCC-Client-IP',ip);
 try{
  const upstream=await fetch(new Request(`${backend}/.netlify/functions/study-link?action=${action}`,{
   method:'POST',headers,body:request.body,redirect:'manual',signal:AbortSignal.timeout(UPSTREAM_TIMEOUT),duplex:'half',
  } as RequestInit));
  if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();return error(502,'unexpected pairing response');}
  const responseHeaders=copyHeaders(upstream.headers,['Content-Type','Retry-After']);responseHeaders.set('Cache-Control','private, no-store');responseHeaders.set('X-Content-Type-Options','nosniff');
  approvedSetCookies(upstream.headers,responseHeaders,name=>name===PAIR_COOKIE||name===CONTEXT_COOKIE||name===BROWSER_COOKIE,true);
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
 }catch{return error(502,'pairing backend unavailable');}
}
