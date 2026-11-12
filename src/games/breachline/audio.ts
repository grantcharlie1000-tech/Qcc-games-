/** Breachline sound, synthesised in the browser: no audio files, nothing downloaded. After the first user gesture
 * (and only while the arcade's sound setting is on) every sound is rendered ahead of time into buffers, several
 * variants each (audio/sounds.ts, in a worker); play-time is then a buffer through placement, occlusion and the
 * reverb of the room it is made in (audio/engine.ts). Plan: docs/superpowers/plans/2026-11-11-breachline-audio-overhaul.md. */
import type { WeaponId } from './config';
import { roomAt } from './map';
import { RELOADS } from './reloads';
import { Engine, type BusName, type Place, type PlayOpts } from './audio/engine';
import { catalogue, IMPACT_MATS, RELOAD_CLASS, type BreakKind, type Floor, type ImpactMat } from './audio/sounds';
import { spaceOfRoom, type Space } from './audio/spaces';

export type Surface = 'hard' | 'soft' | 'wood' | 'metal' | 'grass' | Floor;
export interface At { x: number; y: number; z: number; /** 0 clear, 1-3 destructible layers, 4 solid. */ block: number }
/** The fields of scene.ts `CosmeticEvent` that sound uses (kept structural, so audio does not import the scene). */
export type Cosmetic =
  | { k: 'impact'; mat: string; power: number }
  | { k: 'glass'; stage: 'crack' | 'shatter' }
  | { k: 'piece'; family: string; state: 'damaged' | 'wrecked' }
  | { k: 'body' }
  | { k: 'fort'; what: 'reinforce' | 'barricade'; stage: 'start' | 'unfold' | 'anchor' | 'break' };
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
  /** A stopped round in a material (names from render/surfacehit.ts; unknown names sound like concrete). */
  impact(material: string, at: At): void;
  glass(kind: 'crack' | 'shatter', at: At): void;
  /** A set piece changing state (1 damaged, 2 wrecked), by its material and family. */
  breakPiece(material: string, family: string, state: 1 | 2, at: At): void;
  /** A body hitting the floor (`rest` false) or coming to rest (`rest` true), on a floor material if known. */
  body(at: At, rest: boolean, floor?: string): void;
  dropWeapon(at: At): void;
  /** Someone hit: a wet hit on flesh, or a thud on armour. */
  flesh(at: At, armour: boolean): void;
  reinforceStage(stage: 'lift' | 'unfold' | 'anchor', at: At): void;
  /** The scene's cosmetic event stream (scene.ts `onCosmetic`): impacts, glass, set pieces, bodies at rest,
   * reinforcement and barricade stages. `at` is the event's place as the game sees it (with occlusion). */
  cosmetic(e: Cosmetic, at: At): void;
  suspend(): void; resume(): void; dispose(): void;
  /** Starts the context (if allowed) and resolves when every sound has been rendered. For tests and the lab. */
  ready(): Promise<void>;
  stats(): SfxStats;
}

/** Real cartridge cases on concrete by calibre (BigSoundBank), when the pack has them. */
const CASING: Partial<Record<WeaponId, string>> = { pistol: 'casing.9mm', smg: 'casing.9mm', ar: 'casing.556', carbine: 'casing.556', dmr: 'casing.762' };
const OLD_SURFACE: Record<string, Floor> = { hard: 'slab', soft: 'carpet', wood: 'planks', metal: 'raised', grass: 'grass' };
const BEDS: Space[] = ['hard', 'soft', 'corridor', 'yard'];
/** Ambience level per bed, linear, before the ambience bus. */
const BED_GAIN: Record<Space, number> = { hard: 0.5, soft: 0.35, corridor: 0.5, yard: 0.5 };

/** `options.ambience: false` leaves the room beds out (the sound lab measures single sounds that way).
 * `options.override` replaces sounds with given takes once the bank is ready: for the sound lab's auditions only;
 * the game never passes it. */
