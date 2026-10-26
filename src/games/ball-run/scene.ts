/** Ball Run's Three.js renderer, the only module that touches WebGL. It draws one
 * frame from a Run and its Course and keeps only presentation state between frames
 * (trail history, the cached road). Obstacles are drawn from course.pose(), the same
 * boxes collision uses. Every instanced buffer is allocated once and reused; the road
 * is rebuilt only when its origin, which moves in 0.5 m steps, changes. */
import * as THREE from 'three';
import { rollAngle } from './roll';
import { DYING_DURATION, GATE_WALL_HEIGHT, RADIUS, SLOPE, type Course, type Gate, type Obstacle, type ObstaclePose, type Run, type TrackSample } from './config';

export interface SceneOptions { reducedMotion(): boolean }
export interface FrameView { run: Run; course: Course; speed: number }
export interface SceneStats { calls: number; geometries: number; aspect: number; ballScreenX: number; ballScreenY: number }
export interface BallRunScene {
  resize(width: number, height: number): void;
  render(view: FrameView): void;
  /** Forgets frame-to-frame state (trail history, cached road) before a new or restored run. */
  reset(): void;
  readonly stats: SceneStats;
  dispose(): void;
}

const PALETTE = {
  void: 0x000000, track: 0x333b74, grid: 0x929bfb, sphere: 0xe500b1, block: 0xb51cfa, boost: 0x00e7ef,
  tower: 0x232764, towerLine: 0x8890f2, white: 0xffffff,
};
const TILES = 420, LINES = 3400, BLOCKS = 320, CYAN = 200, TRAIL = 18, BURST = 40, BURST_REDUCED = 14;
/** Road drawn behind the origin; the camera sits 3.6 m back. */
const BEHIND = 6;
const LANES = [-.5, -.25, 0, .25, .5], SIDES = [-1, 1];
const TILE_DEPTH = .18, LINE_WIDTH = .07, CENTER_WIDTH = .13, CROSS_WIDTH = .1, LINE_HEIGHT = .02, LIFT = .02;
const CAMERA_BACK = 3.6, CAMERA_UP = 1.8;
/** Vertical FOV (degrees): the plan's 64° widening by up to 10° with speed. A wide view is
 * narrowed in one ratio at every speed, so its horizontal FOV reaches 82° only at full widening. */
const FOV = 64, FOV_GAIN = 10, H_FOV_CAP = 82;
/** Followed down a fall, the view tilts after the ball by this share of its extra drop, down to the steepest pitch. */
const FALL_TILT = .65, MAX_PITCH = .6;
/** Trail: samples nearer the ball would only tint it, and those within 0.2 m of the camera
 * are unseen, so the 0.5 m history shows at most 6 spheres (3–4 on screen in portrait, 2–3 in
 * the narrower landscape view). The trail shrinks and fades over its length; under reduced
 * motion it ends 1 m behind its first sphere, so it shows at most 2 and stops short of the
 * screen edge. */
const TRAIL_NEAR = RADIUS * 1.6, TRAIL_FAR = CAMERA_BACK - .2, TRAIL_FAR_REDUCED = TRAIL_NEAR + 1, TRAIL_OPACITY = .85;
/** Boost arch: wall height, ring spacing, arch bars and the heights of the wall rails. */
const WALL = GATE_WALL_HEIGHT, RING = 3, ARCH = 10, BAR = .06, ENTRANCE_BAR = .13, RAILS = [WALL / 2, WALL];
/** Tower city: 8 building variations every 7 m, so the pooled city repeats every 56 m. */
const CITY_VARIANTS = 8, CITY_STEP = 7, CITY_PERIOD = CITY_VARIANTS * CITY_STEP, CITY_COUNT = 48, CITY_BASE = -14, CITY_INNER = 5.6;
/** A fall keeps its sideways speed, so the drawn ball stops at the nearest tower faces and drops
 * down them (on the road |x| ≤ 5 m, so this never moves a live ball); the camera stays 1.2 m inside them. */
const BALL_LIMIT = CITY_INNER - RADIUS - .05, CAMERA_LIMIT = CITY_INNER - 1.2;
const HEIGHTS = [40, 27, 47, 33, 53, 30, 44, 36], JITTER = [0, .5, .2, .8, .1, .6, .3, .9], DEPTHS = [6, 5, 6.5, 5.5, 6, 4.5, 6.5, 5];

/** Linear RGB multipliers per box face, in BoxGeometry order: +x, -x, +y, -y, +z, -z. */
const SIDE_LIGHT = [1.35, 3, .9], FACE_LIGHT = [SIDE_LIGHT, SIDE_LIGHT, [1.6, 5, 1], [.3, .3, .3], [1, 1, 1], [.5, .5, .5]];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const blankSample = (): TrackSample => ({ center: 0, width: 0, elevation: 0, gradient: 0, bank: 0, ground: true, tunnel: false, kind: 'warmup', segment: 0 });

