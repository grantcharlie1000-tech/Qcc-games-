/** Breachline tuning. Every number the simulation uses lives here so host, guests, bots and tests agree. */

export const TICK = 1 / 60;
/** Destructible surfaces are grids of square cells this many metres across. */
export const CELL = 0.25;
export const WALL_H = 3;
/** Soft walls are destructible up to this height; a solid header sits above. */
export const SOFT_H = 2.5;

export const ATK = 0, DEF = 1;
export type Role = 0 | 1;
export const ROLE_NAMES = ['Attackers', 'Defenders'] as const;
/** The two squads keep their colour and shape for the whole match; roles swap at half-time. */
export const SQUADS = [
  { name: 'Azure', color: '#3d8bf2', dark: '#1d4f9a', shape: '◆' },
  { name: 'Ember', color: '#f2793d', dark: '#9a431d', shape: '▲' },
] as const;

export const BODY = {
  radius: 0.3,
  stand: 1.78, crouch: 1.2,
  eyeStand: 1.62, eyeCrouch: 1.02,
  /** Ledges up to this height do not block walking (a row of wall debris). */
  step: 0.3,
  headR: 0.17,
  /** Sideways shift of the head and eyes at a full lean. */
  lean: 0.34,
} as const;

export const MOVE = {
  walk: 3.5, sprint: 5.1, crouch: 1.8, ads: 2.3,
  accel: 38, stanceRate: 7, leanRate: 7.5,
} as const;

export const ROUND = {
  prep: 20,
  action: 165,
  /** Seconds the uplink needs once armed. */
  fuse: 40,
  plant: 5, defuse: 6,
  reinforce: 3.5, barricade: 1.6, charge: 1.1,
  /** Pause between rounds. */
  end: 7,
  toWin: 4,
  /** Squads swap roles after this many rounds. */
  swapAfter: 3,
  maxTeam: 5,
} as const;

export type WeaponId = 'ar' | 'carbine' | 'smg' | 'shotgun' | 'dmr' | 'pistol';
export interface WeaponDef {
  id: WeaponId; name: string; cls: string;
  damage: number; pellets: number;
  /** Seconds between shots. */
  interval: number; auto: boolean;
  mag: number; reserve: number; reload: number;
  /** Cone half-angles in radians. */
  hip: number; ads: number; moveSpread: number; bloom: number;
  /** View kick per shot (radians). */
  recoil: number; recoilSide: number;
  /** Damage multiplier beyond [start, end] metres falls linearly to `min`. */
  falloff: readonly [number, number, number];
  zoom: number;
  /** Radius (m) of wall chewed away per projectile. */
  bite: number;
  speed: number;
}
const w = (d: WeaponDef) => d;
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ar: w({ id: 'ar', name: 'Marrow AR-5', cls: 'Assault rifle', damage: 34, pellets: 1, interval: 60 / 690, auto: true, mag: 30, reserve: 120, reload: 2.3, hip: 0.034, ads: 0.0035, moveSpread: 0.03, bloom: 0.007, recoil: 0.0125, recoilSide: 0.006, falloff: [22, 45, 0.7], zoom: 1.5, bite: 0.1, speed: 0.95 }),
  carbine: w({ id: 'carbine', name: 'Tern C8', cls: 'Carbine', damage: 31, pellets: 1, interval: 60 / 760, auto: true, mag: 30, reserve: 120, reload: 2.2, hip: 0.032, ads: 0.004, moveSpread: 0.028, bloom: 0.0065, recoil: 0.011, recoilSide: 0.007, falloff: [18, 40, 0.68], zoom: 1.4, bite: 0.1, speed: 0.97 }),
  smg: w({ id: 'smg', name: 'Wren-9', cls: 'Submachine gun', damage: 24, pellets: 1, interval: 60 / 920, auto: true, mag: 32, reserve: 128, reload: 2, hip: 0.026, ads: 0.0055, moveSpread: 0.018, bloom: 0.005, recoil: 0.0085, recoilSide: 0.006, falloff: [12, 30, 0.6], zoom: 1.3, bite: 0.09, speed: 1.03 }),
  shotgun: w({ id: 'shotgun', name: 'Halden 12', cls: 'Shotgun', damage: 15, pellets: 8, interval: 0.82, auto: false, mag: 7, reserve: 28, reload: 3, hip: 0.062, ads: 0.05, moveSpread: 0.012, bloom: 0, recoil: 0.05, recoilSide: 0.012, falloff: [5, 14, 0.25], zoom: 1.2, bite: 0.21, speed: 1 }),
  dmr: w({ id: 'dmr', name: 'Corvin DMR', cls: 'Marksman rifle', damage: 58, pellets: 1, interval: 0.21, auto: false, mag: 15, reserve: 60, reload: 2.6, hip: 0.05, ads: 0.0012, moveSpread: 0.04, bloom: 0.012, recoil: 0.028, recoilSide: 0.006, falloff: [40, 70, 0.85], zoom: 2.4, bite: 0.12, speed: 0.92 }),
  pistol: w({ id: 'pistol', name: 'P-11', cls: 'Sidearm', damage: 30, pellets: 1, interval: 0.14, auto: false, mag: 12, reserve: 48, reload: 1.6, hip: 0.02, ads: 0.006, moveSpread: 0.012, bloom: 0.011, recoil: 0.02, recoilSide: 0.006, falloff: [12, 28, 0.6], zoom: 1.2, bite: 0.08, speed: 1.05 }),
};
export const HEAD_MULT = 3.5;
/** Damage kept after passing through one destructible layer. */
export const PENETRATION = [0.62, 0.78] as const;
export const MAX_PENETRATIONS = 3;
/** A swing opens a hand-sized hole in a wall and knocks a wide chunk out of a barricade. */
export const MELEE = { range: 1.9, damage: 100, bite: 0.36, plank: 0.64, interval: 0.75 } as const;

