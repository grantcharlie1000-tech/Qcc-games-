import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const modulePath='../../scripts/movie-popularity-provision.mjs';
const load=()=>import(/* @vite-ignore */ modulePath);
describe('popularity operator safety',()=>{
 it('splits the production schema without breaking the aggregate trigger',async()=>{
  const {splitSql}=await load();const db=new DatabaseSync(':memory:');
  for(const sql of splitSql(readFileSync('docs/movie-popularity-schema.sql','utf8')))db.exec(sql);
  db.exec("INSERT INTO movie_popularity_tokens VALUES ('movie-1',1,'a',2)");
  expect(db.prepare('SELECT views FROM movie_popularity_daily').get()?.views).toBe(1);db.close();
 });
 it('rejects unknown or paid account plans and exhausted free limits before writing',async()=>{
  const {assertFreeCapacity}=await load();
  expect(()=>assertFreeCapacity([],[],[])).not.toThrow();
  for(const subscriptions of [[{rate_plan:{price:1}}],[{rate_plan:{price:'0'}}],[{}]])expect(()=>assertFreeCapacity(subscriptions,[],[])).toThrow();
  expect(()=>assertFreeCapacity([],Array.from({length:9},(_,i)=>({name:`other-${i}`})),[])).toThrow();
  expect(()=>assertFreeCapacity([],[],Array.from({length:99},(_,i)=>({id:`other-${i}`})))).toThrow();
 });
 it('redacts network errors and refuses invalid account configuration',async()=>{
  const {createOperator}=await load();
  expect(()=>createOperator({env:{}})).toThrow('configuration_invalid');
  const op=createOperator({env:{CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'SECRET'},fetcher:async()=>{throw Error('SECRET raw address');}});
  await expect(op.prepare()).rejects.toThrow(/^platform_request_failed$/);
 });
 it('rejects an unrelated database table before applying schema',async()=>{
  const {assertDedicatedTables}=await load();
  expect(()=>assertDedicatedTables([{name:'movie_popularity_tokens'},{name:'_cf_METADATA'},{name:'_cf_KV'}])).not.toThrow();
  expect(()=>assertDedicatedTables([{name:'accounts'}])).toThrow('database_not_dedicated');
 });
});
function platform(){
 const dbs:any[]=[],workers=new Map<string,any>(),sqlite=new Map<string,DatabaseSync>();
 const project:any={name:'nceastudy',subdomain:'nceastudy.pages.dev',production_branch:'production',deployment_configs:{preview:{env_vars:{KEEP:{type:'plain_text',value:'stay'}}},production:{env_vars:{KEEP:{type:'plain_text',value:'stay'}}}}};
 const requests:{path:string;method:string;body:any}[]=[];
 const fetcher=async(input:string,init:any={})=>{
  const url=new URL(input),path=url.pathname.replace(/^\/client\/v4\/accounts\/[^/]+/,'');const method=init.method??'GET';
  const body=typeof init.body==='string'?JSON.parse(init.body):init.body;requests.push({path,method,body});let result:any;
  if(path==='/subscriptions')result=[];
  else if(path==='/pages/projects/nceastudy'){
   if(method==='PATCH')for(const [key,config] of Object.entries(body.deployment_configs) as any)for(const [field,value] of Object.entries(config))project.deployment_configs[key][field]=field==='wrangler_config_hash'?value:{...project.deployment_configs[key][field],...value as any};
   result=structuredClone(project);
  }else if(path==='/d1/database'){
   if(method==='POST'){const uuid=String(dbs.length+1);dbs.push({uuid,name:body.name});sqlite.set(uuid,new DatabaseSync(':memory:'));result=dbs.at(-1);}else result=dbs;
  }else if(path.endsWith('/query')){const db=sqlite.get(path.split('/')[3])!;const query=db.prepare(body.sql);result=[{success:true,results:query.all(...(body.params??[]))}];}
  else if(path==='/workers/scripts')result=[...workers.keys()].map(id=>({id}));
  else if(path.endsWith('/schedules')){const name=path.split('/')[3];if(method==='PUT')workers.get(name).schedules=body;result={schedules:workers.get(name)?.schedules??[]};}
  else if(path.endsWith('/script-settings')){const worker=workers.get(path.split('/')[3]);if(method==='PATCH')worker.privacy=body;result=worker.privacy??{};}
  else if(path.endsWith('/settings')){const metadata=workers.get(path.split('/')[3])?.metadata;result={bindings:metadata?.bindings,compatibility_date:metadata?.compatibility_date};}
  else if(path.startsWith('/workers/scripts/')&&method==='PUT'){const metadata=JSON.parse(await body.get('metadata').text());workers.set(path.split('/')[3],{metadata});result={};}
  else throw Error('unexpected test route');
  return Response.json({success:true,result});
 };
 return {fetcher,project,requests,dbs,sqlite,workers};
}
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private-token'};
const schema=()=>readFileSync('docs/movie-popularity-schema.sql','utf8');
describe('operator deployment lifecycle',()=>{
 it('prepares isolated stores and cleanup, preserves other Pages settings, and is idempotent',async()=>{
  const {createOperator}=await load(),p=platform();
  const op=createOperator({env,fetcher:p.fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};',randomHex:()=> 'ab'.repeat(32)});
  await op.prepare();await op.prepare();
  expect(p.dbs.map(d=>d.name)).toEqual(['nceastudy-movie-popularity-preview-v1','nceastudy-movie-popularity-production-v1']);
  expect(p.workers.size).toBe(2);
  expect(p.project.deployment_configs.preview.env_vars.MOVIE_POPULARITY_ENABLED.value).toBe('true');
  expect(p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_ENABLED.value).toBe('false');
  expect(p.project.deployment_configs.production.env_vars.KEEP.value).toBe('stay');
  expect(p.requests.filter(r=>r.path==='/d1/database'&&r.method==='POST')).toHaveLength(2);
  for(const worker of p.workers.values()){
   expect(worker.metadata.bindings[0].name).toBe('MOVIE_POPULARITY_DB');
   expect(worker.privacy.observability.enabled).toBe(false);expect(worker.privacy.logpush).toBe(false);
   expect(worker.schedules).toEqual([{cron:'* * * * *'}]);
  }
  await op.enableProduction();expect(p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_ENABLED.value).toBe('true');
 });
 it('refuses enablement without validated cleanup and refuses foreign preview URLs',async()=>{
  const {createOperator}=await load(),p=platform();const op=createOperator({env,fetcher:p.fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};'});
  await expect(op.verifyPreview('https://evil.example')).rejects.toThrow('preview_url_invalid');
  await op.prepare();p.workers.values().next().value.schedules=[];
  await expect(op.enableProduction()).rejects.toThrow('cleanup_schedule_invalid');
  expect(p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_ENABLED.value).toBe('false');
 });
});
describe('operator failure and rollback paths',()=>{
 it('rejects a production alias as a preview target',async()=>{
  const {createOperator}=await load();const p=platform(),op=createOperator({env,fetcher:p.fetcher});
  await expect(op.verifyPreview('https://production.nceastudy.pages.dev')).rejects.toThrow('preview_url_invalid');
  expect(p.requests).toHaveLength(0);
 });
 it('never writes when a plan is paid or a Pages binding would be rebound',async()=>{
  const {createOperator}=await load();
  for(const paid of [true,false]){
   const p=platform();if(!paid)p.project.deployment_configs.production.d1_databases={MOVIE_POPULARITY_DB:{id:'unrelated'}};
   const fetcher=async(url:string,init:any)=>paid&&url.endsWith('/subscriptions')?Response.json({success:true,result:[{rate_plan:{price:5}}]}):p.fetcher(url,init);
   const op=createOperator({env,fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};'});
   await expect(op.prepare()).rejects.toThrow(paid?'free_plan_required':'database_rebinding_refused');
   expect(p.requests.filter(r=>r.method!=='GET')).toHaveLength(0);
  }
 });
 it('does not rotate an existing secret and rollback leaves cleanup active',async()=>{
  const {createOperator}=await load(),p=platform();
  p.project.deployment_configs.production.d1_databases={OTHER:{id:'unchanged-other'}};
  p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_SECRET={type:'secret_text',value:'existing-secret'};
  const op=createOperator({env,fetcher:p.fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};'});
  await op.prepare();await op.enableProduction();await op.disableProduction();
  expect(p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_SECRET.value).toBe('existing-secret');
  expect(p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_ENABLED.value).toBe('false');
  expect(p.requests.find(r=>r.method==='PATCH'&&r.body.deployment_configs?.production)?.body.deployment_configs.production.d1_databases.OTHER).toEqual({id:'unchanged-other'});
  expect(p.workers.size).toBe(2);for(const w of p.workers.values())expect(w.schedules).toHaveLength(1);
 });
});
import {handleMoviePopularity,cleanupMoviePopularity,type PopularityDatabase} from '../../server/movie-popularity';
it.each([true,false,'without-rate'])('preview verification exercises actual handler and cleans synthetic fixtures even when scheduled cleanup succeeds=%s',async scheduled=>{
 const {createOperator}=await load(),p=platform();let endpointCalls=0,sleepCalls=0,sequence=0;
 function adapter():PopularityDatabase{
  const db=p.sqlite.get('1')!;
  return {prepare(sql:string){let values:any[]=[];return {bind(...args:any[]){values=args;return this;},async all(){return {results:db.prepare(sql).all(...values) as any};}};},async batch(statements:any[]){const results=[];for(const statement of statements)results.push(await statement.all());return results;}};
 }
 const fetcher=async(url:string,init:any)=>{
  if(!url.startsWith('https://test-preview.nceastudy.pages.dev'))return p.fetcher(url,init);
  endpointCalls++;const headers=new Headers(init.headers);headers.set('cf-connecting-ip','192.0.2.1');
  return handleMoviePopularity(new Request(url,{...init,headers}),{MOVIE_POPULARITY_DB:adapter(),MOVIE_POPULARITY_ENABLED:'true',MOVIE_POPULARITY_SECRET:'s'.repeat(64)});
 };
 let callsBeforeCron=0;
 const op=createOperator({env,fetcher,cleanupWaitMs:180000,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};',randomHex:()=> (++sequence).toString(16).padEnd(64,'0'),sleep:async()=>{sleepCalls++;if(!callsBeforeCron)callsBeforeCron=endpointCalls;expect(endpointCalls).toBe(callsBeforeCron);if(scheduled===true)await cleanupMoviePopularity(adapter());else if(scheduled==='without-rate'){p.sqlite.get('1')!.exec("DELETE FROM movie_popularity_tokens WHERE expires_at < 1e15; DELETE FROM movie_popularity_daily WHERE title_id = 'movie-9999999999'");}}});
 await op.prepare();
 // Preserve unrelated rows throughout synthetic cleanup.
 p.sqlite.get('1')!.prepare("INSERT INTO movie_popularity_daily VALUES ('movie-123',?,7)").run(Math.floor(Date.now()/86400000));
 if(scheduled===true)await op.verifyPreview('https://test-preview.nceastudy.pages.dev');else await expect(op.verifyPreview('https://test-preview.nceastudy.pages.dev')).rejects.toThrow('scheduled_cleanup_unverified');
 expect(sleepCalls).toBe(scheduled===true?1:36);
 expect(p.sqlite.get('1')!.prepare("SELECT views FROM movie_popularity_daily WHERE title_id = 'movie-123'").get()?.views).toBe(7);
 expect(p.sqlite.get('1')!.prepare("SELECT * FROM movie_popularity_tokens WHERE title_id = 'movie-9999999999'").all()).toEqual([]);
 expect(p.sqlite.get('1')!.prepare("SELECT * FROM movie_popularity_daily WHERE title_id = 'movie-9999999999'").all()).toEqual([]);
});
it('preserves the Wrangler hash and tolerates API object-key ordering',async()=>{
 const {createOperator}=await load(),p=platform();p.project.deployment_configs.production.wrangler_config_hash='current-hash';
 let reverse=false;const fetcher=async(url:string,init:any)=>{const response=await p.fetcher(url,init);const data=await response.json();if(url.endsWith('/pages/projects/nceastudy')&&init.method==='GET'&&(reverse=!reverse))data.result.deployment_configs=Object.fromEntries(Object.entries(data.result.deployment_configs).reverse());return Response.json(data);};
 const op=createOperator({env,fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};'});
 await op.prepare();await op.disableProduction();
 const patch=p.requests.filter(r=>r.method==='PATCH').at(-1)!;
 expect(patch.body.deployment_configs.production.wrangler_config_hash).toBe('current-hash');
 expect(p.project.deployment_configs.production.env_vars.KEEP.value).toBe('stay');
});
it.each(['binding','date','logging'])('blocks production enablement when cleanup %s verification fails',async kind=>{
 const {createOperator}=await load(),p=platform();
 const op=createOperator({env,fetcher:p.fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};'});
 await op.prepare();const worker=p.workers.get('nceastudy-movie-popularity-production-cleanup');
 if(kind==='binding')worker.metadata.bindings[0].id='another-database';
 else if(kind==='date')worker.metadata.compatibility_date='2020-01-01';
 else worker.privacy.observability.enabled=true;
 await expect(op.enableProduction()).rejects.toThrow(kind==='logging'?'cleanup_observability_logging_enabled':`cleanup_${kind}_invalid`);
 expect(p.project.deployment_configs.production.env_vars.MOVIE_POPULARITY_ENABLED.value).toBe('false');
});
describe('Cloudflare disabled logging representations',()=>{
 it.each([{}, {logpush:false,observability:null}, {observability:{}}, {observability:{enabled:false,logs:{},traces:{}}}])('accepts omitted/null disabled API fields after explicit privacy update: %j',async privacy=>{
  const {createOperator}=await load(),p=platform();
  const fetcher=async(url:string,init:any)=>{const response=await p.fetcher(url,init);if(url.endsWith('/script-settings')&&init.method==='GET')return Response.json({success:true,result:privacy});return response;};
  const op=createOperator({env,fetcher,readText:async(path:string)=>String(path).endsWith('.sql')?schema():'export default {};'});
  await op.prepare();
  for(const request of p.requests.filter(r=>r.path.endsWith('/script-settings')&&r.method==='PATCH'))expect(request.body).toEqual({logpush:false,observability:{enabled:false,logs:{enabled:false,invocation_logs:false,persist:false},traces:{enabled:false,persist:false}}});
 });
 it.each([
  [{logpush:true},'cleanup_logpush_enabled'],
  ...[{enabled:true},{logs:{enabled:true}},{logs:{invocation_logs:true}},{logs:{persist:true}},{traces:{enabled:true}},{traces:{persist:true}}].map(observability=>[{logpush:false,observability},'cleanup_observability_logging_enabled']),
  ...[null,[],{logpush:'false'},{logpush:null},{observability:[]},{observability:{enabled:'false'}},{observability:{logs:[]}}, {observability:{logs:{persist:0}}},{observability:{unknown:true}}].map(privacy=>[privacy,'cleanup_logging_configuration_invalid']),
 ] as [unknown,string][])('rejects active or invalid logging configuration %j',async(privacy,error)=>{
  const {assertLoggingDisabled}=await load();expect(()=>assertLoggingDisabled(privacy)).toThrow(error as string);
 });
});
