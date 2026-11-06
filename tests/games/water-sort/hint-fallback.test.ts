import { afterEach, describe, expect, it, vi } from 'vitest';
import { hintFallback, solveFallback } from '../../../src/games/water-sort/hint-fallback';
import { HintSearch } from '../../../src/games/water-sort/hint-search';
import type { HintWorker } from '../../../src/games/water-sort/hint-search';
import { hintFor } from '../../../src/games/water-sort/hint';
import type { HintInput } from '../../../src/games/water-sort/hint';
import { solve } from '../../../src/games/water-sort/solver';
import * as rules from '../../../src/games/water-sort/rules';
import { Session } from '../../../src/games/water-sort/session';
import { LEVELS } from '../../../src/games/water-sort/levels';

function drain<T>(search: Generator<void, T, void>): T {
  for (;;) { const step = search.next(); if (step.done) return step.value; }
}
const mixed = [[0,1],[1],[0],[]];
const dead = [[0,1,0,1],[1,0,1,0]];
const sorted = [[0,0],[1,1],[]];
const input: HintInput = { tubes: mixed, history: [] };
class FakeWorker extends EventTarget implements HintWorker {
  terminated = 0;
  postMessage(_input: HintInput): void {}
  terminate(): void { this.terminated++; }
  reply(data: unknown): void { this.dispatchEvent(new MessageEvent('message', { data })); }
}
function failWorker(): never { throw Error('workers blocked'); }
function slicedClock(): void {
  vi.useFakeTimers();
  let clock = 0;
  // Each timer can advance only one generator suspension, deterministically.
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5));
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('fallback differential BFS contract (unchanged solve is the oracle)', () => {
  it.each([NaN, Infinity, -Infinity, -1, 0, 0.9, 1, 1.9, 2, 3, 4, 5, 8, 20, 100000])(
    'preserves complete path and budget behavior for maxNodes=%s', budget => {
      for (const board of [mixed, dead, sorted, [], [[],[]], [[1],[1],[]],
        [[],[1],[0,1],[0]], [[10,1],[1],[10],[]]]) {
        const before = structuredClone(board);
        expect(drain(solveFallback(board, budget))).toEqual(solve(board, budget));
        expect(board).toEqual(before);
      }
    });
  it('checks already queued winners after the cap is reached', () => {
    const board = [[0],[0],[]];
    expect(solve(board, 1)).toBeNull();
    expect(drain(solveFallback(board, 2))).toEqual([[0,1]]);
    expect(drain(solveFallback(board, 2))).toEqual(solve(board, 2));
  });
  it('compares all small two-colour tube combinations and exact original indices', () => {
    const tubes = [[],[0],[1],[0,1],[1,0],[0,0],[1,1]];
    for (const a of tubes) for (const b of tubes) for (const c of tubes) {
      const board = [a,b,c,[]];
      for (const budget of [1,2,5,25,1000]) {
        expect(drain(solveFallback(board, budget))).toEqual(solve(board, budget));
      }
    }
  });
  it.each(LEVELS.map((_, i) => i))('matches campaign hint at level %i', level => {
    const state = new Session(level).prepareHint();
    expect(drain(hintFallback(state))).toEqual(hintFor(state));
  });
  it.each([0,8,27,36,42,60,76])('matches seeded deviations and history at level %i', level => {
    const session = new Session(level);
    let seed = level + 1;
    for (let step = 0; step < 12 && !rules.won(session.state.tubes); step++) {
      const moves = rules.legalPours(session.state.tubes);
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const move = moves[seed % moves.length];
      if (!move) break;
      session.begin(move.from, move.to, 0); session.advance(0);
    }
    const before = structuredClone(session.state);
    expect(drain(hintFallback(session.prepareHint()))).toEqual(hintFor(before));
    expect(session.state).toEqual(before);
  });
  it('preserves newest-first history, truthy empty paths, exhaustion and zero history', () => {
    for (const history of [[], [mixed], [sorted], [mixed,sorted,dead], [mixed,dead], [dead,dead]]) {
      const state = { tubes: dead, history };
      expect(drain(hintFallback(state))).toEqual(hintFor(state));
    }
    expect(drain(hintFallback({tubes:dead,history:[mixed,sorted,dead]})))
      .toEqual({kind:'undo',steps:2});
    expect(drain(hintFallback({tubes:dead,history:[]}))).toEqual({kind:'undo',steps:0});
  });
  it('suspends during one node expansion rather than only between boards', () => {
    const pour = vi.spyOn(rules, 'pour');
    const search = solveFallback(mixed);
    expect(search.next().done).toBe(false); // before first dequeue
    expect(search.next().done).toBe(false); // before first candidate
    expect(pour).not.toHaveBeenCalled();
    expect(search.next().done).toBe(false); // before second candidate
    expect(pour).toHaveBeenCalledTimes(1);
    expect(drain(search)).toEqual(solve(mixed));
  });
});

