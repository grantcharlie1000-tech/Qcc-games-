/** Femboy Frosthop renderer. Presentation only: it reads the run and never advances it. Static course geometry is
 * merged per zone (one draw call each) and hidden when far away; repeated props are instanced; moving parts and
 * hazards are individual meshes shown only near the player. No shadow maps: a blob shadow marks the landing spot. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { notifyGlassFrame, registerGlassFrameSource } from '../../ui/glass-frame-source';
import { CRUMBLE, PLAYER } from './config';
import { createAvatar } from './avatar';
import { blinkState, motionFraction, pendulumAngle, snowballAt, solidOffset, sweeperAngle } from './sim';
import { PAL, ZONES, zoneOf } from './stages';
import type { Outfit } from './progress';
import type { Course, Decor, Run, Solid } from './types';

export interface View {
  x: number; y: number; z: number; facing: number; speed: number; vy: number; grounded: boolean; squash: number;
  /** Interpolated motion time for moving parts and hazards. */
  mt: number;
  run: Run;
  /** Checkpoint used for culling and zone colour. */
  stage: number;
  reached: number;
  stars: ReadonlySet<string>;
  yaw: number; pitch: number;
  dt: number; reduced: boolean; dead: boolean;
}

export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; width: number; height: number; ratio: number }

export interface FrostScene {
  resize(w: number, h: number): void;
  render(v: View): void;
  /** Redraw the last view (glass repaint and resizes); never simulates. */
  repaint(): void;
  setOutfit(o: Outfit, bow: boolean): void;
  setQuality(low: boolean): void;
  burst(kind: 'star' | 'checkpoint' | 'finish', x: number, y: number, z: number): void;
  snapCamera(): void;
  readonly stats: SceneStats;
  dispose(): void;
}

// ---------- geometry helpers ----------

