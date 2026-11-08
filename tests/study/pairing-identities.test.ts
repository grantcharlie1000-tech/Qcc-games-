import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createWhetuIdentityVerifier,createQccIdentityVerifier} from '../../server/study-pairing-identities';
const env={QCC_WHETU_SERVICE_SECRET:'x'.repeat(32),WHETU_NCEASTUDY_RUNTIME_ORIGIN:'https://runtime.test',WHETU_SUPABASE_AUTH_COOKIE:'sb-project-auth-token'};
it('identity backchannel forwards only exact Supabase cookie family, never bearer or QCC proof',async()=>{
 let sent:Request|undefined;
 const verify=createWhetuIdentityVerifier(env,async(input,init)=>{sent=new Request(input,init);return Response.json({subject:'issuer:user',sessionId:'11111111-1111-4111-8111-111111111111',label:'Student',authenticatedAt:1000,ownershipVerified:true});});
 const result=await verify(new Request('https://study.test/link',{headers:{Cookie:'__Host-nceastudy_pair=secret; accounts=secret; sb-project-auth-token.0=part0; sb-project-auth-token.1=part1; sb-other-auth-token=wrong',Authorization:'Bearer acct_secret'}}));
 expect(result?.subject).toBe('issuer:user');
 expect(sent?.url).toBe('https://runtime.test/api/integrations/nceastudy/identity');
 expect(sent?.headers.get('cookie')).toBe('sb-project-auth-token.0=part0; sb-project-auth-token.1=part1');
 expect(sent?.headers.get('authorization')).toBeNull();
 expect(sent?.headers.get('x-qcc-whetu-service-secret')).toBe('x'.repeat(32));
 expect(await sent?.json()).toEqual({scope:'qcc:whetu:link:v1'});
 expect(sent?.redirect).toBe('error');
});
it('identity backchannel rejects missing cookies/config, duplicate cookies and malformed responses',async()=>{
 const request=new Request('https://study.test/link',{headers:{Cookie:'sb-project-auth-token=value'}});
 expect(await createWhetuIdentityVerifier({},async()=>{throw Error('should not call');})(request)).toBeNull();
 const verify=createWhetuIdentityVerifier(env,async()=>Response.json({subject:'issuer:user',sessionId:'11111111-1111-4111-8111-111111111111',label:'Student',authenticatedAt:'unverified',ownershipVerified:true}));
 expect(await verify(request)).toBeNull();
 expect(await verify(new Request(request,{headers:{Cookie:'sb-project-auth-token=a; sb-project-auth-token=b'}}))).toBeNull();
});
it('QCC bearer adapter hashes exact bearer and exposes canonical immutable identity only',async()=>{
 const token='acct_'+'a'.repeat(64);let values:unknown[]|undefined;
 const verifier=createQccIdentityVerifier({query:async(_sql,input)=>{values=input;return {rows:[{id:'id',username:'Alice',created_at:new Date(1000)}]};}});
 expect(await verifier.fromBearer(new Request('https://study.test',{headers:{Authorization:'Bearer '+token}}))).toEqual({accountId:'id',username:'Alice',sessionHash:createHash('sha256').update(token).digest('hex'),authenticatedAt:1000});
 expect(values).toEqual([createHash('sha256').update(token).digest('hex')]);
 expect(await verifier.fromBearer(new Request('https://study.test',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}))).toBeNull();
});
