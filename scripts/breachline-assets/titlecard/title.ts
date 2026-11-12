/** The Breachline title: two lines of extruded voxel lettering, 190 × 130 like Last Light's title. */
import { LETTER } from './palette.ts';
import { hash } from './voxel.ts';

const FONT: Record<string, string[]> = {
  B: ['1110', '1001', '1001', '1110', '1001', '1001', '1110'],
  R: ['1110', '1001', '1001', '1110', '1010', '1001', '1001'],
  E: ['1111', '1000', '1000', '1110', '1000', '1000', '1111'],
  A: ['0110', '1001', '1001', '1111', '1001', '1001', '1001'],
  C: ['0111', '1000', '1000', '1000', '1000', '1000', '0111'],
  H: ['1001', '1001', '1001', '1111', '1001', '1001', '1001'],
  L: ['1000', '1000', '1000', '1000', '1000', '1000', '1111'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  N: ['1001', '1101', '1101', '1011', '1011', '1001', '1001'],
};

const C = 10, CH = 14, E = 4; // cell width, cell height and extrusion in lattice units
type Pt = [number, number];
const K = (p: Pt) => `${p[0]},${p[1]}`;

/** Union of polygons that share whole edges: shared edges cancel, the rest chain into loops. */
function union(polys: Pt[][]): Pt[][] {
  const edges = new Map<string, [Pt, Pt]>();
  for (const poly of polys) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], back = `${K(b)}>${K(a)}`;
    if (edges.has(back)) edges.delete(back); else edges.set(`${K(a)}>${K(b)}`, [a, b]);
  });
  const next = new Map<string, Pt[]>();
  for (const [a, b] of [...edges.values()].sort((p, q) => p[0][0] - q[0][0] || p[0][1] - q[0][1] || p[1][0] - q[1][0] || p[1][1] - q[1][1])) {
    const l = next.get(K(a)) ?? []; l.push(b); next.set(K(a), l);
  }
  const loops: Pt[][] = [];
  for (const start of [...next.keys()].sort()) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const ring: Pt[] = [];
      let v = start;
      do { const b = next.get(v)!.shift()!; ring.push(b); v = K(b); } while (v !== start);
      loops.push(ring.filter((p, i) => {
        const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      }));
    }
  }
  return loops;
}

export function generateTitle(): { svg: string; polygons: number } {
  const cells: { x: number; y: number; ramp: readonly string[] }[] = [];
  const word = (text: string, row: number, ramp: readonly string[]) => {
    let col = 0;
    for (const ch of text) {
      FONT[ch].forEach((line, j) => [...line].forEach((bit, i) => { if (bit === '1') cells.push({ x: col + i, y: row + j, ramp }); }));
      col += FONT[ch][0].length + 1;
    }
  };
  word('BREACH', 0, LETTER.ink);
  word('LINE', 8.5, LETTER.accent);
  const kept = cells, at = new Set(kept.map((c) => `${c.x},${c.y}`));
  const layers: Record<string, Pt[][]> = {};
  const add = (fill: string, poly: Pt[]) => (layers[fill] ??= []).push(poly);
  for (const { x, y, ramp } of kept) {
    const X = x * C, Y = y * CH;
    if (!at.has(`${x},${y + 1}`)) add(ramp[2], [[X, Y + CH], [X + C, Y + CH], [X + C + E, Y + CH + E], [X + E, Y + CH + E]]);
    if (!at.has(`${x + 1},${y}`)) add(ramp[1], [[X + C, Y], [X + C + E, Y + E], [X + C + E, Y + CH + E], [X + C, Y + CH]]);
    add(ramp[0], [[X, Y], [X + C, Y], [X + C, Y + CH], [X, Y + CH]]);
  }
  // Chips blown out of the open mouth of the C, flying right and down toward LINE.
  const chips: string[] = [];
  const cx = 21; // first column of the C
  for (let i = 0; i < 9; i++) {
    const t = (i + hash(i, 0, 0, 3)) / 9;
    const x = (cx + 1.6 + t * t * 9 + hash(i, 1, 0, 3) * 0.6) * C, y = (2.4 + t * 11) * CH, s = (1.1 - 0.6 * t) * C;
    const ramp = i % 3 === 2 ? LETTER.accent : LETTER.ink;
    chips.push(`<path fill="${ramp[1]}" d="M${n(x + s)} ${n(y)}l${n(E * 0.6)} ${n(E * 0.6)}v${n(s)}l-${n(E * 0.6)} -${n(E * 0.6)}Z"/><path fill="${ramp[0]}" d="M${n(x)} ${n(y)}h${n(s)}v${n(s)}h-${n(s)}Z"/>`);
  }
  // Lattice to viewBox: 34 columns of lettering fill the 190 width.
  const k = Math.min(186 / (33 * C + E), 126 / (15.5 * CH + E)), ox = 2, oy = 2;
  const sc = (p: Pt) => `${n(ox + p[0] * k)} ${n(oy + p[1] * k)}`;
  let polygons = 0, body = '';
  for (const fill of [LETTER.ink[2], LETTER.accent[2], LETTER.ink[1], LETTER.accent[1], LETTER.ink[0], LETTER.accent[0]]) {
    const loops = union(layers[fill] ?? []);
    polygons += loops.length;
    body += `<path fill="${fill}" stroke="${fill}" d="${loops.map((l) => 'M' + l.map(sc).join(' ') + 'Z').join('')}"/>`;
  }
  const chipSvg = `<g transform="translate(${ox} ${oy}) scale(${n(k, 4)})">${chips.join('')}</g>`;
  polygons += chips.length * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 130" role="img" aria-labelledby="bl-title-t bl-title-d"><title id="bl-title-t">Breachline</title><desc id="bl-title-d">Voxel lettering: BREACH in cream with chips blown out of the A, LINE in amber.</desc><g stroke-width=".4" stroke-linejoin="round">${body}</g>${chipSvg}</svg>
`;
  return { svg, polygons };
}

function n(v: number, digits = 1): string { const p = 10 ** digits, r = Math.round(v * p) / p; return Object.is(r, -0) ? '0' : String(r); }
