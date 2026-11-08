// Generates every library poster in public/game-art/<id>/cover.svg as an isometric voxel diorama.
//   node scripts/generate-posters.mjs            (all posters, then syncs card colours in src/core/catalog.ts)
//   node scripts/generate-posters.mjs snake pool (only these)
//
// Visual direction (see docs/ARTWORK.md), taken from the Blockcraft and Crossy Road covers:
//  - Every subject is a real voxel model, rendered with one 2:1 isometric projection.
//  - Faces are flat colours: top lightest, left (+y) the base colour, right (+x) darkest. No outlines,
//    gradients, blurs or drop shadows.
//  - Details are pixel "textures" painted onto block faces, including all lettering (a 3×5 pixel font).
//  - The diorama floats on a flat backdrop with square pixel particles; the top 130 units stay clear for the title.
import {readFile, writeFile} from 'node:fs/promises';

const W = 320, H = 410;
const FIT = {x0: 14, x1: 306, y0: 138, y1: 396, maxA: 22};
export const TITLE_INK = '#fff3df';

// Base block colours. Faces are shaded from these automatically.
const C = {
  white: '#f2f5fa', cream: '#f4e6c8', snow: '#e4edf7', paper: '#fbf4e4',
  red: '#e8474f', orange: '#f59331', yellow: '#f7c531', gold: '#e9b023', lime: '#9ad547',
  green: '#4fb548', grass: '#62bc45', leaf: '#3f9a3a', dkgreen: '#2e7d3a', teal: '#25b6a6',
  sky: '#55b9ea', blue: '#3f7ee8', navy: '#283a6e', purple: '#8a5ae8', pink: '#f05fa6', magenta: '#c548d8',
  dirt: '#93603a', wood: '#b07a45', dkwood: '#7a4f2b', felt: '#2f9a63', stone: '#8d96a6', slate: '#5f6a80',
  dark: '#2b2f45', ink: '#1d1a2c', black: '#26232f', grey: '#9aa1ae', water: '#4aa6e0', glass: '#dff3ff',
  blush: '#f4a9c6', rose: '#e47ca4', maroon: '#7c2445', skin: '#f7d3b8', hair: '#80502f', tights: '#3e2f3c',
  lilac: '#c4b2ec', mint: '#a9dcc0', ice: '#aebde8',
};
// Backdrop hue and title accent per game. Card colours in src/core/catalog.ts derive from these.
export const POSTERS = {
  'color-blocks': {hue: 250, accent: C.yellow, title: 'A voxel puzzle board half filled with coloured blocks and a T piece hovering above'},
  'water-sort':   {hue: 290, accent: C.pink,   title: 'Three voxel glass tubes holding stacked bands of coloured water'},
  'fruit-merge':  {hue: 195, accent: C.red,    title: 'A blocky watermelon, orange and cherries on a wooden crate'},
  'tower':        {hue: 325, accent: C.teal,   title: 'A tower of stacked voxel slabs with the next slab sliding in'},
  'flappy-bird':  {hue: 30,  accent: C.yellow, title: 'A blocky yellow bird flapping between two green pipes'},
  'ball-run':     {hue: 265, accent: C.pink,   title: 'A voxel ball rolling down a neon-edged track past obstacles'},
  'animal-stack': {hue: 175, accent: C.yellow, title: 'A blocky elephant, lion and penguin balanced in a tower'},
  'snake':        {hue: 42,  accent: C.red,    title: 'A voxel snake slithering across a grass board towards an apple'},
  'neon-coil':    {hue: 240, accent: C.lime,   title: 'A glowing voxel worm weaving between bright energy orbs'},
  'minesweeper':  {hue: 200, accent: C.red,    title: 'A voxel minefield of raised tiles with numbers and flags'},
  'solitaire':    {hue: 345, accent: C.cream,  title: 'Four blocky playing cards fanned on green felt'},
  'block-fill':   {hue: 280, accent: C.yellow, title: 'A golden path of raised blocks winding through a tile grid'},
  'color-connect':{hue: 300, accent: C.yellow, title: 'Coloured voxel pipes linking pairs of matching pegs on a board'},
  'pool':         {hue: 158, accent: C.yellow, title: 'A voxel pool table with a rack of balls, the cue ball and a cue'},
  'globle':       {hue: 212, accent: C.yellow, title: 'A voxel globe with guessed countries shaded from cream to deep red'},
  'blockcraft':   {hue: 205, accent: C.green,  title: 'A floating grass island with a tree, flowers, water and a sheep'},
  'maze-muncher': {hue: 245, accent: C.teal,   title: 'A blocky muncher chasing pellets through a maze past a ghost'},
  'corn-clicker': {hue: 95,  accent: C.yellow, title: 'A giant voxel corn cob with floating plus-one coins'},
  'slipline':     {hue: 268, accent: C.teal,   title: 'A board of arrow tiles with one tile sliding free'},
  'quadfall':     {hue: 222, accent: C.orange, title: 'A wall of stacked coloured blocks with a T piece falling in'},
  'fivefold':     {hue: 150, accent: C.green,  title: 'Letter blocks spelling PLANT above PLAYS solved in green'},
  'claimline':    {hue: 330, accent: C.pink,   title: 'A voxel arena of coloured territories with a trail looping out'},
  'crossy-road':  {hue: 200, accent: C.red,    title: 'A voxel chicken in a Santa hat hopping across snow, road and river'},
  'quad-clash':   {hue: 22,  accent: C.yellow, title: 'A blocky egg fighter in a yellow headband holding a pencil blaster'},
  'femboy-obby':  {hue: 256, accent: C.pink,   title: 'A blocky boy in a pink cat-ear beanie and snowflake jumper hopping across gift boxes in the snow'},
  'drift-club':   {hue: 183, accent: C.yellow, title: 'A voxel harbour shuffleboard with coral and blue pucks, a bullseye and a striped lighthouse'},
};

// ---------- colour ----------
function toHsl(hex) {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(...v), min = Math.min(...v), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = d / (1 - Math.abs(2 * l - 1));
  const [r, g, b] = v, h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}
function hex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}
const shift = (c, dl, ds = 0) => { const [h, s, l] = toHsl(c); return hex(h, Math.max(0, Math.min(100, s + ds)), Math.max(0, Math.min(100, l + dl))); };
const SHADE = {top: c => shift(c, 9), left: c => c, right: c => shift(c, -13, -4)};
export const backdrop = hue => hex(hue, 42, 21);

