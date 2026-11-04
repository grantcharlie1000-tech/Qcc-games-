import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {onRequest} from '../../functions/_middleware';

const origin='https://qcc-games-api.vercel.app';
const prefix='/.netlify/functions/';
function context(path:string,init:RequestInit={},env:{QCC_API_ORIGIN?:string;QCC_PROXY_SECRET?:string}={QCC_API_ORIGIN:origin,QCC_PROXY_SECRET:'test-proxy-secret'}){
 return {request:new Request('https://qcc-games.pages.dev'+path,init),env,next:vi.fn(async()=>new Response('static'))};
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
describe('Pages API proxy',()=>{
 it.each(['accounts','leaderboard','turn','social','chat','media'])('proxies the allowed %s route',async route=>{
  const fetcher=vi.fn(async(_request:Request)=>new Response('upstream'));vi.stubGlobal('fetch',fetcher);
  const response=await onRequest(context(prefix+route));
  expect(response.status).toBe(200);expect(await response.text()).toBe('upstream');
  expect(fetcher).toHaveBeenCalledOnce();
  const request=fetcher.mock.calls[0]![0];
  expect(request.url).toBe(origin+prefix+route);
 });
 it.each(['unknown','movies-search','accounts/extra','social/extra','accounts/','ACCOUNTS','%61ccounts',''])('returns 404 for disallowed route %s',async route=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const ctx=context(prefix+route,{},{}),response=await onRequest(ctx);
  expect(response.status).toBe(404);expect(fetcher).not.toHaveBeenCalled();expect(ctx.next).not.toHaveBeenCalled();
 });
 it.each(['/','/assets/main.js','/api/movies','/api/accounts','/.netlify/functions-other/accounts'])('passes %s to the next route',async path=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const ctx=context(path,{},{});
  expect(await(await onRequest(ctx)).text()).toBe('static');expect(ctx.next).toHaveBeenCalledOnce();expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([{}, {QCC_API_ORIGIN:origin}, {QCC_PROXY_SECRET:'test-proxy-secret'}])('returns no-store JSON 503 when required backend config is missing: %j',async env=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await onRequest(context(prefix+'accounts',{},env));
  expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'backend not configured'});
  expect(response.headers.get('cache-control')).toBe('no-store');expect(fetcher).not.toHaveBeenCalled();
 });
 it('preserves method, raw query and streaming body with only allowed headers and trusted proxy credentials',async()=>{
  let received:Request|undefined;
  vi.stubGlobal('fetch',vi.fn(async(request:Request)=>{received=request;return new Response(null,{status:204});}));
  const body='{"cursor":"0","bases":{},"saves":{}}';
  const ctx=context(prefix+'accounts?action=sync&tag=a%2Bb&tag=a+b',{method:'PUT',body,headers:{
   Host:'qcc-games.pages.dev',Authorization:'Bearer test-session',Cookie:'session=test',Origin:'https://qcc-games.pages.dev',
   'Content-Type':'application/json','X-QCC-Sync':'2',Accept:'application/json','CF-Connecting-IP':'203.0.113.7',
   'X-QCC-Client-IP':'spoofed','X-QCC-Proxy-Secret':'visitor-secret','X-Arbitrary':'private',
   'X-Forwarded-For':'spoofed, proxy','X-Real-IP':'spoofed','X-Nf-Client-Connection-Ip':'spoofed',
   Connection:'keep-alive, X-Remove-Me','Keep-Alive':'timeout=5','X-Remove-Me':'remove','Proxy-Connection':'keep-alive',
   'Proxy-Authorization':'secret','TE':'trailers','Trailer':'X-Checksum','Upgrade':'websocket'
  }});
  expect((await onRequest(ctx)).status).toBe(204);
  expect(received!.url).toBe(origin+prefix+'accounts?action=sync&tag=a%2Bb&tag=a+b');
  expect(received!.method).toBe('PUT');expect(await received!.text()).toBe(body);
  expect(Object.fromEntries(received!.headers)).toEqual({authorization:'Bearer test-session','content-type':'application/json','x-qcc-sync':'2',accept:'application/json','x-qcc-client-ip':'203.0.113.7','x-qcc-proxy-secret':'test-proxy-secret'});
  expect(ctx.request.bodyUsed).toBe(true);
 });
 it('removes spoofed forwarding headers when CF-Connecting-IP is absent',async()=>{
  let received:Request|undefined;vi.stubGlobal('fetch',async(request:Request)=>{received=request;return new Response('ok');});
  await onRequest(context(prefix+'accounts',{headers:{'X-QCC-Client-IP':'spoofed','X-Forwarded-For':'spoofed','X-Real-IP':'spoofed','X-Nf-Client-Connection-Ip':'spoofed'}}));
  for(const key of ['X-QCC-Client-IP','X-Forwarded-For','X-Real-IP','X-Nf-Client-Connection-Ip'])expect(received!.headers.has(key)).toBe(false);
 });
 it('returns the response stream immediately with status and only the allowed response headers',async()=>{
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const stream=new ReadableStream<Uint8Array>({start(value){controller=value;}});
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'60','ETag':'test',Connection:'keep-alive, X-Remove-Me','X-Remove-Me':'remove','Transfer-Encoding':'chunked','Keep-Alive':'timeout=5','Proxy-Authenticate':'secret','Trailer':'X-Checksum','TE':'trailers','Upgrade':'websocket','Proxy-Connection':'keep-alive'});
  headers.append('Set-Cookie','a=1; Path=/; HttpOnly');headers.append('Set-Cookie','b=2; Path=/; Secure');
  headers.set('Vary','Accept');headers.set('X-QCC-Proxy-Secret','must-not-leak');
  vi.stubGlobal('fetch',async()=>new Response(stream,{status:429,statusText:'Too Many Requests',headers}));
  const response=await onRequest(context(prefix+'accounts'));
  expect(response.status).toBe(429);expect(response.statusText).toBe('Too Many Requests');
  expect(response.headers.get('content-type')).toBe('application/json');expect(response.headers.get('retry-after')).toBe('60');expect(response.headers.get('etag')).toBe('test');
  expect(Object.fromEntries(response.headers)).toEqual({'content-type':'application/json','cache-control':'no-store','retry-after':'60',etag:'test',vary:'Accept'});
  controller.enqueue(new TextEncoder().encode('{"error":"limited"}'));controller.close();
  expect(await response.text()).toBe('{"error":"limited"}');
 });
 it('does not follow upstream redirects with visitor credentials',async()=>{
  const fetcher=vi.fn(async(request:Request)=>{
   expect(request.redirect).toBe('manual');return new Response(null,{status:307,headers:{Location:'https://another.test/'}});
  });vi.stubGlobal('fetch',fetcher);
  const response=await onRequest(context(prefix+'accounts',{headers:{Authorization:'Bearer test-session'}}));
  expect(response.status).toBe(307);expect(response.headers.has('location')).toBe(false);expect(fetcher).toHaveBeenCalledOnce();
 });
 it('returns no-store JSON 502 on upstream failure without exposing the error',async()=>{
  vi.stubGlobal('fetch',async()=>{throw new Error('secret upstream detail');});
  const response=await onRequest(context(prefix+'accounts'));
  expect(response.status).toBe(502);expect(await response.json()).toEqual({error:'backend unavailable'});expect(response.headers.get('cache-control')).toBe('no-store');
 });
 it('aborts a stalled upstream after 10 seconds and returns 502',async()=>{
  vi.useFakeTimers();
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
  vi.stubGlobal('fetch',async(request:Request)=>new Promise<Response>((_,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('timeout')))));
  let finished=false;const pending=onRequest(context(prefix+'turn')).then(response=>{finished=true;return response;});
  await vi.advanceTimersByTimeAsync(9999);expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);const response=await pending;
  expect(response.status).toBe(502);expect(await response.json()).toEqual({error:'backend unavailable'});
 });
 it('passes a storage-full response through unchanged',async()=>{
  const body={error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'};
  vi.stubGlobal('fetch',async()=>Response.json(body,{status:507,headers:{'Cache-Control':'no-store'}}));
  const response=await onRequest(context(prefix+'accounts'));
  expect(response.status).toBe(507);expect(await response.json()).toEqual(body);expect(response.headers.get('cache-control')).toBe('no-store');
 });
 it('keeps Function invocation restricted to the legacy and native API prefixes',async()=>{
  const routes=JSON.parse(await readFile(new URL('../../public/_routes.json',import.meta.url),'utf8'));
  expect(routes).toEqual({version:1,include:['/.netlify/functions/*','/api/*'],exclude:[]});
 });
});
