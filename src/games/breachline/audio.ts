/** Breachline sound, synthesised in the browser: no audio files, nothing downloaded. After the first user gesture
 * (and only while the arcade's sound setting is on) every sound is rendered ahead of time into buffers, several
 * variants each (audio/sounds.ts, in a worker); play-time is then a buffer through placement, occlusion and the
 * reverb of the room it is made in (audio/engine.ts). Plan: docs/superpowers/plans/2026-11-11-breachline-audio-overhaul.md. */
import type { WeaponId } from './config';
import { roomAt } from './map';
import { RELOADS } from './reloads';
import { Engine, type BusName, type Place, type PlayOpts } from './audio/engine';
import { catalogue, RELOAD_CLASS, type Floor } from './audio/sounds';
import { spaceOfRoom, type Space } from './audio/spaces';

export type Surface = 'hard' | 'soft' | 'wood' | 'metal' | 'grass' | Floor;
export interface At { x: number; y: number; z: number; /** 0 clear, 1-3 destructible layers, 4 solid. */ block: number }
export interface SfxStats { voices: number; hrtf: number; bytes: number; loaded: number; firstMs: number; state: string }
export interface Sfx {
  listen(x: number, y: number, z: number, yaw: number, indoors: boolean): void;
  shot(w: WeaponId, at: At | null): void;
  step(surface: Surface, loud: number, at: At | null): void;
  /** `w` and `empty` pick the weapon's own reload, tactical or from empty; without them a rifle's tactical plays. */
  reload(seconds: number, at: At | null, w?: WeaponId, empty?: boolean): void;
  melee(at: At | null): void;
  crumble(wood: boolean, big: boolean, at: At): void;
  boom(at: At, power: number): void;
  bounce(at: At): void;
  throwIt(at: At | null): void;
  chargeSet(at: At): void;
  build(reinforce: boolean, at: At): void;
  work(kind: 'plant' | 'defuse' | 'reinforce' | 'barricade' | 'charge', at: At | null): void;
  beep(at: At, urgent: boolean): void;
  hit(head: boolean): void; hurt(): void; kill(): void; dry(): void; swap(): void; ui(): void;
  round(kind: 'start' | 'go' | 'win' | 'lose' | 'planted' | 'matchWin' | 'matchLose'): void;
  suspend(): void; resume(): void; dispose(): void;
  /** Starts the context (if allowed) and resolves when every sound has been rendered. For tests and the lab. */
  ready(): Promise<void>;
  stats(): SfxStats;
}

const OLD_SURFACE: Record<string, Floor> = { hard: 'slab', soft: 'carpet', wood: 'planks', metal: 'raised', grass: 'grass' };
const BEDS: Space[] = ['hard', 'soft', 'corridor', 'yard'];
/** Ambience level per bed, linear, before the ambience bus. */
const BED_GAIN: Record<Space, number> = { hard: 0.5, soft: 0.35, corridor: 0.5, yard: 0.5 };