// ---------- pixel font (3×5) and pixel icons ----------
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], A: ['010', '101', '111', '101', '101'], J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'], N: ['101', '111', '111', '101', '101'],
  P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'], S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'], Y: ['101', '101', '010', '010', '010'], '+': ['000', '010', '111', '010', '000'],
};
const ICON = {
  heart: ['01010', '11111', '11111', '01110', '00100'], diamond: ['00100', '01110', '11111', '01110', '00100'],
  spade: ['00100', '01110', '11111', '00100', '01110'], club: ['01110', '01110', '11111', '00100', '01110'],
  up: ['00100', '01110', '10101', '00100', '00100'], flag: ['01110', '01111', '01110', '00000', '00000'],
  arrow: ['00100', '01110', '11111', '00100', '00100', '00100'],
  cross: ['10001', '01010', '00100', '01010', '10001'], dot: ['0110', '1111', '1111', '0110'],
};
const rot = (rows, turns) => { // rotate a pixel glyph clockwise
  let r = rows;
  for (let t = 0; t < turns; t++) r = [...r[0]].map((_, i) => r.map(row => row[i]).reverse().join(''));
  return r;
};

// ---------- voxel scene ----------
const key = (x, y, z) => `${x},${y},${z}`;
class Scene {
  constructor() { this.v = new Map(); this.paints = []; }
  set(x, y, z, c, o = {}) { if (c) this.v.set(key(x, y, z), {x, y, z, c, ...o}); else this.v.delete(key(x, y, z)); return this; }
  get(x, y, z) { return this.v.get(key(x, y, z)); }
  box(x0, y0, z0, dx, dy, dz, c, o) {
    for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++)
      this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, o);
    return this;
  }
  ball(cx, cy, cz, r, c) { // voxels whose centres fall inside the sphere
    for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++)
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 + (z + .5 - cz) ** 2 <= r * r) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c);
    return this;
  }
  // A pixel glyph painted on a block face: origin + u·col + v·row places each pixel in world space. Each pixel is
  // drawn straight after the frontmost block whose face it touches (`at` is only a fallback), so later blocks
  // never paint over it.
  paint(at, origin, u, v, rows, colour) {
    rows.forEach((row, j) => [...row].forEach((bit, i) => {
      if (bit !== '1') return;
      const p = (a, b) => origin.map((o, k) => o + u[k] * a + v[k] * b);
      this.paints.push({colour, at, quad: [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)]});
    }));
    return this;
  }
  // Glyph lying on the top face at height z, centred on tile (x, y) (or on `centre`). Columns run straight
  // across the screen and rows run down it, foreshortened like floor markings. px is the pixel width in tiles.
  top(x, y, z, rows, colour, px = .17, centre = [x + .5, y + .5], at) {
    const u = [px / 2, -px / 2, 0], v = [px * .8, px * .8, 0], w = rows[0].length, h = rows.length;
    const o = [0, 1, 2].map(k => [centre[0], centre[1], z + .001][k] - u[k] * w / 2 - v[k] * h / 2);
    return this.paint(at ?? [x, y, z - 1], o, u, v, rows, colour);
  }
  // Glyph on the top face aligned with the grid (columns along +x, rows along +y), like a road marking.
  floor(x, y, z, rows, colour, px = 1 / 7) {
    const w = rows[0].length * px, h = rows.length * px;
    return this.paint([x, y, z - 1], [x + (1 - w) / 2, y + (1 - h) / 2, z + .001], [px, 0, 0], [0, px, 0], rows, colour);
  }
  // A flat rectangle painted on the top face at height z, aligned with the grid (road markings, stripes).
  stripe(x0, y0, x1, y1, z, colour, at) { return this.paint(at, [x0, y0, z + .002], [x1 - x0, 0, 0], [0, y1 - y0, 0], ['1'], colour); }
  // Glyph on the left (+y) face of voxel (x, y, z): columns along +x, rows downwards.
  left(x, y, z, rows, colour, px = 1 / 7) {
    const w = rows[0].length * px, h = rows.length * px;
    return this.paint([x, y, z], [x + (1 - w) / 2, y + 1.001, z + 1 - (1 - h) / 2], [px, 0, 0], [0, 0, -px], rows, colour);
  }
  // Glyph on the right (+x) face of voxel (x, y, z): columns along -y, rows downwards.
  right(x, y, z, rows, colour, px = 1 / 7) {
    const w = rows[0].length * px, h = rows.length * px;
    return this.paint([x, y, z], [x + 1.001, y + 1 - (1 - w) / 2, z + 1 - (1 - h) / 2], [0, -px, 0], [0, 0, -px], rows, colour);
  }
}