/** Deterministic [0, 1) from two integers. */
function unit(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 0x21f0aaad);
  h = Math.imul(h ^ h >>> 15, 0x735a2d97);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}

/** Writes the box transform in the snapped road group's local coordinates. */
export function setObstacleTransform(target: THREE.Object3D, pose: ObstaclePose, origin: number): void {
  target.position.set(pose.x, pose.y + SLOPE * origin, -(pose.distance - origin));
  target.rotation.set(0, 0, -pose.roll, 'YXZ');
  target.scale.set(2 * pose.halfWidth, 2 * pose.halfHeight, 2 * pose.halfDepth);
}

/** Throws when a WebGL 2 renderer cannot be created. */
export function createScene(canvas: HTMLCanvasElement, options: SceneOptions): BallRunScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(PALETTE.void);
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(PALETTE.void, 80, 170);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 300);

  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], pools: THREE.InstancedMesh[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  // Per-face light for the block material only (the other box materials ignore vertex
  // colours): the front shows the true colour, the top and sides catch a pink light.
  const faceColors = new Float32Array(72);
  for (let v = 0; v < 24; v++) faceColors.set(FACE_LIGHT[v >> 2], v * 3);
  box.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));
  const sphere = new THREE.SphereGeometry(RADIUS, 32, 20);
  geometries.push(box, sphere);
  const white = new THREE.Color(PALETTE.white);
  const basic = (parameters: THREE.MeshBasicMaterialParameters) => { const m = new THREE.MeshBasicMaterial(parameters); materials.push(m); return m; };
  const pool = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, parent: THREE.Object3D, colored = false) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Colour buffers exist from the start so the shader never recompiles mid-run.
    if (colored) { mesh.setColorAt(0, white); mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage); }
    mesh.frustumCulled = false;
    mesh.count = 0;
    parent.add(mesh);
    pools.push(mesh);
    return mesh;
  };
  // One reusable update range per instanced attribute (Three clears the list after each upload).
  const ranges = new Map<THREE.BufferAttribute, { start: number; count: number }>();
  const upload = (attribute: THREE.BufferAttribute, count: number) => {
    let range = ranges.get(attribute);
    if (!range) ranges.set(attribute, range = { start: 0, count: 0 });
    range.count = count;
    attribute.clearUpdateRanges();
    attribute.updateRanges.push(range);
    attribute.needsUpdate = true;
  };
  /** Shows the first `count` instances and uploads only those. */
  const commit = (mesh: THREE.InstancedMesh, count: number) => {
    mesh.count = count;
    mesh.visible = count > 0;
    if (!count) return;
    upload(mesh.instanceMatrix, count * 16);
    if (mesh.instanceColor) upload(mesh.instanceColor, count * 3);
  };

  // Road, gates and blocks share one group placed relative to the origin.
  const road = new THREE.Group();
  scene.add(road);
  const tiles = pool(box, basic({ color: PALETTE.track }), TILES, road);
  const grid = pool(box, basic({ color: PALETTE.grid }), LINES, road);
  const blocks = pool(box, basic({ color: PALETTE.white, vertexColors: true }), BLOCKS, road, true);
  // Vite removes this branch from production. The same instance transform used
  // as the rendered block is used for its diagnostic wireframe.
  let hitboxes: THREE.InstancedMesh | undefined, hitball: THREE.Mesh | undefined;
  if (import.meta.env.DEV) {
    let enabled = new URLSearchParams(window.location.search).get('hitboxes') === '1';
    try { enabled ||= window.localStorage.getItem('ballrun:hitboxes') === '1'; } catch { /* storage can be unavailable */ }
    if (enabled) {
      const wire = basic({ color: 0x00ff00, wireframe: true, depthTest: false });
      hitboxes = pool(box, wire, BLOCKS, road);
      hitboxes.renderOrder = 100;
      hitball = new THREE.Mesh(sphere, wire);
      hitball.renderOrder = 100;
      scene.add(hitball);
    }
  }
  const cyan = pool(box, basic({ color: PALETTE.boost }), CYAN, road);
  const blockShades = [0xb51cfa, 0xab18f0, 0xbb2cff, 0xa414e6].map(c => new THREE.Color(c));
  // Tunnel walls and their posts are seen side-on, so divide out the side light.
  const sideLit = (hex: number) => { const c = new THREE.Color(hex); c.r /= SIDE_LIGHT[0]; c.g /= SIDE_LIGHT[1]; c.b /= SIDE_LIGHT[2]; return c; };
  const sliderColor = new THREE.Color(PALETTE.sphere), wallColor = sideLit(0xb41edc), postColor = sideLit(0xff5ad9);

  // A pooled city corridor: dark faces behind genuine grid lines, built once.
  const city = new THREE.Group();
  scene.add(city);
  const towerMaterial = basic({ color: PALETTE.tower });
  // Bias the filled faces behind their wire grid to prevent coplanar flicker.
  towerMaterial.polygonOffset = true;
  towerMaterial.polygonOffsetFactor = 1;
  towerMaterial.polygonOffsetUnits = 1;
  const towers = pool(box, towerMaterial, 4 * CITY_COUNT, city);
  // Instances are written from one shared transform. Callers set its position, rotation and scale
  // (or a bar's ends) in place and pass no plain numbers to the helpers: a number passed to a
  // function that is not inlined is boxed on every call, and the road is rebuilt most frames.
  const transform = new THREE.Object3D(), { position, rotation, scale } = transform;
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, -1);
  /** Bar cross-sections (width, height). */
  const laneLine = new THREE.Vector2(LINE_WIDTH, LINE_HEIGHT), centerLine = new THREE.Vector2(CENTER_WIDTH, LINE_HEIGHT),
    archBar = new THREE.Vector2(BAR, BAR), entranceBar = new THREE.Vector2(ENTRANCE_BAR, ENTRANCE_BAR), chevron = new THREE.Vector2(.24, LINE_HEIGHT);
  const place = (mesh: THREE.InstancedMesh, index: number) => {
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  };
  /** A bar of the given cross-section from `from` to `to`; its width stays near-horizontal for road lines. */
  const bar = (mesh: THREE.InstancedMesh, index: number, section: THREE.Vector2) => {
    const length = direction.subVectors(to, from).length();
    position.addVectors(from, to).multiplyScalar(.5);
    transform.quaternion.setFromUnitVectors(forward, direction.divideScalar(length));
    scale.set(section.x, section.y, length + .006);
    place(mesh, index);
  };
  const cityGeometry = new THREE.BufferGeometry();
  {
    // Scoped to this block so the 0.8 MB array can be collected once the attribute has copied it.
    const cityPoints: number[] = [];
    const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => cityPoints.push(ax, ay, az, bx, by, bz);
    let index = 0;
    rotation.set(0, 0, 0, 'YXZ');
    for (const side of SIDES) for (let row = 0; row < 2; row++) for (let i = 0; i < CITY_COUNT; i++) {
      const v = (i + row * 3 + (side > 0 ? 5 : 0)) % CITY_VARIANTS;
      const w = 3 + row, depth = DEPTHS[v], h = HEIGHTS[v] + row * 12, z = 14 - i * CITY_STEP;
      const inner = CITY_INNER + JITTER[v] + row * 4.4, x = side * (inner + w / 2);
      // The base follows the course's slope so the canyon descends with the road.
      const lo = CITY_BASE + SLOPE * z, hi = lo + h;
      position.set(x, lo + h / 2, z);
      scale.set(w, h, depth);
      place(towers, index++);
      // Lines only on the faces seen from the road: the inner face and the near (+z) face.
      const xi = side * inner, xo = side * (inner + w), z0 = z - depth / 2, z1 = z + depth / 2;
      for (let y = lo; y <= hi; y += 1.1) { line(xi, y, z0, xi, y, z1); line(xi, y, z1, xo, y, z1); }
      for (let k = 0; k <= 4; k++) line(xi, lo, z0 + depth * k / 4, xi, hi, z0 + depth * k / 4);
      for (let k = 1; k <= w; k++) line(xi + side * k, lo, z1, xi + side * k, hi, z1);
    }
    commit(towers, index);
    cityGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cityPoints, 3));
  }
  geometries.push(cityGeometry);
  const cityLines = new THREE.LineSegments(cityGeometry, new THREE.LineBasicMaterial({ color: PALETTE.towerLine }));
  materials.push(cityLines.material as THREE.Material);
  city.add(cityLines);

  // Tinted bands make rotation visible while retaining the original Phong colour and light.
  const surface = document.createElement('canvas');
  surface.width = 128; surface.height = 64;
  const ink = surface.getContext('2d')!;
  ink.fillStyle = '#ffffff'; ink.fillRect(0, 0, 128, 64);
  ink.fillStyle = '#9a5aa0'; ink.fillRect(0, 26, 128, 12);
  ink.fillStyle = '#7c4684';
  for (const x of [0, 32, 64, 96, 128]) ink.fillRect(x - 3.5, 0, 7, 64);
  const ballTexture = new THREE.CanvasTexture(surface);
  ballTexture.colorSpace = THREE.SRGBColorSpace;
  const ballMaterial = new THREE.MeshPhongMaterial({ color: PALETTE.sphere, map: ballTexture, specular: 0xc070c0, shininess: 36 });
  materials.push(ballMaterial);
  const ball = new THREE.Mesh(sphere, ballMaterial);
  scene.add(ball);
  // Overhead light gives the soft upper highlight; a dark ground colour gives the deep-purple underside.
  scene.add(new THREE.HemisphereLight(0xff9fe8, 0x0c0014, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(0, 10, .5);
  const rim = new THREE.DirectionalLight(0x9c5aff, 1.2);
  rim.position.set(4, 1, -5);
  scene.add(key, rim);

  // Speed Up trail and the block-death burst: one pooled mesh each, hidden when unused.
  // The cyan trail ties acceleration to the gate, distinct from the magenta ball. Instances
  // have no alpha of their own, so older spheres darken toward the road colour and shrink.
  const trailMaterial = basic({ color: PALETTE.white, transparent: true, depthWrite: false });
  const trail = pool(sphere, trailMaterial, TRAIL, scene, true);
  const burstMaterial = basic({ color: PALETTE.white, transparent: true });
  const burst = pool(box, burstMaterial, BURST, scene, true);
  const burstColors = [new THREE.Color(PALETTE.sphere), new THREE.Color(PALETTE.boost), new THREE.Color(PALETTE.white)];
  const trailColor = new THREE.Color(PALETTE.boost), trailFaded = new THREE.Color(PALETTE.track), tint = new THREE.Color();

  const stats: SceneStats = { calls: 0, geometries: 0, aspect: 1, ballScreenX: .5, ballScreenY: .5 };
  const A = blankSample(), B = blankSample(), M = blankSample(), S = blankSample();
  const pose: ObstaclePose = { x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 };
  const projection = new THREE.Vector3();
  const rollX = new THREE.Vector3(1, 0, 0), rollZ = new THREE.Vector3(0, 0, 1), rollStep = new THREE.Quaternion();
  let rollDistance = NaN, rollPosition = NaN, rollSeed = NaN, rollRun = NaN;
  let builtOrigin = NaN, builtCourse: Course | null = null, disposed = false;
  let gateWalls = 0, yRef = 0, frameElapsed = 0, blockCount = 0;
  let lineCount = 0, cyanCount = 0, course: Course, fovFit = 1;

  // Road ---------------------------------------------------------------------

  /** The track, continued straight back up the slope before the start line. */
  function track(d: number, out: TrackSample): TrackSample {
    course.sample(d, out);
    if (d < 0) out.elevation -= SLOPE * d;
    return out;
  }

  /** Where ground changes between a and b (one of them is in a drop gap). */
  function groundEdge(a: number, b: number): number {
    const groundAtA = track(a, S).ground;
    for (let i = 0; i < 16; i++) {
      const mid = (a + b) / 2;
      if (track(mid, S).ground === groundAtA) a = mid; else b = mid;
    }
    return groundAtA ? a : b;
  }

  function surfaceY(s: TrackSample, x: number): number {
    return s.elevation - (x - s.center) * Math.tan(s.bank) + yRef;
  }

  /** One tile from lo to hi (rolled with the bank, pitched and yawed along the road) plus its lane lines.
   * A and B already hold the track at lo and hi. */
  function piece(lo: number, hi: number, tileIndex: number): void {
    track((lo + hi) / 2, M);
    const length = hi - lo, dc = B.center - A.center, de = B.elevation - A.elevation;
    const yaw = -Math.atan2(dc, length), pitch = Math.atan2(de, Math.hypot(dc, length));
    const nx = Math.sin(M.bank) * TILE_DEPTH / 2, ny = Math.cos(M.bank) * TILE_DEPTH / 2;
    position.set((A.center + B.center) / 2 - nx, (A.elevation + B.elevation) / 2 + yRef - ny, -((lo + hi) / 2 - builtOrigin));
    rotation.set(pitch, yaw, -M.bank, 'YXZ');
    // Width is measured in world x, as are lane lines and contact. Rolling a tile
    // must not shrink its visible width relative to those shared course bounds.
    scale.set(M.width / Math.cos(M.bank), TILE_DEPTH, Math.hypot(dc, de, length) + .01);
    place(tiles, tileIndex);
    // Counted, not for-of, which allocated an iterator per tile.
    for (let k = 0; k < LANES.length; k++) {
      if (lineCount >= LINES) return;
      const lane = LANES[k], ax = A.center + lane * A.width, bx = B.center + lane * B.width;
      from.set(ax, surfaceY(A, ax) + LIFT, -(lo - builtOrigin));
      to.set(bx, surfaceY(B, bx) + LIFT, -(hi - builtOrigin));
      bar(grid, lineCount++, lane === 0 ? centerLine : laneLine);
    }
  }

  function crossLine(d: number): void {
    track(d, S);
    if (!S.ground || lineCount >= LINES) return;
    track(d + .5, M);
    position.set(S.center, S.elevation + yRef + LIFT, -(d - builtOrigin));
    rotation.set(Math.atan(S.gradient), -Math.atan2(M.center - S.center, .5), -S.bank, 'YXZ');
    scale.set(S.width + LINE_WIDTH, LINE_HEIGHT, CROSS_WIDTH);
    place(grid, lineCount++);
  }

  /** Adds the transform as one piece of a gate's walls, in `color` (they share the block mesh). */
  function gatePiece(color: THREE.Color): void {
    if (gateWalls >= BLOCKS) return;
    place(blocks, gateWalls);
    blocks.setColorAt(gateWalls++, color);
  }

  /** A boost gate: magenta walls with pink posts, a lavender arch ring every RING metres,
   * a heavier cyan entrance ring and cyan chevrons on the road. Its loops are counted, not
   * for-of, which allocated an iterator per loop on every rebuild. */
  function arch(gate: Gate): void {
    track((gate.start + gate.end) / 2, M);
    const c = M.center, edge = M.width / 2, radius = edge + ENTRANCE_BAR / 2, length = gate.end - gate.start;
    const e0 = track(gate.start, A).elevation + yRef, e1 = track(gate.end, B).elevation + yRef;
    const z0 = -(gate.start - builtOrigin), z1 = -(gate.end - builtOrigin), pitch = Math.atan2(e1 - e0, length);
    for (let side = -1; side <= 1; side += 2) {
      rotation.set(pitch, 0, 0, 'YXZ');
      position.set(c + side * (edge + .05), (e0 + e1) / 2 + WALL / 2, (z0 + z1) / 2);
      scale.set(.1, WALL, length);
      gatePiece(wallColor);
      // Pink rails along the top and middle of the wall.
      for (let r = 0; r < RAILS.length; r++) {
        position.set(c + side * (edge + BAR / 2), (e0 + e1) / 2 + RAILS[r], (z0 + z1) / 2);
        scale.set(BAR, BAR, length);
        gatePiece(postColor);
      }
    }
    for (let k = 0; k * RING <= length + 1e-6; k++) {
      const d = gate.start + k * RING, y = track(d, S).elevation + yRef, z = -(d - builtOrigin), entrance = k === 0;
      for (let side = -1; side <= 1; side += 2) {
        if (entrance) {
          if (cyanCount >= CYAN) continue;
          from.set(c + side * radius, y, z);
          to.set(c + side * radius, y + WALL, z);
          bar(cyan, cyanCount++, entranceBar);
        } else {
          rotation.set(0, 0, 0, 'YXZ');
          position.set(c + side * (edge + BAR / 2), y + WALL / 2, z);
          scale.set(BAR, WALL, BAR);
          gatePiece(postColor);
        }
      }
      if (entrance ? cyanCount + ARCH > CYAN : lineCount + ARCH > LINES) continue;
      const mesh = entrance ? cyan : grid, section = entrance ? entranceBar : archBar;
      for (let j = 0; j < ARCH; j++) {
        const a0 = Math.PI * j / ARCH, a1 = Math.PI * (j + 1) / ARCH;
        from.set(c + radius * Math.cos(a0), y + WALL + radius * Math.sin(a0), z);
        to.set(c + radius * Math.cos(a1), y + WALL + radius * Math.sin(a1), z);
        bar(mesh, entrance ? cyanCount++ : lineCount++, section);
      }
    }
    // Long bars over the arch.
    for (let j = 1; j < ARCH && lineCount < LINES; j++) {
      const a = Math.PI * j / ARCH, x = c + radius * Math.cos(a), h = WALL + radius * Math.sin(a);
      from.set(x, e0 + h, z0);
      to.set(x, e1 + h, z1);
      bar(grid, lineCount++, archBar);
    }
    // Cyan chevrons pointing forward along the road: arms at d, tip 1.1 m further on.
    const arm = Math.min(.4 * M.width, 1.5);
    for (let d = gate.start + 5; d < gate.end - 2 && cyanCount + 2 <= CYAN; d += 2.8) {
      const ya = track(d, S).elevation + yRef + LIFT * 1.5, yb = track(d + 1.1, S).elevation + yRef + LIFT * 1.5;
      for (let side = -1; side <= 1; side += 2) {
        from.set(c + side * arm, ya, -(d - builtOrigin));
        to.set(c, yb, -(d + 1.1 - builtOrigin));
        bar(cyan, cyanCount++, chevron);
      }
    }
  }

  function build(origin: number, range: number): void {
    builtOrigin = origin;
    builtCourse = course;
    yRef = SLOPE * origin;
    lineCount = 0;
    cyanCount = 0;
    gateWalls = 0;
    let tileCount = 0;
    const start = origin - BEHIND, end = origin + range;
    // Tiles: 0.5 m near the ball, 1 m from 60 m, 2 m from 140 m; each step is aligned
    // to absolute distance so the far road never swims.
    for (let a = start; a < end && tileCount < TILES;) {
      const ahead = a - origin, step = ahead < 60 ? .5 : ahead < 140 ? 1 : 2;
      const b = (Math.floor(a / step + 1e-6) + 1) * step;
      const groundA = track(a, A).ground, groundB = track(b, B).ground;
      // Nothing is drawn in a drop gap: clip the tile to the ground side of an edge.
      if (groundA && groundB) piece(a, b, tileCount++);
      else if (groundA) { const edge = groundEdge(a, b); if (edge - a > .01) { track(edge, B); piece(a, edge, tileCount++); } }
      else if (groundB) { const edge = groundEdge(a, b); if (b - edge > .01) { track(edge, A); piece(edge, b, tileCount++); } }
      a = b;
    }
    for (let d = Math.ceil(start / 2) * 2; d < end; d += 2) crossLine(d);
    course.forEachGate(Math.max(0, start), end, arch);
    commit(tiles, tileCount);
    commit(grid, lineCount);
    commit(cyan, cyanCount);
  }

  // Per frame ---------------------------------------------------------------

  function placeBlock(o: Obstacle): void {
    if (blockCount >= BLOCKS) return;
    course.pose(o, frameElapsed, pose);
    setObstacleTransform(transform, pose, builtOrigin);
    place(blocks, blockCount);
    blocks.setColorAt(blockCount++, o.kind === 'slider' ? sliderColor : blockShades[o.id % blockShades.length]);
  }

  let debugCount = 0;
  function placeHitbox(o: Obstacle): void {
    if (!hitboxes || debugCount >= BLOCKS) return;
    course.pose(o, frameElapsed, pose);
    setObstacleTransform(transform, pose, builtOrigin);
    place(hitboxes, debugCount++);
  }

  // Trail history: past ball positions every 0.5 m of travel, newest last.
  const history = new Float64Array(TRAIL * 3);
  let historyCount = 0, historyHead = 0, historySeed = NaN, historyRun = NaN, lastD = NaN, lastX = 0, lastH = 0;
  function record(run: Run, x: number): void {
    if (run.seed !== historySeed || run.run !== historyRun || !(run.distance >= lastD) || run.distance - lastD > 40) {
      historySeed = run.seed; historyRun = run.run; historyCount = 0; historyHead = 0;
      lastD = run.distance; lastX = x; lastH = run.height;
      return;
    }
    const span = run.distance - lastD;
    for (let s = Math.floor(lastD * 2) / 2 + .5; s <= run.distance; s += .5) {
      const f = span > 0 ? (s - lastD) / span : 1;
      history[historyHead * 3] = s;
      history[historyHead * 3 + 1] = lastX + (x - lastX) * f;
      history[historyHead * 3 + 2] = lastH + (run.height - lastH) * f;
      historyHead = (historyHead + 1) % TRAIL;
      historyCount = Math.min(TRAIL, historyCount + 1);
    }
    lastD = run.distance; lastX = x; lastH = run.height;
  }

  function drawTrail(run: Run, reduced: boolean): void {
    const n = run.phase === 'running' && run.speedUpTime > 0 ? historyCount : 0;
    const far = reduced ? TRAIL_FAR_REDUCED : TRAIL_FAR, lift = SLOPE * run.distance, up = CAMERA_UP - RADIUS, ballRange = Math.hypot(CAMERA_BACK, up);
    trailMaterial.opacity = TRAIL_OPACITY * clamp(run.speedUpTime / .35, 0, 1);
    let shown = 0;
    // Newest first, so z (metres behind the ball) only grows.
    for (let i = 0; i < n; i++) {
      const slot = ((historyHead - 1 - i) % TRAIL + TRAIL) % TRAIL, z = run.distance - history[slot * 3];
      if (z < TRAIL_NEAR) continue;
      if (z > far) break;
      // Age follows distance along the trail, so spheres darken and shrink smoothly to
      // nothing at its end (they never become road-coloured dots over the lane lines).
      const age = (z - TRAIL_NEAR) / (far - TRAIL_NEAR);
      // Shrinks on screen too: samples nearer the camera are scaled down by their distance.
      const size = (.42 - .32 * age) * Math.min(1, 4 * (1 - age)) * clamp(Math.hypot(CAMERA_BACK - z, up) / ballRange, 0, 1);
      position.set(history[slot * 3 + 1], history[slot * 3 + 2] + lift, z);
      rotation.set(0, 0, 0, 'YXZ');
      scale.setScalar(size);
      place(trail, shown);
      trail.setColorAt(shown++, tint.copy(trailColor).lerp(trailFaded, .6 * age));
    }
    commit(trail, shown);
  }

  /** Fragments are an analytic function of dyingTime, seeded by the run, so pause and restore are exact.
   * A thrown fragment comes to rest on the drawn road under its own x and z, which rises toward
   * the camera with the course's slope and follows local gradient and bank (a flat floor at the
   * ball's base let fragments sink into it). It rests on the tops of the lane and cross lines,
   * which stand LIFT above the tiles, so no line cuts it. Reduced-motion fragments do not move,
   * so they need no floor. */
  function drawBurst(run: Run, reduced: boolean): void {
    const t = clamp(run.dyingTime, 0, DYING_DURATION), k = t / DYING_DURATION;
    const show = run.phase === 'dying' && run.reason === 'block' && k < 1;
    const n = show ? reduced ? BURST_REDUCED : BURST : 0;
    const lift = SLOPE * run.distance, bx = run.x, by = run.height + lift, floor = lift + LIFT + LINE_HEIGHT / 2;
    for (let i = 0, seed = run.seed; i < n; i++) {
      const h = i * 10;
      let size = .06 + .1 * unit(seed, h), spin = 0;
      let x = bx + (unit(seed, h + 1) - .5) * RADIUS * 1.4, y = by + (unit(seed, h + 2) - .5) * RADIUS * 1.4, z = (unit(seed, h + 3) - .5) * RADIUS;
      if (!reduced) {
        // Thrown back toward the camera and outward from the block face, under light gravity.
        x += (unit(seed, h + 4) - .5) * 6.5 * t;
        y += (.6 + 4.2 * unit(seed, h + 5)) * t - 4.5 * t * t;
        z += (-.4 + 4.2 * unit(seed, h + 6)) * t;
        spin = (unit(seed, h + 7) - .5) * 14 * t;
        size *= 1 - .45 * k;
        // Under the fragment the road is locally the plane y = y0 + gx·Δx + gz·Δz (render space,
        // +z toward the camera). A cube spun by R (Euler YXZ: spin, 0.7·spin) reaches below that
        // plane by up to size/2 · Σᵢ|(Rᵀw)ᵢ| with w = (gx, −1, gz), so its centre keeps that height.
        track(run.distance - z, S);
        const gx = -Math.tan(S.bank), gz = -S.gradient;
        const sa = Math.sin(spin), ca = Math.cos(spin), sb = Math.sin(.7 * spin), cb = Math.cos(.7 * spin), p = gx * sb + gz * cb;
        const reach = size / 2 * (Math.abs(gx * cb - gz * sb) + Math.abs(sa * p - ca) + Math.abs(ca * p + sa));
        y = Math.max(y, S.elevation + (x - S.center) * gx + floor + reach);
      }
      position.set(x, y, z);
      rotation.set(spin, spin * .7, 0, 'YXZ');
      scale.setScalar(size);
      place(burst, i);
      const hue = unit(seed, h + 8);
      burst.setColorAt(i, burstColors[hue < .45 ? 0 : hue < .8 ? 1 : 2]);
    }
    burstMaterial.opacity = reduced ? 1 - k : k < .55 ? 1 : 1 - (k - .55) / .45;
    commit(burst, n);
  }

  /** Road centre and elevation averaged over `span` metres from `distance + offset`: a box
   * filter over 1 m samples that slides continuously, so a drop's step in elevation
   * moves the camera smoothly instead of snapping it. */
  let windowCenter = 0, windowElevation = 0;
  function roadWindow(distance: number, offset: number, span: number): void {
    const base = Math.floor(distance), f = distance - base;
    let c = 0, e = 0;
    for (let k = 0; k <= span; k++) {
      const w = k === 0 ? 1 - f : k === span ? f : 1;
      if (w <= 0) continue;
      track(base + offset + k, S);
      c += w * S.center;
      e += w * S.elevation;
    }
    windowCenter = c / span;
    windowElevation = e / span;
  }

  function render(view: FrameView): void {
    if (disposed) return;
    const run = view.run, distance = run.distance, reduced = options.reducedMotion();
    const changedCourse = view.course !== builtCourse;
    course = view.course;
    const speed = Number.isFinite(view.speed) ? view.speed : course.speed(distance);
    const origin = Math.floor(distance * 2) / 2, range = Math.min(260, 160 + 1.6 * speed);
    if (origin !== builtOrigin || course !== builtCourse) build(origin, range);
    road.position.set(0, (distance - origin) * SLOPE, distance - origin);
    city.position.set(0, SLOPE * (distance % CITY_PERIOD), distance % CITY_PERIOD);

    frameElapsed = run.elapsed;
    blockCount = gateWalls;
    course.forEachObstacle(origin - BEHIND, origin + range, placeBlock);
    commit(blocks, blockCount);
    if (hitboxes) {
      debugCount = 0;
      // Include the full previous sweep query, even behind the visible road.
      course.forEachObstacle(distance - 62 * .05 - RADIUS - course.maxDepth, distance + RADIUS + course.maxDepth, placeHitbox);
      commit(hitboxes, debugCount);
    }
    if (hitball) hitball.position.set(run.x, run.height + SLOPE * distance, 0);

    const broken = run.reason === 'block' && (run.phase === 'dying' || run.phase === 'over');
    ball.visible = !broken;
    const bx = clamp(run.x, -BALL_LIMIT, BALL_LIMIT);
    ball.position.set(bx, run.height + SLOPE * distance, 0);
    const forward = distance - rollDistance, sideways = bx - rollPosition;
    if (!changedCourse && run.seed === rollSeed && run.run === rollRun && forward >= 0 && forward <= 3 && Math.abs(sideways) <= 3) {
      // The road approaches +z; forward motion takes the top toward -z, sideways toward x.
      rollStep.setFromAxisAngle(rollX, -rollAngle(forward));
      ball.quaternion.premultiply(rollStep);
      rollStep.setFromAxisAngle(rollZ, -rollAngle(sideways));
      ball.quaternion.premultiply(rollStep).normalize();
    }
    rollDistance = distance; rollPosition = bx; rollSeed = run.seed; rollRun = run.run;
    record(run, bx);
    drawTrail(run, reduced);
    drawBurst(run, reduced);

    // Chase camera: 3.6 m behind and 1.8 m above the ball's base, following 85 % of its offset
    // from the road centre. It looks at the road 12–29 m ahead, so crests and bends turn the
    // view; high above the road (a drop, a crest at speed) it looks closer, so the view pitches
    // down and shows the height. Off the edge it stays 1.2 m inside the towers and turns to keep
    // the ball where following would have put it; it stops 1.5 m below the road and tilts part
    // way after the falling ball, never past MAX_PITCH. Reduced motion keeps the fixed look-ahead
    // and does not tilt.
    track(distance, S);
    const bank = S.bank, roadCenter = S.center;
    const lift = SLOPE * distance, road0 = S.elevation + lift, ballBase = run.height + lift - RADIUS;
    const base = Math.max(ballBase, road0 - 1.5);
    const idealX = bx - .15 * (bx - roadCenter), followX = clamp(idealX, -CAMERA_LIMIT, CAMERA_LIMIT);
    let above = 0;
    if (!reduced) {
      roadWindow(distance, -2, 6);
      above = Math.max(0, base - windowElevation - lift - .3);
    }
    roadWindow(distance, 12, 17);
    const cy = base + CAMERA_UP, reach = CAMERA_BACK + 20 / (1 + .3 * above);
    let pitch = clamp(Math.atan2(windowElevation + lift + .6 - cy, reach), -MAX_PITCH, .04);
    // Camera height over the ball's centre; reduced motion keeps the grounded sight line.
    const sight = CAMERA_UP - RADIUS, overBall = reduced ? sight : sight + base - ballBase;
    if (!reduced && base > ballBase) pitch = Math.max(-MAX_PITCH, pitch - FALL_TILT * (Math.atan2(overBall, CAMERA_BACK) - Math.atan2(sight, CAMERA_BACK)));
    if (fovFit < 1) {
      // The narrower landscape view tilts so the ball keeps its portrait height on screen.
      const below = Math.atan2(overBall, CAMERA_BACK) + pitch;
      pitch = Math.max(-MAX_PITCH, pitch - (below - Math.atan(fovFit * Math.tan(below))));
    }
    camera.position.set(followX, cy, CAMERA_BACK);
    camera.lookAt(followX + .25 * (windowCenter - roadCenter) + (idealX - followX) * reach / CAMERA_BACK, cy + Math.tan(pitch) * reach, CAMERA_BACK - reach);
    if (!reduced) camera.rotateZ(-.5 * bank);
    const planFov = reduced ? FOV : FOV + FOV_GAIN * clamp((speed - 12) / 50, 0, 1), far = range + 40;
    const fov = fovFit < 1 ? 2 * THREE.MathUtils.RAD2DEG * Math.atan(fovFit * Math.tan(THREE.MathUtils.DEG2RAD * planFov / 2)) : planFov;
    if (camera.fov !== fov || camera.far !== far) { camera.fov = fov; camera.far = far; camera.updateProjectionMatrix(); }
    fog.near = 60 + speed;
    fog.far = 150 + 1.6 * speed;

    renderer.render(scene, camera);
    projection.copy(ball.position).project(camera);
    stats.ballScreenX = (1 + projection.x) / 2;
    stats.ballScreenY = (1 - projection.y) / 2;
    stats.calls = renderer.info.render.calls;
    stats.geometries = renderer.info.memory.geometries;
  }

  function resize(width: number, height: number): void {
    if (disposed || !(width >= 1 && height >= 1)) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 1 (the plan's FOV unchanged) up to aspect 1.15, where the widest 74° vertical is 82° horizontally.
    fovFit = Math.min(1, Math.tan(THREE.MathUtils.DEG2RAD * H_FOV_CAP / 2) / (camera.aspect * Math.tan(THREE.MathUtils.DEG2RAD * (FOV + FOV_GAIN) / 2)));
    camera.updateProjectionMatrix();
    stats.aspect = camera.aspect;
  }

  function reset(): void {
    builtOrigin = NaN;
    builtCourse = null;
    historyCount = 0;
    historySeed = NaN;
    lastD = NaN;
    rollDistance = NaN;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const mesh of pools) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    ballTexture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    scene.clear();
  }

  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  // Every pool is still visible with no instances: one render now uploads every geometry
  // and compiles every material, so the first boost or crash never stalls on a shader
  // compile and the geometry count is the same from the first frame.
  renderer.render(scene, camera);
  return { resize, render, reset, stats, dispose };
}
