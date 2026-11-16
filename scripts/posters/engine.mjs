// Voxel poster engine: dense voxel models rendered to a flat-colour isometric SVG with baked lighting.
//
// Axes: +x runs down-right on screen, +y runs down-left, +z is up. The viewer sees each voxel's top,
// its +y face (screen left, lit) and its +x face (screen right, in shade). The key light comes from the
// upper left, so shadows fall towards +x / -y (screen right).
//
// Rendering is exact: every visible face lands on a triangular screen lattice, the frontmost face wins each
// triangle, and triangles that share a colour are merged into outlines. Lighting (side shade, cast shadow,
// ambient occlusion) is baked into each face's flat colour, so the SVG has no gradients or filters.

export const W = 320, H = 410;
export const FIT = {x0: 8, x1: 312, y0: 104, y1: 398};

// Shared palette. Append new colours at the end; never change an existing one.
export const C = {
  white: '#f2f5fa', cream: '#f4e6c8', snow: '#e4edf7', paper: '#fbf4e4',
  red: '#e8474f', orange: '#f59331', yellow: '#f7c531', gold: '#e9b023', lime: '#9ad547',
  green: '#4fb548', grass: '#62bc45', leaf: '#3f9a3a', dkgreen: '#2e7d3a', teal: '#25b6a6',
  sky: '#55b9ea', blue: '#3f7ee8', navy: '#283a6e', purple: '#8a5ae8', pink: '#f05fa6', magenta: '#c548d8',
  dirt: '#93603a', wood: '#b07a45', dkwood: '#7a4f2b', felt: '#2f9a63', stone: '#8d96a6', slate: '#5f6a80',
  dark: '#2b2f45', ink: '#1d1a2c', black: '#26232f', grey: '#9aa1ae', water: '#4aa6e0', glass: '#dff3ff',
  blush: '#f4a9c6', rose: '#e47ca4', maroon: '#7c2445', skin: '#f7d3b8', hair: '#80502f', tights: '#3e2f3c',
  lilac: '#c4b2ec', mint: '#a9dcc0', ice: '#aebde8',
  // appended for the dense remake
  dkred: '#b22f3c', dkorange: '#d06f1c', dkyellow: '#d99c1a', dkblue: '#2b58b8', dkpurple: '#6238b8',
  dkpink: '#c23d82', dkteal: '#178a80', dkdirt: '#6e4426', dkstone: '#6a7386', sand: '#e8cf9a',
  dksand: '#c9a86c', asphalt: '#3a3d4d', ltgrass: '#7fd058', dkgrass: '#4a9a3a', ltwood: '#cf9a5e',
  ltskin: '#fde3cf', dkskin: '#d9a585', brown: '#5b3a22', ltblue: '#8fd0f5', ltstone: '#b4bcc9',
};

// ---------- colour ----------
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hx = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hx(A.map((v, i) => v + (B[i] - v) * t)); };
export function toHsl(hex) {
  const v = rgb(hex).map(c => c / 255), max = Math.max(...v), min = Math.min(...v), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = d / (1 - Math.abs(2 * l - 1));
  const [r, g, b] = v, h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}
