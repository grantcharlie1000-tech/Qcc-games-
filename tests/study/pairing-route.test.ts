import {it,expect} from 'vitest';
import {createStudyLinkHandler} from '../../server/study-pairing';
const db={query:async()=>{throw Error('database must not be touched');},connect:async()=>{throw Error('database must not be touched');}};
const env={QCC_WHETU_PAIRING:'on',QCC_NCEASTUDY_ORIGIN:'https://study.test'};
const request=(query='action=start',origin='https://study.test')=>new Request('https://backend.test/.netlify/functions/study-link?'+query,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"consent":true}'});
it('unconfigured/default-off pairing route refuses without touching database',async()=>{
 expect((await createStudyLinkHandler(db,{env:{}})(request())).status).toBe(404);
});
it('backend route pins public configured Origin despite upstream URL origin',async()=>{
 expect((await createStudyLinkHandler(db,{env})(request('action=start','https://evil.test'))).status).toBe(403);
 expect((await createStudyLinkHandler(db,{env})(request('action=start'))).status).toBe(409);
});
it('backend route refuses extra query data and unauthenticated internal context verification',async()=>{
 const handle=createStudyLinkHandler(db,{env});
 expect((await handle(request('action=start&token=secret'))).status).toBe(400);
 expect((await handle(request('action=verify'))).status).toBe(401);
});

import {createApp} from '../../server/app';
import {createHash} from 'node:crypto';
it('shared app replaces spoofed durable-budget IP with its authoritative adapter client IP',async()=>{
 const subjects:string[]=[];
 const database={query:async(sql:string,values?:unknown[])=>{
  if(sql.includes('SELECT name FROM qcc_environment'))return {rows:[{name:'development'}]};
  if(sql.includes('qcc_runtime_flags'))return {rows:[{write_freeze:false}]};
  if(sql.includes('INSERT INTO account_attempts')){subjects.push(String(values?.[0]));return {rows:[{attempts:1,retry:60}]};}
  return {rows:[]};
 },connect:async()=>{throw Error('not needed');}};
 const handle=createApp({env:{...env,QCC_DEPLOY_CONTEXT:'dev',QCC_ALLOWED_ORIGINS:'https://study.test'},database:()=>database});
 const incoming=request();const headers=new Headers(incoming.headers);headers.set('x-nf-client-connection-ip','attacker-controlled');headers.set('Authorization','Bearer acct_'+'a'.repeat(64));
 expect((await handle(new Request(incoming,{headers}),'192.0.2.7')).status).toBe(409);
 expect(subjects).toEqual(['study-pairing-ip:'+createHash('sha256').update('192.0.2.7').digest('hex')]);
});
it('shared app default-off does not initialize its database',async()=>{
 const handle=createApp({env:{QCC_ALLOWED_ORIGINS:'https://study.test'},database:()=>{throw Error('must not connect');}});
 expect((await handle(request())).status).toBe(404);
});
