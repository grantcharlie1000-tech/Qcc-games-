// Generates every library poster in public/game-art/<id>/cover.svg from one shared design system.
//   node scripts/generate-posters.mjs            (all posters)
//   node scripts/generate-posters.mjs snake pool (only these)
//
// The system (see docs/ARTWORK.md):
//  - Frame: 320×410, the same ratio as the library card. The top 120 units stay calm for the live HTML title.
//  - Stage: a dark two-stop backdrop built from one hue per game, a lighter glow behind the subject,
//    a halftone floor and a soft ground shadow. Every poster uses the same stage, so only the hue changes.
//  - Subject: flat shapes lit from the upper left. Colours come only from PALETTE, each with a light,
//    base and dark tone. Gloss is a single white highlight, depth is one shared drop shadow.
//  - Accents: the same four-point sparkle and dot motif in the game's accent colour.
import {readFile, writeFile} from 'node:fs/promises';

const W = 320, H = 410;
export const PALETTE = {
  red:    ['#ff8a80', '#ff5a5f', '#d23a4d'],
  orange: ['#ffbd73', '#ff9636', '#de6a1c'],
  yellow: ['#ffe27a', '#ffcc33', '#e0a015'],
  green:  ['#8fe48a', '#53c765', '#2f9a4c'],
  teal:   ['#7deadf', '#28cbb9', '#13968f'],
  blue:   ['#86b6ff', '#4a87ff', '#2c5fd2'],
  purple: ['#c3a4ff', '#9a68fb', '#6f43d1'],
  pink:   ['#ffa1d2', '#ff66b0', '#d4418c'],
  cream:  ['#ffffff', '#fff3df', '#e5d2b4'],
  slate:  ['#9aa7c0', '#6c7894', '#47506a'],
  wood:   ['#e6b07a', '#c4844a', '#93582c'],
  ink:    ['#4a3f60', '#2a2140', '#160f26'],
};
const INK = PALETTE.ink[1];
export const TITLE_INK = PALETTE.cream[1];

// Hue, title accent and description per game. Card colour/ink in src/core/catalog.ts derive from these.
export const POSTERS = {
  'color-blocks': {hue: 250, accent: 'yellow', title: 'A glossy block piece hovers over a half-filled puzzle board'},
  'water-sort':   {hue: 290, accent: 'pink',   title: 'Three glass tubes holding stacked bands of coloured water'},
  'fruit-merge':  {hue: 195, accent: 'red',    title: 'A watermelon, orange, peach and cherries piled in a glass jar'},
  'tower':        {hue: 325, accent: 'teal',   title: 'A tower of stacked slabs with the next slab sliding in'},
  'flappy-bird':  {hue: 30, accent: 'yellow', title: 'A round bird flapping between two pillars'},
  'ball-run':     {hue: 265, accent: 'pink',   title: 'A glossy ball rolling down a glowing perspective track'},
  'animal-stack': {hue: 175,  accent: 'yellow', title: 'An elephant, a lion and a penguin balanced in a tower'},
  'snake':        {hue: 42,  accent: 'red',    title: 'A segmented green snake curling towards an apple'},
  'neon-coil':    {hue: 240, accent: 'green',  title: 'A glowing worm weaving between bright energy orbs'},
  'minesweeper':  {hue: 200, accent: 'red',    title: 'A minefield of raised tiles with numbers, a flag and a mine'},
  'solitaire':    {hue: 345, accent: 'cream',  title: 'Four playing cards fanned out: an ace, king, queen and jack'},
  'block-fill':   {hue: 280, accent: 'yellow', title: 'A single golden path snaking through a grid of tiles'},
  'color-connect':{hue: 300, accent: 'yellow', title: 'Coloured pipes linking pairs of matching dots on a board'},
  'pool':         {hue: 158, accent: 'yellow', title: 'A rack of numbered billiard balls, the cue ball and a cue'},
  'globle':       {hue: 212, accent: 'yellow', title: 'A globe with guessed countries shaded from cream to deep red'},
  'blockcraft':   {hue: 35, accent: 'green',  title: 'A grass block, a stone block and a little block tree'},
  'maze-muncher': {hue: 245, accent: 'teal',   title: 'A round muncher chasing pellets through a maze past a jelly ghost'},
  'corn-clicker': {hue: 95,  accent: 'yellow', title: 'A giant golden corn cob surrounded by floating plus-one sparks'},
  'slipline':     {hue: 268, accent: 'teal',   title: 'A grid of coloured arrows with one arrow sliding free'},
  'quadfall':     {hue: 222, accent: 'orange', title: 'A falling block piece above a stack of coloured tiles'},
  'fivefold':     {hue: 150, accent: 'green',  title: 'Word tiles: PLANT half right above PLAYS solved in green'},
  'claimline':    {hue: 330, accent: 'pink',   title: 'Coloured territories in an arena with a glowing trail looping out'},
  'crossy-road':  {hue: 200, accent: 'red',    title: 'A blocky chicken in a red scarf crossing a snowy road and river'},
  'quad-clash':   {hue: 22,  accent: 'yellow', title: 'An egg fighter in a yellow headband holding a pencil blaster'},
};

// ---------- colour helpers ----------
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
function hex(h, s, l) { // HSL → #rrggbb so card colours in the catalog can match the poster exactly
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}
export const stageColours = hue => ({top: hex(hue, 46, 30), bottom: hex(hue, 52, 12), glow: hex(hue, 75, 58)});

