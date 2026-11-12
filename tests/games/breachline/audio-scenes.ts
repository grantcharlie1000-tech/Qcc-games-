/** What the sound lab renders: a catalogue of single sounds and three scripted scenes, written only against the
 * `Sfx` calls the game makes today, so the same jobs render both the baseline and the rebuilt sound. The listener
 * stands in a real room of the map (a frame per job); places are written relative to them, -Z ahead and +X to their right. Plan §6. */
import type { WeaponId } from '../../../src/games/breachline/config';
import type { Cue, RenderJob } from './audio-page';

export const WEAPON_IDS: WeaponId[] = ['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol'];
export const RELOAD_SECONDS: Record<WeaponId, number> = { ar: 2.3, carbine: 2.2, smg: 2, shotgun: 3, dmr: 2.6, pistol: 1.6 };
export const INTERVAL: Record<WeaponId, number> = { ar: 60 / 690, carbine: 60 / 760, smg: 60 / 920, shotgun: 0.82, dmr: 0.21, pistol: 0.14 };
const SR = 48000;

/** A place in the listener's frame: x to their right, z behind them (so ahead is −z). `job` moves it into the map. */
const at = (x: number, z: number, block = 0, y = 1.4) => ({ x, y, z, block });
/** Where the listener stands in the map, and which way they face. Sounds are placed relative to this, so the room
 * each one is in (and so its reverb) comes from the real map. */
export interface Frame { x: number; z: number; yaw: number }
export const LAB: Frame = { x: -1, z: -6, yaw: 0 }, YARD: Frame = { x: 0, z: 16, yaw: 0 }, CORRIDOR: Frame = { x: 0, z: -0.5, yaw: Math.PI / 2 }, ARCHIVE: Frame = { x: 4, z: 5.5, yaw: 0 };
const toWorld = (f: Frame, lx: number, lz: number) => ({ x: f.x + Math.cos(f.yaw) * lx + Math.sin(f.yaw) * lz, z: f.z - Math.sin(f.yaw) * lx + Math.cos(f.yaw) * lz });
const listen = (t: number, f: Frame, indoors: boolean): Cue => ({ t, call: 'listen', args: [f.x, 1.6, f.z, f.yaw, indoors] });
/** Calls `listen` every 50 ms, as the game does every frame, so ambience and the ear follow along. */
const ears = (seconds: number, f: Frame, indoors: boolean): Cue[] => Array.from({ length: Math.floor(seconds / 0.05) }, (_, i) => listen(i * 0.05, f, indoors));
const isPlace = (a: unknown): a is { x: number; y: number; z: number; block: number } => !!a && typeof a === 'object' && 'block' in a;
/** Scenes and ambience renders follow the ear every 50 ms; single sounds place the ear once, before the first sound,
 * so no ambience bed sits under them and their measurements are of the sound alone. */
const job = (module: string, name: string, seconds: number, cues: Cue[], indoors = true, seed = 1, frame: Frame = indoors ? LAB : YARD, bed = /^(scene|ambience)/.test(name)): RenderJob => ({
  name, module, seconds, sampleRate: SR, seed, options: { ambience: bed },
  cues: [...(bed ? ears(seconds, frame, indoors) : [listen(0, frame, indoors)]), ...cues.map(c => ({ ...c, args: c.args.map(a => (isPlace(a) ? { ...a, ...toWorld(frame, a.x, a.z) } : a)) }))].sort((a, b) => a.t - b.t),
});
const burst = (t0: number, w: WeaponId, n: number, where: ReturnType<typeof at> | null): Cue[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + i * INTERVAL[w], call: 'shot', args: [w, where] }));

