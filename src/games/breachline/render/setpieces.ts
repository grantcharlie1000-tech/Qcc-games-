/** The map-fill set pieces modelled in code (map-fill plan, Phase B and section 12.3): cabinets, vending machines,
 * shelving, a sofa and its table, crates, pallets and drums, planters and low walls, skips, bin stores, a trailer and a
 * generator. Each is built in three states (intact, damaged, wrecked), each inside its collision box (collision never
 * changes), as one vertex-coloured geometry, and all are drawn by one BatchedMesh. A piece's state follows the rounds
 * and blasts it has taken, counted from the shared `shot` and `boom` events, so every client sees the same; a state
 * change throws debris that stays. Our own designs. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Effects } from '../effects';
import { SET_PIECES, TEXTURED_PIECES, frame, type SetPieceDef } from './setpieces-data';
import { MODEL_BOUNDS, SOFA_TILT, crateScale, drumSpots, sofaScale } from './setpiecemodels';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { frame };

type V3 = [number, number, number];
const c = new THREE.Color();
/** Paints a geometry one sRGB colour (vertex colours) and keeps only position, normal and colour, so parts merge. */
function paint(g: THREE.BufferGeometry, hex: number, shade = 1, surf = 0): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'fe') out.deleteAttribute(k);
  // Face coordinates in metres (u, v, width, height) for edge wear; parts without faces of their own sit far from edges.
  if (!out.attributes.fe) { const fe = new Float32Array(out.attributes.position.count * 4); for (let i = 0; i < fe.length; i += 4) fe.set([25, 25, 50, 50], i); out.setAttribute('fe', new THREE.BufferAttribute(fe, 4)); }
  c.setHex(hex, THREE.SRGBColorSpace).multiplyScalar(shade);
  const n = out.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(n).fill(surf), 1));
  return out;
}
/** Local frame: x along the piece (0..L), y up (0..H), z out of its back (0) to its front (D). */
class Kit {
  parts: THREE.BufferGeometry[] = [];
  /** The surface the next parts take (SURF), unless their colour says wood or card. */
  surf = 0;
  private as(hex: number) { return WOODS.has(hex) ? SURF.wood : hex === CARD ? SURF.card : this.surf; }
  constructor(readonly L: number, readonly D: number, readonly H: number, private seed: number) {}
  r() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  /** A box from (x0, y0, z0) to (x1, y1, z1), turned by `rot` about its centre. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, shade = 1, rot: V3 = [0, 0, 0]) {
    const W = Math.max(0.002, x1 - x0), Hh = Math.max(0.002, y1 - y0), Dd = Math.max(0.002, z1 - z0), g = new THREE.BoxGeometry(W, Hh, Dd);
    // BoxGeometry's faces in order +x, -x, +y, -y, +z, -z: their u and v run along (z, y), (x, z) and (x, y).
    const uv = g.attributes.uv, fe = new Float32Array(uv.count * 4), size = [[Dd, Hh], [Dd, Hh], [W, Dd], [W, Dd], [W, Hh], [W, Hh]];
    for (let i = 0; i < uv.count; i++) { const [su, sv] = size[Math.floor(i / 4)]; fe.set([uv.getX(i) * su, uv.getY(i) * sv, su, sv], i * 4); }
    g.setAttribute('fe', new THREE.BufferAttribute(fe, 4));
    g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.parts.push(paint(g, hex, shade, this.as(hex)));
  }
  cyl(x: number, z: number, r: number, y0: number, y1: number, hex: number, shade = 1, rot: V3 = [0, 0, 0], seg = 14) {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg); g.rotateX(rot[0]); g.rotateZ(rot[2]); g.translate(x, (y0 + y1) / 2, z);
    this.parts.push(paint(g, hex, shade, this.as(hex)));
  }
  /** A trapezoid or other outline in x-y, extruded from z0 to z1. `open`: only its top face (an inside seen from above). */
  prism(pts: [number, number][], z0: number, z1: number, hex: number, shade = 1, open = false) {
    if (open) { const top = Math.max(...pts.map(p => p[1])), xs = pts.filter(p => p[1] === top).map(p => p[0]); this.box(Math.min(...xs), top - 0.002, z0, Math.max(...xs), top, z1, hex, shade); return; }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false });
    g.translate(0, 0, z0);
    this.parts.push(paint(g, hex, shade, this.as(hex)));
  }
  /** An outline in z-y (across, up), extruded along x from x0 to x1 (a tarp's profile along a trailer). */
  prismX(pts: [number, number][], x0: number, x1: number, hex: number, shade = 1) {
    // Extruded along +z from a shape drawn at (-z, y), then turned a quarter about y: (x, y, z) -> (z, y, -x).
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y))), { depth: x1 - x0, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(x0, 0, 0);
    this.parts.push(paint(g, hex, shade, this.as(hex)));
  }
  /** A bullet hole in a face looking along +z at depth z: a dark hole in a ring of bare, bright metal. */
  pock(x: number, y: number, z: number) {
    const a = 0.025 + this.r() * 0.02, turn: V3 = [0, 0, this.r() * 1.5];
    this.box(x - a, y - a, z, x + a, y + a, z + 0.003, 0xb8b4ac, 1.1, turn);
    this.box(x - a * 0.45, y - a * 0.45, z + 0.003, x + a * 0.45, y + a * 0.45, z + 0.005, 0x0a0a0a, 1, turn);
  }
  /** A sphere (stuffing, clumps). */
  ball(x: number, y: number, z: number, r: number, hex: number, shade = 1) {
    const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z);
    this.parts.push(paint(g, hex, shade, this.as(hex)));
  }
  /** A soft cushion (a rounded box) w x h x d centred at (x, z) on the floor, turned by `yaw` and tipped by `tip`. */
  cushion(x: number, z: number, w: number, h: number, d: number, hex: number, yaw = 0, tip = 0) {
    const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(h, d) * 0.45); g.rotateZ(tip); g.rotateY(yaw); g.translate(x, h / 2 + Math.abs(Math.sin(tip)) * w / 2, z);
    this.parts.push(paint(g, hex, 1, SURF.fabric));
  }
  /** No geometry of its own in this state (a model shows it): one hidden sliver, so the batch has an id. */
  none() { this.box(0, -0.01, 0, 0.002, -0.008, 0.002, 0x000000); }
  done(): THREE.BufferGeometry { const g = mergeGeometries(this.parts, false)!; for (const p of this.parts) p.dispose(); return g; }
}