// ---------- primitives ----------
const n = v => +(+v).toFixed(2);
const attrs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : v}"`).join('');
const el = (tag, o, kids) => kids === undefined ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${kids}</${tag}>`;
const rect = (x, y, w, h, fill, o = {}) => el('rect', {x, y, width: w, height: h, fill, ...o});
const circle = (cx, cy, r, fill, o = {}) => el('circle', {cx, cy, r, fill, ...o});
const ellipse = (cx, cy, rx, ry, fill, o = {}) => el('ellipse', {cx, cy, rx, ry, fill, ...o});
const path = (d, fill, o = {}) => el('path', {d, fill, ...o});
const line = (d, stroke, width, o = {}) => el('path', {d, fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...o});
const g = (o, kids) => el('g', o, kids);
// Rounded-rectangle path data, so many same-fill rectangles can merge into one <path>.
const rr = (x, y, w, h, r = 0) => r ? `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(h - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(2 * r - w)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}v${n(2 * r - h)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z` : `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
// Lettering is drawn as rounded stroke paths, not <text>: posters load through <img>, where only device fonts
// are available, so real glyphs would change shape from phone to phone. Each glyph sits in a 10×14 box.
const GLYPHS = {
  0: 'M5 0C1.5 0 .5 3.5.5 7s1 7 4.5 7 4.5-3.5 4.5-7S8.5 0 5 0Z',
  1: 'M2 3 6 0v14',
  2: 'M.8 3.6C1.2 1.2 3 0 5 0c2.6 0 4.4 1.6 4.4 4C9.4 7.4.6 9.6.6 14h9',
  3: 'M1 0h8L4.4 5.8c3 0 5 1.6 5 4.2S7.4 14 4.8 14C3 14 1.6 13.3.6 12',
  4: 'M7 14V0L.4 9.6h9.4',
  5: 'M9 0H1.6L1 6.2c1-.6 2.3-.8 3.6-.8 2.8 0 4.8 1.8 4.8 4.3S7.4 14 4.8 14C3 14 1.6 13.3.6 12',
  6: 'M8.4 1.2C7.6.4 6.4 0 5.2 0 2.2 0 .6 3.4.6 8c0 3.6 1.6 6 4.4 6 2.6 0 4.4-1.8 4.4-4.3S7.6 5.4 5 5.4C3 5.4 1.4 6.6.7 8.2',
  7: 'M.6 0h8.8L4 14',
  8: 'M5 6.4C2.6 6.4 1.2 5.1 1.2 3.2S2.6 0 5 0s3.8 1.3 3.8 3.2S7.4 6.4 5 6.4Zm0 0c2.7 0 4.4 1.5 4.4 3.8S7.7 14 5 14 .6 12.5.6 10.2 2.3 6.4 5 6.4Z',
  9: 'M9.4 5.6C8.7 7.6 7 8.6 5 8.6 2.4 8.6.6 6.8.6 4.3S2.4 0 5 0c2.8 0 4.4 2.4 4.4 6 0 4.6-1.6 8-4.6 8-1.2 0-2.2-.4-2.8-1.2',
  A: 'M.6 14 5 0l4.4 14M2.2 9.4h5.6',
  J: 'M8.6 0v9.4C8.6 12.4 7 14 4.6 14 2.6 14 1.2 12.8.8 11',
  K: 'M1.2 0v14M9.2 0 1.2 8.4M4.2 5.4 9.4 14',
  L: 'M1.2 0v14h8',
  N: 'M1 14V0l8 14V0',
  P: 'M1.2 14V0h4c2.8 0 4.4 1.6 4.4 4s-1.6 4-4.4 4h-4',
  Q: 'M5 0C1.5 0 .5 3.5.5 7s1 7 4.5 7 4.5-3.5 4.5-7S8.5 0 5 0ZM6.2 10l3.4 4',
  S: 'M9 2C8 .7 6.6 0 5 0 2.6 0 1 1.3 1 3.5c0 4.6 8.4 2.4 8.4 7 0 2.1-1.8 3.5-4.4 3.5-2 0-3.6-.9-4.4-2.4',
  T: 'M.4 0h9.2M5 0v14',
  Y: 'M.6 0 5 7l4.4-7M5 7v7',
  '+': 'M5 3.4v7.2M1.4 7h7.2',
};
// Same call shape as an SVG text label: centred on (x, y), size ≈ font size, cap height ≈ .72 × size.
function text(x, y, str, size, fill, o = {}) {
  const chars = String(str).split(''), k = size * .72 / 14, adv = 12.2, width = (chars.length * adv - 2.2) * k;
  const glyphs = chars.map((c, i) => {
    if (!GLYPHS[c]) throw new Error(`No glyph for ${c}`);
    return path(GLYPHS[c], 'none', i ? {transform: `translate(${n(i * adv)} 0)`} : {});
  }).join('');
  return g({transform: `translate(${n(x - width / 2)} ${n(y - 7 * k)}) scale(${n(k)})`, stroke: fill, 'stroke-width': 2.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none', ...o}, glyphs);
}
const tone = (c, i) => PALETTE[c][i];
const L = c => tone(c, 0), B = c => tone(c, 1), D = c => tone(c, 2);

// Per-poster registry of gradients so each file only defines what it uses.
let used;
const sphereFill = c => { used.add(`sphere:${c}`); return `url(#sphere-${c})`; };
const SHADOW = 'url(#drop)';

// A glossy rounded tile: the shared building block for every grid game.
function tile(x, y, s, c, o = {}) {
  const r = o.r ?? s * .2;
  return g({}, rect(x, y + s * .06, s, s, D(c), {rx: r}) + rect(x, y, s, s * .94, B(c), {rx: r}) +
    rect(x + s * .14, y + s * .1, s * .46, s * .13, '#fff', {rx: s * .065, opacity: .45}));
}
// An empty board slot.
const slot = (x, y, s, r = s * .2) => rect(x, y, s, s, '#000', {rx: r, opacity: .28});
// A shaded sphere with a single highlight.
function sphere(cx, cy, r, c) {
  return g({}, circle(cx, cy, r, sphereFill(c)) + ellipse(cx - r * .36, cy - r * .42, r * .3, r * .2, '#fff', {opacity: .55, transform: `rotate(-30 ${n(cx - r * .36)} ${n(cy - r * .42)})`}));
}
// An isometric box: top light, left base, right dark.
function cube(x, y, w, h, c, d = w / 2) { // (x,y) is the top corner of the top face
  const top = `M${n(x)} ${n(y)}l${n(w)} ${n(d / 2)}l${n(-w)} ${n(d / 2)}l${n(-w)} ${n(-d / 2)}Z`;
  return g({}, path(top, L(c)) +
    path(`M${n(x - w)} ${n(y + d / 2)}l${n(w)} ${n(d / 2)}v${n(h)}l${n(-w)} ${n(-d / 2)}Z`, B(c)) +
    path(`M${n(x)} ${n(y + d)}l${n(w)} ${n(-d / 2)}v${n(h)}l${n(-w)} ${n(d / 2)}Z`, D(c)));
}
const sparkle = (x, y, s, fill) => path(`M${n(x)} ${n(y - s)}Q${n(x + s * .18)} ${n(y - s * .18)} ${n(x + s)} ${n(y)}Q${n(x + s * .18)} ${n(y + s * .18)} ${n(x)} ${n(y + s)}Q${n(x - s * .18)} ${n(y + s * .18)} ${n(x - s)} ${n(y)}Q${n(x - s * .18)} ${n(y - s * .18)} ${n(x)} ${n(y - s)}Z`, fill);
const eye = (x, y, r, look = [0, 0]) => circle(x, y, r, '#fff') + circle(x + look[0] * r * .35, y + look[1] * r * .35, r * .58, INK) + circle(x + look[0] * r * .35 - r * .2, y + look[1] * r * .35 - r * .22, r * .2, '#fff');
const blush = (x, y, r) => ellipse(x, y, r, r * .55, B('pink'), {opacity: .55});

// ---------- stage ----------
function stage(hue, accent, sparkles) {
  const c = stageColours(hue);
  const defs = `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${c.top}"/><stop offset="1" stop-color="${c.bottom}"/></linearGradient>` +
    `<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop stop-color="${c.glow}" stop-opacity=".5"/><stop offset=".55" stop-color="${c.glow}" stop-opacity=".14"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>` +
    `<pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.3" fill="#fff"/></pattern>` +
    `<linearGradient id="dotfade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient>` +
    `<mask id="floor"><rect x="0" y="300" width="${W}" height="110" fill="url(#dotfade)"/></mask>` +
    `<filter id="drop" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#05030c" flood-opacity=".42"/></filter>`;
  const back = rect(0, 0, W, H, 'url(#bg)') + ellipse(160, 268, 210, 190, 'url(#glow)') +
    rect(0, 300, W, 110, 'url(#dots)', {mask: 'url(#floor)', opacity: .09});
  const spark = sparkles.map(([x, y, s], i) => i % 3 === 2 ? circle(x, y, s / 3, B(accent), {opacity: .8}) : sparkle(x, y, s, B(accent))).join('');
  return {defs, back, spark};
}
const ground = (cx, cy, rx, ry = rx * .16) => ellipse(cx, cy, rx, ry, '#05030c', {opacity: .35});

function gradientDefs() {
  let out = '';
  for (const key of used) {
    const [kind, c] = key.split(':');
    if (kind === 'sphere') out += `<radialGradient id="sphere-${c}" cx="38%" cy="32%" r="72%"><stop stop-color="${L(c)}"/><stop offset=".5" stop-color="${B(c)}"/><stop offset="1" stop-color="${D(c)}"/></radialGradient>`;
  }
  return out;
}

// Standard sparkle layout; each poster may pass its own.
const SPARKS = [[276, 150, 8], [40, 198, 7], [292, 188, 6], [254, 128, 5], [52, 168, 5], [30, 238, 6]];

// ---------- posters ----------
const art = {};

art['color-blocks'] = () => {
  const s = 40, x0 = 40, y0 = 236;
  const grid = ['b..ypr', 'bbgy.r', 'pbggyr', 'pp.gbr'];
  const cmap = {b: 'blue', y: 'yellow', p: 'purple', r: 'red', g: 'green'};
  let board = rect(x0 - 12, y0 - 12, 6 * s + 24, 4 * s + 24, INK, {rx: 22, filter: SHADOW});
  grid.forEach((row, j) => [...row].forEach((k, i) => {
    const x = x0 + i * s + 2, y = y0 + j * s + 2;
    board += k === '.' ? slot(x, y, s - 4) : tile(x, y, s - 4, cmap[k]);
  }));
  const piece = [[0, 0], [1, 0], [2, 0], [1, 1]].map(([i, j]) => tile(110 + i * 42, 146 + j * 42, 40, 'orange')).join('');
  return ground(160, 392, 140) + board + g({filter: SHADOW, transform: 'rotate(-8 170 180)'}, piece) +
    line('M120 228v-6M162 228v-12M204 228v-6', '#fff', 3, {opacity: .35});
};

art['water-sort'] = () => {
  const tubes = [[80, ['blue', 'pink', 'yellow', 'blue']], [160, ['yellow', 'teal', 'pink']], [240, ['teal', 'pink', 'blue', 'yellow']]];
  let out = ground(160, 384, 130), defs = '';
  tubes.forEach(([cx, layers], t) => {
    const w = 52, top = 168, h = 204, x = cx - w / 2, r = w / 2;
    const shape = `M${x} ${top}h${w}v${h - r}a${r} ${r} 0 0 1 ${-w} 0Z`;
    defs += `<clipPath id="tube${t}"><path d="${shape}"/></clipPath>`;
    const band = 42;
    let liquid = '';
    layers.forEach((c, i) => {
      const y = top + h - (i + 1) * band;
      liquid += rect(x, y, w, band + 1, B(c)) + rect(x + w * .62, y, w * .38, band + 1, D(c), {opacity: .55});
    });
    const surface = top + h - layers.length * band;
    liquid += ellipse(cx, surface, w / 2, 5, L(layers.at(-1)));
    out += g({filter: SHADOW}, path(shape, '#fff', {opacity: .1}) + g({'clip-path': `url(#tube${t})`}, liquid) +
      path(shape, 'none', {stroke: tone('cream', 1), 'stroke-width': 4, opacity: .85}) +
      rect(x - 6, top - 8, w + 12, 12, tone('cream', 1), {rx: 6}) +
      line(`M${x + 10} ${top + 16}v${h - 60}`, '#fff', 5, {opacity: .45}));
  });
  out += circle(160, 150, 6, B('teal')) + circle(166, 128, 4, B('teal'), {opacity: .8});
  return {body: out, defs};
};

art['fruit-merge'] = () => {
  // A glass jar with fruit in merge order: the big one has stripes.
  const jar = path('M48 196v156q0 26 26 26h172q26 0 26-26V196', 'none', {stroke: tone('cream', 1), 'stroke-width': 6, 'stroke-linecap': 'round', opacity: .8});
  const melon = `<clipPath id="melon"><circle cx="198" cy="316" r="62"/></clipPath>` + sphere(198, 316, 62, 'green') +
    g({'clip-path': 'url(#melon)', opacity: .5}, [-40, -14, 12, 38].map(dx => line(`M${198 + dx} 250q${dx * .3 - 14} 66 0 132`, D('green'), 9)).join('')) +
    ellipse(176, 288, 18, 11, '#fff', {opacity: .4, transform: 'rotate(-30 176 288)'});
  const orange = sphere(104, 336, 42, 'orange') + path('M104 296q10-12 24-8-6 14-24 8Z', B('green'));
  const peach = sphere(128, 260, 30, 'pink') + line('M128 232q-4 12 0 24', D('pink'), 3, {opacity: .5});
  const cherry = sphere(212, 226, 17, 'red') + sphere(240, 236, 17, 'red') + line('M212 210q10-34 22-38M240 220q-2-30-6-48', D('green'), 4) + path('M234 172q16-10 28 0-14 10-28 0Z', B('green'));
  return ground(160, 388, 130) + g({filter: SHADOW}, melon + orange + peach + cherry) + jar +
    line('M64 210v120', '#fff', 5, {opacity: .25});
};

art['tower'] = () => {
  const cols = ['purple', 'blue', 'blue', 'teal', 'teal', 'green'];
  let out = ground(160, 392, 120);
  cols.forEach((c, i) => { out += cube(160, 300 - i * 26, 96, 26, c, 96); });
  out += g({filter: SHADOW}, cube(214, 132, 96, 26, 'yellow', 96)) + line('M60 154h40M74 168h30', '#fff', 4, {opacity: .4});
  return out;
};

art['flappy-bird'] = () => {
  const pillar = (x, top, w = 52) => g({}, rect(x, top, w, H - top, B('green')) + rect(x + w * .66, top, w * .34, H - top, D('green')) +
    rect(x - 6, top, w + 12, 24, L('green'), {rx: 6}) + rect(x + w * .66, top + 4, w * .34 + 6, 20, B('green'), {rx: 4}) + rect(x + 8, top + 30, 8, H - top - 30, '#fff', {opacity: .3}));
  const clouds = g({fill: '#fff', opacity: .12}, circle(70, 180, 22, '#fff') + circle(96, 172, 28, '#fff') + circle(124, 182, 20, '#fff') + rect(60, 180, 80, 22, '#fff', {rx: 11}));
  const bird = g({filter: SHADOW, transform: 'rotate(-12 166 244)'},
    sphere(166, 244, 40, 'yellow') + ellipse(188, 262, 18, 10, tone('cream', 1)) +
    path('M200 236l26 8-26 9Z', B('orange')) + path('M200 244l22 2-22 6Z', D('orange')) +
    eye(184, 228, 11, [1, 0]) + path('M122 244q16-26 38-6-14 22-38 6Z', L('yellow')) + blush(170, 254, 6));
  return clouds + pillar(30, 300) + pillar(232, 268) + line('M86 230h-24M92 252h-34M84 274h-20', '#fff', 4, {opacity: .35}) + bird;
};

art['ball-run'] = () => {
  const hz = 176;
  let track = path(`M8 ${H}L132 ${hz}h56L312 ${H}Z`, INK);
  for (let i = 0; i < 9; i++) { // rails converging on the horizon
    const t = i / 8, xb = 8 + t * 304, xt = 132 + t * 56;
    track += line(`M${n(xb)} ${H}L${n(xt)} ${hz}`, B('pink'), 1.6, {opacity: .5});
  }
  for (let k = 1; k <= 8; k++) { // cross lines, closer together near the horizon
    const y = hz + (H - hz) * Math.pow(k / 8, 2.2), t = (y - hz) / (H - hz), half = 28 + t * 124;
    track += line(`M${n(160 - half)} ${n(y)}h${n(half * 2)}`, B('pink'), 1.6, {opacity: .45});
  }
  track += line(`M8 ${H}L132 ${hz}M312 ${H}L188 ${hz}`, L('pink'), 4);
  const ball = g({filter: SHADOW}, sphere(160, 306, 54, 'purple') + line('M118 290q42 30 84 0', L('purple'), 7, {opacity: .5}) + line('M114 316q46 34 92 0', D('purple'), 7, {opacity: .45}));
  const blocks = cube(96, 228, 15, 22, 'teal', 15) + cube(226, 252, 18, 26, 'yellow', 18);
  return track + ellipse(160, 362, 60, 10, '#05030c', {opacity: .5}) + blocks + ball;
};

art['animal-stack'] = () => {
  // Elephant
  const el = g({}, path('M76 384v-58q0-46 84-46t84 46v58Z', B('slate')) + path('M206 290q38 10 38 36v58h-30Z', D('slate'), {opacity: .7}) +
    ellipse(92, 314, 28, 34, L('slate')) + ellipse(228, 314, 28, 34, D('slate')) +
    path('M160 330q-2 30 16 36', 'none', {stroke: D('slate'), 'stroke-width': 16, 'stroke-linecap': 'round'}) + path('M160 330q-2 30 16 36', 'none', {stroke: L('slate'), 'stroke-width': 4, 'stroke-linecap': 'round', opacity: .5, transform: 'translate(-4 -2)'}) +
    eye(136, 318, 8, [0, .2]) + eye(184, 318, 8, [0, .2]) + blush(122, 340, 9) + blush(198, 340, 9) +
    rect(82, 376, 34, 10, D('slate'), {rx: 5}) + rect(204, 376, 34, 10, D('slate'), {rx: 5}));
  // Lion
  const lion = g({transform: 'rotate(-5 160 236)'}, circle(160, 236, 54, B('orange')) +
    [...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return circle(160 + Math.cos(a) * 50, 236 + Math.sin(a) * 50, 14, D('orange')); }).join('') +
    circle(160, 236, 40, B('yellow')) + circle(128, 202, 10, B('yellow')) + circle(192, 202, 10, B('yellow')) +
    eye(146, 230, 7) + eye(174, 230, 7) + ellipse(160, 248, 9, 6, D('wood')) + line('M152 258q8 7 16 0', INK, 3) + blush(136, 250, 7) + blush(184, 250, 7));
  // Penguin
  const peng = g({transform: 'rotate(7 166 150)'}, ellipse(166, 152, 34, 40, INK) + ellipse(166, 160, 23, 30, tone('cream', 1)) +
    eye(154, 140, 7) + eye(178, 140, 7) + path('M159 154l7 8 7-8Z', B('orange')) + ellipse(150, 192, 11, 5, B('orange')) + ellipse(182, 192, 11, 5, B('orange')));
  return ground(160, 388, 110) + g({filter: SHADOW}, el + lion + peng);
};

art['snake'] = () => {
  let board = rect(36, 150, 248, 238, '#000', {rx: 24, opacity: .2});
  let checks = '';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) checks += rr(44 + i * 29.5, 158 + j * 27.75, 29.5, 27.75);
  board += path(checks, '#fff', {opacity: .04});
  const pts = [];
  for (let x = 250; x >= 70; x -= 26) pts.push([x, 356]);
  for (let y = 330; y >= 252; y -= 26) pts.push([70, y]);
  for (let x = 96; x <= 200; x += 26) pts.push([x, 252]);
  let body = '';
  pts.forEach(([x, y], i) => { body = sphere(x, y, 15 + i * .1, 'green') + body; });
  const head = g({}, sphere(226, 252, 22, 'green') + eye(220, 244, 8, [1, 0]) + eye(238, 246, 7, [1, 0]) + line('M248 262l12 4m-6 -2 8 -4', B('red'), 3));
  const apple = g({}, sphere(232, 182, 24, 'red') + line('M232 160q2-10 8-14', D('wood'), 4) + path('M238 154q14-12 26-2-12 10-26 2Z', B('green')));
  return ground(160, 392, 130) + board + g({filter: SHADOW}, body + head + apple);
};

art['neon-coil'] = () => {
  const d = 'M58 386C40 320 120 330 128 280S56 214 104 178 214 196 210 246 156 300 206 330 286 290 262 230';
  const orbs = [[60, 180, 'pink'], [254, 176, 'yellow'], [262, 350, 'blue'], [110, 330, 'orange'], [228, 290, 'purple'], [160, 210, 'teal'], [36, 280, 'yellow']];
  const defs = `<filter id="neon" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>`;
  const glow = line(d, B('green'), 30, {filter: 'url(#neon)', opacity: .7});
  const body = line(d, D('green'), 26) + line(d, B('green'), 20) + line(d, L('green'), 5, {opacity: .7, 'stroke-dasharray': '2 16'});
  const head = g({}, circle(262, 228, 18, B('green')) + eye(254, 220, 7, [0, -1]) + eye(272, 222, 7, [0, -1]));
  const orbArt = orbs.map(([x, y, c]) => circle(x, y, 12, B(c), {filter: 'url(#neon)', opacity: .8}) + circle(x, y, 6, L(c))).join('');
  return {body: orbArt + glow + body + head, defs};
};

art['minesweeper'] = () => {
  const s = 48, x0 = 40, y0 = 186;
  const map = ['##2#1', '#3.1.', '#2.1.', '1....'];
  const numCol = {1: 'blue', 2: 'green', 3: 'red'};
  let out = rect(x0 - 10, y0 - 10, 5 * s + 20, 4 * s + 20, INK, {rx: 20, filter: SHADOW});
  map.forEach((row, j) => [...row].forEach((k, i) => {
    const x = x0 + i * s + 2, y = y0 + j * s + 2;
    if (k === '#') out += tile(x, y, s - 4, 'slate');
    else {
      out += rect(x, y, s - 4, s - 4, tone('cream', 1), {rx: 9, opacity: .92});
      if (k !== '.') out += text(x + (s - 4) / 2, y + (s - 4) / 2 + 1, k, 26, D(numCol[k]));
    }
  }));
  // Flags stand on two of the raised tiles (column, row).
  const flag = (i, j) => { const x = x0 + i * s + s / 2 - 6, y = y0 + j * s + s - 10; return line(`M${x} ${y}v-28`, INK, 4) + path(`M${x + 2} ${y - 30}l20 8-20 8Z`, B('red')) + rect(x - 9, y - 2, 18, 5, INK, {rx: 2.5}); };
  const mine = g({filter: SHADOW}, [...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return line(`M${n(250 + Math.cos(a) * 16)} ${n(140 + Math.sin(a) * 16)}L${n(250 + Math.cos(a) * 29)} ${n(140 + Math.sin(a) * 29)}`, INK, 6); }).join('') + sphere(250, 140, 22, 'slate'));
  return ground(160, 392, 140) + out + flag(0, 1) + flag(1, 0) + mine;
};

