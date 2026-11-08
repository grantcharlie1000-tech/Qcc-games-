import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createAccountsHandler} from '../../src/accounts/server';
import {createStudyLinkHandler} from '../../server/study-pairing';
import type {Database} from '../../src/leaderboard/server';
const local=new LocalDB();let db:Database&{end():Promise<void>};
const origin='https://study.test',secret='s'.repeat(32);
const env={QCC_WHETU_PAIRING:'on',QCC_NCEASTUDY_ORIGIN:origin,WHETU_NCEASTUDY_RUNTIME_ORIGIN:'https://runtime.test',WHETU_SUPABASE_AUTH_COOKIE:'sb-project-auth-token',QCC_WHETU_SERVICE_SECRET:secret};
let sent:Request[]=[],browserCookie='';
const identityFetch:typeof fetch=async(input,init)=>{sent.push(new Request(input,init));return Response.json({subject:'https://project.supabase.co/auth/v1#student',sessionId:'11111111-1111-4111-8111-111111111111',label:'Student',authenticatedAt:Date.now()-1000,ownershipVerified:true});};
beforeAll(async()=>{db=createLocalPool(await local.start());await local.applyMigrations('db/migrations');},30000);
afterAll(async()=>{await db?.end();await local.stop();});
beforeEach(async()=>{await db.query('TRUNCATE arcade_players,account_attempts CASCADE');sent=[];browserCookie='';});
async function account(username='Alice'){
 const response=await createAccountsHandler(db)(new Request(origin+'/accounts?action=signup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password:'a test password'})}));
 expect(response.status).toBe(201);return response.json() as Promise<{token:string;username:string}>;
}
function request(action:string,body:unknown={},cookies='sb-project-auth-token=cookie-value',token?:string,internal=false){
 return new Request('https://backend.test/.netlify/functions/study-link?action='+action,{method:'POST',headers:{'Content-Type':'application/json',Cookie:[browserCookie,cookies].filter(Boolean).join('; '),...(internal?{'X-QCC-Whetu-Service-Secret':secret}:{Origin:origin,'Sec-Fetch-Site':'same-origin'}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
}
async function select(handle:ReturnType<typeof createStudyLinkHandler>,token?:string){const response=await handle(request('select',{},undefined,token));expect(response.status).toBe(200);browserCookie=cookie(response,'__Host-nceastudy_browser')!;}
const cookie=(response:Response,name:string)=>response.headers.getSetCookie().find(value=>value.startsWith(name+'='))?.split(';')[0];
it('real QCC auth -> intent -> verified runtime boundary -> durable link/context -> gated API -> cancellation',async()=>{
 const user=await account();
 await db.query("INSERT INTO account_saves(account_id,key,value,updated) SELECT id,'settings','{\"sound\":true}'::jsonb,1 FROM accounts WHERE username='Alice'");
 const saves=(await db.query('SELECT * FROM account_saves')).rows;
 const handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});
 await select(handle,user.token);const start=await handle(request('start',{consent:true},undefined,user.token));expect(start.status).toBe(201);
 const pairing=cookie(start,'__Host-nceastudy_pair')!;
 const all=pairing+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},all));expect(review.status).toBe(200);const details=await review.json();
 const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},all,user.token));expect(confirm.status).toBe(200);
 const context=cookie(confirm,'__Host-nceastudy_context')!;
 const active=context+'; sb-project-auth-token=cookie-value';
 expect(await(await handle(request('status',{},active,user.token))).json()).toEqual({linked:true,verified:true});
 expect(await(await handle(request('verify',{},active,undefined,true))).json()).toEqual({verified:true});
 expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
 expect((await db.query('SELECT * FROM account_saves')).rows).toEqual(saves);
 expect(sent.length).toBeGreaterThan(0);
 for(const remote of sent){expect(remote.headers.get('authorization')).toBeNull();expect(remote.headers.get('cookie')).toBe('sb-project-auth-token=cookie-value');}
 const cancelled=await handle(request('select',{},active));expect(cancelled.status).toBe(200);
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(401);
 expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
 expect((await db.query('SELECT * FROM account_saves')).rows).toEqual(saves);
});
it('currently selected QCC bearer must match start even while original session is still valid',async()=>{
 const alice=await account(),bob=await account('Bob');const handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});
 await select(handle,alice.token);const start=await handle(request('start',{consent:true},undefined,alice.token));const all=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},all));const details=await review.json();
 expect((await handle(request('confirm',{consent:true,challenge:details.challenge},all,bob.token))).status).toBe(401);
 expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(0);
 expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(2);
});

