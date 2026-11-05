import {describe,it,expect} from 'vitest';
import {createGame,place,canPlace,hasMove,restoreGame,clearLines,scoreMove,total,replay,colorOf,type State} from '../../../src/games/color-blocks/model';
/** Empty board; tray dot, pair across, pair down; every piece colour 1 unless overridden. */
const fixture=(over:Partial<State>={}):State=>({...createGame(42),board:Array(64).fill(0),tray:[0,1,2],colors:[1,1,1],score:0,combo:0,setup:0,moves:0,lines:0,maxCombo:0,maxLines:0,history:[],...over});
const plainMove=(s:State)=>{const free=s.board.findIndex((v,i)=>!v&&i>=24&&i%8>1),r=place({...s,tray:[0,1,2],colors:[1,1,1]},0,free%8,Math.floor(free/8))!;expect(r.lines).toBe(0);return r;};

describe('scoring model N + 20L² + 10L(k − 1) + 40C + 200A',()=>{
 it('reproduces the three worked examples from the reference pack',()=>{
  expect(total(scoreMove(4,1,1,0,false))).toBe(24);
  expect(scoreMove(6,2,3,1,false)).toEqual({placement:6,lines:80,combo:40,colours:40,allClear:0});expect(total(scoreMove(6,2,3,1,false))).toBe(166);
  expect(scoreMove(9,3,5,2,false)).toEqual({placement:9,lines:180,combo:120,colours:80,allClear:0});expect(total(scoreMove(9,3,5,2,false))).toBe(389);
 });
 it('caps the combo term at 10 and awards only placement without a clear',()=>{
  expect(scoreMove(1,1,25,0,false).combo).toBe(90);expect(scoreMove(5,0,7,3,true)).toEqual({placement:5,lines:0,combo:0,colours:0,allClear:0});
 });
 it('awards one point per placed cell on an ordinary placement',()=>{
  const r=place(fixture({tray:[5,1,2]}),0,0,0)!;expect(r.gained).toBe(4);expect(r.state.score).toBe(4);
 });
 it('counts a crossing row and column as two lines while removing the shared tile once',()=>{
  const s=fixture({colors:[3,1,1]});for(let x=1;x<8;x++)s.board[x]=1;for(let y=1;y<8;y++)s.board[y*8]=2;s.board[63]=4;
  const r=place(s,0,0,0)!;expect(r.cleared).toEqual([0,1,2,3,4,5,6,7,8,16,24,32,40,48,56]);expect(r.cleared.filter(i=>i===0)).toHaveLength(1);
  // Colours 1, 2 and 3 disappear; colour 4 remains, so no all-clear.
  expect(r.lines).toBe(2);expect(r.colorsGone).toEqual([1,2,3]);expect(r.allClear).toBe(false);
  expect(r.breakdown).toEqual({placement:1,lines:80,combo:0,colours:120,allClear:0});expect(r.gained).toBe(201);
 });
 it('stacks colour and all-clear rewards once each without double counting',()=>{
  const s=fixture({colors:[2,1,1]});for(let x=1;x<8;x++)s.board[x]=x<4?1:3;for(let y=1;y<8;y++)s.board[y*8]=1;
  const r=place(s,0,0,0)!;expect(r.state.board.every(v=>v===0)).toBe(true);expect(r.allClear).toBe(true);
  expect(r.colorsGone).toEqual([1,2,3]);expect(r.breakdown).toEqual({placement:1,lines:80,combo:0,colours:120,allClear:200});expect(r.gained).toBe(401);
 });
 it('counts two disappearing colours and ignores a colour that survives',()=>{
  const s=fixture({colors:[5,1,1]});for(let x=1;x<8;x++)s.board[x]=x%2?6:7;s.board[20]=7;
  const r=place(s,0,0,0)!;expect(r.colorsGone).toEqual([5,6]);expect(r.breakdown.colours).toBe(80);
 });
});

describe('move-counted combo with two setup moves',()=>{
 const clearing=(s:State)=>{const t={...s,board:Array(64).fill(0),tray:[0,1,2],colors:[1,1,1]};t.board[40]=1;for(let x=1;x<8;x++)t.board[x]=1;const r=place(t,0,0,0)!;expect(r.lines).toBe(1);return r;};
 it('a clear increments the chain and restores two setup moves',()=>{
  let r=clearing(fixture());expect(r.state.combo).toBe(1);expect(r.state.setup).toBe(2);expect(r.gained).toBe(1+20);
  r=clearing(r.state);expect(r.state.combo).toBe(2);expect(r.breakdown.combo).toBe(10);
 });
 it('one and two plain placements preserve the chain; the third resets it',()=>{
  let s=clearing(fixture()).state;
  s=plainMove(s).state;expect([s.combo,s.setup]).toEqual([1,1]);
  s=plainMove(s).state;expect([s.combo,s.setup]).toEqual([1,0]);
  const kept=clearing(s);expect(kept.state.combo).toBe(2);expect(kept.breakdown.combo).toBe(10);
  s=plainMove(s).state;expect([s.combo,s.setup]).toEqual([0,0]);
  expect(clearing(s).state.combo).toBe(1);
 });
 it('pause and resume (serialise and restore) leave the chain unchanged',()=>{
  const s=plainMove(clearing(fixture()).state).state;const r=restoreGame(JSON.parse(JSON.stringify(s)))!;
  expect([r.combo,r.setup]).toEqual([1,1]);expect(r).toEqual(s);
 });
 it('records the best combo and largest clear',()=>{
  let s=clearing(fixture()).state;s=clearing(s).state;expect(s.maxCombo).toBe(2);expect(s.maxLines).toBe(1);
 });
});

