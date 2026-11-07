import { ARENA_R, CENTER, GRID, HUMAN, PLAYER_COUNT, type GameEvent, type Player, type World } from './types';
import { ownerLoops } from './outline';
import { christmas } from '../../festive/festive';
import { FESTIVE_LOOK, bulbSprite, snowPattern, drawLightTrail, drawCandyRing } from './christmas-render';
import { drawSantaHat } from '../../festive/art';

/** Owner colours by player id (index 0 is unused). */
export const PALETTE = ['#000000', '#ff4d6a', '#4b8dff', '#23b67f', '#ffad1f', '#9a5cff', '#00b3d6', '#ff7a3d'];

const OUTSIDE = '#8ccfb6';
const INSIDE = '#e8f8ef';
const EDGE = '#2e6b5a';
const INK = '#1e3a32';

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const rgb = (c: number[]) => `rgb(${c.map(v => Math.round(v)).join(',')})`;
/** Mix toward white (amount > 0) or toward black (amount < 0). */
function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0, a = Math.abs(amount);
  return rgb(hexToRgb(hex).map(v => v + (target - v) * a));
}
export const RIM = PALETTE.map(c => shade(c, -0.35));
export const OUTLINE = PALETTE.map(c => shade(c, -0.2));
const PASTEL = PALETTE.map(c => shade(c, 0.55));
const TRAIL_EDGE = PALETTE.map(c => shade(c, -0.05));

/** Colours a renderer paints with; the Christmas skin swaps in FESTIVE_LOOK. */
export interface Look { palette: readonly string[]; rim: readonly string[]; outline: readonly string[]; pastel: readonly string[]; trailEdge: readonly string[]; outside: string; inside: string; edge: string; dots: string; shadow: string }
const ORIGINAL_LOOK: Look = { palette: PALETTE, rim: RIM, outline: OUTLINE, pastel: PASTEL, trailEdge: TRAIL_EDGE, outside: OUTSIDE, inside: INSIDE, edge: EDGE, dots: 'rgba(46,107,90,.2)', shadow: 'rgba(46,107,90,.16)' };
export const lookFor = (festive: boolean): Look => festive ? FESTIVE_LOOK : ORIGINAL_LOOK;

/** Colour-independent player marks on a 24 x 24 box, as SVG path data usable by both Path2D and inline SVG. */
const star = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.8 : 11, a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push(`${(12 + Math.cos(a) * r).toFixed(2)} ${(12.6 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}z`;
})();
export const MARKS: readonly string[] = [
  '',
  'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z', // circle (You)
  'M4 4h16v16H4z', // square
  'M12 2.5L22 20H2z', // triangle
  'M12 1L23 12L12 23L1 12z', // diamond
  star, // star
  'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10z', // ring (even-odd)
  'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z', // cross
];
const markPaths = MARKS.map(d => (d ? new Path2D(d) : null));

/** Inline SVG for HUD rows. Constants only, so safe to inject. */
export const markSvg = (id: number) => {
  const look = lookFor(christmas());
  return `<svg class="cl-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="${MARKS[id]}" fill="${look.palette[id]}" fill-rule="evenodd" stroke="${look.rim[id]}" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke"/></svg>`;
};

interface Fx {
  kind: 'flash' | 'burst';
  born: number; // -1 until first drawn
  life: number; // ms
  color: string;
  x: number; y: number; // burst centre / flash box origin
  w: number; h: number;
  tile: HTMLCanvasElement | null;
  alpha: number;
}