describe('fallback cancellation and lifetime', () => {
  it('defers even initialization and can cancel before the first tick', async () => {
    slicedClock();
    const pour = vi.spyOn(rules, 'pour');
    const search = new HintSearch(failWorker);
    const result = search.run(input);
    expect(pour).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    search.cancel(); search.cancel();
    expect(await result).toEqual({kind:'cancelled'});
    await vi.runAllTimersAsync();
    expect(pour).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts cancellation from another task inside the current board search', async () => {
    slicedClock();
    const pour = vi.spyOn(rules, 'pour');
    const search = new HintSearch(failWorker);
    const result = search.run(input);
    let delivered = false; void result.then(() => { delivered = true; });
    for (let i = 0; i < 5; i++) await vi.advanceTimersToNextTimerAsync();
    expect(pour.mock.calls.length).toBeGreaterThan(0);
    expect(delivered).toBe(false);
    const calls = pour.mock.calls.length;
    setTimeout(() => search.cancel(), 0);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({kind:'cancelled'});
    // At most the one already queued slice may precede the cancellation task.
    expect(pour.mock.calls.length).toBeLessThanOrEqual(calls + 1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('also yields with a coarse/frozen clock', async () => {
    vi.useFakeTimers(); vi.spyOn(performance, 'now').mockReturnValue(0);
    const search = new HintSearch(failWorker);
    const result = search.run({tubes:dead,history:Array.from({length:5000},()=>dead)});
    let delivered = false; void result.then(() => { delivered = true; });
    await vi.advanceTimersToNextTimerAsync();
    expect(delivered).toBe(false);
    search.cancel();
    expect(await result).toEqual({kind:'cancelled'});
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['error','messageerror','protocol','postMessage'])('cleans up %s once and ignores late worker events', async failure => {
    slicedClock();
    const worker = new FakeWorker();
    if (failure === 'postMessage') worker.postMessage = () => { throw Error('clone'); };
    const search = new HintSearch(() => worker, 100);
    const result = search.run(input);
    if (failure === 'protocol') worker.reply(null);
    else if (failure !== 'postMessage') worker.dispatchEvent(new Event(failure,{cancelable:true}));
    expect(worker.terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(1); // fallback tick only; worker deadline removed
    worker.reply({kind:'undo',steps:0});
    worker.dispatchEvent(new Event('error',{cancelable:true}));
    await vi.runAllTimersAsync();
    expect(await result).toEqual({kind:'hint',hint:hintFor(input)});
    expect(worker.terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('supersedes suspended fallback and keeps successful worker path timer-free', async () => {
    slicedClock();
    const worker = new FakeWorker(); let attempts = 0;
    const search = new HintSearch(() => { if (++attempts === 1) return failWorker(); return worker; });
    const first = search.run(input);
    await vi.advanceTimersToNextTimerAsync();
    const second = search.run(input);
    expect(await first).toEqual({kind:'cancelled'});
    expect(vi.getTimerCount()).toBe(0);
    const hint = hintFor(input); worker.reply(hint);
    expect(await second).toEqual({kind:'hint',hint});
    expect(worker.terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['worker','protocol'])('settles generator errors with original %s reason', async reason => {
    slicedClock(); const worker = new FakeWorker();
    const search = new HintSearch(() => worker);
    const result = search.run(input);
    if (reason === 'protocol') worker.reply(null);
    else worker.dispatchEvent(new Event('error',{cancelable:true}));
    vi.spyOn(rules, 'won').mockImplementation(() => { throw Error('search failure'); });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({kind:'failed',reason});
    expect(vi.getTimerCount()).toBe(0);
  });
  it('settles timer scheduling failures without leaking an active request', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => { throw Error('timer failure'); });
    const search = new HintSearch(failWorker);
    expect(await search.run(input)).toEqual({kind:'failed',reason:'worker'});
    search.cancel();
  });
  it('settles a later scheduling failure and permits retry', async () => {
    slicedClock(); const search = new HintSearch(failWorker);
    const result = search.run(input);
    const timer = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementationOnce(() => { throw Error('reschedule'); });
    await vi.advanceTimersToNextTimerAsync();
    expect(await result).toEqual({kind:'failed',reason:'worker'});
    expect(vi.getTimerCount()).toBe(0);
    globalThis.setTimeout = timer;
    const retry = search.run(input); search.cancel();
    expect(await retry).toEqual({kind:'cancelled'});
  });
  it('cleanup exceptions cannot strand cancellation', async () => {
    const worker = new FakeWorker();
    worker.removeEventListener = () => { throw Error('remove'); };
    worker.terminate = () => { throw Error('terminate'); };
    const search = new HintSearch(() => worker);
    const result = search.run(input); search.cancel();
    expect(await result).toEqual({kind:'cancelled'});
    worker.reply({kind:'undo',steps:0});
    search.cancel();
  });
  it('preserves captured session data and charges only on accepted delivery', async () => {
    slicedClock(); const session = new Session();
    const before = structuredClone(session.state);
    const search = new HintSearch(failWorker);
    const first = search.run(session.prepareHint());
    await vi.advanceTimersToNextTimerAsync(); search.cancel();
    expect(await first).toEqual({kind:'cancelled'});
    expect(session.state).toEqual(before);
    const retry = search.run(session.prepareHint());
    await vi.runAllTimersAsync();
    const result = await retry;
    expect(result).toEqual({kind:'hint',hint:hintFor(before)});
    expect(session.state).toEqual(before);
    // Mirrors the existing UI's accepted-result boundary, not a UI integration proof.
    if (result.kind === 'hint') session.chargeHint();
    expect(session.state).toEqual({...before,assists:before.assists+1});
  });
});
