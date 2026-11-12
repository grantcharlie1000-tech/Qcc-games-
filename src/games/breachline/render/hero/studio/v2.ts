/** Dev-only studio for the second-build weapons (served by vite at /src/games/breachline/render/hero/studio/v2.html,
 * never built into the site). Clay and textured renders of a baked weapon beside the benchmark (Poly Haven's CC0
 * "Service Pistol") under the same light, and the dimensioned design sheet drawn from the design parameters.
 * Driven by `window.__heroV2` from tests/games/breachline/hero-v2-shots.mjs. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readMeshBin } from '../meshbin';
import { AR5, HALDEN, TERN, WREN, at } from '../sculpt/designs';
import { ArtLoader } from '../../assets';
import { texturedMaterial } from '../material';

const canvas = document.getElementById('c') as HTMLCanvasElement, ov = document.getElementById('ov') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(1);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x34373a);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
const key = new THREE.DirectionalLight(0xfff2e0, 2.4), rim = new THREE.DirectionalLight(0xdde8ff, 1.1), hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.35);
key.position.set(-1.2, 2.2, 1.4); rim.position.set(1.5, 0.8, -2); scene.add(key, rim, hemi);
const BASE = import.meta.env.BASE_URL;
const clay = new THREE.MeshStandardMaterial({ color: 0x8e8e8c, roughness: 0.62, metalness: 0 });
const clayDark = new THREE.MeshStandardMaterial({ color: 0x8e8e8c, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
const lensMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false });
const art = new ArtLoader(renderer, 'high');

let weapon: THREE.Mesh | null = null, lens: THREE.Mesh | null = null, pistol: THREE.Group | null = null, info: Record<string, unknown> = {};
let curDir = 'ar5';
let weaponTex: THREE.Material | null = null, pistolTex: THREE.Material | null = null;
async function load(dir = 'ar5', textured = false) {
  curDir = dir;
  const buf = await (await fetch(`${BASE}game-art/breachline/hero/${dir}/mesh.bin`)).arrayBuffer();
  const { geometries, header } = readMeshBin(buf);
  info = header.info ?? {};
  weapon = new THREE.Mesh(geometries.get('weapon')!, clay);
  const lg = geometries.get('lens'); lens = lg ? new THREE.Mesh(lg, lensMat) : null;
  const gltf = await new GLTFLoader().loadAsync(`${BASE}game-art/breachline/patch/pistol/pistol.glb`);
  pistol = new THREE.Group(); pistol.add(gltf.scene);
  if (textured) {
    const tex = async (set: string, size: number) => { const m = await Promise.all((['diff', 'nor', 'arm'] as const).map(k => art.texture(set, k, k === 'arm' && set.includes('pistol') ? 512 : size))); for (const t of m) { t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; } return texturedMaterial({ map: m[0], normalMap: m[1], arm: m[2] }); };
    [weaponTex, pistolTex] = await Promise.all([tex(`../hero/${dir}`, 2048), tex('../patch/pistol', 1024)]);
  }
  return { info, triangles: (weapon.geometry.index!.count / 3) };
}
function finish(textured: boolean) {
  weapon!.material = textured && weaponTex ? weaponTex : clay;
  pistol!.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = textured && pistolTex ? pistolTex : clayDark; if (!textured) { const g = m.geometry; if (!g.getAttribute('pbr')) g.setAttribute('pbr', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 4), 4)); } } });
}

function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); ov.width = w; ov.height = h; return [w, h]; }

/** Clay or textured three-quarter views, the benchmark pistol beside the rifle's receiver at the same scale. */
function studio(o: { view?: 'front34' | 'rear34' | 'right' | 'left' | 'close' | 'top'; textured?: boolean; light?: number; dist?: number } = {}) {
  const [w, h] = size(); const g = ov.getContext('2d')!; g.clearRect(0, 0, w, h);
  for (const c of [...scene.children]) if (c !== key && c !== rim && c !== hemi) scene.remove(c);
  finish(!!o.textured);
  scene.add(weapon!); if (lens) scene.add(lens);
  pistol!.position.set(o.view === 'right' ? 0.1 : -0.1, -0.2, -0.4); pistol!.rotation.set(0, 0, 0); scene.add(pistol!);
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.01, 20), target = new THREE.Vector3(0, -0.07, -0.17);
  const views = { front34: [-140, 16, 1.45], rear34: [-35, 20, 1.45], right: [90, 8, 1.6], left: [-90, 4, 2.3], close: [-60, 18, 0.75], top: [-90, 70, 2.2] } as const;
  const [yaw, pitch, dist] = views[o.view ?? 'front34'];
  const d = o.dist ?? dist, yr = THREE.MathUtils.degToRad(yaw), pr = THREE.MathUtils.degToRad(pitch);
  if (o.view === 'close') target.set(0, -0.03, -0.07);
  cam.position.set(target.x + Math.sin(yr) * Math.cos(pr) * d, target.y + Math.sin(pr) * d, target.z + Math.cos(yr) * Math.cos(pr) * d);
  cam.lookAt(target);
  // A moving key light: `light` in 0..1 sweeps it around the weapon.
  if (o.light !== undefined) { const a = -1.2 + o.light * 2.4; key.position.set(Math.sin(a) * 2, 2, Math.cos(a) * 2); } else key.position.set(-1.2, 2.2, 1.4);
  renderer.render(scene, cam);
  return { triangles: weapon!.geometry.index!.count / 3 };
}

