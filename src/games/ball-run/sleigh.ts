/** Christmas: Santa's sleigh, drawn in place of the ball. Santa is out on his rounds; only his hat is
 * left on the seat. The sleigh is a presentation model only: collision still uses the ball's sphere,
 * so it is built exactly one ball wide (2 × RADIUS, the gold trim on each side is the widest point),
 * its runners touch the ground where the ball does (RADIUS below the centre) and nothing reaches
 * further forward than the ball's front, so a crash never shows the sleigh inside a block.
 *
 * Local frame: the origin is the ball's centre, +y is up and -z is forward. Parts that share a
 * finish are merged and coloured per vertex, so the whole sleigh is two draw calls. */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RADIUS, SLEIGH_BODY } from './config';

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
  s.moveTo(-.41, BOTTOM);
  s.lineTo(.06, BOTTOM);
  s.bezierCurveTo(.17, BOTTOM, .25, .18, .25, .26);
  s.quadraticCurveTo(.25, .335, .18, .335);
  s.quadraticCurveTo(.12, .335, .11, .285);
  s.quadraticCurveTo(.1, .25, .04, .25);
  s.lineTo(-.26, .25);
  s.quadraticCurveTo(-.38, .25, -.42, .35);
  s.quadraticCurveTo(-.445, .435, -.51, .43);
  // Rounded, not sharp, at the backrest's rolled tip and the bottom rear corner, so the gold trim that runs
  // round the whole panel bends wider than it is thick and never creases.
  s.quadraticCurveTo(-.56, .43, -.545, .38);
  s.quadraticCurveTo(-.505, .27, -.447, .155);
  s.quadraticCurveTo(-.432, BOTTOM, -.41, BOTTOM);
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