type Geo = THREE.BufferGeometry;
const tmpColor = new THREE.Color();
function colored(g: Geo, color: number, shade = true): Geo {
  const q = g.index ? g.toNonIndexed() : g;
  if (q !== g) g.dispose();
  q.deleteAttribute('uv');
  const n = q.attributes.position.count, arr = new Float32Array(n * 3), normal = q.attributes.normal;
  const base = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    // Bake a gentle top-light into the vertex colour so flat pastel faces stay readable.
    const ny = normal ? normal.getY(i) : 0;
    const k = shade ? (ny > 0.5 ? 1.0 : ny < -0.5 ? 0.62 : 0.84) : 1;
    tmpColor.copy(base).multiplyScalar(k);
    arr[i * 3] = tmpColor.r; arr[i * 3 + 1] = tmpColor.g; arr[i * 3 + 2] = tmpColor.b;
  }
  q.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return q;
}
function bx(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number): Geo {
  const g = new THREE.BoxGeometry(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return colored(g, color);
}
function prim(g: Geo, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, shade = true): Geo {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return colored(g, color, shade);
}
function mergeAll(parts: Geo[]): Geo {
  if (!parts.length) return new THREE.BufferGeometry();
  const g = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}
const darker = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Visual for one solid in local coordinates: origin at the centre of its top face. Tops match colliders exactly. */
function solidParts(s: Solid, under = true): Geo[] {
  const w = s.hx, d = s.hz, h = s.hy * 2, p: Geo[] = [];
  const cliff = (color: number) => under && p.push(prim(new THREE.ConeGeometry(Math.max(w, d) * 1.05, Math.max(2.5, Math.max(w, d) * 1.3), 5), color, 0, -h - Math.max(2.5, Math.max(w, d) * 1.3) / 2, 0, Math.PI, Math.PI / 5));
  switch (s.surface) {
    case 'gift': case 'lift': {
      p.push(bx(-w, w, -h, -0.3, -d, d, s.color));
      p.push(bx(-w - 0.05, w + 0.05, -0.3, 0, -d - 0.05, d + 0.05, s.surface === 'lift' ? PAL.cream : PAL.cream));
      const rw = Math.min(0.5, w * 0.22);
      p.push(bx(-rw, rw, -h - 0.01, 0.006, -d - 0.07, d + 0.07, s.accent), bx(-w - 0.07, w + 0.07, -h - 0.01, 0.006, -rw, rw, s.accent));
      // A bow on the front face (decorative, outside the top).
      p.push(prim(new THREE.ConeGeometry(0.22, 0.4, 4), s.accent, -0.22, -0.32, d + 0.12, 0, 0, Math.PI / 2));
      p.push(prim(new THREE.ConeGeometry(0.22, 0.4, 4), s.accent, 0.22, -0.32, d + 0.12, 0, 0, -Math.PI / 2));
      if (s.surface === 'lift') p.push(bx(-0.2, 0.2, -h - 0.8, -h, -0.2, 0.2, PAL.maroon));
      break;
    }
    case 'candy': {
      const along = d >= w ? 'z' : 'x', len = (along === 'z' ? d : w) * 2, n = Math.max(1, Math.round(len / 0.7));
      for (let i = 0; i < n; i++) {
        const a = -len / 2 + (len * i) / n, b = -len / 2 + (len * (i + 1)) / n, c = i % 2 ? s.accent : s.color;
        p.push(along === 'z' ? bx(-w, w, -h, 0, a, b, c) : bx(a, b, -h, 0, -d, d, c));
      }
      break;
    }
    case 'ribbon': {
      p.push(bx(-w, w, -h, 0, -d, d, s.color));
      p.push(bx(-w - 0.02, -w + 0.18, -h, 0.004, -d, d, s.accent), bx(w - 0.18, w + 0.02, -h, 0.004, -d, d, s.accent));
      break;
    }
    case 'knit': {
      p.push(bx(-w, w, -h, 0, -d, d, s.color));
      p.push(bx(-w + 0.25, -w + 0.45, -0.02, 0.004, -d + 0.2, d - 0.2, s.accent), bx(w - 0.45, w - 0.25, -0.02, 0.004, -d + 0.2, d - 0.2, s.accent));
      p.push(bx(-w - 0.03, w + 0.03, -h, -h + 0.25, -d - 0.03, d + 0.03, darker(s.color, 0.85)));
      break;
    }
    case 'ornament': {
      p.push(bx(-w, w, -h, 0, -d, d, s.color));
      p.push(bx(-w - 0.04, w + 0.04, -h, -h + 0.18, -d - 0.04, d + 0.04, PAL.gold));
      const r = Math.min(1.6, Math.min(w, d) * 0.85);
      if (under) p.push(prim(new THREE.IcosahedronGeometry(r, 1), s.color === PAL.gold ? PAL.lilac : s.color, 0, -h - r * 0.95, 0));
      p.push(prim(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8), PAL.gold, 0, -h - 0.1, 0));
      break;
    }
    case 'roof': {
      if (w < 0.8) { // chimney
        p.push(bx(-w, w, -h, -0.15, -d, d, s.color), bx(-w - 0.06, w + 0.06, -0.15, 0, -d - 0.06, d + 0.06, PAL.snow));
        break;
      }
      p.push(bx(-w - 0.08, w + 0.08, -0.3, 0, -d - 0.08, d + 0.08, PAL.snow));
      p.push(bx(-w + 0.15, w - 0.15, -h - 1.4, -0.3, -d + 0.15, d - 0.15, PAL.wood));
      for (const sx of [-0.45, 0.45]) p.push(bx(sx * w - 0.35, sx * w + 0.35, -h * 0.75 - 0.4, -h * 0.75 + 0.2, d - 0.14, d - 0.1, PAL.gold));
      p.push(bx(-w + 0.15, w - 0.15, -h - 1.6, -h - 1.4, -d + 0.15, d - 0.15, PAL.maroon));
      break;
    }
    case 'ice': {
      p.push(bx(-w, w, -h, 0, -d, d, PAL.iceDeep));
      p.push(bx(-w + 0.06, w - 0.06, -0.12, 0.003, -d + 0.06, d - 0.06, s.color));
      for (let i = -1; i <= 1; i++) p.push(bx(i * w * 0.4 - 0.05, i * w * 0.4 + 0.05, 0, 0.006, -d * 0.7, d * 0.4, PAL.snow));
      cliff(darker(PAL.iceDeep, 0.9));
      break;
    }
    case 'crumble': {
      p.push(bx(-w, w, -h, 0, -d, d, s.color));
      p.push(bx(-w - 0.03, w + 0.03, -h, -h + 0.15, -d - 0.03, d + 0.03, s.accent));
      for (const [cx, cz] of [[-0.5, -0.4], [0.45, 0.3], [-0.2, 0.55], [0.5, -0.55], [0, 0]]) p.push(bx(cx * w - 0.12, cx * w + 0.12, -0.03, 0.006, cz * d - 0.12, cz * d + 0.12, 0x5a3324));
      break;
    }
    case 'spring': {
      p.push(bx(-w, w, -h, -0.2, -d, d, s.color));
      p.push(bx(-w + 0.1, w - 0.1, -0.2, 0, -d + 0.1, d - 0.1, s.accent));
      for (const k of [-0.3, 0.3]) p.push(prim(new THREE.ConeGeometry(0.35, 0.3, 3), PAL.ink, 0, 0.004, k * d * 1.2, -Math.PI / 2, 0, 0, false));
      p.push(prim(new THREE.CylinderGeometry(w * 0.6, w * 0.6, 1.2, 8, 1, true), PAL.gold, 0, -h - 0.6, 0));
      break;
    }
    case 'tray': {
      p.push(bx(-w, w, -h, 0, -d, d, PAL.candy));
      p.push(bx(-w - 0.08, w + 0.08, -0.18, 0.004, -d - 0.08, -d + 0.25, PAL.snow), bx(-w - 0.08, w + 0.08, -0.18, 0.004, d - 0.25, d + 0.08, PAL.snow));
      p.push(bx(-w * 0.6, w * 0.6, -h - 0.5, -h, -d * 0.6, d * 0.6, PAL.maroon));
      break;
    }
    case 'post': break; // drawn by the instanced lamp-post decor at the same size
    case 'spike': {
      // Kill brick: a dark base under a bed of candy-red spikes (shape, not only colour, marks the danger).
      const base = h * 0.45;
      p.push(bx(-w, w, -h, -h + base, -d, d, s.accent));
      p.push(bx(-w - 0.02, w + 0.02, -h + base - 0.08, -h + base, -d - 0.02, d + 0.02, PAL.gold));
      const nx = Math.max(1, Math.round((w * 2) / 0.55)), nz = Math.max(1, Math.round((d * 2) / 0.55));
      const cw = (w * 2) / nx, cd = (d * 2) / nz, r = Math.min(cw, cd) * 0.62, ch = h - base;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        p.push(prim(new THREE.ConeGeometry(r, ch, 4), s.color, -w + cw * (i + 0.5), -ch / 2, -d + cd * (j + 0.5), 0, Math.PI / 4, 0));
      }
      break;
    }
    case 'blink': {
      // Fairy-light panel: a gold pane in a lilac frame with a bulb at each corner.
      p.push(bx(-w, w, -h, 0, -d, d, s.color));
      p.push(bx(-w - 0.05, w + 0.05, -h, -h + 0.14, -d - 0.05, d + 0.05, s.accent));
      p.push(bx(-w - 0.03, -w + 0.16, -0.12, 0.006, -d, d, s.accent), bx(w - 0.16, w + 0.03, -0.12, 0.006, -d, d, s.accent));
      p.push(bx(-w, w, -0.12, 0.006, -d - 0.03, -d + 0.16, s.accent), bx(-w, w, -0.12, 0.006, d - 0.16, d + 0.03, s.accent));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(prim(new THREE.IcosahedronGeometry(0.16, 0), PAL.snow, sx * (w - 0.08), 0.02, sz * (d - 0.08), 0, 0, 0, false));
      break;
    }
    case 'conveyor': {
      p.push(bx(-w, w, -h, -0.05, -d, d, s.color));
      for (const z of [-d + 0.3, d - 0.3]) p.push(prim(new THREE.CylinderGeometry(0.3, 0.3, w * 2, 8), PAL.ink, 0, -0.35, z, 0, 0, Math.PI / 2));
      break;
    }
    default: { // snow, checkpoint
      const body = s.surface === 'checkpoint' ? PAL.lilac : s.color;
      p.push(bx(-w, w, -h, -0.25, -d, d, body));
      p.push(bx(-w - 0.06, w + 0.06, -0.25, 0, -d - 0.06, d + 0.06, PAL.snow));
      if (s.surface === 'checkpoint') p.push(bx(-w - 0.02, w + 0.02, -0.5, -0.25, -d - 0.02, d + 0.02, s.accent));
      cliff(darker(body, 0.82));
    }
  }
  return p;
}