export function catalogue(module: string): RenderJob[] {
  const jobs: RenderJob[] = [];
  for (const w of WEAPON_IDS) {
    jobs.push(job(module, `shot-${w}-fp-in`, 1.6, [{ t: 0.1, call: 'shot', args: [w, null] }]));
    jobs.push(job(module, `shot-${w}-fp-out`, 1.6, [{ t: 0.1, call: 'shot', args: [w, null] }], false));
    jobs.push(job(module, `shot-${w}-10m-in`, 1.6, [{ t: 0.1, call: 'shot', args: [w, at(0, -10)] }]));
    jobs.push(job(module, `shot-${w}-60m-out`, 1.8, [{ t: 0.1, call: 'shot', args: [w, at(20, -57)] }], false));
    jobs.push(job(module, `shot-${w}-15m-out`, 1.6, [{ t: 0.1, call: 'shot', args: [w, at(0, -15)] }], false));
  }
  // The same own rifle shot in each of the four spaces, for the room comparison listening file.
  for (const [room, f] of [['soft', ARCHIVE], ['corridor', CORRIDOR]] as const) jobs.push(job(module, `shot-ar-fp-${room}`, 1.6, [{ t: 0.1, call: 'shot', args: ['ar', null] }], true, 1, f));
  for (const block of [0, 1, 3, 4]) jobs.push(job(module, `shot-ar-12m-block${block}`, 1.6, [{ t: 0.1, call: 'shot', args: ['ar', at(0, -12, block)] }]));
  jobs.push(job(module, 'auto-ar-fp', 2.4, burst(0.1, 'ar', 20, null)));
  jobs.push(job(module, 'auto-smg-fp', 2.0, burst(0.1, 'smg', 24, null)));
  jobs.push(job(module, 'auto-carbine-fp', 2.2, burst(0.1, 'carbine', 24, null)));
  for (const s of ['asphalt', 'grass', 'slab', 'tile', 'lino', 'carpet', 'planks', 'raised', 'check'] as const) {
    jobs.push(job(module, `step-${s}`, 2.2, [0.1, 0.52, 0.94, 1.36, 1.78].map(t => ({ t, call: 'step', args: [s, 0.8, null] }))));
  }
  jobs.push(job(module, 'step-tile-crouch', 2.2, [0.1, 0.62, 1.14, 1.66].map(t => ({ t, call: 'step', args: ['tile', 0.3, null] }))));
  jobs.push(job(module, 'step-tile-sprint', 2.2, [0.1, 0.42, 0.74, 1.06, 1.38, 1.7].map(t => ({ t, call: 'step', args: ['tile', 1.35, null] }))));
  // Phase 3: what a stopped round sounds like in each material, glass, set pieces, bodies, hits, reinforcement.
  const mats = ['wall', 'concrete', 'brick', 'wood', 'fabric', 'earth', 'ceiling', 'tile', 'plastic', 'glass', 'cardboard', 'metal', 'leaf'];
  jobs.push(job(module, 'impacts', mats.length * 0.5 + 0.6, mats.map((m, i) => ({ t: 0.1 + i * 0.5, call: 'impact', args: [m, at(1.5, -4, 0, 1.2)] }))));
  jobs.push(job(module, 'glass', 2.6, [{ t: 0.1, call: 'glass', args: ['crack', at(2, -3)] }, { t: 0.7, call: 'glass', args: ['shatter', at(2, -3)] }]));
  jobs.push(job(module, 'breaks', 6.4, ['wood', 'metal', 'fabric', 'shelf', 'drum', 'crate'].map((f, i) => ({ t: 0.1 + i * 1.05, call: 'breakPiece', args: [f === 'shelf' || f === 'drum' || f === 'crate' ? 'metal' : f, f === 'shelf' ? 'shelf' : f === 'drum' ? 'barrel' : f === 'crate' ? 'crates' : 'table', 2, at(2, -4, 0, 0.6)] }))));
  jobs.push(job(module, 'body', 2.4, [{ t: 0.1, call: 'flesh', args: [at(0.5, -6), false] }, { t: 0.35, call: 'flesh', args: [at(0.5, -6), true] }, { t: 0.6, call: 'body', args: [at(0.5, -6, 0, 0.3), false, 'tile'] }, { t: 0.6, call: 'dropWeapon', args: [at(0.5, -6, 0, 0.3)] }, { t: 1.9, call: 'body', args: [at(0.5, -6, 0, 0.3), true, 'tile'] }]));
  jobs.push(job(module, 'reinforce', 2.2, [{ t: 0.1, call: 'build', args: [true, at(1, -2)] }]));
  jobs.push(job(module, 'step-hard-6m', 2.2, [0.1, 0.52, 0.94, 1.36, 1.78].map(t => ({ t, call: 'step', args: ['hard', 0.8, at(-4, -4.5, 0, 0.1)] }))));
  // Reloads by weapon, tactical and from empty (the weapon and empty flag are ignored by the baseline).
  for (const [w, empty] of WEAPON_IDS.flatMap(x => [[x, false], [x, true]]) as [WeaponId, boolean][]) {
    jobs.push(job(module, `reload-${w}${empty ? '-empty' : ''}`, RELOAD_SECONDS[w] + 0.5, [{ t: 0.1, call: 'reload', args: [RELOAD_SECONDS[w], null, w, empty] }]));
  }
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
  return job(module, 'scene-corridor', 9, cues, true, 11, CORRIDOR);
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
  return job(module, 'scene-uplink', 11, cues, true, 13, ARCHIVE);
}

