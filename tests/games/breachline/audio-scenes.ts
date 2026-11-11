/** What the sound lab renders: a catalogue of single sounds and three scripted scenes, written only against the
 * `Sfx` calls the game makes today, so the same jobs render both the baseline and the rebuilt sound. The listener
 * stands at the origin facing -Z (+X is to their right). Plan §6. */
import type { WeaponId } from '../../../src/games/breachline/config';
import type { Cue, RenderJob } from './audio-page';

export const WEAPON_IDS: WeaponId[] = ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol'];
export const RELOAD_SECONDS: Record<WeaponId, number> = { ar: 2.3, carbine: 2.2, smg: 2, shotgun: 3, dmr: 2.6, pistol: 1.6 };
export const INTERVAL: Record<WeaponId, number> = { ar: 60 / 690, carbine: 60 / 760, smg: 60 / 920, shotgun: 0.82, dmr: 0.21, pistol: 0.14 };
const SR = 48000;

const at = (x: number, z: number, block = 0, y = 1.4) => ({ x, y, z, block });
const listen = (t: number, indoors: boolean, x = 0, z = 0, yaw = 0): Cue => ({ t, call: 'listen', args: [x, 1.6, z, yaw, indoors] });
/** Calls `listen` every 50 ms, as the game does every frame, so ambience and the ear follow along. */
const ears = (seconds: number, indoors: boolean): Cue[] => Array.from({ length: Math.floor(seconds / 0.05) }, (_, i) => listen(i * 0.05, indoors));
/** Scenes and ambience renders follow the ear every 50 ms; single sounds place the ear once, before the first sound,
 * so no ambience bed sits under them and their measurements are of the sound alone. */
const job = (module: string, name: string, seconds: number, cues: Cue[], indoors = true, seed = 1, bed = /^(scene|ambience)/.test(name)): RenderJob =>
  ({ name, module, seconds, sampleRate: SR, seed, cues: [...(bed ? ears(seconds, indoors) : [listen(0, indoors)]), ...cues].sort((a, b) => a.t - b.t) });
const burst = (t0: number, w: WeaponId, n: number, where: ReturnType<typeof at> | null): Cue[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + i * INTERVAL[w], call: 'shot', args: [w, where] }));

export function catalogue(module: string): RenderJob[] {
  const jobs: RenderJob[] = [];
  for (const w of WEAPON_IDS) {
    jobs.push(job(module, `shot-${w}-fp-in`, 1.6, [{ t: 0.1, call: 'shot', args: [w, null] }]));
    jobs.push(job(module, `shot-${w}-fp-out`, 1.6, [{ t: 0.1, call: 'shot', args: [w, null] }], false));
    jobs.push(job(module, `shot-${w}-10m-in`, 1.6, [{ t: 0.1, call: 'shot', args: [w, at(0, -10)] }]));
    jobs.push(job(module, `shot-${w}-60m-out`, 1.8, [{ t: 0.1, call: 'shot', args: [w, at(20, -57)] }], false));
  }
  for (const block of [0, 1, 3, 4]) jobs.push(job(module, `shot-ar-12m-block${block}`, 1.6, [{ t: 0.1, call: 'shot', args: ['ar', at(0, -12, block)] }]));
  jobs.push(job(module, 'auto-ar-fp', 2.4, burst(0.1, 'ar', 20, null)));
  jobs.push(job(module, 'auto-smg-fp', 2.0, burst(0.1, 'smg', 24, null)));
  for (const s of ['hard', 'soft', 'wood', 'metal', 'grass'] as const) {
    jobs.push(job(module, `step-${s}`, 2.2, [0.1, 0.52, 0.94, 1.36, 1.78].map(t => ({ t, call: 'step', args: [s, 0.8, null] }))));
  }
  jobs.push(job(module, 'step-hard-6m', 2.2, [0.1, 0.52, 0.94, 1.36, 1.78].map(t => ({ t, call: 'step', args: ['hard', 0.8, at(-4, -4.5, 0, 0.1)] }))));
  jobs.push(job(module, 'reload-ar', 2.8, [{ t: 0.1, call: 'reload', args: [2.3, null] }]));
  jobs.push(job(module, 'reload-shotgun', 3.5, [{ t: 0.1, call: 'reload', args: [3, null] }]));
  jobs.push(job(module, 'melee', 1, [{ t: 0.1, call: 'melee', args: [null] }]));
  jobs.push(job(module, 'crumble-wall', 1.2, [{ t: 0.1, call: 'crumble', args: [false, false, at(2, -4)] }]));
  jobs.push(job(module, 'crumble-wood-big', 1.5, [{ t: 0.1, call: 'crumble', args: [true, true, at(2, -4)] }]));
  jobs.push(job(module, 'boom-8m', 3, [{ t: 0.1, call: 'boom', args: [at(0, -8), 1] }]));
  jobs.push(job(module, 'boom-40m-out', 3, [{ t: 0.1, call: 'boom', args: [at(10, -39), 1] }], false));
  jobs.push(job(module, 'grenade', 2.5, [{ t: 0.1, call: 'throwIt', args: [null] }, { t: 0.6, call: 'bounce', args: [at(1, -6, 0, 0.2)] }, { t: 0.9, call: 'bounce', args: [at(1, -7, 0, 0.1)] }]));
  jobs.push(job(module, 'charge', 1, [{ t: 0.1, call: 'chargeSet', args: [at(0.5, -1.5)] }]));
  jobs.push(job(module, 'build', 1.5, [{ t: 0.1, call: 'build', args: [true, at(1, -2)] }, { t: 0.8, call: 'build', args: [false, at(1, -2)] }]));
  jobs.push(job(module, 'work', 2.2, ['plant', 'defuse', 'reinforce', 'barricade', 'charge'].map((k, i) => ({ t: 0.1 + i * 0.4, call: 'work', args: [k, null] }))));
  jobs.push(job(module, 'beep', 1.5, [{ t: 0.1, call: 'beep', args: [at(2, -3, 0, 0.3), false] }, { t: 0.7, call: 'beep', args: [at(2, -3, 0, 0.3), true] }]));
  jobs.push(job(module, 'feedback', 2.4, [
    { t: 0.1, call: 'hit', args: [false] }, { t: 0.5, call: 'hit', args: [true] }, { t: 0.9, call: 'kill', args: [] },
    { t: 1.4, call: 'hurt', args: [] }, { t: 1.8, call: 'dry', args: [] }, { t: 2.0, call: 'swap', args: [] }, { t: 2.3, call: 'ui', args: [] }]));
  jobs.push(job(module, 'cues', 9, ['start', 'go', 'win', 'lose', 'planted', 'matchWin', 'matchLose'].map((k, i) => ({ t: 0.1 + i * 1.25, call: 'round', args: [k] }))));
  jobs.push(job(module, 'ambience-in', 3, [{ t: 0, call: 'ui', args: [] }]));
  jobs.push(job(module, 'ambience-out', 3, [{ t: 0, call: 'ui', args: [] }], false));
  return jobs;
}

