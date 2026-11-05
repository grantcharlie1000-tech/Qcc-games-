import {describe,it,expect} from 'vitest';
import {createGame,deal,place,hasMove,restoreGame,analyse,ease,SHAPES,TUNING,type State} from '../../../src/games/color-blocks/model';
import {clearReference,solveHand} from './hand-oracle';
const checker=()=>Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1);
const state=(board:number[],seed=42):State=>({...createGame(seed),board,tray:[null,null,null],colors:[null,null,null],witness:[]});
/** Replay the stored witness on the deal-time board with the real placement rules. */
function replayWitness(s:State){
 let t=s;for(const [slot,x,y] of s.witness){const r=place(t,slot,x,y);expect(r,`witness ${slot},${x},${y}`).not.toBeNull();t={...r!.state,tray:r!.state.tray.map((p,i)=>i===slot?null:p)};
  // place() deals after the last piece; stop comparing the tray once it refills.
  if(r!.state.tray.every(p=>p!==null))break;}
}
describe('constructive tray generation with a stored witness',()=>{
 it('deals three pieces with seeded colours and a three-move witness, without mutating its input',()=>{
  const before=state(checker()),copy=structuredClone(before),next=deal(before);
  expect(next.tray.every(p=>p!==null)).toBe(true);expect(next.colors.every(c=>c!==null&&c>=1&&c<=7)).toBe(true);
  expect(next.witness).toHaveLength(3);expect(new Set(next.witness.map(m=>m[0])).size).toBe(3);
  expect(solveHand(next.board,next.tray)).not.toBeNull();replayWitness(next);expect(before).toEqual(copy);
  expect(next.board).toEqual(before.board);expect(next.score).toBe(before.score);
 });
 it('can rely on a line clear that unlocks a later piece',()=>{
  // Nine free cells: column 0 rows 0–2 plus a diagonal. Only clears make room for more than a few cells.
  const board=Array(64).fill(1);for(let y=0;y<3;y++)board[y*8]=0;for(let y=3;y<8;y++)board[y*8+y-2]=0;board[62]=board[63]=0;
  expect(clearReference(board)).toEqual(board);
  for(let seed=1;seed<=20;seed++){const next=deal(state(board,seed));expect(next.witness).toHaveLength(3);replayWitness(next);expect(solveHand(board,next.tray)).not.toBeNull();}
 });
 it('does not manufacture a hand for an already full board',()=>{
  const before=state(Array(64).fill(1));expect(deal(before)).toEqual(before);
 });
 it('preserves a restored or partly used trapped tray instead of rerolling it',()=>{
  const before={...state(checker()),tray:[18,16,null],colors:[1,2,null]};expect(hasMove(before)).toBe(false);
  expect(restoreGame(before)).toEqual(before);expect(deal(before)).toEqual(before);
 });
 it('still allows a poor placement to strand the remaining pieces',()=>{
  const board=checker();board[0]=board[63]=0;let s:State={...state(board),tray:[0,1,2],colors:[1,1,1]};
  s=place(s,0,0,0)!.state;expect(hasMove(s)).toBe(true);
  s=place(s,1,6,7)!.state;expect(hasMove(s)).toBe(false);expect(s.tray).toEqual([null,null,2]);
 });
 it('replays every stored witness across reproducible sparse and dense boards',()=>{
  const seen=new Set<string>();let full=0;
  for(let seed=1;seed<=96;seed++)for(const density of [48,128,208,244]){
   let rng=seed;const board=clearReference(Array.from({length:64},()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return (rng>>>24)<density?1:0;}));
   if(board.every(Boolean))continue;
   const before=state(board,seed),a=deal(before),b=deal(structuredClone(before));
   expect(a).toEqual(b);expect(a.tray.every(p=>p!==null)).toBe(true);expect(restoreGame(a)).toEqual(a);seen.add(a.tray.join(','));
   if(a.witness.length===3){full++;replayWitness(a);expect(solveHand(board,a.tray)).not.toBeNull();}
   else expect(solveHand(board,a.tray),'a partial witness is only used when the oracle also finds no full tray path').toBeNull();
  }
  expect(full).toBeGreaterThan(300);expect(seen.size).toBeGreaterThan(30);
 });
 it('replays every tray witness from its deal-time board through thirty complete hands per seed',()=>{
  const seen=new Set<number>();
  for(let seed=1;seed<=10;seed++){
   let s=createGame(seed);
   for(let hand=0;hand<30;hand++){
    expect(s.witness).toHaveLength(3);s.tray.forEach(p=>seen.add(p!));
    for(const [slot,x,y] of s.witness){
     const restored=restoreGame(JSON.parse(JSON.stringify(s)))!;const next=place(s,slot,x,y)!;expect(next).not.toBeNull();
     expect(place(restored,slot,x,y)).toEqual(next);s=next.state;
    }
   }
  }
  expect(seen.size).toBe(SHAPES.length);
 });
 it('applies a mild repeat penalty without forbidding repeats',()=>{
  const counts:number[]=[];let repeats=0,trays=0;
  for(let seed=1;seed<=40;seed++){let s=createGame(seed);for(let hand=0;hand<10;hand++){const prev=new Set(s.recent.slice(0,-3));s.tray.forEach(p=>{counts[p!]=(counts[p!]??0)+1;if(prev.has(p!))repeats++;});trays++;for(const [slot,x,y] of s.witness)s=place(s,slot,x,y)!.state;}}
  expect(repeats).toBeGreaterThan(0);expect(repeats/(trays*3)).toBeLessThan(.5);expect(counts.filter(Boolean)).toHaveLength(SHAPES.length);
 });
});
describe('board signals',()=>{
 it('measures mobility, fragmentation, large-piece room and openings',()=>{
  const empty=analyse(Array(64).fill(0));expect(empty).toMatchObject({shapesFitting:SHAPES.length,fragmented:0,empty:64,openings:0});expect(ease(empty)).toBeCloseTo(1);
  const c=analyse(checker());expect(c.shapesFitting).toBe(1);expect(c.fragmented).toBe(32);expect(c.bigFits).toBe(0);expect(c.openings).toBe(0);
  const near=Array(64).fill(0);for(let x=0;x<6;x++)near[x]=1;expect(analyse(near).openings).toBe(1);
 });
 it('keeps generation within a bounded, fixed budget',()=>{
  const start=performance.now();let s=createGame(9);for(let hand=0;hand<40&&s.witness.length===3;hand++)for(const [slot,x,y] of s.witness)s=place(s,slot,x,y)!.state;
  expect(TUNING.attempts+TUNING.widenedAttempts).toBe(120);expect(performance.now()-start).toBeLessThan(4000);
 });
});
