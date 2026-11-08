import {afterEach,describe,expect,it,vi} from 'vitest';

// Observe the adapter's request boundary; route/DB behavior is covered by app.test.ts.
vi.mock('../../server/app',()=>({createApp:()=>async(request:Request,ip:string)=>Response.json({
 ip,netlifyIp:request.headers.get('x-nf-client-connection-ip'),proxyIp:request.headers.get('x-qcc-client-ip'),
 secret:request.headers.get('x-qcc-proxy-secret'),body:['POST','PUT'].includes(request.method)?await request.text():null,
 url:request.url,method:request.method,origin:request.headers.get('origin'),cookie:request.headers.get('cookie'),
})}));
vi.mock('node:crypto',async original=>{
 const crypto=await original<typeof import('node:crypto')>();
 return {...crypto,timingSafeEqual:vi.fn(crypto.timingSafeEqual)};
});
import {timingSafeEqual} from 'node:crypto';
import {GET,POST,PUT} from '../../server/vercel';

afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const call=async(headers:Record<string,string>)=>(await GET(new Request('https://backend.test/api/accounts?action=me',{headers}))).json();
describe('Vercel proxy IP boundary',()=>{
 it.each(['198.51.100.7','2001:db8::7'])('trusts authenticated %s and overwrites the client-sent Netlify IP',async ip=>{
  vi.stubEnv('QCC_PROXY_SECRET','test-proxy-key');
  const data=await call({'X-QCC-Proxy-Secret':'test-proxy-key','X-QCC-Client-IP':ip,'x-nf-client-connection-ip':'203.0.113.99','x-real-ip':'192.0.2.1'});
  expect(data).toMatchObject({ip,netlifyIp:ip,proxyIp:null,secret:null});
  expect(timingSafeEqual).toHaveBeenCalledOnce();
 });
 it.each([undefined,''])('disables proxy trust when the env secret is %s',async secret=>{
  vi.stubEnv('QCC_PROXY_SECRET',secret);
  expect(await call({'X-QCC-Proxy-Secret':'test-proxy-key','X-QCC-Client-IP':'198.51.100.7','x-nf-client-connection-ip':'203.0.113.99','x-real-ip':'192.0.2.1'}))
   .toMatchObject({ip:'192.0.2.1',netlifyIp:null,proxyIp:null,secret:null});
  expect(timingSafeEqual).not.toHaveBeenCalled();
 });
 it.each(['wrong-key','x','test-proxy-key, test-proxy-key','test-proxy-keé'])('rejects a wrong or duplicated secret (%s) using a fixed-length timing-safe comparison',async secret=>{
  vi.stubEnv('QCC_PROXY_SECRET','test-proxy-key');
  expect(await call({'X-QCC-Proxy-Secret':secret,'X-QCC-Client-IP':'198.51.100.7','x-nf-client-connection-ip':'203.0.113.99','x-forwarded-for':'192.0.2.8, 192.0.2.9'}))
   .toMatchObject({ip:'192.0.2.8',netlifyIp:null,proxyIp:null,secret:null});
  expect(timingSafeEqual).toHaveBeenCalledOnce();
  const [left,right]=vi.mocked(timingSafeEqual).mock.calls[0]!;
  expect(left.byteLength).toBe(32);expect(right.byteLength).toBe(32);
 });
 it.each(['','999.1.1.1','198.51.100.7, 203.0.113.8','https://198.51.100.7','198.51.100.7:443','[2001:db8::7]','localhost','2001:db8::7%eth0'])('strips invalid client IP %j even with the correct secret',async ip=>{
  vi.stubEnv('QCC_PROXY_SECRET','test-proxy-key');
  expect(await call({'X-QCC-Proxy-Secret':'test-proxy-key','X-QCC-Client-IP':ip,'x-nf-client-connection-ip':'203.0.113.99'}))
   .toMatchObject({ip:'',netlifyIp:null,proxyIp:null,secret:null});
 });
 it('strips spoofed Netlify/proxy headers when authentication is absent',async()=>{
  vi.stubEnv('QCC_PROXY_SECRET','test-proxy-key');
  expect(await call({'x-nf-client-connection-ip':'203.0.113.99','X-QCC-Client-IP':'198.51.100.7'}))
   .toMatchObject({ip:'',netlifyIp:null,proxyIp:null});
 });
 it('preserves PUT bodies without mutating the incoming Request headers',async()=>{
  vi.stubEnv('QCC_PROXY_SECRET','test-proxy-key');
  const request=new Request('https://backend.test/api/accounts?action=sync',{method:'PUT',headers:{'X-QCC-Proxy-Secret':'test-proxy-key','X-QCC-Client-IP':'198.51.100.7','x-nf-client-connection-ip':'spoofed'},body:'{"saves":{}}'});
  expect(await(await PUT(request)).json()).toMatchObject({netlifyIp:'198.51.100.7',body:'{"saves":{}}'});
  expect(request.headers.get('x-nf-client-connection-ip')).toBe('spoofed');
 });
});


describe('Vercel Study route metadata',()=>{
 it.each(['/api/study-link','/.netlify/functions/study-link','/api/study-link/'])('strips only the matching capture for %s',async path=>{
  const data=await(await GET(new Request('https://backend.test'+path+'?action=select&route=study-link'))).json();
  expect(new URL(data.url).pathname).toBe(path);
  expect(new URL(data.url).search).toBe('?action=select');
 });
 it.each([
  '?action=select&route=accounts',
  '?action=select&route=study-link&route=study-link',
  '?action=select&route=',
  '?action=select&Route=study-link',
 ])('preserves invalid metadata for strict handler rejection: %s',async search=>{
  const data=await(await GET(new Request('https://backend.test/api/study-link'+search))).json();
  expect(new URL(data.url).search).toBe(search);
 });
 it.each([
  ['?action=select&route=study-link&unexpected=1','?action=select&unexpected=1'],
  ['?action=select&action=verify&route=study-link','?action=select&action=verify'],
 ])('does not discard application query pollution: %s',async(search,expected)=>{
  const data=await(await GET(new Request('https://backend.test/api/study-link'+search))).json();
  expect(new URL(data.url).search).toBe(expected);
  expect(new URL(data.url).searchParams.size).toBe(2);
 });
 it.each(['/api/accounts','/api/study-link/other','/other/study-link'])('does not normalize any other route: %s',async path=>{
  const data=await(await GET(new Request('https://backend.test'+path+'?action=select&route=study-link'))).json();
  expect(new URL(data.url).search).toBe('?action=select&route=study-link');
 });
 it('preserves POST method, body, identity headers and original headers',async()=>{
  const request=new Request('https://backend.test/api/study-link?action=select&route=study-link',{
   method:'POST',headers:{'Content-Type':'application/json',Origin:'https://nceastudy.pages.dev',Cookie:'__Host-nceastudy_browser=fixture'},body:'{}',
  });
  const data=await(await POST(request)).json();
  expect(data).toMatchObject({method:'POST',body:'{}',origin:'https://nceastudy.pages.dev',cookie:'__Host-nceastudy_browser=fixture'});
  expect(new URL(data.url).search).toBe('?action=select');
  expect(new URL(request.url).search).toBe('?action=select&route=study-link');
  expect(request.headers.get('origin')).toBe('https://nceastudy.pages.dev');
 });
});