/** The dimensioned design sheet: orthographic side (left), top and front views of the game mesh, with dimensions
 * drawn from the design parameters (not measured off the picture). */
function sheet() {
  const [w, h] = size(); const g = ov.getContext('2d')!; g.clearRect(0, 0, w, h);
  for (const c of [...scene.children]) if (c !== key && c !== rim && c !== hemi) scene.remove(c);
  finish(false); scene.add(weapon!);
  scene.background = new THREE.Color(0xe9e6df); renderer.setScissorTest(true);
  const S = curDir === 'halden12' ? 1.05 : 1.22; // px per mm
  const SHt = curDir === 'halden12' ? HALDEN.sightH : curDir === 'tern' ? TERN.sightH : curDir === 'wren' ? WREN.sightH : AR5.sightH;
  // Side view: muzzle left. Region centre is the bore at u = 175.
  const views: { name: string; cx: number; cy: number; s: number; cam: THREE.OrthographicCamera; map: (x: number, y: number, u: number) => [number, number] }[] = [];
  const mk = (name: string, cx: number, cy: number, rw: number, rh: number, s: number, pos: THREE.Vector3, up: THREE.Vector3, look: THREE.Vector3, map: (x: number, y: number, u: number) => [number, number]) => {
    const cam = new THREE.OrthographicCamera(-rw / 2 / s / 1000, rw / 2 / s / 1000, rh / 2 / s / 1000, -rh / 2 / s / 1000, 0.01, 10);
    cam.position.copy(pos); cam.up.copy(up); cam.lookAt(look);
    renderer.setViewport(cx - rw / 2, h - cy - rh / 2, rw, rh); renderer.setScissor(cx - rw / 2, h - cy - rh / 2, rw, rh);
    renderer.render(scene, cam);
    views.push({ name, cx, cy, s, cam, map });
  };
  const uc = 175, sideC = [600, 330], topC = [600, 660], frontC = [1400, 380];
  renderer.setScissorTest(false); renderer.setClearColor(0xf4f2ee, 1); renderer.clear(); renderer.setScissorTest(true);
  const yc = -0.068 - 0.04; // look a little below the bore
  mk('side', sideC[0], sideC[1], 1140, 430, S, new THREE.Vector3(-3, yc, -uc / 1000), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, yc, -uc / 1000), (x, y, u) => [sideC[0] + (uc - u) * S, sideC[1] - (y - SHt - yc * 1000) * S]);
  mk('top', topC[0], topC[1], 1140, 120, S, new THREE.Vector3(0, 3, -uc / 1000), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -uc / 1000), (x, _y, u) => [topC[0] + (uc - u) * S, topC[1] - x * S]);
  const SF = 2.2;
  mk('front', frontC[0], frontC[1], 300, 640, SF, new THREE.Vector3(0, yc, -3), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, yc, 0), (x, y) => [frontC[0] - x * SF, frontC[1] - (y - SHt - yc * 1000) * SF]);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h); scene.background = new THREE.Color(0x34373a); renderer.setClearColor(0x000000, 1);
  // Annotations.
  const V = Object.fromEntries(views.map(v => [v.name, v]));
  g.strokeStyle = '#1d3d6b'; g.fillStyle = '#1d3d6b'; g.lineWidth = 1; g.font = '13px sans-serif';
  const arrow = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y1], [x1, y1, x0, y0]]) { const a = Math.atan2(by - ay, bx - ax); g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + Math.cos(a + 0.35) * 7, ay + Math.sin(a + 0.35) * 7); g.lineTo(ax + Math.cos(a - 0.35) * 7, ay + Math.sin(a - 0.35) * 7); g.fill(); }
  };
  const label = (t: string, x: number, y: number, align: CanvasTextAlign = 'center') => { g.textAlign = align; const m = g.measureText(t).width; g.fillStyle = 'rgba(233,230,223,0.85)'; g.fillRect(align === 'center' ? x - m / 2 - 2 : align === 'left' ? x - 2 : x - m - 2, y - 11, m + 4, 15); g.fillStyle = '#1d3d6b'; g.fillText(t, x, y); };
  /** Horizontal dimension in a view between u0 and u1 at height y (design mm), drawn `off` px away. */
  const dimU = (v: string, u0: number, u1: number, y: number, off: number, t: string, x = 0) => {
    const m = V[v].map, [a] = m(x, y, u0), [b, yy] = m(x, y, u1), ly = yy + off;
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(a, yy); g.lineTo(a, ly); g.moveTo(b, yy); g.lineTo(b, ly); g.stroke(); g.setLineDash([]);
    arrow(a, ly, b, ly); label(t, (a + b) / 2, ly - 4);
  };
  const dimY = (v: string, y0: number, y1: number, u: number, off: number, t: string) => {
    const m = V[v].map, [xa, a] = m(0, y0, u), [, b] = m(0, y1, u), lx = xa + off;
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xa, a); g.lineTo(lx, a); g.moveTo(xa, b); g.lineTo(lx, b); g.stroke(); g.setLineDash([]);
    arrow(lx, a, lx, b); label(t, lx + (off > 0 ? 6 : -6), (a + b) / 2 + 4, off > 0 ? 'left' : 'right');
  };
  const dimX = (v: string, x0: number, x1: number, u: number, off: number, t: string, y = 0) => {
    const m = V[v].map, [a, ya] = m(x0, y, u), [b, yb] = m(x1, y, u);
    if (v === 'top') { const lx = a + off; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(a, ya); g.lineTo(lx, ya); g.moveTo(b, yb); g.lineTo(lx, yb); g.stroke(); g.setLineDash([]); arrow(lx, ya, lx, yb); label(t, lx + (off > 0 ? 6 : -6), (ya + yb) / 2 + 4, off > 0 ? 'left' : 'right'); }
    else { const ly = ya + off; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(a, ya); g.lineTo(a, ly); g.moveTo(b, yb); g.lineTo(b, ly); g.stroke(); g.setLineDash([]); arrow(a, ly, b, ly); label(t, (a + b) / 2, ly - 4); }
  };
  if (curDir === 'halden12') return haldenDims(V, dimU, dimY, dimX, label, g, h);
  const A = curDir === 'tern' ? TERN : curDir === 'wren' ? WREN : AR5, H = A.handguard, M = A.muzzle;
  dimU('side', A.stock.butt, M.u1, -200, 40, `overall ${M.u1 - A.stock.butt}`);
  dimU('side', 186, A.barrel.muzzle, 0, -150, `barrel ${A.barrel.muzzle - 186}`);
  dimU('side', H.u0, H.u1, 30, -60, `handguard ${H.u1 - H.u0}`);
  dimU('side', A.upper.u0, A.upper.u1, 30, -125, `upper receiver ${A.upper.u1 - A.upper.u0}`);
  dimU('side', M.u0, M.u1, 11, -40, `muzzle device ${M.u1 - M.u0}`);
  dimU('side', A.optic.u0, A.optic.u1, A.sightH + 30, -18, `red dot ${A.optic.u1 - A.optic.u0}`);
  dimU('side', A.stock.butt, 0, -2, -90, `stock and receiver extension ${-A.stock.butt}`);
  dimY('side', 0, A.sightH, 40, -60, `sight height ${A.sightH}`);
  dimY('side', 0, A.railTop, 230, 60, `rail top ${A.railTop}`);
  dimY('side', -190, A.sightH + 29.6, -40, -50, `height ${Math.round(A.sightH + 29.6 + 190)}`);
  dimY('side', A.handguard.bottom, A.deck, 470, 55, `handguard ${A.deck - A.handguard.bottom}`);
  // Grip rake.
  { const m = V.side.map, [px, py] = m(0, A.grip.pivot[1], A.grip.pivot[0]), r = 70; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + r * 1.4); g.moveTo(px, py); g.lineTo(px - Math.sin(A.grip.rake) * r * 1.4, py + Math.cos(A.grip.rake) * r * 1.4); g.stroke(); g.beginPath(); g.arc(px, py, r, Math.PI / 2, Math.PI / 2 + A.grip.rake); g.stroke(); label(`grip rake ${Math.round(A.grip.rake * 180 / Math.PI)}°`, px - 30, py + r + 22); }
  // Magazine along its curve.
  { const m = V.side.map, [x0, y0] = m(0, -12, 168.6), [x1, y1] = m(0, -184, 202.6); g.setLineDash([2, 4]); g.beginPath(); g.moveTo(x0 + 18, y0); g.quadraticCurveTo(x0 + 22, (y0 + y1) / 2, x1 + 18, y1); g.stroke(); g.setLineDash([]); label(`magazine ${A.mag.length} × ${A.mag.depth} × ${A.mag.width}`, x1 + 30, y1 + 20, 'left'); }
  dimX('top', -A.upper.half, A.upper.half, 120, -150 - 60, `receiver ${A.upper.half * 2}`);
  dimX('top', -H.half, H.half, 330, 210, `handguard ${H.half * 2}`);
  dimX('top', -A.well.half, A.well.half, 140, 0, '');
  { const m = V.top.map, [a, ya] = m(-A.well.half, 0, 140), [, yb] = m(A.well.half, 0, 140); label(`well ${A.well.half * 2}`, a, (ya + yb) / 2 + 60); }
  dimX('top', -A.optic.r, A.optic.r, 100, -95, `tube ${A.optic.r * 2}`);
  dimX('front', -A.railHalf, A.railHalf, 0, -46, `rail ${(A.railHalf * 2).toFixed(1)}`, A.railTop);
  dimX('front', -H.half, H.half, 400, 70, `handguard ${H.half * 2}`, H.bottom);
  dimX('front', -A.optic.bore, A.optic.bore, 64, -96, `window ${A.optic.bore * 2}`, A.sightH);
  // Title and notes.
  g.textAlign = 'left'; g.fillStyle = '#1d1d1d'; g.font = 'bold 20px sans-serif'; g.fillText(`${A.name}: design sheet (Breachline's own design), millimetres`, 24, 34);
  g.font = '13px sans-serif'; g.fillStyle = '#333';
  const notes = [
    `Drawn from the game mesh (${(weapon!.geometry.index!.count / 3) | 0} triangles) of the SDF sculpt; dimensions from the design parameters in render/hero/sculpt/designs.ts.`,
    `Rail: ${(A.railHalf * 2).toFixed(1)} over 45° dovetail flanks, ${A.slotW} slots on a ${A.slotPitch} pitch, ${A.slotDepth} deep. Handguard: octagonal, ${H.half * 2} across, ${H.slots} slots ${H.slot[0]} × ${H.slot[1]} each side on a ${H.slotPitch} pitch, bottom slots, angled vents.`,
    `Red dot: ${A.optic.bore * 2} window in a ${A.optic.r * 2} tube with lens hoods, elevation and windage turrets, illumination knob (left), two-ring riser with cross bolt. Folded back-up sights front and rear.`,
    `Receiver ${A.upper.half * 2} wide, well ${A.well.half * 2} outside with flared mouth, grip raked ${Math.round(A.grip.rake * 180 / Math.PI)}°, ${A.grip.width} wide. Moving parts: bolt carrier, charging handle, trigger, magazine with top round.`,
  ];
  notes.forEach((t, i) => g.fillText(t, 24, h - 80 + i * 18));
  return { triangles: weapon!.geometry.index!.count / 3, sockets: at(0, 0, 0) };
}