export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  return hx([0, 8, 4].map(n => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
}
// Lighten (+) or darken (-) a colour by dl lightness points, optionally changing saturation.
export const shift = (c, dl, ds = 0) => { const [h, s, l] = toHsl(c); return hsl(h, Math.max(0, Math.min(100, s + ds)), Math.max(0, Math.min(100, l + dl))); };
export const backdrop = hue => hsl(hue, 42, 21);

// Deterministic hash noise in [0, 1). Never use Math.random in a model.
export const hash = (x, y = 0, z = 0, seed = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
// Pick one of the colours by hash, for speckled materials: speckle([C.grass, C.ltgrass], 3) -> (x, y, z) => colour.
export const speckle = (colours, seed = 0, weights) => (x, y, z) => {
  let r = hash(x, y, z, seed);
  if (!weights) return colours[Math.floor(r * colours.length)];
  const total = weights.reduce((a, b) => a + b, 0); r *= total;
  for (let i = 0; i < colours.length; i++) { if (r < weights[i]) return colours[i]; r -= weights[i]; }
  return colours[colours.length - 1];
};

// ---------- scene ----------
const K = (x, y, z) => x + ',' + y + ',' + z;
export class Scene {
  constructor() { this.v = new Map(); }
  // c: '#rrggbb' or (x, y, z) => colour | null. o: {glow: true} (unlit, never shaded) or {alpha: 0..1} (glass).
  set(x, y, z, c, o) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (typeof c === 'function') c = c(x, y, z);
    if (c) this.v.set(K(x, y, z), {x, y, z, c, ...o}); else if (c === null) this.v.delete(K(x, y, z));
    return this;
  }
  get(x, y, z) { return this.v.get(K(x, y, z)); }
  has(x, y, z) { return this.v.has(K(x, y, z)); }
  del(x, y, z) { this.v.delete(K(x, y, z)); return this; }
  // Solid box from corner (x0, y0, z0) with size dx, dy, dz. Pass c = null to carve.
  box(x0, y0, z0, dx, dy, dz, c, o) {
    for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++) this.set(x, y, z, c, o);
    return this;
  }
  // Only fills empty cells (never overwrites), for adding around existing detail.
  fill(x0, y0, z0, dx, dy, dz, c, o) {
    for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++) if (!this.has(x, y, z)) this.set(x, y, z, c, o);
    return this;
  }
  // Ellipsoid centred on (cx, cy, cz) with radii rx, ry, rz (voxels whose centres fall inside).
  ellipsoid(cx, cy, cz, rx, ry, rz, c, o) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 + ((z + .5 - cz) / rz) ** 2 <= 1) this.set(x, y, z, c, o);
    return this;
  }
  ball(cx, cy, cz, r, c, o) { return this.ellipsoid(cx, cy, cz, r, r, r, c, o); }
  // Upright cylinder (axis 'z') or lying along 'x' / 'y'. (cx, cy, cz) is the centre of the base disc; h is the length.
  cyl(cx, cy, cz, r, h, c, axis = 'z', o) {
    for (let a = Math.floor(-r); a <= r; a++) for (let b = Math.floor(-r); b <= r; b++) {
      if ((a + .5) ** 2 + (b + .5) ** 2 > r * r) continue;
      for (let t = 0; t < h; t++) {
        if (axis === 'z') this.set(Math.floor(cx) + a, Math.floor(cy) + b, cz + t, c, o);
        else if (axis === 'x') this.set(cx + t, Math.floor(cy) + a, Math.floor(cz) + b, c, o);
        else this.set(Math.floor(cx) + a, cy + t, Math.floor(cz) + b, c, o);
      }
    }
    return this;
  }
  // A 1-voxel line (thick = extra radius) between two points.
  line(a, b, c, thick = 0, o) {
    const n = Math.max(1, ...[0, 1, 2].map(i => Math.abs(b[i] - a[i])));
    for (let t = 0; t <= n; t++) {
      const p = [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t / n));
      if (thick) this.box(p[0] - thick, p[1] - thick, p[2] - thick, thick * 2 + 1, thick * 2 + 1, thick * 2 + 1, c, o); else this.set(p[0], p[1], p[2], c, o);
    }
    return this;
  }
  // Hand-drawn pixel sprite stamped as voxels. rows: strings, first row is the TOP (or far edge for plane 'xy').
  // pal: {char: colour}; '.' and ' ' are empty. origin: voxel of the sprite's bottom-left pixel.
  // plane 'xz': columns run +x, rows run up +z, facing the +y viewer side (thickness goes -y).
  // plane 'yz': columns run -y (so the picture reads left-to-right on screen), rows up +z, facing +x (thickness goes -x).
  // plane 'xy': lies flat, columns run +x, rows run +y (first row is the far edge, smallest y), thickness goes up.
  sprite(rows, pal, [ox, oy, oz], plane = 'xz', thick = 1, o) {
    const hgt = rows.length;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      const c = pal[ch]; if (!c) return;
      for (let t = 0; t < thick; t++) {
        if (plane === 'xz') this.set(ox + i, oy - t, oz + hgt - 1 - j, c, o);
        else if (plane === 'yz') this.set(ox - t, oy - i, oz + hgt - 1 - j, c, o);
        else this.set(ox + i, oy + j, oz + t, c, o);
      }
    }));
    return this;
  }
  // Stack of flat 'xy' sprites: layers[0] is the BOTTOM layer. Each layer is rows of chars (first row = smallest y).
  layers(layers, pal, [ox, oy, oz], o) {
    layers.forEach((rows, k) => this.sprite(rows, pal, [ox, oy, oz + k], 'xy', 1, o));
    return this;
  }
  // Recolour existing voxels in a box: fn(voxel) -> colour | undefined (keep) | null (delete).
  paint(x0, y0, z0, dx, dy, dz, fn) {
    for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++) {
      const v = this.get(x, y, z); if (!v) continue;
      const c = typeof fn === 'function' ? fn(x, y, z, v) : fn;
      if (c === null) this.del(x, y, z); else if (c) v.c = c;
    }
    return this;
  }
  // Copy another scene in at an offset; turns = quarter turns clockwise seen from above; flipX mirrors first.
  stamp(other, [ox, oy, oz] = [0, 0, 0], turns = 0, flipX = false) {
    for (const v of other.v.values()) {
      let x = flipX ? -v.x : v.x, y = v.y;
      for (let t = 0; t < ((turns % 4) + 4) % 4; t++) [x, y] = [-y, x];
      const {c, glow, alpha} = v; this.set(x + ox, y + oy, v.z + oz, c, {glow, alpha});
    }
    return this;
  }
  bounds() {
    const b = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity};
    for (const v of this.v.values()) { b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y); b.z0 = Math.min(b.z0, v.z); b.z1 = Math.max(b.z1, v.z); }
    return b;
  }
}
// A floating island slab: `top` colour layer(s) over `under`, with a ragged underside. Top surface is z = z0
// (so things stand at z0 + 1). top/under may be colour functions.
export function island(s, x0, y0, w, d, top, under, depth = 4, z0 = 0, topDepth = 1) {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + d; y++) {
    const edge = Math.min(x - x0, y - y0, x0 + w - 1 - x, y0 + d - 1 - y);
    const dep = Math.max(1, Math.round(depth * (.55 + .45 * Math.min(1, edge / 3)) + hash(x, y, 9) * 1.4 - .7));
    for (let k = 0; k < topDepth; k++) s.set(x, y, z0 - k, top);
    for (let k = topDepth; k < topDepth + dep; k++) s.set(x, y, z0 - k, under);
  }
  return s;
}

