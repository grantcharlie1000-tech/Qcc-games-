import {readdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPool,databaseHost} from './db-connection.mjs';
const environments=['production','preview','development'];
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const canonical=name=>name.endsWith('.sql')?name.slice(0,-4):name;
const LOCK=728192104;
export async function migrationFiles(directory='db/migrations'){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=entry.isFile()&&entry.name.endsWith('.sql')?join(directory,entry.name):entry.isDirectory()?join(directory,entry.name,'migration.sql'):null;
  if(!path)continue;
  let sql;try{sql=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT'&&entry.isDirectory())continue;throw error;}
  files.push({name:canonical(entry.name),sql,checksum:createHash('sha256').update(sql).digest('hex')});
 }
 files.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(new Set(files.map(f=>f.name)).size!==files.length)throw new Error('Duplicate migration name');
 return files;
}
async function transaction(client,fn,readonly=false){
 await client.query('BEGIN');
 try{if(readonly)await client.query('SET TRANSACTION READ ONLY');else await client.query('SELECT pg_advisory_xact_lock($1)',[LOCK]);const result=await fn();await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}
}
async function marker(client,expectEnv,bootstrapMarker){
 if(!environments.includes(expectEnv))throw new Error('--expect-env production|preview|development is required');
 const exists=(await client.query("SELECT to_regclass('public.qcc_environment') AS t")).rows[0].t;
 if(!exists){if(bootstrapMarker!==expectEnv)throw new Error('Environment marker absent; explicit matching --bootstrap-marker required');return false;}
 const rows=(await client.query('SELECT name FROM public.qcc_environment WHERE id=true')).rows;
 if(rows.length!==1||rows[0].name!==expectEnv)throw new Error('Environment marker mismatch or missing row');
 return true;
}
async function history(client,files,baselineThrough){
 const known=new Set(files.map(f=>f.name));const aliases=files.flatMap(f=>[f.name,f.name+'.sql']);
 const adopted=new Set();
 // The local Netlify package uses netlify.migrations(name, applied_at). Platform
 // internals are undocumented, so discover name-like text columns as a fallback.
 const tables=(await client.query(`SELECT table_schema,table_name,column_name FROM information_schema.columns
  WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name ILIKE '%migration%'
  AND table_name<>'qcc_schema_migrations' AND data_type IN ('text','character varying')
  AND column_name IN ('name','migration_name','filename','version','id')`)).rows;
 for(const t of tables){
  const column=quote(t.column_name);
  const result=await client.query(`SELECT ${column} AS name FROM ${quote(t.table_schema)}.${quote(t.table_name)} WHERE ${column}=ANY($1::text[])`,[aliases]);
  for(const row of result.rows){const name=canonical(row.name);if(known.has(name))adopted.add(name);}
 }
 if(baselineThrough){const last=canonical(baselineThrough);if(!known.has(last))throw new Error('Unknown --baseline-through migration');for(const f of files)if(f.name<=last)adopted.add(f.name);}
 const exists=(await client.query("SELECT to_regclass('public.qcc_schema_migrations') AS t")).rows[0].t;
 const rows=exists?(await client.query('SELECT name,checksum FROM public.qcc_schema_migrations')).rows:[];
 const applied=new Map(rows.map(r=>[r.name,r.checksum]));
 for(const f of files)if(applied.has(f.name)&&applied.get(f.name)!==f.checksum)throw new Error(`Migration checksum mismatch: ${f.name}`);
 return {applied,adopted};
}
/** Apply each unapplied file in its own locked transaction, including late files.
 * @param {import('pg').Pool} pool
 * @param {{expectEnv:string,bootstrapMarker?:string,directory?:string,dryRun?:boolean,status?:boolean,baselineThrough?:string,log?:(message:string)=>void}} options
 */
