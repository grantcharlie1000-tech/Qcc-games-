import { describe, expect, it } from 'vitest';
import { hintFor } from '../../../src/games/water-sort/hint';
import type { HintInput, Hint } from '../../../src/games/water-sort/hint';
import { Session, campaignScore, readSnapshot } from '../../../src/games/water-sort/session';
import { LEVELS } from '../../../src/games/water-sort/levels';
import { cloneBoard, legalPours, won } from '../../../src/games/water-sort/rules';
import { solve } from '../../../src/games/water-sort/solver';

// Frozen control flow from main 24522e579d5c3837e54f4212e121721b7d21029f.
// solver.ts and rules.ts must remain byte-identical for this differential oracle.
function legacyHint(state: HintInput): Hint {
  if (won(state.tubes)) return {kind:'done'};
  const path = solve(state.tubes);
  if (path?.length) return {kind:'pour',from:path[0][0],to:path[0][1],remaining:path.length};
  for (let i=state.history.length-1;i>=0;i--) {
    if (solve(state.history[i])) return {kind:'undo',steps:state.history.length-i};
  }
  return {kind:'undo',steps:state.history.length};
}

describe('legacy hint contract', () => {
  it.each(LEVELS.map((_,i)=>i))('matches exact move indices and distance at level %i', level => {
    const state = new Session(level).state;
    expect(hintFor(state)).toEqual(legacyHint(state));
  });
  it.each([0,8,27,36,42,60,76])('matches seeded legal deviations and history at level %i', level => {
    const session = new Session(level);
    let seed = level+1;
    for (let step=0;step<12&&!won(session.state.tubes);step++) {
      const moves=legalPours(session.state.tubes);
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const move=moves[seed%moves.length];
      if(!move)break;
      session.begin(move.from,move.to,0);session.advance(0);
    }
    const before=structuredClone(session.state);
    expect(hintFor(session.state)).toEqual(legacyHint(session.state));
    expect(session.state).toEqual(before);
    expect(readSnapshot(session.state)).toEqual(before);
  });
  it('charges only when the async result is delivered and retains the save schema', () => {
    const session=new Session(), before=structuredClone(session.state);
    const input=session.prepareHint();
    expect(session.state).toEqual(before);
    expect(input).toEqual({tubes:before.tubes,history:before.history});
    session.chargeHint();
    expect(session.state).toEqual({...before,assists:1});
    expect(campaignScore(session.state.best)).toBe(campaignScore(before.best));
    expect(readSnapshot(JSON.parse(JSON.stringify(session.state)))).toEqual(session.state);
  });
  it('does not charge a won board and retains the synchronous API', () => {
    const session=new Session();
    for(const [from,to] of LEVELS[0].witness){session.begin(from,to,0);session.advance(0);}
    const before=structuredClone(session.state);
    expect(session.hint()).toEqual({kind:'done'});
    expect(session.state).toEqual(before);
  });
  it('keeps budget uncertainty separate from claims of impossibility', () => {
    expect(solve([[0,1],[1],[0],[]],1)).toBeNull();
    expect(solve([[0,1],[1],[0],[]])).not.toBeNull();
  });
  it('returns done for a sorted board without mutation', () => {
    const input={tubes:[[0,0,0,0],[1,1,1,1],[],[]],history:[]};
    expect(hintFor(input)).toEqual({kind:'done'});
    expect(input.tubes).toEqual(cloneBoard(input.tubes));
  });
});
