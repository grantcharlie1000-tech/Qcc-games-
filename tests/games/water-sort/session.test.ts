import { describe, expect, it } from 'vitest';
import { Session, readSnapshot, hintFor } from '../../../src/games/water-sort/session';
import { LEVELS } from '../../../src/games/water-sort/levels';
import { boardKey, legalPours, pour, won } from '../../../src/games/water-sort/rules';
import { solve } from '../../../src/games/water-sort/solver';

describe('Water Sort finite-state lifecycle', () => {
  it('commits a pour only after animation and freezes pending time while paused', () => {
    const session = new Session();
    const start = boardKey(session.state.tubes);
    const move = legalPours(session.state.tubes).find(m => !session.state.tubes[m.to].length)!;
    expect(session.begin(move.from, move.to, 260)).toBe(true);
    expect(session.begin(move.from, move.to)).toBe(false);
    session.advance(100);
    expect(boardKey(session.state.tubes)).toBe(start);
    session.paused = true;
    session.advance(10000);
    expect(boardKey(session.state.tubes)).toBe(start);
    expect(session.pending?.elapsed).toBe(100);
    session.paused = false;
    session.advance(160);
    expect(session.state.tubes).toEqual(move.board);
    expect(session.state.history).toHaveLength(1);
    session.advance(10000);
    expect(session.state.history).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(boardKey(session.state.tubes)).toBe(start);
  });
  it('restart cancels a pending pour and resets while retaining pause', () => {
    const session = new Session(3);
    const move = legalPours(session.state.tubes)[0];
    session.begin(move.from, move.to);
    session.paused = true;
    session.restart();
    expect(session.pending).toBeNull();
    expect(session.state.history).toHaveLength(0);
    expect(session.state.level).toBe(3);
    expect(session.paused).toBe(true);
    expect(session.begin(move.from, move.to)).toBe(false);
  });
  it('round-trips actual legal history and restores undo without sharing arrays', () => {
    const session = new Session(6);
    const move = legalPours(session.state.tubes)[0];
    session.begin(move.from, move.to, 0); session.advance(0);
    const saved = JSON.parse(JSON.stringify(session.state));
    const restored = readSnapshot(saved)!;
    expect(restored).toEqual(session.state);
    saved.tubes[0].push(99);
    expect(restored.tubes.flat()).not.toContain(99);
    const other = new Session(); other.state = restored;
    other.undo();
    expect(other.state.tubes).toEqual(LEVELS[6].board);
  });
  it.each([null, {}, {version:2}, {version:1,level:99,tubes:[],history:[]},
    {version:1,level:0,tubes:[[0,0,0,0,0],[],[],[]],history:[]},
    {version:1,level:0,tubes:[[0,0,0,0],[1,1,1,1],[],[]],history:[]},
    {version:1,level:0,tubes:LEVELS[0].board,history:[[[7],[],[],[]]]},
  ])('ignores corrupt, impossible or unearned snapshots %#', data => {
    expect(readSnapshot(data)).toBeNull();
  });
  it('rejects forged transitions even when all colour volumes are conserved', () => {
    expect(readSnapshot({version:1,level:0,tubes:[[0,0,0,0],[1,1,1,1],[],[]],history:[LEVELS[0].board]})).toBeNull();
  });
  it('rejects a forged move after a completed level', () => {
    const session = new Session();
    for (const [from,to] of solve(session.state.tubes)!) { session.begin(from,to,0); session.advance(0); }
    expect(won(session.state.tubes)).toBe(true);
    const extra = legalPours(session.state.tubes)[0];
    expect(readSnapshot({...session.state,history:[...session.state.history,session.state.tubes],tubes:extra.board})).toBeNull();
  });
  it.each(Array.from({length:LEVELS.length},(_,i)=>i))('offers a valid solution or finite recovery from reachable level %i states', level => {
    const session = new Session(level);
    let seed = level + 1;
    for (let step = 0; step < 20; step++) {
      const hint = hintFor(session.state);
      if (won(session.state.tubes)) { expect(hint.kind).toBe('done'); break; }
      if (hint.kind === 'pour') {
        expect(pour(session.state.tubes, hint.from, hint.to)).not.toBeNull();
        expect(hint.remaining).toBeGreaterThan(0);
      } else {
        expect(hint.kind).toBe('undo');
        if (hint.kind === 'undo') expect(hint.steps).toBeGreaterThan(0);
      }
      const moves = legalPours(session.state.tubes);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const move = moves[seed % moves.length];
      if (!move) break;
      session.begin(move.from, move.to, 0); session.advance(0);
      expect(readSnapshot(session.state)).toEqual(session.state);
    }
  });
});
it('keeps the original ninth level compatible with its previously saved board',()=>{
 const tubes=[[0,1,3,4],[1,0,0,2],[2,4,2,0],[3,3,1,1],[4,2,4,3],[],[]];
 expect(readSnapshot({version:1,level:8,tubes,history:[]})).toEqual({version:1,level:8,tubes,history:[]});
});