const n = v => +(+v).toFixed(1); // one decimal is sub-pixel at poster size
function render(scene) {
  const solid = (x, y, z) => { const v = scene.get(x, y, z); return v && !v.alpha; };
  const faces = [], decals = new Map();
  for (const d of scene.paints) { // attach each painted pixel to the frontmost block face under it
    const xs = d.quad.map(p => p[0]), ys = d.quad.map(p => p[1]), zs = d.quad.map(p => p[2]);
    const flat = (a) => Math.max(...a) - Math.min(...a) < 1e-6;
    const side = flat(zs) ? 'top' : flat(ys) ? 'left' : 'right';
    const span = a => { const lo = Math.min(...a), hi = Math.max(...a); const out = []; for (let c = Math.floor(lo + 1e-6); c < hi - 1e-6; c++) out.push(c); return out.length ? out : [Math.floor(lo)]; };
    const cand = [];
    if (side === 'top') { const z = Math.round(zs[0]) - 1; for (const x of span(xs)) for (const y of span(ys)) cand.push([x, y, z]); }
    if (side === 'left') { const y = Math.round(ys[0]) - 1; for (const x of span(xs)) for (const z of span(zs)) cand.push([x, y, z]); }
    if (side === 'right') { const x = Math.round(xs[0]) - 1; for (const y of span(ys)) for (const z of span(zs)) cand.push([x, y, z]); }
    const found = cand.filter(c => scene.get(...c)).sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]))[0] ?? d.at;
    if (!found) throw new Error('Painted pixel is not on any block');
    const k = key(...found); decals.set(k, [...(decals.get(k) ?? []), {side, ...d}]);
  }
  const voxels = [...scene.v.values()].sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z) || a.z - b.z || a.x - b.x);
  for (const v of voxels) {
    const {x, y, z} = v, mat = typeof v.c === 'string' ? {top: v.c, left: v.c, right: v.c} : v.c;
    const add = (side, pts) => faces.push({fill: SHADE[side](mat[side]), alpha: v.alpha, pts});
    const hide = (a, b, c) => v.alpha ? scene.get(a, b, c) : solid(a, b, c);
    if (!hide(x, y, z + 1)) add('top', [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]);
    if (!hide(x, y + 1, z)) add('left', [[x, y + 1, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x, y + 1, z]]);
    if (!hide(x + 1, y, z)) add('right', [[x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x + 1, y + 1, z], [x + 1, y, z]]);
    if (mat.band) { // grass-style blocks: a coloured strip along the top of each visible side
      if (!hide(x, y + 1, z)) faces.push({fill: SHADE.left(mat.band), pts: [[x, y + 1.001, z + 1], [x + 1, y + 1.001, z + 1], [x + 1, y + 1.001, z + .7], [x + .5, y + 1.001, z + .62], [x, y + 1.001, z + .7]]});
      if (!hide(x + 1, y, z)) faces.push({fill: SHADE.right(mat.band), pts: [[x + 1.001, y, z + 1], [x + 1.001, y + 1, z + 1], [x + 1.001, y + 1, z + .7], [x + 1.001, y + .5, z + .62], [x + 1.001, y, z + .7]]});
    }
    for (const d of decals.get(key(x, y, z)) ?? []) faces.push({fill: SHADE[d.side](d.colour), pts: d.quad});
  }
  // Fit the projected model into the poster's stage area.
  const proj = ([x, y, z]) => [x - y, (x + y) / 2 - z];
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const f of faces) for (const p of f.pts) { const [px, py] = proj(p); bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py); }
  const a = Math.min((FIT.x1 - FIT.x0) / (bx1 - bx0), (FIT.y1 - FIT.y0) / (by1 - by0), FIT.maxA);
  const ox = (FIT.x0 + FIT.x1) / 2 - a * (bx0 + bx1) / 2, oy = FIT.y1 - a * by1 - Math.max(0, ((FIT.y1 - FIT.y0) - a * (by1 - by0)) * .35);
  // Merge consecutive faces with the same paint into one path (svg-skill optimisation rule).
  let out = '', run = null;
  // Opaque faces are also stroked in their own colour: neighbouring faces then overlap by a hair, which hides the
  // anti-aliasing seams that would otherwise draw a grid over every flat surface.
  const flush = () => { if (run) out += `<path fill="${run.fill}"${run.alpha ? ` fill-opacity="${run.alpha}"` : ` stroke="${run.fill}"`} d="${run.d}"/>`; run = null; };
  for (const f of faces) {
    const d = 'M' + f.pts.map(p => { const [px, py] = proj(p); return `${n(ox + a * px)} ${n(oy + a * py)}`; }).join(' ') + 'Z';
    if (run && run.fill === f.fill && run.alpha === f.alpha) run.d += d; else { flush(); run = {fill: f.fill, alpha: f.alpha, d}; }
  }
  flush();
  out = `<g stroke-width="${n(Math.min(1.2, a * .08))}" stroke-linejoin="round">${out}</g>`;
  return {svg: out, box: [ox + a * bx0, oy + a * by0, ox + a * bx1, oy + a * by1]};
}

// ---------- helpers for scenes ----------
const GRASS = {top: C.grass, left: C.dirt, right: C.dirt, band: C.grass};
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// An island base: a top layer over `depth` layers of an under-colour.
const island = (s, x0, y0, w, d, top, under, depth = 2, z0 = 0) => s.box(x0, y0, z0 - depth, w, d, depth, under).box(x0, y0, z0, w, d, 1, top);
const EYE = ['0110', '1111', '1101', '0110'];
// Two eyes on the right (+x) face of a creature whose front column is x, at height z, centred on rows y1 and y2.
const eyesRight = (s, x, y1, y2, z) => { s.right(x, y1, z, EYE, C.white).right(x, y2, z, EYE, C.white); };
const pupilsRight = (s, x, y1, y2, z) => { s.right(x, y1, z, ['11', '11'], C.ink).right(x, y2, z, ['11', '11'], C.ink); };

// ---------- scenes ----------
const art = {};

art['color-blocks'] = s => {
  island(s, 0, 0, 8, 8, C.dark, C.navy, 1);
  const grid = ['b..ypr..', 'bbgy.rr.', 'pbggyrr.', 'pp.gbrpp', 'yp..bbpp', 'yyg..bbr', 'ggg.y.rr', '.g..yyrr'];
  const map = {b: C.blue, y: C.yellow, p: C.purple, r: C.red, g: C.green};
  grid.forEach((row, j) => [...row].forEach((k, i) => { if (k !== '.') s.set(i, j, 1, map[k]); }));
  for (const [i, j] of [[2, 0], [3, 0], [4, 0], [3, 1]]) s.set(i + 1, j + 1, 5, C.orange);
};

art['water-sort'] = s => {
  island(s, 0, 0, 13, 5, C.wood, C.dkwood, 1);
  const tubes = [[0, [C.blue, C.pink, C.yellow, C.blue]], [4, [C.yellow, C.teal, C.pink]], [8, [C.teal, C.pink, C.blue, C.yellow]]];
  for (const [x0, bands] of tubes) {
    const xs = x0 + 1;
    for (let z = 1; z <= 10; z++) for (let x = xs; x < xs + 3; x++) for (let y = 1; y < 4; y++) {
      const band = Math.floor((z - 1) / 2);
      if (band < bands.length) s.set(x, y, z, bands[band]);
      else if (z < 10) s.set(x, y, z, C.glass, {alpha: .28});
      else if (x !== xs + 1 || y !== 2) s.set(x, y, z, C.white);
    }
  }
  s.set(6, 2, 13, C.teal).set(6, 2, 15, C.teal);
};

art['fruit-merge'] = s => {
  island(s, 0, 0, 14, 11, C.wood, C.dkwood, 2);
  // Blocky fruit in merge order: striped watermelon, orange, peach and a pair of cherries.
  s.box(1, 1, 1, 7, 7, 6, (x, y, z) => z === 6 ? C.green : (x + y) % 3 === 0 ? C.dkgreen : C.green).box(2, 2, 7, 5, 5, 1, C.green).set(4, 4, 8, C.dkwood);
  s.box(9, 6, 1, 4, 4, 4, C.orange).box(10, 7, 5, 2, 2, 1, C.orange).set(10, 7, 6, C.leaf).set(11, 7, 6, C.green);
  s.box(9, 1, 1, 3, 3, 3, C.pink).set(10, 1, 4, C.pink).set(10, 2, 4, C.pink);
  s.box(3, 9, 1, 2, 1, 2, C.red).box(6, 9, 1, 1, 1, 1, C.red).set(4, 9, 3, C.dkwood).set(5, 9, 4, C.dkwood).set(6, 9, 2, C.dkwood).set(6, 9, 3, C.dkwood).set(5, 9, 5, C.leaf);
};