function suit(kind, x, y, s, fill) {
  const p = {
    heart: 'M0 .9C-.2.7-1 .2-1-.35-1-.75-.7-1-.38-1-.18-1 0-.85 0-.65 0-.85.18-1 .38-1 .7-1 1-.75 1-.35 1 .2.2.7 0 .9Z',
    diamond: 'M0-1 .72 0 0 1-.72 0Z',
    spade: 'M0-1C.25-.7 1-.25 1 .2 1 .55.7.75.42.75.25.75.1.65 0 .5L.18 1H-.18L0 .5C-.1.65-.25.75-.42.75-.7.75-1 .55-1 .2-1-.25-.25-.7 0-1Z',
    club: 'M0-1A.32.32 0 0 1 .28-.5.32.32 0 1 1 .2.25L.25 1H-.25L-.2.25A.32.32 0 1 1-.28-.5.32.32 0 0 1 0-1Z',
  }[kind];
  return path(p, fill, {transform: `translate(${n(x)} ${n(y)}) scale(${n(s)})`});
}
art['solitaire'] = () => {
  const cards = [['A', 'spade', INK], ['K', 'heart', D('red')], ['Q', 'club', INK], ['J', 'diamond', D('red')]];
  let out = ground(160, 392, 130);
  cards.forEach(([rank, k, col], i) => {
    const a = -24 + i * 16;
    out += g({transform: `rotate(${a} 160 470)`, filter: SHADOW},
      rect(118, 196, 112, 160, tone('cream', 1), {rx: 14}) + rect(118, 346, 112, 10, tone('cream', 2), {rx: 5}) +
      text(136, 220, rank, 24, col) + suit(k, 136, 244, 8, col) + suit(k, 174, 290, 30, col));
  });
  return out;
};