/** A smooth tube through the points. An open tube gets a rounded cap on each end, so no end is left hollow. */
function tube(points: THREE.Vector3[], radius: number, segments = 64, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const body = new THREE.TubeGeometry(curve, segments, radius, 10, closed);
  if (closed) return body;
  const parts = [body, new THREE.IcosahedronGeometry(radius, 2), new THREE.IcosahedronGeometry(radius, 2)];
  parts[1].translate(...curve.getPoint(0).toArray());
  parts[2].translate(...curve.getPoint(1).toArray());
  const flat = parts.map(g => {
    const f = g.index ? g.toNonIndexed() : g;
    if (f !== g) g.dispose();
    for (const name of Object.keys(f.attributes)) if (name !== 'position' && name !== 'normal') f.deleteAttribute(name);
    return f;
  });
  const g = mergeGeometries(flat)!;
  for (const f of flat) f.dispose();
  return g;
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
  // Each ring's first and last vertex are the same point, smoothed separately: share one normal so no seam shows.
  const n = g.getAttribute('normal') as THREE.BufferAttribute, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const a = i * (sides + 1), b = a + sides;
    v.fromBufferAttribute(n, a).add(w.fromBufferAttribute(n, b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
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
    new THREE.Vector3(0, .01, 0), new THREE.Vector3(.01, .26, 0), new THREE.Vector3(.13, .34, 0), new THREE.Vector3(.18, .13, 0));
  // Tapers fast enough that the cone stays thinner than its bend is tight, so the inside of the fold never creases.
  const cone = taperedTube(spine, 48, 20, t => .092 * (1 - t) ** 1.6 + .011);
  const brim = new THREE.TorusGeometry(.098, .034, 12, 32);
  brim.rotateX(Math.PI / 2);
  brim.translate(0, .03, 0);
  const tip = spine.getPoint(1);
  const pompom = new THREE.IcosahedronGeometry(.042, 2);
  pompom.translate(tip.x + .006, tip.y - .03, tip.z);
  return { red: [cone], fur: [brim, pompom] };
}

/** Merges coloured groups of parts into one geometry, each part painted its group's colour per vertex. */
function merged(groups: [THREE.BufferGeometry[], number][]): THREE.BufferGeometry {
  const ready = groups.flatMap(([parts, hex]) => parts.map(g => {
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    // Vertex colours are linear, as THREE.Color stores them.
    const c = new THREE.Color(hex), count = flat.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return flat;
  }));
  const g = mergeGeometries(ready)!;
  for (const part of ready) part.dispose();
  return g;
}

export interface Sleigh { readonly group: THREE.Group; dispose(): void }

export function createSleigh(): Sleigh {
  const shape = profile(), curves = shape.curves;
  const body: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [], velvet: THREE.BufferGeometry[] = [], floor: THREE.BufferGeometry[] = [];
  const red: THREE.BufferGeometry[] = [], fur: THREE.BufferGeometry[] = [];
  // Rim: one closed loop round the whole side panel (bottom, dash, seat rail, backrest and rear edge), so no
  // trim end is left open; the shared start and end point is dropped so the loop closes smoothly.
  const rim = along(curves).slice(0, -1);
  for (const side of [-1, 1]) {
    // No bevel: the gold rim covers the panel's whole outline, and a bevel showed as a pale seam beside it.
    body.push(across(shape, side > 0 ? PANEL_IN : -PANEL_OUT, side > 0 ? PANEL_OUT : -PANEL_IN));
    gold.push(tube(rim.map(p => at(p.x, p.y, side * TRIM_X)), TRIM, 160, true));
    // Scrollwork: a curl on the dash and one under the backrest.
    gold.push(scroll(.16, .22, side * PANEL_OUT, .07, .015, 1.6), scroll(-.39, .2, side * PANEL_OUT, .05, .012, 1.4));
    // Runner: a curled tail, a long straight glide and a tall curl rising in front of the dash, on three struts.
    const runner: [number, number][] = [[-.45, .085], [-.48, .062], [-.477, .032], [-.44, RUNNER], [-.3, RUNNER], [0, RUNNER], [.14, RUNNER],
      [.232, .034], [.282, .08], [.313, .16], [.323, .25], [.311, .325], [.281, .372], [.243, .377], [.217, .348], [.223, .31], [.251, .295], [.276, .311]];
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
  const backEdge = along(curves.slice(9, 11), 64), cut = backEdge.findIndex(p => p.y <= BACK_TOP);
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
  // Leans back with the panel (whose rear edge slopes back as it rises), resting against it.
  back.rotateX(.25);
  back.translate(0, .29 - RADIUS, .43);
  velvet.push(seat, back);
  // The hat on the front of the seat, leaning back a little, its tip drooping toward the camera's right.
  // The sleigh collides as the box it fills (SLEIGH_BODY), and the course generator keeps every path at least
  // RADIUS + 6 cm from a block along the course as well as across it. So the sleigh is drawn compact enough to
  // fit that: its length, front runner curls kept where they are, is pressed toward the front until the
  // backrest ends 5 mm inside the box's back. Every course the ball can finish, the sleigh can too.
  const frame = new THREE.Box3(), piece = new THREE.Box3();
  for (const g of [...body, ...gold, ...velvet, ...floor]) { g.computeBoundingBox(); frame.union(piece.copy(g.boundingBox!)); }
  const front = frame.min.z, press = (SLEIGH_BODY.kind === 'box' ? SLEIGH_BODY.back - .005 - front : 0) / (frame.max.z - front);
  for (const g of [...body, ...gold, ...velvet, ...floor]) { g.translate(0, 0, -front); g.scale(1, 1, press); g.translate(0, 0, front); g.computeBoundingBox(); }
  const hatParts = hat();
  // Upright, so the brim sits flush on the cushion all round (its underside 1.5 mm into it), centred on the
  // seat so the whole brim is on it.
  const brimUnder = (.03 - .034) * HAT, seatTop = BOTTOM + .03 + SEAT - RADIUS;
  const place = new THREE.Matrix4().compose(new THREE.Vector3(-.05, seatTop - brimUnder - .0015, (seat.boundingBox!.min.z + seat.boundingBox!.max.z) / 2),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -.4, 0)), new THREE.Vector3(HAT, HAT, HAT));
  for (const g of hatParts.red) { g.applyMatrix4(place); red.push(g); }
  for (const g of hatParts.fur) { g.applyMatrix4(place); fur.push(g); }

  const group = new THREE.Group();
  group.name = 'sleigh';
  // Two draw calls: the lacquered body and gold share one glossy material, and the soft velvet, floor, hat
  // and fur share one matte one, each part coloured per vertex. The theme then stays within the game's
  // original draw-call budget.
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [merged([[body, SLEIGH_COLORS.body], [gold, SLEIGH_COLORS.gold]]), new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x5a4c3c, shininess: 48 })],
    [merged([[velvet, SLEIGH_COLORS.velvet], [floor, SLEIGH_COLORS.floor], [red, SLEIGH_COLORS.hat], [fur, SLEIGH_COLORS.fur]]), new THREE.MeshLambertMaterial({ vertexColors: true })],
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