art['tower'] = s => {
  const cols = [C.purple, C.blue, C.sky, C.teal, C.green, C.lime, C.yellow];
  cols.forEach((c, i) => s.box(0, 0, i, 6, 6, 1, c));
  s.box(4, -1, 9, 6, 6, 1, C.orange);
};

art['flappy-bird'] = s => {
  island(s, 0, 0, 14, 6, GRASS, C.dirt, 2);
  const pipe = (x0, h) => s.box(x0, 1, 1, 3, 3, h, C.green).box(x0 - 1, 0, h + 1, 5, 5, 2, C.lime);
  pipe(1, 4); pipe(10, 2);
  s.box(5, 1, 9, 4, 4, 3, C.yellow).box(5, 1, 8, 4, 4, 1, C.cream).box(9, 2, 10, 1, 2, 1, C.orange).box(4, 2, 10, 1, 2, 2, C.gold);
  s.box(6, 5, 10, 2, 1, 1, C.gold).box(6, 6, 11, 2, 1, 1, C.gold);
  eyesRight(s, 8, 1, 4, 11);
};

art['ball-run'] = s => {
  island(s, 0, 0, 22, 6, C.dark, C.navy, 1);
  for (let x = 0; x < 22; x++) { s.set(x, 0, 1, C.pink); s.set(x, 5, 1, C.pink); if (x % 3 === 0) s.stripe(x + .15, 2.6, x + .85, 3.4, 1, C.magenta, [x, 3, 0]); }
  s.ball(15, 3, 3.4, 2.5, (x, y, z) => (z + x) % 3 ? C.purple : C.magenta);
  s.box(4, 1, 1, 2, 1, 2, C.teal).box(9, 3, 1, 2, 2, 1, C.yellow).box(20, 1, 1, 1, 1, 1, C.teal);
};

art['animal-stack'] = s => {
  island(s, 0, 0, 10, 10, GRASS, C.dirt, 2);
  // Elephant facing +x: body, ears, trunk.
  s.box(2, 2, 1, 5, 5, 4, C.stone).box(5, 1, 2, 1, 1, 3, C.slate).box(5, 7, 2, 1, 1, 3, C.slate);
  s.box(7, 4, 2, 1, 1, 2, C.stone).set(8, 4, 1, C.stone).set(7, 4, 1, C.stone);
  eyesRight(s, 6, 3, 5, 4);
  // Lion: mane block with the face pushed forward.
  s.box(2, 2, 5, 3, 5, 4, C.orange).box(5, 3, 5, 1, 3, 3, C.yellow).set(6, 4, 5, C.cream).set(3, 2, 9, C.orange).set(3, 6, 9, C.orange);
  eyesRight(s, 5, 3, 5, 7);
  s.right(6, 4, 5, ['0000', '0110', '0110', '0000'], C.dkwood);
  // Penguin on top.
  s.box(3, 3, 9, 2, 2, 3, C.black).box(5, 3, 9, 1, 2, 2, C.white).set(5, 3, 11, C.black).set(5, 4, 11, C.black).set(6, 3, 10, C.orange);
  eyesRight(s, 5, 3, 4, 11);
};

art['snake'] = s => {
  island(s, 0, 0, 12, 12, C.grass, C.dirt, 2);
  for (const v of s.v.values()) if (v.z === 0) v.c = {...GRASS, top: (v.x + v.y) % 2 ? C.grass : shift(C.grass, 6)};
  const path = [];
  for (let x = 1; x <= 9; x++) path.push([x, 9]);
  for (let y = 8; y >= 5; y--) path.push([1, y]);
  for (let x = 2; x <= 7; x++) path.push([x, 5]);
  path.forEach(([x, y], i) => s.set(x, y, 1, i % 2 ? C.green : C.dkgreen));
  s.box(8, 4, 1, 2, 2, 2, C.green).set(10, 5, 1, C.red);
  eyesRight(s, 9, 4, 5, 2);
  s.box(3, 1, 1, 2, 2, 2, C.red).set(4, 1, 3, C.dkwood).set(4, 1, 4, C.leaf).set(5, 1, 4, C.green);
};

art['neon-coil'] = s => {
  island(s, 0, 0, 13, 13, C.navy, C.ink, 1);
  for (const v of s.v.values()) if (v.z === 0) v.c = (v.x + v.y) % 2 ? C.navy : '#24305a';
  const pts = [[1, 11], [1, 10], [1, 9], [2, 9], [3, 9], [4, 9], [4, 8], [4, 7], [3, 7], [2, 7], [2, 6], [2, 5], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [7, 5], [7, 6], [8, 6], [9, 6], [10, 6], [10, 5], [10, 4], [10, 3]];
  pts.forEach(([x, y], i) => s.set(x, y, 1, i % 3 === 1 ? C.green : C.lime));
  s.box(10, 1, 1, 2, 2, 2, C.lime);
  eyesRight(s, 11, 1, 2, 2);
  for (const [x, y, z, c] of [[6, 9, 1, C.pink], [11, 10, 1, C.yellow], [5, 1, 1, C.sky], [8, 9, 2, C.orange], [0, 2, 1, C.yellow], [12, 7, 1, C.pink], [6, 7, 1, C.purple], [3, 1, 2, C.teal]]) s.set(x, y, z, c);
};

art['minesweeper'] = s => {
  island(s, 0, 0, 6, 6, C.dark, C.navy, 1);
  const map = ['##2#1.', '#3.1..', '#2.1.1', '1..1#2', '...112', '......'];
  const numCol = {1: C.blue, 2: C.green, 3: C.red};
  map.forEach((row, j) => [...row].forEach((k, i) => {
    if (k === '#') { s.box(i, j, 1, 1, 1, 2, (i + j) % 2 ? C.stone : shift(C.stone, 5)); return; }
    s.set(i, j, 1, (i + j) % 2 ? C.paper : shift(C.paper, -6));
    if (k !== '.') s.top(i, j, 2, FONT[k], numCol[k], .19);
  }));
  for (const [i, j] of [[0, 1], [3, 0], [4, 3]]) s.top(i, j, 3, ICON.flag, C.red, .24).top(i, j, 3, ['01000', '01000', '01000', '01000', '11100'], C.ink, .24);
};

