/// <reference lib="webworker" />
/** Breachline sound: renders the sound bank off the main thread. Served from the site itself (same-origin module
 * worker), as the security policy requires. Receives the context's sample rate, posts each finished job back. */
import { plan, run } from './render';

self.onmessage = (e: MessageEvent<{ rate: number }>) => {
  for (const job of plan(e.data.rate)) {
    const done = run(job);
    const transfer = done.kind === 'ir' ? done.data.map(d => d.buffer) : [done.data.buffer];
    (self as unknown as Worker).postMessage(done, transfer as Transferable[]);
  }
  (self as unknown as Worker).postMessage({ kind: 'end' });
};
