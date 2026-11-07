import type { Hint, HintInput } from './hint';
import { hintFallback } from './hint-fallback';
import { pour, won } from './rules';

export type HintResult =
  | { kind: 'hint'; hint: Hint }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: 'worker' | 'timeout' | 'protocol' };

export type HintWorker = Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
  postMessage(input: HintInput): void;
  terminate(): void;
};

function readHint(value: unknown, input: HintInput): Hint | null {
  if (!value || typeof value !== 'object' || !('kind' in value)) return null;
  if (value.kind === 'done') return won(input.tubes) ? { kind: 'done' } : null;
  if (value.kind === 'undo' && 'steps' in value && typeof value.steps === 'number' &&
      Number.isInteger(value.steps) && value.steps >= 0 && value.steps <= input.history.length) {
    return { kind: 'undo', steps: value.steps };
  }
  if (value.kind === 'pour' && 'from' in value && 'to' in value && 'remaining' in value &&
      typeof value.from === 'number' && typeof value.to === 'number' &&
      typeof value.remaining === 'number' && Number.isInteger(value.remaining) &&
      value.remaining > 0 && pour(input.tubes, value.from, value.to)) {
    return { kind: 'pour', from: value.from, to: value.to, remaining: value.remaining };
  }
  return null;
}

export class HintSearch {
  private generation = 0;
  private active: { cancel(): void } | null = null;

  constructor(
    private readonly createWorker: () => HintWorker = () =>
      new Worker(new URL('./hint.worker.ts', import.meta.url), { type: 'module' }),
    private readonly timeoutMs?: number,
  ) {}

  cancel(): void {
    this.active?.cancel();
  }

  run(input: HintInput): Promise<HintResult> {
    const generation = ++this.generation;
    this.cancel();
    if (generation !== this.generation) return Promise.resolve({ kind: 'cancelled' });
    return new Promise(resolve => {
      let worker: HintWorker | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let fallingBack = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      let fallbackSearch: ReturnType<typeof hintFallback> | null = null;
      const stopWorker = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        const current = worker;
        worker = null;
        if (!current) return;
        // Cleanup must not prevent cancellation or leave the result unresolved.
        for (const [type, listener] of [
          ['message', onMessage], ['error', onError], ['messageerror', onError],
        ] as const) {
          try { current.removeEventListener(type, listener); } catch { /* best effort */ }
        }
        try { current.terminate(); } catch { /* best effort */ }
      };
      const job = { cancel: () => finish({ kind: 'cancelled' }) };
      const finish = (result: HintResult) => {
        if (settled) return;
        settled = true;
        if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
        // Drop suspended generator frames (queue, seen keys and board references).
        // No generator finally blocks or asynchronous work need unwinding.
        fallbackSearch = null;
        stopWorker();
        if (this.active === job) this.active = null;
        resolve(result);
      };
      const onMessage = (event: Event) => {
        if (settled || fallingBack) return;
        const hint = event instanceof MessageEvent ? readHint(event.data, input) : null;
        if (hint) finish({ kind: 'hint', hint });
        else fallback('protocol');
      };
      const onError = (event: Event) => {
        event.preventDefault();
        fallback('worker');
      };
      const fallback = (reason: 'worker' | 'protocol') => {
        if (settled || fallingBack) return;
        fallingBack = true;
        stopWorker();
        if (settled) return;
        fallbackSearch = hintFallback(input);
        const tick = () => {
          fallbackTimer = undefined;
          if (settled || !fallbackSearch) return;
          try {
            const started = performance.now();
            // Elapsed-time slice, with an operation ceiling for coarse clocks.
            // This is not a total-search timeout or a new node budget.
            for (let work = 0; work < 16384; work++) {
              if (settled || !fallbackSearch) return;
              const next = fallbackSearch.next();
              if (settled) return;
              if (next.done) {
                finish({ kind: 'hint', hint: next.value });
                return;
              }
              if ((work & 31) === 31 && performance.now() - started >= 4) break;
            }
            fallbackTimer = setTimeout(tick, 0);
          } catch { finish({ kind: 'failed', reason }); }
        };
        // A real task boundary lets input/cancel run; a Promise yield would not.
        try { fallbackTimer = setTimeout(tick, 0); }
        catch { finish({ kind: 'failed', reason }); }
      };
      this.active = job;
      try {
        worker = this.createWorker();
        if (settled) { stopWorker(); return; }
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onError);
        if (this.timeoutMs !== undefined) timer = setTimeout(() => finish({ kind: 'failed', reason: 'timeout' }), this.timeoutMs);
        worker.postMessage(input);
      } catch {
        fallback('worker');
      }
    });
  }
}