const WOODS = new Set([0x8a6a46, 0xa48662, 0x6a4e30, 0xc4a070, 0x7a6a50, 0x6a5a40]);
const DARK = 0x1c1e20, STEEL = 0x8a8f94, WOOD = 0x8a6a46, PALLET = 0xa48662, CARD = 0xa88a62;
/** Each family's builder: the local kit for a given state (0 intact, 1 damaged, 2 wrecked). */
/** Surface kinds the shader draws detail for. */
const SURF = { plain: 0, steel: 1, fabric: 2, wood: 3, card: 4, concrete: 5 } as const;
const FAMILY_SURF: Record<string, number> = {
  cabinet: SURF.steel, vending: SURF.steel, display: SURF.steel, filing: SURF.steel, trolley: SURF.steel, shelving: SURF.steel, skip: SURF.steel,
  generator: SURF.steel, drums: SURF.steel, binstore: SURF.wood, sofa: SURF.fabric, trailer: SURF.fabric, lowwall: SURF.concrete, planter: SURF.concrete,
  materials: SURF.concrete, lowtable: SURF.wood, crates: SURF.wood, pallets: SURF.wood,
};
const BUILD: Record<string, (k: Kit, s: number, p: SetPieceDef) => void> = {
  cabinet(k, s, p) {
    if (TEXTURED_PIECES.has(p.name)) {
      // A server rack the art layer draws with its photo texture: only the damage, on its faces. Damaged: rounds
      // through the units. Wrecked: more, a unit torn half out of the rack, cables hanging, debris below.
      const { L, D, H } = k;
      k.none();
      for (let i = 0; i < (s === 0 ? 0 : s === 1 ? 7 : 16); i++) k.pock(0.08 + k.r() * (L - 0.16), 0.3 + k.r() * (H - 0.5), D + 0.002);
      if (s === 2) {
        k.box(0.06, H * 0.48, D - 0.02, L - 0.06, H * 0.48 + 0.085, D + 0.025, 0x2a2c30, 0.9, [0.12, 0, 0.04]);
        for (let i = 0; i < 5; i++) { const x = 0.12 + k.r() * (L - 0.24); k.box(x, H * 0.18 + k.r() * 0.3, D + 0.004, x + 0.012, H * 0.47, D + 0.016, [0x1a1a1a, 0x2a50a0, 0xc0a020, 0x1a1a1a, 0xc03020][i], 1, [0, 0, k.r() * 0.3 - 0.15]); }
        for (let i = 0; i < 8; i++) { const x = k.r() * L, z = D + 0.04 + k.r() * 0.45; k.box(x, 0, z, x + 0.1 + k.r() * 0.12, 0.02 + k.r() * 0.03, z + 0.05 + k.r() * 0.06, i % 2 ? 0x1c1e20 : 0x3a3c3e, 1, [0, k.r() * 3, 0]); }
      }
      return;
    }
    const { L, D, H } = k, hue = p.name.includes('UPS') || p.name.includes('network') ? 0x2a2d31 : 0x7d8388;
    k.box(0, 0, 0, L, H, D * 0.96, hue);
    k.box(0, 0, D * 0.96, L, 0.08, D, DARK);
    const doors = Math.max(1, Math.round(L / 0.5)), w = L / doors;
    for (let i = 0; i < doors; i++) {
      const a = i * w + 0.01, b = (i + 1) * w - 0.01, open = s === 2 && i === 0 ? 1 : s === 1 && i === doors - 1 ? 0.35 : 0;
      if (open && s === 2) { k.box(a, 0.02, D + 0.02, b, 0.05, D + 0.6, hue, 0.9); continue; }         // a door off, on the floor
      const zf = open ? D - 0.03 - (b - a) / 2 * Math.sin(open) : D * 0.96;
      k.box(a, 0.1, zf, b, H - 0.04, zf + D * 0.02, hue, 1.08, [0, -open, 0]);
      k.box(b - 0.06, H * 0.48, D * 0.98, b - 0.04, H * 0.62, D, STEEL);
      if (p.name.includes('network') || p.name.includes('UPS')) for (let j = 0; j < 6; j++) k.box(a + 0.05, H * 0.75 - j * 0.05, D * 0.985, a + 0.12, H * 0.75 - j * 0.05 + 0.012, D * 0.99, j % 3 ? 0x2b8f3a : 0xd09020, 1.6);
    }
    // Damage: dents and punctures as dark patches on the front, a skew at the top when wrecked.
    const hits = s === 0 ? 0 : s === 1 ? 4 : 9;
    for (let i = 0; i < hits; i++) k.pock(0.08 + k.r() * (L - 0.16), 0.25 + k.r() * (H - 0.5), D * 0.985);
    if (s === 2) k.box(0.02, H - 0.25, D * 0.5, L - 0.02, H - 0.02, D * 0.98, hue, 0.8, [0.18, 0, 0]);
  },
  vending(k, s) {
    // A drinks machine: a red cabinet with a lit header, a glass front over a dark interior where drinks stand in rows
    // on spiral coils, a column with the display, keypad and coin slot, a delivery flap. Damaged: the glass cracked in
    // stars round the holes, the header flickering dark. Wrecked: the glass gone (shards below), the rows half
    // emptied onto the floor, the door dented.
    const { L, D, H } = k, RED = 0x9a1e22, GW = L * 0.66, CANS = [0xd04030, 0x3060c0, 0xe0b020, 0x30a050, 0xe8e8e8];
    // The body round an open bay for the glass: back, sides, the right-hand column, the header and the base.
    k.box(0, 0, 0, L, H, D * 0.42, RED);
    k.box(0, 0, D * 0.42, 0.04, H, D * 0.9, RED); k.box(GW + 0.04, 0, D * 0.42, L, H, D * 0.9, RED);
    k.box(0.04, H - 0.22, D * 0.42, GW + 0.04, H, D * 0.9, RED); k.box(0.04, 0, D * 0.42, GW + 0.04, 0.42, D * 0.9, RED);
    k.box(0, H - 0.22, D * 0.9, L, H, D, s === 2 ? 0x2a2a2a : 0xf0e6c8, s === 0 ? 2.0 : 1.2);
    k.box(0, 0, D * 0.9, L, 0.12, D, RED, 0.8);
    k.box(0.04, 0.12, D * 0.42, GW + 0.04, H - 0.22, D * 0.45, 0x0e1012);
    k.box(0.04, 0.12, D * 0.45, 0.06, H - 0.22, D * 0.93, 0x2a2c2e); k.box(GW + 0.02, 0.12, D * 0.45, GW + 0.04, H - 0.22, D * 0.93, 0x2a2c2e);
    const rows = 6, rh = (H - 0.62) / rows;
    for (let r = 0; r < rows; r++) {
      const y = 0.5 + r * rh;
      k.box(0.06, y - 0.01, D * 0.45, GW + 0.02, y, D * 0.93, 0x5a5e62);
      for (let i = 0; i < 6; i++) {
        if (s === 2 && (r + i) % 3 !== 0) continue;
        const x = 0.1 + i * (GW - 0.08) / 6;
        k.cyl(x, D * 0.86, 0.032, y, y + rh * 0.62, CANS[(r * 2 + i) % 5], 1.1, [0, 0, 0], 10);
        k.cyl(x, D * 0.86, 0.04, y, y + 0.012, 0x8a8e92, 0.9, [0, 0, 0], 10);
      }
    }
    for (const x of [0.04, GW + 0.02]) k.box(x, 0.12, D * 0.93, x + 0.025, H - 0.22, D, RED, 0.9);
    k.box(0.04, 0.12, D * 0.93, GW + 0.04, 0.42, D, RED, 0.9);
    k.box(0.04, H - 0.25, D * 0.93, GW + 0.04, H - 0.22, D, RED, 0.9);
    if (s < 2) for (let i = 0; i < 3; i++) { const x = 0.2 + i * 0.16, y = 0.7 + i * 0.25; k.box(x, y, D * 0.995, x + 0.012, y + 0.3, D, 0xb8c8d0, 0.9, [0, 0, 0.4]); }
    k.box(0.12, 0.16, D * 0.93, GW - 0.04, 0.36, D * 0.95, 0x141414);
    const px = GW + 0.08;
    k.box(px, H * 0.62, D * 0.9, L - 0.05, H * 0.7, D * 0.92, 0x1a2a1a); k.box(px + 0.02, H * 0.64, D * 0.92, L - 0.07, H * 0.68, D * 0.925, s === 2 ? 0x101010 : 0x50e060, s === 2 ? 1 : 1.8);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.box(px + 0.03 + c * 0.075, H * 0.42 + r * 0.06, D * 0.9, px + 0.08 + c * 0.075, H * 0.42 + r * 0.06 + 0.04, D * 0.925, 0xc8c8c0);
    k.box(px + 0.06, H * 0.32, D * 0.9, px + 0.16, H * 0.36, D * 0.93, 0x2a2a2a);
    // Damage.
    if (s === 1) for (let i = 0; i < 4; i++) {
      const x = 0.15 + k.r() * (GW - 0.25), y = 0.6 + k.r() * (H - 1.0);
      k.pock(x, y, D * 0.997);
      for (let j = 0; j < 5; j++) { const a = k.r() * 6.28, l = 0.08 + k.r() * 0.12; k.box(x - 0.002, y, D * 0.998, x + 0.002, y + l, D, 0xf0f4f6, 1.6, [0, 0, a]); }
    }
    if (s === 2) {
      for (let i = 0; i < 14; i++) { const x = k.r() * L, z = D + 0.03 + k.r() * 0.5; k.box(x, 0, z, x + 0.03 + k.r() * 0.05, 0.004, z + 0.03 + k.r() * 0.04, 0xc8dce4, 1.4, [0, k.r() * 3, 0]); }
      for (let i = 0; i < 12; i++) { const x = 0.05 + k.r() * (L - 0.1), z = D + 0.05 + k.r() * 0.45; k.cyl(x, z, 0.032, 0.032 - 0.06, 0.032 + 0.06, CANS[i % 5], 1.1, [Math.PI / 2, 0, k.r() * 3], 10); }
      for (let i = 0; i < 6; i++) k.pock(0.1 + k.r() * (L - 0.2), 0.2 + k.r() * (H - 0.5), D);
      k.box(L * 0.05, 0.3, D * 0.95, L * 0.4, 0.9, D * 0.99, RED, 0.7, [0, 0, 0.08]);
    }
  },

  display(k, s) {
    // A glazed display case: aluminium frame, a dark wood back, glass shelves of trophies, boxed kit and binders.
    // Damaged: the front glass cracked in stars. Wrecked: the glass gone (shards below and on the shelves), the
    // shelves tipped and their contents fallen.
    const { L, D, H } = k, AL = 0xb8bcc0, ITEMS = [0xc8a040, 0x506080, 0xa04030, 0xe0e0d8, 0x305830];
    k.box(0, 0, 0, L, 0.12, D, 0x3a2a1e); k.box(0, H - 0.08, 0, L, H, D, AL, 0.9);
    k.box(0.03, 0.12, 0, L - 0.03, H - 0.08, 0.03, 0x4a3424);
    for (const x of [0, L - 0.03]) k.box(x, 0, 0, x + 0.03, H, D, AL);
    for (const x of [0, L / 2 - 0.012, L - 0.03]) k.box(x, 0.12, D - 0.03, x + (x === 0 || x === L - 0.03 ? 0.03 : 0.024), H - 0.08, D, AL);
    const shelves = [0.55, 1.0, 1.45];
    shelves.forEach((y, si) => {
      const fallen = s === 2 && si === 1;
      k.box(0.03, y, 0.03, L - 0.03, y + 0.012, D - 0.04, 0xc8dce4, 1.2, fallen ? [0, 0, 0.18] : [0, 0, 0]);
      if (fallen) return;
      for (let i = 0; i < 5; i++) {
        const x = 0.12 + i * (L - 0.24) / 5, c = ITEMS[(i + si) % 5];
        if (s === 2 && i % 2) continue;
        if (i % 3 === 0) { k.cyl(x + 0.05, D * 0.45, 0.025, y + 0.012, y + 0.2, c, 1.2, [0, 0, 0], 10); k.box(x, y + 0.012, D * 0.45 - 0.05, x + 0.1, y + 0.05, D * 0.45 + 0.05, 0x2a2a2a); }
        else k.box(x, y + 0.012, 0.08, x + 0.1 + k.r() * 0.05, y + 0.18 + k.r() * 0.12, D * 0.6, c, 1);
      }
    });
    if (s < 2) for (let i = 0; i < 4; i++) { const x = 0.2 + i * (L - 0.4) / 3, y = 0.4 + (i % 2) * 0.6; k.box(x, y, D - 0.016, x + 0.03, y + 0.45, D - 0.012, 0xdfe8ee, s === 0 ? 1.6 : 1.1, [0, 0, 0.4]); }
    if (s === 1) for (let i = 0; i < 3; i++) {
      const x = 0.2 + k.r() * (L - 0.4), y = 0.4 + k.r() * (H - 0.9);
      k.pock(x, y, D - 0.01);
      for (let j = 0; j < 6; j++) { const a = k.r() * 6.28, l = 0.1 + k.r() * 0.15; k.box(x - 0.002, y, D - 0.012, x + 0.002, y + l, D - 0.01, 0xf0f4f6, 1.6, [0, 0, a]); }
    }
    if (s === 2) {
      for (let i = 0; i < 16; i++) { const x = k.r() * L, z = D + 0.03 + k.r() * 0.55; k.box(x, 0, z, x + 0.04 + k.r() * 0.08, 0.004, z + 0.03 + k.r() * 0.06, 0xc8dce4, 1.4, [0, k.r() * 3, 0]); }
      for (let i = 0; i < 6; i++) { const x = 0.05 + k.r() * (L - 0.25), z = D + 0.05 + k.r() * 0.4; k.box(x, 0, z, x + 0.12, 0.1, z + 0.09, ITEMS[i % 5], 1, [k.r(), k.r() * 3, k.r() * 0.5]); }
    }
  },

  filing(k, s) {
    const { L, D, H } = k, n = Math.max(1, Math.round(L / 0.47)), w = L / n;
    k.box(0, 0, 0, L, H, D * 0.95, 0x8a8e86);
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
      const a = i * w + 0.01, b = (i + 1) * w - 0.01, y0 = 0.05 + j * (H - 0.05) / 3 + 0.01, y1 = 0.05 + (j + 1) * (H - 0.05) / 3 - 0.01, gone = (s === 1 && j === 1 && i === 0) || (s === 2 && j < 2 && i % 2 === 0);
      if (gone) { k.box(a, y0, D * 0.9, b, y1, D * 0.96, DARK, 0.5); k.box(a + 0.03, 0, D + 0.08, b - 0.03, 0.2, D + 0.08 + (y1 - y0), 0x969a92, 0.95); continue; }
      k.box(a, y0, D * 0.95 - 0.02, b, y1, D * 0.97, 0x969a92, 1.05);
      k.box((a + b) / 2 - 0.06, y1 - 0.08, D * 0.97, (a + b) / 2 + 0.06, y1 - 0.06, D * 0.99, STEEL);
    }
    if (s === 2) for (let i = 0; i < 8; i++) { const x = k.r() * L; k.box(x, 0.003, D + 0.1 + k.r() * 0.5, x + 0.21, 0.006, D + 0.4 + k.r() * 0.5, 0xeeeeea, 1.1, [0, k.r() * 3, 0]); }
  },
  trolley(k, s) {
    const { L, D, H } = k;
    for (const y of [0.15, H - 0.04]) k.box(0, y, 0.02, L, y + 0.03, D - 0.02, STEEL);
    for (const x of [0.02, L - 0.04]) for (const z of [0.02, D - 0.04]) k.box(x, 0.06, z, x + 0.02, H, z + 0.02, STEEL, 0.8);
    for (let i = 0; i < 3; i++) { const tip = s === 2 && i === 1; k.box(0.08 + i * (L - 0.16) / 3, tip ? 0.18 : H - 0.01, 0.06, 0.08 + (i + 0.85) * (L - 0.16) / 3, tip ? 0.44 : H + Math.min(0, 0.26 - 0.0), D - 0.06, CARD, 1, tip ? [0, 0, 0.5] : [0, 0, 0]); }
    if (s >= 1) k.box(0.1, 0.18, 0.08, L * 0.45, 0.4, D - 0.08, CARD, 0.85, [0, 0, s === 2 ? 0.3 : 0.08]);
  },
  // The sofas are Poly Haven's sofa_02 (render/setpiecemodels.ts): this draws their damage in the model's own
  // coordinates, put through the same scale, tilt and centring as the model. Damaged: bullet tears with stuffing
  // bulging out through curled leather. Wrecked (the model leans on a broken leg): more tears, the back split along
  // its top, a seat cushion thrown onto the floor, the leg and clumps of stuffing round it.
  sofa(k, s) {
    const { L, D, H } = k, LEATHER = 0x5a3820, STUFF = 0xbdb5a0, b = MODEL_BOUNDS.sofa_02;
    if (s === 0) { k.none(); return; }
    const tilt = s === 2 ? SOFA_TILT : 0, sc = s === 2 ? sofaScale(L, D, H, SOFA_TILT) * 0.99 : sofaScale(L, D, H, 0), ct = Math.cos(tilt), st = Math.sin(tilt);
    let lx = Infinity, hx = -Infinity, ly = Infinity;
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) { const xr = x * ct - y * st, yr = x * st + y * ct; lx = Math.min(lx, xr); hx = Math.max(hx, xr); ly = Math.min(ly, yr); }
    const at = (u: number, v: number, w: number): V3 => [L / 2 + (u * ct - v * st - (lx + hx) / 2) * sc, (u * st + v * ct - ly) * sc, D / 2 + (w - (b[2] + b[5]) / 2) * sc];
    const tear = (u: number, v: number, w: number, facing: 'up' | 'front', big: number) => {
      const [x, y, z] = at(u, v, w);
      for (let i = 0; i < 3 + Math.round(big * 2); i++) {
        const r = (0.03 + k.r() * 0.03) * big, du = (k.r() - 0.5) * 0.09 * big, dv = (k.r() - 0.5) * 0.06 * big;
        if (facing === 'up') k.ball(x + du, y + r * 0.5, z + dv, r, STUFF, 0.95 + k.r() * 0.15);
        else k.ball(x + du, y + dv, z + r * 0.5, r, STUFF, 0.95 + k.r() * 0.15);
      }
      for (let i = 0; i < 3; i++) {
        const a = k.r() * 6.28, d = 0.06 * big;
        if (facing === 'up') k.box(x + Math.cos(a) * d - 0.035, y, z + Math.sin(a) * d - 0.02, x + Math.cos(a) * d + 0.035, y + 0.006, z + Math.sin(a) * d + 0.02, LEATHER, 0.8, [0.5, a, 0]);
        else k.box(x + Math.cos(a) * d - 0.035, y + Math.sin(a) * d - 0.02, z, x + Math.cos(a) * d + 0.035, y + Math.sin(a) * d + 0.02, z + 0.006, LEATHER, 0.8, [0.5, 0, a]);
      }
    };
    const seat = s === 1 ? 3 : 5, back = s === 1 ? 3 : 4;
    for (let i = 0; i < seat; i++) tear(-0.55 + (i + 0.5) * 1.1 / seat + (k.r() - 0.5) * 0.12, 0.415, 0.02 + k.r() * 0.18, 'up', 1 + (s === 2 ? 0.4 : 0));
    for (let i = 0; i < back; i++) tear(-0.55 + (i + 0.5) * 1.1 / back + (k.r() - 0.5) * 0.12, 0.5 + k.r() * 0.12, -0.205, 'front', 1 + (s === 2 ? 0.4 : 0));
    if (s === 2) {
      // The back split along its top: a dark gash with stuffing pushed out of it.
      for (let i = 0; i < 7; i++) { const [x, y, z] = at(-0.5 + i * 0.13, 0.66, -0.3); k.box(x - 0.07, y - 0.015, z - 0.04, x + 0.07, y + 0.012, z + 0.05, 0x1a120c, 1, [0, 0, (k.r() - 0.5) * 0.3]); k.ball(x, y + 0.02, z, 0.035 + k.r() * 0.025, STUFF); }
      // A seat cushion thrown off onto the floor in front, a broken turned leg, stuffing scattered.
      k.cushion(L * 0.3, D + 0.12, 0.62 * sc, 0.13, 0.5 * sc, LEATHER, 0.45, 0.06);
      k.cyl(L * 0.72, D + 0.25, 0.028, -0.07, 0.07, 0x3a2414, 1, [0, 0, Math.PI / 2], 8);
      for (let i = 0; i < 10; i++) { const x = 0.1 + k.r() * (L - 0.2), z = D + 0.05 + k.r() * 0.6, r = 0.025 + k.r() * 0.03; k.ball(x, r * 0.6, z, r, STUFF, 0.95 + k.r() * 0.1); }
    }
  },
  lowtable(k, s) {
    const { L, D, H } = k;
    if (s === 2) k.box(0.05, H - 0.14, 0.02, L - 0.05, H - 0.1, D - 0.02, WOOD, 1, [0, 0, 0.08]); else k.box(0, H - 0.04, 0, L, H, D, WOOD);
    for (const x of [0.03, L - 0.07]) for (const z of [0.03, D - 0.07]) k.box(x, 0, z, x + 0.04, H - 0.04, z + 0.04, DARK);
    for (let i = 0; i < (s === 0 ? 3 : 1); i++) k.box(0.1 + i * 0.15, H, 0.2, 0.31 + i * 0.15, H + 0.01, 0.5, 0xe8e8e4, 1.1, [0, 0.3 * i, 0]);
    if (s >= 1) for (let i = 0; i < 4; i++) { const x = k.r() * L; k.box(x, 0.003, D + 0.1 + k.r() * 0.4, x + 0.21, 0.006, D + 0.4 + k.r() * 0.4, 0xeeeeea, 1.1, [0, k.r() * 3, 0]); }
  },
  pallets(k, s) {
    // Two stacks of wooden pallets, each pallet built as it is: three bottom boards, nine blocks, a deck of slats with
    // gaps between them. Hits split slats; wrecked, the top of the tall stack has slumped askew and a drum is down.
    const { L, D, H } = k, PH = 0.144;
    const pallet = (x0: number, z0: number, x1: number, z1: number, y: number, tone: number, turn: V3, broken: number) => {
      const w = x1 - x0, d = z1 - z0, c = tone, sh = 0.9 + 0.12 * k.r();
      for (const t of [0.05, 0.5, 0.95]) { const z = z0 + d * t; k.box(x0, y, z - 0.05, x1, y + 0.022, z + 0.05, PALLET, sh * 0.85, turn); }
      for (const a of [0.06, 0.5, 0.94]) for (const t of [0.05, 0.5, 0.95]) { const x = x0 + w * a, z = z0 + d * t; k.box(x - 0.05, y + 0.022, z - 0.05, x + 0.05, y + 0.12, z + 0.05, c, sh * 0.8, turn); }
      for (const a of [0.06, 0.5, 0.94]) { const x = x0 + w * a; k.box(x - 0.05, y + 0.12, z0, x + 0.05, y + 0.142, z1, PALLET, sh * 0.9, turn); }
      const slats = 7;
      for (let i = 0; i < slats; i++) {
        const z = z0 + 0.01 + i * (d - 0.02 - 0.1) / (slats - 1);
        if (broken && i % 3 === 1 && k.r() < broken) { k.box(x0 + w * 0.5, y + 0.142, z, x1, y + 0.144, z + 0.1, PALLET, sh, [0, 0, -0.05]); continue; }
        k.box(x0, y + 0.142, z, x1, y + PH, z + 0.1, PALLET, sh * (0.95 + 0.1 * k.r()), turn);
      }
    };
    const stacks = [[0.02, 0.02, L * 0.52, D - 0.02, H], [L * 0.56, 0.02, L - 0.02, D * 0.62, H * 0.62]] as const;
    stacks.forEach(([x0, z0, x1, z1, top], si) => {
      const n = Math.max(2, Math.floor(top / PH));
      for (let i = 0; i < n; i++) {
        const slump = s === 2 && si === 0 && i >= n - 2, j = slump ? 0.12 : 0.01 * (k.r() - 0.5);
        pallet(x0 + Math.abs(j) + 0.02, z0 + Math.abs(j), x1 - Math.abs(j) - 0.02, z1 - Math.abs(j), i * PH - (slump ? 0.03 : 0), PALLET, slump ? [0.03, 0.1, 0.03] : [0, j, 0], s === 0 ? 0 : i === n - 1 ? (s === 1 ? 0.5 : 0.9) : 0);
      }
    });
    const dr = Math.min(0.28, D * 0.18), dh = Math.min(0.9, H);
    if (s === 2) k.cyl(L - dh / 2 - 0.05, D * 0.82, dr, dr - dh / 2, dr + dh / 2, 0x2a5a8a, 1, [0, 0, 1.5708]);   // knocked over
    else k.cyl(L * 0.8, D * 0.82, dr, 0, dh, 0x2a5a8a);
    for (let i = 0; i < (s === 0 ? 0 : s === 1 ? 5 : 12); i++) { const x = k.r() * L, z = D + 0.04 + k.r() * 0.4; k.box(x, 0, z, x + 0.2 + 0.4 * k.r(), 0.022, z + 0.1, PALLET, 0.9 + 0.2 * k.r(), [0, k.r() * 3, 0]); }
  },

  planter(k, s) {
    // A cast-concrete planter: chamfered rim, drip groove, soil, shrubs as clusters of foliage. Damaged: cracks and
    // chipped edges. Wrecked: a corner broken off, soil and lumps spilled, the shrubs knocked flat.
    const { L, D, H } = k, CON = 0x9a9890, wall = Math.min(0.08, D * 0.2);
    k.box(0.02, 0, 0.02, L - 0.02, 0.06, D - 0.02, CON, 0.85);
    k.box(0, 0.06, 0, L, H * 0.84, D, CON);
    k.box(-0.0, H * 0.84, 0, L, H * 0.88, D, 0xaaa8a0);
    k.box(0, H * 0.79, D - 0.01, L, H * 0.8, D + 0.002, 0x6a6862);
    k.box(wall, H * 0.86, wall, L - wall, H * 0.885, D - wall, 0x3a2a1c);
    const n = Math.max(1, Math.round(L / 0.45));
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * L / n, flat = s === 2 && i % 2 === 0, rr = Math.min(0.16, (D - 2 * wall) / 2);
      for (let j = 0; j < 6; j++) {
        const r = rr * (0.45 + k.r() * 0.35), dx = (k.r() - 0.5) * 0.18, dz = (k.r() - 0.5) * Math.max(0, D - 2 * wall - 2 * r), y = H * 0.885 + (flat ? r * 0.4 : r * (0.6 + j * 0.12));
        if (y + r > H + 0.02) continue;
        k.ball(x + dx, y, D / 2 + dz, r, [0x3d6a2e, 0x4a7a34, 0x2f5a26][j % 3], 0.85 + k.r() * 0.3);
      }
    }
    if (s >= 1) {
      for (let i = 0; i < (s === 1 ? 3 : 6); i++) { const x = 0.1 + k.r() * (L - 0.2), y = 0.1 + k.r() * (H * 0.6); for (let j = 0; j < 4; j++) k.box(x + j * 0.04, y + j * 0.05, D - 0.002, x + j * 0.04 + 0.006, y + j * 0.05 + 0.07, D + 0.003, 0x3a3a36, 1, [0, 0, (k.r() - 0.5) * 0.8]); }
      for (let i = 0; i < (s === 1 ? 3 : 6); i++) k.box(k.r() * (L - 0.08), H * 0.84, D - 0.03, k.r() * (L - 0.08) + 0.08, H * 0.88, D + 0.002, 0x6a6862);
    }
    if (s === 2) {
      k.box(L - 0.3, H * 0.4, D - 0.25, L + 0.002, H * 0.89, D + 0.002, 0x3a2a1c);
      for (let i = 0; i < 12; i++) { const x = L - 0.6 + k.r() * 0.6, z = D + 0.03 + k.r() * 0.45, a = 0.05 + k.r() * 0.09; k.box(x, 0, z, x + a, a * 0.7, z + a, i % 3 ? 0x3a2a1c : CON, 1, [k.r(), k.r() * 3, k.r()]); }
    }
  },

  // Families made of models (render/setpiecemodels.ts): only what the models cannot show is drawn here.
  shelving(k, s) {
    // Damaged: stock knocked off the shelves. Wrecked (the rack leans on a buckled upright): its contents across the
    // floor, cartons burst, papers everywhere.
    const { L, D } = k;
    k.none();
    if (s === 0) return;
    for (let i = 0; i < (s === 1 ? 2 : 6); i++) { const x = 0.05 + k.r() * (L - 0.4), z = 0.05 + k.r() * (D - 0.3); k.box(x, 0, z, x + 0.3, 0.2 + k.r() * 0.08, z + 0.24, CARD, 0.9 + k.r() * 0.2, [k.r() * 0.3, k.r() * 2, s === 2 ? (k.r() - 0.5) * 1.4 : 0]); }
    for (let i = 0; i < (s === 1 ? 5 : 14); i++) { const x = k.r() * L, z = D + 0.02 + k.r() * 0.6; k.box(x, 0.002, z, x + 0.21, 0.005, z + 0.3, i % 3 ? 0xeeeeea : CARD, 1.05, [0, k.r() * 3, 0]); }
  },
  crates(k, s, p) {
    const { L, D } = k;
    k.none();
    if (s === 0) return;
    const sc = p.name === 'equipment crate' ? 1 : crateScale(L, D), h = 0.464 * sc, front = p.name === 'equipment crate' ? D - 0.02 : D / 2 + 0.583 * sc;
    // Rounds through the boards: dark holes ringed with pale splinters; splinters round the foot.
    for (let i = 0; i < (s === 1 ? 5 : 9); i++) { const x = 0.15 + k.r() * (L - 0.3), y = 0.08 + k.r() * (h * (s === 1 ? 2 : 1) - 0.16); k.box(x - 0.03, y - 0.03, front - 0.004, x + 0.03, y + 0.03, front + 0.001, 0xd8b88a, 1.1, [0, 0, k.r()]); k.box(x - 0.014, y - 0.014, front + 0.001, x + 0.014, y + 0.014, front + 0.004, 0x0c0906); }
    for (let i = 0; i < (s === 1 ? 8 : 18); i++) { const x = k.r() * L, z = D + 0.02 + k.r() * 0.5; k.box(x, 0, z, x + 0.06 + k.r() * 0.22, 0.012 + k.r() * 0.02, z + 0.025, i % 2 ? 0xc49a68 : WOOD, 1, [0, k.r() * 3, 0]); }
    if (s === 2) {
      // The top crate smashed open: its boards in a heap on the crates below, its contents spilled over them and
      // onto the floor; a bottom crate's side stove in.
      for (let i = 0; i < 10; i++) { const x = 0.12 + k.r() * (L - 0.85), z = 0.2 + k.r() * (D - 0.45); k.box(x, h + 0.01 + i * 0.022, z, x + 0.5 + k.r() * 0.1, h + 0.03 + i * 0.022, z + 0.1, i % 3 ? 0xa47a4c : 0x8a6440, 1, [(k.r() - 0.5) * 0.3, (k.r() - 0.5) * 0.7, (k.r() - 0.5) * 0.3]); }
      for (let i = 0; i < 9; i++) { const x = 0.15 + k.r() * (L - 0.3), z = 0.15 + k.r() * (D - 0.3); k.cyl(x, z, 0.04, h + 0.02, h + 0.14, [0xb0b4b8, 0xc03020, 0x2a6ab0][i % 3], 1, i % 2 ? [Math.PI / 2, 0, k.r()] : [0, 0, 0], 10); }
      for (let i = 0; i < 12; i++) { const x = k.r() * L, z = D + 0.05 + k.r() * 0.5, r = 0.03 + k.r() * 0.04; k.ball(x, r * 0.5, z, r, 0xd8c070, 0.9 + k.r() * 0.2); }
      for (let i = 0; i < 5; i++) { const x = k.r() * L, z = D + 0.06 + k.r() * 0.45; k.cyl(x, z, 0.04, 0.04 - 0.06, 0.04 + 0.06, [0xb0b4b8, 0xc03020, 0x2a6ab0][i % 3], 1, [Math.PI / 2, 0, k.r() * 3], 10); }
      const x = L * 0.25; k.box(x, 0.08, front - 0.006, x + 0.3, 0.36, front + 0.002, 0x0c0906);
      for (let i = 0; i < 4; i++) k.box(x - 0.02 + i * 0.08, 0.12, front - 0.05, x + 0.04 + i * 0.08, 0.32, front - 0.03, 0xc49a68, 1, [0.25, 0, (k.r() - 0.5) * 0.4]);
    }
  },
  drums(k, s) {
    // Damaged: holed drums leaking in thin streams into a spreading pool. Wrecked: one crushed flat and split,
    // another on its side, oil everywhere.
    const { L, D } = k, { s: sc, r, us, ws } = drumSpots(L, D), OIL = 0x0b0a08, BLUE = 0x2457a8;
    k.none();
    if (s === 0) return;
    const leak = (x: number, y: number, z: number) => { k.box(x - 0.012, y - 0.012, z, x + 0.012, y + 0.012, z + 0.004, 0x050505); k.box(x - 0.005, 0.004, z + 0.002, x + 0.005, y, z + 0.01, OIL, 1, [0.04, 0, 0]); };
    leak(us[0] + 0.05, 0.42 * sc, ws[0] + r + 0.002);
    if (s === 1) { leak(us[1] - 0.08, 0.6 * sc, ws[1] + r + 0.002); leak(us[0] - 0.02, 0.3 * sc, ws[1] + r + 0.002); }
    k.box(L * 0.15, 0.002, D - 0.25, L * 0.15 + (s === 1 ? 0.6 : 0.95), 0.004, D + (s === 1 ? 0.3 : 0.65), OIL, 1, [0, 0.3, 0]);
    if (s === 2) {
      // The crushed drum: flattened to half its height, bulging, its lid bent up, split down one side.
      const x = us[1], z = ws[0], hgt = 0.885 * sc * 0.5;
      k.cyl(x, z, r * 1.06, 0, hgt, BLUE, 0.95, [0, 0, 0], 16);
      for (const y of [hgt * 0.3, hgt * 0.7]) k.cyl(x, z, r * 1.12, y - 0.02, y + 0.02, BLUE, 0.8, [0, 0, 0], 16);
      k.box(x - r * 0.9, hgt - 0.01, z - r * 0.9, x + r * 0.9, hgt + 0.01, z + r * 0.9, 0x1d4a90, 1, [0.35, 0.4, 0.1]);
      k.box(x - 0.015, 0.05, z + r * 1.05, x + 0.015, hgt - 0.02, z + r * 1.1, OIL);
      k.box(L * 0.5, 0.002, D - 0.1, L * 0.5 + 0.55, 0.004, D + 0.4, OIL, 1, [0, -0.5, 0]);
    }
  },
  lowwall(k, s) {
    // Spalled concrete at the barriers' feet; wrecked, one barrier shunted out of line and the next one's end
    // broken off, its rebar showing, the broken end in lumps on the ground.
    const { L, D } = k, n = Math.ceil(L / 1.6), step = L / n;
    k.none();
    for (let i = 0; i < (s === 0 ? 0 : s === 1 ? 10 : 22); i++) { const x = k.r() * L, z = D + 0.02 + k.r() * 0.35, a = 0.03 + k.r() * 0.08; k.box(x, 0, z, x + a, a * 0.7, z + a, 0x9a978e, 0.9 + k.r() * 0.2, [k.r(), k.r() * 3, k.r()]); }
    if (s === 2) {
      const u = step * (n - 1) + 0.04;
      for (let i = 0; i < 6; i++) k.box(u, 0.25 + i * 0.1, D / 2 - 0.12 + (i % 3) * 0.1, u + 0.1 + k.r() * 0.12, 0.262 + i * 0.1, D / 2 - 0.108 + (i % 3) * 0.1, 0x5a3a24, 1, [0, (k.r() - 0.5) * 0.4, (k.r() - 0.5) * 0.5]);
      for (let i = 0; i < 9; i++) { const x = u - 0.1 + k.r() * 0.5, z = D + 0.02 + k.r() * 0.3, a = 0.07 + k.r() * 0.08; k.box(x, 0, z, x + a, a * 0.8, z + a, 0x9a978e, 0.85 + k.r() * 0.2, [k.r(), k.r() * 3, k.r()]); }
    }
  },
  materials(k, s) {
    const { D } = k;
    // The pallet under the cement bags; a burst bag's powder heaped below it once hit.
    k.box(0.02, 0, 0.02, 0.98, 0.12, D - 0.02, PALLET);
    for (const z of [0.02, D / 2 - 0.05, D - 0.12]) k.box(0.02, 0.0, z, 0.98, 0.1, z + 0.1, PALLET, 0.8);
    if (s >= 1) k.box(0.1, 0, D + 0.02, s === 1 ? 0.5 : 0.95, s === 1 ? 0.04 : 0.07, D + (s === 1 ? 0.25 : 0.45), 0xb8b4a8, 1.1, [0, 0.2, 0]);
    if (s === 2) for (let i = 0; i < 8; i++) { const x = k.r(), z = D + 0.05 + k.r() * 0.5; k.box(x, 0.07, z, x + 0.1, 0.075, z + 0.08, 0xc8b890, 1, [0, k.r() * 3, 0]); }
  },
  skip(k, s) {
    // A builder's skip: sloping ends, deep ribs, a box-section rim and lifting lugs, weathered yellow with a band of
    // dirt, heaped with rubble, timber and bags. Damaged: rounds through the side, ringed with bare steel. Wrecked: a
    // side panel stove in, the rim bent, the heap spilled down the side.
    const { L, D, H } = k, hue = 0xa8862a, slope = 0.42, y0 = 0.14, T = H - 0.32;
    for (const z of [0.15, D - 0.27]) k.box(0.6, 0, z, L - 0.6, y0, z + 0.12, 0x2a2826);
    k.prism([[slope, y0], [L - slope, y0], [L - 0.04, T - 0.02], [0.04, T - 0.02]], 0.04, D - 0.04, hue);
    k.prism([[slope + 0.06, y0 + 0.06], [L - slope - 0.06, y0 + 0.06], [L - 0.1, T - 0.015], [0.1, T - 0.015]], 0.1, D - 0.1, 0x2b2924, 1, true);
    for (const z of [0, D - 0.08]) k.box(0.02, T - 0.08, z, L - 0.02, T, z + 0.08, hue, 0.9);
    for (const x of [0.02, L - 0.1]) k.box(x, T - 0.08, 0, x + 0.08, T, D, hue, 0.9);
    for (let i = 1; i < 7; i++) { const x = slope + i * (L - 2 * slope) / 7; for (const z of [0, D - 0.06]) k.box(x - 0.05, y0 + 0.04, z, x + 0.05, T - 0.08, z + 0.06, hue, 0.78); }
    for (const z of [0.04, D - 0.045]) k.box(slope, y0, z - 0.002, L - slope, y0 + 0.28, z + 0.007, 0x4a3a1c, 0.9);
    for (const [x, sx] of [[0.1, -1], [L - 0.1, 1]] as const) k.cyl(x + sx * 0.0, D / 2, 0.06, T * 0.62 - 0.05, T * 0.62 + 0.05, 0x3a3a36, 1, [0, 0, Math.PI / 2], 10);
    for (let i = 0; i < 9; i++) { const x = 0.5 + k.r() * (L - 1); k.box(x, T * (0.35 + k.r() * 0.3), D - 0.041, x + 0.02 + k.r() * 0.03, T - 0.08, D - 0.038, 0x8a6a2a, 0.9); }
    // The heap: broken timber, plasterboard, rubble and bags, standing above the rim.
    const heap = (n: number, spill: number) => {
      for (let i = 0; i < n; i++) {
        const x = 0.35 + k.r() * (L - 1.3), z = 0.3 + k.r() * (D - 0.8), y = T - 0.05 + k.r() * 0.12, kind = i % 4;
        if (kind === 0) k.box(x, y, z, x + 0.5 + k.r() * 0.3, y + 0.04, z + 0.1, 0x8a6a46, 0.9 + k.r() * 0.2, [(k.r() - 0.5) * 0.3, (k.r() - 0.5) * 0.5, (k.r() - 0.5) * 0.5]);
        else if (kind === 1) k.box(x, y, z, x + 0.45, y + 0.015, z + 0.35, 0xd8d4c8, 1, [(k.r() - 0.5) * 0.5, (k.r() - 0.5) * 0.5, (k.r() - 0.5) * 0.5]);
        else if (kind === 2) k.ball(x + 0.1, y + 0.08, z + 0.1, 0.1 + k.r() * 0.06, 0x18191a, 0.9 + k.r() * 0.3);
        else k.box(x, y, z, x + 0.12, y + 0.08, z + 0.12, 0x8a8478, 0.9 + k.r() * 0.2, [k.r(), k.r() * 3, k.r()]);
      }
      for (let i = 0; i < spill; i++) { const x = 0.3 + k.r() * (L - 0.6), z = D + 0.04 + k.r() * 0.5, a = 0.05 + k.r() * 0.09; k.box(x, 0, z, x + a, a * 0.7, z + a, [0x8a8478, 0x8a6a46, 0xd8d4c8][i % 3], 1, [k.r(), k.r() * 3, k.r()]); }
    };
    heap(s === 2 ? 10 : 18, s === 0 ? 0 : s === 1 ? 4 : 14);
    for (let i = 0; i < (s === 0 ? 0 : s === 1 ? 8 : 18); i++) k.pock(slope + 0.1 + k.r() * (L - 2 * slope - 0.2), y0 + 0.2 + k.r() * (T - y0 - 0.4), D - 0.04);
    if (s === 2) {
      k.box(L * 0.3, T * 0.25, D - 0.16, L * 0.52, T * 0.75, D - 0.13, 0x6a5a28, 0.7, [0.14, 0, 0.05]);
      k.box(L * 0.3, T * 0.25, D - 0.13, L * 0.52, T * 0.27, D - 0.04, 0x1a1a18);
      k.box(L * 0.55, T - 0.08, D - 0.2, L * 0.85, T - 0.01, D - 0.12, hue, 0.8, [0.3, 0, 0]);
    }
  },

  binstore(k, s) {
    const { L, D, H } = k;
    for (let i = 0; i <= Math.round(L / 0.12); i++) { const x = Math.min(L - 0.08, i * 0.12); if (s === 2 && i % 5 === 2) continue; k.box(x, 0, D - 0.04, x + 0.08, H, D, 0x7a6a50, 0.9 + (i % 3) * 0.05); }
    for (const x of [0, L - 0.06]) k.box(x, 0, 0, x + 0.06, H, D, 0x6a5a40);
    k.box(0, H - 0.05, 0, L, H, D, 0x4a4a48);
    if (s >= 1) for (let i = 0; i < 6; i++) { const x = k.r() * L; k.box(x, 0, D + 0.05 + k.r() * 0.4, x + 0.15, 0.08, D + 0.15 + k.r() * 0.4, [0xe8e8e0, 0x404040, 0x8a6a40][i % 3], 1, [0, k.r() * 3, 0]); }
  },
  trailer(k, s) {
    // A flatbed trailer: chassis rails and an A-frame drawbar, twin-axle wheels under mudguards, a jockey wheel, and
    // the load under a tarp that drapes from a ridge over its sides, roped down with straps over the top. Damaged:
    // tears in the tarp with the crates showing. Wrecked: flaps hanging, the tarp slumped at one end, a tyre flat.
    const { L, D, H } = k, bed = 0.62, bodyL = L - 0.9, TARP = 0x3a5470;
    for (const z of [0.25, D - 0.35]) k.box(0.1, 0.42, z, bodyL, 0.54, z + 0.1, 0x2a2c2e);
    k.box(0.05, 0.54, 0.05, bodyL + 0.05, bed, D - 0.05, 0x4a4c4a);
    for (const sz of [-1, 1]) k.box(bodyL, 0.45, D / 2 - 0.04, L - 0.12, 0.52, D / 2 + 0.04, 0x2a2c2e, 1, [0, sz * 0.32, 0]);
    k.box(L - 0.18, 0.4, D / 2 - 0.07, L - 0.02, 0.52, D / 2 + 0.07, 0x2a2c2e);
    k.box(L - 0.5, 0.08, D / 2 - 0.03, L - 0.44, 0.45, D / 2 + 0.03, 0x555555); k.cyl(L - 0.47, D / 2, 0.08, -0.03, 0.03, 0x141414, 1, [Math.PI / 2, 0, 0], 12);
    for (const x of [bodyL * 0.42, bodyL * 0.58]) for (const z of [0.03, D - 0.21]) {
      const flat = s === 2 && x === bodyL * 0.42 && z === 0.03, r = flat ? 0.24 : 0.3;
      k.cyl(x, z + 0.09, r, r - 0.09, r + 0.09, 0x141414, 1, [Math.PI / 2, 0, 0], 18);
      k.cyl(x, z + 0.09, 0.14, r - 0.095, r + 0.095, 0x8a8c8a, 1, [Math.PI / 2, 0, 0], 12);
    }
    for (const z of [0, D - 0.24]) k.box(bodyL * 0.3, 0.62, z, bodyL * 0.7, 0.66, z + 0.24, 0x2a2c2e);
    // The tarp: a ridged profile over the load, extruded along the bed; slumped at the back end when wrecked.
    const prof = (top: number): [number, number][] => [[0.1, bed], [D - 0.1, bed], [D - 0.12, top - 0.35], [D / 2 + 0.25, top], [D / 2 - 0.25, top], [0.12, top - 0.35]];
    if (s === 2) { k.prismX(prof(H - 0.02), 0.15, bodyL * 0.6, TARP); k.prismX(prof(H - 0.45), bodyL * 0.6, bodyL - 0.1, TARP, 0.9); }
    else k.prismX(prof(H - 0.02), 0.15, bodyL - 0.1, TARP);
    for (let i = 0; i < 6; i++) { const x = 0.15 + (i + 0.5) * (bodyL - 0.25) / 6; k.prismX(prof((s === 2 && x > bodyL * 0.6 ? H - 0.45 : H - 0.02) + 0.012).map(([z, y]) => [z + (z < D / 2 ? -0.012 : 0.012), y] as [number, number]), x - 0.025, x + 0.025, 0xb07a1a, 0.9); }
    for (let i = 0; i < 5; i++) { const x = 0.3 + (i + 0.5) * (bodyL - 0.6) / 5; k.box(x, bed + 0.05, D - 0.105, x + 0.012, H - 0.4, D - 0.1, 0x2c4258, 1); }
    // Damage: tears in the tarp's side, crates behind; wrecked, flaps hanging loose.
    for (let i = 0; i < (s === 0 ? 0 : s === 1 ? 4 : 9); i++) {
      const x = 0.4 + k.r() * (bodyL - 0.9), y = bed + 0.12 + k.r() * (H - bed - 0.65), w = 0.14 + k.r() * 0.18;
      k.box(x, y, D - 0.105, x + w, y + w * 0.7, D - 0.095, 0x0c0c0c, 1, [0, 0, k.r() - 0.5]);
      k.box(x + 0.02, y + 0.02, D - 0.103, x + w * 0.7, y + w * 0.45, D - 0.097, WOOD, 0.9, [0, 0, k.r() - 0.5]);
      if (s === 2) k.box(x, Math.max(bed, y - w), D - 0.095, x + w * 0.8, y, D - 0.085, TARP, 0.85, [0.12, 0, k.r() * 0.4]);
    }
  },

  generator(k, s) {
    const { L, D, H } = k;
    k.box(0, 0, 0, L, 0.2, D, 0x8a8880);
    k.box(0.1, 0.2, 0.1, L - 0.1, H - 0.1, D - 0.1, 0x3a5a3a);
    for (let i = 0; i < 8; i++) k.box(0.2 + i * (L - 0.4) / 8, 0.6, D - 0.1, 0.2 + i * (L - 0.4) / 8 + 0.08, H - 0.4, D - 0.095, 0x1e2e1e);
    k.cyl(L - 0.35, D / 2, 0.06, H - 0.1, H, 0x333333);
    k.box(0.25, 0.5, D - 0.1, 0.55, 0.75, D - 0.09, 0xd0d0c8, 1.2);
    if (s >= 1) for (let i = 0; i < (s === 1 ? 5 : 12); i++) k.pock(0.25 + k.r() * (L - 0.5), 0.35 + k.r() * (H - 0.7), D - 0.1);
    if (s === 2) k.box(0.2, H - 0.12, 0.2, L * 0.55, H - 0.08, D - 0.2, 0x3a5a3a, 0.8, [0, 0, -0.15]);
  },
};
/** Debris colour per family when it changes state. */
const DEBRIS: Record<string, V3> = { cabinet: [0.45, 0.48, 0.46], vending: [0.6, 0.2, 0.2], display: [0.75, 0.85, 0.9], filing: [0.55, 0.56, 0.52], trolley: [0.6, 0.5, 0.4], shelving: [0.6, 0.5, 0.4], sofa: [0.85, 0.82, 0.74], lowtable: [0.5, 0.38, 0.25], crates: [0.62, 0.48, 0.3], pallets: [0.65, 0.52, 0.38], materials: [0.7, 0.68, 0.62], drums: [0.3, 0.35, 0.45], planter: [0.55, 0.54, 0.5], lowwall: [0.55, 0.54, 0.5], skip: [0.6, 0.5, 0.2], binstore: [0.5, 0.42, 0.3], trailer: [0.3, 0.35, 0.4], generator: [0.3, 0.4, 0.3] };
/** Hits to reach the damaged and wrecked states (large outdoor steel takes more). */
const THRESH = (f: string) => (['skip', 'binstore', 'trailer', 'generator', 'lowwall', 'planter'].includes(f) ? [8, 22] : [4, 11]);

