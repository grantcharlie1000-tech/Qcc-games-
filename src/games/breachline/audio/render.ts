/** Breachline sound: the pre-render job queue, shared by the worker and the main-thread fallback. Variant 0 of every
 * sound renders first (most-needed first), then the remaining variants, so the game has something to play for
 * every call within moments and gains variety over the next seconds. Plan §3.1. */
import { catalogue, renderSound, type SoundDef } from './sounds';
import { impulse, SPACES, type Space } from './spaces';

export type Job = { kind: 'sound'; key: string; v: number } | { kind: 'ir'; space: Space; sr: number };
export type Done =
  | { kind: 'sound'; key: string; v: number; sr: number; data: Float32Array; loop: boolean }
  | { kind: 'ir'; space: Space; sr: number; data: [Float32Array, Float32Array] };

let defs: Map<string, SoundDef> | null = null;
const lookup = () => (defs ??= new Map(catalogue().map(d => [d.key, d])));

/** All jobs in the order they should run. IRs go after the first variant of the most-needed sounds. */
/** `skip`: keys not to render (a sample pack supplies them). */
export function plan(contextRate: number, skip: readonly string[] = []): Job[] {
  const all = [...lookup().values()].filter(d => !skip.includes(d.key)).sort((a, b) => a.order - b.order), jobs: Job[] = [];
  const first = all.map(d => ({ kind: 'sound', key: d.key, v: 0 }) as Job);
  const cut = all.findIndex(d => d.order > 2);
  jobs.push(...first.slice(0, cut), ...SPACES.map(space => ({ kind: 'ir', space, sr: contextRate }) as Job), ...first.slice(cut));
  for (const d of all) for (let v = 1; v < d.variants; v++) jobs.push({ kind: 'sound', key: d.key, v });
  return jobs;
}

export function run(job: Job): Done {
  if (job.kind === 'ir') return { kind: 'ir', space: job.space, sr: job.sr, data: impulse(job.space, job.sr) };
  const d = lookup().get(job.key)!;
  return { kind: 'sound', key: job.key, v: job.v, sr: d.sr, data: renderSound(d, job.v), loop: !!d.loop };
}