art['block-fill'] = () => {
  const s = 46, x0 = 45, y0 = 160;
  const pathCells = [[0, 4], [0, 3], [0, 2], [1, 2], [2, 2], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [3, 1]];
  const blocked = [[3, 2], [3, 3]];
  let out = rect(x0 - 10, y0 - 10, 5 * s + 20, 5 * s + 20, INK, {rx: 22, filter: SHADOW});
  const key = (i, j) => `${i},${j}`, filled = new Set(pathCells.map(([i, j]) => key(i, j))), wall = new Set(blocked.map(([i, j]) => key(i, j)));
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const x = x0 + i * s + 3, y = y0 + j * s + 3;
    if (wall.has(key(i, j))) out += rect(x, y, s - 6, s - 6, '#000', {rx: 9, opacity: .5}) + line(`M${x + 12} ${y + 12}l${s - 30} ${s - 30}M${x + s - 18} ${y + 12}l${30 - s} ${s - 30}`, tone('slate', 2), 4);
    else if (filled.has(key(i, j))) out += tile(x, y, s - 6, 'yellow');
    else out += slot(x, y, s - 6);
  }
  const c = ([i, j]) => `${x0 + i * s + s / 2} ${y0 + j * s + s / 2 - 1}`;
  out += line('M' + pathCells.map(c).join('L'), D('yellow'), 8, {opacity: .55});
  const [hx, hy] = c(pathCells.at(-1)).split(' ').map(Number);
  out += circle(hx, hy, 13, '#fff') + circle(hx, hy, 7, B('orange'));
  return ground(160, 400, 140) + out;
};

