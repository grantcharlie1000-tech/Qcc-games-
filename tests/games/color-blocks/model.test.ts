import {describe,it,expect} from 'vitest';
import {createGame,place,canPlace,hasMove,restoreGame,SHAPES,deal,clearLines,type State} from '../../../src/games/color-blocks/model';
const fixture=():State=>({...createGame(42),board:Array(64).fill(0),tray:[0,1,2],score:0,combo:0,moves:0,lines:0});
describe('Color Blocks integer rules',()=>{
 it('reconciles a crossing row and column simultaneously and counts their intersection once',()=>{
  const s=fixture();for(let x=1;x<8;x++)s.board[x]=1;for(let y=1;y<8;y++)s.board[y*8]=2;
  const r=place(s,0,0,0)!;expect(r.cleared).toEqual([0,1,2,3,4,5,6,7,8,16,24,32,40,48,56]);
  expect(r.state.board).toEqual(Array(64).fill(0));expect(r.state.score).toBe(41);expect(r.state.lines).toBe(2);expect(r.state.combo).toBe(1);
 });
 it('rewards consecutive line clears and resets the chain on a plain placement',()=>{
  const s=fixture();s.combo=2;s.moves=2;for(let x=1;x<8;x++)s.board[x]=1;
  const r=place(s,0,0,0)!;expect(r.state.score).toBe(61);expect(r.state.combo).toBe(3);
  const plain=place({...r.state,tray:[0,1,2]},0,4,4)!;expect(plain.state.combo).toBe(0);
 });
 it('rejects overlap, bounds, fractional coordinates and used pieces without mutating',()=>{
  const s=fixture();s.board[0]=1;const before=structuredClone(s);
  expect(place(s,0,0,0)).toBeNull();expect(place(s,1,7,0)).toBeNull();expect(place(s,0,0.5,1)).toBeNull();expect(place({...s,tray:[null,1,2]},0,2,2)).toBeNull();expect(s).toEqual(before);
 });
 it('keeps remaining pieces, and refills exactly three only after all are used',()=>{
  let s=fixture();s=place(s,0,0,0)!.state;expect(s.tray).toEqual([null,1,2]);s=place(s,1,1,0)!.state;expect(s.tray).toEqual([null,null,2]);s=place(s,2,3,0)!.state;expect(s.tray.every(x=>x!==null)).toBe(true);expect(s.tray).toHaveLength(3);
 });
 it('never reports loss while any remaining piece fits even when the first cannot',()=>{
  const s=fixture();s.board=Array(64).fill(1);s.board[63]=0;s.tray=[1,null,0];expect(canPlace(s.board,1,7,7)).toBe(false);expect(hasMove(s)).toBe(true);
  s.tray=[1,2,null];expect(hasMove(s)).toBe(false);
 });
 it('deals a seeded shuffle bag without duplicate shapes until every shape appears',()=>{
  const a=createGame(123), b=createGame(123);expect(a).toEqual(b);
  const seen=[...a.tray];let s=a;while(seen.length<SHAPES.length){s=deal({...s,tray:[null,null,null]});seen.push(...s.tray);}
  expect(new Set(seen.slice(0,SHAPES.length)).size).toBe(SHAPES.length);
 });
 it('rescues an entirely unplayable deal when a piece in the bag can fit',()=>{
  const s=fixture();s.board=Array(64).fill(1);s.board[63]=0;s.bag=[1,2,3,0];s.tray=[null,null,null];const next=deal(s);expect(hasMove(next)).toBe(true);expect(next.tray).toContain(0);
 });
 it('restores a defensive copy including the future random sequence and rejects corrupt saves',()=>{
  const s=place(fixture(),0,0,0)!.state;const r=restoreGame(JSON.parse(JSON.stringify(s)))!;expect(r).toEqual(s);r.board[1]=7;expect(s.board[1]).toBe(0);
  for(const bad of [null,{}, {...s,version:2},{...s,board:[0]},{...s,tray:[99,0,1]},{...s,rng:NaN},{...s,score:-1},{...s,bag:[1,1]},{...s,board:Array(64).fill(8)}])expect(restoreGame(bad)).toBeNull();
 });
 it('finds every completed row before removing any cells',()=>{const board=Array(64).fill(0);for(let i=0;i<16;i++)board[i]=1;const r=clearLines(board);expect(r.lines).toBe(2);expect(r.cleared).toHaveLength(16);expect(r.board.every(x=>x===0)).toBe(true);});
});

describe('long seeded runs',()=>{
 it('keeps valid saves and deterministic future deals across many tray boundaries',()=>{
  for(let seed=1;seed<=20;seed++){
   let s=createGame(seed);
   for(let step=0;step<80&&hasMove(s);step++){
    let move:[number,number,number]|undefined;
    for(let slot=0;slot<3&&!move;slot++){const p=s.tray[slot];if(p===null)continue;for(let y=0;y<8&&!move;y++)for(let x=0;x<8&&!move;x++)if(canPlace(s.board,p,x,y))move=[slot,x,y];}
    expect(move).toBeDefined();const restored=restoreGame(JSON.parse(JSON.stringify(s)));expect(restored).not.toBeNull();
    const next=place(s,...move!)!;expect(place(restored!,...move!)!.state).toEqual(next.state);expect(next.state.score).toBeGreaterThan(s.score);expect(clearLines(next.state.board).lines).toBe(0);expect(next.state.board.every(v=>Number.isInteger(v)&&v>=0&&v<=7)).toBe(true);s=next.state;
   }
  }
 });
});
