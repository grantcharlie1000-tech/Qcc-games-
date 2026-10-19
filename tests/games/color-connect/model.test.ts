import { describe, expect, it } from 'vitest';
import { LEVELS, generate, emptyPaths, extend, begin, validatePaths, isWon, solve, hint, traverse, restoreSnapshot } from '../../../src/games/color-connect/model';
import type { Level, Paths } from '../../../src/games/color-connect/model';
const fixture: Level = { size: 4, name: 'Fixture', pairs: [[0, 3], [4, 7], [8, 11], [12, 15]] };
const complete: Paths = [[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]];
describe('Color Connect rules', () => {
 it('accepts only orthogonal empty cells or the matching goal', () => {
  let paths = begin(fixture, emptyPaths(fixture), 0).paths;
  expect(extend(fixture, paths, 0, 5)).toEqual(paths);
  expect(extend(fixture, paths, 0, 4)).toEqual(paths);
  paths = extend(fixture, paths, 0, 1);
  expect(paths[0]).toEqual([0,1]);
  expect(extend(fixture, paths, 0, 0)[0]).toEqual([0]);
 });
 it('rejects crossing, shared cells, endpoint misuse and nonlocal steps', () => {
  expect(validatePaths(fixture, [[0,1,5], [4,5],[],[]])).toBe(false);
  expect(validatePaths(fixture, [[0,4],[],[],[]])).toBe(false);
  expect(validatePaths(fixture, [[0,2],[],[],[]])).toBe(false);
  expect(validatePaths(fixture, [[1,2],[],[],[]])).toBe(false);
  expect(validatePaths(fixture, complete)).toBe(true);
 });
 it('requires every pair and every cell, never a partial connection', () => {
  expect(isWon(fixture, complete)).toBe(true);
  expect(isWon(fixture, [complete[0],complete[1],[],[]])).toBe(false);
  const spare: Level = {size:3,name:'Spare',pairs:[[0,2],[6,8]]};
  expect(isWon(spare,[[0,1,2],[6,7,8]])).toBe(false);
 });
 it('redraws endpoints and trims from an existing trail without changing other colours', () => {
  expect(begin(fixture,complete,1).paths).toEqual([[0,1],complete[1],complete[2],complete[3]]);
  expect(begin(fixture,complete,3).paths[0]).toEqual([3]);
 });
 it('constructs seeded full-coverage witnesses and independently solves every shipped board', () => {
  expect(generate(4,17,3).level.pairs).toEqual([[9,15],[14,12],[8,7]]);
  for(const size of [4,5,6,7]) for(const seed of [1,17,42,126]) {
   const generated=generate(size,seed,size-1);
   expect(isWon(generated.level,generated.witness)).toBe(true);
   expect(new Set(generated.witness.flat()).size).toBe(size*size);
  }
  for(const level of LEVELS) {
   const solution=solve(level,emptyPaths(level),1000000);
   expect(solution.kind,`${level.name}: ${solution.nodes} nodes`).toBe('solved');
   if(solution.kind==='solved') expect(isWon(level,solution.paths)).toBe(true);
  }
 },30000);
 it('an untouched-colour hint reveals a new edge instead of only selecting a visible endpoint',()=>{
  const result=hint(fixture,emptyPaths(fixture));
  expect(result.kind).toBe('step');
  if(result.kind==='step')expect(result.paths.flat().length).toBe(2);
 });
 it('hints preserve an alternative legal route instead of following an initial witness', () => {
  const paths:Paths=[[3,2],[],[],[]];
  const result=hint(fixture,paths);
  expect(result.kind).toBe('step');
  if(result.kind==='step') {
   expect(result.paths[0].slice(0,2)).toEqual([3,2]);
   expect(validatePaths(fixture,result.paths)).toBe(true);
   expect(result.paths.flat().length).toBe(paths.flat().length+1);
  }
 });
 it('proves a necessary backtrack and distinguishes search budget exhaustion', () => {
  const bad:Paths=[[0,1,5,6,2,3],[],[],[]];
  expect(validatePaths(fixture,bad)).toBe(true);
  expect(solve(fixture,bad).kind).toBe('impossible');
  expect(hint(fixture,bad).kind).toBe('backtrack');
  expect(solve(fixture,emptyPaths(fixture),0).kind).toBe('limit');
 });
 it('interpolates fast traversal through all crossed cells without diagonal jumps', () => {
  expect(traverse({x:.5,y:.5},{x:3.5,y:.5},4)).toEqual([0,1,2,3]);
  expect(traverse({x:.5,y:.5},{x:.5,y:3.5},4)).toEqual([0,4,8,12]);
  const diagonal=traverse({x:.5,y:.5},{x:3.5,y:3.5},4);
  expect(diagonal[0]).toBe(0); expect(diagonal.at(-1)).toBe(15);
  expect(new Set(diagonal).size).toBe(diagonal.length);
  for(let i=1;i<diagonal.length;i++) expect(Math.abs(diagonal[i]%4-diagonal[i-1]%4)+Math.abs(Math.floor(diagonal[i]/4)-Math.floor(diagonal[i-1]/4))).toBe(1);
 });
 it('validates snapshot paths, score provenance, levels and undo history', () => {
  const saved={version:1,level:0,paths:emptyPaths(LEVELS[0]),completed:[],moves:0,history:[]};
  expect(restoreSnapshot(saved)).toEqual(saved);
  for(const corrupt of [null,{}, {...saved,level:99},{...saved,paths:[[999]]},{...saved,completed:[99]},{...saved,moves:-1},{...saved,history:[[[999]]]}]) expect(restoreSnapshot(corrupt)).toBeNull();
 });
});

// This tiny reference enumerator chooses complete simple paths one colour at a time.
// It shares no pruning or traversal helpers with the production cell-by-cell CSP.
function brute(level:Level):boolean {
 const occupied=new Set(level.pairs.flat());
 function pair(color:number):boolean {
  if(color===level.pairs.length)return occupied.size===level.size*level.size;
  const [start,goal]=level.pairs[color];
  function walk(cell:number):boolean {
   if(cell===goal)return pair(color+1);
   for(let next=0;next<level.size*level.size;next++) {
    if(Math.abs(next%level.size-cell%level.size)+Math.abs(Math.floor(next/level.size)-Math.floor(cell/level.size))!==1)continue;
    if(next===goal){if(walk(next))return true}
    else if(!occupied.has(next)){occupied.add(next);if(walk(next))return true;occupied.delete(next)}
   }
   return false;
  }
  return walk(start);
 }
 return pair(0);
}
it('CSP agrees with an independent exhaustive path enumerator on every 3×3 two-pair endpoint board',()=>{
 for(let a=0;a<9;a++)for(let b=a+1;b<9;b++)for(let c=a+1;c<9;c++)for(let d=c+1;d<9;d++){
  if(new Set([a,b,c,d]).size!==4)continue;
  const level:Level={size:3,name:'Oracle',pairs:[[a,b],[c,d]]};
  expect(solve(level,emptyPaths(level)).kind==='solved',JSON.stringify(level.pairs)).toBe(brute(level));
 }
});
