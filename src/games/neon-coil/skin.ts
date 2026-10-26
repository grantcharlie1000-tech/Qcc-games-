import type { Point } from './model';
export interface Skin { primary: string; head: string; bands: readonly string[]; bandWidth: number }
const player: Skin = { primary: '#22d3ee', head: '#1041b1', bands: ['#0f4fd6','#1a8cf0','#22d3ee','#148ec8'], bandWidth: 1.4 };
const skins: Record<string, Skin> = {
  '#b9f655': { primary: '#5be12c', head: '#168934', bands: ['#20ac43','#59db46','#18bc55'], bandWidth: 1.4 },
  '#6bdcf5': { primary: '#d3edf4', head: '#a4b8c8', bands: ['#edf5f7','#b4c4ce','#edf5f7','#38bad4'], bandWidth: .7 },
  '#f5a2d4': { primary: '#ec61dd', head: '#7334bc', bands: ['#9033d8','#4951d8','#d54be2','#ee69c7'], bandWidth: 1.4 },
  '#a99bff': { primary: '#b094ff', head: '#6233bd', bands: ['#793bd8','#ac7cf3','#6857de'], bandWidth: 1.4 },
  '#ffc66d': { primary: '#ffc52e', head: '#ca6514', bands: ['#ed861b','#ffcf32','#ffa51e'], bandWidth: 1.4 },
  '#74e6b9': { primary: '#39e5b4', head: '#0e906d', bands: ['#13ac92','#3eddb2','#4acb6c'], bandWidth: 1.4 },
  '#ff817f': { primary: '#ff7e83', head: '#c43349', bands: ['#ee4259','#ff8c81','#f76149'], bandWidth: 1.4 }
};
export const SKINS: readonly Skin[] = [player, ...Object.values(skins)];
export const skinFor = (id: number, color: string): Skin => id === 0 ? player : skins[color] ?? skins['#b9f655'];
export const bandIndex = (distance: number, diameter: number, count: number, width = 1.4) => Math.floor(distance / (diameter * width)) % count;
export interface Stamp extends Point { distance: number }
export interface StampBuffer { points: Stamp[]; count: number; length: number }
// Replace body[0] with the interpolated head. Keep a pooled array: count, not
// array length, is the active range, so shrinking/growing never churns objects.
export function resampleBody(body: readonly Point[], head: Point, spacing: number, out: StampBuffer) {
  out.count = 0; out.length = 0;
  if (!body.length || spacing <= 0) return;
  const emit = (x: number, y: number, distance: number) => {
    const i = out.count++, p = out.points[i] ?? (out.points[i] = { x: 0, y: 0, distance: 0 });
    p.x = x; p.y = y; p.distance = distance;
  };
  emit(head.x, head.y, 0);
  let ax = head.x, ay = head.y, next = spacing, traversed = 0;
  for (let i = 1; i < body.length; i++) {
    const b = body[i], dx = b.x - ax, dy = b.y - ay, length = Math.hypot(dx, dy);
    if (length > 0) while (next <= traversed + length + 1e-8) {
      const t = Math.min(1, (next - traversed) / length); emit(ax + dx * t, ay + dy * t, next); next += spacing;
    }
    traversed += length; ax = b.x; ay = b.y;
  }
  out.length = traversed;
}
