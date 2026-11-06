/** Christmas: Santa's sleigh, drawn in place of the ball. Santa is out on his rounds; only his hat is
 * left on the seat. The sleigh is a presentation model only: collision still uses the ball's sphere,
 * so it is built exactly one ball wide (2 × RADIUS, the gold trim on each side is the widest point),
 * its runners touch the ground where the ball does (RADIUS below the centre) and nothing reaches
 * further forward than the ball's front, so a crash never shows the sleigh inside a block.
 *
 * Local frame: the origin is the ball's centre, +y is up and -z is forward. Parts that share a
 * material are merged, so the whole sleigh is six draw calls. */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RADIUS } from './config';

/** Side panels: inner and outer face (|x|); the gold trim tube is centred on the outer face. */
const PANEL_IN = .318, TRIM = .018, TRIM_X = RADIUS - TRIM, PANEL_OUT = TRIM_X + .002;
export const SLEIGH_RUNNER_X = .25;
const RUNNER_X = SLEIGH_RUNNER_X, RUNNER = .02, INNER = 2 * PANEL_IN + .004;
const BOTTOM = .12, BACK = .035, BACK_TOP = .33, SEAT = .1, HAT = 1.15;

export const SLEIGH_COLORS = { body: 0xc8102e, gold: 0xe7b53c, velvet: 0x1d6b3c, floor: 0x5b1a12, hat: 0xd61f33, fur: 0xf8f6f0 } as const;

/** (u, v) is (forward, up) from the bottom of the runners. */
const at = (u: number, v: number, x: number) => new THREE.Vector3(x, v - RADIUS, -u);

/** The side profile, front to the right: a low scrolled dash at the front, a low seat rail, and a raised
 * backrest at the rear whose top rolls back over the rear edge. Seen by the chase camera from behind, the
 * backrest is nearest and the dash and the tall runner curls are furthest, so the sleigh plainly drives away
 * from the camera. The backrest stays low enough that the camera sees the hat over it. Counter-clockwise. */
function profile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-.44, BOTTOM);
  s.lineTo(.06, BOTTOM);
  s.bezierCurveTo(.17, BOTTOM, .25, .18, .25, .26);
  s.quadraticCurveTo(.25, .335, .18, .335);
  s.quadraticCurveTo(.12, .335, .11, .285);
  s.quadraticCurveTo(.1, .25, .04, .25);
  s.lineTo(-.26, .25);
  s.quadraticCurveTo(-.38, .25, -.42, .35);
  s.quadraticCurveTo(-.445, .435, -.53, .425);
  s.quadraticCurveTo(-.5, .28, -.44, BOTTOM);
  return s;
}

/** Points along some of a path's curves, without repeating the shared ends. */
function along(curves: THREE.Curve<THREE.Vector2>[], per = 24): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  curves.forEach((curve, i) => { for (let k = i ? 1 : 0; k <= per; k++) out.push(curve.getPoint(k / per)); });
  return out;
}

/** A band of the given thickness on the inside (left) of a counter-clockwise run of outline points. */
function band(points: THREE.Vector2[], thickness: number): THREE.Shape {
  const inner = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const t = new THREE.Vector2().subVectors(b, a).normalize();
    return new THREE.Vector2(p.x - t.y * thickness, p.y + t.x * thickness);
  });
  return new THREE.Shape([...points, ...inner.reverse()]);
}

/** Extrudes a (u, v) shape across x, from x0 to x1. */
function across(shape: THREE.Shape, x0: number, x1: number, bevel = 0): THREE.BufferGeometry {
  const depth = x1 - x0 - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments: 14, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * .75, bevelSegments: 2,
  });
  // Shape (u, v, depth) -> (x, y, z) = (depth, v, -u).
  g.rotateY(Math.PI / 2);
  g.translate(x0 + bevel, -RADIUS, 0);
  // Smooth shading round the curves, crisp edges where the faces meet.
  g.deleteAttribute('uv');
  const smooth = toCreasedNormals(g, Math.PI / 5);
  g.dispose();
  return smooth;
}

function tube(points: THREE.Vector3[], radius: number, segments = 64, closed = false): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), segments, radius, 10, closed);
}