art['solitaire'] = s => {
  island(s, 0, 0, 16, 6, C.felt, C.dkwood, 2);
  // Four cards standing in a fan, faces towards the viewer (+y).
  const cards = [[0, 'A', 'spade', C.ink], [4, 'K', 'heart', C.red], [8, 'Q', 'club', C.ink], [12, 'J', 'diamond', C.red]];
  cards.forEach(([x0, rank, suit, col], i) => {
    const y = 1 + i % 2;
    s.box(x0, y, 1, 3, 1, 4, C.paper);
    s.paint(null, [x0 + .25, y + 1.001, 4.75], [.2, 0, 0], [0, 0, -.2], FONT[rank], col);
    s.paint(null, [x0 + .9, y + 1.001, 3.1], [.25, 0, 0], [0, 0, -.25], ICON[suit], col);
  });
  s.box(1, 4, 1, 3, 1, 1, C.paper).box(1, 4, 2, 3, 1, 1, shift(C.paper, -6)).box(1, 4, 3, 3, 1, 1, C.blue);
};

art['block-fill'] = s => {
  island(s, 0, 0, 6, 6, C.dark, C.navy, 1);
  const trail = [[0, 5], [0, 4], [0, 3], [1, 3], [2, 3], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [4, 1], [3, 1]];
  const on = new Set(trail.map(p => p.join())), wall = new Set(['3,2', '3,3', '5,4']);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    if (wall.has(`${i},${j}`)) { s.set(i, j, 1, C.slate); s.top(i, j, 2, ICON.cross, C.dark, .17); }
    else if (on.has(`${i},${j}`)) s.box(i, j, 1, 1, 1, 2, C.yellow);
    else s.set(i, j, 1, (i + j) % 2 ? '#3a4266' : '#434c74');
  }
  s.set(3, 1, 3, C.orange);
};

art['color-connect'] = s => {
  island(s, 0, 0, 7, 7, C.dark, C.navy, 1);
  const flows = [[C.red, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]]], [C.yellow, [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2]]], [C.teal, [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [3, 4], [2, 4]]],
    [C.blue, [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [6, 5]]], [C.pink, [[1, 2], [2, 2]]], [C.orange, [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [4, 4], [5, 4], [5, 3], [6, 3]]]];
  for (const [c, pts] of flows) pts.forEach(([x, y], i) => (i === 0 || i === pts.length - 1) ? s.box(x, y, 1, 1, 1, 2, shift(c, 6)) : s.set(x, y, 1, c));
};

art['drift-club'] = s => {
  // The striped beacon and stubby pucks should still read at two-column phone size.
  island(s, 0, 0, 17, 9, C.cream, C.dkwood);
  for (let x = 0; x < 17; x++) {
    for (const y of [0, 8]) s.set(x, y, 1, x % 4 === 0 ? C.mint : C.teal);
    for (let y = 1; y < 8; y++) {
      const d = Math.hypot(x - 4, y - 4);
      const colour = d < .9 ? C.yellow : d < 1.8 ? C.teal : d < 2.8 ? C.red : d < 3.4 ? C.white : y % 2 ? C.cream : '#e3c897';
      s.set(x, y, 0, colour);
    }
  }
  s.box(0, -2, 0, 4, 3, 1, C.wood);
  for (let z = 1; z <= 6; z++) s.box(1, -2, z, 2, 2, 1, Math.floor((z-1)/2)%2 ? C.red : C.cream);
  s.box(0, -3, 7, 4, 4, 1, C.navy).box(1, -2, 8, 2, 2, 1, C.yellow);
  s.box(0, -3, 9, 4, 4, 1, C.red).box(1, -2, 10, 2, 2, 1, C.red);
  for (const [x, y, colour] of [[8, 3, C.sky], [13, 5, C.red]]) {
    s.box(x-1, y, 1, 3, 1, 1, colour).box(x, y-1, 1, 1, 3, 1, colour);
    s.top(x, y, 2, ICON.dot, C.cream, .24);
  }
  for (const x of [10, 11]) s.floor(x, 5, 1, ICON.dot, C.wood);
};

art['pool'] = s => {
  island(s, 0, 0, 13, 9, C.felt, C.dkwood, 2);
  for (let x = 0; x < 13; x++) { s.set(x, 0, 1, C.wood); s.set(x, 8, 1, C.wood); }
  for (let y = 0; y < 9; y++) { s.set(0, y, 1, C.wood); s.set(12, y, 1, C.wood); }
  for (const [x, y] of [[0, 0], [12, 0], [0, 8], [12, 8], [6, 0], [6, 8]]) s.set(x, y, 1, C.black);
  const cols = [C.yellow, C.blue, C.red, C.purple, C.orange, C.green, C.pink, C.black, C.teal, C.gold];
  let k = 0; // rack: apex towards the cue ball (high x), widening towards the back
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) s.set(6 - row, 4 - row + i * 2, 1, cols[k++]);
  s.set(9, 4, 1, C.white);
  for (let x = 10; x < 17; x++) s.set(x, 4, 2, x < 11 ? C.cream : x < 12 ? C.blue : C.wood);
};

art['globle'] = async s => {
  const world = JSON.parse(await readFile(new URL('../src/games/globle/data/world.json', import.meta.url), 'utf8'));
  const deep = '#a3242e';
  const fills = {TCD: C.green, NER: deep, LBY: deep, CMR: deep, NGA: deep, CAF: deep, SDN: C.red, EGY: C.red, DZA: C.red, ESP: C.orange, GBR: '#f8b46a', ZAF: '#f8b46a', BRA: '#fbd9a0'};
  const shapes = world.features.flatMap(f => f.polygons.map(poly => {
    const ring = poly[0]; let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    for (const [lx, ly] of ring) { x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); }
    return {id: f.id, ring, bb: [x0, x1, y0, y1]};
  }));
  const country = (lng, lat) => { // point-in-polygon on the bundled display outlines
    for (const sh of shapes) {
      const [x0, x1, y0, y1] = sh.bb;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      let inside = false;
      for (let i = 0, j = sh.ring.length - 1; i < sh.ring.length; j = i++) {
        const [xi, yi] = sh.ring[i], [xj, yj] = sh.ring[j];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return sh.id;
    }
    return null;
  };
  // Orient the globe so that 12°N 16°E (central Africa) faces the viewer. F points at the viewer,
  // R is screen-right and U is screen-up in world space.
  const norm = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
  const F = norm([1, 1, 1]), R = norm([1, -1, 0]);
  const U = norm([F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]]);
  const Up = U[2] < 0 ? U.map(c => -c) : U;
  const lat0 = 12 * Math.PI / 180, lng0 = 16 * Math.PI / 180;
  const C0 = [Math.cos(lat0) * Math.cos(lng0), Math.cos(lat0) * Math.sin(lng0), Math.sin(lat0)];
  const E0 = [-Math.sin(lng0), Math.cos(lng0), 0];
  const N0 = [-Math.sin(lat0) * Math.cos(lng0), -Math.sin(lat0) * Math.sin(lng0), Math.cos(lat0)];
  const r = 9.3, c = 9.5, dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  s.ball(c, c, c, r, (x, y, z) => {
    const p = [x + .5 - c, y + .5 - c, z + .5 - c], f = dot(p, F), u = dot(p, Up), rr = dot(p, R);
    const gv = norm([0, 1, 2].map(k => f * C0[k] + u * N0[k] + rr * E0[k]));
    const id = country(Math.atan2(gv[1], gv[0]) * 180 / Math.PI, Math.asin(gv[2]) * 180 / Math.PI);
    return id ? fills[id] ?? '#d9cfb8' : (z + x) % 5 ? C.water : shift(C.water, 4);
  });
  s.box(7, 7, -3, 6, 6, 1, C.wood).box(9, 9, -2, 2, 2, 2, C.dkwood);
};