type Dim = (v: string, a: number, b: number, c: number, off: number, t: string, x?: number) => void;
/** The Halden 12's dimensions, from its design table. */
function haldenDims(V: Record<string, { map: (x: number, y: number, u: number) => [number, number] }>, dimU: Dim, dimY: (v: string, a: number, b: number, u: number, off: number, t: string) => void, dimX: Dim, label: (t: string, x: number, y: number, al?: CanvasTextAlign) => void, g: CanvasRenderingContext2D, h: number) {
  const D = HALDEN; void V; void label;
  dimU('side', D.stock.butt - 18, D.barrel.u1, -110, 40, `overall ${D.barrel.u1 - D.stock.butt + 18}`);
  dimU('side', D.barrel.u0, D.barrel.u1, 12, -95, `barrel ${D.barrel.u1 - D.barrel.u0}`);
  dimU('side', D.receiver.u0, D.receiver.u1, D.receiver.top, -125, `receiver ${D.receiver.u1 - D.receiver.u0}`);
  dimU('side', D.pump.u0, D.pump.u1, D.pump.bottom, 40, `pump ${D.pump.u1 - D.pump.u0}, travel ${D.pump.travel}`);
  dimU('side', D.tube.u1 + 15, D.barrel.u0, D.tube.y - 12, 70, `magazine tube ${D.tube.u1 + 15 - D.barrel.u0}`);
  dimY('side', 0, D.sightH, 20, -60, `sight height ${D.sightH}`);
  dimX('top', -D.receiver.half, D.receiver.half, 150, 200, `receiver ${D.receiver.half * 2}`);
  dimX('top', -D.pump.half, D.pump.half, 400, 200, `pump ${D.pump.half * 2}`);
  dimX('front', -D.pump.half, D.pump.half, 400, 70, `pump ${D.pump.half * 2}`, D.pump.bottom);
  g.textAlign = 'left'; g.fillStyle = '#1d1d1d'; g.font = 'bold 20px sans-serif'; g.fillText(`${D.name}: design sheet (Breachline's own design), millimetres`, 24, 34);
  g.font = '13px sans-serif'; g.fillStyle = '#333';
  ['Pump shotgun, 12 gauge: ghost-ring rear sight with ears, ramped front post with a tritium dot, tube magazine with cap and sling loop, barrel clamp.',
    `Ribbed polymer pump (moving part, ${D.pump.travel} mm travel), five-shell side saddle on the left, pistol grip raked ${Math.round(D.grip.rake * 180 / Math.PI)}°, stock with recessed panels and a ribbed pad.`,
    'Moving parts: pump, bolt, trigger, loading shell, three spent hulls. Dimensions from HALDEN in render/hero/sculpt/designs.ts.'].forEach((t, i) => g.fillText(t, 24, h - 62 + i * 18));
  return {};
}

declare global { interface Window { __heroV2: unknown; __heroV2Ready: boolean } }
window.__heroV2 = { load, studio, sheet };
window.__heroV2Ready = true;
