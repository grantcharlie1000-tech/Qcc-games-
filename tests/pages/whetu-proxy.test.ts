import {afterEach,describe,expect,it,vi} from 'vitest';
import {readSetCookies,routeWhetuIntegration,type WhetuIntegrationEnv} from '../../server/whetu-integration';

const HOST='https://nceastudy.pages.dev',API='https://qcc-api.example';
const FAMILY='sb-studyproject-auth-token';
function configured(binding?:WhetuIntegrationEnv['WHETU_INTEGRATION']):WhetuIntegrationEnv{return {QCC_WHETU_INTEGRATION:'on',WHETU_PUBLIC_ORIGIN:HOST,WHETU_SUPABASE_COOKIE:FAMILY,WHETU_INTEGRATION:binding,QCC_API_ORIGIN:API,QCC_PROXY_SECRET:'test-proxy-secret'};}
const stamp={'X-Whetu-Integration':'nceastudy-whetu-v1'};
const request=(path:string,init:RequestInit={})=>new Request(HOST+path,init);
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});

describe('dedicated first-party Whetū service routing',()=>{
 it('supports Workers getAll without splitting comma-bearing cookie expiry dates',()=>{
  const values=['a=1; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/','b=2; Path=/'];
  const headers=new Headers();Object.defineProperty(headers,'getSetCookie',{value:undefined});Object.defineProperty(headers,'getAll',{value:vi.fn(()=>values)});
  expect(readSetCookies(headers)).toEqual(values);
 });
 it('is inert unless the exact server flag is on',async()=>{
  const binding={fetch:vi.fn()};for(const flag of [undefined,'','true','ON','off']){
   expect(await routeWhetuIntegration(request('/nceastudy'),{...configured(binding),QCC_WHETU_INTEGRATION:flag})).toBeNull();
  }expect(binding.fetch).not.toHaveBeenCalled();
 });
 it.each(['/','/assets/app.js','/game-art/snake/cover.webp','/study/photos/image.webp','/api/movies','/api/election','/.netlify/functions/accounts','/cdn-cgi/whetu-private-bank.json'])('does not take ownership of QCC route %s',async path=>{
  const binding={fetch:vi.fn()};expect(await routeWhetuIntegration(request(path),configured(binding))).toBeNull();expect(binding.fetch).not.toHaveBeenCalled();
 });
 it.each(['/api/integrations/nceastudy/identity','/api/internal/discord-test/access','/api/guest-mark','/api/guest-session/intent','/nceastudy/unexpected','/factory','/api/factory'])('refuses non-integrated/server-only route %s',async path=>{
  const binding={fetch:vi.fn()};const result=await routeWhetuIntegration(request(path),configured(binding));expect(result?.status).toBe(404);expect(binding.fetch).not.toHaveBeenCalled();
 });
 it.each(['/nceastudy','/nceastudy/google?from=signup','/nceastudy/billing?action=portal','/nceastudy/billing?action=checkout&cadence=monthly','/nceastudy/billing?action=checkout&cadence=yearly','/nceastudy/billing/return','/questions?subject=english','/signup','/login?next=%2Fquestions','/auth/callback?code=fixture','/_next/static/chunk.js','/_content/fixture-bank.json','/api/questions/index','/api/mark','/images/whetu-sky.webp'])('dispatches approved path %s through the binding, not a network proxy',async path=>{
  let received:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{received=r;return new Response('private-runtime',{headers:stamp});})};
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const result=await routeWhetuIntegration(request(path),configured(binding));expect(result?.status).toBe(200);expect(await result!.text()).toBe('private-runtime');
  expect(received!.url).toBe(HOST+path);expect(fetcher).not.toHaveBeenCalled();
 });
 it('forwards only the configured Whetū cookies and Next headers, never the QCC bearer or intent',async()=>{
  let received:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{received=r;return new Response(null,{status:204,headers:stamp});})};
  await routeWhetuIntegration(request('/api/mark',{method:'POST',body:'{}',headers:{Origin:HOST,'Content-Type':'application/json',Authorization:'Bearer acct_'+'a'.repeat(64),'X-QCC-Proxy-Secret':'spoof','X-Forwarded-Host':'spoof','RSC':'1','Next-Action':'fixture-action',Cookie:[`${FAMILY}=auth`,`${FAMILY}.0=chunk`,`${FAMILY}-code-verifier=pkce`,'sb-other-auth-token=other','kk_device=device','kk_password_recovery=recovery','kk_guest_session=guest','__Host-nceastudy_pair=intent','__Host-nceastudy_context=context','__Host-nceastudy_browser=browser','unrelated=private'].join('; ')}}),configured(binding));
  expect(received!.headers.get('authorization')).toBeNull();expect(received!.headers.get('x-qcc-proxy-secret')).toBeNull();expect(received!.headers.get('x-forwarded-host')).toBeNull();
  expect(received!.headers.get('cookie')).toBe(`${FAMILY}=auth; ${FAMILY}.0=chunk; ${FAMILY}-code-verifier=pkce; kk_device=device; kk_password_recovery=recovery; __Host-nceastudy_context=context; __Host-nceastudy_browser=browser`);
  expect(received!.headers.get('rsc')).toBe('1');expect(received!.headers.get('next-action')).toBe('fixture-action');expect(await received!.text()).toBe('{}');
 });
 it('fails closed without pinned origin, cookie family, service binding or dedicated-runtime marker',async()=>{
  const binding={fetch:vi.fn(async()=>new Response('standalone Whetu',{headers:{'X-Frame-Options':'DENY'}}))};
  for(const patch of [{WHETU_PUBLIC_ORIGIN:undefined},{WHETU_PUBLIC_ORIGIN:'https://other.example'},{WHETU_PUBLIC_ORIGIN:HOST+'/path'},{WHETU_SUPABASE_COOKIE:undefined},{WHETU_SUPABASE_COOKIE:'*'},{WHETU_INTEGRATION:undefined}]){
   const result=await routeWhetuIntegration(request('/nceastudy'),{...configured(binding),...patch});expect(result?.status).toBe(503);
  }
  expect((await routeWhetuIntegration(request('/nceastudy'),configured(binding)))?.status).toBe(502);
 });
 it('preserves dedicated runtime framing/CSP and auth cookies instead of weakening standalone headers',async()=>{
  const headers=new Headers({...stamp,'Content-Security-Policy':"default-src 'self'; frame-ancestors 'self'",'X-Frame-Options':'SAMEORIGIN','Cache-Control':'public, max-age=600'});
  headers.append('Set-Cookie',`${FAMILY}=fixture; Path=/; Secure; SameSite=Lax`);headers.append('Set-Cookie','__Host-nceastudy_pair=forbidden; Path=/; HttpOnly; Secure; SameSite=Strict');
  headers.append('Set-Cookie','__Host-nceastudy_context=forbidden; Path=/; Secure');headers.append('Set-Cookie','__Host-nceastudy_browser=forbidden; Path=/; HttpOnly; Secure; SameSite=Strict');
  const binding={fetch:vi.fn(async()=>new Response('auth screen',{headers}))};const result=await routeWhetuIntegration(request('/signup'),configured(binding));
  expect(result!.headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'self'");expect(result!.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  expect(result!.headers.get('Cache-Control')).toBe('private, no-store');expect(result!.headers.getSetCookie()).toEqual([`${FAMILY}=fixture; Path=/; Secure; SameSite=Lax`]);
 });
 it('routes curriculum JSON through authenticated private runtime handling, never immutable-asset caching',async()=>{
  let received:Request|undefined;
  const binding={fetch:vi.fn(async(r:Request)=>{received=r;return Response.json({fixture:true},{headers:{...stamp,'Cache-Control':'public, max-age=31536000, immutable'}});})};
  const result=await routeWhetuIntegration(request('/_content/fixture-bank.json',{headers:{Authorization:'Bearer acct_'+'a'.repeat(64),Cookie:`${FAMILY}=auth; __Host-nceastudy_browser=browser; __Host-nceastudy_context=context; __Host-nceastudy_pair=intent; unrelated=secret`}}),configured(binding));
  expect(result?.status).toBe(200);expect(received!.headers.get('Cookie')).toBe(`${FAMILY}=auth; __Host-nceastudy_browser=browser; __Host-nceastudy_context=context`);
  expect(received!.headers.has('Authorization')).toBe(false);expect(result!.headers.get('Cache-Control')).toBe('private, no-store');expect(await result!.json()).toEqual({fixture:true});
 });
 it('does not relay cookies on immutable Next static assets',async()=>{
  const binding={fetch:vi.fn(async(r:Request)=>{expect(r.headers.has('Cookie')).toBe(false);return new Response('chunk',{headers:{...stamp,'Cache-Control':'public, max-age=31536000, immutable','Set-Cookie':`${FAMILY}=bad; Path=/; Secure`}});})};
  const result=await routeWhetuIntegration(request('/_next/static/chunk.js',{headers:{Cookie:`${FAMILY}=auth`}}),configured(binding));
  expect(result!.headers.get('Cache-Control')).toContain('immutable');expect(result!.headers.has('Set-Cookie')).toBe(false);
 });
 it('limits time to response headers without aborting a healthy long-lived tutor stream',async()=>{
  vi.useFakeTimers();let received:Request|undefined,writer!:ReadableStreamDefaultController<Uint8Array>;
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
  const stream=new ReadableStream<Uint8Array>({start(controller){writer=controller;}});
  const binding={fetch:vi.fn(async(r:Request)=>{received=r;return new Response(stream,{headers:stamp});})};
  const result=await routeWhetuIntegration(request('/api/chat',{method:'POST',headers:{Origin:HOST},body:'{}'}),configured(binding));
  await vi.advanceTimersByTimeAsync(20_000);expect(received!.signal.aborted).toBe(false);
  writer.enqueue(new TextEncoder().encode('complete tutor answer'));writer.close();expect(await result!.text()).toBe('complete tutor answer');
 });
 it('preserves validated same-origin Next server-action redirects and cache revalidation',async()=>{
  const binding={fetch:vi.fn(async()=>new Response('action',{headers:{...stamp,'X-Action-Redirect':'/login?next=%2Fquestions;push','X-Action-Revalidated':'[[],0,1]'}}))};
  const result=await routeWhetuIntegration(request('/questions',{method:'POST',headers:{Origin:HOST,'Next-Action':'action-id'},body:'fixture'}),configured(binding));
  expect(result!.headers.get('X-Action-Redirect')).toBe('/login?next=%2Fquestions;push');expect(result!.headers.get('X-Action-Revalidated')).toBe('[[],0,1]');
 });
 it('rejects off-site Next server-action redirect controls',async()=>{
  const binding={fetch:vi.fn(async()=>new Response('action',{headers:{...stamp,'X-Action-Redirect':'https://other.example/;push'}}))};
  expect((await routeWhetuIntegration(request('/questions',{method:'POST',headers:{Origin:HOST},body:'fixture'}),configured(binding)))!.status).toBe(502);
 });
 it('rejects foreign mutations and redirects without following them with cookies',async()=>{
  const binding={fetch:vi.fn(async(r:Request)=>{expect(r.redirect).toBe('manual');return new Response(null,{status:302,headers:{...stamp,Location:'https://other.example/'}});})};
  expect((await routeWhetuIntegration(request('/api/mark',{method:'POST',body:'{}',headers:{Origin:'https://other.example'}}),configured(binding)))?.status).toBe(403);
  expect(binding.fetch).not.toHaveBeenCalled();
  expect((await routeWhetuIntegration(request('/questions'),configured(binding)))?.status).toBe(502);
 });
});