// ---------- textures ----------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

// ---------- scene ----------

const KENNEY: Partial<Record<Decor['kind'], string>> = {
  tree: 'tree-decorated-snow.glb', cane: 'candy-cane-red.glb', gift: 'present-a-cube.glb', sleigh: 'sled.glb', snowman: 'snowman-hat.glb',
};
/** Size of each Kenney model at decor scale 1 (in course units). */
const KENNEY_SCALE: Partial<Record<Decor['kind'], number>> = { tree: 2.2, cane: 2.2, gift: 3.5, sleigh: 2.4, snowman: 2.2 };

export function createScene(canvas: HTMLCanvasElement, course: Course): FrostScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260);
  scene.fog = new THREE.Fog(ZONES[0].fog, 40, 150);
  scene.background = new THREE.Color(ZONES[0].sky);
  scene.add(new THREE.HemisphereLight(0xfdf6ff, 0xb9b3d6, 1.55));
  const sun = new THREE.DirectionalLight(0xfff1e6, 1.25);
  sun.position.set(-0.5, 1, 0.35);
  scene.add(sun);

  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const vc = own(new THREE.MeshLambertMaterial({ vertexColors: true }));

  /** Underside decoration (cliffs, hanging baubles) only where nothing the player uses sits below it. */
  const clearBelow = (s: Solid) => {
    const bottom = s.y - s.hy;
    for (const o of course.solids) {
      if (o === s || o.surface === 'post' || Math.abs(o.stage - s.stage) > 1) continue;
      const m = o.motion, ox0 = o.x - o.hx + Math.min(0, m?.dx ?? 0), ox1 = o.x + o.hx + Math.max(0, m?.dx ?? 0);
      const oz0 = o.z - o.hz + Math.min(0, m?.dz ?? 0), oz1 = o.z + o.hz + Math.max(0, m?.dz ?? 0);
      const otop = o.y + o.hy + Math.max(0, m?.dy ?? 0);
      if (ox1 > s.x - s.hx - 1.5 && ox0 < s.x + s.hx + 1.5 && oz1 > s.z - s.hz - 1.5 && oz0 < s.z + s.hz + 1.5 && otop < bottom + 0.01 && otop > bottom - 10) return false;
    }
    return true;
  };
  // Static course, merged per zone.
  const zoneMeshes: THREE.Mesh[] = [];
  const dynamic = (s: Solid) => !!s.motion || !!s.blink || s.surface === 'crumble' || s.surface === 'conveyor';
  for (let z = 0; z < 6; z++) {
    const parts: Geo[] = [];
    for (const s of course.solids) {
      if (dynamic(s)) continue;
      if (Math.min(5, Math.floor((Math.max(1, s.stage) - 1) / 5)) !== z) continue;
      const top = s.y + s.hy;
      for (const g of solidParts(s, clearBelow(s))) { g.translate(s.x, top, s.z); parts.push(g); }
    }
    for (const pd of course.pendulums) if (zoneOf(pd.stage) === ZONES[z]) {
      parts.push(bx(pd.x - (pd.axis === 'x' ? 0.25 : 0.7), pd.x + (pd.axis === 'x' ? 0.25 : 0.7), pd.y, pd.y + 0.3, pd.z - (pd.axis === 'x' ? 0.7 : 0.25), pd.z + (pd.axis === 'x' ? 0.7 : 0.25), PAL.gold));
    }
    // Snowball chutes and warning signs.
    for (const b of course.snowballs) if (zoneOf(b.stage) === ZONES[z]) {
      parts.push(bx(b.ax - 1.2, b.ax + 0.2, b.ay - 0.65, b.ay + 0.9, b.az - 0.9, b.az + 0.9, PAL.lilacDeep));
      parts.push(prim(new THREE.ConeGeometry(0.4, 0.5, 3), PAL.gold, b.ax - 0.5, b.ay + 1.35, b.az + 0.9, Math.PI / 2, 0, 0));
      parts.push(bx(b.bx + 0.6, b.bx + 1.4, b.ay - 0.65, b.ay - 0.4, b.az - 0.9, b.az + 0.9, PAL.lilacDeep));
    }
    const mesh = new THREE.Mesh(own(mergeAll(parts)), vc);
    mesh.matrixAutoUpdate = false;
    zoneMeshes.push(mesh);
    scene.add(mesh);
  }

  // Moving, crumbling and conveyor solids: one mesh each, local geometry.
  interface Dyn { solid: Solid; mesh: THREE.Object3D; mat?: THREE.MeshLambertMaterial }
  const dyn: Dyn[] = [];
  const stripeTex = own(canvasTexture(64, 64, g => { g.fillStyle = hex(PAL.gold); g.fillRect(0, 0, 64, 64); g.fillStyle = hex(PAL.ink); for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 80, 64); g.lineTo(i + 64, 64); g.closePath(); g.fill(); } }));
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  const arrowTex = own(canvasTexture(64, 64, g => {
    g.fillStyle = hex(PAL.lilac); g.fillRect(0, 0, 64, 64);
    g.fillStyle = hex(PAL.cream); g.beginPath(); g.moveTo(32, 50); g.lineTo(10, 26); g.lineTo(22, 26); g.lineTo(32, 36); g.lineTo(42, 26); g.lineTo(54, 26); g.closePath(); g.fill();
    g.fillStyle = hex(PAL.lilacDeep); g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
  }));
  arrowTex.wrapS = arrowTex.wrapT = THREE.RepeatWrapping;
  const beltMats: { mat: THREE.MeshLambertMaterial; tex: THREE.Texture; solid: Solid }[] = [];
  const crumbleMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true }));
  for (const s of course.solids) {
    if (!dynamic(s)) continue;
    const group = new THREE.Group();
    // Each fairy-light panel fades on its own clock, so it has its own material.
    const mat = s.blink ? own(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, emissive: 0x3a2a08 })) : undefined;
    group.add(new THREE.Mesh(own(mergeAll(solidParts(s))), s.surface === 'crumble' ? crumbleMat : mat ?? vc));
    if (s.surface === 'conveyor') {
      const tex = own(arrowTex.clone());
      tex.repeat.set(Math.round(s.hx * 2 / 1.5), Math.round(s.hz * 2 / 1.5));
      tex.needsUpdate = true;
      const mat = own(new THREE.MeshLambertMaterial({ map: tex }));
      const top = new THREE.Mesh(own(new THREE.PlaneGeometry(s.hx * 2, s.hz * 2)), mat);
      top.rotation.x = -Math.PI / 2; top.position.y = 0.004;
      // Arrows point down the texture (+v); turn them to the belt direction.
      top.rotation.z = Math.atan2(s.belt?.x ?? 0, s.belt?.z ?? 1) + Math.PI;
      group.add(top);
      beltMats.push({ mat, tex, solid: s });
    }
    group.matrixAutoUpdate = true;
    scene.add(group);
    dyn.push({ solid: s, mesh: group, mat });
  }

  // Hazards.
  const hazardMat = own(new THREE.MeshLambertMaterial({ map: stripeTex }));
  const sweepers = course.sweepers.map(w => {
    const g = new THREE.Group();
    g.position.set(w.x, w.y, w.z);
    // All arms in one merged mesh (one draw call), spread evenly round the hub to match the simulation, with
    // gold/ink hazard bands so they read as dangerous without relying on colour alone.
    const parts: Geo[] = [];
    const n = Math.max(2, Math.round(w.length / 0.45));
    for (let a = 0; a < w.arms; a++) {
      const turn = (2 * Math.PI * a) / w.arms;
      const armParts: Geo[] = [];
      for (let i = 0; i < n; i++) armParts.push(bx((w.length * i) / n, (w.length * (i + 1)) / n, -0.25, 0.25, -0.25, 0.25, i % 2 ? PAL.ink : PAL.gold));
      armParts.push(prim(new THREE.ConeGeometry(0.42, 0.6, 3), PAL.candy, w.length + 0.15, 0, 0, 0, 0, -Math.PI / 2));
      for (const ap of armParts) { ap.rotateY(turn); parts.push(ap); }
    }
    g.add(new THREE.Mesh(own(mergeAll(parts)), vc));
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(w.length - 0.12, w.length + 0.12, 48)), own(new THREE.MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.28, depthWrite: false })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(w.x, (w.floor ?? w.y - 0.8) + 0.01, w.z);
    scene.add(g, ring);
    return { w, g, ring };
  });
  const ballMat = own(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const ballGeo = own(new THREE.IcosahedronGeometry(1, 1));
  const bandGeo = own(new THREE.TorusGeometry(1.0, 0.16, 4, 12));
  const snowballs = course.snowballs.map(b => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(ballGeo, ballMat); ball.scale.setScalar(b.radius);
    const band = new THREE.Mesh(bandGeo, hazardMat); band.scale.setScalar(b.radius);
    g.add(ball, band);
    scene.add(g);
    return { b, g };
  });

  // Pendulums: a ribbon cord from a gold anchor down to a striped bauble.
  // One merged mesh per pendulum (one draw call); its gold anchor is part of the zone's static mesh.
  const pendulums = course.pendulums.map(pd => {
    const g = new THREE.Group();
    g.position.set(pd.x, pd.y, pd.z);
    const r = pd.radius, L = pd.length;
    const parts: Geo[] = [
      prim(new THREE.CylinderGeometry(0.06, 0.06, L - r, 6), PAL.maroon, 0, -(L - r) / 2, 0),
      prim(new THREE.IcosahedronGeometry(r, 1), PAL.candy, 0, -L, 0),
      prim(new THREE.TorusGeometry(r * 1.0, r * 0.16, 4, 12), PAL.gold, 0, -L, 0, 0, pd.axis === 'x' ? 0 : Math.PI / 2, 0),
      prim(new THREE.TorusGeometry(r * 0.75, r * 0.13, 4, 12), PAL.ink, 0, -L - r * 0.62, 0, Math.PI / 2, 0, 0),
      prim(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8), PAL.gold, 0, -L + r + 0.08, 0),
    ];
    g.add(new THREE.Mesh(own(mergeAll(parts)), vc));
    scene.add(g);
    return { pd, g };
  });

  // Checkpoint emblems and stars (instanced).
  const emblemTex = (reached: boolean) => canvasTexture(128, 128, g => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = reached ? hex(PAL.mintDeep) : 'rgba(127,196,164,0.35)';
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = hex(reached ? PAL.snow : PAL.mintDeep); g.stroke();
    g.strokeStyle = hex(reached ? PAL.snow : PAL.mintDeep); g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
    if (reached) { g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 86); g.lineTo(94, 44); g.stroke(); }
    else { // star outline
      g.lineWidth = 7; g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 18 : 40, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      g.closePath(); g.stroke();
    }
  });
  const emblemGeo = own(new THREE.PlaneGeometry(3.2, 3.2));
  emblemGeo.rotateX(-Math.PI / 2);
  const emblemOn = own(new THREE.MeshLambertMaterial({ map: own(emblemTex(true)), transparent: true, depthWrite: false }));
  const emblemOff = own(new THREE.MeshLambertMaterial({ map: own(emblemTex(false)), transparent: true, depthWrite: false }));
  const emblemsOn = new THREE.InstancedMesh(emblemGeo, emblemOn, course.checkpoints.length);
  const emblemsOff = new THREE.InstancedMesh(emblemGeo, emblemOff, course.checkpoints.length);
  emblemsOn.frustumCulled = emblemsOff.frustumCulled = false;
  scene.add(emblemsOn, emblemsOff);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), eu = new THREE.Euler();
  let emblemState = '';
  const glow: { index: number; t: number }[] = [];

  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.48, a = Math.PI / 2 + i * Math.PI / 5; starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = own(new THREE.ExtrudeGeometry(starShape, { depth: 0.16, bevelEnabled: false }));
  starGeo.translate(0, 0, -0.08);
  const stars = new THREE.InstancedMesh(starGeo, own(new THREE.MeshLambertMaterial({ color: PAL.gold, emissive: 0x6b4a10 })), course.stars.length);
  stars.frustumCulled = false;
  scene.add(stars);

  // Decor: Kenney CC0 props (instanced, loaded lazily) plus procedural islands, houses and baubles. Each kind is
  // instanced once per zone so distant zones' props are culled with that zone's course.
  const zoneForZ = (z: number) => { let n = 0; for (const cp of course.checkpoints) if (cp.z > z + 1) n++; return Math.max(0, Math.min(5, Math.floor((n - 1) / 5))); };
  const byKind = new Map<Decor['kind'], Decor[][]>();
  for (const d of course.decor) {
    const zones = byKind.get(d.kind) ?? Array.from({ length: 6 }, () => [] as Decor[]);
    zones[zoneForZ(d.z)].push(d);
    byKind.set(d.kind, zones);
  }
  const decorMeshes: THREE.InstancedMesh[] = [];
  const decorByKind = new Map<Decor['kind'], THREE.InstancedMesh[]>();
  const placeKind = (kind: Decor['kind'], geo: Geo, mat: THREE.Material, scale: number, tint: boolean) => {
    const meshes: THREE.InstancedMesh[] = [];
    (byKind.get(kind) ?? []).forEach((list, zone) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((d, i) => {
        q.setFromEuler(new THREE.Euler(0, d.r, 0));
        m4.compose(v3.set(d.x, d.y, d.z), q, s3.setScalar(d.s * scale));
        mesh.setMatrixAt(i, m4);
        if (tint) mesh.setColorAt(i, tmpColor.set(d.color).lerp(new THREE.Color(0xffffff), 0.35));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.zone = zone;
      meshes.push(mesh); decorMeshes.push(mesh);
      scene.add(mesh);
    });
    const old = decorByKind.get(kind);
    if (old) for (const m of old) { scene.remove(m); decorMeshes.splice(decorMeshes.indexOf(m), 1); m.dispose(); }
    decorByKind.set(kind, meshes);
  };
  const decorMat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const proceduralDecor: [Decor['kind'], Geo][] = [
    ['island', mergeAll([prim(new THREE.CylinderGeometry(4.2, 4.2, 0.6, 7), 0xffffff, 0, -0.3, 0), prim(new THREE.ConeGeometry(4.2, 5, 7), PAL.lilac, 0, -3.1, 0, Math.PI)])],
    ['house', mergeAll([bx(-1.6, 1.6, 0, 2.2, -1.4, 1.4, PAL.wood), prim(new THREE.ConeGeometry(2.6, 1.6, 4), PAL.snow, 0, 3.0, 0, 0, Math.PI / 4), bx(-0.4, 0.4, 0.5, 1.2, 1.38, 1.42, PAL.gold)])],
    ['bauble', mergeAll([prim(new THREE.IcosahedronGeometry(1.2, 1), 0xffffff, 0, 1.4, 0), prim(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 6), PAL.gold, 0, 2.6, 0)])],
    ['yarn', mergeAll([prim(new THREE.IcosahedronGeometry(1.3, 1), 0xffffff, 0, 1.3, 0), prim(new THREE.TorusGeometry(1.3, 0.12, 4, 14), PAL.cream, 0, 1.3, 0, 0.6)])],
    ['chimney', mergeAll([bx(-0.6, 0.6, 0, 2.4, -0.6, 0.6, PAL.maroon), bx(-0.7, 0.7, 2.4, 2.7, -0.7, 0.7, PAL.snow)])],
    ['flag', mergeAll([bx(-0.06, 0.06, 0, 3, -0.06, 0.06, PAL.ink), prim(new THREE.ConeGeometry(0.6, 1.2, 3), 0xffffff, 0.5, 2.5, 0, 0, 0, -Math.PI / 2)])],
    // Checkpoint lamp posts: a candy-striped pole exactly the size of its 0.28 × 1.6 collider, with a lamp on top.
    ['lamp', mergeAll([...Array.from({ length: 6 }, (_, i) => bx(-0.14, 0.14, i * 0.22, (i + 1) * 0.22, -0.14, 0.14, i % 2 ? PAL.candy : PAL.cream)), bx(-0.14, 0.14, 1.32, 1.6, -0.14, 0.14, PAL.gold), prim(new THREE.ConeGeometry(0.2, 0.18, 4), PAL.maroon, 0, 1.69, 0, 0, Math.PI / 4)])],
    ['banner', mergeAll([bx(-4.55, -4.3, 0, 4.6, -0.12, 0.12, PAL.candy), bx(4.3, 4.55, 0, 4.6, -0.12, 0.12, PAL.candy), prim(new THREE.ConeGeometry(0.35, 0.5, 4), PAL.gold, -4.42, 4.85, 0, 0, Math.PI / 4), prim(new THREE.ConeGeometry(0.35, 0.5, 4), PAL.gold, 4.42, 4.85, 0, 0, Math.PI / 4), bx(-4.3, 4.3, 0.004, 0.012, -0.25, 0.25, PAL.maroon)])],
    // Fallbacks for the Kenney props until (or unless) the models load.
    ['tree', mergeAll([prim(new THREE.ConeGeometry(1, 2.2, 6), PAL.mintDeep, 0, 1.6, 0), prim(new THREE.ConeGeometry(0.7, 0.5, 6), PAL.snow, 0, 2.6, 0), bx(-0.15, 0.15, 0, 0.5, -0.15, 0.15, PAL.wood)])],
    ['gift', mergeAll([bx(-0.6, 0.6, 0, 1.1, -0.6, 0.6, 0xffffff), bx(-0.15, 0.15, 0, 1.12, -0.62, 0.62, PAL.maroon)])],
    ['cane', mergeAll([bx(-0.12, 0.12, 0, 2, -0.12, 0.12, PAL.candy), bx(-0.12, 0.6, 2, 2.24, -0.12, 0.12, PAL.candy)])],
    ['sleigh', mergeAll([bx(-1.2, 1.2, 0.3, 1.1, -0.7, 0.7, PAL.maroon), bx(-1.4, 1.4, 0, 0.12, -0.75, 0.75, PAL.gold)])],
    ['snowman', mergeAll([prim(new THREE.IcosahedronGeometry(0.8, 1), PAL.snow, 0, 0.8, 0), prim(new THREE.IcosahedronGeometry(0.55, 1), PAL.snow, 0, 1.9, 0)])],
  ];
  for (const [kind, geo] of proceduralDecor) { own(geo); placeKind(kind, geo, decorMat, 1, kind === 'bauble' || kind === 'yarn' || kind === 'gift'); }
  let disposed = false;
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}game-art/femboy-obby/models/`;
  let kenneyMat: THREE.Material | null = null;
  for (const [kind, file] of Object.entries(KENNEY) as [Decor['kind'], string][]) {
    if (!byKind.has(kind)) continue;
    loader.loadAsync(base + file).then(gltf => {
      if (disposed) {
        gltf.scene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); const m = mesh.material as THREE.MeshStandardMaterial; m.map?.dispose(); m.dispose(); } });
        return;
      }
      const parts: Geo[] = [];
      gltf.scene.updateMatrixWorld(true);
      let map: THREE.Texture | null = null;
      gltf.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        parts.push(g.index ? g.toNonIndexed() : g);
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m.map && !map && !kenneyMat) map = m.map; else m.map?.dispose();
      });
      gltf.scene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); } });
      if (!parts.length) return;
      const geo = own(mergeGeometries(parts)!);
      parts.forEach(p => p.dispose());
      if (!kenneyMat) { kenneyMat = own(new THREE.MeshLambertMaterial({ map })); if (map) own(map as THREE.Texture); }
      placeKind(kind, geo, kenneyMat, KENNEY_SCALE[kind] ?? 1, kind === 'gift');
      if (lastView) draw({ ...lastView, dt: 0 });
    }).catch(() => { /* The simple fallback props stay. */ });
  }

  // Distant mountains, clouds and valley floor follow the camera so they always sit on the horizon.
  const far = new THREE.Group();
  const mountainGeo = own(mergeAll([prim(new THREE.ConeGeometry(1, 1, 5), 0xd3c9ee, 0, 0.5, 0, 0, 0, 0, false), prim(new THREE.ConeGeometry(0.37, 0.37, 5), PAL.snow, 0, 0.82, 0, 0, 0, 0, false)]));
  const mountains = new THREE.InstancedMesh(mountainGeo, own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), 18);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 210 + (i % 3) * 18, s = 40 + ((i * 37) % 30);
    m4.compose(v3.set(Math.sin(a) * r, -30, Math.cos(a) * r), q.identity(), s3.set(s * 1.4, s, s * 1.4));
    mountains.setMatrixAt(i, m4);
  }
  const cloudGeo = own(colored(new THREE.IcosahedronGeometry(1, 0), 0xffffff, false));
  const clouds = new THREE.InstancedMesh(cloudGeo, own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), 14);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3, r = 170 + (i % 4) * 12;
    m4.compose(v3.set(Math.sin(a) * r, 35 + (i % 3) * 10, Math.cos(a) * r), q.identity(), s3.set(16 + (i % 5) * 3, 4, 8));
    clouds.setMatrixAt(i, m4);
  }
  const valley = new THREE.Mesh(own(new THREE.CircleGeometry(250, 24)), own(new THREE.MeshLambertMaterial({ color: ZONES[0].ground })));
  valley.rotation.x = -Math.PI / 2;
  far.add(mountains, clouds);
  scene.add(far, valley);
  mountains.frustumCulled = clouds.frustumCulled = false;

  // Player, blob shadow and landing marker.
  const avatar = createAvatar(vc);
  scene.add(avatar.group);
  const blob = new THREE.Mesh(own(new THREE.CircleGeometry(0.42, 20)), own(new THREE.MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.32, depthWrite: false })));
  blob.rotation.x = -Math.PI / 2;
  const marker = new THREE.Mesh(own(new THREE.RingGeometry(0.42, 0.55, 24)), own(new THREE.MeshBasicMaterial({ color: PAL.snow, transparent: true, opacity: 0.8, depthWrite: false })));
  marker.rotation.x = -Math.PI / 2;
  scene.add(blob, marker);

  // Effects: pooled sparkles and confetti, bounded snowfall.
  const SPARKS = 12, CONFETTI = 48;
  const sparkGeo = own(new THREE.OctahedronGeometry(0.12, 0));
  const sparks = new THREE.InstancedMesh(sparkGeo, own(new THREE.MeshBasicMaterial({ color: PAL.gold })), SPARKS);
  const confetti = new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.16, 0.04, 0.1)), own(new THREE.MeshBasicMaterial({ color: 0xffffff })), CONFETTI);
  sparks.frustumCulled = confetti.frustumCulled = false;
  const confettiColors = [PAL.blush, PAL.mint, PAL.lilac, PAL.gold, PAL.snow, PAL.candy];
  for (let i = 0; i < CONFETTI; i++) confetti.setColorAt(i, tmpColor.set(confettiColors[i % confettiColors.length]));
  interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; spin: number }
  const sparkPool: P[] = Array.from({ length: SPARKS }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 }));
  const confettiPool: P[] = Array.from({ length: CONFETTI }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 }));
  scene.add(sparks, confetti);
  const SNOW = 260;
  const snowPos = new Float32Array(SNOW * 3);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < SNOW; i++) { snowPos[i * 3] = (rnd() - 0.5) * 50; snowPos[i * 3 + 1] = rnd() * 30 - 8; snowPos[i * 3 + 2] = (rnd() - 0.5) * 50; }
  const snowGeo = own(new THREE.BufferGeometry());
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, own(new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false })));
  snow.frustumCulled = false;
  scene.add(snow);

  // Camera state (presentation only).
  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
  let boom = 7.5, snap = true, lastView: View | null = null, lowQuality = false, aspect = 1;
  const stats: SceneStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, width: 0, height: 0, ratio: 1 };
  const fogColor = new THREE.Color(), skyColor = new THREE.Color(), groundColor = new THREE.Color();

  function occlusion(tx: number, ty: number, tz: number, dx: number, dy: number, dz: number, len: number, stage: number): number {
    let best = len;
    for (let st = Math.max(0, stage - 1); st <= Math.min(course.byStage.length - 1, stage + 2); st++) {
      for (const id of course.byStage[st]) {
        const s = course.solids[id];
        if (s.surface === 'post' || s.surface === 'spike' || s.blink || s.hx < 0.6 || s.hz < 0.6) continue;
        const o = solidOffset(s, lastView?.mt ?? 0);
        const x0 = o.x - s.hx, x1 = o.x + s.hx, y1 = o.y, y0 = o.y - 2 * s.hy, z0 = o.z - s.hz, z1 = o.z + s.hz;
        let tmin = 0, tmax = best;
        const slab = (p: number, d: number, lo: number, hi: number) => {
          if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
          let a = (lo - p) / d, b = (hi - p) / d;
          if (a > b) [a, b] = [b, a];
          tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
          return tmin <= tmax;
        };
        if (slab(tx, dx, x0, x1) && slab(ty, dy, y0, y1) && slab(tz, dz, z0, z1) && tmin > 0.3) best = Math.min(best, tmin);
      }
    }
    return best;
  }

  function groundBelow(x: number, y: number, z: number, stage: number, mt: number, run: Run): number {
    let best = -Infinity;
    for (let st = Math.max(0, stage - 1); st <= Math.min(course.byStage.length - 1, stage + 2); st++) {
      for (const id of course.byStage[st]) {
        const s = course.solids[id];
        if (s.surface === 'crumble' && run.crumble.find(c => c.id === id)?.phase === 2) continue;
        if (s.surface === 'spike' || (s.blink && blinkState(s, mt) === 'dark')) continue;
        const o = solidOffset(s, mt);
        if (o.y <= y + 0.05 && o.y > best && x + PLAYER.halfWidth * 0.5 > o.x - s.hx && x - PLAYER.halfWidth * 0.5 < o.x + s.hx && z + PLAYER.halfWidth * 0.5 > o.z - s.hz && z - PLAYER.halfWidth * 0.5 < o.z + s.hz) best = o.y;
      }
    }
    return best;
  }

  function draw(v: View) {
    if (disposed) return;
    lastView = v;
    const stage = v.stage;
    // Zone mood, blended towards the next zone over the last stage of each.
    const zi = Math.min(5, Math.floor(Math.max(0, stage) / 5)), next = Math.min(5, zi + 1), blend = Math.max(0, (stage % 5) - 3) / 2;
    const za = ZONES[zi], zb = ZONES[next];
    skyColor.set(za.sky).lerp(tmpColor.set(zb.sky), blend);
    fogColor.set(za.fog).lerp(tmpColor.set(zb.fog), blend);
    groundColor.set(za.ground).lerp(tmpColor.set(zb.ground), blend);
    (scene.background as THREE.Color).copy(skyColor);
    (scene.fog as THREE.Fog).color.copy(fogColor);
    (valley.material as THREE.MeshLambertMaterial).color.copy(groundColor);

    // Culling: only zones and moving parts near the player's stage.
    const lo = stage - 2, hi = stage + 6;
    zoneMeshes.forEach((m, i) => { m.visible = i * 5 + 5 >= lo && i * 5 + 1 <= hi; });
    for (const m of decorMeshes) m.visible = zoneMeshes[m.userData.zone as number].visible;
    for (const d of dyn) {
      const near = d.solid.stage >= stage - 1 && d.solid.stage <= stage + 3;
      d.mesh.visible = near;
      if (!near) continue;
      const o = solidOffset(d.solid, v.mt);
      d.mesh.position.set(o.x, o.y, o.z);
      if (d.solid.surface === 'crumble') {
        const c = v.run.crumble.find(t => t.id === d.solid.id);
        const phase = c?.phase ?? 0;
        d.mesh.visible = phase !== 2;
        // Countdown pulse while warning: a gentle sink and fade, no strobing.
        const k = phase === 1 ? Math.min(1, (c!.time) / CRUMBLE.warn) : 0;
        d.mesh.position.y = o.y - k * 0.12;
        if (!v.reduced && phase === 1) d.mesh.position.x = o.x + Math.sin(c!.time * 40) * 0.03;
        crumbleMat.opacity = 1;
        d.mesh.scale.setScalar(1 - k * 0.06);
      }
      if (d.mat) {
        // Dark panels stay as a faint ghost so you can see where they will light; a flicker (or, with reduced
        // motion, a steady dim) warns that a lit panel is about to go dark.
        const state = blinkState(d.solid, v.mt);
        d.mat.opacity = state === 'dark' ? 0.16 : state === 'warn' ? (v.reduced ? 0.55 : Math.sin(v.mt * 34) > 0 ? 0.9 : 0.35) : 1;
        d.mat.depthWrite = state !== 'dark';
        d.mat.emissive.setHex(state === 'lit' ? 0x3a2a08 : 0x000000);
      }
    }
    for (const b of beltMats) {
      const belt = b.solid.belt!;
      b.tex.offset.y = -((v.mt * Math.hypot(belt.x, belt.z)) / 1.5) % 1;
    }
    for (const s of sweepers) {
      const near = s.w.stage >= stage - 1 && s.w.stage <= stage + 3;
      s.g.visible = s.ring.visible = near;
      if (near) s.g.rotation.y = sweeperAngle(s.w, v.mt);
    }
    for (const s of pendulums) {
      const near = s.pd.stage >= stage - 1 && s.pd.stage <= stage + 3;
      s.g.visible = near;
      if (!near) continue;
      const a = pendulumAngle(s.pd, v.mt);
      if (s.pd.axis === 'x') s.g.rotation.z = a; else s.g.rotation.x = -a;
    }
    for (const s of snowballs) {
      const near = s.b.stage >= stage - 1 && s.b.stage <= stage + 3;
      const at = snowballAt(s.b, v.mt);
      s.g.visible = near && at.active;
      if (s.g.visible) { s.g.position.set(at.x, at.y, at.z); s.g.rotation.z = -(at.x - s.b.ax) / s.b.radius; }
    }
    // Emblems.
    const key = `${v.reached}`;
    if (key !== emblemState) {
      emblemState = key;
      let on = 0, off = 0;
      for (const cp of course.checkpoints) {
        m4.makeTranslation(cp.x, cp.y + 0.02, cp.z);
        if (cp.index <= v.reached) emblemsOn.setMatrixAt(on++, m4); else emblemsOff.setMatrixAt(off++, m4);
      }
      emblemsOn.count = on; emblemsOff.count = off;
      emblemsOn.instanceMatrix.needsUpdate = emblemsOff.instanceMatrix.needsUpdate = true;
    }
    for (const g of glow) g.t -= v.dt;
    while (glow.length && glow[0].t <= 0) glow.shift();
    (emblemOn as THREE.MeshLambertMaterial).emissive.setHex(glow.length ? 0x2f6b52 : 0x000000);
    // Stars.
    let n = 0;
    const spin = v.reduced ? 0 : v.mt * 1.6;
    for (const st of course.stars) {
      if (v.stars.has(st.id) || Math.abs(st.stage - stage) > 3) continue;
      q.setFromEuler(eu.set(0, spin, 0));
      m4.compose(v3.set(st.x, st.y + (v.reduced ? 0 : Math.sin(v.mt * 2 + st.stage) * 0.08), st.z), q, s3.setScalar(1));
      stars.setMatrixAt(n++, m4);
    }
    stars.count = n;
    stars.instanceMatrix.needsUpdate = true;

    // Avatar.
    avatar.group.visible = !v.dead;
    avatar.group.position.set(v.x, v.y, v.z);
    const turn = Math.atan2(Math.sin(v.facing - avatar.group.rotation.y), Math.cos(v.facing - avatar.group.rotation.y));
    avatar.group.rotation.y += turn * Math.min(1, v.dt * 14);
    avatar.pose(v.speed, v.vy, v.grounded, v.squash, v.dt, v.reduced);
    const ground = groundBelow(v.x, v.y, v.z, stage, v.mt, v.run);
    blob.visible = marker.visible = Number.isFinite(ground) && !v.dead;
    if (blob.visible) {
      const hgt = v.y - ground;
      blob.position.set(v.x, ground + 0.03, v.z);
      blob.scale.setScalar(Math.max(0.5, 1 - hgt * 0.08));
      (blob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.34 - hgt * 0.03);
      marker.visible = hgt > 0.3;
      marker.position.set(v.x, ground + 0.035, v.z);
    }

    // Camera: elevated chase boom around the player, shortened when scenery would block the view.
    const portrait = aspect < 0.8;
    const want = portrait ? 9 : 7.6;
    const target = v3.set(v.x, v.y + 1.35, v.z);
    if (snap) camTarget.copy(target); else camTarget.lerp(target, Math.min(1, v.dt * 10));
    const cp = Math.cos(v.pitch), dx = Math.sin(v.yaw) * cp, dy = Math.sin(v.pitch), dz = Math.cos(v.yaw) * cp;
    const clear = occlusion(camTarget.x, camTarget.y, camTarget.z, dx, dy, dz, want, stage);
    const goal = Math.max(2.2, clear - 0.3);
    boom = snap || goal < boom ? goal : boom + (goal - boom) * Math.min(1, v.dt * 3);
    camPos.set(camTarget.x + dx * boom, camTarget.y + dy * boom, camTarget.z + dz * boom);
    camera.position.copy(camPos);
    camera.lookAt(camTarget.x - dx * 2.5, camTarget.y - 0.2, camTarget.z - dz * 2.5);
    snap = false;
    far.position.set(camera.position.x, 0, camera.position.z);
    // Below the fail plane of the stage being played (not the furthest stage reached), so it is never a floor.
    valley.position.set(camera.position.x, course.killY[Math.max(0, Math.min(course.killY.length - 1, v.stage))] - 10, camera.position.z);

    // Effects.
    let si = 0;
    for (const p of sparkPool) {
      if (p.life > 0) { p.life -= v.dt; p.vy -= 6 * v.dt; p.x += p.vx * v.dt; p.y += p.vy * v.dt; p.z += p.vz * v.dt; }
      m4.compose(v3.set(p.x, p.y, p.z), q.setFromEuler(eu.set(p.spin, p.life * 8, 0)), s3.setScalar(p.life > 0 ? Math.min(1, p.life * 2) : 0));
      sparks.setMatrixAt(si++, m4);
    }
    sparks.instanceMatrix.needsUpdate = true;
    let ci = 0;
    for (const p of confettiPool) {
      if (p.life > 0) { p.life -= v.dt; p.vy = Math.max(-2.5, p.vy - 9 * v.dt); p.x += p.vx * v.dt; p.y += p.vy * v.dt; p.z += p.vz * v.dt; p.spin += v.dt * 6; }
      m4.compose(v3.set(p.x, p.y, p.z), q.setFromEuler(eu.set(p.spin, p.spin * 0.7, 0)), s3.setScalar(p.life > 0 ? 1 : 0));
      confetti.setMatrixAt(ci++, m4);
    }
    confetti.instanceMatrix.needsUpdate = true;
    snow.visible = !v.reduced && !lowQuality;
    if (snow.visible) {
      snow.position.set(Math.round(camera.position.x / 50) * 50, camera.position.y - 10, Math.round(camera.position.z / 50) * 50);
      const fall = (v.dt * 1.2) % 30;
      for (let i = 0; i < SNOW; i++) { let y = snowPos[i * 3 + 1] - fall; if (y < -8) y += 30; snowPos[i * 3 + 1] = y; }
      snowGeo.attributes.position.needsUpdate = true;
    }

    renderer.info.reset();
    renderer.render(scene, camera);
    notifyGlassFrame(canvas);
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.geometries = renderer.info.memory.geometries;
    stats.textures = renderer.info.memory.textures;
  }

  const releaseGlass = registerGlassFrameSource(canvas, () => { if (lastView && !disposed) draw({ ...lastView, dt: 0 }); });

  return {
    stats,
    resize(w, h) {
      aspect = w / Math.max(1, h);
      const cap = lowQuality ? 1 : 1.5;
      const ratio = Math.min(window.devicePixelRatio || 1, cap, 2, Math.sqrt((1920 * 1080) / Math.max(1, w * h)));
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      camera.aspect = aspect;
      camera.fov = aspect < 0.8 ? 70 : 60;
      camera.updateProjectionMatrix();
      stats.width = w; stats.height = h; stats.ratio = ratio;
    },
    render: draw,
    repaint() { if (lastView) draw({ ...lastView, dt: 0 }); },
    setOutfit(o, bow) { avatar.setOutfit(o, bow); },
    setQuality(low) { lowQuality = low; },
    snapCamera() { snap = true; },
    burst(kind, x, y, z) {
      if (kind === 'checkpoint') { glow.push({ index: 0, t: 0.28 }); }
      const pool = kind === 'finish' ? confettiPool : sparkPool, count = kind === 'finish' ? CONFETTI : kind === 'star' ? 10 : 8;
      let k = 0;
      for (const p of pool) {
        if (k >= count) break;
        if (p.life > 0 && kind !== 'finish') continue;
        const a = (k / count) * Math.PI * 2, sp = kind === 'finish' ? 3 + (k % 5) : 2.4;
        Object.assign(p, { x, y: y + (kind === 'finish' ? 2.5 : 1), z, vx: Math.cos(a) * sp, vy: kind === 'finish' ? 5 + (k % 4) : 3, vz: Math.sin(a) * sp, life: kind === 'finish' ? 2.2 : 0.7, spin: a });
        k++;
      }
    },
    dispose() {
      disposed = true;
      releaseGlass();
      avatar.dispose();
      for (const d of disposables) d.dispose();
      for (const m of decorMeshes) m.dispose();
      emblemsOn.dispose(); emblemsOff.dispose(); stars.dispose(); sparks.dispose(); confetti.dispose(); mountains.dispose(); clouds.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export { motionFraction };