it('acknowledged outgoing-session revocation invalidates Whetū context without any cancel request',async()=>{
 const {AccountsClient}=await import('../../src/accounts/client');
 const alice=await account(),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});
 await select(handle,alice.token);const start=await handle(request('start',{consent:true},undefined,alice.token));const all=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},all));const details=await review.json();
 const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},all,alice.token));expect(confirm.status).toBe(200);
 const active=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(200);
 const values=new Map<string,unknown>([['accounts:session',alice]]);
 const storage={read:<T>(key:string,fallback:T)=>(values.get(key)??fallback) as T,write:(key:string,value:unknown)=>{values.set(key,value);return true;},remove:(key:string)=>values.delete(key)};
 const accounts=createAccountsHandler(db);
 const client=new AccountsClient(storage,async(input,init)=>accounts(new Request(new URL(String(input),origin),init)),{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
 try{
  await client.logout();expect(client.session()).toBeNull();
  // The old context proof is unchanged and has not expired. Only the confirmed
  // logout's real account_sessions deletion can make this verification fail.
  expect((await handle(request('verify',{},active,undefined,true))).status).toBe(401);
  expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM accounts')).rows).toHaveLength(1);
 }finally{client.dispose();}
});

it('real account switching revokes the old workspace before publishing the new local identity',async()=>{
 const {AccountsClient}=await import('../../src/accounts/client');
 const alice=await account();await account('Bob');const handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});
 await select(handle,alice.token);const start=await handle(request('start',{consent:true},undefined,alice.token));const all=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},all));const details=await review.json();const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},all,alice.token));
 const active=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 const values=new Map<string,unknown>([['accounts:session',alice]]);
 const storage={read:<T>(key:string,fallback:T)=>(values.get(key)??fallback) as T,write:(key:string,value:unknown)=>{values.set(key,value);return true;},remove:(key:string)=>values.delete(key)};
 const accounts=createAccountsHandler(db);let oldRejectedBeforePublish=false;
 const client=new AccountsClient(storage,async(input,init)=>accounts(new Request(new URL(String(input),origin),init)),{strictIdentityChanges:true,beforeIdentityCommit:async()=>{}});
 client.beforeIdentityChange=()=>{if(client.session()?.username==='Alice')oldRejectedBeforePublish=true;};
 try{
  await client.authenticate('login','Bob','a test password');
  expect(oldRejectedBeforePublish).toBe(true);expect(client.session()?.username).toBe('Bob');
  expect((await handle(request('verify',{},active,undefined,true))).status).toBe(401);
  expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
 }finally{client.dispose();}
});

it('server selection rejects old in-flight confirms after a switch even while original bearer remains valid',async()=>{
 const alice=await account(),bob=await account('Bob'),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});
 await select(handle,alice.token);
 const start=await handle(request('start',{consent:true},undefined,alice.token));const original=(await start.clone().json()).intent;
 const pending=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();
 await select(handle,bob.token);
 expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(2);
 expect((await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token))).status).toBe(409);
 expect((await db.query('SELECT state FROM qcc_study_pairing_intents WHERE digest=$1',[original])).rows[0].state).toBe('cancelled');
 expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(0);
});

it('view-scoped cancellation preserves a newer context created by another tab and never clears cookies',async()=>{
 const alice=await account(),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});await select(handle,alice.token);
 const first=await handle(request('start',{consent:true},undefined,alice.token));const obsolete=(await first.json()).intent;
 const second=await handle(request('start',{consent:true},undefined,alice.token));const pending=cookie(second,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();
 const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token));const active=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 const cancel=await handle(request('cancel',{intent:obsolete},active));expect(cancel.status).toBe(200);expect(cancel.headers.getSetCookie()).toEqual([]);
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(200);
 expect((await handle(request('cancel',{},active))).status).toBe(400);
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(200);
});