art['color-connect'] = () => {
  const s = 48, x0 = 40, y0 = 164;
  let out = rect(x0 - 10, y0 - 10, 5 * s + 20, 5 * s + 20, INK, {rx: 22, filter: SHADOW});
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) out += slot(x0 + i * s + 3, y0 + j * s + 3, s - 6, 10);
  const c = ([i, j]) => [x0 + i * s + s / 2, y0 + j * s + s / 2];
  const flows = [['red', [[0, 0], [0, 3], [1, 3]]], ['yellow', [[1, 0], [4, 0], [4, 2]]], ['teal', [[1, 1], [3, 1], [3, 3], [2, 3]]], ['blue', [[0, 4], [4, 4], [4, 3]]], ['pink', [[1, 2], [2, 2]]]];
  for (const [col, pts] of flows) {
    const d = 'M' + pts.map(p => c(p).join(' ')).join('L');
    out += line(d, D(col), 20) + line(d, B(col), 16) + line(d, L(col), 4, {opacity: .6, transform: 'translate(-3 -3)'});
    for (const p of [pts[0], pts.at(-1)]) out += sphere(...c(p), 17, col);
  }
  return ground(160, 400, 140) + out;
};

art['pool'] = () => {
  const cols = ['yellow', 'blue', 'red', 'purple', 'orange', 'green', 'pink', 'ink', 'teal', 'yellow'];
  let out = ground(160, 392, 130), k = 0;
  const r = 22;
  // Rack pointing down towards the cue ball.
  for (let row = 0; row < 4; row++) for (let i = 0; i <= 3 - row; i++) {
    const x = 176 + (i - (3 - row) / 2) * r * 2.04, y = 180 + row * r * 1.78;
    const c = cols[k++];
    out += g({filter: SHADOW}, sphere(x, y, r, c) + circle(x + 2, y + 2, 9, '#fff', {opacity: .92}) + text(x + 2, y + 2.6, k, 10, INK));
  }
  // Cue ball lined up below the rack, the cue coming in from the lower left.
  out += line('M150 314L166 262', '#fff', 3, {opacity: .4, 'stroke-dasharray': '4 8'});
  out += g({filter: SHADOW}, sphere(140, 340, r, 'cream'));
  out += g({filter: SHADOW}, line('M118 374L40 476', D('wood'), 13) + line('M118 374L72 434', B('wood'), 10) + line('M124 366L118 374', tone('cream', 1), 9) + line('M128 361L124 366', B('blue'), 9));
  return out;
};

