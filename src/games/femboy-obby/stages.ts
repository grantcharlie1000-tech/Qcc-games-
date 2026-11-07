/** The frosthop-v2 course: 30 authored stages in six zones. Forward is -z. Every surface is an axis-aligned box whose
 * visible top matches its collider; decorations never collide. Gaps were tuned against the measured jump envelope
 * (a running jump clears 4 units edge to edge between equal heights; 5.4 does not): early gaps 1.6–2.2, later 2.4–3.0. */
import { assembleCourse } from './course';
import type { Checkpoint, Course, Decor, Motion, Pendulum, Snowball, Solid, StageInfo, Star, Surface, Sweeper, ZoneId, ZoneInfo } from './types';

export const PAL = {
  snow: 0xf7f6f2, blush: 0xf2afc8, pink: 0xe98aae, rose: 0xd9668f, maroon: 0x6e203c, mint: 0xb9dfc9, mintDeep: 0x7fc4a4,
  lilac: 0xc8b8e8, lilacDeep: 0x9b86cf, ice: 0xbfd9ee, iceDeep: 0x8fbbe0, gold: 0xf3c768, ink: 0x263248, cream: 0xfbefe0,
  candy: 0xe2486a, wood: 0xc49a74, sky: 0xa9c8f2,
} as const;

export const ZONES: readonly ZoneInfo[] = [
  { id: 'giftwrap', name: 'Giftwrap Gardens', sky: 0xb7d3f5, fog: 0xd9e6f7, ground: 0xe9eef8 },
  { id: 'candycane', name: 'Candy Cane Catwalk', sky: 0xc3c9f2, fog: 0xe3dcf3, ground: 0xf1e6f0 },
  { id: 'knit', name: 'Cozy Knit Workshop', sky: 0xc8bde8, fog: 0xe4d9ee, ground: 0xeae0ef },
  { id: 'rink', name: 'Peppermint Ice Rink', sky: 0xaed4ef, fog: 0xd6eaf5, ground: 0xe4f1f8 },
  { id: 'skyway', name: 'Ornament Skyway', sky: 0x9fb7ec, fog: 0xcfd9f4, ground: 0xdfe5f6 },
  { id: 'northpole', name: 'North Pole Runway', sky: 0xb4bfe6, fog: 0xdcdff2, ground: 0xeceef7 },
];

type Dir = 'fwd' | 'right' | 'left';
interface Next {
  dir?: Dir; gap: number; w: number; d: number; h?: number; rise?: number; dx?: number; dz?: number;
  surface?: Surface; color?: number; accent?: number; motion?: Partial<Motion> & { period: number }; belt?: { x: number; z: number };
  blink?: { on: number; off: number; phase: number };
  through?: boolean; off?: boolean; from?: number;
}

const ZONE_LOOK: Record<ZoneId, { surface: Surface; color: number; accent: number }> = {
  giftwrap: { surface: 'gift', color: PAL.blush, accent: PAL.maroon },
  candycane: { surface: 'candy', color: PAL.cream, accent: PAL.candy },
  knit: { surface: 'knit', color: PAL.lilac, accent: PAL.mintDeep },
  rink: { surface: 'snow', color: PAL.snow, accent: PAL.mintDeep },
  skyway: { surface: 'ornament', color: PAL.lilac, accent: PAL.gold },
  northpole: { surface: 'roof', color: PAL.snow, accent: PAL.maroon },
};

class Builder {
  solids: Solid[] = [];
  checkpoints: Checkpoint[] = [];
  sweepers: Sweeper[] = [];
  snowballs: Snowball[] = [];
  pendulums: Pendulum[] = [];
  stars: Star[] = [];
  stages: StageInfo[] = [];
  decor: Decor[] = [];
  stage = 0;
  zone: ZoneId = 'giftwrap';
  route: { id: number; through?: boolean }[] = [];
  cursor = 0;

  add(s: Omit<Solid, 'id' | 'stage'> & { stage?: number }): number {
    const id = this.solids.length;
    this.solids.push({ ...s, id, stage: s.stage ?? this.stage });
    return id;
  }

  top(id: number): number { const s = this.solids[id]; return s.y + s.hy; }

  next(o: Next): number {
    const from = this.solids[o.from ?? this.cursor];
    const look = ZONE_LOOK[this.zone];
    const surface = o.surface ?? look.surface;
    const h = o.h ?? (surface === 'gift' ? Math.min(4, Math.min(o.w, o.d)) : surface === 'ornament' || surface === 'blink' ? 0.5 : 0.9);
    const dir = o.dir ?? 'fwd';
    let x: number, z: number;
    if (dir === 'fwd') { z = from.z - from.hz - o.gap - o.d / 2; x = from.x + (o.dx ?? 0); }
    else { const sgn = dir === 'right' ? 1 : -1; x = from.x + sgn * (from.hx + o.gap + o.w / 2); z = from.z + (o.dz ?? 0); }
    const top = from.y + from.hy + (o.rise ?? 0);
    const motion = o.motion ? { dx: 0, dy: 0, dz: 0, phase: 0, dwell: 0.8, ...o.motion } : undefined;
    const id = this.add({ surface, x, y: top - h / 2, z, hx: o.w / 2, hy: h / 2, hz: o.d / 2, motion, belt: o.belt, blink: o.blink, color: o.color ?? defaultColor(surface, look.color), accent: o.accent ?? defaultAccent(surface, look.accent) });
    // A spring never holds you, so it is always passed through.
    if (!o.off) { this.route.push(o.through || surface === 'spring' ? { id, through: true } : { id }); this.cursor = id; }
    return id;
  }