it('a new browser selection invalidates old contexts without waiting for old session logout or expiry',async()=>{
 const alice=await account(),bob=await account('Bob'),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});await select(handle,alice.token);
 const start=await handle(request('start',{consent:true},undefined,alice.token));const pending=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token));const active=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(200);
 await select(handle,bob.token);
 expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(2);
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(401);
 expect((await db.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
});

it('status rejects a different bearer session for the same account until browser selection acknowledges it',async()=>{
 const alice=await account(),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});await select(handle,alice.token);
 const start=await handle(request('start',{consent:true},undefined,alice.token));const pending=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token));const active=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 const login=await createAccountsHandler(db)(new Request(origin+'/accounts?action=login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'Alice',password:'a test password'})}));const second=await login.json();
 expect((await handle(request('status',{},active,second.token))).status).toBe(401);
 expect((await handle(request('status',{},active,alice.token))).status).toBe(200);
});

it('status renews only an existing consented pair using live older sessions, without relinking',async()=>{
 const alice=await account();let handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});await select(handle,alice.token);
 const start=await handle(request('start',{consent:true},undefined,alice.token));const pending=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token));const old=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 const mapping=(await db.query('SELECT * FROM qcc_study_links')).rows;
 await db.query("UPDATE account_sessions SET created_at=now()-interval '1 day'");await db.query('UPDATE qcc_study_contexts SET expires_at=0');
 const olderIdentity:typeof fetch=async()=>Response.json({subject:'https://project.supabase.co/auth/v1#student',sessionId:'22222222-2222-4222-8222-222222222222',label:'Student',authenticatedAt:Date.now()-86400000,ownershipVerified:true});
 handle=createStudyLinkHandler(db,{env,fetcher:olderIdentity});
 expect((await handle(request('verify',{},old,undefined,true))).status).toBe(401);
 const renewed=await handle(request('status',{},'sb-project-auth-token=cookie-value',alice.token));expect(renewed.status).toBe(200);expect(await renewed.json()).toEqual({linked:true,verified:true});
 const active=cookie(renewed,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 expect((await handle(request('verify',{},active,undefined,true))).status).toBe(200);
 expect((await db.query('SELECT * FROM qcc_study_links')).rows).toEqual(mapping);
});

it('status reuses an already valid context instead of writing on every poll',async()=>{
 const alice=await account(),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});await select(handle,alice.token);
 const start=await handle(request('start',{consent:true},undefined,alice.token));const pending=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();const confirm=await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token));const active=cookie(confirm,'__Host-nceastudy_context')+'; sb-project-auth-token=cookie-value';
 for(let i=0;i<3;i++){const status=await handle(request('status',{},active,alice.token));expect(status.status).toBe(200);expect(status.headers.getSetCookie()).toEqual([]);}
 expect((await db.query('SELECT * FROM qcc_study_contexts')).rows).toHaveLength(1);
});

it('missing-cookie context renewal has a bounded durable per-browser budget',async()=>{
 const alice=await account(),handle=createStudyLinkHandler(db,{env,fetcher:identityFetch});await select(handle,alice.token);
 const start=await handle(request('start',{consent:true},undefined,alice.token));const pending=cookie(start,'__Host-nceastudy_pair')+'; sb-project-auth-token=cookie-value';
 const review=await handle(request('review',{},pending));const details=await review.json();await handle(request('confirm',{consent:true,challenge:details.challenge},pending,alice.token));
 for(let i=0;i<12;i++)expect((await handle(request('status',{},'sb-project-auth-token=cookie-value',alice.token))).status).toBe(200);
 expect((await handle(request('status',{},'sb-project-auth-token=cookie-value',alice.token))).status).toBe(429);
 expect((await db.query('SELECT * FROM qcc_study_contexts')).rows).toHaveLength(13);
});
