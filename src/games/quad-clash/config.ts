/** Quad Clash tuning: fixed step, body sizes, weapons, modes, streaks and bot skill. Plain data, no DOM or Three.js. */

export const STEP = 1 / 60;
export const SAVE_VERSION = 1;

export const BODY = {
  radius: 0.38,
  height: 1.7,
  eye: 1.52,
  speed: 6.4,
  accel: 70,
  airAccel: 16,
  friction: 14,
  jump: 7.6,
  gravity: 22,
  step: 0.56,
  maxHealth: 100,
  regenDelay: 4.5,
  regenRate: 16,
} as const;

/** Hit volumes measured from the feet: a body box and a head sphere. */
export const HITBOX = { bodyTop: 1.16, headY: 1.42, headR: 0.29 } as const;

export const RESPAWN_TIME = 3;
export const SPAWN_PROTECT = 2;
export const MAX_GRENADES = 3;
export const GRENADE = { fuse: 2.1, speed: 17, up: 4.2, radius: 5.2, damage: 115, bounce: 0.42, cooldown: 0.7 } as const;
export const PICKUP_RESPAWN = 18;
export const DROP_LIFETIME = 20;

export type WeaponId = 'bell' | 'detention' | 'hallpass' | 'firedrill' | 'recess' | 'valedictorian' | 'triple' | 'pencil';
export type PrimaryId = Exclude<WeaponId, 'pencil'>;

export interface Weapon {
  readonly id: WeaponId;
  readonly name: string;
  readonly role: string;
  readonly blurb: string;
  readonly kind: 'hitscan' | 'rocket';
  readonly damage: number;
  readonly head: number;
  /** Seconds between shots (between bursts for burst weapons). */
  readonly interval: number;
  readonly mag: number;
  /** Spare rounds carried at spawn. Infinity for the sidearm. */
  readonly reserve: number;
  readonly reload: number;
  /** Cone half-angle in radians: hip fire and aiming down sights. */
  readonly hip: number;
  readonly ads: number;
  readonly bloom: number;
  readonly pellets: number;
  readonly burst: number;
  readonly burstGap: number;
  readonly auto: boolean;
  readonly zoom: number;
  readonly speed: number;
  /** Damage falloff: full until start, linear to `min` multiplier at end. */
  readonly falloff: readonly [number, number, number];
  readonly range: number;
  readonly recoil: number;
  readonly splash?: number;
  readonly rocketSpeed?: number;
}

const W = (w: Weapon) => Object.freeze(w);
export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = Object.freeze({
  bell: W({ id: 'bell', name: 'Bell Ringer', role: 'Assault rifle', blurb: 'Full-auto all-rounder. Rings out across the quad.', kind: 'hitscan', damage: 22, head: 1.6, interval: 0.115, mag: 30, reserve: 120, reload: 1.8, hip: 0.03, ads: 0.007, bloom: 0.004, pellets: 1, burst: 1, burstGap: 0, auto: true, zoom: 1.45, speed: 1, falloff: [20, 55, 0.5], range: 120, recoil: 0.012 }),
  detention: W({ id: 'detention', name: 'Detention', role: 'Shotgun', blurb: 'Ten pellets of after-school regret. Brutal up close.', kind: 'hitscan', damage: 12, head: 1.4, interval: 0.8, mag: 6, reserve: 30, reload: 2.2, hip: 0.085, ads: 0.065, bloom: 0, pellets: 10, burst: 1, burstGap: 0, auto: false, zoom: 1.15, speed: 1.04, falloff: [7, 22, 0.25], range: 40, recoil: 0.05 }),
  hallpass: W({ id: 'hallpass', name: 'Hall Pass', role: 'Marksman rifle', blurb: 'Semi-auto precision. Two body shots and a tap.', kind: 'hitscan', damage: 42, head: 2, interval: 0.28, mag: 12, reserve: 48, reload: 1.9, hip: 0.02, ads: 0.0025, bloom: 0.008, pellets: 1, burst: 1, burstGap: 0, auto: false, zoom: 2, speed: 1, falloff: [40, 90, 0.75], range: 140, recoil: 0.022 }),
  firedrill: W({ id: 'firedrill', name: 'Fire Drill', role: 'Launcher', blurb: 'Everybody out! Splash damage clears corners.', kind: 'rocket', damage: 120, head: 1, interval: 1.15, mag: 3, reserve: 9, reload: 2.6, hip: 0.004, ads: 0.002, bloom: 0, pellets: 1, burst: 1, burstGap: 0, auto: false, zoom: 1.3, speed: 0.94, falloff: [0, 1, 1], range: 120, recoil: 0.06, splash: 4.2, rocketSpeed: 34 }),
  recess: W({ id: 'recess', name: 'Recess', role: 'SMG', blurb: 'Fast hands, fast feet. Wins the hallway sprint.', kind: 'hitscan', damage: 15, head: 1.5, interval: 0.068, mag: 36, reserve: 144, reload: 1.5, hip: 0.04, ads: 0.02, bloom: 0.003, pellets: 1, burst: 1, burstGap: 0, auto: true, zoom: 1.25, speed: 1.1, falloff: [14, 40, 0.55], range: 80, recoil: 0.009 }),
  valedictorian: W({ id: 'valedictorian', name: 'Valedictorian', role: 'Sniper', blurb: 'Top of the class. One clean headshot ends it.', kind: 'hitscan', damage: 92, head: 2.4, interval: 1.1, mag: 5, reserve: 20, reload: 2.4, hip: 0.09, ads: 0, bloom: 0, pellets: 1, burst: 1, burstGap: 0, auto: false, zoom: 4, speed: 0.9, falloff: [80, 160, 0.9], range: 200, recoil: 0.07 }),
  triple: W({ id: 'triple', name: 'Triple Period', role: 'Burst rifle', blurb: 'Three-round bursts. Back-to-back-to-back.', kind: 'hitscan', damage: 27, head: 1.7, interval: 0.42, mag: 24, reserve: 96, reload: 2, hip: 0.025, ads: 0.004, bloom: 0.003, pellets: 1, burst: 3, burstGap: 0.065, auto: true, zoom: 1.6, speed: 1, falloff: [28, 70, 0.65], range: 130, recoil: 0.015 }),
  pencil: W({ id: 'pencil', name: 'Pencil Pusher', role: 'Sidearm', blurb: 'Never runs out. Always sharp.', kind: 'hitscan', damage: 24, head: 1.6, interval: 0.2, mag: 10, reserve: Infinity, reload: 1.25, hip: 0.025, ads: 0.01, bloom: 0.01, pellets: 1, burst: 1, burstGap: 0, auto: false, zoom: 1.2, speed: 1.05, falloff: [15, 45, 0.55], range: 90, recoil: 0.02 }),
});
export const PRIMARIES: readonly PrimaryId[] = ['bell', 'detention', 'hallpass', 'firedrill', 'recess', 'valedictorian', 'triple'];
export const isPrimary = (v: unknown): v is PrimaryId => typeof v === 'string' && (PRIMARIES as readonly string[]).includes(v);

