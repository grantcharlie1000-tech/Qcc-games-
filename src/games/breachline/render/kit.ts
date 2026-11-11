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
