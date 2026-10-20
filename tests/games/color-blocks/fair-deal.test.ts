import {describe,it,expect} from 'vitest';
import {createGame,deal,place,hasMove,restoreGame,SHAPES,type State} from '../../../src/games/color-blocks/model';
import {clearReference,solveHand} from './hand-oracle';
const checker=()=>Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1);
const state=(board:number[],bag:number[],seed=42):State=>({...createGame(seed),board,tray:[null,null,null],bag});
describe('fair three-piece deals',()=>{
 it('offers a complete hand, rather than only one fitting piece, without mutating its input',()=>{
  const before=state(checker(),[18,16,17,0]),copy=structuredClone(before),next=deal(before);
  expect(next.tray).toHaveLength(3);expect(next.tray.every(p=>p!==null)).toBe(true);
  expect(solveHand(next.board,next.tray)).not.toBeNull();expect(before).toEqual(copy);
  expect(next.board).toEqual(before.board);expect(next.score).toBe(before.score);expect(next.moves).toBe(before.moves);
 });
 it('accounts for a line clear that unlocks a piece that cannot fit initially',()=>{
  const board=Array(64).fill(1);for(let y=0;y<3;y++)board[y*8]=0;
  for(let y=3;y<8;y++)board[y*8+y-2]=0;board[62]=board[63]=0;
  expect(clearReference(board)).toEqual(board);expect(solveHand(board,[18,null,null])).toBeNull();
  const next=deal(state(board,[4,18,5])),witness=solveHand(board,next.tray);
  expect(next.tray).toContain(18);expect(witness).not.toBeNull();expect(witness![0].slot).toBe(0);
  expect(place({...next,tray:[4,18,5]},0,0,0)!.lines).toBe(4); // Three rows and column zero.
 });
 it('uses a validated dot fallback when all deferred bag shapes are blocked',()=>{
  const before=state(checker(),[18,16,17]),next=deal(before);
  expect(next.tray).toEqual([0,0,0]);expect(next.bag).toEqual(before.bag);expect(solveHand(next.board,next.tray)).toHaveLength(3);
 });
 it('does not manufacture an impossible hand for an already full board',()=>{
  const before=state(Array(64).fill(1),[18,16,17]);expect(deal(before)).toEqual(before);
 });
 it('preserves a restored or partly used trapped tray instead of rerolling it',()=>{
  const before={...state(checker(),[0]),tray:[18,16,null]};expect(hasMove(before)).toBe(false);
  expect(restoreGame(before)).toEqual(before);expect(deal(before)).toEqual(before);
 });
 it('still allows a poor placement to strand the remaining pieces',()=>{
  const board=checker();board[0]=board[63]=0;let s:State={...state(board,[18]),tray:[0,1,2]};
  expect(solveHand(board,s.tray)).toHaveLength(3);
  s=place(s,0,0,0)!.state;expect(solveHand(s.board,s.tray)).toBeNull();expect(hasMove(s)).toBe(true);
  s=place(s,1,6,7)!.state;expect(hasMove(s)).toBe(false);expect(s.tray).toEqual([null,null,2]);
 });
 it('has a complete independently verified hand across reproducible sparse and dense boards',()=>{
  const seen=new Set<string>();
  for(let seed=1;seed<=96;seed++)for(const density of [48,128,208,244]){
   let rng=seed;const board=clearReference(Array.from({length:64},()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return (rng>>>24)<density?1:0;}));
   const before=state(board,[...createGame(seed).bag],seed),a=deal(before),b=deal(structuredClone(before));
   expect(a).toEqual(b);expect(a.tray.every(p=>p!==null)).toBe(true);expect(solveHand(board,a.tray)).toHaveLength(3);
   expect(restoreGame(a)).toEqual(a);seen.add(a.tray.join(','));
  }
  expect(seen.size).toBeGreaterThan(30);
 });
 it('retains reproducible saves through thirty complete chosen hands per seed',()=>{
  const seen=new Set<number>();
  for(let seed=1;seed<=10;seed++){
   let s=createGame(seed);
   for(let hand=0;hand<30;hand++){
    const witness=solveHand(s.board,s.tray);expect(witness).toHaveLength(3);s.tray.forEach(p=>seen.add(p!));
    for(const move of witness!){
     const restored=restoreGame(JSON.parse(JSON.stringify(s)))!;const next=place(s,move.slot,move.x,move.y)!;
     expect(place(restored,move.slot,move.x,move.y)).toEqual(next);s=next.state;
    }
   }
  }
  expect(seen.size).toBe(SHAPES.length);
 });
});
