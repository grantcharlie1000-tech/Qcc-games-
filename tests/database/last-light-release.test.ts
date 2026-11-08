import {beforeAll,afterAll,it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalDB,createLocalPool} from '../support/local-db';
import {migrationFiles} from '../../scripts/db-migrate.mjs';
import {migrateLastLight,LAST_LIGHT_MIGRATION} from '../../scripts/migrate-last-light.mjs';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
const local=new LocalDB();let pool:ReturnType<typeof createLocalPool>;
beforeAll(async()=>{
 const directory=await mkdtemp(join(tmpdir(),'qcc-before-last-light-'));
 try{for(const file of await migrationFiles())if(file.name!==LAST_LIGHT_MIGRATION)await writeFile(join(directory,file.name+'.sql'),file.sql);
  pool=createLocalPool(await local.start());await local.applyMigrations(directory);
 }finally{await rm(directory,{recursive:true,force:true});}
},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
it('applies only Last Light with an unrelated gated migration pending, preserving existing scores',async()=>{
 const id='a'.repeat(64);await pool.query('INSERT INTO arcade_players(id,name) VALUES($1,$2)',[id,'Existing']);await pool.query("INSERT INTO arcade_scores(game_id,player_id,score) VALUES('snake',$1,500)",[id]);
 await pool.query("DELETE FROM qcc_schema_migrations WHERE name='20261108120000_study_pairing'");
 // An older live schema may intentionally restrict boards absent from its release.
 await pool.query("ALTER TABLE arcade_scores DROP CONSTRAINT arcade_scores_game_id_check;ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK (game_id IN ('snake'))");
 const before=(await pool.query('SELECT * FROM arcade_scores')).rows;
 const result=await migrateLastLight(pool,{expectEnv:'development',log:()=>{}});expect(result.applied).toEqual([LAST_LIGHT_MIGRATION]);
 expect((await pool.query("SELECT name FROM qcc_schema_migrations WHERE name='20261108120000_study_pairing'")).rows).toEqual([]);
 expect((await pool.query('SELECT * FROM arcade_scores')).rows).toEqual(before);
 await expect(pool.query("INSERT INTO arcade_scores(game_id,player_id,score) VALUES('claimline',$1,1)",[id])).rejects.toMatchObject({code:'23514'});
 await expect(pool.query("INSERT INTO arcade_scores(game_id,player_id,score) VALUES('future-game',$1,1)",[id])).rejects.toMatchObject({code:'23514'});
 expect((await migrateLastLight(pool,{expectEnv:'development',log:()=>{}})).applied).toEqual([]);
 expect((await pool.query('SELECT * FROM arcade_scores')).rows).toEqual(before);
});
it('supports real signed-in Last Light rankings and cloud save keys after the release migration',async()=>{
 const accounts=createAccountsHandler(pool),board=createLeaderboardHandler(pool),base='https://qcc.test/.netlify/functions/';
 const signup=await accounts(new Request(base+'accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'Light_Release',password:'local test password'})}));expect(signup.status).toBe(201);const {token}=await signup.json();
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const post=(score:number)=>board(new Request(base+'leaderboard',{method:'POST',headers,body:JSON.stringify({game:'last-light',score})}));expect((await post(1600000)).status).toBe(200);expect((await post(1500000)).status).toBe(200);
 const personal=await board(new Request(base+'leaderboard?game=last-light&view=personal',{headers}));expect((await personal.json()).player).toMatchObject({name:'Light_Release',score:1600000});
 const updated=1,saves={'best:last-light':{value:1600000,updated},'save:last-light':{value:{version:1,data:{stage:1},updated},updated},favourites:{value:['last-light'],updated}};
 expect((await accounts(new Request(base+'accounts?action=sync',{method:'PUT',headers,body:JSON.stringify({saves})}))).status).toBe(200);
 const pulled=await (await accounts(new Request(base+'accounts?action=sync',{headers}))).json();expect(pulled.saves['save:last-light'].value.data.stage).toBe(1);
});
it('refuses an environment-marker mismatch before changing migration history',async()=>{
 const before=(await pool.query('SELECT * FROM qcc_schema_migrations ORDER BY name')).rows;
 await expect(migrateLastLight(pool,{expectEnv:'production',log:()=>{}})).rejects.toThrow(/marker/i);
 expect((await pool.query('SELECT * FROM qcc_schema_migrations ORDER BY name')).rows).toEqual(before);
});
