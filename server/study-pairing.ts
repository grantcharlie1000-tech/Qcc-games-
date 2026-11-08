// QCC backend owns this route. Raw QCC bearers never enter the Whetū runtime.
import {createHash,randomBytes} from 'node:crypto';
import type {Database} from '../src/leaderboard/server';
import {createPairingHandler} from './study-pairing-core';
import {createQccIdentityVerifier,createWhetuIdentityVerifier} from './study-pairing-identities';
import {createPostgresPairingStore} from './study-pairing-store';
import {readJson,rateLimit,errorResponse} from './api';
import {studyServiceAuthorized} from './study-service-auth';
import {createStudyCapabilitiesChecker} from './study-capabilities';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
function contextProof(request:Request,name='__Host-nceastudy_context'):string|null{
 const parts=(request.headers.get('cookie')??'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));
 if(parts.length!==1)return null;
 const value=parts[0]!.slice(name.length+1);return /^[a-f0-9]{64}$/.test(value)?value:null;
}
export function createStudyLinkHandler(db:Database,options:{env?:Record<string,string|undefined>;fetcher?:typeof fetch;now?:()=>number}={}){
 const env=options.env??process.env,now=options.now??Date.now;
 const enabled=env.QCC_WHETU_PAIRING==='on',origin=env.QCC_NCEASTUDY_ORIGIN;
 const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 const qcc=createQccIdentityVerifier(db),whetu=createWhetuIdentityVerifier(env,options.fetcher),store=createPostgresPairingStore(db);
 const capabilities=createStudyCapabilitiesChecker(db,env,now);
 let core:ReturnType<typeof createPairingHandler>|undefined;
 return async(request:Request):Promise<Response>=>{
  if(!enabled)return respond({error:'Not found.'},404);
  if(!origin)return respond({error:'Integration not configured.'},503);
  try{const configured=new URL(origin);if(configured.protocol!=='https:'||configured.origin!==origin)return respond({error:'Integration not configured.'},503);}catch{return respond({error:'Integration not configured.'},503);}
  const url=new URL(request.url),action=url.searchParams.get('action');
  if(url.searchParams.size!==1||!['select','start','review','confirm','cancel','status','verify','capabilities'].includes(action??''))return respond({error:'Invalid integration action.'},400);
  try{
   if(action==='capabilities'){
    if(request.method!=='POST')return respond({error:'Method not allowed.'},405);
    if(!studyServiceAuthorized(request,env))return respond({error:'Unauthorized.'},401);
    // Internal compatibility requests carry no browser identity or Origin.
    if(['cookie','authorization','origin','sec-fetch-site'].some(name=>request.headers.has(name)))return respond({error:'Request not allowed.'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return respond({error:'Send JSON.'},415);
    const data=await readJson(request,256);
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length)return respond({error:'Invalid request.'},400);
    const result=await capabilities();
    return result?respond(result):respond({error:'Integration not configured.'},503);
   }
   if(action==='select'){
    if(request.method!=='POST')return respond({error:'Method not allowed.'},405);
    if(request.headers.get('origin')!==origin||request.headers.has('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')return respond({error:'Request not allowed.'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return respond({error:'Send JSON.'},415);
    const data=await readJson(request,2048);if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length)return respond({error:'Invalid request.'},400);
    const clientIp=request.headers.get('x-nf-client-connection-ip')?.trim()||'unknown';
    await rateLimit(db.query.bind(db),'study-selection-ip:'+sha(clientIp),120,60);
    const current=await qcc.fromBearer(request);
    if(!current)return respond({error:'Unauthorized.'},401);
    const browser=contextProof(request,'__Host-nceastudy_browser');
    if(!browser)return respond({error:'Sign in again before opening Study.'},409);
    const selected=await store.selectBrowser({digest:sha(browser),qccAccountId:current.accountId,qccSessionHash:current.sessionHash,now:now()});
    if(!selected)return respond({error:'Sign in again before opening Study.'},409);
    return respond({selected:true});
   }
   if(action==='verify'||action==='status'){
    if(request.method!=='POST')return respond({error:'Method not allowed.'},405);
    if(action==='verify'){
     if(!studyServiceAuthorized(request,env))return respond({error:'Unauthorized.'},401);
    }else if(request.headers.get('origin')!==origin||request.headers.has('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')return respond({error:'Request not allowed.'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return respond({error:'Send JSON.'},415);
    const data=await readJson(request,2048);
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length)return respond({error:'Invalid request.'},400);
    const browser=contextProof(request,'__Host-nceastudy_browser');
    const proof=contextProof(request);if(!browser||action==='verify'&&!proof)return respond({verified:false},401);
    const identity=await whetu(request);if(!identity||identity.authenticatedAt>now())return respond({verified:false},401);
    if(action==='status'){
     const current=await qcc.fromBearer(request),selected=await store.getBrowser(sha(browser));
     if(!current||!selected||current.accountId!==selected.qccAccountId||current.sessionHash!==selected.qccSessionHash)return respond({verified:false},401);
     if(proof&&await store.verifyContext({digest:sha(proof),browserDigest:sha(browser),whetuSubject:identity.subject,whetuSessionId:identity.sessionId,now:now()}))return respond({linked:true,verified:true});
     const ip=request.headers.get('x-nf-client-connection-ip')?.trim()||'unknown';
     await rateLimit(db.query.bind(db),'study-context-ip:'+sha(ip),120,60);
     await rateLimit(db.query.bind(db),'study-context-browser:'+sha(browser),12,600);
     const context=randomBytes(32).toString('hex');
     const renewed=await store.renewContext({browserDigest:sha(browser),browserEpoch:selected.epoch,qccAccountId:current.accountId,qccSessionHash:current.sessionHash,whetuSubject:identity.subject,whetuSessionId:identity.sessionId,contextDigest:sha(context),contextExpiresAt:now()+900000,now:now()});
     if(!renewed)return respond({verified:false},401);
     const response=respond({linked:true,verified:true});response.headers.append('Set-Cookie',`__Host-nceastudy_context=${context}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);return response;
    }
    const link=await store.verifyContext({digest:sha(proof!),browserDigest:sha(browser),whetuSubject:identity.subject,whetuSessionId:identity.sessionId,now:now()});
    if(!link)return respond({verified:false},401);
    return respond({verified:true});
   }
   // Public NCEAStudy origin survives the authenticated Pages->backend proxy;
   // never replace a missing/mismatched Origin with the backend URL's host.
   if(request.headers.get('origin')!==origin)return respond({error:'Request not allowed.'},403);
   // Bounded IP abuse control uses the existing trusted backend client-IP path.
   const ip=request.headers.get('x-nf-client-connection-ip')?.trim()||'unknown';
   if(request.headers.has('authorization')||action!=='start')await rateLimit(db.query.bind(db),'study-pairing-ip:'+sha(ip),120,60);
   core??=createPairingHandler({env:{WHETU_NCEASTUDY_INTEGRATION:'on'},origin,store,now,identities:{qccFromBearer:qcc.fromBearer,qccFromSessionHash:qcc.fromSessionHash,whetuFromVerifiedCookie:whetu}});
   const internal=new URL('/api/integrations/nceastudy/link/'+action,origin);
   return await core(new Request(internal,{method:request.method,headers:request.headers,body:request.body,duplex:'half'} as RequestInit));
  }catch(error){return errorResponse(error,'Pairing temporarily unavailable.');}
 };
}