export type ModeId = 'brawl' | 'house' | 'quad';
export interface Mode { readonly id: ModeId; readonly name: string; readonly short: string; readonly teams: boolean; readonly limit: number; readonly duration: number; readonly blurb: string }
export const MODES: Readonly<Record<ModeId, Mode>> = Object.freeze({
  brawl: { id: 'brawl', name: 'Lunchtime Brawl', short: 'Brawl', teams: false, limit: 25, duration: 300, blurb: 'Free-for-all. First to 25 eliminations wins.' },
  house: { id: 'house', name: 'House Match', short: 'House', teams: true, limit: 40, duration: 300, blurb: 'Kōwhai House against Moana House. First house to 40.' },
  quad: { id: 'quad', name: 'Hold the Quad', short: 'Hold', teams: true, limit: 60, duration: 300, blurb: 'Outnumber the other house in the marked zone to score. It moves every minute.' },
});
export const MODE_IDS: readonly ModeId[] = ['brawl', 'house', 'quad'];

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export interface BotSkill { readonly react: number; readonly aimError: number; readonly turn: number; readonly headChance: number; readonly fireTolerance: number; readonly grenadeChance: number }
export const SKILL: Readonly<Record<Difficulty, BotSkill>> = Object.freeze({
  easy: { react: 0.8, aimError: 0.13, turn: 3, headChance: 0.03, fireTolerance: 0.16, grenadeChance: 0.03 },
  normal: { react: 0.55, aimError: 0.085, turn: 4.6, headChance: 0.1, fireTolerance: 0.1, grenadeChance: 0.06 },
  hard: { react: 0.32, aimError: 0.05, turn: 7, headChance: 0.22, fireTolerance: 0.07, grenadeChance: 0.1 },
});

/** House colours. Kōwhai (gold) and Moana (deep blue) differ strongly in lightness as well as hue. */
export const HOUSES = [
  { name: 'Kōwhai', color: 0xffc23d, css: '#ffc23d', mark: '▲' },
  { name: 'Moana', color: 0x2f6fe0, css: '#4d8bff', mark: '●' },
] as const;
/** Free-for-all paint jobs, one per fighter slot. */
export const FFA_COLORS = [0xffc23d, 0xff5a5f, 0x37c98b, 0x8b6cff, 0xff8a3d, 0x3cc4e6, 0xf06bc4, 0x9ad14b] as const;

export interface Streak { readonly kills: number; readonly name: string; readonly text: string }
export const STREAKS: readonly Streak[] = [
  { kills: 3, name: 'Merit Award', text: 'Ammo and a grenade restocked' },
  { kills: 5, name: 'Prefect Shield', text: 'Half damage for 15 seconds' },
  { kills: 8, name: 'Principal’s Pass', text: 'Faster feet and reloads for 15 seconds' },
];
export const SHIELD_TIME = 15;
export const BOOST_TIME = 15;

export const POINTS = { kill: 100, head: 25, streak: 50, zone: 5, win: 500, finish: 100 } as const;

export const BOT_NAMES = ['Hall Monitor', 'Pop Quiz', 'Chalk Dust', 'Locker Lou', 'Tardy Tom', 'Field Trip', 'Homework Hal', 'Gym Kit', 'Lunch Line', 'Bell Hop', 'Lab Coat', 'Prefect Pat', 'Recess Rex', 'Exam Season', 'Sports Day'] as const;