art['globle'] = async () => {
  const world = JSON.parse(await readFile(new URL('../src/games/globle/data/world.json', import.meta.url), 'utf8'));
  const cx = 160, cy = 268, R = 116, lat0 = 12 * Math.PI / 180, lng0 = 16 * Math.PI / 180;
  // A round in progress: the hidden country (Chad) in green, guesses shaded by their real distance from it.
  const near = D('red'), mid = B('red'), far = B('orange'), farther = L('orange'), farthest = L('yellow');
  const fills = {TCD: B('green'), NER: near, LBY: near, CMR: near, NGA: near, EGY: mid, DZA: mid, ESP: far, GBR: farther, ZAF: farther, BRA: farthest};
  const project = ([lng, lat]) => {
    const p = lat * Math.PI / 180, l = lng * Math.PI / 180 - lng0;
    const cosc = Math.sin(lat0) * Math.sin(p) + Math.cos(lat0) * Math.cos(p) * Math.cos(l);
    return {x: cx + R * Math.cos(p) * Math.sin(l), y: cy - R * (Math.cos(lat0) * Math.sin(p) - Math.sin(lat0) * Math.cos(p) * Math.cos(l)), visible: cosc > .02};
  };
  const ring = pts => {
    const ps = pts.map(project);
    if (ps.filter(p => p.visible).length < 3) return '';
    for (const p of ps) if (!p.visible) { const k = R / Math.max(1e-6, Math.hypot(p.x - cx, p.y - cy)); p.x = cx + (p.x - cx) * k; p.y = cy + (p.y - cy) * k; }
    let d = '', last;
    for (const p of ps) { if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.4) continue; d += (d ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); last = p; }
    return d && d + 'Z';
  };
  let land = '', guessed = '';
  for (const f of world.features) {
    const d = f.polygons.map(poly => ring(poly[0])).join('');
    if (!d) continue;
    if (fills[f.id]) guessed += path(d, fills[f.id]); else land += d;
  }
  const defs = `<clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`;
  used.add('sphere:blue');
  const body = ground(160, 396, 110) + circle(cx, cy, R + 10, B('blue'), {opacity: .18}) +
    g({filter: SHADOW}, circle(cx, cy, R, sphereFill('blue'))) +
    g({'clip-path': 'url(#disc)', 'stroke-linejoin': 'round'}, path(land, tone('cream', 2), {opacity: .9}) + g({stroke: INK, 'stroke-width': .5, 'stroke-opacity': .5}, guessed) +
      circle(cx + R * .25, cy + R * .3, R * 1.05, '#000', {opacity: .16})) +
    ellipse(cx - R * .4, cy - R * .48, R * .32, R * .18, '#fff', {opacity: .4, transform: `rotate(-30 ${n(cx - R * .4)} ${n(cy - R * .48)})`});
  return {body, defs};
};

art['blockcraft'] = () => {
  // Pixel speckles on a face: deterministic so the poster is stable.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const speck = (x, y, w, d, h, side, c, count) => { // side: 'left' | 'right'
    let out = '';
    for (let i = 0; i < count; i++) {
      const u = .12 + rnd() * .62, v = rnd() * .8, sx = side === 'left' ? -1 : 1;
      const px = x + sx * u * w, py = y + d / 2 * u + v * h;
      out += path(`M${n(px)} ${n(py)}l${n(sx * 10)} ${n(d / w * 5)}v8l${n(-sx * 10)} ${n(-d / w * 5)}Z`, c, {opacity: .9});
    }
    return out;
  };
  const grass = (x, y, w, h) => g({}, cube(x, y, w, h, 'wood', w) +
    path(`M${x - w} ${y + w / 2}l${w} ${w / 2}l${w} ${-w / 2}v16l${-w} ${w / 2}l${-w} ${-w / 2}Z`, B('green')) +
    path(`M${x} ${y + w}l${w} ${-w / 2}v16l${-w} ${w / 2}Z`, D('green')) +
    path(`M${x} ${y}l${w} ${w / 2}l${-w} ${w / 2}l${-w} ${-w / 2}Z`, L('green')) +
    speck(x, y + w / 2 + 18, w, w, h - 22, 'left', D('wood'), 6) + speck(x, y + w / 2 + 18, w, w, h - 22, 'right', '#5d351a', 6));
  const stone = g({}, cube(244, 268, 38, 66, 'slate', 38) + speck(244, 290, 38, 38, 52, 'left', D('slate'), 3));
  // The tree stands on the back-left of the grass top: each cube's base centre is (x, y + w/2 + h).
  const tree = g({}, cube(128, 207, 9, 36, 'wood', 9) + cube(128, 168, 34, 40, 'green', 34) + cube(128, 152, 16, 16, 'green', 16));
  return ground(160, 396, 140) + g({filter: SHADOW}, grass(160, 214, 92, 92) + tree + stone) + cube(46, 330, 12, 12, 'yellow', 12);
};

art['maze-muncher'] = () => {
  const wall = (d) => line(d, D('blue'), 14) + line(d, B('blue'), 8);
  const maze = wall('M30 168h90M200 168h90M30 168v80M290 168v80M80 220h50v40M190 220h50M30 330h60v56M150 300h20v40M230 300h60M290 300v86');
  const pellets = [70, 98, 126, 154, 182].map(x => circle(x, 276, 5, tone('cream', 1))).join('') + circle(250, 260, 10, L('yellow'));
  const mouth = 'M0 0L34-22A40 40 0 1 0 34 22Z';
  const muncher = g({transform: 'translate(232 276) scale(-1 1)', filter: SHADOW}, path(mouth, sphereFill('teal')) + eye(4, -18, 7, [-1, 0]));
  const ghost = g({filter: SHADOW}, path('M60 384v-52q0-30 30-30t30 30v52l-10-8-10 8-10-8-10 8-10-8Z', B('pink')) + path('M100 304q20 6 20 28v52l-10-8-10 8Z', D('pink'), {opacity: .6}) + eye(80, 334, 8, [1, 0]) + eye(102, 334, 8, [1, 0]));
  return ground(160, 396, 140) + maze + pellets + muncher + ghost;
};

art['corn-clicker'] = () => {
  const rows = ['', ''];
  for (let j = 0; j < 13; j++) for (let i = 0; i < 6; i++) rows[j % 2] += rr(132 + i * 11 + (j % 2) * 5.5, 150 + j * 14, 10, 13, 4);
  const kern = path(rows[0], L('yellow')) + path(rows[1], B('yellow'));
  const cob = `<clipPath id="cob"><ellipse cx="164" cy="240" rx="40" ry="102"/></clipPath>` + ellipse(164, 240, 40, 102, D('yellow')) +
    g({'clip-path': 'url(#cob)'}, kern + rect(176, 130, 40, 230, D('orange'), {opacity: .25}));
  const husk = path('M164 380C110 360 90 300 106 250 120 300 140 330 164 340Z', B('green')) + path('M164 380C218 360 238 300 222 250 208 300 188 330 164 340Z', D('green')) + path('M164 384C140 350 136 300 146 280 152 320 160 346 164 352Z', L('green'));
  const plus = [[64, 200, 22], [258, 230, 18], [84, 300, 16], [246, 160, 14]].map(([x, y, s]) => text(x, y, '+1', s, L('yellow'))).join('');
  const coins = [[268, 300], [52, 250]].map(([x, y]) => sphere(x, y, 11, 'yellow')).join('');
  return ground(164, 392, 90) + plus + coins + g({filter: SHADOW}, cob + husk);
};

