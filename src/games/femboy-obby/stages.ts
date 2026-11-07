/** The frosthop-v1 course: 30 authored stages in six zones. Forward is -z. Every surface is an axis-aligned box whose
 * visible top matches its collider; decorations never collide. Gaps were tuned against the measured jump envelope
 * (a running jump clears 4 units edge to edge between equal heights; 5.4 does not): early gaps 1.6–2.2, later 2.4–3.0. */
import { assembleCourse } from './course';
import type { Checkpoint, Course, Decor, Motion, Snowball, Solid, StageInfo, Star, Surface, Sweeper, ZoneId, ZoneInfo } from './types';

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
    const h = o.h ?? (surface === 'gift' ? Math.min(4, Math.min(o.w, o.d)) : surface === 'ornament' ? 0.5 : 0.9);
    const dir = o.dir ?? 'fwd';
    let x: number, z: number;
    if (dir === 'fwd') { z = from.z - from.hz - o.gap - o.d / 2; x = from.x + (o.dx ?? 0); }
    else { const sgn = dir === 'right' ? 1 : -1; x = from.x + sgn * (from.hx + o.gap + o.w / 2); z = from.z + (o.dz ?? 0); }
    const top = from.y + from.hy + (o.rise ?? 0);
    const motion = o.motion ? { dx: 0, dy: 0, dz: 0, phase: 0, dwell: 0.8, ...o.motion } : undefined;
    const id = this.add({ surface, x, y: top - h / 2, z, hx: o.w / 2, hy: h / 2, hz: o.d / 2, motion, belt: o.belt, color: o.color ?? defaultColor(surface, look.color), accent: o.accent ?? defaultAccent(surface, look.accent) });
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

  sweeper(on: number, o: { length: number; omega: number; phase?: number; arms?: 1 | 2; height?: number }): void {
    const s = this.solids[on], top = s.y + s.hy;
    // A hub post at the pivot collides exactly like it looks.
    this.add({ surface: 'candy', x: s.x, y: top + 0.75, z: s.z, hx: 0.45, hy: 0.75, hz: 0.45, color: PAL.maroon, accent: PAL.cream });
    this.sweepers.push({ id: this.sweepers.length, stage: this.stage, x: s.x, y: top + (o.height ?? 0.8), z: s.z, length: o.length, radius: 0.32, omega: o.omega, phase: o.phase ?? 0, arms: o.arms ?? 1 });
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

  // ---------- Giftwrap Gardens ----------
  b.begin(1, 'giftwrap', 'Present Hops');
  b.next({ gap: 1.6, w: 4, d: 4 });
  const g2 = b.next({ gap: 1.8, w: 4, d: 4, dx: 0.6 });
  b.next({ gap: 2.0, w: 4, d: 4, dx: -0.6 });
  b.checkpoint({ gap: 1.8 });
  b.star(b.next({ from: g2, dir: 'right', gap: 1.9, w: 2.4, d: 2.4, h: 2.4, off: true, color: PAL.lilac }));
  b.end('Present Hops');

  b.begin(2, 'giftwrap', 'Ribbon Steps');
  b.next({ gap: 1.3, w: 3.6, d: 3, rise: 0.8, color: PAL.cream });
  b.next({ gap: 1.4, w: 3.6, d: 3, rise: 0.8 });
  const s3 = b.next({ gap: 1.4, w: 3.6, d: 3, rise: 0.8, color: PAL.cream });
  b.next({ gap: 1.6, w: 3.6, d: 3, rise: 0.8 });
  b.checkpoint({ gap: 1.6, rise: 0.6 });
  b.star(b.next({ from: s3, dir: 'left', gap: 1.0, w: 2.2, d: 2.2, h: 2.2, rise: 1.2, off: true, color: PAL.mint }));
  b.end('Ribbon Steps');

  b.begin(3, 'giftwrap', 'Bow Bridge');
  b.next({ gap: 1.8, w: 3, d: 4, surface: 'ribbon', h: 0.6, through: true });
  b.next({ gap: 0, w: 3, d: 0.5, rise: 0.6, h: 0.6, surface: 'ribbon', color: PAL.maroon, accent: PAL.blush, through: true });
  b.next({ gap: 0, w: 3, d: 4, rise: -0.6, surface: 'ribbon', h: 0.6, through: true });
  const h2 = b.next({ gap: 0, w: 3, d: 0.5, rise: 0.6, h: 0.6, surface: 'ribbon', color: PAL.maroon, accent: PAL.blush, through: true });
  b.next({ gap: 0, w: 3, d: 4, rise: -0.6, surface: 'ribbon', h: 0.6, through: true });
  b.checkpoint({ gap: 0 });
  b.star(h2, 1.8);
  b.end('Bow Bridge');

  b.begin(4, 'giftwrap', 'Snowflake Islands');
  b.next({ gap: 2.0, w: 5, d: 5, h: 1.2, dx: 2.5, surface: 'snow', color: PAL.ice, accent: PAL.snow });
  b.next({ gap: 2.0, w: 5, d: 5, h: 1.2, dx: 3.5, surface: 'snow', color: PAL.ice, accent: PAL.snow });
  const i3 = b.next({ gap: 2.0, w: 5, d: 5, h: 1.2, dx: 3.0, surface: 'snow', color: PAL.ice, accent: PAL.snow });
  b.next({ gap: 2.2, w: 5, d: 5, h: 1.2, dx: 1.0, surface: 'snow', color: PAL.ice, accent: PAL.snow });
  b.checkpoint({ gap: 2.0, dx: -1 });
  b.star(b.next({ from: i3, dir: 'right', gap: 2.6, w: 3, d: 3, h: 1.2, rise: 0.4, off: true, surface: 'snow', color: PAL.lilac, accent: PAL.snow }));
  b.end('Snowflake Islands');

  b.begin(5, 'giftwrap', 'Gift Garden Finale');
  b.next({ gap: 2.2, w: 3.6, d: 3.6 });
  b.next({ gap: 2.2, w: 3.6, d: 3.6, color: PAL.cream });
  b.next({ gap: 1.6, w: 3.6, d: 3.6, rise: 0.9 });
  const beam = b.next({ gap: 2.0, w: 2, d: 8, h: 0.6, surface: 'ribbon' });
  b.checkpoint({ gap: 2.0, w: 9, d: 9 });
  b.star(b.next({ from: beam, dir: 'left', gap: 2.4, w: 1.4, d: 4, h: 0.6, off: true, surface: 'ribbon', color: PAL.lilac }));
  b.end('Gift Garden Finale');

  // ---------- Candy Cane Catwalk ----------
  b.begin(6, 'candycane', 'Peppermint Path');
  b.next({ gap: 2.2, w: 3.2, d: 3.2, dx: 1.5 });
  const pp = b.next({ gap: 2.4, w: 3.2, d: 3.2, dx: -1.5 });
  b.next({ gap: 2.4, w: 3.2, d: 3.2, dx: -1.5 });
  b.next({ gap: 2.2, w: 3.2, d: 3.2, dx: 1.5 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: pp, dir: 'left', gap: 2.6, w: 2.4, d: 2.4, off: true }));
  b.end('Peppermint Path');

  b.begin(7, 'candycane', 'Candy Cane Balance');
  const bal = b.next({ gap: 2.0, w: 1.2, d: 10, h: 0.7 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: bal, dir: 'right', gap: 2.4, w: 2, d: 2, rise: 0.3, off: true, color: PAL.blush }));
  b.deco('cane', b.solids[bal].x + 2.2, b.top(bal) - 6, b.solids[bal].z, 2.2, 0, PAL.candy);
  b.end('Candy Cane Balance');

  b.begin(8, 'candycane', 'Peppermint Sweeper');
  const sw = b.next({ gap: 1.6, w: 9, d: 9, dx: 3, through: true });
  b.sweeper(sw, { length: 4.2, omega: 1.05 });
  b.checkpoint({ gap: 1.6, dx: -3 });
  b.star(b.next({ from: sw, dir: 'right', gap: 2.2, w: 2.2, d: 2.2, off: true, color: PAL.blush }));
  b.end('Peppermint Sweeper');

  b.begin(9, 'candycane', 'Ribbon Zigzag');
  b.next({ gap: 1.8, w: 1.4, d: 7, h: 0.7, through: true });
  b.next({ gap: 0, w: 3.6, d: 3.6, h: 0.9, dx: 1.1, color: PAL.blush });
  b.next({ gap: 0, dir: 'right', w: 7, d: 1.4, h: 0.7, dz: 0, through: true });
  const zz = b.next({ gap: 0, dir: 'right', w: 3.6, d: 3.6, h: 0.9, color: PAL.blush });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: zz, dir: 'right', gap: 2.4, w: 2, d: 2, off: true, color: PAL.lilac }));
  b.end('Ribbon Zigzag');

  b.begin(10, 'candycane', 'Candy Crossing');
  const cx = b.next({ gap: 1.6, w: 9, d: 9, dx: -3, through: true });
  b.sweeper(cx, { length: 4.2, omega: 1.25, phase: 2 });
  b.next({ gap: 1.6, w: 4, d: 4, dx: 3, color: PAL.blush });
  b.next({ gap: 2.6, w: 3.2, d: 3.2 });
  b.next({ gap: 2.6, w: 3.2, d: 3.2 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: cx, dir: 'left', gap: 2.2, w: 2.2, d: 2.2, off: true, color: PAL.blush }));
  b.end('Candy Crossing');

  // ---------- Cozy Knit Workshop ----------
  b.begin(11, 'knit', 'Present Lift');
  b.next({ gap: 1.4, w: 4, d: 4, surface: 'lift', h: 1, motion: { dy: 4.5, period: 7, dwell: 1.2 } });
  const lt = b.next({ gap: 1.0, w: 6, d: 4, rise: 4.5 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: lt, dir: 'right', gap: 1.6, w: 2, d: 2, rise: 1.0, off: true, color: PAL.mint }));
  b.end('Present Lift');

  b.begin(12, 'knit', 'Stocking Shuttle');
  const tr = b.next({ gap: 1.0, w: 4, d: 4, surface: 'tray', h: 0.8, motion: { dx: 9, period: 8, dwell: 1.4 } });
  b.next({ gap: 1.0, w: 6, d: 4, dx: 9 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: tr, dir: 'left', gap: 2.6, w: 2, d: 2, off: true, color: PAL.mint }));
  b.end('Stocking Shuttle');

  b.begin(13, 'knit', 'Gift Conveyor');
  const belt = b.next({ gap: 1.6, w: 6, d: 10, surface: 'conveyor', belt: { x: 0, z: 2.4 }, through: true });
  for (const sx of [-1, 1]) b.add({ surface: 'knit', x: b.solids[belt].x + sx * 3.25, y: b.top(belt) + 0.35, z: b.solids[belt].z, hx: 0.25, hy: 0.35, hz: 5, color: PAL.mintDeep, accent: PAL.cream });
  b.checkpoint({ gap: 0 });
  b.star(belt, 1.3, 1.8, 2.5);
  b.end('Gift Conveyor');

  b.begin(14, 'knit', 'Yarn Shuttle');
  b.next({ gap: 1.0, w: 4, d: 4, surface: 'tray', h: 0.8, motion: { dx: -8, period: 8, dwell: 1.4 } });
  const isl = b.next({ gap: 1.0, w: 5, d: 4, dx: -8 });
  b.next({ gap: 1.0, w: 4, d: 4, surface: 'tray', h: 0.8, motion: { dz: -7, period: 8, dwell: 1.4 } });
  b.checkpoint({ gap: 8.0, dx: 0 });
  b.star(b.next({ from: isl, dir: 'left', gap: 2.4, w: 2, d: 2, rise: 0.5, off: true, color: PAL.mint }));
  b.end('Yarn Shuttle');

  b.begin(15, 'knit', 'Wrapping Line');
  const wb = b.next({ gap: 1.6, w: 6, d: 8, surface: 'conveyor', belt: { x: 0, z: 2.8 }, through: true });
  for (const sx of [-1, 1]) b.add({ surface: 'knit', x: b.solids[wb].x + sx * 3.25, y: b.top(wb) + 0.35, z: b.solids[wb].z, hx: 0.25, hy: 0.35, hz: 4, color: PAL.mintDeep, accent: PAL.cream });
  const rest = b.next({ gap: 0, w: 6, d: 3.5 });
  b.next({ gap: 1.2, w: 4, d: 4, surface: 'lift', h: 1, motion: { dy: 4, period: 7, dwell: 1.2, phase: 2 } });
  b.next({ gap: 1.0, w: 6, d: 4, rise: 4 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: rest, dir: 'right', gap: 2.4, w: 2, d: 2, rise: 0.4, off: true, color: PAL.mint }));
  b.end('Wrapping Line');

  // ---------- Peppermint Ice Rink ----------
  b.begin(16, 'rink', 'First Frost');
  b.next({ gap: 1.8, w: 6, d: 4 });
  const ice1 = b.next({ gap: 0, w: 4, d: 9, surface: 'ice', through: true });
  b.next({ gap: 0, w: 6, d: 6 });
  b.checkpoint({ gap: 1.8 });
  b.star(ice1, 1.2);
  b.end('First Frost');

  b.begin(17, 'rink', 'Mint Slalom');
  const ia = b.next({ gap: 1.8, w: 3.4, d: 7, surface: 'ice', through: true });
  for (const sx of [-1, 1]) b.next({ from: ia, dir: sx > 0 ? 'right' : 'left', gap: 0, w: 2.5, d: 7, off: true });
  const ib = b.next({ gap: 0, w: 8, d: 3.4, dx: 2.3, surface: 'ice', through: true });
  const ic = b.next({ gap: 0, w: 3.4, d: 7, dx: 2.3, surface: 'ice', through: true });
  for (const sx of [-1, 1]) b.next({ from: ic, dir: sx > 0 ? 'right' : 'left', gap: 0, w: 2.5, d: 7, off: true });
  b.checkpoint({ gap: 1.6 });
  b.star(ib, 1.2, -2.5);
  b.end('Mint Slalom');

  b.begin(18, 'rink', 'Snowball Lane');
  const lane1 = b.next({ gap: 1.6, w: 5, d: 6, through: true });
  b.snowball(lane1, 0, { travel: 1.6, gap: 2.2, phase: 0 });
  const alcove = b.next({ gap: 0, w: 9, d: 4, color: PAL.mint });
  const lane2 = b.next({ gap: 0, w: 5, d: 6, through: true });
  b.snowball(lane2, 0, { travel: 1.5, gap: 2.4, phase: 1.3 });
  b.checkpoint({ gap: 0 });
  b.star(alcove, 1.3, 3.4);
  b.end('Snowball Lane');

  b.begin(19, 'rink', 'Crumble Cookies');
  b.next({ gap: 1.8, w: 3, d: 3, surface: 'crumble', h: 0.6 });
  const c2 = b.next({ gap: 1.8, w: 3, d: 3, surface: 'crumble', h: 0.6 });
  b.next({ gap: 1.8, w: 3, d: 3, surface: 'crumble', h: 0.6 });
  b.checkpoint({ gap: 1.8 });
  b.star(b.next({ from: c2, dir: 'right', gap: 2.2, w: 2.2, d: 2.2, off: true }));
  b.end('Crumble Cookies');

  b.begin(20, 'rink', 'Frost Fair Finale');
  b.next({ gap: 1.8, w: 4, d: 8, surface: 'ice', through: true });
  const ffr = b.next({ gap: 0, w: 6, d: 5 });
  b.next({ gap: 2.0, w: 3, d: 3, surface: 'crumble', h: 0.6 });
  b.next({ gap: 2.0, w: 3, d: 3, surface: 'crumble', h: 0.6 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: ffr, dir: 'left', gap: 2.4, w: 2, d: 2, off: true, color: PAL.mint }));
  b.end('Frost Fair Finale');

  // ---------- Ornament Skyway ----------
  b.begin(21, 'skyway', 'Bauble Balcony');
  b.next({ gap: 2.0, w: 3.2, d: 3.2, rise: 0.7 });
  const bb2 = b.next({ gap: 2.0, w: 3.2, d: 3.2, rise: 0.7, dx: 1.2, color: PAL.mint });
  b.next({ gap: 2.2, w: 3.2, d: 3.2, rise: 0.7, dx: -1.2, color: PAL.blush });
  b.next({ gap: 2.2, w: 3.2, d: 3.2, rise: 0.7 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: bb2, dir: 'right', gap: 2.4, w: 2.2, d: 2.2, rise: 0.7, off: true, color: PAL.gold }));
  b.end('Bauble Balcony');

  b.begin(22, 'skyway', 'Spring Star');
  b.next({ gap: 2.0, w: 3, d: 3, surface: 'spring', h: 0.6 });
  const balcony = b.next({ gap: 2.0, w: 7, d: 6, rise: 3.6, color: PAL.lilac });
  b.checkpoint({ gap: 1.8 });
  b.star(balcony, 1.3, 2.4, 1.5);
  b.end('Spring Star');

  b.begin(23, 'skyway', 'Ribbon Carousel');
  b.next({ gap: 2.0, w: 3.4, d: 3.4, color: PAL.mint });
  const car = b.next({ gap: 1.4, w: 9, d: 9, dx: 3, through: true });
  b.sweeper(car, { length: 4.2, omega: 0.75, arms: 2, phase: 0.6 });
  b.next({ gap: 1.4, w: 3.4, d: 3.4, dx: -3, color: PAL.blush });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: car, dir: 'right', gap: 2.2, w: 2.2, d: 2.2, off: true, color: PAL.gold }));
  b.end('Ribbon Carousel');

  b.begin(24, 'skyway', 'Fairy-light Bridge');
  b.next({ gap: 1.6, w: 2.6, d: 2.6, surface: 'crumble', h: 0.5 });
  b.next({ gap: 1.6, w: 2.6, d: 2.6, surface: 'crumble', h: 0.5 });
  const fl3 = b.next({ gap: 1.6, w: 2.6, d: 2.6, surface: 'crumble', h: 0.5 });
  b.next({ gap: 1.6, w: 2.6, d: 2.6, surface: 'crumble', h: 0.5 });
  b.checkpoint({ gap: 1.8 });
  b.star(b.next({ from: fl3, dir: 'left', gap: 2.4, w: 2, d: 2, off: true, color: PAL.gold }));
  b.end('Fairy-light Bridge');

  b.begin(25, 'skyway', 'Cloud Ribbon');
  b.next({ gap: 2.0, w: 3, d: 3, surface: 'spring', h: 0.6 });
  const deck = b.next({ gap: 2.0, w: 7, d: 5, rise: 3.4, color: PAL.lilac });
  b.next({ gap: 1.0, w: 4, d: 4, surface: 'tray', h: 0.8, motion: { dz: -7, period: 8, dwell: 1.4 } });
  b.checkpoint({ gap: 8.0 });
  b.star(deck, 1.3, -2.4);
  b.end('Cloud Ribbon');

  // ---------- North Pole Runway ----------
  b.begin(26, 'northpole', 'Chalet Rooftops');
  b.next({ gap: 2.2, w: 5, d: 5, h: 1.6 });
  b.next({ gap: 2.0, w: 2.6, d: 2.6, surface: 'gift', color: PAL.blush, accent: PAL.maroon });
  const roof2 = b.next({ gap: 2.0, w: 5, d: 5, h: 1.6, dx: 1 });
  b.next({ gap: 2.0, w: 2.6, d: 2.6, surface: 'gift', color: PAL.lilac, accent: PAL.maroon });
  b.next({ gap: 2.0, w: 5, d: 5, h: 1.6, dx: -1 });
  b.checkpoint({ gap: 2.2 });
  b.star(b.next({ from: roof2, dir: 'right', gap: 2.6, w: 2.4, d: 2.4, h: 1.6, off: true }));
  b.end('Chalet Rooftops');

  b.begin(27, 'northpole', 'Chimney Slalom');
  const ch: number[] = [];
  for (const [i, dx] of [[0, 1.5], [1, -1.5], [2, 1.5], [3, -1.5]] as const) {
    const id = b.next({ gap: 2.6, w: 4.4, d: 4.4, dx });
    ch.push(id);
    const s = b.solids[id], cxs = dx > 0 ? 1 : -1;
    void i;
    b.add({ surface: 'roof', x: s.x + cxs * 1.5, y: b.top(id) + 0.7, z: s.z, hx: 0.55, hy: 0.7, hz: 0.55, color: PAL.maroon, accent: PAL.snow });
  }
  b.checkpoint({ gap: 2.4 });
  b.star(ch[2], 1.4, -0.8);
  b.end('Chimney Slalom');

  b.begin(28, 'northpole', 'Sleigh Loading Bay');
  const lb = b.next({ gap: 1.6, w: 6, d: 8, surface: 'conveyor', belt: { x: 0, z: 2.6 }, through: true });
  for (const sx of [-1, 1]) b.add({ surface: 'knit', x: b.solids[lb].x + sx * 3.25, y: b.top(lb) + 0.35, z: b.solids[lb].z, hx: 0.25, hy: 0.35, hz: 4, color: PAL.maroon, accent: PAL.cream });
  const wait = b.next({ gap: 0, w: 6, d: 3.5 });
  b.next({ gap: 1.2, w: 4, d: 4, surface: 'lift', h: 1, motion: { dy: 4, period: 7, dwell: 1.4, phase: 1 } });
  b.next({ gap: 1.0, w: 6, d: 4, rise: 4 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: wait, dir: 'left', gap: 2.4, w: 2, d: 2, rise: 0.5, off: true, color: PAL.gold }));
  b.end('Sleigh Loading Bay');

  b.begin(29, 'northpole', 'Final Ribbon');
  b.next({ gap: 1.8, w: 1.4, d: 7, h: 0.7, surface: 'ribbon' });
  const fr = b.next({ gap: 1.6, w: 9, d: 9, dx: 3, through: true });
  b.sweeper(fr, { length: 4.2, omega: 1.1, phase: 1 });
  b.next({ gap: 1.6, w: 4, d: 4, dx: -3 });
  b.next({ gap: 2.8, w: 3.4, d: 3.4 });
  b.next({ gap: 2.8, w: 3.4, d: 3.4 });
  b.checkpoint({ gap: 2.0 });
  b.star(b.next({ from: fr, dir: 'right', gap: 2.2, w: 2.2, d: 2.2, off: true, color: PAL.gold }));
  b.end('Final Ribbon');

  b.begin(30, 'northpole', 'Star-top Finish');
  b.next({ gap: 1.6, w: 4, d: 3, rise: 0.8, surface: 'gift', color: PAL.blush });
  const f2 = b.next({ gap: 1.6, w: 4, d: 3, rise: 0.8, surface: 'gift', color: PAL.lilac });
  b.next({ gap: 1.6, w: 4, d: 3, rise: 0.8, surface: 'gift', color: PAL.mint });
  const podium = b.checkpoint({ gap: 1.6, w: 10, d: 10, rise: 0.6 });
  b.star(b.next({ from: f2, dir: 'left', gap: 2.2, w: 2, d: 2, rise: 0.8, off: true, color: PAL.gold }));
  const p = b.solids[podium];
  b.deco('sleigh', p.x + 3.1, b.top(podium), p.z - 3.6, 1.1, 0, PAL.maroon);
  b.deco('tree', p.x - 3.7, b.top(podium), p.z - 3.7, 1.0, 0, PAL.mint);
  b.end('Star-top Finish');

  scenery(b);
  return assembleCourse({
    solids: b.solids, checkpoints: b.checkpoints, sweepers: b.sweepers, snowballs: b.snowballs, stars: b.stars, stages: b.stages, decor: b.decor,
    // The plaza is ±4.5 wide; a player still standing on its edge has their centre up to a half-width beyond it.
    startLine: { z: 1, x0: -4.85, x1: 4.85 },
  });
}

export function zoneOf(stage: number): ZoneInfo { return ZONES[Math.max(0, Math.min(5, Math.floor((Math.max(1, stage) - 1) / 5)))]; }
