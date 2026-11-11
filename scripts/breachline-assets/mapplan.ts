/** Top-down plan of the map before and after the fill pass, for the planner's greybox gate (map-fill plan, 7.A.3),
 * and the section 2 measures as a markdown table.
 *
 *   npx vite-node scripts/breachline-assets/mapplan.ts -- <out.png>
 */
import sharp from 'sharp';
import { CELL } from '../../src/games/breachline/config';
import { MAP } from '../../src/games/breachline/map';
import type { Box } from '../../src/games/breachline/world';
import { baseline, corridorSight, fill, isFurniture, measures, violations } from '../../tests/games/breachline/mapfill';

const out = process.argv[process.argv.length - 1].endsWith('.png') ? process.argv[process.argv.length - 1] : 'mapplan.png';
const B = MAP.bounds, K = 16.5, W = Math.round((B.x1 - B.x0) * K), H = Math.round((B.z1 - B.z0) * K), PAD = 34;
const X = (x: number) => ((x - B.x0) * K).toFixed(1), Z = (z: number) => ((z - B.z0) * K).toFixed(1);
const rect = (b: { x0: number; z0: number; x1: number; z1: number }, fillc: string, stroke = 'none', sw = 0) => `<rect x="${X(b.x0)}" y="${Z(b.z0)}" width="${((b.x1 - b.x0) * K).toFixed(1)}" height="${((b.z1 - b.z0) * K).toFixed(1)}" fill="${fillc}" stroke="${stroke}" stroke-width="${sw}"/>`;

function plan(boxes: Box[], added: Set<Box>, title: string, sight: ReturnType<typeof corridorSight>): string {
  const g: string[] = [`<rect width="${W}" height="${H}" fill="#f4f2ec"/>`];
  for (const r of MAP.rooms) g.push(rect(r, 'none', '#c9c4b8', 1));
  for (const s of MAP.sites) g.push(rect(s, 'rgba(240,190,40,0.18)', '#d29a10', 2));
  for (const b of boxes) {
    if (!b.solid && !b.draw) continue;
    if (b.y0 >= 3) continue;
    const wall = b.mat === 'brick' || b.mat === 'plaster' || b.mat === 'trim' || (b.mat === 'concrete' && b.y1 > 3);
    if (wall) { g.push(rect(b, '#55524c')); continue; }
    if (!isFurniture(b)) continue;
    const isNew = added.has(b), full = b.y1 >= 1.75;
    g.push(rect(b, isNew ? (full ? '#1f4fa8' : '#6fa8e8') : (full ? '#6b6b6b' : '#a9a9a4'), isNew ? '#0b2a66' : '#555', isNew ? 1.4 : 0.6));
    if (isNew && label.get(b)) g.push(`<text x="${X((b.x0 + b.x1) / 2)}" y="${Z(b.z1)}" dy="9" font-size="8.5" font-family="sans-serif" text-anchor="middle" fill="#0b2a66" stroke="#f4f2ec" stroke-width="2.5" paint-order="stroke">${label.get(b)}</text>`);
  }
  for (const p of MAP.panels) {
    const a = p.u0, b = p.u0 + p.cols * CELL, col = p.kind === 'door' ? '#2e9a3e' : p.kind === 'window' ? '#2a8fd6' : '#e07a1f';
    const [x1, z1, x2, z2] = p.axis === 'x' ? [a, p.pos, b, p.pos] : [p.pos, a, p.pos, b];
    g.push(`<line x1="${X(x1)}" y1="${Z(z1)}" x2="${X(x2)}" y2="${Z(z2)}" stroke="${col}" stroke-width="${p.kind === 'wall' ? 2.5 : 4}"/>`);
  }
  for (const s of MAP.attackSpawns.flatMap(g => g.points)) g.push(`<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="4" fill="#d22"/>`);
  for (const s of MAP.defendSpawns) g.push(`<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="4" fill="#1a8a2a"/>`);
  for (const p of [...MAP.posts[0], ...MAP.posts[1], ...MAP.roam]) g.push(`<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="3.2" fill="none" stroke="#8a2bb0" stroke-width="1.6"/>`);
  for (const r of [...MAP.reinforce[0], ...MAP.reinforce[1]]) g.push(`<text x="${X(r.x)}" y="${Z(r.z)}" font-size="10" text-anchor="middle" dominant-baseline="middle" fill="#8a2bb0">x</text>`);
  g.push(`<line x1="${X(sight.x0)}" y1="${Z(sight.z)}" x2="${X(sight.x1)}" y2="${Z(sight.z)}" stroke="#e01" stroke-width="2" stroke-dasharray="6 3"/>`);
  for (const r of MAP.rooms) g.push(`<text x="${X(r.x0 + 0.3)}" y="${Z(r.z0 + 0.7)}" font-size="11" font-family="sans-serif" fill="#77736a">${r.name}</text>`);
  return `<g transform="translate(0,${PAD})">${g.join('')}</g><text x="8" y="22" font-size="17" font-family="sans-serif" font-weight="600" fill="#222">${title}</text>`;
}
const legend = `<g font-family="sans-serif" font-size="12" fill="#222">${[
  ['#a9a9a4', 'existing waist-high'], ['#6b6b6b', 'existing full-height'], ['#6fa8e8', 'new waist-high (0.9-1.1 m)'], ['#1f4fa8', 'new full-height (1.8 m+)'],
  ['#e07a1f', 'destructible wall'], ['#2e9a3e', 'door'], ['#2a8fd6', 'window'], ['#d22', 'attack spawn'], ['#1a8a2a', 'defend spawn'], ['#8a2bb0', 'bot post / reinforce x'], ['#e01', 'longest corridor sight line'],
].map(([c, t], i) => `<rect x="${8 + (i % 4) * 238}" y="${8 + Math.floor(i / 4) * 18}" width="12" height="12" fill="${c}"/><text x="${24 + (i % 4) * 238}" y="${18 + Math.floor(i / 4) * 18}">${t}</text>`).join('')}</g>`;