export interface KitDef { id: string; name: string; blurb: string; primary: WeaponId; charges: number; grenades: number; reinforcements: number }
/** Three loadouts per role. Attackers throw frag grenades; defenders throw impact grenades that open walls. */
export const KITS: readonly [readonly KitDef[], readonly KitDef[]] = [
  [
    { id: 'breacher', name: 'Breacher', blurb: 'Shotgun that opens walls, three breach charges.', primary: 'shotgun', charges: 3, grenades: 1, reinforcements: 0 },
    { id: 'assault', name: 'Assault', blurb: 'Rifle for every range, two frag grenades.', primary: 'ar', charges: 1, grenades: 2, reinforcements: 0 },
    { id: 'marksman', name: 'Marksman', blurb: 'Hard-hitting semi-auto rifle with a long scope.', primary: 'dmr', charges: 1, grenades: 1, reinforcements: 0 },
  ],
  [
    { id: 'anchor', name: 'Anchor', blurb: 'Carbine and three reinforcements to lock the site.', primary: 'carbine', charges: 0, grenades: 1, reinforcements: 3 },
    { id: 'roamer', name: 'Roamer', blurb: 'Fast submachine gun, three impact grenades.', primary: 'smg', charges: 0, grenades: 3, reinforcements: 1 },
    { id: 'warden', name: 'Warden', blurb: 'Close-range shotgun and two reinforcements.', primary: 'shotgun', charges: 0, grenades: 2, reinforcements: 2 },
  ],
];

export const GRENADE = {
  frag: { fuse: 2.6, radius: 5.2, damage: 135, wall: 0.9, speed: 15 },
  impact: { fuse: 6, radius: 2.6, damage: 45, wall: 1.05, speed: 17 },
} as const;
export const CHARGE = { wall: 1.3, radius: 3.2, damage: 160, reach: 2.3, arm: 0.5 } as const;
export const INTERACT_REACH = 2.1;

export const BOT_SKILL = {
  recruit: { name: 'Recruit', react: 0.62, error: 0.085, burst: 0.5, turn: 5 },
  regular: { name: 'Regular', react: 0.4, error: 0.05, burst: 0.7, turn: 7 },
  veteran: { name: 'Veteran', react: 0.24, error: 0.028, burst: 0.9, turn: 9.5 },
} as const;
export type SkillId = keyof typeof BOT_SKILL;
export const SKILLS = Object.keys(BOT_SKILL) as SkillId[];

export const BOT_NAMES = ['Kestrel', 'Rook', 'Moss', 'Tallis', 'Ibex', 'Vale', 'Quill', 'Harrow', 'Sable', 'Finch', 'Onyx', 'Bracken'] as const;