/** The recorded packs (guns at 96 kb/s, foley at 64 kb/s; plan A, chosen by the owner 2026-11-12): real CC0 takes from The Free Firearm Sound
 * Library, trimmed and levelled by tests/games/breachline/audio-pack.ts from audio-pack.planA.json; credited in
 * public/THIRD_PARTY_NOTICES.txt. Relative to the page, like the rest of the site's assets. If it cannot be
 * loaded, the synthesised guns play instead. */
export const PACK_URLS: string[] = ['audio/breachline/guns.json', 'audio/breachline/foley.json'];
/** What the pack supplies (audio-pack.planA.json): the synthesis skips these while the pack loads, and renders them
 * if it fails. Reload slots and dry fire are recorded too (CC0 handling sounds; see THIRD_PARTY_NOTICES). */
const PACK_KEYS: string[] = [
  ...(['ar', 'carbine', 'smg', 'shotgun', 'dmr', 'pistol'] as const).flatMap(w => ['fp', 'tp', 'far'].map(v => `gun.${w}.${v}`)),
  'rl.*', 'casing.*', 'dry', 'step.*', 'impact.*', 'glass.*', 'body.*',
];

export function createSfx(enabled: () => boolean, options: { ambience?: boolean; override?: Record<string, { sr: number; takes: number[][] }>; pack?: string | string[] | null } = {}): Sfx {
  const packUrls = options.pack === undefined ? PACK_URLS : options.pack === null ? [] : [options.pack].flat();
  let packDone: Promise<boolean> = Promise.resolve(false);
  let eng: Engine | null = null, dead = false;
  const levels = new Map(catalogue().map(d => [d.key, d.level]));
  // Sounds only the pack supplies take their family's level (reload beats like the synthesised ones, and so on).
  for (const w of ['ar', 'carbine', 'smg', 'dmr']) for (const b of ['release', 'out', 'in', 'seat', 'bolt']) levels.set(`rl.${w}.${b}`, -9);
  for (const k of ['casing.9mm', 'casing.556', 'casing.762']) levels.set(k, -22);
  levels.set('rl.fetch', -14); levels.set('drop.mag', -12); levels.set('glass.small', -10);
  const beds = new Map<Space, GainNode>();
  let bedSpace: Space | null = null, indoors = false;
  const ear = { x: 0, y: 1.6, z: 0, yaw: 0 };
  /** Set once the scene reports reinforcement stages itself. */
  let fortStages = false, lastImpact = -1;

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
    // With a pack configured the synthesised guns are not rendered (they would only be thrown away); if the pack
    // cannot be loaded they are rendered afterwards.
    const packKeys = packUrls.length ? PACK_KEYS : [];
    void eng.load(packKeys);
    // A failed pack renders everything it would have supplied; a loaded one covers every reload beat in reloads.ts,
    // and only the shotgun hull (no recording yet) is still synthesised.
    if (packUrls.length) {
      const e = eng;
      packDone = Promise.all(packUrls.map(u => e.loadPack(u))).then(async oks => {
        const ok = oks.every(Boolean);
        await e.fillUnpacked(ok ? ['impact.*'] : packKeys);
        return ok;
      });
    }
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
      eng.setOwnSpace(e.space);
      if (enabled() && options.ambience !== false) ambience(eng);
    },
    shot(w, at) {
      if (!at) {
        const e = play(`gun.${w}.fp`, 'own', null, { wet: 0.32, rate: 0.985 + Math.random() * 0.03, gain: 0.9 + Math.random() * 0.2 });
        if (!e || !eng) return;
        eng.duck('world', 4, 0.06); eng.duck('amb', 9, 0.18);
        // The spent case lands a moment later (not every one is heard in a burst); the shotgun ejects on the pump.
        if (w === 'shotgun') { play('rl.shotgun.pump', 'near', null, { delay: 0.3, gain: 0.8 }); play('casing.shell', 'near', null, { delay: 0.75 + Math.random() * 0.1, wet: 0.2 }); }
        else if (Math.random() < 0.35) play(CASING[w] && eng.packed.has(CASING[w]!) ? CASING[w]! : 'casing.brass', 'near', null, { delay: 0.35 + Math.random() * 0.25, wet: 0, rate: 0.95 + Math.random() * 0.1 });
        return;
      }
      // One buffer per shot (node budget): the near report up to ~38 m, the far one beyond; the engine's distance
      // low-pass and level carry the transition.
      const d = Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z), rate = 0.98 + Math.random() * 0.04;
      if (d < 38) play(`gun.${w}.tp`, 'world', at, { wet: 0.6, ref: 3.5, reach: 160, hrtf: d < 30, rate });
      else play(`gun.${w}.far`, 'world', at, { wet: 0.5, ref: 3.5, reach: 160, rate, gain: 1.4 });
    },
    step(surface, loud, at) {
      const floor = OLD_SURFACE[surface] ?? (surface as Floor), crouch = loud < 0.5, sprint = loud > 1;
      play(`step.${floor}`, at ? 'world' : 'near', at, { gain: Math.pow(loud, 1.2) * (at ? 1 : 0.55), wet: 0.25, ref: 2, reach: 30, hrtf: true, lowpass: crouch ? 2400 : undefined, rate: 0.96 + Math.random() * 0.08 });
      if (sprint || Math.random() < 0.3) play('gear', at ? 'world' : 'near', at, { gain: loud * (at ? 1 : 0.6), wet: 0.1, ref: 2, reach: 18 });
    },
    reload(seconds, at, w, empty) {
      // Each beat on the reloads.ts timeline plays its slot: a recorded take where the pack has one (the SMG borrows
      // the rifle's, a touch faster), else the synthesised beat. A little timing and level drift per beat, handling
      // detail between beats, and on an empty reload the magazine hits the floor, so it is never a clean row of clicks.
      const id = w ?? 'ar', cls = RELOAD_CLASS[id], beats = RELOADS[id][empty ? 'empty' : 'tactical'], e = start();
      if (!e) return;
      // A slot of this weapon's own, else its class's, else the rifle's; the fetch beat is the pouch and cloth.
      const slot = (b: string) => b === 'fetch' && e.packed.has('rl.fetch') ? 'rl.fetch'
        : [`rl.${id}.${b}`, `rl.${cls}.${b}`, ...(cls !== 'shotgun' && cls !== 'pistol' ? [`rl.rifle.${b}`] : [])].find(k => e.has(k)) ?? `rl.rifle.${b}`;
      const base = { wet: 0.2, ref: 2, reach: 22, hrtf: true } as const, bus: BusName = at ? 'world' : 'near', fast = cls === 'smg' && !e.packed.has('rl.smg.out') ? 1.08 : 1;
      let prev = -1;
      for (const b of beats) {
        const t = Math.max(0, seconds * b.at + (Math.random() - 0.5) * 0.03);
        play(slot(b.name), bus, at, { ...base, delay: t, gain: (at ? 1 : 0.8) * (0.85 + Math.random() * 0.3), rate: fast * (0.97 + Math.random() * 0.06) });
        if (prev >= 0 && t - prev > 0.25 && Math.random() < 0.6) play(e.packed.has('rl.detail') ? 'rl.detail' : 'gear', bus, at, { ...base, delay: prev + (t - prev) * (0.3 + Math.random() * 0.4), gain: 0.35 + Math.random() * 0.2, rate: 0.9 + Math.random() * 0.3 });
        // The magazine hitting the floor: a real metal drop when the pack has it, else a light synthetic one.
        if (empty && b.name === 'out' && cls !== 'shotgun') {
          const real = e.packed.has('drop.mag');
          play(real ? 'drop.mag' : 'drop.weapon', bus, at, { ...base, delay: t + 0.32 + Math.random() * 0.1, gain: real ? 0.5 : 0.18, rate: real ? 0.95 + Math.random() * 0.1 : 1.7, lowpass: real ? undefined : 9000 });
        }
        prev = t;
      }
    },
    melee(at) { play('melee', at ? 'world' : 'near', at, { wet: 0.2, ref: 2, reach: 20 }); },
    crumble(wood, big, at) {
      play(wood ? 'crumble.wood' : 'crumble.board', 'world', at, { gain: big ? 1 : 0.6, wet: 0.4, ref: 4, reach: 50 });
      if (big) play('debris', 'world', at, { delay: 0.12, wet: 0.4, ref: 4, reach: 40 });
    },
    boom(at, power) {
      const d = Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z);
      if (d < 32) play(power >= 1 ? 'boom.near' : 'boom.impact', 'world', at, { wet: 0.8, ref: 6, reach: 140, rate: 0.93 + Math.random() * 0.14 });
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
      // Until the scene reports reinforcement stages, play the whole sequence: lift, unfold, four anchors.
      if (reinforce && !fortStages) {
        play('rf.lift', 'world', at, { wet: 0.4, ref: 3, reach: 40 });
        play('rf.unfold', 'world', at, { delay: 0.6, wet: 0.4, ref: 3, reach: 40 });
        for (let i = 0; i < 4; i++) play('rf.anchor', 'world', at, { delay: 0.95 + i * 0.14, wet: 0.4, ref: 3, reach: 45, rate: 0.96 + Math.random() * 0.08 });
      }
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
    impact(material, at) {
      const mat = (IMPACT_MATS as string[]).includes(material) ? (material as ImpactMat) : 'concrete';
      play(`impact.${mat}`, 'world', at, { wet: 0, ref: 2, reach: 30, rate: 0.92 + Math.random() * 0.16 });
    },
    glass(kind, at) { play(kind === 'crack' ? 'glass.crack' : 'glass.shatter', 'world', at, { wet: 0.4, ref: 3, reach: 40 }); },
    breakPiece(material, family, state, at) {
      const f = family.toLowerCase(), kind: BreakKind = /shelf|rack|locker/.test(f) ? 'shelf' : /barrel|drum/.test(f) ? 'drum' : /crate|pallet|box/.test(f) ? 'crate'
        : material === 'metal' ? 'metal' : material === 'fabric' ? 'fabric' : 'wood';
      play(`break.${kind}`, 'world', at, { gain: state === 2 ? 1 : 0.7, wet: 0.4, ref: 3, reach: 40, rate: state === 2 ? 0.94 : 1.04 });
    },
    body(at, rest, floor) {
      const soft = floor === 'carpet' || floor === 'grass';
      // The fall lands a beat after the kill; the settle is reported when it happens.
      play(rest ? 'body.settle' : 'body.fall', 'world', at, { delay: rest ? 0 : 0.4, wet: 0.3, ref: 2, reach: rest ? 14 : 28, lowpass: soft ? 1400 : undefined, gain: soft ? 0.8 : 1 });
    },
    dropWeapon(at) { play('drop.weapon', 'world', at, { delay: 0.5, wet: 0.3, ref: 2, reach: 25, rate: 0.95 + Math.random() * 0.1 }); },
    flesh(at, armour) { play(armour ? 'armour' : 'flesh', 'world', at, { wet: 0.15, ref: 2, reach: 25, rate: 0.93 + Math.random() * 0.14 }); },
    reinforceStage(stage, at) { play(`rf.${stage}`, 'world', at, { wet: 0.4, ref: 3, reach: 45, rate: stage === 'anchor' ? 0.96 + Math.random() * 0.08 : 1 }); },
    cosmetic(e, p) {
      switch (e.k) {
        // No reverb send: an impact is short and small, and there is one per round (node budget, plan §5).
        case 'impact':
          // One impact sound per 50 ms at most: a round through a wall marks both faces, and in a burst they blend.
          if (eng && eng.ctx.currentTime - lastImpact < 0.05) break;
          if (eng) lastImpact = eng.ctx.currentTime;
          play(`impact.${(IMPACT_MATS as string[]).includes(e.mat) ? e.mat : 'concrete'}`, 'world', p, { gain: e.power >= 1 ? 1 : 0.6, wet: 0, ref: 2, reach: 30, rate: 0.92 + Math.random() * 0.16 });
          break;
        case 'glass': this.glass(e.stage, p); break;
        case 'piece': {
          const f = e.family, gain = e.state === 'wrecked' ? 1 : 0.65;
          // Small breakable dressing (screens, lights, mugs, bins, plants, fittings, loose items).
          const small = eng?.packed.has('glass.small') ? 'glass.small' : 'glass.shatter';
          if (f === 'screen' || f === 'fitting') { play(small, 'world', p, { gain: 0.8, wet: 0.3, ref: 2, reach: 30 }); play('impact.plastic', 'world', p, { gain: 0.5, ref: 2, reach: 25 }); break; }
          if (f === 'mug') { play(small, 'world', p, { gain: 0.6, rate: 0.8, wet: 0.3, ref: 2, reach: 25 }); break; }
          if (f === 'led') { play('impact.plastic', 'world', p, { gain: 0.6, rate: 1.3, ref: 2, reach: 20 }); break; }
          if (f === 'bin') { play('impact.metal', 'world', p, { gain: 0.8, rate: 0.85, ref: 2, reach: 25 }); break; }
          if (f === 'leaf') { play('impact.leaf', 'world', p, { ref: 2, reach: 18 }); break; }
          if (f === 'loose') { play('impact.cardboard', 'world', p, { ref: 2, reach: 20 }); break; }
          // A board, frame or shelf falling off a broken wall: a light wooden clatter on the floor.
          if (f === 'wallitem') { play('impact.wood', 'world', p, { gain: 0.8, rate: 0.7 + Math.random() * 0.15, wet: 0.3, ref: 2, reach: 25 }); break; }
          // Set pieces by family (render/setpieces-data.ts).
          const kind: BreakKind = /shelving|filing|cabinet|mapchest|vending|trolley|display/.test(f) ? 'shelf' : /drums|generator|skip/.test(f) ? 'drum'
            : /crates|pallets|materials|binstore|benchboxes/.test(f) ? 'crate' : /sofa|trailer/.test(f) ? 'fabric' : /lowwall|planter/.test(f) ? 'wood' : /island|deskpod|tableset|lowtable|sideboard/.test(f) ? 'wood' : 'metal';
          if (/lowwall|planter/.test(f)) { play('crumble.board', 'world', p, { gain, wet: 0.4, ref: 3, reach: 40, rate: 0.8 }); break; }
          play(`break.${kind}`, 'world', p, { gain, wet: 0.4, ref: 3, reach: 40, rate: e.state === 'wrecked' ? 0.94 : 1.04 });
          break;
        }
        case 'body': this.body(p, true); break;
        case 'fort':
          if (e.what === 'reinforce') {
            fortStages = true;
            if (e.stage === 'start') play('rf.lift', 'world', p, { wet: 0.4, ref: 3, reach: 40 });
            else if (e.stage === 'unfold') play('rf.unfold', 'world', p, { wet: 0.4, ref: 3, reach: 40 });
            else if (e.stage === 'anchor') play('rf.anchor', 'world', p, { wet: 0.4, ref: 3, reach: 45, rate: 0.96 + Math.random() * 0.08 });
            else play('impact.metal', 'world', p, { gain: 0.9, rate: 0.7, wet: 0.4, ref: 3, reach: 40 });
          }
          // Barricades: building plays its hammering and breaking plays the crumble from the game's own events.
          break;
      }
    },
    suspend() { if (eng && eng.ctx.state === 'running') void eng.ctx.suspend(); },
    resume() { if (eng && eng.ctx.state === 'suspended' && enabled()) void eng.ctx.resume(); },
    dispose() { dead = true; removeEventListener('pointerdown', early, true); removeEventListener('keydown', early, true); if (eng) { eng.dispose(); void eng.ctx.close().catch(() => {}); } eng = null; beds.clear(); },
    ready() {
      const e = start();
      if (!e) return Promise.resolve();
      return Promise.all([e.load(), packDone]).then(() => { for (const [k, v] of Object.entries(options.override ?? {})) e.replace(k, v.takes.map(t => Float32Array.from(t)), v.sr); });
    },
    stats() { return eng ? { voices: eng.activeVoices, hrtf: eng.activeHrtf, bytes: eng.bytes, loaded: eng.loaded, firstMs: eng.readyAt, state: eng.ctx.state } : { voices: 0, hrtf: 0, bytes: 0, loaded: 0, firstMs: -1, state: 'none' }; },
  };
}
