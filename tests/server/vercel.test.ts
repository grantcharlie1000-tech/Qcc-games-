import {afterEach,describe,expect,it,vi} from 'vitest';

// Observe the adapter's request boundary; route/DB behavior is covered by app.test.ts.
vi.mock('../../server/app',()=>({createApp:()=>async(request:Request,ip:string)=>Response.json({
 ip,netlifyIp:request.headers.get('x-nf-client-connection-ip'),proxyIp:request.headers.get('x-qcc-client-ip'),
 secret:request.headers.get('x-qcc-proxy-secret'),body:request.method==='PUT'?await request.text():null,
})}));
vi.mock('node:crypto',async original=>{
 const crypto=await original<typeof import('node:crypto')>();
 return {...crypto,timingSafeEqual:vi.fn(crypto.timingSafeEqual)};
});
import {timingSafeEqual} from 'node:crypto';
import {GET,PUT} from '../../server/vercel';

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