/** A tube whose radius follows `radius(t)` along the curve; the hat's drooping cone. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, segments: number, sides: number, radius: (t: number) => number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false), positions: number[] = [], indices: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, r = radius(t);
    curve.getPointAt(t, p);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      positions.push(
        p.x + r * (c * frames.normals[i].x + s * frames.binormals[i].x),
        p.y + r * (c * frames.normals[i].y + s * frames.binormals[i].y),
        p.z + r * (c * frames.normals[i].z + s * frames.binormals[i].z));
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    // Around the ring runs from the normal toward the binormal, so this winding faces outward.
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A flat spiral of gold scrollwork on a side panel's outer face. */
function scroll(cu: number, cv: number, x: number, r0: number, r1: number, turns: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let k = 0; k <= 48; k++) {
    const t = k / 48, a = Math.PI * .5 + t * turns * Math.PI * 2, r = r0 + (r1 - r0) * t;
    points.push(at(cu + r * Math.cos(a), cv + r * Math.sin(a), x));
  }
  return tube(points, .009, 48);
}

/** Santa's hat: a fur brim, a red cone that droops over to one side, and a pompom. Its base is at the origin. */
function hat(): { red: THREE.BufferGeometry[]; fur: THREE.BufferGeometry[] } {
  const spine = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, .01, 0), new THREE.Vector3(0, .27, 0), new THREE.Vector3(.1, .33, 0), new THREE.Vector3(.17, .13, 0));
  const cone = taperedTube(spine, 36, 20, t => .092 * (1 - t) ** 1.15 + .011);
  const brim = new THREE.TorusGeometry(.098, .034, 12, 32);
  brim.rotateX(Math.PI / 2);
  brim.translate(0, .03, 0);
  const tip = spine.getPoint(1);
  const pompom = new THREE.IcosahedronGeometry(.042, 2);
  pompom.translate(tip.x + .006, tip.y - .03, tip.z);
  return { red: [cone], fur: [brim, pompom] };
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ready = parts.map(g => {
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    return flat;
  });
  const g = mergeGeometries(ready)!;
  for (const part of ready) part.dispose();
  return g;
}

export interface Sleigh { readonly group: THREE.Group; dispose(): void }

