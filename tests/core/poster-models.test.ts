import {expect,test} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {GAME_IDS} from '../../src/core/types';

// Every library poster comes from the lit voxel engine (scripts/posters). A game without its own model
// would fall back to hand-made or older art, which is how main and production once showed different posters.
// Breachline's cover is its own designed title card, kept identical on both branches.
const DESIGNED=new Set(['breachline']);
test('every game poster is built by the lit poster engine',()=>{
 const generator=readFileSync('scripts/generate-posters.mjs','utf8');
 for(const id of GAME_IDS.filter(id=>!DESIGNED.has(id))){
  expect(existsSync(`scripts/posters/models/${id}.mjs`),id).toBe(true);
  expect(generator,id).toContain(`'${id}'`);
  expect(readFileSync(`public/game-art/${id}/cover.svg`,'utf8'),id).toContain('<svg');
 }
 expect(generator).toContain("from './posters/engine.mjs'");
});
