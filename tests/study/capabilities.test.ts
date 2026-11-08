import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {createApp} from '../../server/app';
import {createStudyLinkHandler} from '../../server/study-pairing';

const secret='synthetic-qcc-whetu-service-secret-32';
const publicOrigin='https://nceastudy.example.test';
const runtimeOrigin='https://whetu-nceastudy.example.test';
const cookie='sb-abcdefghijklmnopqrst-auth-token';
const schema='20261108120000_study_pairing';
const source=readFileSync(new URL('../../server/study-capabilities.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../db/migrations/20261108120000_study_pairing.sql',import.meta.url),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
const env={
 QCC_WHETU_PAIRING:'on',QCC_NCEASTUDY_ORIGIN:publicOrigin,WHETU_NCEASTUDY_RUNTIME_ORIGIN:runtimeOrigin,
 WHETU_SUPABASE_AUTH_COOKIE:cookie,QCC_WHETU_SERVICE_SECRET:secret,QCC_ALLOWED_ORIGINS:publicOrigin,
 QCC_DEPLOY_CONTEXT:'dev',
};
const expected={
 version:'nceastudy-whetu-capabilities-v1',pairingProtocol:'verified-explicit-v1',browserEpoch:true,
 sessionBinding:'verified-session-id-v1',publicOrigin,runtimeOrigin,authCookie:cookie,ready:true,schema,
};

/** Mirrors lib/server/integrations/nceastudyReadiness.ts acceptance. A pass here is not a live catalog proof. */
function whetuWouldAccept(response:Response,body:unknown):boolean {
 if(!response.ok)return false;
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))return false;
 if(!/(?:^|[,\s])no-store(?:$|[,\s])/i.test(response.headers.get('cache-control')??''))return false;
 if(response.headers.has('set-cookie')||response.headers.has('location'))return false;
 if(Number(response.headers.get('content-length'))>4096)return false;
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 const data=body as Record<string,unknown>;
 const keys=['authCookie','browserEpoch','pairingProtocol','publicOrigin','ready','runtimeOrigin','schema','sessionBinding','version'];
 return Object.keys(data).sort().join(',')===keys.join(',')&&
  data.version==='nceastudy-whetu-capabilities-v1'&&data.pairingProtocol==='verified-explicit-v1'&&
  data.browserEpoch===true&&data.sessionBinding==='verified-session-id-v1'&&data.ready===true&&
  data.schema===schema&&data.publicOrigin===publicOrigin&&data.runtimeOrigin===runtimeOrigin&&data.authCookie===cookie;
}
function request(patch:RequestInit&{url?:string}={}) {
 const headers=new Headers({'Content-Type':'application/json','X-QCC-Whetu-Service-Secret':secret});
 if(patch.headers)new Headers(patch.headers).forEach((value,key)=>headers.set(key,value));
 return new Request(patch.url??'https://qcc-api.example.test/.netlify/functions/study-link?action=capabilities',{
  method:patch.method??'POST',headers,...(patch.method==='GET'?{}:{body:patch.body??'{}'}),
 });
}
const shapes={
 qcc_study_links:{columns:[['qcc_account_id','uuid','NO'],['whetu_subject','text','NO'],['linked_at','bigint','NO']],checks:2,keys:['p:qcc_account_id','u:whetu_subject','f:qcc_account_id:public.accounts:id:r:a']},
 qcc_study_browsers:{columns:[['digest','text','NO'],['epoch','bigint','NO'],['qcc_account_id','uuid','YES'],['qcc_session_hash','text','YES']],checks:4,keys:['p:digest','f:qcc_account_id:public.accounts:id:r:a']},
 qcc_study_pairing_intents:{columns:[['digest','text','NO'],['browser_digest','text','NO'],['browser_epoch','bigint','NO'],['scope','text','NO'],['return_path','text','NO'],['qcc_account_id','uuid','NO'],['qcc_session_hash','text','NO'],['qcc_consented_at','bigint','NO'],['expires_at','bigint','NO'],['state','text','NO'],['whetu_session_id','text','YES'],['whetu_subject','text','YES'],['challenge_digest','text','YES']],checks:13,keys:['p:digest','f:browser_digest:public.qcc_study_browsers:digest:r:a','f:qcc_account_id:public.accounts:id:r:a']},
 qcc_study_contexts:{columns:[['digest','text','NO'],['browser_digest','text','NO'],['browser_epoch','bigint','NO'],['whetu_session_id','text','NO'],['qcc_account_id','uuid','NO'],['qcc_session_hash','text','NO'],['whetu_subject','text','NO'],['expires_at','bigint','NO']],checks:6,keys:['p:digest','f:browser_digest:public.qcc_study_browsers:digest:r:a','f:qcc_account_id:public.accounts:id:r:a']},
} as const;
const indexes={qcc_study_pairing_browser:['qcc_study_pairing_intents','browser_digest'],qcc_study_pairing_expiry:['qcc_study_pairing_intents','expires_at'],qcc_study_context_browser:['qcc_study_contexts','browser_digest'],qcc_study_context_expiry:['qcc_study_contexts','expires_at']} as const;
function catalog(checksumValue=checksum) {
 const statements:string[]=[];
 const constraints=Object.entries(shapes).flatMap(([table,shape])=>{
  const checks=Array.from({length:shape.checks},()=>({relname:table,contype:'c',convalidated:true,condeferrable:false,columns:['ignored'],foreign_schema:null,foreign_table:null,foreign_columns:[],confdeltype:null,confupdtype:null,key_valid:false,key_ready:false,key_immediate:false}));
  const keys=shape.keys.map(key=>{
   const parts=key.split(':');
   const contype=parts[0];
   const base={relname:table,contype,convalidated:true,condeferrable:false,columns:parts[1].split(','),foreign_schema:null,foreign_table:null,foreign_columns:[] as string[],confdeltype:null as string|null,confupdtype:null as string|null,key_valid:true,key_ready:true,key_immediate:true};
   if(contype!=='f')return base;
   return {...base,foreign_schema:parts[2].split('.')[0],foreign_table:parts[2].split('.')[1],foreign_columns:[parts[3]],confdeltype:parts[4],confupdtype:parts[5]};
  });
  return [...checks,...keys];
 });
 const client={
  query:async(text:string)=>{
   statements.push(text);
   if(text.startsWith('BEGIN')||text.startsWith('SET LOCAL')||text.startsWith('ROLLBACK'))return {rows:[]};
   if(text.includes('qcc_schema_migrations'))return {rows:[{checksum:checksumValue}]};
   if(text.includes('FROM pg_class c'))return {rows:Object.keys(shapes).map(relname=>({relname,relkind:'r',relrowsecurity:true,relforcerowsecurity:false,owned:true,policies:0,triggers:0,public_grants:0}))};
   if(text.includes('information_schema.columns'))return {rows:Object.entries(shapes).flatMap(([table,shape])=>shape.columns.map(([column_name,data_type,nullable])=>({table_name:table,column_name,data_type,is_nullable:nullable})))};
   if(text.includes('FROM pg_constraint'))return {rows:constraints};
   if(text.includes('FROM pg_index'))return {rows:Object.entries(indexes).map(([relname,[table_name,column]])=>({relname,table_name,indisvalid:true,indisready:true,indisunique:false,whole:true,plain:true,columns:[column]}))};
   throw new Error('unexpected catalog sql');
  },
  release(){},
 };
 return {statements,connect:async()=>client,query:async()=>{throw new Error('pool query is not the catalog');}};
}

