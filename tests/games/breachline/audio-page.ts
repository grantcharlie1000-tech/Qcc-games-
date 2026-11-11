/** Breachline sound lab, browser side. `renderInPage` runs inside a page served by the dev server: it swaps the
 * page's AudioContext for an OfflineAudioContext, imports the sound module, plays a script of calls at set times
 * through the module's whole graph, and returns the rendered samples plus counts of the nodes created. It is passed
 * to page.evaluate, so it must not use anything from outside its own body. */

export interface Cue { t: number; call: string; args: unknown[] }
export interface RenderJob {
  name: string;
  /** Module URL on the dev server, e.g. /src/games/breachline/audio.ts. */
  module: string;
  seconds: number;
  sampleRate: number;
  seed: number;
  cues: Cue[];
  /** Second argument to createSfx (e.g. { ambience: false } for single sounds). */
  options?: Record<string, unknown>;
  /** Method to call after construction and before any cue, if the module needs warming (pre-rendering). */
  warm?: string;
}
export interface RenderResult {
  name: string; sampleRate: number;
  /** Float32 samples per channel, base64. */
  channels: string[];
  nodes: Record<string, number>;
  /** Nodes created by each cue, in cue order. */
  perCue: number[];
  errors: string[];
}

export async function renderInPage(job: RenderJob): Promise<RenderResult> {
  const errors: string[] = [];
  let seed = job.seed >>> 0;
  Math.random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const len = Math.ceil(job.seconds * job.sampleRate);
  const off = new OfflineAudioContext(2, len, job.sampleRate);
  const nodes: Record<string, number> = {};
  let made = 0;
  const proto = BaseAudioContext.prototype as unknown as Record<string, unknown>;
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!k.startsWith('create') || typeof proto[k] !== 'function') continue;
    const fn = proto[k] as (...a: unknown[]) => unknown;
    (off as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => { nodes[k] = (nodes[k] ?? 0) + 1; if (k !== 'createBuffer') made++; return fn.apply(off, a); };
  }
  const realResume = off.resume.bind(off), realSuspend = off.suspend.bind(off);
  (off as unknown as Record<string, unknown>).resume = () => Promise.resolve();
  (off as unknown as Record<string, unknown>).suspend = (t?: number) => (t === undefined ? Promise.resolve() : realSuspend(t));
  (off as unknown as Record<string, unknown>).close = () => Promise.resolve();
  // The lab stands in for a player who has clicked: the game creates no context before a gesture.
  try { Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: true, isActive: true }, configurable: true }); } catch { /* not supported */ }
  const w = window as unknown as Record<string, unknown>;
  // The module may pre-render with its own OfflineAudioContexts; only the live context is replaced.
  w.AudioContext = function AudioContextStub() { return off; };
  w.webkitAudioContext = w.AudioContext;
  const mod = await import(/* @vite-ignore */ job.module) as { createSfx(enabled: () => boolean, options?: unknown): Record<string, (...a: unknown[]) => unknown> };
  const sfx = mod.createSfx(() => true, job.options);
  if (job.warm) await (sfx[job.warm] as () => Promise<void>)();
  else if (typeof sfx.ready === 'function') await (sfx.ready as () => Promise<void>)();
  const q = 128 / job.sampleRate, groups = new Map<number, number[]>();
  job.cues.forEach((c, i) => { const k = Math.max(0, Math.round(c.t / q)); groups.set(k, [...(groups.get(k) ?? []), i]); });
  const perCue = new Array(job.cues.length).fill(0);
  const fire = (ids: number[]) => {
    for (const i of ids) {
      const c = job.cues[i], before = made;
      try { (sfx[c.call] as (...a: unknown[]) => unknown)(...c.args); } catch (e) { errors.push(`${c.call}: ${(e as Error).message}`); }
      perCue[i] = made - before;
    }
  };
  for (const [k, ids] of [...groups].sort((a, b) => a[0] - b[0])) {
    if (k === 0) { fire(ids); continue; }
    if (k * q >= job.seconds) continue;
    realSuspend(k * q).then(() => { fire(ids); return realResume(); }).catch(e => errors.push(String(e)));
  }
  const buf = await off.startRendering();
  const channels: string[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const bytes = new Uint8Array(buf.getChannelData(c).slice().buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    channels.push(btoa(s));
  }
  return { name: job.name, sampleRate: job.sampleRate, channels, nodes, perCue, errors };
}