art['blockcraft'] = s => {
  seed = 11;
  island(s, 0, 0, 12, 12, GRASS, C.dirt, 3);
  for (let x = 7; x < 12; x++) for (let y = 7; y < 12; y++) if (x + y > 15) s.set(x, y, 0, C.water);
  for (const v of s.v.values()) if (v.z < 0 && rnd() < .14) v.c = C.stone;
  s.box(3, 3, 1, 1, 1, 4, C.dkwood).box(1, 1, 5, 5, 5, 2, C.leaf).box(2, 2, 7, 3, 3, 1, C.leaf).set(3, 3, 8, C.leaf);
  for (const v of s.v.values()) if (v.c === C.leaf && rnd() < .3) v.c = C.dkgreen;
  // Sheep facing +x.
  s.box(7, 2, 2, 3, 2, 2, C.white).box(10, 2, 3, 1, 2, 2, C.grey);
  for (const [x, y] of [[7, 2], [9, 2], [7, 3], [9, 3]]) s.set(x, y, 1, C.grey);
  pupilsRight(s, 10, 2, 3, 4);
  s.set(6, 9, 1, C.red).set(2, 8, 1, C.yellow).set(9, 6, 1, C.blue);
};

art['maze-muncher'] = s => {
  island(s, 0, 0, 13, 13, C.ink, C.navy, 1);
  const walls = ['#############', '#...........#', '#.##.###.##.#', '#.#.......#.#', '#.#.##.##.#.#', '#....#.#....#', '###.#...#.###', '#...#.#.#...#', '#.###.#.###.#', '#...........#', '#############'];
  walls.forEach((row, y) => [...row].forEach((k, x) => {
    if (k === '#') s.set(x, y + 1, 1, C.blue);
    else if ((x + y) % 2 === 0 && !(y === 8 && x > 1 && x < 11)) s.top(x, y + 1, 1, ICON.dot, C.cream, .1);
  }));
  // Muncher (2×2×2 with a notch for a mouth) and a ghost, both facing +x.
  s.box(8, 9, 1, 2, 2, 2, C.yellow).set(9, 10, 1, null);
  eyesRight(s, 9, 9, 10, 2);
  s.box(3, 9, 1, 2, 2, 2, C.pink).set(4, 10, 1, null).set(3, 10, 1, null);
  eyesRight(s, 4, 9, 10, 2);
};

art['corn-clicker'] = s => {
  island(s, 0, 0, 10, 10, GRASS, C.dirt, 2);
  s.box(4, 4, 1, 3, 3, 11, (x, y, z) => ((x + y + z) % 2 ? C.yellow : C.gold));
  s.set(5, 5, 12, C.yellow);
  for (let z = 1; z <= 5; z++) { s.set(3, 5, z, C.green); s.set(5, 7, z, C.leaf); s.set(7, 5, z, C.leaf); }
  s.set(2, 5, 6, C.green).set(5, 8, 6, C.leaf).set(8, 5, 6, C.leaf);
  for (const [x, y, z] of [[1, 8, 6], [8, 1, 9], [9, 8, 3], [1, 2, 10]]) s.set(x, y, z, C.gold);
  const plus1 = FONT['+'].map((r, i) => r + '0' + FONT[1][i]);
  s.paint([2, 8, 9], [.5, 9.001, 10.2], [1 / 4, 0, 0], [0, 0, -1 / 4], plus1, C.yellow);
};

art['slipline'] = s => {
  island(s, 0, 0, 7, 7, C.dark, C.navy, 1);
  for (const v of s.v.values()) if (v.z === 0) v.c = (v.x + v.y) % 2 ? C.dark : '#333955';
  // Arrows are raised bars with a painted head on their tip block; one has slid free off the back edge.
  const dirs = {r: [1, 0, 1], l: [-1, 0, 3], d: [0, 1, 2], u: [0, -1, 0]};
  const head = ['00100', '01110', '11111'];
  const arrows = [[0, 0, 'r', 3, C.teal], [4, 1, 'd', 3, C.pink], [6, 0, 'd', 2, C.yellow], [0, 2, 'd', 3, C.purple], [1, 3, 'r', 3, C.sky], [6, 4, 'l', 3, C.orange], [1, 6, 'r', 4, C.teal], [2, 5, 'u', 2, C.yellow], [5, 6, 'u', 2, C.pink]];
  for (const [x0, y0, d, len, c] of arrows) {
    const [dx, dy, turns] = dirs[d];
    for (let i = 0; i < len; i++) s.set(x0 + dx * i, y0 + dy * i, 1, c);
    s.floor(x0 + dx * (len - 1), y0 + dy * (len - 1), 2, rot(head, turns), C.white, 1 / 6);
  }
  for (let i = 0; i < 3; i++) s.set(2, -2 - i, 2, C.lime);
  s.floor(2, -4, 3, head, C.white, 1 / 6);
};

art['quadfall'] = s => {
  const wall = ['......', '......', '......', '......', '.....g', 'b..ggg', 'bpppyr', 'bbyrrr', 'yyyr.t', 'tttt.t'];
  const map = {b: C.blue, p: C.purple, r: C.red, g: C.green, y: C.yellow, t: C.teal};
  s.box(-1, 0, 0, 8, 2, 1, C.slate).box(-1, 0, 1, 1, 2, 12, C.slate).box(6, 0, 1, 1, 2, 12, C.slate).box(-1, -1, 0, 8, 1, 13, C.dark);
  wall.forEach((row, j) => [...row].forEach((k, i) => { if (k !== '.') s.box(i, 0, 10 - j, 1, 2, 1, map[k]); }));
  for (const [i, j] of [[1, 0], [2, 0], [3, 0], [2, 1]]) s.box(i, 0, 12 - j, 1, 2, 1, C.orange);
};

