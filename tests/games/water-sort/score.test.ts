import { describe, expect, it } from 'vitest';
import { Session, readSnapshot, levelPoints, campaignScore, readBest } from '../../../src/games/water-sort/session';
import { LEVELS } from '../../../src/games/water-sort/levels';
import { legalPours, won } from '../../../src/games/water-sort/rules';
import { solve } from '../../../src/games/water-sort/solver';

const finish = (session: Session) => { for (const [from,to] of solve(session.state.tubes)!) { session.begin(from,to,0); session.advance(0); } };
describe('Water Sort campaign score', () => {
  it('pays a difficulty base plus an efficiency bonus vs the witness par, less assists', () => {
    const par = LEVELS[0].witness.length; // 3 pours, 2 colours: base 300
    expect(levelPoints(0,{pours:par,assists:0})).toBe(600);
    expect(levelPoints(0,{pours:1,assists:0})).toBe(600);
    expect(levelPoints(0,{pours:par*2,assists:0})).toBe(450);
    expect(levelPoints(0,{pours:par,assists:1})).toBe(570);
    expect(levelPoints(0,{pours:5000,assists:99})).toBe(300);
    expect(campaignScore({})).toBe(0);
    expect(campaignScore({0:{pours:3,assists:0},1:{pours:6,assists:0}})).toBe(600+levelPoints(1,{pours:6,assists:0}));
  });
  it('makes Deep levels worth more than Gentle ones and a clean campaign beat the old 1000 cap', () => {
    const clean = (i:number) => levelPoints(i,{pours:LEVELS[i].witness.length,assists:0});
    expect(clean(26)).toBeGreaterThan(clean(0));
    expect(levelPoints(26,{pours:5000,assists:99})).toBeGreaterThan(clean(0));
    expect(LEVELS.reduce((sum,_,i)=>sum+clean(i),0)).toBe(61300);
  });
  it('records a win, counts undos and hints, keeps the better clear and survives restart and level switches', () => {
    const session = new Session();
    finish(session);
    expect(won(session.state.tubes)).toBe(true);
    const clean = session.state.best[0];
    expect(clean).toEqual({pours:session.state.history.length,assists:0});
    session.restart();
    expect(session.state.best).toEqual({0:clean});
    session.hint();
    const move = legalPours(session.state.tubes)[0]; session.begin(move.from,move.to,0); session.advance(0); session.undo();
    expect(session.state.assists).toBe(2);
    finish(session);
    expect(session.state.best[0]).toEqual(clean);
    const switched = new Session(1, session.state.best);
    expect(switched.state.best).toEqual({0:clean});
    expect(switched.state.assists).toBe(0);
  });
  it('replaying with a better clear improves the stored record', () => {
    const session = new Session();
    session.state = {...session.state, best:{0:{pours:40,assists:3}}};
    finish(session);
    expect(session.state.best[0].assists).toBe(0);
  });
  it('restores old snapshots without best, drops malformed records and keeps valid ones', () => {
    const old = {version:1,level:0,tubes:LEVELS[0].board,history:[]};
    expect(readSnapshot(old)).toMatchObject({assists:0,best:{}});
    expect(readSnapshot({...old,best:'x',assists:-1})).toMatchObject({assists:0,best:{}});
    expect(readBest({0:{pours:4,assists:1},1:{pours:0,assists:0},2:{pours:3},99:{pours:3,assists:0},x:{pours:3,assists:0},3:null,4:{pours:2.5,assists:0}})).toEqual({0:{pours:4,assists:1}});
    expect(readBest([{pours:3,assists:0}])).toEqual({});
    expect(readSnapshot({...old,assists:2,best:{5:{pours:20,assists:1}}})).toMatchObject({assists:2,best:{5:{pours:20,assists:1}}});
  });
  it('a restored won snapshot from before campaign scoring is credited', () => {
    const session = new Session();
    finish(session);
    const {best:_best,assists:_assists,...legacy} = JSON.parse(JSON.stringify(session.state));
    expect(readSnapshot(legacy)!.best).toEqual({0:{pours:session.state.history.length,assists:0}});
  });
});
