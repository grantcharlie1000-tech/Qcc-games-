import {expect,test} from 'vitest';
import {createFakeGame} from './helpers/fake-game';
import {createPlayer} from '../../../src/games/blockcraft/player/player';
import {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import {Engine} from '../../../src/games/blockcraft/engine/game';
import {B} from '../../../src/games/blockcraft/data/blocks';

test('restored crawl position stays below its roof once chunks load',()=>{
  const game=createFakeGame();game.flat();
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=61;y<=70;y++)game.world.set(x,y,z,B.stone);
  const player=createPlayer(game);game.player=player;player.init?.();
  player.teleport(.5,60,.5);player.frame?.(1/60);
  expect(player.height).toBe(.6);
  const saved=player.serialize?.();(game.world as VoxelWorld).clear();player.reset?.();player.restore?.(saved);
  expect(player.height).toBe(1.8);
  game.flat();
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=61;y<=70;y++)game.world.set(x,y,z,B.stone);
  const engine={world:game.world,player,streamer:{hasNeighbours:()=>true,isMeshed:()=>true},state:'ready',freshWorld:false,spawnPending:true,bedPending:false};
  (Engine.prototype as unknown as {trySpawn(this:unknown):void}).trySpawn.call(engine);
  expect(player.state.y).toBe(60);expect(player.height).toBe(.6);
  expect(player.eye().y).toBeCloseTo(60.4);expect(engine.spawnPending).toBe(false);
});
