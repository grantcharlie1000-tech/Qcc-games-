import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
import {GATED_MIGRATIONS} from '../../scripts/db-migrate.mjs';
const migration=await readFile('db/migrations/20261107120000_frosthop_backend_board.sql','utf8');
it('opens only Frosthop, preserves existing scores, and keeps intentionally excluded games closed',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE arcade_scores (game_id text CONSTRAINT arcade_scores_game_id_check CHECK(game_id IN ('snake','custom-existing-game')), score int); INSERT INTO arcade_scores VALUES ('snake',100),('custom-existing-game',200)");
  await db.exec(migration);
  expect((await db.query('SELECT * FROM arcade_scores ORDER BY score')).rows).toEqual([{game_id:'snake',score:100},{game_id:'custom-existing-game',score:200}]);
  await db.exec("INSERT INTO arcade_scores VALUES ('femboy-obby',2147363647)");
  await expect(db.exec("INSERT INTO arcade_scores VALUES ('claimline',999)")).rejects.toThrow(/arcade_scores_game_id_check/);
  await expect(db.exec("INSERT INTO arcade_scores VALUES ('unknown',999)")).rejects.toThrow(/arcade_scores_game_id_check/);
 }finally{await db.close();}
});
it('refuses a missing game constraint instead of widening an unknown schema',async()=>{
 const db=new PGlite();
 try{await db.exec('CREATE TABLE arcade_scores(game_id text,score int)');await expect(db.exec(migration)).rejects.toThrow(/Expected arcade_scores_game_id_check is missing/);}
 finally{await db.close();}
});
it('requires explicit approval before the remote migration runner opens Frosthop',()=>{
 expect(GATED_MIGRATIONS).toContain('20261107120000_frosthop_backend_board');
});