/** `options.ambience: false` leaves the room beds out (the sound lab measures single sounds that way). */
export function createSfx(enabled: () => boolean, options: { ambience?: boolean } = {}): Sfx {
  let eng: Engine | null = null, dead = false;
  const levels = new Map(catalogue().map(d => [d.key, d.level]));
  const beds = new Map<Space, GainNode>();
  let bedSpace: Space | null = null, indoors = false;
  const ear = { x: 0, y: 1.6, z: 0, yaw: 0 };

  /** The engine, created on first use after a user gesture while sound is on. */
  function start(): Engine | null {
    if (dead || !enabled()) return null;
    if (eng) { if (eng.ctx.state === 'suspended') void eng.ctx.resume().catch(() => {}); return eng; }
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return null;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { eng = new Engine(new AC({ latencyHint: 'interactive' }), levels); } catch { return null; }
    Object.assign(eng.ear, ear);
    void eng.load();
    return eng;
  }
  const spaceAt = (x: number, z: number) => spaceOfRoom(roomAt(x, z));
  const place = (at: At): Place => ({ ...at, space: spaceAt(at.x, at.z) });
  function play(key: string, bus: BusName, at: At | null, o: Omit<PlayOpts, 'bus' | 'at'> = {}) {
    const e = start();
    return e ? e.play(key, { bus, at: at ? place(at) : null, ...o }) : null;
  }
  /** Ambience: one loop per space, cross-faded as the listener moves; the yard is faintly heard from inside. */
  function ambience(e: Engine) {
    for (const b of BEDS) if (!beds.has(b) && e.has(`amb.${b}`)) { const g = e.play(`amb.${b}`, { bus: 'amb', loop: true, gain: 0 }); if (g) beds.set(b, g); bedSpace = null; }
    const space = e.ear.space;
    if (space === bedSpace) return;
    bedSpace = space;
    const t = e.ctx.currentTime;
    for (const [b, g] of beds) g.gain.setTargetAtTime(BED_GAIN[b] * (b === space ? 1 : b === 'yard' && indoors ? 0.18 : 0), t, 0.6);
  }

  // Start rendering at the first press anywhere (a user gesture), not at the first sound: on a slow machine the
  // bank then fills while the player is still in the lobby. Passive and removed once started.
  const early = () => { if (start()) { removeEventListener('pointerdown', early, true); removeEventListener('keydown', early, true); } };
  addEventListener('pointerdown', early, { capture: true, passive: true });
  addEventListener('keydown', early, { capture: true, passive: true });

  return {
    listen(x, y, z, yaw, inside) {
      ear.x = x; ear.y = y; ear.z = z; ear.yaw = yaw; indoors = inside;
      if (!eng) return;
      const e = eng.ear;
      e.x = x; e.y = y; e.z = z; e.yaw = yaw; e.space = spaceAt(x, z);
      if (enabled() && options.ambience !== false) ambience(eng);
    },
    shot(w, at) {
      if (!at) {
        const e = play(`gun.${w}.fp`, 'own', null, { wet: 0.4, rate: 0.985 + Math.random() * 0.03 });
        if (!e || !eng) return;
        eng.duck('world', 4, 0.06); eng.duck('amb', 9, 0.18);
        if (w === 'shotgun') play('rl.shotgun.pump', 'near', null, { delay: 0.3, gain: 0.8 });
        return;
      }
      // One buffer per shot (node budget): the near report up to ~38 m, the far one beyond; the engine's distance
      // low-pass and level carry the transition.
      const d = Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z), rate = 0.98 + Math.random() * 0.04;
      if (d < 38) play(`gun.${w}.tp`, 'world', at, { wet: 0.6, ref: 4.2, reach: 160, hrtf: d < 30, rate });
      else play(`gun.${w}.far`, 'world', at, { wet: 0.5, ref: 4.2, reach: 160, rate, gain: 1.4 });
    },
    step(surface, loud, at) {
      const floor = OLD_SURFACE[surface] ?? (surface as Floor), crouch = loud < 0.5, sprint = loud > 1;
      play(`step.${floor}`, at ? 'world' : 'near', at, { gain: Math.pow(loud, 1.2) * (at ? 1 : 0.55), wet: 0.25, ref: 2, reach: 30, hrtf: true, lowpass: crouch ? 2400 : undefined, rate: 0.96 + Math.random() * 0.08 });
      if (sprint || Math.random() < 0.3) play('gear', at ? 'world' : 'near', at, { gain: loud * (at ? 1 : 0.6), wet: 0.1, ref: 2, reach: 18 });
    },
    reload(seconds, at, w, empty) {
      const cls = RELOAD_CLASS[w ?? 'ar'], beats = RELOADS[w ?? 'ar'][empty ? 'empty' : 'tactical'];
      for (const b of beats) play(eng?.has(`rl.${cls}.${b.name}`) ? `rl.${cls}.${b.name}` : `rl.rifle.${b.name}`, at ? 'world' : 'near', at, { delay: seconds * b.at, gain: at ? 1 : 0.8, wet: 0.2, ref: 2, reach: 22, hrtf: true });
    },
    melee(at) { play('melee', at ? 'world' : 'near', at, { wet: 0.2, ref: 2, reach: 20 }); },
    crumble(wood, big, at) {
      play(wood ? 'crumble.wood' : 'crumble.board', 'world', at, { gain: big ? 1 : 0.6, wet: 0.4, ref: 4, reach: 50 });
      if (big) play('debris', 'world', at, { delay: 0.12, wet: 0.4, ref: 4, reach: 40 });
    },
    boom(at, power) {
      const d = Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z);
      if (d < 32) play(power >= 1 ? 'boom.near' : 'boom.impact', 'world', at, { wet: 0.8, ref: 6, reach: 140 });
      else play('boom.far', 'world', at, { gain: 1.3 * power, wet: 0.7, ref: 6, reach: 160 });
      if (eng && d < 14) { const k = 1 - d / 14; eng.muffle(20000 * Math.pow(0.04, k * power), 0.6 + 1.2 * k); eng.duck('amb', 12 * k, 1); }
    },
    bounce(at) { play('bounce', 'world', at, { wet: 0.3, ref: 2, reach: 28, rate: 0.95 + Math.random() * 0.1 }); },
    throwIt(at) { play('throw', at ? 'world' : 'near', at, { wet: 0.15, ref: 2, reach: 16 }); },
    chargeSet(at) {
      play('charge.set', 'world', at, { wet: 0.2, ref: 2, reach: 30 });
      for (const t of [0.35, 0.55]) play('beep', 'world', at, { delay: t, wet: 0.2, ref: 2, reach: 30, gain: 0.7 });
    },
    build(reinforce, at) {
      if (reinforce) play('build.reinforce', 'world', at, { wet: 0.4, ref: 3, reach: 40 });
      else for (let i = 0; i < 3; i++) play('hammer', 'world', at, { delay: i * 0.11, wet: 0.35, ref: 3, reach: 40 });
    },
    work(kind, at) {
      const key = kind === 'plant' ? 'work.plant' : kind === 'defuse' ? 'work.defuse' : kind === 'reinforce' ? 'work.ratchet' : kind === 'barricade' ? 'hammer' : 'work.tape';
      play(key, at ? 'world' : 'near', at, { wet: 0.2, ref: 2, reach: 26, gain: kind === 'barricade' ? 0.6 : 1 });
    },
    beep(at, urgent) { play(urgent ? 'beep.urgent' : 'beep', 'world', at, { wet: 0.3, ref: 3, reach: 45 }); },
    hit(head) { play(head ? 'hit.head' : 'hit', 'cue', null); },
    hurt() { play('hurt', 'near', null); },
    kill() { play('kill', 'cue', null); },
    dry() { play('dry', 'near', null); },
    swap() { play('swap', 'near', null); },
    ui() { play('ui', 'cue', null); },
    round(kind) { play(`cue.${kind}`, 'cue', null, { wet: 0.15 }); },
    suspend() { if (eng && eng.ctx.state === 'running') void eng.ctx.suspend(); },
    resume() { if (eng && eng.ctx.state === 'suspended' && enabled()) void eng.ctx.resume(); },
    dispose() { dead = true; removeEventListener('pointerdown', early, true); removeEventListener('keydown', early, true); if (eng) { eng.dispose(); void eng.ctx.close().catch(() => {}); } eng = null; beds.clear(); },
    ready() { const e = start(); return e ? e.load() : Promise.resolve(); },
    stats() { return eng ? { voices: eng.activeVoices, hrtf: eng.activeHrtf, bytes: eng.bytes, loaded: eng.loaded, firstMs: eng.readyAt, state: eng.ctx.state } : { voices: 0, hrtf: 0, bytes: 0, loaded: 0, firstMs: -1, state: 'none' }; },
  };
}
