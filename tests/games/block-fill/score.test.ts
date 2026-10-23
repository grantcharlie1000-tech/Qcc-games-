import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, generateLevel, initialState, restoreState, levelPoints, campaignScore, recordWin, readBest } from '../../../src/games/block-fill/logic';

describe('Block Fill campaign score', () => {
  it('pays 100 per square plus a bonus vs one step per square, less hints', () => {
    // Garden 1: 9 squares, base 900, par 8.
    expect(levelPoints(0,{steps:8,hints:0})).toBe(1800);
    expect(levelPoints(0,{steps:16,hints:0})).toBe(1350);
    expect(levelPoints(0,{steps:8,hints:3})).toBe(1530);
    expect(levelPoints(0,{steps:999,hints:99})).toBe(900);
    expect(campaignScore({})).toBe(0);
  });
  it('makes larger gardens worth more and a clean campaign beat the old 12000 cap', () => {
    const clean=(i:number)=>levelPoints(i,{steps:generateLevel(i).cells.length-1,hints:0});
    expect(levelPoints(11,{steps:999,hints:99})).toBeGreaterThan(clean(0));
    for(let i=1;i<LEVEL_COUNT;i++)expect(clean(i)).toBeGreaterThan(clean(i-1));
    expect(Array.from({length:12},(_,i)=>clean(i)).reduce((a,b)=>a+b,0)).toBe(59600);
    expect(Array.from({length:LEVEL_COUNT},(_,i)=>clean(i)).reduce((a,b)=>a+b,0)).toBe(245600);
  });
  it('records a solve, keeps only an improved clear and survives Restart', () => {
    const l=generateLevel(0);
    let s=recordWin({...initialState(),path:l.solution,rewarded:true,steps:12,hints:1});
    expect(s.best).toEqual({0:{steps:12,hints:1}});
    s=recordWin({...s,steps:20,hints:2});expect(s.best[0]).toEqual({steps:12,hints:1});
    s=recordWin({...s,steps:8,hints:0});expect(s.best[0]).toEqual({steps:8,hints:0});
    expect(recordWin(initialState()).best).toEqual({});
    expect(initialState(s.best)).toMatchObject({level:0,steps:0,hints:0,best:{0:{steps:8,hints:0}}});
  });
  it('restores old snapshots without best and ignores malformed records', () => {
    const start=generateLevel(0).start;
    expect(restoreState({version:1,level:0,path:[start],rewarded:false})).toEqual({version:1,level:0,path:[start],rewarded:false,steps:0,hints:0,best:{}});
    expect(restoreState({version:1,level:0,path:[start],rewarded:true,steps:-3,hints:'x',best:'x'})).toMatchObject({steps:0,hints:0,best:{}});
    expect(readBest({0:{steps:8,hints:0},1:{steps:2,hints:0},2:{steps:15},32:{steps:40,hints:0},x:{steps:8,hints:0},3:null})).toEqual({0:{steps:8,hints:0}});
    const s=restoreState({version:1,level:1,path:[generateLevel(1).start],rewarded:false,steps:4,hints:1,best:{0:{steps:8,hints:0},11:{steps:50,hints:2}}})!;
    expect(campaignScore(s.best)).toBe(1800+levelPoints(11,{steps:50,hints:2}));
    expect(restoreState({...s,extra:1})).toBeNull();
  });
});
