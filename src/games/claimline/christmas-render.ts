import type { Look } from './render';
import { XMAS, drawSnowflake, hash, mix, withAlpha } from '../../festive/art';

/**
 * Christmas look for Claimline: a snow-covered arena in a night forest,
 * festive territory colours and trails drawn as strings of glowing lights.
 * Everything per-frame is cheap: bulb sprites and the snow texture are built
 * once per mount, so no gradient is created while playing. Trail geometry
 * (the 1.5-cell band) is unchanged; bulbs sit on its centreline.
 */
// Same hue families as the original, in the same player order, so bots stay
// recognisable: You red, blue, green, gold, plum, ice cyan, gingerbread.
const PALETTE = ['#000000', '#d8263a', '#2f6fe0', '#2c9a55', '#e5a91f', '#8e4fd0', '#22a9c9', '#a8642e'] as const;
export const FESTIVE_LOOK: Look = {
  palette: PALETTE,
  rim: PALETTE.map(c => mix(c, '#000000', 0.35)),
  outline: PALETTE.map(c => mix(c, '#000000', 0.2)),
  pastel: PALETTE.map(c => mix(c, '#ffffff', 0.55)),
  trailEdge: PALETTE.map(c => mix(c, '#000000', 0.05)),
  outside: XMAS.evergreen,
  inside: '#f4f8fc',
  edge: XMAS.red,
  dots: 'rgba(90,130,180,.24)',
  shadow: 'rgba(95,140,190,.22)',
};

/** A glowing fairy-light sprite (64 px), drawn about 1.1 cells across. */
export function bulbSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return c;
  const glow = g.createRadialGradient(32, 32, 6, 32, 32, 32);
  glow.addColorStop(0, withAlpha(color, 0.6)); glow.addColorStop(0.45, withAlpha(color, 0.25)); glow.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  g.beginPath(); g.arc(32, 32, 12, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  g.lineWidth = 2; g.strokeStyle = mix(color, '#000000', 0.35); g.stroke();
  g.beginPath(); g.arc(28.5, 28, 5, 0, Math.PI * 2);
  g.fillStyle = mix(color, '#ffffff', 0.65); g.fill();
  return c;
}

/**
 * Snowflake texture for the outside, 12 x 12 cells per tile, built at device
 * resolution (`px` device pixels per cell) so filling never resamples it.
 * Callers rebuild it only when the cell size changes.
 */
export function snowPattern(ctx: CanvasRenderingContext2D, px: number): { pattern: CanvasPattern | null; px: number; size: number } {
  const size = Math.max(16, Math.round(12 * px));
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const g = tile.getContext('2d');
  if (!g) return { pattern: null, px, size };
  g.scale(size / 384, size / 384);
  for (let i = 0; i < 7; i++) {
    const x = 24 + hash(i * 5 + 1) * 336, y = 24 + hash(i * 5 + 2) * 336;
    drawSnowflake(g, x, y, 10 + hash(i * 5 + 3) * 10, '#ffffff', 0.22 + hash(i * 5 + 4) * 0.12);
  }
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(hash(i * 3 + 90) * 384, hash(i * 3 + 91) * 384, 2 + hash(i * 3 + 92) * 2, 0, Math.PI * 2); g.fill(); }
  return { pattern: ctx.createPattern(tile, 'repeat'), px, size };
}

const BULB_GAP = 1.2, BULB_SIZE = 1.1, HEAD_CLEAR = 0.9;

/**
 * An exposed trail as a light string: the original 1.5-cell band as a soft
 * glow, a dark wire on the centreline and owner-coloured bulbs every 1.2 cells,
 * measured from the trail's start so they never slide as it grows.
 */
export function drawLightTrail(ctx: CanvasRenderingContext2D, trail: readonly number[], hx: number, hy: number, cell: number, edge: string, pastel: string, bulb: HTMLCanvasElement, view: { x0: number; y0: number; x1: number; y1: number }): void {
  ctx.beginPath();
  ctx.moveTo(trail[0], trail[1]);
  for (let i = 2; i < trail.length; i += 2) ctx.lineTo(trail[i], trail[i + 1]);
  ctx.lineTo(hx, hy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = edge; ctx.lineWidth = 1.5 + 2 / cell; ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = pastel; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#1f3326'; ctx.lineWidth = 0.11; ctx.stroke();
  // Bulbs along the polyline (trail points then the live head).
  const n = trail.length / 2;
  let carry = BULB_GAP / 2;
  for (let i = 0; i < n; i++) {
    const ax = trail[i * 2], ay = trail[i * 2 + 1];
    const bx = i + 1 < n ? trail[i * 2 + 2] : hx, by = i + 1 < n ? trail[i * 2 + 3] : hy;
    const len = Math.hypot(bx - ax, by - ay);
    while (carry <= len) {
      const t = carry / len, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      // Only bulbs in view are blitted.
      if (x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1 && Math.hypot(hx - x, hy - y) > HEAD_CLEAR) ctx.drawImage(bulb, x - BULB_SIZE / 2, y - BULB_SIZE / 2, BULB_SIZE, BULB_SIZE);
      carry += BULB_GAP;
    }
    carry -= len;
  }
}

/** The arena edge as a candy-cane ring. */
export function drawCandyRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 0.75; ctx.strokeStyle = XMAS.fur; ctx.stroke();
  ctx.setLineDash([1.1, 1.1]); ctx.lineCap = 'butt'; ctx.strokeStyle = XMAS.red; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(cx, cy, r + 0.42, 0, Math.PI * 2);
  ctx.lineWidth = 0.1; ctx.strokeStyle = XMAS.redDark; ctx.stroke();
}
