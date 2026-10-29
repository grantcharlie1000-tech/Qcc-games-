import {expect,it} from 'vitest';
import {games} from '../../src/core/catalog';
import {GAME_IDS} from '../../src/core/types';

it('registers each game exactly once and provides its loadable module',()=>{
 const ids=games.map(game=>game.id);
 expect(new Set(ids).size).toBe(ids.length);
 expect([...ids].sort()).toEqual([...GAME_IDS].sort());
 const modules=import.meta.glob('../../src/games/*/index.ts');
 expect(Object.keys(modules).sort()).toEqual(GAME_IDS.map(id=>`../../src/games/${id}/index.ts`).sort());
});