/** A corridor firefight: own rifle bursts, an enemy carbine down the corridor, an SMG behind a soft wall to the
 * left, footsteps, hits, a wall crumbling, a reload. */
export function corridor(module: string): RenderJob {
  const cues: Cue[] = [
    ...[0.2, 0.62, 1.04, 1.46].map(t => ({ t, call: 'step', args: ['hard', 0.8, null] })),
    ...burst(0.9, 'carbine', 4, at(0.6, -16)),
    ...burst(1.4, 'ar', 5, null),
    { t: 1.75, call: 'hit', args: [false] },
    ...burst(2.3, 'smg', 7, at(-6, -5, 1)),
    { t: 2.5, call: 'hurt', args: [] },
    ...burst(2.9, 'ar', 6, null),
    { t: 3.0, call: 'crumble', args: [false, false, at(-3, -4)] },
    { t: 3.35, call: 'kill', args: [] },
    ...[3.6, 3.95, 4.3].map(t => ({ t, call: 'step', args: ['hard', 0.8, at(-5, -6, 1, 0.1)] })),
    ...burst(4.4, 'carbine', 3, at(0.6, -16)),
    { t: 4.9, call: 'reload', args: [2.3, null] },
    ...burst(5.6, 'dmr', 1, at(2, -24, 4)), ...burst(6.1, 'dmr', 1, at(2, -24, 4)),
    ...burst(7.3, 'ar', 8, null),
  ];
  return job(module, 'scene-corridor', 9, cues, true, 11);
}

/** A breach: a charge set on the wall beside the listener, a short wait, the blast, the wall coming down, then
 * entry fire and footsteps through the hole. */
export function breach(module: string): RenderJob {
  const cues: Cue[] = [
    { t: 0.2, call: 'chargeSet', args: [at(3, -2, 1)] },
    ...[0.5, 0.76, 1.02].map(t => ({ t, call: 'work', args: ['charge', at(3, -2.5, 1)] })),
    { t: 1.8, call: 'boom', args: [at(3, -2, 0), 1] },
    { t: 1.82, call: 'crumble', args: [false, true, at(3, -2)] },
    { t: 1.9, call: 'crumble', args: [true, true, at(3.5, -2)] },
    ...burst(2.6, 'shotgun', 1, at(3.5, -3)), ...burst(3.4, 'shotgun', 1, at(3.5, -3)),
    ...[2.7, 3.0, 3.3, 3.6].map(t => ({ t, call: 'step', args: ['hard', 1.35, at(3.5, -3, 0, 0.1)] })),
    ...burst(3.9, 'ar', 6, null),
    { t: 4.3, call: 'hit', args: [true] }, { t: 4.4, call: 'kill', args: [] },
  ];
  return job(module, 'scene-breach', 6.5, cues, true, 12);
}

/** The last ten seconds of an armed uplink: the pulse quickening, a defender working on it, distant fire outside,
 * the round ending. */
export function uplink(module: string): RenderJob {
  const cues: Cue[] = [];
  for (let t = 0.1, left = 10; t < 9.6; ) { cues.push({ t, call: 'beep', args: [at(1.5, -2, 0, 0.3), left < 5] }); const step = left < 5 ? 0.25 : 0.5; t += step; left -= step; }
  for (let t = 1.0; t < 6; t += 0.26) cues.push({ t, call: 'work', args: ['defuse', null] });
  cues.push(...burst(2.2, 'ar', 4, at(25, -30, 4)), ...burst(4.0, 'carbine', 5, at(-20, -35, 4)));
  cues.push(...[6.2, 6.6, 7.0, 7.4].map(t => ({ t, call: 'step', args: ['soft', 0.8, at(-3, 4, 1, 0.1)] })));
  cues.push(...burst(7.8, 'pistol', 3, null), { t: 9.6, call: 'round', args: ['lose'] });
  return job(module, 'scene-uplink', 11, cues, true, 13);
}

export const scenes = (module: string) => [corridor(module), breach(module), uplink(module)];