// ---------- lighting ----------
const LIGHT = (() => { const v = [-.62, .38, 1], m = Math.hypot(...v); return v.map(a => a / m); })();
const SHADOW_TINT = '#1b1440';
function bake(scene) {
  const solid = (x, y, z) => { const v = scene.get(x, y, z); return !!v && !v.alpha && !v.ghost; };
  const b = scene.bounds();
  const shadowed = (px, py, pz) => { // march from a face centre towards the light
    for (let t = .7; t < 90; t += .5) {
      const x = px + LIGHT[0] * t, y = py + LIGHT[1] * t, z = pz + LIGHT[2] * t;
      if (z > b.z1 + 1 || x < b.x0 - 1 || y > b.y1 + 2) return false;
      const v = scene.get(Math.floor(x), Math.floor(y), Math.floor(z));
      if (v && !v.alpha && !v.glow && !v.noshadow) return true;
    }
    return false;
  };
  // side: 0 top, 1 left (+y), 2 right (+x). Returns the flat face colour.
  return (v, side) => {
    if (v.glow) return side === 0 ? shift(v.c, 6) : side === 1 ? v.c : shift(v.c, -5);
    const {x, y, z} = v;
    let occ = 0, lit = true;
    if (side === 0) {
      occ = solid(x - 1, y, z + 1) + solid(x + 1, y, z + 1) + solid(x, y - 1, z + 1) + solid(x, y + 1, z + 1);
      lit = !shadowed(x + .5, y + .5, z + 1.02);
    } else if (side === 1) {
      occ = solid(x - 1, y + 1, z) + solid(x + 1, y + 1, z) + solid(x, y + 1, z - 1) * 1.5 + solid(x, y + 1, z + 1) * .5;
      lit = !shadowed(x + .5, y + 1.02, z + .5);
    } else {
      occ = solid(x + 1, y - 1, z) + solid(x + 1, y + 1, z) + solid(x + 1, y, z - 1) * 1.5 + solid(x + 1, y, z + 1) * .5;
      lit = false;
    }
    // Brightness in lightness points, plus a cool tint in shade.
    const base = side === 0 ? 7 : side === 1 ? 0 : -12;
    const dl = base - (lit ? 0 : side === 2 ? 0 : 11) - Math.min(occ, 2.5) * 3.2;
    let c = shift(v.c, dl, dl < 0 ? -dl * .25 : 0);
    const tint = (side === 2 ? .1 : 0) + (lit ? 0 : side === 2 ? 0 : .12) + Math.min(occ, 2.5) * .025;
    if (tint) c = mix(c, SHADOW_TINT, tint);
    return c;
  };
}