export async function migrate(pool,options){
 const {expectEnv,bootstrapMarker,directory='db/migrations',dryRun=false,status=false,baselineThrough,log=console.log}=options;
 if(bootstrapMarker&&bootstrapMarker!==expectEnv)throw new Error('Bootstrap marker must match expected environment');
 const files=await migrationFiles(directory);const client=await pool.connect();const applied=[];const adopted=[];let pending=[];
 try{
  await transaction(client,async()=>{
   await marker(client,expectEnv,bootstrapMarker);
   const state=await history(client,files,baselineThrough);
   pending=files.filter(f=>!state.applied.has(f.name)&&!state.adopted.has(f.name));
   const latest=[...state.applied.keys(),...state.adopted].sort().at(-1);
   if(latest&&pending.some(f=>f.name<latest))log('Warning: pending migration sorts before latest applied migration; all unapplied files will run.');
   if(dryRun||status){adopted.push(...state.adopted);return;}
   await client.query(`CREATE TABLE IF NOT EXISTS public.qcc_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
   for(const f of files)if(state.adopted.has(f.name)&&!state.applied.has(f.name)){
    await client.query('INSERT INTO public.qcc_schema_migrations(name,checksum) VALUES ($1,$2)',[f.name,f.checksum]);adopted.push(f.name);
   }
  },dryRun||status);
  if(dryRun||status){for(const f of pending)log(`Pending: ${f.name}`);log(`Pending migrations: ${pending.length}; legacy names recognized: ${adopted.length}`);return {applied,pending:pending.map(f=>f.name),adopted};}
  for(const file of pending)await transaction(client,async()=>{
   await marker(client,expectEnv,bootstrapMarker);
   const existing=(await client.query('SELECT checksum FROM public.qcc_schema_migrations WHERE name=$1',[file.name])).rows[0];
   if(existing){if(existing.checksum!==file.checksum)throw new Error(`Migration checksum mismatch: ${file.name}`);return;}
   await client.query(file.sql);
   await client.query('INSERT INTO public.qcc_schema_migrations(name,checksum) VALUES ($1,$2)',[file.name,file.checksum]);
   // Initialize the marker atomically with the migration that creates it.
   if(bootstrapMarker){const exists=(await client.query("SELECT to_regclass('public.qcc_environment') AS t")).rows[0].t;if(exists)await client.query('INSERT INTO public.qcc_environment(id,name) VALUES (true,$1) ON CONFLICT(id) DO NOTHING',[bootstrapMarker]);}
   applied.push(file.name);log(`Applied: ${file.name}`);
  });
  await transaction(client,()=>marker(client,expectEnv));
  log(`Applied migrations: ${applied.length}; adopted: ${adopted.length}`);
  return {applied,pending:[],adopted};
 }finally{client.release();}
}
async function main(){
 const args=process.argv.slice(2);const options={};
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--dry-run'){options.dryRun=true;continue;}if(arg==='--status'){options.status=true;continue;}
  const key={'--expect-env':'expectEnv','--bootstrap-marker':'bootstrapMarker','--baseline-through':'baselineThrough','--directory':'directory'}[arg];
  if(!key||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Invalid migration arguments');options[key]=args[++i];
 }
 if(!environments.includes(options.expectEnv))throw new Error('--expect-env is required');
 if(!process.env.DATABASE_URL){
  const preview=['deploy-preview','branch-deploy'].includes(process.env.CONTEXT??'');
  if(preview&&options.expectEnv==='preview'&&process.env.QCC_ALLOW_NO_DB==='1'){console.warn('Warning: preview database migration skipped because QCC_ALLOW_NO_DB=1. Online services unavailable.');return;}
  throw new Error('DATABASE_URL required; migration build fails closed');
 }
 console.log(`Database host: ${databaseHost(process.env.DATABASE_URL)}; expected environment: ${options.expectEnv}`);
 const pool=createPool();try{await migrate(pool,options);}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Database migration refused or failed. Check environment marker, arguments, migration history/checksums, and connectivity. Details suppressed to protect data.');process.exitCode=1;});