export function createSleigh(): Sleigh {
  const shape = profile(), curves = shape.curves;
  const body: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [], velvet: THREE.BufferGeometry[] = [], floor: THREE.BufferGeometry[] = [];
  const red: THREE.BufferGeometry[] = [], fur: THREE.BufferGeometry[] = [];
  // Rim: the bottom edge, up the bow, along the seat rail and over the backrest (the back edge is the band below).
  const rim = along(curves.slice(0, 8));
  for (const side of [-1, 1]) {
    body.push(across(shape, side > 0 ? PANEL_IN : -PANEL_OUT, side > 0 ? PANEL_OUT : -PANEL_IN, .006));
    gold.push(tube(rim.map(p => at(p.x, p.y, side * TRIM_X)), TRIM, 120));
    // Scrollwork: a curl on the dash and one under the backrest.
    gold.push(scroll(.16, .22, side * PANEL_OUT, .07, .015, 1.6), scroll(-.39, .2, side * PANEL_OUT, .05, .012, 1.4));
    // Runner: a curled tail, a long straight glide and a tall curl rising in front of the dash, on three struts.
    const runner: [number, number][] = [[-.45, .085], [-.48, .062], [-.477, .032], [-.44, RUNNER], [-.3, RUNNER], [0, RUNNER], [.14, RUNNER],
      [.235, .034], [.3, .08], [.34, .16], [.35, .25], [.335, .33], [.3, .38], [.262, .382], [.244, .35], [.258, .318], [.288, .325]];
    gold.push(tube(runner.map(([u, v]) => at(u, v, side * RUNNER_X)), RUNNER, 96));
    for (const u of [-.38, -.12, .1]) {
      const strut = new THREE.CylinderGeometry(.014, .014, BOTTOM - RUNNER + .01, 10);
      strut.translate(side * RUNNER_X, (BOTTOM + RUNNER) / 2 - RADIUS, -u);
      gold.push(strut);
    }
  }
  // Between the sides: the dash (front band), the back panel and the floor. The side panels carry the tall
  // backrest curls at the near corners; between them the back panel stops lower, so the chase camera, behind
  // and only a little above, sees the whole hat over it.
  body.push(across(band(along(curves.slice(1, 4)), .035), -INNER / 2, INNER / 2));
  const backEdge = along(curves.slice(8, 9), 64), cut = backEdge.findIndex(p => p.y <= BACK_TOP);
  const a = backEdge[cut - 1], b = backEdge[cut], top = a.clone().lerp(b, (a.y - BACK_TOP) / (a.y - b.y));
  body.push(across(band([top, ...backEdge.slice(cut)], BACK), -INNER / 2, INNER / 2));
  floor.push(across(new THREE.Shape([new THREE.Vector2(-.42, BOTTOM), new THREE.Vector2(.1, BOTTOM), new THREE.Vector2(.1, BOTTOM + .03), new THREE.Vector2(-.42, BOTTOM + .03)]), -INNER / 2, INNER / 2));
  // Gold on the back, where the camera sees the sleigh: a rounded rail capping the panel and a band below it.
  const rail = top.x + BACK / 2;
  gold.push(tube([at(rail, BACK_TOP, -INNER / 2), at(rail, BACK_TOP, 0), at(rail, BACK_TOP, INNER / 2)], BACK / 2 + .004, 8));
  const low = backEdge.reduce((p, q) => Math.abs(q.y - .2) < Math.abs(p.y - .2) ? q : p);
  gold.push(tube([at(low.x - .002, .2, -INNER / 2), at(low.x - .002, .2, 0), at(low.x - .002, .2, INNER / 2)], .011, 8));
  // Green velvet: a seat cushion and a back cushion leaning on the backrest.
  const seat = new RoundedBoxGeometry(INNER - .012, SEAT, .42, 3, .03);
  seat.translate(0, BOTTOM + .03 + SEAT / 2 - RADIUS, .23);
  const back = new RoundedBoxGeometry(INNER - .012, .1, .05, 3, .022);
  back.rotateX(-.25);
  back.translate(0, .29 - RADIUS, .41);
  velvet.push(seat, back);
  // The hat on the front of the seat, leaning back a little, its tip drooping toward the camera's right.
  const hatParts = hat();
  const place = new THREE.Matrix4().compose(new THREE.Vector3(-.05, BOTTOM + .03 + SEAT - .006 - RADIUS, .15),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, -.4, -.04)), new THREE.Vector3(HAT, HAT, HAT));
  for (const g of hatParts.red) { g.applyMatrix4(place); red.push(g); }
  for (const g of hatParts.fur) { g.applyMatrix4(place); fur.push(g); }

  const group = new THREE.Group();
  group.name = 'sleigh';
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [merged(body), new THREE.MeshPhongMaterial({ color: SLEIGH_COLORS.body, specular: 0x6a3a3a, shininess: 70 })],
    [merged(gold), new THREE.MeshPhongMaterial({ color: SLEIGH_COLORS.gold, specular: 0xfff0b8, shininess: 90 })],
    [merged(velvet), new THREE.MeshPhongMaterial({ color: SLEIGH_COLORS.velvet, specular: 0x112211, shininess: 8 })],
    [merged(floor), new THREE.MeshPhongMaterial({ color: SLEIGH_COLORS.floor, specular: 0x000000, shininess: 4 })],
    [merged(red), new THREE.MeshPhongMaterial({ color: SLEIGH_COLORS.hat, specular: 0x331111, shininess: 10 })],
    [merged(fur), new THREE.MeshLambertMaterial({ color: SLEIGH_COLORS.fur })],
  ];
  // Tubes are polygons, so the drawn trim falls a fraction of a millimetre inside its true radius. Measure
  // the finished vertices and make the sleigh exactly one ball wide, centred, with the runners on the ground.
  const bounds = new THREE.Box3(), part = new THREE.Box3();
  for (const [g] of parts) { g.computeBoundingBox(); bounds.union(part.copy(g.boundingBox!)); }
  const stretch = 2 * RADIUS / (bounds.max.x - bounds.min.x), shift = -(bounds.max.x + bounds.min.x) / 2;
  for (const [g, material] of parts) {
    g.translate(shift, -RADIUS - bounds.min.y, 0);
    g.scale(stretch, 1, 1);
    g.computeBoundingBox(); g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, material));
  }
  const geometries = parts.map(([g]) => g), materials = parts.map(([, m]) => m);
  return {
    group,
    dispose() { for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}