const added = new Set(fill());
/** Set-piece names from the trailing comments in map.ts's fill block, in box order. */
const SRC = (await import('node:fs')).readFileSync(new URL('../../src/games/breachline/map.ts', import.meta.url), 'utf8');
const NAMES = (SRC.split('// --- fill pass 2026-11-11 ---')[1] ?? '').split('// --- end fill pass ---')[0].split('\n').filter(l => l.trim().startsWith('box(')).map(l => (l.split('//')[1] ?? '').trim());
const label = new Map(fill().map((b, i) => [b, NAMES[i] ?? '']));
const before = plan(baseline, new Set(), `Before: ${baseline.filter(isFurniture).length} furniture boxes; corridor sight line ${corridorSight(baseline).length.toFixed(1)} m`, corridorSight(baseline));
const after = plan(MAP.boxes, added, `After: ${MAP.boxes.filter(isFurniture).length} furniture boxes (${added.size} new); corridor sight line ${corridorSight().length.toFixed(1)} m`, corridorSight());
const LH = 64, total = H + PAD;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LH + total * 2}"><rect width="100%" height="100%" fill="#fff"/>${legend}<g transform="translate(0,${LH})">${before}</g><g transform="translate(0,${LH + total})">${after}</g></svg>`;
const png = await sharp(Buffer.from(svg)).resize({ width: 960 }).png({ palette: true, colours: 64, effort: 10 }).toBuffer();
await (await import('node:fs/promises')).writeFile(out, png);
console.log(`${out}: ${png.length} bytes`);
console.log('| Area | Floor m² | Furniture boxes | Per 10 m² | Largest empty rectangle | Within target |\n| --- | --- | --- | --- | --- | --- |');
for (const m of measures()) console.log(`| ${m.name} | ${m.floor} | ${m.objects} | ${m.per10} | ${m.empty} m | ${m.withinTarget ? 'yes' : 'no'} |`);
const v = violations();
console.log(`rule breaches: ${v.length}`); for (const l of v) console.log('  ' + l);