describe('QCC-owned pairing adapter',()=>{
 it('routes pairing exclusively to the configured QCC backend and never sends its bearer to Whetū',async()=>{
  let received:Request|undefined;const binding={fetch:vi.fn()};vi.stubGlobal('fetch',vi.fn(async(r:Request)=>{received=r;return Response.json({started:true},{headers:{'Set-Cookie':'__Host-nceastudy_pair=fixture; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300'}});}));
  const result=await routeWhetuIntegration(request('/api/integrations/nceastudy/link/start',{method:'POST',headers:{Origin:HOST,'Content-Type':'application/json',Authorization:'Bearer acct_'+'a'.repeat(64),Cookie:`${FAMILY}=auth; __Host-nceastudy_pair=proof; unrelated=secret`},body:'{"consent":true}'}),configured(binding));
  expect(result!.status).toBe(200);expect(received!.url).toBe(API+'/.netlify/functions/study-link?action=start');expect(received!.headers.get('Authorization')).toContain('acct_');expect(received!.headers.get('X-QCC-Proxy-Secret')).toBe('test-proxy-secret');
  expect(received!.headers.get('Cookie')).toBe(`${FAMILY}=auth; __Host-nceastudy_pair=proof`);expect(result!.headers.getSetCookie()).toHaveLength(1);expect(binding.fetch).not.toHaveBeenCalled();
 });
 it('keeps browser-selection proof on QCC backend calls and accepts only its secure cookie',async()=>{
  let received:Request|undefined;
  vi.stubGlobal('fetch',vi.fn(async(r:Request)=>{received=r;const headers=new Headers({'Content-Type':'application/json'});headers.append('Set-Cookie','__Host-nceastudy_browser=browser-proof; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000');headers.append('Set-Cookie','unrelated=forbidden; Path=/; HttpOnly; Secure; SameSite=Strict');return new Response('{"selected":true}',{headers});}));
  const result=await routeWhetuIntegration(request('/api/integrations/nceastudy/link/select',{method:'POST',headers:{Origin:HOST,'Content-Type':'application/json',Authorization:'Bearer acct_'+'a'.repeat(64),Cookie:'__Host-nceastudy_browser=browser-proof; __Host-nceastudy_context=context; unrelated=secret'},body:'{}'}),configured({fetch:vi.fn()}));
  expect(received!.url).toBe(API+'/.netlify/functions/study-link?action=select');expect(received!.headers.get('Cookie')).toBe('__Host-nceastudy_browser=browser-proof; __Host-nceastudy_context=context');
  expect(result!.headers.getSetCookie()).toEqual(['__Host-nceastudy_browser=browser-proof; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000']);expect(result!.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it.each(['','unknown','start/extra','identity','verify'])('rejects unsupported pairing action %s',async action=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await routeWhetuIntegration(request('/api/integrations/nceastudy/link/'+action),configured()))?.status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
 });
 it('rejects absent/foreign origin or non-JSON and never forwards an upstream Location',async()=>{
  const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}}));vi.stubGlobal('fetch',fetcher);
  for(const headers of <HeadersInit[]>[{'Content-Type':'application/json'},{Origin:'https://other.example','Content-Type':'application/json'},{Origin:HOST,'Content-Type':'text/plain'}]){
   const result=await routeWhetuIntegration(request('/api/integrations/nceastudy/link/start',{method:'POST',headers,body:'{}'}),configured());expect([403,415]).toContain(result?.status);
  }expect(fetcher).not.toHaveBeenCalled();
  const result=await routeWhetuIntegration(request('/api/integrations/nceastudy/link/start',{method:'POST',headers:{Origin:HOST,'Content-Type':'application/json'},body:'{}'}),configured());expect(result?.status).toBe(502);
 });
});


