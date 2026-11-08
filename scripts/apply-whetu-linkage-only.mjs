/** One-time, production-only operator job. Never imports the general migrator. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPool} from './db-connection.mjs';

const NAME='20261108120000_study_pairing';
const CHECKSUM='3d6c5299ad4945a94e309fc0b69a2738abff4261f6080e991ba182a2568cb885';
const PROJECT='prj_fbux5PWt7vcWjLHJ8d3B1ANjSO8b';
const APPROVAL='qcc-games-api:production:20261108120000_study_pairing';
const TABLES={
 qcc_study_links:{columns:'qcc_account_id:uuid,whetu_subject:text,linked_at:bigint',constraints:{p:1,f:1,u:1,c:2}},
 qcc_study_browsers:{columns:'digest:text,epoch:bigint,qcc_account_id:uuid?,qcc_session_hash:text?',constraints:{p:1,f:1,c:4}},
 qcc_study_pairing_intents:{columns:'digest:text,browser_digest:text,browser_epoch:bigint,scope:text,return_path:text,qcc_account_id:uuid,qcc_session_hash:text,qcc_consented_at:bigint,expires_at:bigint,state:text,whetu_session_id:text?,whetu_subject:text?,challenge_digest:text?',constraints:{p:1,f:2,c:13}},
 qcc_study_contexts:{columns:'digest:text,browser_digest:text,browser_epoch:bigint,whetu_session_id:text,qcc_account_id:uuid,qcc_session_hash:text,whetu_subject:text,expires_at:bigint',constraints:{p:1,f:2,c:6}},
};
const INDEXES=['qcc_study_pairing_browser','qcc_study_pairing_expiry','qcc_study_context_browser','qcc_study_context_expiry'];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
class GuardRefusal extends Error{}
function requireState(ok,message){if(!ok)throw new GuardRefusal(message);}
const outcome={commitAttempted:false,committed:false,verified:false};

async function inspect(client){
 const result=await client.query(`SELECT c.relname,c.relkind,c.relrowsecurity,
  pg_get_userbyid(c.relowner)=current_user AS owned
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,[Object.keys(TABLES)]);
 for(const table of Object.keys(TABLES)){
  const actual=result.rows.find(r=>r.relname===table);
  requireState(actual?.relkind==='r'&&actual.relrowsecurity&&actual.owned,'Unexpected linkage table ownership or RLS');
  const columns=(await client.query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,[table])).rows
   .map(c=>`${c.column_name}:${c.data_type}${c.is_nullable==='YES'?'?':''}`).join(',');
  requireState(columns===TABLES[table].columns,'Unexpected linkage columns');
  const constraints=(await client.query(`SELECT contype,count(*)::int AS count,bool_and(convalidated) AS valid
   FROM pg_constraint WHERE conrelid=('public.'||$1)::regclass GROUP BY contype`,[table])).rows;
  requireState(constraints.length===Object.keys(TABLES[table].constraints).length&&constraints.every(c=>c.valid&&TABLES[table].constraints[c.contype]===c.count),'Unexpected linkage constraints');
  const publicGrants=(await client.query(`SELECT count(*)::int AS count FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE n.nspname='public' AND c.relname=$1 AND a.grantee=0`,[table])).rows[0].count;
  requireState(publicGrants===0,'Unexpected PUBLIC linkage grants');
  requireState((await client.query('SELECT count(*)::text AS count FROM public.'+quote(table))).rows[0].count==='0','Refusing unexpected pre-existing linkage rows');
 }
 const indexes=(await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[])`,[INDEXES])).rows;
 requireState(indexes.length===INDEXES.length,'Missing linkage indexes');
}

async function counts(client,tables){
 const result=[];
 for(const table of tables)result.push([table,(await client.query('SELECT count(*)::text AS count FROM public.'+quote(table))).rows[0].count]);
 return JSON.stringify(result);
}

async function main(){
 requireState(process.env.QCC_STUDY_SCHEMA_APPROVED===APPROVAL,'Exact production schema approval required');
 requireState(process.env.VERCEL_ENV==='production'&&process.env.VERCEL_PROJECT_ID===PROJECT,'Unexpected Vercel project/environment');
 const url=new URL(process.env.DATABASE_URL??'');
 requireState(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname.endsWith('.neon.tech'),'Expected existing Neon connection');
 const sql=await readFile(new URL('../db/migrations/'+NAME+'.sql',import.meta.url),'utf8');
 requireState(createHash('sha256').update(sql).digest('hex')===CHECKSUM,'Migration source checksum changed');
 const pool=createPool();let client;let committed=false;
 try{
  client=await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'; SET LOCAL search_path=public,pg_catalog");
  await client.query('SELECT pg_advisory_xact_lock($1)',[728192104]);
  const marker=(await client.query('SELECT name FROM public.qcc_environment WHERE id=true FOR SHARE')).rows;
  requireState(marker.length===1&&marker[0].name==='production','Production database marker mismatch');
  const required=(await client.query(`SELECT c.relname,pg_get_userbyid(c.relowner)=current_user AS owned
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
   AND c.relkind='r' AND c.relname=ANY($1::text[])`,[['accounts','account_sessions','account_saves','qcc_schema_migrations']])).rows;
  requireState(required.length===4&&required.every(r=>r.owned),'Existing QCC production schema/role mismatch');
  const accountId=(await client.query(`SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='id'`)).rows;
  requireState(accountId.length===1&&accountId[0].data_type==='uuid','QCC account identity schema mismatch');
  const existing=(await client.query('SELECT name,checksum FROM public.qcc_schema_migrations WHERE name=$1',[NAME])).rows;
  const objects=(await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND (c.relname LIKE 'qcc_study_%')`)).rows;
  if(existing.length){
   requireState(existing.length===1&&existing[0].checksum===CHECKSUM,'Existing migration checksum mismatch');
   await inspect(client);await client.query('COMMIT');committed=true;
   console.log('WHETU_LINKAGE_SCHEMA_ALREADY_APPLIED: exact migration, empty linkage tables, constraints and RLS verified.');
  }else{
   requireState(objects.length===0,'Unexpected pre-existing Study objects; refusing changes');
   const tableNames=(await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'qcc_schema_migrations' ORDER BY tablename`)).rows.map(r=>r.tablename);
   const before=await counts(client,tableNames);
   console.log('WHETU_LINKAGE_TARGET_VERIFIED: existing qcc-games-api production Neon database and owner role; exact additive migration only.');
   await client.query(sql);
   await inspect(client);
   requireState(before===await counts(client,tableNames),'Existing table row counts changed; rolling back');
   await client.query('INSERT INTO public.qcc_schema_migrations(name,checksum) VALUES ($1,$2)',[NAME,CHECKSUM]);
   outcome.commitAttempted=true;
   await client.query('COMMIT');committed=true;outcome.committed=true;
   console.log('WHETU_LINKAGE_SCHEMA_COMMITTED: four empty metadata tables, indexes, constraints and RLS; existing public-table row counts unchanged in transaction snapshot.');
  }
  // Fresh post-commit observation, not an application test or traffic cutover.
  await client.query('BEGIN READ ONLY');
  await inspect(client);
  const recorded=(await client.query('SELECT checksum FROM public.qcc_schema_migrations WHERE name=$1',[NAME])).rows;
  requireState(recorded.length===1&&recorded[0].checksum===CHECKSUM,'Post-commit migration record mismatch');
  await client.query('COMMIT');
  outcome.verified=true;
  console.log('WHETU_LINKAGE_SCHEMA_POSTCOMMIT_VERIFIED: production API deployment remains unchanged; no application tests or other migrations run.');
 }catch(error){
  if(client)await client.query('ROLLBACK').catch(()=>{});
  // Never print raw driver errors: they may include connection details or data.
  console.error(committed?'WHETU_LINKAGE_COMMITTED_BUT_POSTCHECK_FAILED: do not retry blindly.':outcome.commitAttempted?'WHETU_LINKAGE_COMMIT_OUTCOME_UNKNOWN: acknowledgement lost; inspect production schema/history before any retry.':'WHETU_LINKAGE_NOT_COMMITTED: refused or rolled back; no other migrations executed.');
  const reason=error instanceof GuardRefusal?error.message:'Database operation failed; credential/data details suppressed'+(/^[A-Z0-9]{5}$/.test(error?.code??'')?' (SQLSTATE '+error.code+')':'');
  throw new GuardRefusal(reason);
 }finally{client?.release();await pool.end();}
 // Operator-only build must not produce an empty or unintended API deployment.
 console.log('WHETU_OPERATOR_JOB_COMPLETE_NO_DEPLOY: intentionally stopping before Vercel publishes any deployment.');
 process.exitCode=78;
}
main().catch(error=>{if(error instanceof GuardRefusal)console.error('WHETU_LINKAGE_GUARD: '+error.message);else if(outcome.commitAttempted)console.error('WHETU_LINKAGE_FINALIZER_FAILED_AFTER_COMMIT_ATTEMPT: do not retry blindly; committed='+outcome.committed+'; postcheckVerified='+outcome.verified);else console.error('WHETU_LINKAGE_PREFLIGHT_OR_CONNECTION_FAILED: no write COMMIT attempted; raw details suppressed.');process.exitCode=1;});