describe('placement rules',()=>{
 it('rejects overlap, bounds, fractional coordinates and used pieces without mutating',()=>{
  const s=fixture();s.board[0]=1;const before=structuredClone(s);
  expect(place(s,0,0,0)).toBeNull();expect(place(s,1,7,0)).toBeNull();expect(place(s,0,0.5,1)).toBeNull();expect(place({...s,tray:[null,1,2]},0,2,2)).toBeNull();expect(s).toEqual(before);
 });
 it('keeps remaining pieces, and refills exactly three only after all are used',()=>{
  let s=fixture();s=place(s,0,0,0)!.state;expect(s.tray).toEqual([null,1,2]);expect(s.colors[0]).toBeNull();s=place(s,1,1,0)!.state;expect(s.tray).toEqual([null,null,2]);s=place(s,2,3,0)!.state;
  expect(s.tray.every(x=>x!==null)).toBe(true);expect(s.colors.every(c=>c!==null&&c>=1&&c<=7)).toBe(true);expect(s.witness).toHaveLength(3);
 });
 it('never reports loss while any remaining piece fits even when the first cannot',()=>{
  const s=fixture();s.board=Array(64).fill(1);s.board[63]=0;s.tray=[1,null,0];expect(canPlace(s.board,1,7,7)).toBe(false);expect(hasMove(s)).toBe(true);
  s.tray=[1,2,null];expect(hasMove(s)).toBe(false);
 });
 it('finds every completed row before removing any cells',()=>{const board=Array(64).fill(0);for(let i=0;i<16;i++)board[i]=1;const r=clearLines(board);expect(r.lines).toBe(2);expect(r.cleared).toHaveLength(16);expect(r.board.every(x=>x===0)).toBe(true);});
});

describe('saves and reproducibility',()=>{
 it('stores seed, generator, scoring version, mode, RNG state and move history',()=>{
  const s=createGame(77);expect(s).toMatchObject({version:2,generator:1,scoring:1,mode:'standard',seed:77,history:[]});expect(s.rng).not.toBe(77);
 });
 it('restores a defensive copy and rejects corrupt saves',()=>{
  const s=place(fixture(),0,0,0)!.state;const r=restoreGame(JSON.parse(JSON.stringify(s)))!;expect(r).toEqual(s);r.board[1]=7;expect(s.board[1]).toBe(0);
  for(const bad of [null,{}, {...s,version:3},{...s,board:[0]},{...s,tray:[99,0,1]},{...s,rng:NaN},{...s,score:-1},{...s,setup:3},{...s,colors:[null,0,1]},{...s,colors:[1,1]},{...s,history:[[3,0,0]]},{...s,witness:[[0,9,0]]},{...s,mode:'relaxed'},{...s,board:Array(64).fill(8)}])expect(restoreGame(bad)).toBeNull();
 });
 it('migrates a version-one save in place, keeping its board, tray and score',()=>{
  const v1={version:1,board:Array(64).fill(0),tray:[5,null,18],bag:[1,2],rng:99,score:120,combo:2,moves:9,lines:3};v1.board[0]=4;
  const r=restoreGame(v1)!;expect(r).toMatchObject({version:2,seed:0,board:v1.board,tray:[5,null,18],colors:[colorOf(5),null,colorOf(18)],score:120,combo:2,setup:2,moves:9,history:[]});
 });
 it('replaying the same seed and moves twice gives identical board, tray and score',()=>{
  for(let seed=1;seed<=10;seed++){
   let s=createGame(seed);
   for(let step=0;step<60&&hasMove(s);step++){
    let m:[number,number,number]|undefined;
    for(let slot=0;slot<3&&!m;slot++){const p=s.tray[slot];if(p===null)continue;for(let y=0;y<8&&!m;y++)for(let x=0;x<8&&!m;x++)if(canPlace(s.board,p,x,y))m=[slot,x,y];}
    s=place(s,...m!)!.state;
   }
   const a=replay(seed,s.history)!,b=replay(seed,s.history)!;expect(a).toEqual(s);expect(b).toEqual(a);
  }
 });
 it('rejects a replay containing an illegal move',()=>{expect(replay(5,[[0,0,0],[0,0,0]])).toBeNull();});
});