  /** Where the cursor solid's far end will be after its motion (for gaps measured from a moving solid's end). */
  checkpoint(o: Partial<Next> = {}): number {
    const id = this.next({ gap: o.gap ?? 1.8, w: o.w ?? 7, d: o.d ?? 7, h: 1.4, rise: o.rise, dx: o.dx, dir: o.dir, dz: o.dz, surface: 'checkpoint', color: PAL.snow, accent: PAL.mintDeep });
    this.posts(id);
    const s = this.solids[id];
    this.checkpoints.push({ index: this.stage, x: s.x, y: s.y + s.hy, z: s.z, yaw: 0, solid: id });
    return id;
  }

  /** Low lantern posts at the pad corners: real colliders that match their visible posts. */
  posts(id: number): void {
    const s = this.solids[id], top = s.y + s.hy;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // The Kenney lantern model is 1.74 tall at scale 1; at 0.92 it matches this 1.6-unit post collider.
      this.add({ surface: 'post', x: s.x + sx * (s.hx - 0.4), y: top + 0.8, z: s.z + sz * (s.hz - 0.4), hx: 0.14, hy: 0.8, hz: 0.14, color: PAL.ink, accent: PAL.gold });
      this.decor.push({ kind: 'lamp', x: s.x + sx * (s.hx - 0.4), y: top, z: s.z + sz * (s.hz - 0.4), s: 0.92, r: 0, color: PAL.gold });
    }
  }

  begin(index: number, zone: ZoneId, name: string): void { this.stage = index; this.zone = zone; this.route = []; }

  end(name: string): void {
    this.stages.push({ index: this.stage, zone: this.zone, name, checkpoint: this.stage, route: this.route });
  }

  /** The stage's optional star, floating `dy` above a solid. */
  star(id: number, dy = 1.3, ox = 0, oz = 0): void {
    const s = this.solids[id];
    this.stars.push({ id: `frosthop-v1:stage-${String(this.stage).padStart(2, '0')}:star`, stage: this.stage, x: s.x + ox, y: s.y + s.hy + dy, z: s.z + oz });
  }

  sweeper(on: number, o: { length: number; omega: number; phase?: number; arms?: 1 | 2 | 3 | 4; height?: number; ox?: number; oz?: number }): void {
    const s = this.solids[on], top = s.y + s.hy, x = s.x + (o.ox ?? 0), z = s.z + (o.oz ?? 0);
    // A hub post at the pivot collides exactly like it looks.
    this.add({ surface: 'candy', x, y: top + 0.75, z, hx: 0.45, hy: 0.75, hz: 0.45, color: PAL.maroon, accent: PAL.cream });
    this.sweepers.push({ id: this.sweepers.length, stage: this.stage, x, y: top + (o.height ?? 0.8), z, length: o.length, radius: 0.32, omega: o.omega, phase: o.phase ?? 0, arms: o.arms ?? 1, floor: top });
  }

  /** A kill brick sitting on a solid's top, offset from its centre. Never part of the route. */
  spike(on: number, o: { ox?: number; oz?: number; w: number; d: number; h?: number; motion?: Partial<Motion> & { period: number } }): number {
    const s = this.solids[on], top = s.y + s.hy, h = o.h ?? 0.55;
    const motion = o.motion ? { dx: 0, dy: 0, dz: 0, phase: 0, dwell: 0.4, ...o.motion } : undefined;
    return this.add({ surface: 'spike', x: s.x + (o.ox ?? 0), y: top + h / 2, z: s.z + (o.oz ?? 0), hx: o.w / 2, hy: h / 2, hz: o.d / 2, motion, color: PAL.candy, accent: PAL.maroon });
  }

  /** A full-width kill-brick strip across a forward path (jump it). */
  strip(on: number, oz: number, d = 0.8, h = 0.55): number { return this.spike(on, { oz, w: this.solids[on].hx * 2, d, h }); }

  /** A bauble pendulum swinging across a solid; its lowest point is at chest height above the top. */
  pendulum(on: number, o: { ox?: number; oz?: number; length?: number; amp?: number; omega: number; phase?: number; axis?: 'x' | 'z'; radius?: number }): void {
    const s = this.solids[on], top = s.y + s.hy, length = o.length ?? 4.5;
    this.pendulums.push({ id: this.pendulums.length, stage: this.stage, x: s.x + (o.ox ?? 0), y: top + 1.0 + length, z: s.z + (o.oz ?? 0), length, radius: o.radius ?? 0.75, amp: o.amp ?? 0.95, omega: o.omega, phase: o.phase ?? 0, axis: o.axis ?? 'x' });
  }

  snowball(on: number, oz: number, o: { travel: number; gap: number; phase: number; span?: number }): void {
    const s = this.solids[on], top = s.y + s.hy, span = o.span ?? 7;
    this.snowballs.push({ id: this.snowballs.length, stage: this.stage, ax: s.x - span, ay: top + 0.65, az: s.z + oz, bx: s.x + span, by: top + 0.65, bz: s.z + oz, radius: 0.65, travel: o.travel, gap: o.gap, phase: o.phase });
  }

  deco(kind: Decor['kind'], x: number, y: number, z: number, s = 1, r = 0, color: number = PAL.blush): void { this.decor.push({ kind, x, y, z, s, r, color }); }
}

function defaultColor(surface: Surface, zone: number): number {
  switch (surface) {
    case 'ice': return PAL.ice;
    case 'conveyor': return PAL.lilacDeep;
    case 'crumble': return PAL.wood;
    case 'spring': return PAL.mint;
    case 'lift': case 'tray': return PAL.pink;
    case 'ribbon': return PAL.blush;
    case 'blink': return PAL.gold;
    default: return zone;
  }
}
function defaultAccent(surface: Surface, zone: number): number {
  switch (surface) {
    case 'ice': return PAL.snow;
    case 'conveyor': return PAL.cream;
    case 'crumble': return PAL.maroon;
    case 'spring': return PAL.gold;
    case 'lift': case 'tray': return PAL.maroon;
    case 'ribbon': return PAL.maroon;
    case 'blink': return PAL.lilacDeep;
    default: return zone;
  }
}