export const scenes = (module: string) => [corridor(module), breach(module), uplink(module)];

/** One round in a minute, for the owner: everything the game can sound, in the order a round brings it. Prep
 * (reinforcing, a barricade), go, distant fire, a breach, the firefight through the hole, a grenade, a far blast,
 * set pieces breaking, the uplink planted and defused, the win. Rendered by the lab only (`-- now - - '^round'`). */
export function round(module: string): RenderJob {
  const p = { wall: at(3, -2, 0), entry: at(3.5, -3.5), enemy: at(3.5, -4.5, 0, 1.2), floor: at(3.5, -4.5, 0, 0.3) };
  const cues: Cue[] = [
    { t: 0.1, call: 'round', args: ['start'] },
    ...[0.6, 1.1, 1.6, 2.1].map(t => ({ t, call: 'step', args: ['tile', 0.8, null] })),
    { t: 2.4, call: 'build', args: [true, at(2, -3)] },
    ...[5.4, 5.9, 6.4].map(t => ({ t, call: 'step', args: ['tile', 0.8, null] })),
    { t: 6.8, call: 'build', args: [false, at(-2, -4)] },
    ...[7.0, 7.4, 7.8, 8.2].map(t => ({ t, call: 'work', args: ['barricade', null] })),
    { t: 9.5, call: 'round', args: ['go'] },
    ...burst(10.5, 'ar', 5, at(25, -30, 4)), ...burst(12.0, 'carbine', 6, at(-20, -35, 4)),
    ...[13.0, 13.4, 13.8, 14.2].map(t => ({ t, call: 'step', args: ['tile', 0.8, at(5, -6, 1, 0.1)] })),
    { t: 14.6, call: 'chargeSet', args: [at(3, -2, 1)] },
    ...[15.0, 15.3, 15.6].map(t => ({ t, call: 'work', args: ['charge', at(3, -2.5, 1)] })),
    { t: 16.5, call: 'boom', args: [p.wall, 1] },
    { t: 16.52, call: 'crumble', args: [false, true, p.wall] },
    { t: 16.6, call: 'breakPiece', args: ['metal', 'shelf', 2, at(4, -3, 0, 0.6)] },
    ...burst(17.6, 'shotgun', 1, p.entry), ...burst(18.4, 'shotgun', 1, p.entry),
    ...[17.7, 18.0, 18.3].map(t => ({ t, call: 'step', args: ['tile', 1.35, at(3.5, -3, 0, 0.1)] })),
    { t: 17.65, call: 'impact', args: ['wall', at(1, -1.5, 0, 1.2)] }, { t: 18.45, call: 'impact', args: ['concrete', at(0.5, -1.2, 0, 1.0)] },
    { t: 18.5, call: 'hurt', args: [] },
    ...burst(18.9, 'ar', 7, null),
    { t: 19.0, call: 'flesh', args: [p.enemy, true] }, { t: 19.1, call: 'hit', args: [false] },
    { t: 19.2, call: 'impact', args: ['brick', at(4, -6, 0, 1.3)] },
    { t: 19.35, call: 'flesh', args: [p.enemy, false] }, { t: 19.45, call: 'hit', args: [false] },
    { t: 19.55, call: 'kill', args: [] }, { t: 19.55, call: 'body', args: [p.floor, false, 'tile'] }, { t: 19.55, call: 'dropWeapon', args: [p.floor] },
    { t: 21.0, call: 'reload', args: [2.3, null, 'ar', true] },
    { t: 21.2, call: 'glass', args: ['crack', at(-3, -6)] },
    ...burst(21.1, 'smg', 6, at(-6, -9, 1)), { t: 21.6, call: 'glass', args: ['shatter', at(-3, -6)] },
    { t: 21.7, call: 'body', args: [p.floor, true, 'tile'] },
    { t: 24.0, call: 'swap', args: [] },
    { t: 24.6, call: 'throwIt', args: [null] },
    { t: 25.2, call: 'bounce', args: [at(-2, -10, 0, 0.2)] }, { t: 25.5, call: 'bounce', args: [at(-2.5, -11, 0, 0.1)] },
    { t: 26.8, call: 'boom', args: [at(-2.5, -11), 0.8] },
    { t: 26.85, call: 'breakPiece', args: ['wood', 'table', 2, at(-2, -10, 0, 0.6)] },
    { t: 26.9, call: 'breakPiece', args: ['wood', 'crates', 2, at(-3.5, -12, 0, 0.6)] },
    { t: 27.0, call: 'breakPiece', args: ['fabric', 'sofa', 2, at(-1, -11, 0, 0.6)] },
    { t: 28.5, call: 'swap', args: [] },
    ...[29.0, 29.32, 29.64, 29.96, 30.28, 30.6].map(t => ({ t, call: 'step', args: ['tile', 1.35, null] })),
    ...burst(31.0, 'smg', 8, at(-5, -7, 1)),
    { t: 31.3, call: 'impact', args: ['wood', at(-1.5, -2.5, 0, 1.2)] }, { t: 31.6, call: 'impact', args: ['metal', at(1.5, -2.5, 0, 1.0)] },
    { t: 31.9, call: 'hurt', args: [] },
    ...burst(32.3, 'ar', 6, null), { t: 32.5, call: 'hit', args: [true] },
    { t: 32.55, call: 'flesh', args: [at(-5, -7), false] }, { t: 32.6, call: 'kill', args: [] },
    { t: 32.6, call: 'body', args: [at(-5, -7, 1, 0.3), false, 'tile'] }, { t: 32.6, call: 'dropWeapon', args: [at(-5, -7, 1, 0.3)] },
    { t: 34.0, call: 'melee', args: [null] },
    { t: 35.0, call: 'boom', args: [at(15, -45), 1] },
    ...burst(36.0, 'dmr', 1, at(2, -24, 4)), ...burst(36.5, 'dmr', 1, at(2, -24, 4)),
    { t: 36.55, call: 'breakPiece', args: ['metal', 'barrel', 2, at(2, -6, 0, 0.6)] },
    ...burst(37.2, 'pistol', 3, null),
    { t: 38.5, call: 'round', args: ['planted'] },
    ...[39.0, 39.4, 39.8, 40.2, 40.6].map(t => ({ t, call: 'step', args: ['tile', 0.8, at(-3, 4, 1, 0.1)] })),
    ...burst(41.0, 'carbine', 4, at(0.6, -16)),
    { t: 41.1, call: 'impact', args: ['concrete', at(0.5, -1.5, 0, 1.2)] }, { t: 41.3, call: 'impact', args: ['glass', at(-1, -2, 0, 1.4)] },
    ...burst(41.8, 'ar', 5, null), { t: 42.0, call: 'hit', args: [true] }, { t: 42.05, call: 'kill', args: [] },
    { t: 42.05, call: 'body', args: [at(0.6, -16, 0, 0.3), false, 'tile'] },
    ...Array.from({ length: Math.floor((52 - 43.5) / 0.26) }, (_, i) => ({ t: 43.5 + i * 0.26, call: 'work', args: ['defuse', null] })),
  ];
  for (let t = 38.8, left = 14; t < 52.2;) { cues.push({ t, call: 'beep', args: [at(1.5, -2, 0, 0.3), left < 5] }); const s = left < 5 ? 0.25 : 0.5; t += s; left -= s; }
  cues.push({ t: 52.6, call: 'round', args: ['win'] });
  return job(module, 'round-in-sound', 60, cues, true, 21, LAB, true);
}