art['slipline'] = () => {
  const s = 52, x0 = 30, y0 = 168;
  const arrow = (x, y, dir, c) => { // a short route with an arrowhead pointing in dir
    const [dx, dy] = {r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1]}[dir];
    const x1 = x - dx * 14, y1 = y - dy * 14, x2 = x + dx * 12, y2 = y + dy * 12;
    const head = `M${x2 + dx * 8} ${y2 + dy * 8}L${x2 - dy * 10} ${y2 + dx * 10}L${x2 + dy * 10} ${y2 - dx * 10}Z`;
    return line(`M${x1} ${y1}L${x2} ${y2}`, B(c), 9) + path(head, B(c), {stroke: B(c), 'stroke-width': 4, 'stroke-linejoin': 'round'});
  };
  const grid = [['r', 'd', 'l', 'd', 'u'], ['u', 'r', 'r', 'l', 'd'], ['l', 'u', 'd', 'r', 'u'], ['d', 'l', 'u', 'u', 'l']];
  const cols = ['teal', 'pink', 'purple', 'yellow', 'blue'];
  let out = rect(x0 - 10, y0 - 10, 5 * s + 20, 4 * s + 20, INK, {rx: 22, filter: SHADOW});
  grid.forEach((row, j) => row.forEach((dir, i) => {
    const cx = x0 + i * s + s / 2, cy = y0 + j * s + s / 2;
    if (i === 3 && j === 0) return; // the slot of the escaping arrow
    out += slot(cx - s / 2 + 3, cy - s / 2 + 3, s - 6, 12) + arrow(cx, cy, dir, cols[(i * 2 + j) % 5]);
  }));
  out += slot(x0 + 3 * s + 3, y0 + 3, s - 6, 12);
  const escape = g({filter: SHADOW}, arrow(212, 128, 'u', 'yellow')) + line('M212 156v10M200 152v6M224 152v6', L('yellow'), 3, {opacity: .7});
  const hearts = [0, 1, 2].map(i => path('M0 .9C-.2.7-1 .2-1-.35-1-.75-.7-1-.38-1-.18-1 0-.85 0-.65 0-.85.18-1 .38-1 .7-1 1-.75 1-.35 1 .2.2.7 0 .9Z', i < 2 ? B('red') : '#fff', {transform: `translate(${120 + i * 40} 400) scale(12)`, opacity: i < 2 ? 1 : .2})).join('');
  return out + escape + hearts;
};

art['quadfall'] = () => {
  const s = 30, x0 = 85, y0 = 148, cols = 5;
  const stack = ['....g', 'b..gg', 'bpppr', 'bbyrr', 'yyyr.'];
  const cmap = {b: 'blue', p: 'purple', r: 'red', g: 'green', y: 'yellow', o: 'orange', t: 'teal'};
  let out = rect(x0 - 8, y0 - 8, cols * s + 16, 8 * s + 16, INK, {rx: 18, filter: SHADOW});
  stack.forEach((row, j) => [...row].forEach((k, i) => { const x = x0 + i * s, y = y0 + (3 + j) * s; out += k === '.' ? slot(x + 1, y + 1, s - 2, 6) : tile(x + 1, y + 1, s - 2, cmap[k], {r: 6}); }));
  for (let j = 0; j < 3; j++) for (let i = 0; i < cols; i++) out += slot(x0 + i * s + 1, y0 + j * s + 1, s - 2, 6);
  // Falling T piece and its landing ghost.
  const t = [[1, 0], [2, 0], [3, 0], [2, 1]];
  out += t.map(([i, j]) => rect(x0 + i * s + 2, y0 + (j + 2) * s - 10 + 2, s - 4, s - 4, 'none', {rx: 6, stroke: L('orange'), 'stroke-width': 2, 'stroke-dasharray': '4 4', opacity: .6})).join('');
  out += g({filter: SHADOW}, t.map(([i, j]) => tile(x0 + i * s + 1, 116 + j * s, s - 2, 'orange', {r: 6})).join(''));
  return ground(160, 396, 110) + out + line('M100 112v-10M130 106v-14M160 112v-10', '#fff', 3, {opacity: .35});
};

art['fivefold'] = () => {
  const s = 48, gap = 6, x0 = 160 - (5 * s + 4 * gap) / 2;
  const rows = [['PLANT', 'gggxx'], ['PLAYS', 'ggggg'], ['', '.....']];
  const cmap = {g: 'green', y: 'yellow', x: 'slate'};
  let out = '';
  rows.forEach(([word, states], j) => [...states].forEach((st, i) => {
    const x = x0 + i * (s + gap), y = 176 + j * (s + gap);
    if (st === '.') out += rect(x + 2, y + 2, s - 4, s - 4, 'none', {rx: 10, stroke: '#fff', 'stroke-width': 3, opacity: .22});
    else out += tile(x, y, s, cmap[st], {r: 10}) + text(x + s / 2, y + s / 2 + 1, word[i], 26, '#fff');
  }));
  // Keyboard hint below.
  const keys = ['', ''];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 8; i++) keys[+[1, 4, 9, 10].includes(i + j * 8)] += rr(38 + i * 31 + j * 15, 350 + j * 24, 26, 18, 5);
  out += path(keys[0], '#fff', {opacity: .12}) + path(keys[1], '#fff', {opacity: .5});
  return ground(160, 400, 140) + g({filter: SHADOW}, out);
};

art['claimline'] = () => {
  const cx = 160, cy = 280, R = 112;
  const defs = `<clipPath id="arena"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><filter id="neon" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>`;
  const lands = path('M48 250q30-40 80-30t40 60-60 60-60-30Z', B('teal')) + path('M180 180q60-20 90 30t-10 70-70-20-10-80Z', B('yellow')) + path('M150 330q40-10 70 10t0 60H130Z', B('purple'));
  const shades = path('M48 250q30-40 80-30t40 60-60 60-60-30Z', D('teal'), {transform: 'translate(0 6)'}) + path('M180 180q60-20 90 30t-10 70-70-20-10-80Z', D('yellow'), {transform: 'translate(0 6)'}) + path('M150 330q40-10 70 10t0 60H130Z', D('purple'), {transform: 'translate(0 6)'});
  const trail = 'M150 262q50 -10 46 40t-60 40';
  const body = ground(160, 398, 120) + g({filter: SHADOW}, circle(cx, cy, R, INK)) +
    g({'clip-path': 'url(#arena)'}, shades + lands) + circle(cx, cy, R, 'none', {stroke: '#fff', 'stroke-width': 3, opacity: .2}) +
    line(trail, B('pink'), 12, {filter: 'url(#neon)'}) + line(trail, L('pink'), 5, {'stroke-dasharray': '1 9'}) + line(trail, B('pink'), 3) +
    g({filter: SHADOW}, sphere(136, 342, 12, 'pink') + eye(132, 340, 4) + eye(141, 340, 4)) +
    sphere(222, 222, 10, 'yellow') + sphere(100, 262, 10, 'teal');
  return {body, defs};
};

