/** World models for the tactical kit, built in code (our own designs): the breach charge as it sits on a wall.
 * Each model is one merged, vertex-coloured mesh (one draw call) plus any small emissive parts that blink. The scene
 * creates every instance at load and warms them with the rest, so nothing here is built during play. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];
const col = new THREE.Color();

/** Paints a geometry one colour (sRGB hex) and drops attributes other parts lack, so they all merge. */
function paint(g: THREE.BufferGeometry, hex: number, shade = 1): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  col.setHex(hex, THREE.SRGBColorSpace).multiplyScalar(shade);
  const n = out.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return out;
}
/** A box with rounded edges (radius r), centred at p, optionally rotated. */
function block(size: V3, p: V3, hex: number, r = 0.004, rot: V3 = [0, 0, 0], shade = 1) {
  const g = new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(r, ...size.map(s => s / 2 - 1e-4)));
  g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]); g.translate(...p);
  return paint(g, hex, shade);
}
function tube(points: V3[], radius: number, hex: number) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return paint(new THREE.TubeGeometry(curve, 48, radius, 6, false), hex);
}

/** The breach charge on a wall. Local axes: x along the wall, y up, z out of the wall (the face is at z = 0). */
export function chargeGeometry(): { body: THREE.BufferGeometry; led: THREE.BufferGeometry } {
  const OLIVE = 0x4c5139, WEB = 0x23261f, FOAM = 0x2c2e30, CORE = 0x9b8b63, HAZARD = 0xd2a01c, BLACK = 0x18191b, TAPE = 0x6f7466;
  const parts = [
    // Adhesive foam frame against the wall, slightly larger than the pack, and the pack itself.
    block([0.36, 0.27, 0.01], [0, 0, 0.005], FOAM, 0.004),
    block([0.33, 0.24, 0.038], [0, 0, 0.029], OLIVE, 0.012),
    // The shaped core: a raised, tan strip in a frame, with its printed warning band.
    block([0.22, 0.11, 0.016], [-0.02, 0.015, 0.053], CORE, 0.005),
    block([0.22, 0.022, 0.004], [-0.02, -0.03, 0.062], HAZARD, 0.001),
    block([0.33, 0.026, 0.006], [0, 0.098, 0.05], HAZARD, 0.002),
    // Webbing straps over the pack, with their ends folded round the frame.
    block([0.026, 0.25, 0.006], [-0.11, 0, 0.051], WEB, 0.002), block([0.026, 0.25, 0.006], [0.07, 0, 0.051], WEB, 0.002),
    // Tape holding it up: two strips over the corners onto the wall.
    block([0.09, 0.03, 0.002], [-0.16, 0.12, 0.012], TAPE, 0.001, [0, 0, 0.65]), block([0.09, 0.03, 0.002], [0.16, -0.12, 0.012], TAPE, 0.001, [0, 0, 0.65]),
    // The detonator: a black box with a cap, a toggle and a cable gland.
    block([0.075, 0.095, 0.045], [0.115, -0.055, 0.07], BLACK, 0.008),
    block([0.03, 0.018, 0.012], [0.105, -0.002, 0.096], 0x3a3d40, 0.003),
    block([0.012, 0.012, 0.03], [0.14, -0.035, 0.1], 0x8f9396, 0.003),
    block([0.018, 0.018, 0.018], [0.13, -0.106, 0.06], 0x2f3133, 0.004),
    // The firing wire: out of the gland, a loose loop down the wall, and away along the floor line.
    tube([[0.13, -0.11, 0.06], [0.14, -0.17, 0.05], [0.1, -0.26, 0.035], [0.02, -0.31, 0.02], [0.05, -0.38, 0.012], [0.15, -0.4, 0.012], [0.21, -0.47, 0.01]], 0.0035, 0xa8231c),
    tube([[0.122, -0.11, 0.058], [0.13, -0.175, 0.045], [0.088, -0.262, 0.03], [0.012, -0.315, 0.018], [0.042, -0.386, 0.011], [0.142, -0.408, 0.011], [0.2, -0.478, 0.009]], 0.0035, 0x1b1b1b),
  ];
  const body = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  body.computeBoundingSphere();
  const led = new THREE.SphereGeometry(0.009, 10, 6); led.translate(0.13, -0.025, 0.093);
  return { body, led };
}

/** The uplink on the floor: a hard case with its lid open, a keypad, an aerial, and the screen inside the lid.
 * Local axes: x across, y up, z towards the front (the screen faces +z from the lid standing at the back). Returns the
 * case as one merged mesh, plus the pieces that change with the device's state: the screen, its progress bar (scaled
 * in x from its left end) and three status lights. */
