import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {LocalDB,createLocalPool} from '../support/local-db';
import {migrate,migrationFiles,GATED_MIGRATIONS,MigrationApprovalError} from '../../scripts/db-migrate.mjs';
const local=new LocalDB();let pool:ReturnType<typeof createLocalPool>;
beforeAll(async()=>{await mkdir('.netlify',{recursive:true});pool=createLocalPool(await local.start());},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
const opts={expectEnv:'development',bootstrapMarker:'development',approvedMigrations:GATED_MIGRATIONS,log:()=>{}};
it('applies every migration to empty DB, then no-op with strict marker',async()=>{
 const result=await migrate(pool,opts);expect(result.applied.length).toBeGreaterThanOrEqual(9);
 const again=await migrate(pool,{expectEnv:'development',approvedMigrations:GATED_MIGRATIONS,log:()=>{}});expect(again.applied).toEqual([]);expect(again.pending).toEqual([]);
 expect((await pool.query('SELECT name FROM qcc_environment')).rows).toEqual([{name:'development'}]);
});
it('rejects wrong or empty marker, even with bootstrap requested',async()=>{
 await expect(migrate(pool,{...opts,expectEnv:'production'})).rejects.toThrow();
 await pool.query('DELETE FROM qcc_environment');await expect(migrate(pool,opts)).rejects.toThrow();
 await pool.query("INSERT INTO qcc_environment(name) VALUES ('development')");
});
it('adopts Netlify tracker without replay and aborts checksum changes',async()=>{
 await pool.query('CREATE SCHEMA netlify;CREATE TABLE netlify.migrations(name text primary key,applied_at timestamptz not null default now())');
 await pool.query('INSERT INTO netlify.migrations SELECT name,applied_at FROM qcc_schema_migrations');
 await pool.query('DROP TABLE qcc_schema_migrations');
 const adopted=await migrate(pool,opts);expect(adopted.adopted).toEqual((await migrationFiles()).map(file=>file.name));expect(adopted.adopted).toContain('20261028003000_account_sync_revisions');expect(adopted.adopted).toContain('20261029090000_runtime_flags');expect(adopted.applied).toEqual([]);
 await pool.query("UPDATE qcc_schema_migrations SET checksum='bad' WHERE name=(SELECT min(name) FROM qcc_schema_migrations)");
 await expect(migrate(pool,opts)).rejects.toThrow(/checksum/i);
 await pool.query('DROP TABLE qcc_schema_migrations');await migrate(pool,opts);
});
it('dry-run does not apply; late migration and directory migration are applied transactionally',async()=>{
 const directory=await mkdtemp(join(process.cwd(),'.netlify/qcc-migrations-'));const logs:string[]=[];
 try{
  await writeFile(join(directory,'0001_late.sql'),'CREATE TABLE late_test(id integer);');
  await mkdir(join(directory,'9999_folder'));await writeFile(join(directory,'9999_folder/migration.sql'),'CREATE TABLE folder_test(id integer);');
  expect((await migrate(pool,{...opts,directory,dryRun:true})).pending).toEqual(['0001_late','9999_folder']);
  expect((await pool.query("SELECT to_regclass('late_test') AS t")).rows[0].t).toBeNull();
  expect((await migrate(pool,{...opts,directory,log:(m:string)=>logs.push(m)})).applied).toEqual(['0001_late','9999_folder']);expect(logs.some(x=>x.includes('before'))).toBe(true);
  await writeFile(join(directory,'9998_failure.sql'),'CREATE TABLE rolled_back(id int); SELECT * FROM nonexistent;');
  await expect(migrate(pool,{...opts,directory})).rejects.toThrow();
  expect((await pool.query("SELECT to_regclass('rolled_back') AS t")).rows[0].t).toBeNull();
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('requires explicit known baseline and preserves already-applied files',async()=>{
 await expect(migrate(pool,{...opts,baselineThrough:'unknown'})).rejects.toThrow(/baseline/i);
});

it('applies PR #68 timestamp after the later sync and runtime migrations were adopted',async()=>{
 const directory=await mkdtemp(join(process.cwd(),'.netlify/qcc-migrations-'));
 const messages:string[]=[];
 try{
  // A non-idempotent probe proves execution, and the second run proves tracking.
  await writeFile(join(directory,'20261028002000_minesweeper_score.sql'),'CREATE TABLE pr68_probe(score integer); INSERT INTO pr68_probe VALUES (68);');
  const result=await migrate(pool,{...opts,directory,log:message=>messages.push(message)});
  expect(result.applied).toEqual(['20261028002000_minesweeper_score']);
  expect((await pool.query('SELECT score FROM pr68_probe')).rows).toEqual([{score:68}]);
  expect(messages.some(message=>message.includes('before latest applied'))).toBe(true);
  expect((await migrate(pool,{...opts,directory})).applied).toEqual([]);
  expect((await pool.query('SELECT name FROM qcc_schema_migrations WHERE name=$1',['20261028002000_minesweeper_score'])).rows).toEqual([{name:'20261028002000_minesweeper_score'}]);
 }finally{await rm(directory,{recursive:true,force:true});}
});

it('gates the social chat migration by default',()=>{expect(GATED_MIGRATIONS).toContain('20261105090000_social_chat');});
it('fails a pending gated migration before applying anything, unless approved; applied ones are unaffected',async()=>{
 const directory=await mkdtemp(join(process.cwd(),'.netlify/qcc-migrations-'));
 const base={expectEnv:'development',gatedMigrations:['7002_gated'],log:()=>{}};
 try{
  await writeFile(join(directory,'7001_free.sql'),'CREATE TABLE gate_free(id integer);');
  await writeFile(join(directory,'7002_gated.sql'),'CREATE TABLE gate_gated(id integer);');
  const refusal=migrate(pool,{...base,directory,approvedMigrations:''});
  await expect(refusal).rejects.toBeInstanceOf(MigrationApprovalError);
  await expect(refusal).rejects.toThrow(/7002_gated.*QCC_APPROVED_MIGRATIONS/);
  await expect(migrate(pool,{...base,directory,approvedMigrations:'7001_free, other'})).rejects.toThrow(/7002_gated/);
  expect((await pool.query("SELECT to_regclass('gate_free') AS a,to_regclass('gate_gated') AS b")).rows[0]).toEqual({a:null,b:null});
  expect((await migrate(pool,{...base,directory,approvedMigrations:'7002_gated',dryRun:true})).pending).toEqual(['7001_free','7002_gated']);
  expect((await migrate(pool,{...base,directory,approvedMigrations:'',status:true})).pending).toEqual(['7001_free','7002_gated']);
  expect((await migrate(pool,{...base,directory,approvedMigrations:'x,7002_gated'})).applied).toEqual(['7001_free','7002_gated']);
  const again=await migrate(pool,{...base,directory,approvedMigrations:''});expect(again.applied).toEqual([]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
