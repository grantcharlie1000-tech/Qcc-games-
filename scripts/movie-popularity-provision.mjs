import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const PROJECT='nceastudy',TITLE='movie-9999999999',DATE='2026-11-04';
const environments=['preview','production'];
const databaseName=e=>`${PROJECT}-movie-popularity-${e}-v1`;
const workerName=e=>`${PROJECT}-movie-popularity-${e}-cleanup`;
const fail=name=>{throw new Error(name);};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function splitSql(source){
 const statements=[];let statement='';
 for(const line of source.split('\n')){
  const trimmed=line.trim();if(!trimmed||trimmed.startsWith('--'))continue;
  statement+=line+'\n';
  if(trimmed.endsWith(';')&&(!/^CREATE\s+TRIGGER/i.test(statement.trim())||/^END;$/i.test(trimmed))){statements.push(statement.trim());statement='';}
 }
 if(statement.trim())fail('schema_invalid');return statements;
}
export function assertDedicatedTables(rows){
 const allowed=new Set(['movie_popularity_tokens','movie_popularity_daily','movie_popularity_rate']);
 if(!Array.isArray(rows)||rows.some(r=>!allowed.has(r.name)&&r.name!=='_cf_METADATA'&&r.name!=='_cf_KV'&&!r.name.startsWith('sqlite_')))fail('database_not_dedicated');
}
export function assertFreeCapacity(subscriptions,databases,scripts){
 if(!Array.isArray(subscriptions)||subscriptions.some(s=>typeof s.rate_plan?.price!=='number'||s.rate_plan.price!==0))fail('free_plan_required');
 if(!Array.isArray(databases)||!Array.isArray(scripts))fail('resource_list_invalid');
 const missingD=environments.filter(e=>!databases.some(d=>d.name===databaseName(e))).length;
 const missingW=environments.filter(e=>!scripts.some(s=>s.id===workerName(e))).length;
 if(databases.length+missingD>10||scripts.length+missingW>100)fail('free_capacity_exceeded');
}
export function createOperator({env=process.env,fetcher=fetch,readText=p=>readFile(p,'utf8'),randomHex=()=>randomBytes(32).toString('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),cleanupWaitMs=1200000}={}){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!token)fail('configuration_invalid');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
 async function api(path,method='GET',body){
  let response;
  try{response=await fetcher(base+path,{method,headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});}catch{fail('platform_request_failed');}
  if(!response.ok)fail(`platform_http_${response.status}`);
  let data;try{data=await response.json();}catch{fail('platform_response_invalid');}
  if(data.success!==true)fail('platform_operation_failed');return data.result;
 }
 async function project(){const p=await api(`/pages/projects/${PROJECT}`);if(p?.name!==PROJECT||p.subdomain!==`${PROJECT}.pages.dev`||p.production_branch!=='production'||!p.deployment_configs?.preview||!p.deployment_configs?.production)fail('project_invalid');return p;}
 async function query(id,sql,params=[]){const r=await api(`/d1/database/${encodeURIComponent(id)}/query`,'POST',{sql,params});if(!Array.isArray(r)||r.some(x=>x.success!==true))fail('database_query_failed');return r.flatMap(x=>x.results??[]);}
 async function tables(id){const rows=await query(id,"SELECT name FROM sqlite_master WHERE type = 'table'");assertDedicatedTables(rows);return rows;}
 async function patch(p,e,changes){
  const before=structuredClone(p.deployment_configs);
  const hash=p.deployment_configs[e].wrangler_config_hash;
  await api(`/pages/projects/${PROJECT}`,'PATCH',{deployment_configs:{[e]:{...changes,...(hash===undefined?{}:{wrangler_config_hash:hash})}}});
  const after=(await project()).deployment_configs;
  // Compare every setting except the exact bindings/variables this operation owns.
  for(const [field,values] of Object.entries(changes))for(const key of Object.keys(values)){
   const actual=after[e]?.[field]?.[key],wanted=values[key];
   if(wanted.type==='secret_text'){if(actual?.type!=='secret_text')fail('configuration_verification_failed');}
   else if(!equal(actual,wanted))fail('configuration_verification_failed');
   if(before[e]?.[field])delete before[e][field][key];if(after[e]?.[field])delete after[e][field][key];
  }
  for(const state of [before,after])for(const config of Object.values(state))for(const [field,value] of Object.entries(config))if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)delete config[field];
  if(!equal(before,after))fail('unrelated_configuration_changed');
 }
 function bindingSafe(p,e,id){const current=p.deployment_configs[e].d1_databases?.MOVIE_POPULARITY_DB;if(current&&current.id!==id)fail('database_rebinding_refused');const secret=p.deployment_configs[e].env_vars?.MOVIE_POPULARITY_SECRET;if(secret&&secret.type!=='secret_text')fail('secret_configuration_invalid');}
 async function findDatabases(){const list=await api('/d1/database?per_page=100&page=1');if(!Array.isArray(list))fail('resource_list_invalid');return list;}
 function exactDatabase(list,e){const matches=list.filter(d=>d.name===databaseName(e));if(matches.length!==1||!matches[0].uuid)fail('database_missing_or_ambiguous');return matches[0].uuid;}
 async function verifyCleanup(e,id){
  const settings=await api(`/workers/scripts/${workerName(e)}/settings`),schedule=await api(`/workers/scripts/${workerName(e)}/schedules`);
  const bindings=settings?.bindings;
  if(!Array.isArray(bindings)||bindings.length!==1||bindings[0].type!=='d1'||bindings[0].name!=='MOVIE_POPULARITY_DB'||bindings[0].id!==id||settings.compatibility_date!==DATE||settings.logpush!==false||settings.observability?.enabled!==false||!equal(schedule?.schedules?.map(s=>s.cron),['* * * * *']))fail('cleanup_invalid');
 }
 async function schemaValid(id){
  const rows=await tables(id);if(!['movie_popularity_tokens','movie_popularity_daily','movie_popularity_rate'].every(name=>rows.some(r=>r.name===name)))fail('schema_invalid');
  const triggers=await query(id,"SELECT name, sql FROM sqlite_master WHERE type = 'trigger'");
  if(triggers.length!==1||triggers[0].name!=='movie_popularity_count_insert'||!triggers[0].sql?.includes('ON CONFLICT(title_id, day) DO UPDATE SET views = views + 1'))fail('schema_invalid');
 }
 async function validateConfigured(){
  const p=await project(),list=await findDatabases();
  for(const e of environments){const id=exactDatabase(list,e);bindingSafe(p,e,id);if(p.deployment_configs[e].d1_databases?.MOVIE_POPULARITY_DB?.id!==id||p.deployment_configs[e].env_vars?.MOVIE_POPULARITY_SECRET?.type!=='secret_text')fail('configuration_incomplete');await schemaValid(id);await verifyCleanup(e,id);}
  return {p,list};
 }
 async function prepare(){
  const p=await project(),subscriptions=await api('/subscriptions'),list=await findDatabases(),scripts=await api('/workers/scripts');
  assertFreeCapacity(subscriptions,list,scripts);
  const statements=splitSql(await readText(env.MOVIE_POPULARITY_SCHEMA_FILE||'docs/movie-popularity-schema.sql'));
  const javascript=await readText(env.MOVIE_POPULARITY_WORKER_FILE||'/tmp/movie-popularity-cleanup.js');if(!javascript.trim())fail('cleanup_bundle_missing');
  for(const e of environments){
   const matches=list.filter(d=>d.name===databaseName(e));if(matches.length>1)fail('database_missing_or_ambiguous');
   let id=matches[0]?.uuid;
   // Existing bindings must point to an exact-named store before any new resources are created.
   if(p.deployment_configs[e].d1_databases?.MOVIE_POPULARITY_DB&&!id)fail('database_rebinding_refused');
   if(id)bindingSafe(p,e,id);
  }
  for(const e of environments){
   let id=list.find(d=>d.name===databaseName(e))?.uuid;
   if(!id){const created=await api('/d1/database','POST',{name:databaseName(e)});if(!created?.uuid)fail('database_creation_failed');id=created.uuid;}
   bindingSafe(p,e,id);await tables(id);
   for(const sql of statements)await query(id,sql);
   await schemaValid(id);
   if(scripts.some(s=>s.id===workerName(e))){const settings=await api(`/workers/scripts/${workerName(e)}/settings`);const bindings=settings?.bindings;if(!Array.isArray(bindings)||bindings.length!==1||bindings[0].type!=='d1'||bindings[0].name!=='MOVIE_POPULARITY_DB'||bindings[0].id!==id)fail('worker_rebinding_refused');}
   const metadata={main_module:'movie-popularity-cleanup.js',compatibility_date:DATE,bindings:[{type:'d1',name:'MOVIE_POPULARITY_DB',id}],logpush:false,observability:{enabled:false}};
   const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set('movie-popularity-cleanup.js',new Blob([javascript],{type:'application/javascript+module'}),'movie-popularity-cleanup.js');
   await api(`/workers/scripts/${workerName(e)}`,'PUT',form);await api(`/workers/scripts/${workerName(e)}/schedules`,'PUT',[{cron:'* * * * *'}]);await verifyCleanup(e,id);
   const vars={MOVIE_POPULARITY_ENABLED:{type:'plain_text',value:e==='preview'?'true':'false'}};
   if(!p.deployment_configs[e].env_vars?.MOVIE_POPULARITY_SECRET)vars.MOVIE_POPULARITY_SECRET={type:'secret_text',value:randomHex()};
   const current=await project();
   await patch(current,e,{d1_databases:{...current.deployment_configs[e].d1_databases,MOVIE_POPULARITY_DB:{id}},env_vars:vars});
  }
 }
 async function verifyPreview(value){
  let url;try{url=new URL(value);}catch{fail('preview_url_invalid');}
  if(url.hostname==='production.nceastudy.pages.dev'||url.protocol!=='https:'||!/^([a-z0-9-]+)\.nceastudy\.pages\.dev$/.test(url.hostname)||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)fail('preview_url_invalid');
  const {list}=await validateConfigured(),id=exactDatabase(list,'preview');
  const rateFixture=`synthetic-${randomHex()}`;
  if(!Number.isFinite(cleanupWaitMs)||cleanupWaitMs<5000||cleanupWaitMs>1200000)fail('cleanup_wait_invalid');
  const remove=()=>query(id,'DELETE FROM movie_popularity_tokens WHERE title_id = ?',[TITLE]).then(()=>query(id,'DELETE FROM movie_popularity_daily WHERE title_id = ?',[TITLE])).then(()=>query(id,'DELETE FROM movie_popularity_rate WHERE bucket_hash = ?',[rateFixture]));
  async function endpoint(body){let response;try{response=await fetcher(`${url.origin}/api/movie-popularity`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:url.origin}:{},body:body?JSON.stringify(body):undefined,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{fail('preview_request_failed');}if(body){if(response.status!==204)fail('preview_post_failed');return;}if(response.status!==200||response.headers.get('cache-control')!=='no-store')fail('preview_get_failed');let data;try{data=await response.json();}catch{fail('preview_response_invalid');}if(!Array.isArray(data.titleIds)||data.windowDays!==7)fail('preview_response_invalid');return data.titleIds;}
  const count=async()=>{const rows=await query(id,'SELECT views FROM movie_popularity_daily WHERE title_id = ?',[TITLE]);return rows.reduce((total,row)=>total+row.views,0);};
  try{
   await remove();if((await endpoint()).includes(TITLE))fail('preview_empty_failed');
   const first={titleId:TITLE,token:randomHex().slice(0,32)};
   await endpoint(first);await endpoint(first);if(await count()!==1)fail('preview_dedup_failed');
   for(let n=1;n<4;n++)await endpoint({titleId:TITLE,token:randomHex().slice(0,32)});
   if(await count()!==4||(await endpoint()).includes(TITLE))fail('preview_suppression_failed');
   await endpoint({titleId:TITLE,token:randomHex().slice(0,32)});if(await count()!==5||!(await endpoint()).includes(TITLE))fail('preview_ranking_failed');
   await remove();
   await query(id,'INSERT INTO movie_popularity_tokens (title_id, day, token_hash, expires_at) VALUES (?, ?, ?, ?)',[TITLE,Math.floor(now()/86400000)-10,randomHex(),now()-86400000]);
   await query(id,'INSERT INTO movie_popularity_rate (bucket_hash, attempts, expires_at) VALUES (?, ?, ?)',[rateFixture,1,now()-86400000]);
   let cleaned=false;
   for(let attempt=0;attempt<Math.ceil(cleanupWaitMs/5000);attempt++){await sleep(5000);const rows=await query(id,'SELECT token_hash FROM movie_popularity_tokens WHERE title_id = ?',[TITLE]);const rates=await query(id,'SELECT bucket_hash FROM movie_popularity_rate WHERE bucket_hash = ?',[rateFixture]);if(rows.length===0&&rates.length===0&&await count()===0){cleaned=true;break;}}
   if(!cleaned)fail('scheduled_cleanup_unverified');
  }finally{await remove();}
 }
 async function enableProduction(){const {p}=await validateConfigured();await patch(p,'production',{env_vars:{MOVIE_POPULARITY_ENABLED:{type:'plain_text',value:'true'}}});}
 async function disableProduction(){await patch(await project(),'production',{env_vars:{MOVIE_POPULARITY_ENABLED:{type:'plain_text',value:'false'}}});}
 return {prepare,verifyPreview,enableProduction,disableProduction};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const op=createOperator(),command=process.argv[2];if(command==='prepare')await op.prepare();else if(command==='verify-preview')await op.verifyPreview(process.argv[3]);else if(command==='enable-production')await op.enableProduction();else if(command==='disable-production')await op.disableProduction();else fail('command_invalid');console.log('Popularity operation verified.');}
 catch(error){const message=error instanceof Error&&/^[a-z_]+(?:_\d+)?$/.test(error.message)?error.message:'operation_failed';console.error(message);process.exitCode=1;}
}
