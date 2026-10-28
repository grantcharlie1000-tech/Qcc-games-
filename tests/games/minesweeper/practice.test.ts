import {describe,it,expect} from 'vitest';
import {create,reveal,neighbors} from '../../../src/games/minesweeper/model';
import {hint,competitiveScore,recordStart,recordWin,emptyStats,readStats} from '../../../src/games/minesweeper/practice';
describe('visible deductions and competitive records',()=>{
 it('does not peek at hidden cells or assume player flags are correct',()=>{
  const b=create('beginner',7);reveal(b,40);
  const h=hint(b);expect(h).not.toBeNull();expect(h!.explanation.length).toBeGreaterThan(25);
  expect(b.cells[h!.index]).not.toBe(-1);expect(b.revealed[h!.index]).toBe(false);
  const scrambled=structuredClone(b);scrambled.cells=scrambled.cells.map((n,i)=>b.revealed[i]?n:8);scrambled.flags.fill(true);
  expect(hint(scrambled)).toEqual(h);
 });
 it('reports no established safe move on an unopened or ambiguous field',()=>{
  expect(hint(create())).toBeNull();
  const b=create();b.status='playing';b.first=0;b.revealed[0]=true;b.cells[0]=1;
  expect(neighbors(b,0)).toHaveLength(3);expect(hint(b)).toBeNull();
 });
 it('submits only unassisted wins and orders faster wins first without a par cap',()=>{
  const b=create('expert',7);reveal(b,40);expect(competitiveScore(b,false)).toBe(0);
  b.cells.forEach((v,i)=>{if(v!==-1)reveal(b,i);});b.elapsedMs=12345;
  expect(competitiveScore(b,true)).toBe(0);expect(competitiveScore(b,false)).toBe(2147483647-12345);
  b.elapsedMs=5000000;expect(competitiveScore(b,false)).toBeLessThan(2147483647-12345);
 });
 it('keeps stats and best times separate per difficulty and excludes assistance',()=>{
  const s=emptyStats();recordStart(s,'beginner',false);recordStart(s,'beginner',false);recordStart(s,'expert',true);
  recordWin(s,'beginner',12500,false);recordWin(s,'beginner',15000,false);recordWin(s,'expert',1000,true);
  expect(s.beginner).toEqual({played:2,wins:2,bestMs:12500});expect(s.expert).toEqual({played:0,wins:0,bestMs:null});
  expect(readStats({beginner:{played:-1}})).toEqual(emptyStats());
 });
});

it('restores time retained by undoing the first practice reveal',async()=>{
 const {restore}=await import('../../../src/games/minesweeper/model');
 const ready={...create('beginner',123),elapsedMs:2300,practice:true,assisted:true};
 expect(restore(ready)?.elapsedMs).toBe(2300);
 expect(restore({...ready,practice:false})).toBeNull();
});

it('only suggests safe unrevealed cells across all difficulties despite arbitrary flags',()=>{
 for(const level of ['beginner','intermediate','expert'] as const)for(let seed=1;seed<=20;seed++){
  const b=create(level,seed);reveal(b,Math.floor(b.cells.length/2));
  b.flags=b.flags.map((_,i)=>!b.revealed[i]&&i%3===0);
  const h=hint(b);if(h){expect(b.revealed[h.index]).toBe(false);expect(b.cells[h.index]).not.toBe(-1);expect(h.explanation.length).toBeLessThan(4000);}
 }
});
