import {afterEach,it,expect,vi} from 'vitest';
import {onRequest} from '../../functions/_middleware';
const host='https://study.test',proof='a'.repeat(64);
const valid=`__Host-nceastudy_browser=${proof}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
afterEach(()=>vi.unstubAllGlobals());
async function call(cookies:string[],enabled=true,status=200){
 const headers=new Headers({'Content-Type':'application/json'});for(const cookie of cookies)headers.append('Set-Cookie',cookie);
 const fetcher=vi.fn(async(_request:Request)=>new Response('{"token":"fixture"}',{status,headers}));vi.stubGlobal('fetch',fetcher);
 const response=await onRequest({request:new Request(host+'/.netlify/functions/accounts?action=login',{method:'POST',headers:{'Content-Type':'application/json','X-QCC-Public-Origin':'https://evil.test','X-QCC-Internal-Study-Account-Origin':host},body:'{}'}),env:{QCC_API_ORIGIN:'https://api.test',QCC_PROXY_SECRET:'fixture',QCC_WHETU_INTEGRATION:enabled?'on':'off',WHETU_PUBLIC_ORIGIN:host},next:async()=>new Response('static')});
 return {response,fetcher};
}
it('forwards only the approved authority cookie and supplies server-owned provenance',async()=>{
 const {response,fetcher}=await call([valid,'unrelated=private; Path=/']);expect(response.status).toBe(200);expect(response.headers.getSetCookie()).toEqual([valid]);
 const request=fetcher.mock.calls[0]![0];
 expect(request.headers.get('x-qcc-public-origin')).toBe(host);expect(request.headers.has('x-qcc-internal-study-account-origin')).toBe(false);
});
it.each([[],[valid,valid],[valid.replace('HttpOnly; ','')],[valid+'; Domain=study.test'],[valid+'; Path=/'],[valid.replace(proof,'bad')]].map(cookies=>({cookies})))('ambiguous/malformed authority fails only Study closed: %j',async({cookies})=>{
 const {response}=await call(cookies);expect(response.status).toBe(200);expect(await response.json()).toEqual({token:'fixture'});
 const issued=response.headers.getSetCookie();expect(issued).toHaveLength(1);expect(issued[0]).toMatch(/^__Host-nceastudy_browser=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);expect(issued[0]).not.toBe(valid);
});
it('paused integration and failed auth cannot rotate or expose authority',async()=>{
 expect((await call([valid],false)).response.headers.getSetCookie()).toEqual([]);
 expect((await call([valid],true,401)).response.headers.getSetCookie()).toEqual([]);
});