art['fivefold'] = s => {
  island(s, -1, 0, 16, 4, C.dark, C.navy, 1);
  const rows = [['PLANT', 'gggxx', 3], ['PLAYS', 'ggggg', 1]];
  for (const [word, states, z] of rows) [...word].forEach((ch, i) => {
    const x = i * 2 + .0, c = {g: C.green, x: C.slate}[states[i]];
    s.box(i * 3, 1, z, 2, 2, 2, c);
    s.paint(null, [i * 3 + .56, 3.001, z + 2 - .42], [1 / 3.4, 0, 0], [0, 0, -1 / 3.4], FONT[ch], C.white);
  });
};

art['claimline'] = s => {
  const R = 8.6, c = 8.5;
  for (let x = 0; x < 17; x++) for (let y = 0; y < 17; y++) if ((x + .5 - c) ** 2 + (y + .5 - c) ** 2 <= R * R) {
    const t = x + y < 13 && x < 9 ? C.teal : x > 9 && y < 9 ? C.yellow : y > 11 ? C.purple : '#3a4266';
    s.set(x, y, -1, C.navy).set(x, y, 0, t);
  }
  const trail = [[8, 5], [9, 5], [10, 5], [11, 5], [11, 6], [11, 7], [11, 8], [11, 9], [10, 9], [9, 9], [8, 9], [7, 9]];
  trail.forEach(([x, y]) => s.set(x, y, 0, C.pink));
  s.box(7, 9, 1, 1, 1, 2, shift(C.pink, -6));
  s.right(7, 9, 2, ['0000000', '0110110', '0110110'], C.white);
  s.box(3, 4, 1, 1, 1, 2, C.teal).box(13, 3, 1, 1, 1, 2, C.gold);
};

art['crossy-road'] = s => {
  // Lanes along x, from back (low y) to front: river with a log, snow, road with a car, snow.
  s.box(0, 0, -1, 14, 3, 1, C.water).box(0, 3, -1, 14, 2, 2, C.snow).box(0, 5, -1, 14, 3, 1, '#4b5162').box(0, 8, -1, 14, 2, 2, C.snow);
  for (let x = 1; x < 14; x += 3) s.stripe(x, 6.4, x + 1.6, 6.6, 0, C.cream, [x + 1, 6, -1]);
  s.box(7, 0, 0, 6, 2, 1, C.wood).set(12, 1, 0, C.dkwood);
  s.box(1, 5, 0, 5, 2, 1, C.red).box(3, 5, 1, 2, 2, 1, C.white);
  // Chicken (2×2 footprint) with a Santa hat, hopping on the snow.
  s.box(7, 3, 2, 2, 2, 3, C.white).set(9, 3, 3, C.orange).set(9, 4, 3, C.red).set(7, 3, 1, C.orange).set(8, 4, 1, C.orange);
  s.box(7, 3, 5, 2, 2, 1, C.red).set(7, 3, 6, C.red).set(7, 3, 7, C.white);
  pupilsRight(s, 8, 3, 4, 4);
};

art['quad-clash'] = s => {
  island(s, 0, 0, 12, 12, GRASS, C.dirt, 2);
  for (const v of s.v.values()) if (v.z === 0 && v.x > 3 && v.x < 8) v.c = (v.x + v.y) % 2 ? '#c9c0ae' : '#bdb39f';
  // Egg built in steps like the Crossy Road chicken, facing +x, with a yellow headband.
  s.box(4, 4, 1, 3, 3, 1, C.cream).box(3, 3, 2, 5, 5, 5, C.cream).box(3, 3, 7, 5, 5, 1, C.yellow).box(4, 4, 8, 3, 3, 2, C.cream).set(5, 5, 10, C.cream);
  s.set(2, 5, 7, C.yellow).set(1, 5, 6, C.yellow).set(1, 6, 7, C.yellow);
  s.right(7, 4, 5, ['0000000', '0001100', '0011110', '0011110', '0001100'], C.ink).right(7, 6, 5, ['0000000', '0011000', '0111100', '0111100', '0011000'], C.ink);
  s.right(7, 4, 6, ['0000000', '0000000', '0000000', '0000000', '0000000', '1111000', '0001111'], C.ink).right(7, 6, 6, ['0000000', '0000000', '0000000', '0000000', '0000000', '0001111', '1111000'], C.ink);
  s.right(7, 5, 3, ['0000000', '0000000', '0111110', '0011100'], C.ink);
  // Pencil blaster held across the front.
  for (let x = 4; x < 13; x++) s.set(x, 8, 4, x < 5 ? C.pink : x < 6 ? C.grey : x < 12 ? C.yellow : C.wood);
  s.set(13, 8, 4, C.black);
  s.box(1, 1, 1, 1, 1, 2, C.teal).set(1, 1, 3, C.dkwood);
};