it('inspector checksum is the committed pairing file hash and is not applied here',()=>{
 expect(source).toContain(`const CHECKSUM='${checksum}'`);
 expect(source).toContain(`const MIGRATION='${schema}'`);
 expect(sql).toContain('CREATE TABLE IF NOT EXISTS qcc_study_links');
 expect(sql.toLowerCase()).not.toContain('insert into');
});

it('authenticated compatible capabilities match the Whetu probe and do not mutate',async()=>{
 const db=catalog();
 const response=await createStudyLinkHandler(db,{env})(request());
 const body=await response.json();
 expect(response.status).toBe(200);
 expect(whetuWouldAccept(response,body)).toBe(true);
 expect(body).toEqual(expected);
 expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(response.headers.getSetCookie()).toEqual([]);
 expect(db.statements.some(text=>/\b(insert|update|delete|drop|alter|create|truncate|grant|copy)\b/i.test(text))).toBe(false);
 expect(db.statements.some(text=>text.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'))).toBe(true);
 expect(db.statements.at(-1)).toBe('ROLLBACK');
});

it('capability failures stay closed and never report ready',async()=>{
 const wrong=catalog('0'.repeat(64));
 const mismatch=await createStudyLinkHandler(wrong,{env})(request());
 expect(mismatch.status).toBe(503);
 expect(await mismatch.json()).toEqual({error:'Integration not configured.'});
 expect(wrong.statements.at(-1)).toBe('ROLLBACK');
 const broken=catalog();
 const original=broken.connect;
 broken.connect=async()=>{const client=await original();const query=client.query.bind(client);client.query=async text=>{if(text.includes('FROM pg_class'))throw new Error('catalog unavailable');return query(text);};return client;};
 const failed=await createStudyLinkHandler(broken,{env})(request());
 expect(failed.status).toBe(503);
 expect(await failed.json()).toEqual({error:'Integration not configured.'});
});

it('service auth, browser identity, and configuration are required before a catalog read',async()=>{
 const refusals:[Request,number][]=[
  [request({headers:{'X-QCC-Whetu-Service-Secret':'wrong-secret-value-but-long-enough'}}),401],
  [request({headers:{Cookie:'a=b'}}),403],
  [request({headers:{Authorization:'Bearer student'}}),403],
  [request({headers:{Origin:publicOrigin}}),403],
  [request({headers:{'Sec-Fetch-Site':'same-origin'}}),403],
  [request({method:'GET'}),405],
  [request({body:'{"ready":true}'}),400],
  [request({url:'https://qcc-api.example.test/.netlify/functions/study-link?action=capabilities&extra=1'}),400],
 ];
 for(const [incoming,status] of refusals){
  let connected=false;
  const db={query:async()=>{throw new Error('query');},connect:async()=>{connected=true;throw new Error('connected');}};
  const response=await createStudyLinkHandler(db,{env})(incoming);
  expect(response.status).toBe(status);
  expect(connected).toBe(false);
  expect(await response.json()).not.toMatchObject({ready:true});
 }
 const closed:[Record<string,string|undefined>,number][]=[
  [{QCC_WHETU_PAIRING:'off'},404],
  [{QCC_NCEASTUDY_ORIGIN:undefined},503],
  [{WHETU_NCEASTUDY_RUNTIME_ORIGIN:publicOrigin},503],
  [{WHETU_SUPABASE_AUTH_COOKIE:'sb-short-auth-token'},503],
  [{QCC_WHETU_SERVICE_SECRET:'short'},401],
  [{QCC_ALLOWED_ORIGINS:'https://other.example.test'},503],
 ];
 for(const [patch,status] of closed){
  let connected=false;
  const db={query:async()=>{throw new Error('query');},connect:async()=>{connected=true;throw new Error('connected');}};
  const response=await createStudyLinkHandler(db,{env:{...env,...patch}})(request());
  expect(response.status).toBe(status);
  expect(connected).toBe(false);
  expect(await response.json()).not.toMatchObject({ready:true});
 }
});

it('shared ingress authenticates before the database and preserves write freeze',async()=>{
 let opened=false;
 const denied=createApp({env,database:()=>{opened=true;throw new Error('opened');}});
 const unauthorized=await denied(request({headers:{'X-QCC-Whetu-Service-Secret':'nope-nope-nope-nope-nope-nope'}}),'203.0.113.5');
 expect(unauthorized.status).toBe(401);
 expect(opened).toBe(false);
 const frozenDb={query:async(sql:string)=>{if(sql.includes('qcc_environment'))return {rows:[{name:'development'}]};if(sql.includes('qcc_runtime_flags'))return {rows:[{write_freeze:true}]};throw new Error(sql);},connect:async()=>{throw new Error('catalog during freeze');}};
 const frozen=await createApp({env,database:()=>frozenDb})(request(),'203.0.113.5');
 expect(frozen.status).toBe(503);
 expect(await frozen.json()).toMatchObject({error:'read_only'});
 const live=catalog();
 const pool={query:async(sql:string)=>{if(sql.includes('qcc_environment'))return {rows:[{name:'development'}]};if(sql.includes('qcc_runtime_flags'))return {rows:[{write_freeze:false}]};throw new Error(sql);},connect:live.connect};
 const response=await createApp({env,database:()=>pool})(request({url:'https://qcc-api.example.test/api/study-link?action=capabilities'}),'203.0.113.5');
 const body=await response.json();
 expect(whetuWouldAccept(response,body)).toBe(true);
 expect(response.headers.get('vary')).toContain('Origin');
});