export function deviceGeometry(): { body: THREE.BufferGeometry; screen: THREE.BufferGeometry; bar: THREE.BufferGeometry; leds: THREE.BufferGeometry[] } {
  const CASE = 0x2f363b, RIB = 0x262c30, LATCH = 0x8d9397, PANEL = 0x15191c, KEY = 0x3a4146, BEZEL = 0x101315, RUBBER = 0x1c1f21, HAZARD = 0xd6a51c;
  const parts: THREE.BufferGeometry[] = [
    // The case: body, two ribs round it, feet, latches and a handle on the front.
    block([0.46, 0.15, 0.32], [0, 0.085, 0], CASE, 0.02),
    block([0.47, 0.025, 0.33], [0, 0.05, 0], RIB, 0.008), block([0.47, 0.025, 0.33], [0, 0.125, 0], RIB, 0.008),
    block([0.06, 0.012, 0.06], [-0.18, 0.006, -0.12], RUBBER, 0.004), block([0.06, 0.012, 0.06], [0.18, 0.006, -0.12], RUBBER, 0.004),
    block([0.06, 0.012, 0.06], [-0.18, 0.006, 0.12], RUBBER, 0.004), block([0.06, 0.012, 0.06], [0.18, 0.006, 0.12], RUBBER, 0.004),
    block([0.05, 0.05, 0.02], [-0.13, 0.12, 0.165], LATCH, 0.006), block([0.05, 0.05, 0.02], [0.13, 0.12, 0.165], LATCH, 0.006),
    block([0.16, 0.022, 0.03], [0, 0.1, 0.18], RUBBER, 0.01),
    block([0.47, 0.02, 0.01], [0, 0.04, 0.162], HAZARD, 0.003),
    // Inside the open case: the panel with a keypad and a cable gland.
    block([0.42, 0.01, 0.28], [0, 0.161, 0.005], PANEL, 0.004),
    ...Array.from({ length: 12 }, (_, i) => block([0.028, 0.008, 0.024], [0.04 + (i % 4) * 0.036, 0.168, 0.02 + Math.floor(i / 4) * 0.032], KEY, 0.003)),
    block([0.12, 0.006, 0.07], [-0.1, 0.167, 0.06], 0x23292d, 0.002),
    block([0.03, 0.03, 0.03], [-0.17, 0.175, -0.08], LATCH, 0.006),
    // The lid, hinged at the back and standing up, with the screen's bezel on its inside.
    block([0.46, 0.32, 0.03], [0, 0.32, -0.165], CASE, 0.015, [-0.12, 0, 0]),
    block([0.34, 0.2, 0.012], [0, 0.33, -0.143], BEZEL, 0.006, [-0.12, 0, 0]),
    // The aerial: a base and a whip.
    block([0.03, 0.04, 0.03], [0.2, 0.19, -0.11], LATCH, 0.006),
    paint(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 6).translate(0.2, 0.45, -0.11), 0x1e2124),
    paint(new THREE.SphereGeometry(0.01, 8, 6).translate(0.2, 0.7, -0.11), 0x1e2124),
  ];
  const body = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  body.computeBoundingSphere();
  // The screen and bar lie on the bezel, tilted back with the lid.
  const tilt = (g: THREE.BufferGeometry, y: number, z: number) => { g.rotateX(-0.12); g.translate(0, y, z); return g; };
  const screen = tilt(new THREE.PlaneGeometry(0.3, 0.16), 0.335, -0.136);
  const bar = new THREE.PlaneGeometry(0.26, 0.018); bar.translate(0.13, 0, 0); tilt(bar, 0.275, -0.128);
  const leds = [0, 1, 2].map(i => new THREE.SphereGeometry(0.006, 8, 6).translate(-0.18 + i * 0.022, 0.172, 0.11));
  return { body, screen, bar, leds };
}

/** The screen's face: our own layout (a title, a signal graph and the status line), drawn once at load. Its colour
 * comes from the material, so state changes never redraw or upload it. */
export function deviceScreenTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#05080a'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (let x = 8; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 34); g.lineTo(x, 92); g.stroke(); }
  g.fillStyle = '#ffffff'; g.font = 'bold 22px monospace'; g.fillText('UPLINK', 12, 26);
  g.font = '12px monospace'; g.fillText('CH 07  TX', 168, 24);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath();
  for (let x = 0; x < 240; x += 4) { const y = 64 + Math.sin(x * 0.11) * 14 * Math.sin(x * 0.027) + Math.sin(x * 0.53) * 4; if (x) g.lineTo(8 + x, y); else g.moveTo(8, y); }
  g.stroke();
  g.strokeRect(10, 100, 236, 18);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
