import { afterEach, describe, expect, it, vi } from 'vitest';
import { HintSearch } from '../../../src/games/water-sort/hint-search';
import type { HintWorker } from '../../../src/games/water-sort/hint-search';
import type { HintInput } from '../../../src/games/water-sort/hint';
import { hintFor } from '../../../src/games/water-sort/hint';

class FakeWorker extends EventTarget implements HintWorker {
  terminated = false;
  input: HintInput | null = null;
  postMessage(input: HintInput): void { this.input = structuredClone(input); }
  terminate(): void { this.terminated = true; }
  reply(data: unknown): void { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const input: HintInput = { tubes: [[0,1],[1],[0],[]], history: [] };
afterEach(() => vi.useRealTimers());

describe('hint request outcomes', () => {
  it('returns an applicable pour without changing the captured board', async () => {
    const worker = new FakeWorker(), search = new HintSearch(() => worker);
    const original = structuredClone(input);
    const result = search.run(input);
    worker.reply({ kind: 'pour', from: 0, to: 1, remaining: 2 });
    expect(await result).toEqual({ kind: 'hint', hint: { kind: 'pour', from: 0, to: 1, remaining: 2 } });
    expect(input).toEqual(original);
    expect(worker.terminated).toBe(true);
  });
  it('settles cancellation and ignores a late reply while another request is active', async () => {
    const a = new FakeWorker(), b = new FakeWorker();
    const workers = [a,b];
    const search = new HintSearch(() => workers.shift()!);
    const first = search.run(input);
    const second = search.run(input);
    expect(await first).toEqual({ kind: 'cancelled' });
    a.reply({ kind: 'pour', from: 0, to: 1, remaining: 9 });
    b.reply({ kind: 'pour', from: 0, to: 1, remaining: 2 });
    expect(await second).toEqual({ kind: 'hint', hint: { kind: 'pour', from: 0, to: 1, remaining: 2 } });
    expect(a.terminated && b.terminated).toBe(true);
  });
  it('can cancel twice and then retry', async () => {
    const a = new FakeWorker(), b = new FakeWorker();
    const workers = [a,b], search = new HintSearch(() => workers.shift()!);
    const first = search.run(input);
    search.cancel(); search.cancel();
    expect(await first).toEqual({ kind: 'cancelled' });
    const retry = search.run(input);
    b.reply({ kind: 'undo', steps: 0 });
    expect(await retry).toEqual({ kind: 'hint', hint: { kind: 'undo', steps: 0 } });
  });
  it.each(['error', 'messageerror'])('falls back to the original solver on %s', async type => {
    const worker = new FakeWorker(), search = new HintSearch(() => worker);
    const result = search.run(input);
    worker.dispatchEvent(new Event(type, { cancelable: true }));
    expect(await result).toEqual({ kind: 'hint', hint: hintFor(input) });
    expect(worker.terminated).toBe(true);
  });
  it('falls back on constructor and structured-clone failures', async () => {
    expect(await new HintSearch(() => { throw Error('blocked'); }).run(input))
      .toEqual({ kind: 'hint', hint: hintFor(input) });
    const worker = new FakeWorker();
    worker.postMessage = () => { throw Error('clone failed'); };
    expect(await new HintSearch(() => worker).run(input))
      .toEqual({ kind: 'hint', hint: hintFor(input) });
    expect(worker.terminated).toBe(true);
  });
  it('times out, terminates, and ignores late success', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(), search = new HintSearch(() => worker, 100);
    const result = search.run(input);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toEqual({ kind: 'failed', reason: 'timeout' });
    worker.reply({ kind: 'pour', from: 0, to: 1, remaining: 2 });
    expect(worker.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not time out a slow search by default', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(), search = new HintSearch(() => worker);
    const result = search.run(input);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(worker.terminated).toBe(false);
    worker.reply({ kind: 'pour', from: 0, to: 1, remaining: 2 });
    expect(await result).toEqual({ kind: 'hint', hint: { kind: 'pour', from: 0, to: 1, remaining: 2 } });
  });
  it.each([null, {}, {kind:'done'}, {kind:'undo',steps:1},
    {kind:'pour',from:0,to:0,remaining:2}, {kind:'pour',from:0,to:1,remaining:0},
    {kind:'pour',from:0,to:1,remaining:1.5}])('rejects a corrupt result %#', async data => {
    const worker = new FakeWorker(), search = new HintSearch(() => worker);
    const result = search.run(input); worker.reply(data);
    expect(await result).toEqual({ kind: 'hint', hint: hintFor(input) });
  });
});