describe('fixed billing page handoffs',()=>{
 it.each(['/nceastudy/billing?action=portal','/nceastudy/billing/return'])('supports HEAD for exact read-only page %s',async path=>{
  const binding={fetch:vi.fn(async()=>new Response(null,{headers:stamp}))};
  expect((await routeWhetuIntegration(request(path,{method:'HEAD'}),configured(binding)))?.status).toBe(200);expect(binding.fetch).toHaveBeenCalledOnce();
 });
 it.each(['POST','PUT','DELETE','OPTIONS'])('refuses %s on billing and return before runtime execution',async method=>{
  const binding={fetch:vi.fn()};for(const path of ['/nceastudy/billing?action=portal','/nceastudy/billing/return']){
   expect((await routeWhetuIntegration(request(path,{method,headers:{Origin:HOST}}),configured(binding)))?.status).toBe(405);
  }expect(binding.fetch).not.toHaveBeenCalled();
 });
 it.each(['/nceastudy/billing/extra','/nceastudy/billing/return/extra','/nceastudy/billing/return/'])('does not broaden neighboring page %s',async path=>{
  const binding={fetch:vi.fn()};expect((await routeWhetuIntegration(request(path),configured(binding)))?.status).toBe(404);expect(binding.fetch).not.toHaveBeenCalled();
 });
 it('keeps the protected handoff authenticated while stripping bearer/action credentials',async()=>{
  let received:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{received=r;return new Response('handoff',{headers:stamp});})};
  const result=await routeWhetuIntegration(request('/nceastudy/billing?action=portal',{headers:{Authorization:'Bearer acct_'+'a'.repeat(64),'Next-Action':'unrequested-action',Cookie:`${FAMILY}=auth; __Host-nceastudy_browser=browser; __Host-nceastudy_context=context; __Host-nceastudy_pair=intent`}}),configured(binding));
  expect(result?.status).toBe(200);expect(received!.headers.get('Cookie')).toBe(`${FAMILY}=auth; __Host-nceastudy_browser=browser; __Host-nceastudy_context=context`);expect(received!.headers.has('Authorization')).toBe(false);expect(received!.headers.has('Next-Action')).toBe(false);expect(result!.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it('makes public billing return cookie-free and never relays an auth cookie mutation',async()=>{
  let received:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{received=r;return new Response('informational only',{headers:{...stamp,'Set-Cookie':`${FAMILY}=unexpected; Path=/; Secure; SameSite=Lax`}});})};
  const result=await routeWhetuIntegration(request('/nceastudy/billing/return',{headers:{Authorization:'Bearer acct_'+'a'.repeat(64),'Next-Action':'unrequested-action',Cookie:`${FAMILY}=auth; __Host-nceastudy_browser=browser; __Host-nceastudy_context=context`}}),configured(binding));
  expect(result?.status).toBe(200);expect(received!.headers.has('Cookie')).toBe(false);expect(received!.headers.has('Authorization')).toBe(false);expect(received!.headers.has('Next-Action')).toBe(false);expect(result!.headers.has('Set-Cookie')).toBe(false);expect(result!.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it.each(['?status=paid','?session_id=untrusted','?next=https%3A%2F%2Fother.example','?action=portal'])('rejects all billing-return query state %s',async search=>{
  const binding={fetch:vi.fn()};expect((await routeWhetuIntegration(request('/nceastudy/billing/return'+search),configured(binding)))?.status).toBe(400);expect(binding.fetch).not.toHaveBeenCalled();
 });
 it('does not permit automatic redirects from the informational return landing',async()=>{
  for(const {status,headers} of <{status:number;headers:HeadersInit}[]>[{status:302,headers:{...stamp,Location:'/account'}},{status:200,headers:{...stamp,'X-Action-Redirect':'/account;push'}}]){
   const binding={fetch:vi.fn(async()=>new Response(null,{status,headers}))};expect((await routeWhetuIntegration(request('/nceastudy/billing/return'),configured(binding)))?.status).toBe(502);
  }
 });
});


describe('framework-only return query handling',()=>{
 it('preserves a single bounded Next RSC key without treating it as account or payment state',async()=>{
  let received:Request|undefined;const binding={fetch:vi.fn(async(r:Request)=>{received=r;return new Response('flight',{headers:stamp});})};
  const result=await routeWhetuIntegration(request('/nceastudy/billing/return?_rsc=fixture-cache-key',{headers:{RSC:'1',Referer:'https://checkout.stripe.com/private-path',Cookie:`${FAMILY}=auth; __Host-nceastudy_browser=browser`}}),configured(binding));
  expect(result?.status).toBe(200);expect(received!.url).toContain('?_rsc=fixture-cache-key');expect(received!.headers.get('RSC')).toBe('1');expect(received!.headers.has('Cookie')).toBe(false);expect(received!.headers.has('Referer')).toBe(false);
 });
 it.each(['?_rsc=one&_rsc=two','?_rsc=one&status=paid','?_rsc=https%3A%2F%2Fother.example','?_rsc=','?_rsc='+ 'x'.repeat(129)])('refuses malformed/internal-plus-user query state %s',async search=>{
  const binding={fetch:vi.fn()};expect((await routeWhetuIntegration(request('/nceastudy/billing/return'+search),configured(binding)))?.status).toBe(400);expect(binding.fetch).not.toHaveBeenCalled();
 });
});

it('does not make billing a general-purpose external redirect exception',async()=>{
 const binding={fetch:vi.fn(async()=>new Response(null,{status:303,headers:{...stamp,Location:'https://checkout.stripe.com/unrequested'}}))};
 expect((await routeWhetuIntegration(request('/nceastudy/billing?action=portal'),configured(binding)))?.status).toBe(502);
});
