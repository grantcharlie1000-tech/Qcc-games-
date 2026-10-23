import { describe, expect, it } from 'vitest';
import { LEVELS, emptyPaths, restoreSnapshot, levelPoints, campaignScore, recordWin, readBest } from '../../../src/games/color-connect/model';
import type { Snapshot } from '../../../src/games/color-connect/model';

// Hand-checked full first-board solution.
const solution = [[9,5,6,10,11,15],[14,13,12],[8,4,0,1,2,3,7]];
const fresh = (): Snapshot => ({version:1,level:0,paths:emptyPaths(LEVELS[0]),completed:[],moves:0,history:[],assists:0,best:{}});
describe('Color Connect campaign score', () => {
  it('pays an area/pairs base plus a bonus vs one gesture per pair, less assists', () => {
    // 4×4 with 3 pairs: base 1100, par 3.
    expect(levelPoints(0,{moves:3,assists:0})).toBe(2200);
    expect(levelPoints(0,{moves:6,assists:0})).toBe(1650);
    expect(levelPoints(0,{moves:3,assists:2})).toBe(1980);
    expect(levelPoints(0,{moves:1000,assists:50})).toBe(1100);
    expect(campaignScore({})).toBe(0);
  });
  it('makes 7×7 puzzles worth more than 4×4 ones and a clean campaign beat the old 1200 cap', () => {
    const clean = (i:number) => levelPoints(i,{moves:LEVELS[i].pairs.length,assists:0});
    expect(levelPoints(11,{moves:1000,assists:50})).toBeGreaterThan(clean(0));
    expect(LEVELS.slice(0,12).reduce((sum,_,i)=>sum+clean(i),0)).toBe(49400);
    expect(LEVELS.reduce((sum,_,i)=>sum+clean(i),0)).toBe(222400);
  });
  it('records a win once and keeps only an improved clear', () => {
    const state = {...fresh(),paths:solution,moves:5,assists:1};
    recordWin(state);
    expect(state.completed).toEqual([0]);
    expect(state.best).toEqual({0:{moves:5,assists:1}});
    recordWin({...state,moves:9});
    recordWin(Object.assign(state,{moves:9,assists:4}));
    expect(state.best[0]).toEqual({moves:5,assists:1});
    recordWin(Object.assign(state,{moves:3,assists:0}));
    expect(state.best[0]).toEqual({moves:3,assists:0});
    expect(state.completed).toEqual([0]);
    expect(recordWin(fresh()).best).toEqual({});
  });
  it('restores old snapshots without best, credits a saved win and drops malformed records', () => {
    const old = {version:1,level:0,paths:solution,completed:[0],moves:3,history:[]};
    expect(restoreSnapshot(old)).toMatchObject({assists:0,best:{0:{moves:3,assists:0}}});
    expect(restoreSnapshot({...old,paths:emptyPaths(LEVELS[0]),best:[1],assists:'x'})).toMatchObject({assists:0,best:{}});
    expect(readBest({1:{moves:4,assists:0},2:{moves:0,assists:0},3:{moves:4},32:{moves:4,assists:0},'-1':{moves:4,assists:0},4:{moves:4,assists:-1}})).toEqual({1:{moves:4,assists:0}});
    const kept = restoreSnapshot({...old,level:1,paths:emptyPaths(LEVELS[1]),best:{0:{moves:3,assists:0},11:{moves:9,assists:2}}})!;
    expect(campaignScore(kept.best)).toBe(2200+levelPoints(11,{moves:9,assists:2}));
  });
});