/** Scenery beside the route: snowy trees, gifts, canes and houses on islands far below or well to the side. */
function scenery(b: Builder): void {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const kinds: Record<ZoneId, Decor['kind'][]> = {
    giftwrap: ['tree', 'gift', 'gift', 'tree'], candycane: ['cane', 'tree', 'cane', 'gift'], knit: ['yarn', 'tree', 'gift', 'snowman'],
    rink: ['tree', 'snowman', 'tree', 'house'], skyway: ['bauble', 'bauble', 'tree', 'flag'], northpole: ['house', 'tree', 'chimney', 'tree'],
  };
  for (const st of b.stages) {
    const ids = st.route.map(r => r.id);
    const zs = ids.map(id => b.solids[id].z), xs = ids.map(id => b.solids[id].x), tops = ids.map(id => b.top(id));
    const z0 = Math.max(...zs), z1 = Math.min(...zs), cx = xs.reduce((a, v) => a + v, 0) / xs.length, low = Math.min(...tops);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, z = z0 + (z1 - z0) * (i / 3);
      const x = cx + side * (13 + rnd() * 10), y = low - 9 - rnd() * 5;
      const list = kinds[st.zone];
      b.deco('island', x, y, z, 1 + rnd() * 0.6, rnd() * 6.28, ZONES.find(zz => zz.id === st.zone)!.ground); // snowy island
      b.deco(list[i % list.length], x, y, z, 1 + rnd() * 0.5, rnd() * 6.28, [PAL.blush, PAL.lilac, PAL.mint, PAL.pink][i % 4]);
      if (i % 2 === 0) b.deco('tree', x + side * 2.5, y, z + 2, 0.8, 0, PAL.mint);
    }
  }
}

