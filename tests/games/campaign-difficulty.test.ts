import { expect, test } from 'vitest';
import { LEVELS as water } from '../../src/games/water-sort/levels';
import { LEVELS as connect, emptyPaths, solve } from '../../src/games/color-connect/model';
import { generateLevel } from '../../src/games/block-fill/logic';
import { independentSolve } from './water-sort/independent-solver';

// Canonical under all tube orders and colour renamings, so palette swaps and
// rearranged tubes cannot masquerade as new puzzles.
function waterKey(board:readonly (readonly number[])[]) {
 const tubes=board.filter(t=>t.length);let best='~';
 const visit=(left:number[],order:number[])=>{
  if(!left.length){const colours=new Map<number,number>();const key=order.map(i=>tubes[i].map(c=>{if(!colours.has(c))colours.set(c,colours.size);return colours.get(c)}).join('')).join('|');if(key<best)best=key;return;}
  for(const i of left)visit(left.filter(j=>j!==i),[...order,i]);
 };
 visit(tubes.map((_,i)=>i),[]);return best;
}
test('50 genuinely distinct water boards progress from 14 to 21 optimal pours',()=>{
 const seen=new Set(water.slice(0,27).map(l=>waterKey(l.board)));
 let previous=14;
 for(const level of water.slice(27)){
  const key=waterKey(level.board);expect(seen.has(key),level.name).toBe(false);seen.add(key);
  const plan=independentSolve(level.board);expect(plan,level.name).not.toBeNull();
  expect(plan!.length,level.name).toBeGreaterThanOrEqual(previous);previous=plan!.length;
 }
 expect(previous).toBe(21);
},30000);

test('new gardens increase the number of decisions by one square each',()=>{
 for(let i=12;i<32;i++)expect(generateLevel(i).cells.length).toBe(25+i);
});

function connectionKey(size:number,pairs:number[][]) {
 // Ignore colour identity and all eight rotations/reflections of the grid.
 return Array.from({length:8},(_,transform)=>pairs.map(pair=>pair.map(c=>{
  let x=c%size,y=Math.floor(c/size);if(transform>=4)x=size-1-x;
  for(let i=0;i<transform%4;i++)[x,y]=[size-1-y,x];return y*size+x;
 }).sort((a,b)=>a-b).join(',')).sort().join('|')).sort()[0];
}
test('20 distinct larger connection boards have real full-coverage solutions',()=>{
 const seen=new Set(connect.slice(0,12).map(l=>`${l.size}:${connectionKey(l.size,l.pairs)}`));
 for(const [i,level] of connect.slice(12).entries()){
  expect(level.size).toBe(i<10?8:9);
  const key=`${level.size}:${connectionKey(level.size,level.pairs)}`;expect(seen.has(key),level.name).toBe(false);seen.add(key);
  const result=solve(level,emptyPaths(level));expect(result.kind,level.name).toBe('solved');
  if(result.kind!=='solved')continue;
  const cells=result.paths.flat();expect(new Set(cells).size).toBe(level.size**2);
  result.paths.forEach((path,color)=>{
   expect([...level.pairs[color]].sort((a,b)=>a-b)).toEqual([path[0],path.at(-1)!].sort((a,b)=>a-b));
   for(let j=1;j<path.length;j++)expect(Math.abs(path[j]%level.size-path[j-1]%level.size)+Math.abs(Math.floor(path[j]/level.size)-Math.floor(path[j-1]/level.size))).toBe(1);
  });
 }
});
