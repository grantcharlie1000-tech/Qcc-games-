import {beforeAll,afterAll,it,expect} from 'vitest';
import {createApp} from '../../server/app';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Database} from '../../src/leaderboard/server';
const secret='service-test-'.padEnd(40,'x');
const site='https://study.test',api='https://backend.test';
const env={QCC_WHETU_PAIRING:'on',QCC_NCEASTUDY_ORIGIN:site,QCC_WHETU_SERVICE_SECRET:secret,QCC_ALLOWED_ORIGINS:site,QCC_DEPLOY_CONTEXT:'dev'};
const database:Database={query:async sql=>sql.includes('SELECT name FROM qcc_environment')?{rows:[{name:'development'}]}:sql.includes('qcc_runtime_flags')?{rows:[{write_freeze:false}]}:{rows:[]},connect:async()=>{throw Error('Unexpected mutation');}};
const make=()=>createApp({env,database:()=>database,now:()=>0});
function verification(browser?:string,supplied=secret,query='action=verify',method='POST'){
 return new Request(api+'/api/study-link?'+query,{method,headers:{'Content-Type':'application/json','X-QCC-Whetu-Service-Secret':supplied,...(browser?{Cookie:'__Host-nceastudy_browser='+browser}:{})},...(['GET','HEAD'].includes(method)?{}:{body:'{}'})});
}
it('authenticated classroom verification is not grouped under one Cloudflare egress IP budget',async()=>{
 const handle=make();
 for(let student=0;student<30;student++)for(let request=0;request<10;request++){
  const response=await handle(verification((student+1).toString(16).padStart(64,'0')),'198.51.100.1');
  expect(response.status).toBe(401);expect(await response.json()).toEqual({verified:false});
 }
});
it('bad or missing service secrets retain the original 120/minute IP limit',async()=>{
 for(const supplied of ['', 'wrong-secret']){
  const handle=make();
  for(let i=0;i<120;i++)expect((await handle(verification(undefined,supplied),'198.51.100.1')).status).toBe(401);
  expect((await handle(verification(undefined,supplied),'198.51.100.1')).status).toBe(429);
  const trusted=await handle(verification(),'198.51.100.1');expect(trusted.status).toBe(401);expect(await trusted.json()).toEqual({verified:false});
 }
});
it('service budget exemption cannot be obtained with another method or extra action parameters',async()=>{
 for(const [query,method] of [['action=verify','GET'],['action=verify&other=value','POST']]){
  const handle=make();let status=0;
  for(let i=0;i<121;i++)status=(await handle(verification(undefined,secret,query,method),'198.51.100.1')).status;
  expect(status).toBe(429);
 }
});
it('authenticated verification keeps a separate 300/minute browser proof budget',async()=>{
 const handle=make(),browser='b'.repeat(64);
 for(let i=0;i<300;i++)expect((await handle(verification(browser),'198.51.100.1')).status).toBe(401);
 expect((await handle(verification(browser),'198.51.100.1')).status).toBe(429);
});
it('authenticated verification retains a 6000/minute per-application service ceiling across egress IPs',async()=>{
 const handle=make();
 for(let i=0;i<6000;i++)expect((await handle(verification(),'198.51.100.'+(i%30+1))).status).toBe(401);
 expect((await handle(verification(),'203.0.113.99')).status).toBe(429);
},15000);

const local=new LocalDB();let pool:Database&{end():Promise<void>};
beforeAll(async()=>{pool=createLocalPool(await local.start());await local.applyMigrations('db/migrations');await pool.query("INSERT INTO qcc_environment(name) VALUES('development') ON CONFLICT(id) DO UPDATE SET name=excluded.name");},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
it('30 students can complete the actual six-call pairing flow behind a single NAT',async()=>{
 const handle=createApp({env:{...env,WHETU_NCEASTUDY_RUNTIME_ORIGIN:'https://runtime.test',WHETU_SUPABASE_AUTH_COOKIE:'sb-project-auth-token'},database:()=>pool,fetcher:async(input,init)=>{
  const request=new Request(input,init),student=request.headers.get('cookie')?.match(/sb-project-auth-token=(\d+)/)?.[1];
  return Response.json({subject:'https://project.test#student-'+student,sessionId:String(student).padStart(8,'0')+'-1111-4111-8111-111111111111',label:'Student '+student,authenticatedAt:Date.now()-1000,ownershipVerified:true});
 }});
 const ip='203.0.113.7';
 for(let student=1;student<=30;student++){
  const cookies=new Map<string,string>([['sb-project-auth-token',String(student)]]);
  const call=async(action:string,body:unknown={},token?:string)=>{
   const response=await handle(new Request(api+'/api/study-link?action='+action,{method:'POST',headers:{Origin:site,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',Cookie:[...cookies].map(([name,value])=>name+'='+value).join('; '),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),ip);
   for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(';'),at=pair!.indexOf('=');cookies.set(pair!.slice(0,at),pair!.slice(at+1));}
   return response;
  };
  expect((await call('select')).status).toBe(200);
  const signup=await handle(new Request(api+'/api/accounts?action=signup',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({username:'Student_'+student,password:'synthetic classroom password'})}),ip);
  expect(signup.status).toBe(201);const {token}=await signup.json();
  expect((await call('select',{},token)).status).toBe(200);
  expect((await call('start',{consent:true},token)).status).toBe(201);
  const review=await call('review',{},token);expect(review.status).toBe(200);const {challenge}=await review.json();
  expect((await call('confirm',{consent:true,challenge},token)).status).toBe(200);
  expect((await call('status',{},token)).status).toBe(200);
  // All students' protected runtime requests share one Cloudflare egress IP.
  for(let protectedRequest=0;protectedRequest<5;protectedRequest++){
   const verified=await handle(new Request(api+'/api/study-link?action=verify',{method:'POST',headers:{'Content-Type':'application/json','X-QCC-Whetu-Service-Secret':secret,Cookie:[...cookies].map(([name,value])=>name+'='+value).join('; ')},body:'{}'}),'198.51.100.22');
   expect(verified.status).toBe(200);expect(await verified.json()).toEqual({verified:true});
  }
 }
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(30);
},30000);

it('a configured short service secret cannot obtain the trusted ingress lane',async()=>{
 const handle=createApp({env:{...env,QCC_WHETU_SERVICE_SECRET:'short'},database:()=>database,now:()=>0});
 for(let i=0;i<120;i++)expect((await handle(verification(undefined,'short'),'198.51.100.1')).status).toBe(401);
 expect((await handle(verification(undefined,'short'),'198.51.100.1')).status).toBe(429);
});
