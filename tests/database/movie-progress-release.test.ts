import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalDB,createLocalPool} from '../support/local-db';
import {migrationFiles} from '../../scripts/db-migrate.mjs';
import {migrateMovieProgress,MOVIE_PROGRESS_MIGRATION} from '../../scripts/migrate-movie-progress.mjs';
const local=new LocalDB();let pool:ReturnType<typeof createLocalPool>;
beforeAll(async()=>{
 const directory=await mkdtemp(join(tmpdir(),'qcc-before-movie-progress-'));
 try{for(const file of await migrationFiles())if(file.name!==MOVIE_PROGRESS_MIGRATION)await writeFile(join(directory,file.name+'.sql'),file.sql);
  pool=createLocalPool(await local.start());await local.applyMigrations(directory);
 }finally{await rm(directory,{recursive:true,force:true});}
},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
it('applies only movie progress with an unrelated pending migration and preserves scores and account saves',async()=>{
 const player='a'.repeat(64),account='00000000-0000-4000-8000-000000000001';
 await pool.query('INSERT INTO arcade_players(id,name) VALUES($1,$2)',[player,'Existing']);
 await pool.query("INSERT INTO accounts(id,username,password_hash,player_id) VALUES($1,'Existing','scrypt$test',$2)",[account,player]);
 await pool.query("INSERT INTO arcade_scores(game_id,player_id,score) VALUES('snake',$1,500)",[player]);
 await pool.query("INSERT INTO account_saves(account_id,key,value,updated) VALUES($1,'best:snake','500',1)",[account]);
 await pool.query("DELETE FROM qcc_schema_migrations WHERE name='20261108120000_study_pairing'");
 const snapshot=async()=>({saves:(await pool.query('SELECT * FROM account_saves')).rows,scores:(await pool.query('SELECT * FROM arcade_scores')).rows});const before=await snapshot();
 expect((await migrateMovieProgress(pool,{expectEnv:'development',log:()=>{}})).applied).toEqual([MOVIE_PROGRESS_MIGRATION]);
 expect((await pool.query("SELECT name FROM qcc_schema_migrations WHERE name='20261108120000_study_pairing'")).rows).toEqual([]);
 expect((await pool.query("SELECT to_regclass('account_movie_progress') AS name")).rows[0].name).toBe('account_movie_progress');
 expect(await snapshot()).toEqual(before);expect((await migrateMovieProgress(pool,{expectEnv:'development',log:()=>{}})).applied).toEqual([]);expect(await snapshot()).toEqual(before);
});
it('rejects the wrong environment without changing schema history',async()=>{
 const before=(await pool.query('SELECT * FROM qcc_schema_migrations ORDER BY name')).rows;
 await expect(migrateMovieProgress(pool,{expectEnv:'production',log:()=>{}})).rejects.toThrow();
 expect((await pool.query('SELECT * FROM qcc_schema_migrations ORDER BY name')).rows).toEqual(before);
});
it('refuses missing account prerequisites before changing migration history',async()=>{
 const before=(await pool.query('SELECT * FROM qcc_schema_migrations ORDER BY name')).rows;
 await pool.query('ALTER TABLE accounts RENAME TO prerequisite_probe');
 try{await expect(migrateMovieProgress(pool,{expectEnv:'development',log:()=>{}})).rejects.toThrow(/prerequisites/);expect((await pool.query('SELECT * FROM qcc_schema_migrations ORDER BY name')).rows).toEqual(before);}
 finally{await pool.query('ALTER TABLE prerequisite_probe RENAME TO accounts');}
});