export function buildCourse(): Course {
  const b = new Builder();
  // Start plaza (checkpoint 0). The start line is 2 units ahead of the spawn.
  const plaza = b.add({ stage: 0, surface: 'checkpoint', x: 0, y: -0.7, z: 0, hx: 4.5, hy: 0.7, hz: 5.5, color: PAL.snow, accent: PAL.mintDeep });
  b.posts(plaza);
  b.checkpoints.push({ index: 0, x: 0, y: 0, z: 3, yaw: 0, solid: plaza });
  b.cursor = plaza;
  b.deco('banner', 0, 0, 1, 1, 0, PAL.gold); // start banner over the start line (decor sits above head height)
  b.deco('tree', -6.5, -9, 0, 1.4, 0, PAL.mint);

  // Difficulty: gaps run 2.2–3.4 against a 4-unit running reach, landings shrink to 2–2.6 units, and every stage after
  // the opener mixes at least two obstacles. New families (kill bricks, fairy-light panels, pendulums, jump-rope and
  // multi-arm sweepers, pushers, sideways belts, pistons) are each introduced alone before they are combined.
  const R = (id: number) => b.solids[id];

  // ---------- Giftwrap Gardens ----------
  b.begin(1, 'giftwrap', 'Present Hops');
  b.next({ gap: 2.2, w: 3, d: 3 });
  b.next({ gap: 2.4, w: 2.6, d: 2.6, dx: 0.4, color: PAL.cream });
  const g3 = b.next({ gap: 2.4, w: 2.6, d: 2.6, dx: -0.4 });
  b.next({ gap: 2.6, w: 2.4, d: 2.4, color: PAL.lilac });
  b.next({ gap: 2.6, w: 2.4, d: 2.4, dx: 0.3 });
  b.checkpoint({ gap: 2.4 });
  b.star(b.next({ from: g3, dir: 'right', gap: 3.0, w: 1.6, d: 1.6, h: 2.4, rise: 0.4, off: true, color: PAL.lilac }));
  b.end('Present Hops');

  b.begin(2, 'giftwrap', 'Ribbon Steps');
  b.next({ gap: 1.8, w: 2.4, d: 2.2, rise: 0.8, color: PAL.cream });
  b.next({ gap: 2.0, w: 2.2, d: 2.2, rise: 0.8, dx: 1.2 });
  b.next({ gap: 2.0, w: 2.2, d: 2.2, rise: 0.8, dx: -1.2, color: PAL.cream });
  const rb = b.next({ gap: 2.4, w: 1.0, d: 8, h: 0.6, surface: 'ribbon' });
  b.next({ gap: 2.6, w: 2.2, d: 2.2, rise: 0.6 });
  b.next({ gap: 2.6, w: 0.9, d: 6, h: 0.6, surface: 'ribbon', dx: 0.6 });
  b.checkpoint({ gap: 2.4 });
  b.star(b.next({ from: rb, dir: 'right', gap: 3.0, w: 1.4, d: 1.4, h: 1.4, rise: 0.6, off: true, color: PAL.mint }));
  b.end('Ribbon Steps');

  b.begin(3, 'giftwrap', 'Hot Cocoa Hops');
  const slab = b.next({ gap: 2.2, w: 4, d: 13, h: 1.2, surface: 'snow', color: PAL.blush, accent: PAL.snow });
  b.strip(slab, 3, 1.0);
  b.strip(slab, -2.5, 1.2, 0.7);
  const sb = b.next({ gap: 2.6, w: 5, d: 14, h: 1.2, surface: 'snow', color: PAL.cream, accent: PAL.snow });
  b.spike(sb, { ox: -1.25, oz: 4.5, w: 2.5, d: 1.2 });
  b.spike(sb, { ox: 1.25, oz: -1.0, w: 2.5, d: 1.2 });
  b.next({ gap: 2.8, w: 2.4, d: 2.4 });
  b.checkpoint({ gap: 2.6 });
  b.star(b.next({ from: sb, dir: 'left', gap: 2.8, w: 1.6, d: 1.6, h: 1.2, rise: 1.0, off: true, surface: 'snow', color: PAL.lilac, accent: PAL.snow }));
  b.end('Hot Cocoa Hops');

  b.begin(4, 'giftwrap', 'Snowflake Drift');
  b.next({ gap: 2.0, w: 3, d: 3, surface: 'tray', h: 0.8, motion: { dx: 6, period: 4.5, dwell: 0.6 } });
  const sd = b.next({ gap: 2.2, w: 3, d: 3, h: 1.2, dx: 6, surface: 'snow', color: PAL.ice, accent: PAL.snow });
  b.next({ gap: 2.0, w: 2.6, d: 2.6, surface: 'tray', h: 0.8, motion: { dx: -6, period: 4, dwell: 0.5 } });
  b.next({ gap: 2.2, w: 3, d: 3, h: 1.2, dx: -6, surface: 'snow', color: PAL.ice, accent: PAL.snow });
  b.next({ gap: 1.6, w: 2.6, d: 2.6, surface: 'tray', h: 0.8, motion: { dz: -6, period: 4.5, dwell: 0.6 } });
  b.checkpoint({ gap: 7.6 });
  b.star(b.next({ from: sd, dir: 'right', gap: 3.0, w: 1.6, d: 1.6, h: 1.2, off: true, surface: 'snow', color: PAL.lilac, accent: PAL.snow }));
  b.end('Snowflake Drift');

  b.begin(5, 'giftwrap', 'Gift Garden Finale');
  b.next({ gap: 2.6, w: 2.6, d: 2.6 });
  const gs = b.next({ gap: 2.8, w: 4, d: 10, h: 1.2, surface: 'snow', color: PAL.blush, accent: PAL.snow });
  b.spike(gs, { ox: -1.4, oz: 2.2, w: 1.2, d: 1.2, h: 0.9, motion: { dx: 2.8, period: 1.8, dwell: 0.15 } });
  b.spike(gs, { ox: 1.4, oz: -2.2, w: 1.2, d: 1.2, h: 0.9, motion: { dx: -2.8, period: 1.8, dwell: 0.15, phase: 0.6 } });
  b.next({ gap: 2.4, w: 2.6, d: 2.6, surface: 'tray', h: 0.8, motion: { dx: 5, period: 3.6, dwell: 0.4 } });
  b.next({ gap: 2.6, w: 2.6, d: 2.6, dx: 5 });
  const fb = b.next({ gap: 2.8, w: 1.0, d: 7, h: 0.6, surface: 'ribbon' });
  b.strip(fb, 0, 0.7);
  b.checkpoint({ gap: 2.6, w: 9, d: 9 });
  b.star(gs, 1.7, 1.2, 0);
  b.end('Gift Garden Finale');

  // ---------- Candy Cane Catwalk ----------
  b.begin(6, 'candycane', 'Peppermint Sweepers');
  const sw1 = b.next({ gap: 2.0, w: 9, d: 9, dx: 3.2, through: true });
  b.sweeper(sw1, { length: 4.2, omega: -2.6, arms: 2 });
  b.next({ gap: 2.4, w: 2.4, d: 2.4, dx: -3.2, color: PAL.blush });
  const sw2 = b.next({ gap: 2.4, w: 9, d: 9, dx: -3.2, through: true });
  b.sweeper(sw2, { length: 4.2, omega: 3.0, arms: 2, phase: 1 });
  b.checkpoint({ gap: 2.4, dx: 3.2 });
  b.star(b.next({ from: sw2, dir: 'left', gap: 2.8, w: 1.8, d: 1.8, off: true, color: PAL.blush }));
  b.end('Peppermint Sweepers');

  b.begin(7, 'candycane', 'Candy Cane Balance');
  const cb1 = b.next({ gap: 2.4, w: 0.9, d: 11, h: 0.7 });
  b.strip(cb1, 1.5, 0.6);
  const cb2 = b.next({ gap: 2.6, w: 0.9, d: 9, h: 0.7, dx: 0.3 });
  b.strip(cb2, 0.5, 0.6);
  b.next({ gap: 2.6, w: 0.9, d: 7, h: 0.7, dx: -0.3 });
  const cb4 = b.next({ gap: 2.6, w: 0.8, d: 14, h: 0.7, dx: 0.2 });
  b.strip(cb4, 4, 0.6);
  b.strip(cb4, -1.5, 0.6);
  b.checkpoint({ gap: 2.6 });
  b.star(b.next({ from: cb2, dir: 'left', gap: 2.8, w: 1.4, d: 1.4, rise: 0.6, off: true, color: PAL.blush }));
  b.deco('cane', R(cb1).x + 2.2, b.top(cb1) - 6, R(cb1).z, 2.2, 0, PAL.candy);
  b.end('Candy Cane Balance');

  b.begin(8, 'candycane', 'Jump Rope');
  const jr1 = b.next({ gap: 2.2, w: 9, d: 9, dx: 3.2, through: true });
  b.sweeper(jr1, { length: 4.3, omega: 2.2, arms: 2, height: 0.35 });
  b.next({ gap: 2.4, w: 2.4, d: 2.4, dx: -3.2, color: PAL.blush });
  const jr2 = b.next({ gap: 2.4, w: 9, d: 9, dx: -3.2, through: true });
  b.sweeper(jr2, { length: 4.3, omega: -1.8, arms: 3, height: 0.35, phase: 0.5 });
  b.checkpoint({ gap: 2.4, dx: 3.2 });
  b.star(jr2, 1.4, -2, 2);
  b.end('Jump Rope');

  b.begin(9, 'candycane', 'Bauble Swing');
  const bs1 = b.next({ gap: 2.4, w: 1.6, d: 12, h: 0.7 });
  b.pendulum(bs1, { oz: 3.6, omega: 2.4 });
  b.pendulum(bs1, { oz: 0, omega: 2.0, phase: 1.2 });
  b.pendulum(bs1, { oz: -3.6, omega: 2.6, phase: 2.5 });
  b.next({ gap: 2.6, w: 2.6, d: 2.6, color: PAL.blush });
  const bs2 = b.next({ gap: 2.6, w: 1.4, d: 8, h: 0.7 });
  b.pendulum(bs2, { oz: 1.8, omega: 2.8 });
  b.pendulum(bs2, { oz: -1.8, omega: 2.8, phase: 1.6 });
  b.checkpoint({ gap: 2.4 });
  b.star(bs1, 1.4);
  b.end('Bauble Swing');

  b.begin(10, 'candycane', 'Candy Crossing');
  b.next({ gap: 2.6, w: 2.4, d: 2.4 });
  const cc = b.next({ gap: 2.4, w: 10, d: 10, dx: 3, through: true });
  b.sweeper(cc, { length: 4.7, omega: -1.7, arms: 4 });
  const ccb = b.next({ gap: 2.4, w: 1.4, d: 8, h: 0.7, dx: -3 });
  b.pendulum(ccb, { oz: 1.6, omega: 2.6 });
  b.pendulum(ccb, { oz: -2.0, omega: 2.6, phase: 1.6 });
  const cce = b.next({ gap: 2.8, w: 2.6, d: 6, color: PAL.blush });
  b.strip(cce, 0.8, 0.8);
  b.checkpoint({ gap: 2.6 });
  b.star(b.next({ from: cc, dir: 'right', gap: 2.6, w: 1.8, d: 1.8, off: true, color: PAL.blush }));
  b.end('Candy Crossing');

  // ---------- Cozy Knit Workshop ----------
  b.begin(11, 'knit', 'Gift Conveyor');
  b.next({ gap: 2.0, w: 4, d: 12, surface: 'conveyor', belt: { x: 0, z: 3.4 }, through: true });
  b.next({ gap: 2.4, w: 2.2, d: 2.2 });
  const gc2 = b.next({ gap: 2.4, w: 2.4, d: 8, surface: 'conveyor', belt: { x: 2.2, z: 0 }, through: true });
  b.next({ gap: 2.4, w: 2.2, d: 2.2 });
  b.next({ gap: 2.4, w: 3, d: 6, surface: 'conveyor', belt: { x: -1.8, z: 2.6 }, through: true });
  b.checkpoint({ gap: 2.4 });
  b.star(gc2, 1.3, -0.6, -2.5);
  b.end('Gift Conveyor');

  b.begin(12, 'knit', 'Stocking Shuttle');
  b.next({ gap: 2.0, w: 3, d: 3, surface: 'tray', h: 0.8, motion: { dx: 7, period: 5, dwell: 0.6 } });
  const ss2 = b.next({ gap: 2.2, w: 3, d: 3, dx: 7, surface: 'tray', h: 0.8, motion: { dx: -7, period: 5, dwell: 0.6, phase: 2.5 } });
  b.next({ gap: 2.0, w: 2.6, d: 2.6, dx: -7, surface: 'lift', h: 1, motion: { dy: 3, period: 4, dwell: 0.5 } });
  b.next({ gap: 2.0, w: 2.6, d: 2.6, rise: 3, surface: 'tray', h: 0.8, motion: { dz: -5, period: 4.4, dwell: 0.5 } });
  b.checkpoint({ gap: 6.6 });
  b.star(b.next({ from: ss2, dir: 'left', gap: 2.6, w: 1.6, d: 1.6, off: true, color: PAL.mint }));
  b.end('Stocking Shuttle');

  b.begin(13, 'knit', 'Fairy Lights');
  for (let i = 0; i < 6; i++) b.next({ gap: 2.2, w: 2.6, d: 2.6, dx: i % 2 ? 0.8 : -0.8, surface: 'blink', blink: { on: 2.2, off: 1.3, phase: -0.9 * i } });
  const fl = b.cursor;
  b.checkpoint({ gap: 2.2 });
  b.star(b.next({ from: fl - 2, dir: 'left', gap: 2.6, w: 1.8, d: 1.8, surface: 'blink', blink: { on: 1.6, off: 1.6, phase: 0 }, off: true }));
  b.end('Fairy Lights');

  b.begin(14, 'knit', 'Yarn Pushers');
  const yp = b.next({ gap: 2.2, w: 1.4, d: 12, h: 0.8 });
  for (const [oz, ph] of [[3.6, 0], [0, 0.8], [-3.6, 1.6]] as const) {
    const s = R(yp);
    b.add({ surface: 'knit', x: s.x - 1.35, y: b.top(yp) + 1.2, z: s.z + oz, hx: 0.55, hy: 1.2, hz: 0.6, motion: { dx: 2.7, dy: 0, dz: 0, period: 2.4, dwell: 0.35, phase: ph }, color: PAL.mintDeep, accent: PAL.cream });
  }
  b.next({ gap: 2.6, w: 2.4, d: 2.4, color: PAL.mint });
  b.next({ gap: 2.0, w: 2.6, d: 2.6, surface: 'tray', h: 0.8, motion: { dx: -6, period: 4, dwell: 0.5 } });
  b.next({ gap: 2.2, w: 2.6, d: 2.6, dx: -6 });
  b.checkpoint({ gap: 2.6, dx: 2 });
  b.star(yp, 1.3, 0, -5.4);
  b.end('Yarn Pushers');

  b.begin(15, 'knit', 'Wrapping Line');
  const wl = b.next({ gap: 2.2, w: 3, d: 10, surface: 'conveyor', belt: { x: 0, z: 3.0 }, through: true });
  b.spike(wl, { ox: -1.0, oz: 1.5, w: 1.0, d: 1.0, h: 0.7, motion: { dx: 2.0, period: 1.8, dwell: 0.2 } });
  b.next({ gap: 2.4, w: 2.4, d: 2.4, surface: 'blink', blink: { on: 2.0, off: 1.2, phase: 0 } });
  const wl2 = b.next({ gap: 2.4, w: 2.4, d: 2.4, surface: 'blink', blink: { on: 2.0, off: 1.2, phase: -1.0 } });
  b.next({ gap: 2.4, w: 2.4, d: 2.4, surface: 'blink', blink: { on: 2.0, off: 1.2, phase: -2.0 } });
  b.next({ gap: 2.4, w: 3, d: 8, surface: 'conveyor', belt: { x: 1.6, z: 2.0 }, through: true });
  b.checkpoint({ gap: 2.2 });
  b.star(wl2, 1.3);
  b.end('Wrapping Line');

  // ---------- Peppermint Ice Rink ----------
  b.begin(16, 'rink', 'First Frost');
  b.next({ gap: 2.0, w: 6, d: 4 });
  b.next({ gap: 2.6, w: 3, d: 5, surface: 'ice', through: true });
  const ff2 = b.next({ gap: 2.8, w: 2.6, d: 5, dx: 1.2, surface: 'ice', through: true });
  b.next({ gap: 2.8, w: 2.4, d: 6, dx: -1.2, surface: 'ice', through: true });
  b.next({ gap: 2.4, w: 1.2, d: 8, surface: 'ice', through: true });
  b.checkpoint({ gap: 2.4 });
  b.star(b.next({ from: ff2, dir: 'right', gap: 2.8, w: 1.6, d: 1.6, off: true, surface: 'ice' }));
  b.end('First Frost');

  b.begin(17, 'rink', 'Snowball Barrage');
  const sl1 = b.next({ gap: 2.0, w: 5, d: 14, through: true });
  b.snowball(sl1, 4.5, { travel: 1.3, gap: 1.6, phase: 0 });
  b.snowball(sl1, 1.5, { travel: 1.2, gap: 1.9, phase: 0.8 });
  b.snowball(sl1, -1.5, { travel: 1.4, gap: 1.5, phase: 1.7 });
  b.snowball(sl1, -4.5, { travel: 1.2, gap: 1.8, phase: 0.4 });
  b.next({ gap: 2.4, w: 3, d: 3, color: PAL.mint });
  const sl2 = b.next({ gap: 2.4, w: 4, d: 10, through: true });
  b.snowball(sl2, 3, { travel: 1.0, gap: 1.4, phase: 0.3 });
  b.snowball(sl2, 0, { travel: 1.0, gap: 1.3, phase: 1.1 });
  b.snowball(sl2, -3, { travel: 0.9, gap: 1.5, phase: 0.6 });
  b.checkpoint({ gap: 0 });
  b.star(sl2, 1.3, 1.2, 1.5);
  b.end('Snowball Barrage');

  b.begin(18, 'rink', 'Crumble Cookies');
  b.next({ gap: 2.2, w: 2.4, d: 2.4, surface: 'crumble', h: 0.6 });
  b.next({ gap: 2.4, w: 2.4, d: 2.4, dx: 1.4, surface: 'crumble', h: 0.6 });
  const ck3 = b.next({ gap: 2.6, w: 2.2, d: 2.2, dx: -1.4, surface: 'crumble', h: 0.6 });
  b.next({ gap: 2.4, w: 2.2, d: 2.2, rise: 0.6, surface: 'crumble', h: 0.6 });
  b.next({ gap: 2.8, w: 2.2, d: 2.2, dx: 1.4, surface: 'crumble', h: 0.6 });
  b.next({ gap: 2.8, w: 2.0, d: 2.0, dx: -1.4, surface: 'crumble', h: 0.6 });
  b.checkpoint({ gap: 2.6 });
  b.star(b.next({ from: ck3, dir: 'right', gap: 2.8, w: 1.6, d: 1.6, surface: 'crumble', h: 0.6, off: true }));
  b.end('Crumble Cookies');

  b.begin(19, 'rink', 'Mint Slalom');
  const ms = b.next({ gap: 2.0, w: 5, d: 17, surface: 'ice', through: true });
  b.spike(ms, { ox: -1.25, oz: 5.5, w: 2.5, d: 1 });
  b.spike(ms, { ox: 1.25, oz: 0, w: 2.5, d: 1 });
  b.spike(ms, { ox: -1.25, oz: -5.5, w: 2.5, d: 1 });
  b.next({ gap: 2.6, w: 2.4, d: 4, surface: 'ice', through: true });
  b.next({ gap: 2.6, w: 2.4, d: 4, dx: 1, surface: 'ice', through: true });
  b.checkpoint({ gap: 2.4 });
  b.star(ms, 1.4, 1.6, -6);
  b.end('Mint Slalom');

  b.begin(20, 'rink', 'Frost Fair Finale');
  const fi = b.next({ gap: 2.2, w: 3, d: 8, surface: 'ice', through: true });
  b.snowball(fi, 0, { travel: 1.1, gap: 1.4, phase: 0.5 });
  b.next({ gap: 2.6, w: 2.4, d: 2.4, surface: 'crumble', h: 0.6 });
  const fc = b.next({ gap: 2.6, w: 2.4, d: 2.4, dx: 1.2, surface: 'crumble', h: 0.6 });
  const fbr = b.next({ gap: 2.6, w: 1.6, d: 9, dx: -1.2, surface: 'ice', through: true });
  b.pendulum(fbr, { oz: 2, omega: 2.4 });
  b.pendulum(fbr, { oz: -2, omega: 2.4, phase: 1.5 });
  b.checkpoint({ gap: 2.4 });
  b.star(b.next({ from: fc, dir: 'left', gap: 2.8, w: 1.6, d: 1.6, off: true, color: PAL.mint }));
  b.end('Frost Fair Finale');

  // ---------- Ornament Skyway ----------
  b.begin(21, 'skyway', 'Spring Star');
  b.next({ gap: 2.2, w: 2.4, d: 2.4, surface: 'spring', h: 0.6 });
  b.next({ gap: 2.4, w: 3, d: 3, rise: 3.6, color: PAL.lilac });
  b.next({ gap: 2.4, w: 2, d: 2, surface: 'spring', h: 0.6 });
  const sp2 = b.next({ gap: 2.6, w: 2.6, d: 2.6, rise: 3.6, color: PAL.mint });
  b.next({ gap: 2.6, w: 2, d: 2, dx: 1.5, surface: 'spring', h: 0.6 });
  b.next({ gap: 2.8, w: 2.4, d: 2.4, dx: -1.5, rise: 3.2, color: PAL.blush });
  b.checkpoint({ gap: 2.6, rise: -1 });
  b.star(b.next({ from: sp2, dir: 'right', gap: 3.0, w: 1.4, d: 1.4, rise: 0.4, off: true, color: PAL.gold }));
  b.end('Spring Star');

  b.begin(22, 'skyway', 'Bauble Rhythm');
  const br1 = b.next({ gap: 2.2, w: 2.6, d: 2.6, surface: 'blink', blink: { on: 2.2, off: 1.2, phase: 0 } });
  b.pendulum(br1, { oz: -2.4, omega: 2.3 });
  const br2 = b.next({ gap: 2.2, w: 2.6, d: 2.6, surface: 'blink', blink: { on: 2.2, off: 1.2, phase: -0.9 } });
  const br3 = b.next({ gap: 2.2, w: 2.6, d: 2.6, surface: 'blink', blink: { on: 2.2, off: 1.2, phase: -1.8 } });
  b.pendulum(br3, { oz: -2.4, omega: 2.5, phase: 1 });
  b.next({ gap: 2.4, w: 2.6, d: 2.6, surface: 'blink', blink: { on: 2.2, off: 1.2, phase: -2.7 } });
  b.checkpoint({ gap: 2.2 });
  b.star(br2, 1.3);
  b.end('Bauble Rhythm');

  b.begin(23, 'skyway', 'Ribbon Carousel');
  b.next({ gap: 2.4, w: 2.6, d: 2.6, color: PAL.mint });
  const car = b.next({ gap: 2.4, w: 10, d: 10, dx: 3, through: true });
  b.sweeper(car, { length: 4.7, omega: -1.9, arms: 4, phase: 0.4 });
  b.next({ gap: 2.2, w: 2.6, d: 2.6, dx: -3, surface: 'tray', h: 0.8, motion: { dx: -5, period: 4, dwell: 0.5 } });
  b.next({ gap: 2.4, w: 2.6, d: 2.6, dx: -5, color: PAL.blush });
  const car2 = b.next({ gap: 2.4, w: 9, d: 9, dx: 3.2, through: true });
  b.sweeper(car2, { length: 4.3, omega: 1.6, arms: 3, height: 0.35 });
  b.checkpoint({ gap: 2.4, dx: -3.2 });
  b.star(car, 1.4, -2.5, -2.5);
  b.end('Ribbon Carousel');

  b.begin(24, 'skyway', 'Fairy-light Bridge');
  // A cookie only holds you for a moment, so each one is hopped straight through to the panel after it.
  b.next({ gap: 2.4, w: 2.2, d: 2.2, surface: 'crumble', h: 0.5, through: true });
  b.next({ gap: 2.6, w: 2.2, d: 2.2, surface: 'blink', blink: { on: 1.8, off: 1.0, phase: 0 } });
  b.next({ gap: 2.6, w: 2.2, d: 2.2, dx: 1, surface: 'crumble', h: 0.5, through: true });
  const fb2 = b.next({ gap: 2.6, w: 2.2, d: 2.2, dx: -1, surface: 'blink', blink: { on: 1.8, off: 1.0, phase: -1.3 } });
  b.next({ gap: 2.8, w: 2.2, d: 2.2, surface: 'crumble', h: 0.5 });
  b.checkpoint({ gap: 2.4 });
  b.star(b.next({ from: fb2, dir: 'left', gap: 3.0, w: 1.4, d: 1.4, off: true, color: PAL.gold }));
  b.end('Fairy-light Bridge');

  b.begin(25, 'skyway', 'Cloud Ribbon');
  b.next({ gap: 2.2, w: 2.4, d: 2.4, surface: 'spring', h: 0.6 });
  const deck = b.next({ gap: 2.4, w: 4, d: 6, rise: 3.4, color: PAL.lilac });
  b.strip(deck, 0, 1.0);
  b.next({ gap: 2.0, w: 2.6, d: 2.6, surface: 'tray', h: 0.8, motion: { dz: -6, period: 4.2, dwell: 0.5 } });
  b.next({ gap: 7.8, w: 2.6, d: 2.6, surface: 'tray', h: 0.8, motion: { dx: 6, period: 4, dwell: 0.5 } });
  b.next({ gap: 2.2, w: 2.6, d: 2.6, dx: 6, color: PAL.mint });
  b.checkpoint({ gap: 2.4, dx: -2.5 });
  b.star(deck, 1.3, 1.4, 2);
  b.end('Cloud Ribbon');

  // ---------- North Pole Runway ----------
  b.begin(26, 'northpole', 'Chalet Rooftops');
  const r1 = b.next({ gap: 2.8, w: 3.4, d: 3.4, h: 1.6 });
  b.spike(r1, { w: 3.4, d: 1.0, h: 1.0, motion: { dy: -1.05, period: 2.4, dwell: 0.5 } });
  const r2 = b.next({ gap: 3.0, w: 3.4, d: 4.6, h: 1.6, dx: 1 });
  b.spike(r2, { ox: -1.2, w: 1.0, d: 1.4, h: 0.8, motion: { dx: 2.4, period: 1.6, dwell: 0.1 } });
  const r3 = b.next({ gap: 3.2, w: 3.4, d: 3.4, h: 1.6, dx: -1 });
  b.spike(r3, { w: 3.4, d: 1.0, h: 1.0, motion: { dy: -1.05, period: 2.4, dwell: 0.5, phase: 1.2 } });
  b.next({ gap: 3.0, w: 2.8, d: 2.8, surface: 'gift', color: PAL.lilac, accent: PAL.maroon });
  b.checkpoint({ gap: 3.0 });
  b.star(b.next({ from: r2, dir: 'right', gap: 3.2, w: 1.6, d: 1.6, h: 1.6, off: true }));
  b.end('Chalet Rooftops');

  b.begin(27, 'northpole', 'Chimney Slalom');
  const chs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const prev = b.cursor;
    const id = b.next({ gap: 2.6, w: 2.4, d: 2.4, dx: i % 2 ? -1.2 : 1.2 });
    chs.push(id);
    if (i > 0) b.pendulum(prev, { oz: -(R(prev).hz + 1.3), omega: 2.2 + i * 0.1, phase: i });
  }
  b.checkpoint({ gap: 2.6 });
  b.star(chs[2], 1.4);
  b.end('Chimney Slalom');

  b.begin(28, 'northpole', 'Sleigh Loading Bay');
  const lb = b.next({ gap: 2.2, w: 5, d: 10, surface: 'conveyor', belt: { x: 0, z: 3.2 }, through: true });
  b.snowball(lb, 2, { travel: 1.0, gap: 1.6, phase: 0, span: 6 });
  b.snowball(lb, -2, { travel: 1.0, gap: 1.6, phase: 1.1, span: 6 });
  b.next({ gap: 0, w: 3, d: 2.5 });
  b.next({ gap: 2.2, w: 2.6, d: 2.6, surface: 'lift', h: 1, motion: { dy: 4, period: 4.5, dwell: 0.6, phase: 1 } });
  const top28 = b.next({ gap: 2.2, w: 2.6, d: 2.6, rise: 4 });
  b.next({ gap: 2.4, w: 3, d: 8, surface: 'conveyor', belt: { x: -2.0, z: 1.4 }, through: true });
  b.checkpoint({ gap: 2.2 });
  b.star(b.next({ from: top28, dir: 'left', gap: 3.0, w: 1.4, d: 1.4, off: true }));
  b.end('Sleigh Loading Bay');

  b.begin(29, 'northpole', 'Final Ribbon');
  const frb = b.next({ gap: 2.4, w: 0.9, d: 12, h: 0.7, surface: 'ribbon' });
  b.strip(frb, 3.5, 0.6);
  b.strip(frb, -1.5, 0.6);
  const fsw = b.next({ gap: 2.4, w: 9, d: 9, dx: 3.2, through: true });
  b.sweeper(fsw, { length: 4.3, omega: -3.0, arms: 2 });
  b.next({ gap: 2.4, w: 2.2, d: 2.2, dx: -3.2, color: PAL.blush });
  const fjr = b.next({ gap: 2.4, w: 9, d: 9, dx: -3.2, through: true });
  b.sweeper(fjr, { length: 4.3, omega: -2.4, arms: 2, height: 0.35 });
  b.next({ gap: 2.4, w: 2.2, d: 2.2, dx: 3.2, surface: 'blink', blink: { on: 1.8, off: 1.0, phase: 0 } });
  b.next({ gap: 2.6, w: 2.2, d: 2.2, surface: 'blink', blink: { on: 1.8, off: 1.0, phase: -1.0 } });
  b.checkpoint({ gap: 2.4 });
  b.star(frb, 1.3, 0, -3.5);
  b.end('Final Ribbon');

  b.begin(30, 'northpole', 'Star-top Finish');
  b.next({ gap: 2.6, w: 2.4, d: 2.4, rise: 0.8, surface: 'gift', color: PAL.blush });
  b.next({ gap: 2.6, w: 2.4, d: 2.4, rise: 0.8, surface: 'gift', color: PAL.lilac });
  b.next({ gap: 2.4, w: 2, d: 2, surface: 'spring', h: 0.6 });
  const hi = b.next({ gap: 2.6, w: 2.6, d: 6, rise: 3.6, surface: 'gift', color: PAL.mint });
  b.pendulum(hi, { omega: 2.6 });
  b.next({ gap: 2.2, w: 2.4, d: 2.4, surface: 'tray', h: 0.8, motion: { dx: 5, period: 3.6, dwell: 0.4 } });
  b.next({ gap: 2.6, w: 2.2, d: 2.2, dx: 5, surface: 'crumble', h: 0.6, through: true });
  b.next({ gap: 2.6, w: 2.2, d: 2.2, dx: -2, surface: 'blink', blink: { on: 1.8, off: 1.0, phase: 0 } });
  const podium = b.checkpoint({ gap: 2.6, w: 10, d: 10, rise: 0.6 });
  b.star(b.next({ from: hi, dir: 'left', gap: 3.0, w: 1.4, d: 1.4, rise: 0.6, off: true, color: PAL.gold }));
  const p = b.solids[podium];
  b.deco('sleigh', p.x + 3.1, b.top(podium), p.z - 3.6, 1.1, 0, PAL.maroon);
  b.deco('tree', p.x - 3.7, b.top(podium), p.z - 3.7, 1.0, 0, PAL.mint);
  b.end('Star-top Finish');

  scenery(b);
  return assembleCourse({
    solids: b.solids, checkpoints: b.checkpoints, sweepers: b.sweepers, snowballs: b.snowballs, pendulums: b.pendulums, stars: b.stars, stages: b.stages, decor: b.decor,
    // The plaza is ±4.5 wide; a player still standing on its edge has their centre up to a half-width beyond it.
    startLine: { z: 1, x0: -4.85, x1: 4.85 },
  });
}

export function zoneOf(stage: number): ZoneInfo { return ZONES[Math.max(0, Math.min(5, Math.floor((Math.max(1, stage) - 1) / 5)))]; }