// ---------- render ----------
const r1 = v => { const s = (+v).toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
export function render(scene, fit = FIT) {
  const face = bake(scene);
  // tri key (i, m): column i = floor(u), m = top of its vertical edge in half units. See header comment.
  const tris = new Map();
  const voxels = [...scene.v.values()].sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z));
  const put = (i, m, c, a) => {
    const k = i * 100003 + m;
    tris.set(k, {i, m, c: a ? mix(tris.get(k)?.c ?? scene.bg ?? '#000000', c, a) : c});
  };
  for (const v of voxels) {
    const {x, y, z} = v, s = x + y - 2 * z, u = x - y, a = v.alpha;
    const hid = (p, q, r) => { const n = scene.get(p, q, r); return n && (a ? true : !n.alpha); };
    if (!hid(x, y, z + 1)) { const c = face(v, 0); put(u - 1, s - 2, c, a); put(u, s - 2, c, a); }
    if (!hid(x, y + 1, z)) { const c = face(v, 1); put(u - 1, s - 1, c, a); put(u - 1, s, c, a); }
    if (!hid(x + 1, y, z)) { const c = face(v, 2); put(u, s, c, a); put(u, s - 1, c, a); }
  }
  // Triangle (i, m): if (m - i) is even its vertical edge is on the left (u = i), apex right; else mirrored.
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const t of tris.values()) { u0 = Math.min(u0, t.i); u1 = Math.max(u1, t.i + 1); v0 = Math.min(v0, t.m); v1 = Math.max(v1, t.m + 2); }
  const a = Math.min((fit.x1 - fit.x0) / (u1 - u0), (fit.y1 - fit.y0) / ((v1 - v0) / 2));
  const ox = (fit.x0 + fit.x1) / 2 - a * (u0 + u1) / 2;
  const free = (fit.y1 - fit.y0) - a * (v1 - v0) / 2;
  const oy = fit.y1 - a * v1 / 2 - free * .4;
  // Merge same-colour triangles into outlines: collect directed edges, cancel shared ones, chain the rest.
  const byColour = new Map();
  const P = (pu, pm) => pu * 100003 + pm; // lattice point key
  for (const t of tris.values()) {
    const L = ((t.m - t.i) % 2 + 2) % 2 === 0;
    const pts = L ? [[t.i, t.m], [t.i + 1, t.m + 1], [t.i, t.m + 2]] : [[t.i + 1, t.m], [t.i + 1, t.m + 2], [t.i, t.m + 1]];
    let edges = byColour.get(t.c); if (!edges) byColour.set(t.c, edges = new Map());
    for (let e = 0; e < 3; e++) {
      const p = pts[e], q = pts[(e + 1) % 3], kp = P(...p), kq = P(...q), rev = kq + '>' + kp;
      if (edges.has(rev)) edges.delete(rev); else edges.set(kp + '>' + kq, [p, q, kp, kq]);
    }
  }
  let out = '';
  const X = pu => ox + a * pu, Y = pm => oy + a * pm / 2;
  for (const [colour, edges] of byColour) {
    const from = new Map();
    for (const e of edges.values()) { const l = from.get(e[2]); if (l) l.push(e); else from.set(e[2], [e]); }
    let d = '';
    for (const start of edges.values()) {
      if (start.used) continue;
      const loop = []; let e = start;
      while (e && !e.used) { e.used = true; loop.push(e[0]); e = (from.get(e[3]) ?? []).find(n => !n.used); }
      // drop collinear points
      const pts = loop.filter((p, i) => { const q = loop[(i + loop.length - 1) % loop.length], r = loop[(i + 1) % loop.length]; return (p[0] - q[0]) * (r[1] - p[1]) !== (p[1] - q[1]) * (r[0] - p[0]); });
      d += 'M' + pts.map(p => r1(X(p[0])) + ' ' + r1(Y(p[1]))).join(' ') + 'Z';
    }
    out += `<path fill="${colour}" stroke="${colour}" d="${d}"/>`;
  }
  out = `<g stroke-width="${r1(Math.min(.6, a * .14))}" stroke-linejoin="round">${out}</g>`;
  return {svg: out, a, box: [X(u0), Y(v0), X(u1), Y(v1)], faces: tris.size / 2, voxels: scene.v.size};
}