art['crossy-road'] = () => {
  // A rounded diorama board, like the other boards: river with a log, snow verge, road with a car, snow verge.
  const X = 28, Y = 178, BW = 264, BH = 196;
  const defs = `<clipPath id="board"><rect x="${X}" y="${Y}" width="${BW}" height="${BH}" rx="22"/></clipPath>`;
  const lane = (y, h, c, o = {}) => rect(X, y, BW, h, c, o);
  let lanes = lane(178, 62, B('blue')) + rect(X + BW * .7, 178, BW * .3, 62, D('blue'), {opacity: .35}) + line('M50 196h30M120 222h40M236 200h30', L('blue'), 4, {opacity: .6}) +
    rect(140, 196, 120, 28, B('wood'), {rx: 10}) + rect(140, 214, 120, 10, D('wood'), {rx: 5}) + circle(250, 209, 8, L('wood'));
  lanes += lane(240, 44, tone('cream', 1)) + lane(278, 6, tone('cream', 2));
  lanes += lane(284, 62, tone('ink', 0)) + line('M44 315h28M104 315h28M164 315h28M224 315h28', tone('cream', 1), 5, {opacity: .7});
  lanes += lane(346, 28, tone('cream', 1));
  const board = g({filter: SHADOW}, rect(X, Y + 10, BW, BH, tone('cream', 2), {rx: 22}) + g({'clip-path': 'url(#board)'}, lanes));
  const car = g({filter: SHADOW}, rect(176, 292, 92, 40, B('red'), {rx: 8}) + rect(176, 320, 92, 12, D('red'), {rx: 6}) + rect(194, 276, 52, 24, L('red'), {rx: 6}) + rect(204, 282, 32, 12, B('blue'), {rx: 3}) + circle(196, 334, 9, INK) + circle(250, 334, 9, INK));
  const ch = g({filter: SHADOW}, rect(70, 206, 62, 66, tone('cream', 1), {rx: 10}) + rect(110, 206, 22, 66, tone('cream', 2), {rx: 8}) +
    rect(90, 192, 20, 16, B('red'), {rx: 4}) + rect(130, 228, 18, 12, B('orange'), {rx: 3}) + rect(122, 242, 10, 12, B('red'), {rx: 3}) +
    rect(108, 218, 9, 11, INK, {rx: 2}) + rect(66, 250, 70, 12, B('red'), {rx: 6}) + rect(68, 258, 16, 24, D('red'), {rx: 5}) +
    rect(84, 272, 8, 12, B('orange')) + rect(110, 272, 8, 12, B('orange')));
  const snow = [[60, 150], [110, 168], [210, 156], [292, 214], [16, 260], [300, 300]].map(([x, y]) => circle(x, y, 3, '#fff', {opacity: .7})).join('');
  return {body: ground(160, 392, 130) + snow + board + car + ch, defs};
};

art['quad-clash'] = () => {
  const egg = 'M160 176c-46 0-70 76-70 122 0 48 30 80 70 80s70-32 70-80c0-46-24-122-70-122Z';
  const defs = `<clipPath id="egg"><path d="${egg}"/></clipPath>`;
  const ring = ellipse(160, 380, 120, 20, 'none', {stroke: B('yellow'), 'stroke-width': 4, opacity: .55, 'stroke-dasharray': '10 10'});
  const body = g({filter: SHADOW}, path(egg, tone('cream', 1)) + g({'clip-path': 'url(#egg)'}, ellipse(206, 300, 50, 110, tone('cream', 2), {opacity: .9}) + rect(80, 226, 160, 20, B('yellow')) + rect(80, 242, 160, 4, D('yellow'))) +
    path('M224 232l26-12-6 22Z', B('yellow')) + path('M226 240l28 4-20 14Z', D('yellow')) +
    eye(138, 274, 9, [1, 0]) + eye(176, 274, 9, [1, 0]) + line('M126 258l20 6M188 264l20-6', INK, 4) + line('M150 304q10 6 20 0', INK, 3) + blush(124, 296, 8) + blush(192, 296, 8));
  // Pencil blaster held across the body.
  const pencil = g({filter: SHADOW, transform: 'rotate(-20 200 330)'}, rect(150, 318, 120, 26, B('yellow'), {rx: 4}) + rect(150, 334, 120, 10, D('yellow')) + rect(140, 318, 16, 26, B('pink'), {rx: 4}) + rect(154, 318, 8, 26, tone('slate', 0)) + path('M270 318l30 13-30 13Z', L('wood')) + path('M290 327l10 4-10 4Z', INK) + ellipse(150, 352, 14, 10, tone('cream', 1)));
  const flask = g({filter: SHADOW}, path('M54 330h20v20l18 30q4 10-8 10H44q-12 0-8-10l18-30Z', '#fff', {opacity: .25}) + path('M42 374l10-16h26l10 16q4 10-8 10H50q-12 0-8-10Z', B('teal')) + rect(52, 324, 26, 8, D('wood'), {rx: 3}));
  return {body: ring + body + pencil + flask, defs};
};

// ---------- assemble ----------
async function build(id) {
  const spec = POSTERS[id];
  used = new Set();
  let r = await art[id]();
  if (typeof r === 'string') r = {body: r, defs: ''};
  const st = stage(spec.hue, spec.accent, spec.sparkles ?? SPARKS);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">` +
    `<title id="title">${spec.title}</title><desc id="desc">Original Pocket Arcade poster, generated by scripts/generate-posters.mjs.</desc>` +
    `<defs>${st.defs}${gradientDefs()}${r.defs}</defs>${st.back}${st.spark}${r.body}</svg>\n`;
  // Round every coordinate to two decimals (svg-skill optimisation rule); hex colours contain no '.'.
  const out = svg.replace(/-?\d*\.\d{3,}/g, m => String(+(+m).toFixed(2)));
  await writeFile(new URL(`../public/game-art/${id}/cover.svg`, import.meta.url), out);
  return out.length;
}

// Keeps each library card's colours in src/core/catalog.ts in step with its poster: the card colour is the
// top of the stage (shown while the image loads), the title is always cream and the underline is the accent.
async function syncCatalog() {
  const file = new URL('../src/core/catalog.ts', import.meta.url);
  let src = await readFile(file, 'utf8');
  for (const [id, spec] of Object.entries(POSTERS)) {
    const re = new RegExp(`(\\{id:'${id}',title:'[^']*',)color:'[^']*',ink:'[^']*',accent:'[^']*'`);
    if (!re.test(src)) throw new Error(`Catalog entry for ${id} not found`);
    src = src.replace(re, `$1color:'${stageColours(spec.hue).top}',ink:'${TITLE_INK}',accent:'${B(spec.accent)}'`);
  }
  await writeFile(file, src);
}

const only = process.argv.slice(2);
for (const id of only.length ? only : Object.keys(POSTERS)) {
  if (!art[id]) throw new Error(`No poster for ${id}`);
  console.log(id.padEnd(14), await build(id), 'bytes');
}
await syncCatalog();