art['femboy-obby'] = s => {
  // Obby platforms floating in the snow: pink gift boxes with cream lids and maroon ribbons.
  const gift = (x0, y0, z0, w, d, h, rx, ry, paper = C.blush) => {
    s.box(x0, y0, z0, w, d, h - 1, (x, y) => x === rx || y === ry ? C.maroon : paper);
    s.box(x0, y0, z0 + h - 1, w, d, 1, (x, y) => x === rx || y === ry ? C.maroon : C.cream);
  };
  const bow = (x, y, z) => s.set(x - 1, y, z, C.maroon).set(x + 1, y, z, C.maroon).set(x, y - 1, z, C.maroon).set(x, y + 1, z, C.maroon);
  gift(-2, 0, -3, 12, 9, 3, 8, 6); bow(8, 6, 0);
  // Two more gifts stepping away on the left, linked by a candy-cane beam.
  gift(-10, 4, -4, 5, 5, 4, -8, 6); bow(-8, 6, 0);
  gift(-14, -6, -2, 5, 5, 6, -12, -4, C.lilac); bow(-12, -4, 4);
  for (let y = -1; y < 4; y++) s.box(-10, y, -1, 2, 1, 1, y % 2 ? C.rose : C.white);
  // A small floating snow island with a snowy pine and a gold star.
  island(s, 11, -7, 7, 7, C.snow, C.ice, 2, 0);
  const PINE = {top: C.white, left: C.dkgreen, right: C.dkgreen};
  for (const [z, r] of [[1, 3], [2, 2], [3, 2], [4, 1], [5, 1], [6, 1], [7, 0], [8, 0]]) s.box(14 - r, -4 - r, z, 2 * r + 1, 2 * r + 1, 1, PINE);
  s.box(14, -4, 9, 1, 1, 3, C.gold).set(13, -4, 10, C.gold).set(15, -4, 10, C.gold);


  // Avatar, facing +y (the bright left face), feet at z = 0, body across x 0..7.
  for (const bx of [0, 5]) s.box(bx, 1, 0, 3, 5, 2, C.cream).box(bx, 1, 2, 3, 4, 1, C.paper);
  for (const lx of [1, 5]) for (let z = 3; z < 7; z++) s.box(lx, 2, z, 2, 2, 1, z % 2 ? C.rose : C.paper);
  for (const lx of [1, 5]) s.box(lx, 2, 7, 2, 2, 4, C.tights);
  // Oversized jumper: ribbed hem, a maroon bow and a snowflake, puffy sleeves.
  s.box(-1, 0, 11, 10, 6, 1, C.rose).box(-1, 0, 12, 10, 6, 7, C.blush).box(1, 1, 19, 6, 4, 1, C.rose);
  for (const [sx, dir] of [[-2, -1], [9, 1]]) {
    const y0 = dir < 0 ? 2 : 1; // the far (left) sleeve sits forward so it shows beside the body
    s.box(sx, y0, 14, 1, 4, 5, C.blush).box(sx + dir, y0, 10, 1, 4, 6, C.blush);
    s.box(sx + dir, y0, 9, 1, 4, 1, C.rose).box(sx + dir, y0 + 1, 8, 1, 2, 1, C.skin);
  }
  const FLAKE = ['1001001', '0101010', '0011100', '1111111', '0011100', '0101010', '1001001'];
  const front = (x, y, z, rows, colour, px) => s.paint(null, [x, y + .002, z], [px, 0, 0], [0, 0, -px], rows, colour);
  front(2.75, 6, 18.9, ['1100011', '1110111', '1111111', '1110111', '1100011', '0010100', '0100010'], C.maroon, 2.5 / 7);
  front(2, 6, 16.2, FLAKE, C.white, 4 / 7);
  s.right(10, 2.5, 12.5, FLAKE, C.white, 3 / 7);
  // Head with brown hair: fringe, side locks, eyes and blush.
  s.box(0, 0, 20, 8, 7, 6, (x, y, z) => y < 2 || ((x === 0 || x === 7) && (z > 21 || y < 6)) ? C.hair : C.skin);
  for (const [x, z] of [[1, 25], [2, 25], [4, 25], [5, 25], [6, 25], [1, 24], [6, 24]]) s.set(x, 6, z, C.hair);
  const EYE = ['0110', '1111', '1011', '1111', '1111', '0110'];
  front(2, 7, 24, EYE, C.ink, 1 / 4); front(5, 7, 24, EYE, C.ink, 1 / 4);
  front(1, 7, 22.4, ['0111', '1110'], C.rose, 1 / 4); front(6, 7, 22.4, ['0111', '1110'], C.rose, 1 / 4);
  front(3.5, 7, 21.7, ['101', '010'], C.maroon, 1 / 3);
  // Snug pink cat-ear beanie: rolled cuff, dome, two pointed ears with pink insides and a cream pompom.
  s.box(0, 0, 26, 8, 7, 1, C.rose).box(0, 0, 27, 8, 7, 2, C.blush).box(1, 1, 29, 6, 5, 1, C.blush);
  for (const [x, y] of [[7, 6], [7, 0], [0, 0]]) s.set(x, y, 28, null); // rounded crown
  // Ears lean outwards: rows of 3, 3, 2 and 1 voxels, the right ear inset one column from the hat's side.
  for (const [x0, out] of [[0, -1], [4, 1]]) {
    [3, 3, 2, 1].forEach((w, i) => s.box(out < 0 ? x0 : x0 + 3 - w, 5, 29 + i, w, 2, 1, C.blush));
    front(x0 + (out < 0 ? .25 : .75), 7, 32, out < 0 ? ['100', '110', '111', '111'] : ['001', '011', '111', '111'], C.rose, 2 / 3);
  }
  s.ball(3.5, 3, 30.6, 1.6, C.paper);
};

// ---------- backdrop and assembly ----------
function backdropSvg(id, hue, box) {
  seed = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483646, 7) + 1;
  const bg = backdrop(hue), dot = shift(bg, 32, -10);
  let d = '';
  for (let i = 0; i < 46; i++) {
    const x = 8 + rnd() * 304, y = 128 + rnd() * 276, sz = rnd() < .3 ? 6 : 4;
    if (x > box[0] - 4 && x < box[2] + 4 && y > box[1] - 4 && y < box[3] + 4) continue; // only around the model
    d += `M${n(x)} ${n(y)}h${sz}v${sz}h-${sz}Z`;
  }
  return `<path fill="${bg}" d="M0 0h${W}v${H}H0Z"/>` + (d ? `<path fill="${dot}" fill-opacity=".8" d="${d}"/>` : '');
}

async function build(id) {
  const spec = POSTERS[id], s = new Scene();
  await art[id](s);
  const model = render(s);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">` +
    `<title id="title">${spec.title}</title><desc id="desc">Original Pocket Arcade voxel poster, generated by scripts/generate-posters.mjs.</desc>` +
    backdropSvg(id, spec.hue, model.box) + model.svg + `</svg>\n`;
  await writeFile(new URL(`../public/game-art/${id}/cover.svg`, import.meta.url), svg);
  return svg.length;
}

// Keeps each library card's colours in src/core/catalog.ts in step with its poster: the card colour is the
// flat backdrop (shown while the image loads), the title is always cream and the underline is the accent.
async function syncCatalog() {
  const file = new URL('../src/core/catalog.ts', import.meta.url);
  let src = await readFile(file, 'utf8');
  for (const [id, spec] of Object.entries(POSTERS)) {
    const re = new RegExp(`(\\{id:'${id}',title:'[^']*',)color:'[^']*',ink:'[^']*',accent:'[^']*'`);
    if (!re.test(src)) throw new Error(`Catalog entry for ${id} not found`);
    src = src.replace(re, `$1color:'${backdrop(spec.hue)}',ink:'${TITLE_INK}',accent:'${spec.accent}'`);
  }
  await writeFile(file, src);
}

const only = process.argv.slice(2);
for (const id of only.length ? only : Object.keys(POSTERS)) {
  if (!art[id]) throw new Error(`No poster for ${id}`);
  console.log(id.padEnd(14), await build(id), 'bytes');
}
await syncCatalog();
