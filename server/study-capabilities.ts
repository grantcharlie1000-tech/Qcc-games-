// Server-only, anonymous-user compatibility. Never reads identities or creates proofs.
import type {Database} from '../src/leaderboard/server';
const MIGRATION='20261108120000_study_pairing';
const CHECKSUM='3d6c5299ad4945a94e309fc0b69a2738abff4261f6080e991ba182a2568cb885';
const TABLES={
 qcc_study_links:{columns:'qcc_account_id:uuid,whetu_subject:text,linked_at:bigint',constraints:{p:1,f:1,u:1,c:2},keys:['p:qcc_account_id','u:whetu_subject','f:qcc_account_id:public.accounts:id:r:a']},
 qcc_study_browsers:{columns:'digest:text,epoch:bigint,qcc_account_id:uuid?,qcc_session_hash:text?',constraints:{p:1,f:1,c:4},keys:['p:digest','f:qcc_account_id:public.accounts:id:r:a']},
 qcc_study_pairing_intents:{columns:'digest:text,browser_digest:text,browser_epoch:bigint,scope:text,return_path:text,qcc_account_id:uuid,qcc_session_hash:text,qcc_consented_at:bigint,expires_at:bigint,state:text,whetu_session_id:text?,whetu_subject:text?,challenge_digest:text?',constraints:{p:1,f:2,c:13},keys:['p:digest','f:browser_digest:public.qcc_study_browsers:digest:r:a','f:qcc_account_id:public.accounts:id:r:a']},
 qcc_study_contexts:{columns:'digest:text,browser_digest:text,browser_epoch:bigint,whetu_session_id:text,qcc_account_id:uuid,qcc_session_hash:text,whetu_subject:text,expires_at:bigint',constraints:{p:1,f:2,c:6},keys:['p:digest','f:browser_digest:public.qcc_study_browsers:digest:r:a','f:qcc_account_id:public.accounts:id:r:a']},
} as const;
const INDEXES={qcc_study_pairing_browser:['qcc_study_pairing_intents','browser_digest'],qcc_study_pairing_expiry:['qcc_study_pairing_intents','expires_at'],qcc_study_context_browser:['qcc_study_contexts','browser_digest'],qcc_study_context_expiry:['qcc_study_contexts','expires_at']} as const;
type Env=Record<string,string|undefined>;
function httpsOrigin(value:string|undefined):value is string {
 try{const url=new URL(value??'');return url.protocol==='https:'&&url.origin===value;}catch{return false;}
}
function configuration(env:Env){
 const publicOrigin=env.QCC_NCEASTUDY_ORIGIN,runtimeOrigin=env.WHETU_NCEASTUDY_RUNTIME_ORIGIN,authCookie=env.WHETU_SUPABASE_AUTH_COOKIE;
 if(env.QCC_WHETU_PAIRING!=='on'||!httpsOrigin(publicOrigin)||!httpsOrigin(runtimeOrigin)||publicOrigin===runtimeOrigin||!authCookie||!/^sb-[a-z0-9]{20}-auth-token$/.test(authCookie))return null;
 if(!env.QCC_WHETU_SERVICE_SECRET||Buffer.byteLength(env.QCC_WHETU_SERVICE_SECRET)<32)return null;
 // Browser handoffs must be explicitly allowed, not merely accepted via a wildcard.
 if(!(env.QCC_ALLOWED_ORIGINS??'').split(',').some(value=>value.trim().replace(/\/$/,'')===publicOrigin))return null;
 return {publicOrigin,runtimeOrigin,authCookie};
}
/** A fresh, bounded metadata snapshot. RLS bypass is permitted only for the owning server role. */
async function schemaCompatible(db:Database):Promise<boolean>{
 const client=await db.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='2s'; SET LOCAL lock_timeout='500ms'; SET LOCAL search_path=pg_catalog,public");
  const names=Object.keys(TABLES);
  const history=(await client.query('SELECT checksum FROM public.qcc_schema_migrations WHERE name=$1',[MIGRATION])).rows;
  if(history.length!==1||history[0].checksum!==CHECKSUM)return false;
  const tables=(await client.query(`SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
   pg_get_userbyid(c.relowner)=current_user AS owned,
   (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
   (SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers,
   (SELECT count(*)::int FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_grants
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[names])).rows;
  const columns=(await client.query(`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`,[names])).rows;
  const constraints=(await client.query(`SELECT c.relname,k.contype,k.convalidated,k.condeferrable,
   ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY v(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=v.num ORDER BY v.ord) AS columns,
   fn.nspname AS foreign_schema,fc.relname AS foreign_table,
   ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY v(num,ord) JOIN pg_attribute a ON a.attrelid=fc.oid AND a.attnum=v.num ORDER BY v.ord) AS foreign_columns,
   k.confdeltype,k.confupdtype,ki.indisvalid AS key_valid,ki.indisready AS key_ready,ki.indimmediate AS key_immediate
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   LEFT JOIN pg_index ki ON ki.indexrelid=k.conindid
   LEFT JOIN pg_class fc ON fc.oid=k.confrelid LEFT JOIN pg_namespace fn ON fn.oid=fc.relnamespace
   WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND k.contype<>'n'`,[names])).rows;
  if(tables.length!==names.length)return false;
  for(const name of names){
   const expected=TABLES[name as keyof typeof TABLES],table=tables.find(row=>row.relname===name);
   if(!table||table.relkind!=='r'||table.relrowsecurity!==true||table.relforcerowsecurity!==false||table.owned!==true||table.policies!==0||table.triggers!==0||table.public_grants!==0)return false;
   const shape=columns.filter(row=>row.table_name===name).map(row=>`${row.column_name}:${row.data_type}${row.is_nullable==='YES'?'?':''}`).join(',');
   if(shape!==expected.columns)return false;
   const actual=constraints.filter(row=>row.relname===name),counts:Record<string,number>={};
   for(const row of actual){if(row.convalidated!==true||row.condeferrable!==false||row.contype!=='c'&&(row.key_valid!==true||row.key_ready!==true||row.key_immediate!==true))return false;counts[row.contype]=(counts[row.contype]??0)+1;}
   if(Object.keys(counts).length!==Object.keys(expected.constraints).length||Object.entries(expected.constraints).some(([type,count])=>counts[type]!==count))return false;
   const keys=actual.filter(row=>row.contype!=='c').map(row=>row.contype+':'+row.columns.join(',')+(row.contype==='f'?':'+row.foreign_schema+'.'+row.foreign_table+':'+row.foreign_columns.join(',')+':'+row.confdeltype+':'+row.confupdtype:''));
   if(keys.sort().join('|')!==[...expected.keys].sort().join('|'))return false;
  }
  const indexes=(await client.query(`SELECT ic.relname,c.relname AS table_name,i.indisvalid,i.indisready,i.indisunique,i.indpred IS NULL AS whole,i.indexprs IS NULL AS plain,
   ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY v(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=v.num ORDER BY v.ord) AS columns
   FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND ic.relname=ANY($1::text[])`,[Object.keys(INDEXES)])).rows;
  if(indexes.length!==Object.keys(INDEXES).length)return false;
  for(const [name,[table,column]] of Object.entries(INDEXES)){
   const index=indexes.find(row=>row.relname===name);
   if(!index||index.table_name!==table||index.indisvalid!==true||index.indisready!==true||index.indisunique!==false||index.whole!==true||index.plain!==true||index.columns.join(',')!==column)return false;
  }
  return true;
 }catch{return false;}
 finally{await client.query('ROLLBACK').catch(()=>{});client.release();}
}
/** No user session is needed: signup must remain possible before pairing exists. */
export function createStudyCapabilitiesChecker(db:Database,env:Env,now:()=>number=Date.now){
 let pending:Promise<boolean>|undefined,checkedAt=0;
 return async()=>{
  const config=configuration(env);if(!config)return null;
  if(!pending||now()-checkedAt>=5000){checkedAt=now();pending=schemaCompatible(db);}
  const observed=pending,compatible=await observed;if(!compatible){if(pending===observed)pending=undefined;return null;}
  return {version:'nceastudy-whetu-capabilities-v1',pairingProtocol:'verified-explicit-v1',browserEpoch:true,sessionBinding:'verified-session-id-v1',...config,ready:true,schema:MIGRATION} as const;
 };
}
