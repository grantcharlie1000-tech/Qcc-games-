import {describe,expect,it,vi} from 'vitest';
import {integrationEnabled,parseIntegrationReadiness,probeIntegration,WHETU_INTEGRATION} from '../../src/study/whetu-integration';

const ready=()=>({
 integration:WHETU_INTEGRATION,ready:true,framePath:'/nceastudy',
 excludedSubjects:['history','l2-history'],
 authentication:{embeddedPassword:true,embeddedSignup:true,externalProviderHandoff:true},
 accountLink:'verified-explicit-v1',revision:'a'.repeat(40),
});

describe('Whetū integration release gate',()=>{
 it('requires an explicit on flag; unset, truthy or differently cased flags stay off',()=>{
  expect(integrationEnabled('on')).toBe(true);
  for(const value of [undefined,'','true','1','ON',' on','off'])expect(integrationEnabled(value)).toBe(false);
 });
 it('accepts only the fixed first-party entry with every required capability',()=>{
  expect(parseIntegrationReadiness(ready())).toEqual(ready());
  for(const framePath of ['https://whetu.app/questions','//other.example/questions','/questions','/nceastudy?guest=true','/nceastudy#test','/nceastudy/../questions']){
   expect(parseIntegrationReadiness({...ready(),framePath})).toBeNull();
  }
 });
 it('fails closed before account linking, signup, password auth, OAuth handoff and History policy are ready',()=>{
  for(const patch of [
   {ready:false},{integration:'other'},{excludedSubjects:['history']},{excludedSubjects:['l2-history']},
   {accountLink:'email-match'},{accountLink:undefined},{revision:''},{revision:'<script>'},{revision:'a'.repeat(41)},{revision:'a'.repeat(63)},
   {authentication:{...ready().authentication,embeddedPassword:false}},
   {authentication:{...ready().authentication,embeddedSignup:false}},
   {authentication:{...ready().authentication,externalProviderHandoff:false}},
  ])expect(parseIntegrationReadiness({...ready(),...patch})).toBeNull();
  for(const value of [null,[],true,'ready',{}])expect(parseIntegrationReadiness(value)).toBeNull();
 });
 it('probes without cookies or account tokens, rejects redirects, and opts out of every cache',async()=>{
  const fetcher=vi.fn(async()=>Response.json(ready(),{headers:{'Cache-Control':'private, no-store'}}));
  const controller=new AbortController();
  await expect(probeIntegration(fetcher,controller.signal)).resolves.toEqual(ready());
  expect(fetcher).toHaveBeenCalledWith('/api/integrations/nceastudy',{
   method:'GET',headers:{Accept:'application/json'},credentials:'omit',mode:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,
  });
 });
 it('never treats a static SPA fallback, stale cache, unavailable runtime or oversized reply as ready',async()=>{
  for(const response of [
   new Response('<html>QCC fallback</html>'),Response.json(ready()),
   Response.json({ready:false},{status:503,headers:{'Cache-Control':'no-store'}}),
   new Response(' '.repeat(16_385),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),
  ])await expect(probeIntegration(async()=>response)).rejects.toThrow('Study is not available inside this site yet.');
 });
});