// ---------- backdrop and assembly ----------
// Flat backdrop with a stepped glow behind the model, a contact shadow under it and pixel particles around it.
function backdropSvg(id, bg, box) {
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, bw = box[2] - box[0];
  let s = `<path fill="${bg}" d="M0 0h${W}v${H}H0Z"/>`;
  const disc = (r, c) => `<circle cx="${r1(cx)}" cy="${r1(cy + 6)}" r="${r1(r)}" fill="${c}"/>`;
  s += disc(Math.min(190, bw * .78), shift(bg, 2.5, 2)) + disc(Math.min(150, bw * .58), shift(bg, 5, 3));
  const seedN = [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 7);
  let d = '';
  for (let i = 0; i < 54; i++) {
    const x = 6 + hash(i, 1, 0, seedN) * 304, y = 100 + hash(i, 2, 0, seedN) * 304, sz = hash(i, 3, 0, seedN) < .3 ? 5 : 3;
    if (x > box[0] - 4 && x < box[2] + 4 && y > box[1] - 4 && y < box[3] + 4) continue;
    d += `M${r1(x)} ${r1(y)}h${sz}v${sz}h-${sz}Z`;
  }
  if (d) s += `<path fill="${shift(bg, 34, -8)}" fill-opacity=".75" d="${d}"/>`;
  return s;
}
export function poster(id, spec, build, helpers) {
  const scene = new Scene();
  scene.bg = spec.color ?? backdrop(spec.hue);
  build(scene, helpers);
  const model = render(scene, {...FIT, ...(spec.fit ?? {})});
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">` +
    `<title id="title">${spec.title}</title><desc id="desc">Original Pocket Arcade voxel poster, generated by scripts/generate-posters.mjs.</desc>` +
    backdropSvg(id, scene.bg, model.box) + model.svg + `</svg>\n`;
  return {...model, svg};
}