/** Builds one state of one piece in world space. */
export function build(p: SetPieceDef, state: number, seed: number): THREE.BufferGeometry {
  const f = frame(p), k = new Kit(f.L, f.D, p.y1, seed);
  k.surf = FAMILY_SURF[p.family] ?? SURF.plain;
  BUILD[p.family](k, state, p);
  const g = k.done(), m = new THREE.Matrix4();
  // Local x along the piece, z out of its back: rotate and place so the back lies on the box side opposite its front.
  if (f.alongX) m.makeBasis(new THREE.Vector3(f.front, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, f.front)).setPosition(f.front > 0 ? p.x0 : p.x1, 0, f.front > 0 ? p.z0 : p.z1);
  else m.makeBasis(new THREE.Vector3(0, 0, -f.front), new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.front, 0, 0)).setPosition(f.front > 0 ? p.x0 : p.x1, 0, f.front > 0 ? p.z1 : p.z0);
  g.applyMatrix4(m);
  return g;
}

/** Vertex colours lit by the room's probe, shaded by facing (light from above, a little from one side) and darkened
 * towards the floor, with procedural surface detail by kind: orange-peel paint, wear and scratches on steel, a weave
 * on fabric, grain on wood, mottling on card and concrete. Geometry is in world space (instances are not moved). */
function surfaceMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float surf;\nattribute vec4 fe;\nvarying float vSurf;\nvarying vec3 vWp;\nvarying vec3 vNw;\nvarying vec4 vFe;\nvarying vec3 vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf; vWp = position; vNw = normal; vFe = fe;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvLit = vColor.rgb / max(color.rgb, vec3(0.002));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSurf;
varying vec3 vWp;
varying vec3 vNw;
varying vec4 vFe;
varying vec3 vLit;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = normalize(vNw), p = vWp;
  vec2 uv = abs(n.y) > 0.5 ? p.xz : abs(n.x) > 0.5 ? p.zy : p.xy;
  float lit = 0.72 + 0.28 * n.y + 0.1 * n.x - 0.05 * n.z;
  lit *= mix(0.7, 1.0, smoothstep(0.0, 0.45, p.y));
  float d = 1.0;
  if (vSurf > 0.5 && vSurf < 1.5) {
    d = 1.0 + 0.05 * (vn(p * 45.0) - 0.5) + 0.07 * (vn(p * 2.5) - 0.5);
    d += 0.12 * smoothstep(0.86, 0.95, vn(vec3(uv.x * 3.0, uv.y * 3.0, 0.0) + vec3(0.0, 0.0, uv.x * 70.0 + uv.y * 25.0)));
    d *= mix(0.82, 1.0, smoothstep(0.0, 0.5, p.y + 0.15 * vn(p * 6.0)));
    // Paint worn back to bright steel along edges and corners.
    float edge = min(min(vFe.x, vFe.z - vFe.x), min(vFe.y, vFe.w - vFe.y));
    float wear = (1.0 - smoothstep(0.003, 0.012 + 0.014 * vn(p * 30.0), edge)) * smoothstep(0.35, 0.6, vn(p * 9.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.51, 0.52) * vLit, wear * 0.85);
  } else if (vSurf < 2.5 && vSurf > 0.5) {
    float w = sin(uv.x * 900.0) * sin(uv.y * 900.0);
    d = 0.95 + 0.06 * w + 0.12 * (vn(p * 5.0) - 0.5);
  } else if (vSurf < 3.5 && vSurf > 0.5) {
    float g = vn(vec3(uv.x * 1.5, uv.y * 1.5, 0.0) + vec3(0.0, 0.0, (uv.x + uv.y) * 0.5)) * 6.0;
    d = 0.9 + 0.08 * sin((uv.x * 0.3 + uv.y) * 55.0 + g) + 0.1 * (vn(p * 9.0) - 0.5);
  } else if (vSurf > 0.5) {
    d = 1.0 + (vSurf < 4.5 ? 0.1 : 0.16) * (vn(p * 14.0) - 0.5) + 0.06 * (vn(p * 60.0) - 0.5);
  }
  diffuseColor.rgb *= lit * d;
  // A highlight that moves with the eye: semi-gloss on steel, a soft sheen on fabric, faint on wood; light from above.
  if (vSurf > 0.5 && vSurf < 3.5) {
    vec3 v = normalize(cameraPosition - vWp), hv = normalize(normalize(vec3(0.25, 1.0, 0.35)) + v);
    float gloss = vSurf < 1.5 ? 48.0 : vSurf < 2.5 ? 6.0 : 18.0, k = vSurf < 1.5 ? 0.38 : vSurf < 2.5 ? 0.06 : 0.08;
    float spec = pow(max(dot(n, hv), 0.0), gloss) * k * (0.6 + 0.8 * vn(p * 4.0));
    diffuseColor.rgb += spec * vLit;
  }
}`);
  };
  return mat;
}

export class SetPieces {
  readonly mesh: THREE.BatchedMesh;
  private ids: number[][] = [];      // geometry id per piece and state
  private inst: number[] = [];       // instance id per piece
  private hits: number[] = [];
  private state: number[] = [];
  private key = new Map<string, number>();
  private centre: V3[] = [];
  /** Called when a piece changes state (the art layer swaps the piece's models). */
  onState: (piece: number, state: number) => void = () => {};
  constructor(private fx: Effects, light: (x: number, z: number) => V3) {
    const geos = SET_PIECES.map((p, i) => [0, 1, 2].map(s => build(p, s, 1000 + i * 7)));
    let verts = 0, idx = 0;
    for (const set of geos) for (const g of set) { verts += g.attributes.position.count; idx += g.index ? g.index.count : 0; }
    const mat = surfaceMaterial();
    this.mesh = new THREE.BatchedMesh(SET_PIECES.length, verts, Math.max(1, idx), mat);
    this.mesh.perObjectFrustumCulled = true;
    SET_PIECES.forEach((p, i) => {
      this.ids[i] = geos[i].map(g => { const id = this.mesh.addGeometry(g); g.dispose(); return id; });
      this.inst[i] = this.mesh.addInstance(this.ids[i][0]);
      const l = light((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
      this.mesh.setColorAt(this.inst[i], new THREE.Color(l[0], l[1], l[2]));
      this.hits[i] = 0; this.state[i] = 0;
      this.key.set(`${p.x0},${p.z0},${p.x1},${p.z1}`, i);
      this.centre[i] = [(p.x0 + p.x1) / 2, p.y1 / 2, (p.z0 + p.z1) / 2];
    });
  }
  /** The piece a collision box belongs to, or -1. */
  indexOf(b: { x0: number; z0: number; x1: number; z1: number } | null) { return b ? this.key.get(`${b.x0},${b.z0},${b.x1},${b.z1}`) ?? -1 : -1; }
  private take(i: number, n: number) {
    this.hits[i] += n;
    const t = THRESH(SET_PIECES[i].family), s = this.hits[i] >= t[1] ? 2 : this.hits[i] >= t[0] ? 1 : 0;
    if (s === this.state[i]) return;
    this.state[i] = s;
    this.mesh.setGeometryIdAt(this.inst[i], this.ids[i][s]);
    this.onState(i, s);
    const [x, y, z] = this.centre[i], col = DEBRIS[SET_PIECES[i].family] ?? [0.5, 0.5, 0.5];
    for (let k = 0; k < (s === 2 ? 14 : 7); k++) this.fx.debris(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.03 + Math.random() * 0.05, col[0], col[1], col[2], true, 0.6);
    for (let k = 0; k < 3; k++) this.fx.dust(x, y, z, (Math.random() - 0.5), 0.4 + Math.random() * 0.4, (Math.random() - 0.5), 0.5, 1.2, col[0], col[1], col[2], 0.4, 1.6);
  }
  /** A round stopped by piece `i`. */
  hit(i: number) { if (i >= 0) this.take(i, 1); }
  /** A blast: pieces within 4 m take hits by distance. */
  blast(x: number, y: number, z: number, power: number) {
    this.centre.forEach(([cx, cy, cz], i) => { const d = Math.hypot(cx - x, cy - y, cz - z); if (d < 4) this.take(i, Math.ceil((4 - d) * 3 * power)); });
  }
  /** Every piece whole again (a new round). */
  reset() { SET_PIECES.forEach((_, i) => { this.hits[i] = 0; if (this.state[i]) { this.state[i] = 0; this.mesh.setGeometryIdAt(this.inst[i], this.ids[i][0]); this.onState(i, 0); } }); }
  /** Sets piece `i` to state `s` without debris (evidence renders). */
  force(i: number, s: number) { this.state[i] = s; this.mesh.setGeometryIdAt(this.inst[i], this.ids[i][s]); this.onState(i, s); }
  /** A standing point `dist` metres out from piece `i`'s front, and the yaw that faces it (evidence renders). */
  static view(i: number, dist: number): [number, number, number] {
    const p = SET_PIECES[i], f = frame(p), n = f.alongX ? [0, f.front] : [f.front, 0];
    const x = (p.x0 + p.x1) / 2 + n[0] * (f.D / 2 + dist), z = (p.z0 + p.z1) / 2 + n[1] * (f.D / 2 + dist);
    return [x, z, Math.atan2(n[0], n[1])];
  }
  /** States by piece (for tests and evidence). */
  states() { return [...this.state]; }
  dispose() { this.mesh.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
