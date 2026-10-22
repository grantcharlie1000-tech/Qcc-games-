import {expect,test} from 'vitest';
import {Engine} from '../../../src/games/blockcraft/engine/game';
import {createFakeGame} from './helpers/fake-game';

for(const mode of ['creative','survival'] as const)test(`mode reporting updates synchronously to ${mode} while the menu loop is stopped`,()=>{
  const game=createFakeGame();
  game.settings.mode=mode==='creative'?'survival':'creative';
  game.root.dataset.mode=game.settings.mode;
  game.player.state.flying=true;
  let reported:string|undefined;
  game.events.on('modeChanged',()=>{reported=game.root.dataset.mode;});
  Engine.prototype.updateSettings.call(game as unknown as Engine,{mode});
  expect(game.settings.mode).toBe(mode);
  expect(game.root.dataset.mode).toBe(mode);
  expect(reported).toBe(mode);
  expect(game.player.state.flying).toBe(mode==='creative');
});