export interface Renderer {
  resize(width: number, height: number): void;
  draw(world: World, alpha: number, reducedMotion: boolean, nowMs: number): void;
  push(events: readonly GameEvent[]): void;
  readonly view: { width: number; height: number; headScreen: { x: number; y: number } };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const FX_LIMIT = 14;
const TILE_PX = 4; // pixels per cell in effect tiles

function cellsTile(cells: number[], color: string): { tile: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null {
  if (!cells.length) return null;
  let x0 = GRID, y0 = GRID, x1 = 0, y1 = 0;
  for (const i of cells) {
    const cx = i % GRID, cy = Math.floor(i / GRID);
    if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const tile = document.createElement('canvas');
  tile.width = w * TILE_PX; tile.height = h * TILE_PX;
  const c = tile.getContext('2d');
  if (!c) return null;
  c.fillStyle = color;
  for (const i of cells) c.fillRect((i % GRID - x0) * TILE_PX, (Math.floor(i / GRID) - y0) * TILE_PX, TILE_PX, TILE_PX);
  return { tile, x: x0, y: y0, w, h };
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d')!;
  // Theme is fixed for the life of this renderer (one mount); textures are built once.
  const festive = christmas(), look = lookFor(festive);
  const bulbs = festive ? look.palette.map((c, id) => (id ? bulbSprite(c) : null)) : [];
  let snow: ReturnType<typeof snowPattern> | null = null;
  const view = { width: 1, height: 1, headScreen: { x: 0.5, y: 0.5 } };
  let dpr = 1;
  let cache: HTMLCanvasElement | null = null;
  let cacheWorld: World | null = null, cacheVersion = -1, cacheK = 0;
  let camX = CENTER, camY = CENTER, lastNow = -1;
  let seenWorld: World | null = null;
  let lastHead: { x: number; y: number } | null = null;
  let fx: Fx[] = [];

  function resize(width: number, height: number) {
    view.width = Math.max(1, width); view.height = Math.max(1, height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(view.width * dpr));
    canvas.height = Math.max(1, Math.round(view.height * dpr));
    view.headScreen = { x: view.width / 2, y: view.height / 2 };
  }

  function buildCache(world: World, k: number) {
    if (!cache) cache = document.createElement('canvas');
    if (cache.width !== GRID * k) { cache.width = GRID * k; cache.height = GRID * k; }
    const c = cache.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cache.width, cache.height);
    c.save();
    c.scale(k, k);
    c.beginPath(); c.arc(CENTER, CENTER, ARENA_R + 0.25, 0, Math.PI * 2); c.clip();
    const paths: { id: number; path: Path2D }[] = [];
    for (let id = 1; id <= PLAYER_COUNT; id++) {
      if (world.counts[id] <= 0) continue;
      const path = new Path2D();
      for (const loop of ownerLoops(world.owner, GRID, id)) {
        path.moveTo(loop[0], loop[1]);
        for (let i = 2; i < loop.length; i += 2) path.lineTo(loop[i], loop[i + 1]);
        path.closePath();
      }
      paths.push({ id, path });
    }
    // All rims first so one owner's shadow never paints over a neighbour's fill.
    c.save(); c.translate(0, 0.35);
    for (const { id, path } of paths) { c.fillStyle = look.rim[id]; c.fill(path, 'evenodd'); }
    c.restore();
    c.lineJoin = 'round'; c.lineWidth = 0.12;
    for (const { id, path } of paths) {
      c.fillStyle = look.palette[id]; c.fill(path, 'evenodd');
      c.strokeStyle = look.outline[id]; c.stroke(path);
    }
    c.restore();
  }

  function push(events: readonly GameEvent[]) {
    for (const e of events) {
      if (e.kind === 'capture' || e.kind === 'takeover') {
        const attacker = e.kind === 'capture' ? e.id : e.to;
        const box = cellsTile(e.cells, e.kind === 'capture' ? '#ffffff' : look.palette[attacker]);
        if (!box) continue;
        fx.push({ kind: 'flash', born: -1, life: e.kind === 'capture' ? 220 : 300, color: look.palette[attacker], x: box.x, y: box.y, w: box.w, h: box.h, tile: box.tile, alpha: e.kind === 'capture' ? 0.85 : 0.7 });
      } else if (e.kind === 'defeat') {
        fx.push({ kind: 'burst', born: -1, life: 400, color: look.palette[e.id], x: e.x, y: e.y, w: 0, h: 0, tile: null, alpha: 1 });
      }
    }
    if (fx.length > FX_LIMIT) fx = fx.slice(fx.length - FX_LIMIT);
  }

  const trailColor = (id: number) => look.pastel[id];

  const bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function drawTrail(p: Player, hx: number, hy: number, cell: number) {
    if (p.trail.length < 2) return;
    if (festive) { drawLightTrail(ctx, p.trail, hx, hy, cell, look.trailEdge[p.id], look.pastel[p.id], bulbs[p.id]!, bounds); return; }
    ctx.beginPath();
    ctx.moveTo(p.trail[0], p.trail[1]);
    for (let i = 2; i < p.trail.length; i += 2) ctx.lineTo(p.trail[i], p.trail[i + 1]);
    ctx.lineTo(hx, hy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = TRAIL_EDGE[p.id]; ctx.lineWidth = 1.5 + 2 / cell; ctx.stroke();
    ctx.strokeStyle = trailColor(p.id); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawHead(p: Player, hx: number, hy: number) {
    const human = p.id === HUMAN, s = human ? 0.78 : 0.7;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(p.angle);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * 0.75, s * 0.8); ctx.lineTo(-s * 0.75, -s * 0.8); ctx.closePath();
    if (human) { ctx.lineWidth = 0.95; ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.lineWidth = human ? 0.6 : 0.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.lineWidth = 0.3; ctx.strokeStyle = look.palette[p.id]; ctx.fillStyle = look.palette[p.id]; ctx.stroke(); ctx.fill();
    // Eyes look forward.
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.2, side * 0.3, 0.19, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = INK;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 0.27, side * 0.3, 0.09, 0, Math.PI * 2); ctx.fill(); }
    // Shape mark so players differ without colour.
    const mark = markPaths[p.id];
    if (mark) {
      ctx.save(); ctx.translate(-s * 0.32, 0); ctx.rotate(Math.PI / 2); ctx.scale(0.4 / 12, 0.4 / 12); ctx.translate(-12, -12);
      ctx.fillStyle = '#ffffff'; ctx.fill(mark, 'evenodd'); ctx.restore();
    }
    ctx.restore();
  }

  function drawEffects(now: number) {
    const alive: Fx[] = [];
    for (const f of fx) {
      if (f.born < 0) f.born = now;
      const t = (now - f.born) / f.life;
      if (t >= 1) continue;
      alive.push(f);
      if (f.kind === 'flash' && f.tile) {
        ctx.globalAlpha = f.alpha * (1 - t) * (1 - t);
        ctx.drawImage(f.tile, f.x, f.y, f.w, f.h);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = f.color; ctx.lineWidth = 0.35 * (1 - t) + 0.08;
        ctx.beginPath(); ctx.arc(f.x, f.y, 0.6 + t * 2.6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 0.28; ctx.lineCap = 'round';
        const r = 0.55;
        ctx.beginPath(); ctx.moveTo(f.x - r, f.y - r); ctx.lineTo(f.x + r, f.y + r); ctx.moveTo(f.x + r, f.y - r); ctx.lineTo(f.x - r, f.y + r); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    fx = alive;
  }

  function draw(world: World, alpha: number, reducedMotion: boolean, nowMs: number) {
    const w = view.width, h = view.height;
    const cell = clamp(Math.min(w, h) / 34, 10, 22);
    const human = world.players[0];
    const a = clamp(alpha, 0, 1);
    if (world !== seenWorld) { seenWorld = world; lastNow = -1; lastHead = null; fx = []; }
    if (reducedMotion) fx = [];
    const dt = lastNow < 0 ? Infinity : clamp((nowMs - lastNow) / 1000, 0, 0.1);
    lastNow = nowMs;
    // The camera follows the human head; once defeated it keeps its last view.
    if (human.alive) lastHead = { x: human.px + (human.x - human.px) * a, y: human.py + (human.y - human.py) * a };
    const focus = lastHead ?? { x: human.x, y: human.y };
    const follow = dt === Infinity ? 1 : 1 - Math.exp(-8 * dt);
    if (human.alive || lastHead) { camX += (focus.x - camX) * follow; camY += (focus.y - camY) * follow; }
    const tx = Math.round((w / 2 - camX * cell) * dpr) / dpr, ty = Math.round((h / 2 - camY * cell) * dpr) / dpr;
    view.headScreen.x = focus.x * cell + tx; view.headScreen.y = focus.y * cell + ty;

    // Territory cache: re-rendered only when ownership (or its pixel density) changes.
    const k = clamp(Math.ceil(cell * dpr), 8, 16);
    if (cacheWorld !== world || cacheVersion !== world.landVersion || cacheK !== k) {
      buildCache(world, k);
      cacheWorld = world; cacheVersion = world.landVersion; cacheK = k;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = look.outside; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * cell, 0, 0, dpr * cell, tx * dpr, ty * dpr);
    const vx0 = camX - w / 2 / cell - 1, vx1 = camX + w / 2 / cell + 1, vy0 = camY - h / 2 / cell - 1, vy1 = camY + h / 2 / cell + 1;

    if (festive) {
      // Outside: a cached snowflake texture at device resolution, anchored to the world origin.
      const px = cell * dpr;
      if (!snow || snow.px !== px) snow = snowPattern(ctx, px);
      if (snow.pattern) {
        snow.pattern.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(tx * dpr), Math.round(ty * dpr)]));
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = snow.pattern; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * cell, 0, 0, dpr * cell, tx * dpr, ty * dpr);
      }
    } else {
    // Outside stripes (world-anchored diagonals).
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 0.9; ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let c = Math.floor((vx0 + vy0) / 3) * 3; c <= vx1 + vy1; c += 3) { ctx.moveTo(c - vy0, vy0); ctx.lineTo(c - vy1, vy1); }
    ctx.stroke();
    }

    // Arena floor with a faint dot grid.
    ctx.fillStyle = look.inside;
    ctx.beginPath(); ctx.arc(CENTER, CENTER, ARENA_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.dots;
    for (let gy = Math.ceil(vy0 / 4) * 4; gy <= vy1; gy += 4) {
      for (let gx = Math.ceil(vx0 / 4) * 4; gx <= vx1; gx += 4) {
        if (Math.hypot(gx - CENTER, gy - CENTER) < ARENA_R - 1) ctx.fillRect(gx - 0.08, gy - 0.08, 0.16, 0.16);
      }
    }

    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (cache) ctx.drawImage(cache, 0, 0, GRID, GRID);

    // Clear outer edge with a soft inner shadow line.
    ctx.strokeStyle = look.shadow; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(CENTER, CENTER, ARENA_R - 0.75, 0, Math.PI * 2); ctx.stroke();
    // The candy ring is only stroked while the arena edge can be on screen.
    if (festive) { if (Math.hypot(camX - CENTER, camY - CENTER) + Math.hypot(w, h) / 2 / cell > ARENA_R - 1) drawCandyRing(ctx, CENTER, CENTER, ARENA_R + 0.2); }
    else {
    ctx.strokeStyle = EDGE; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.arc(CENTER, CENTER, ARENA_R + 0.2, 0, Math.PI * 2); ctx.stroke();
    }

    bounds.x0 = vx0; bounds.y0 = vy0; bounds.x1 = vx1; bounds.y1 = vy1;
    const pos = (p: Player) => ({ x: p.px + (p.x - p.px) * a, y: p.py + (p.y - p.py) * a });
    const living = world.players.filter(p => p.alive);
    for (const p of living) { const q = pos(p); drawTrail(p, q.x, q.y, cell); }
    for (const p of living) { if (p.id !== HUMAN) { const q = pos(p); drawHead(p, q.x, q.y); } }
    if (human.alive) {
      const q = pos(human); drawHead(human, q.x, q.y);
      // Only the player wears a Santa hat, upright above the head, so You is easy to find.
      // drawSantaHat works in pixel-sized units, so draw it in a 1/24-cell frame.
      if (festive) { ctx.save(); ctx.translate(q.x, q.y - 0.88); ctx.scale(1 / 24, 1 / 24); drawSantaHat(ctx, 0, 0, 30, 0, -0.7); ctx.restore(); }
    }
    if (!reducedMotion) drawEffects(nowMs);

    // Bot name labels in screen space so text stays crisp.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `700 ${clamp(cell * 0.62, 9, 13)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.fillStyle = INK;
    for (const p of living) {
      if (!p.isBot) continue;
      const q = pos(p), sx = q.x * cell + tx, sy = q.y * cell + ty - cell * 1.25;
      if (sx < -40 || sx > w + 40 || sy < -20 || sy > h + 20) continue;
      ctx.strokeText(p.name, sx, sy); ctx.fillText(p.name, sx, sy);
    }
  }

  return { resize, draw, push, view };
}
