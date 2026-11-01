/** Hopway's Three.js renderer, one of two modules (with models.ts) that import `three`. It draws one
 * frame from the shared contract (RunState, PlayerPose, a LaneSource) and keeps only presentation
 * state between frames: the camera focus, the death anchor and the quality tier. Every hazard is
 * drawn from lanes.ts at `state.t`, the same functions collision uses, and every repeated thing is an
 * InstancedMesh with a fixed capacity written straight into its typed arrays, so rendering allocates
 * nothing per frame. Deaths, splashes and the UFO are analytic functions of `state.t − death.t`, so
 * pausing, restoring and replaying are exact.
 *
 * World: 1 unit = 1 tile, x = column, y = up, z = −row (forward is −z). Lanes are drawn across
 * x ∈ [RENDER_X_MIN − 0.5, RENDER_X_MAX + 0.5]; the playable band [BAND_MIN, BAND_MAX] is bright and
 * the zones outside it are darkened. Orthographic camera, pitched 58° and yawed −16° (lanes rise to
 * the right on screen). */
import * as THREE from 'three';
import {
  BAND_MAX, BAND_MIN, COLS, DEATH_TIME, DEATH_TIME_REDUCED, EDGE_COLS, HOP_TIME, IDLE_LIMIT, IDLE_WARN, RENDER_X_MAX, RENDER_X_MIN, SAFE_LAG, SQUASH_TIME,
  TRAIN_PALETTE, VEHICLE_PALETTE, LOG_PALETTE, clamp, lerp,
  type Death, type Dir, type GrassLane, type HopwayScene, type Lane, type LilyLane, type Mover, type Quality, type RailLane, type RiverLane, type RoadLane, type SceneFrame, type SceneStats,
} from './config';
import { forEachMover, laneVelocity, platformAt, railWarning, trainSpan } from './lanes';
import {
  LOG_COLORS, TRAIN_COLORS, VEHICLE_COLORS, beamGeometry, bunnyGeometry, carBodyGeometry, carDetailGeometry, lampGeometry, lilyGeometry, logGeometry, rockGeometry,
  dropShadowGeometry, signalPostGeometry, spotRingGeometry, trainGeometry, treeGeometry, truckGeometry, ufoGeometry, ufoShadowGeometry, unitBoxGeometry,
} from './models';

// Camera ---------------------------------------------------------------------

const PITCH = (58 * Math.PI) / 180, YAW = (-16 * Math.PI) / 180;
const SIN_P = Math.sin(PITCH), COS_P = Math.cos(PITCH);
/** The camera's right axis and its forward axis along the ground, in world x and z. */
const RX = Math.cos(YAW), RZ = -Math.sin(YAW), FX = -Math.sin(YAW), FZ = -Math.cos(YAW);
/** World x ends of the span fitted to a portrait screen, and the player's height share when grounded. */
const SPAN_MIN = -1.5, SPAN_MAX = 9.5, PLAYER_SCREEN = 0.35;
const CAMERA_DIST = 40;
const SHAKE_TIME = 0.25, SHAKE_AMP = 0.12;

/** Screen x (in tiles) of a ground point: the dot product with the camera's right axis. */
const projectX = (x: number, z: number): number => x * RX + z * RZ;

/** The fixed frustum for a viewport. Portrait (width ≤ height): the 11-tile span x ∈ [−1.5, 9.5] of the
 * focus row, projected through the yaw, fills the width exactly. Landscape: `max(36, height / 16)`
 * CSS px per tile. `halfWidth` and `halfHeight` are the frustum's half extents in tiles. Pure. */
export function cameraFit(width: number, height: number): { tilePx: number; halfWidth: number; halfHeight: number } {
  const w = Math.max(1, width), h = Math.max(1, height);
  const tilePx = w <= h ? w / (projectX(SPAN_MAX, 0) - projectX(SPAN_MIN, 0)) : Math.max(36, h / 16);
  return { tilePx, halfWidth: w / tilePx / 2, halfHeight: h / tilePx / 2 };
}

/** Camera smoothing for a frame of `dt` seconds: `1 − 0.9^(dt·60)`. */
export function smoothing(dt: number): number {
  return 1 - Math.pow(0.9, Math.max(0, dt) * 60);
}

/** One smoothing step of the focus row toward `target`. The focus row never moves backward. */
export function stepFocusRow(current: number, target: number, dt: number): number {
  return target > current ? current + (target - current) * smoothing(dt) : current;
}

/** The focus x target `lerp(4, playerX, 0.6)`, clamped so the whole band [−0.5, 8.5] stays on screen at
 * the focus row (a frustum `halfWidth` wide shows `halfWidth / cos(yaw)` tiles each side of the focus).
 * When the band cannot fit, the camera centres on x = 4. */
export function focusXTarget(playerX: number, halfWidth: number): number {
  const visible = halfWidth / RX, lo = BAND_MAX - visible, hi = BAND_MIN + visible;
  return lo <= hi ? clamp(lerp(4, playerX, 0.6), lo, hi) : 4;
}

// Palette --------------------------------------------------------------------

const COLORS: number[] = [];
const reg = (...hex: number[]): number => { const i = COLORS.length; COLORS.push(...hex); return i; };
const C_WHITE = reg(0xffffff), C_GRASS = reg(0x8fd14f, 0x86c946), C_ROAD = reg(0x4b4f58), C_WATER = reg(0x4fc3f7), C_BALLAST = reg(0x8a8478);
const C_DASH = reg(0xf2f2ea), C_KERB = reg(0xc9c9bd), C_SLEEPER = reg(0x7a5236), C_STEEL = reg(0xb9c2cc), C_FOAM = reg(0xc9f1ff), C_RIPPLE = reg(0xa6e6ff);
const C_DIRT = reg(0xa57a52), C_FLOWER = reg(0xfff4dc, 0xffb3c7, 0xffd461);
const C_VEHICLE = reg(...VEHICLE_COLORS), C_TRAIN = reg(...TRAIN_COLORS), C_LOG = reg(...LOG_COLORS);
const C_LAMP_ON = reg(0xff2a2a), C_LAMP_OFF = reg(0x4a1a22), C_SPLASH = reg(0xffffff, 0xbfeaff), C_FLUFF = reg(0xfff4dc, 0xffffff);
/** Linear RGB triples, indexed by the constants above (times 3). */
const PAL = (() => {
  const out = new Float32Array(COLORS.length * 3), c = new THREE.Color();
  COLORS.forEach((hex, i) => { c.set(hex); out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; });
  return out;
})();

/** Lane colour multiplier for the zones outside the band, and for decor standing in them. */
const DARK = 0.65, EDGE_SHADE = 0.88;
/** The darker zones either side of the band run out to the render span's edges, so no view (even one following a player
 * swept to the band's edge on a wide screen) reaches the end of a lane. */
const LEFT_ZONE_W = BAND_MIN - (RENDER_X_MIN - 0.5), LEFT_ZONE_X = (RENDER_X_MIN - 0.5 + BAND_MIN) / 2;
const RIGHT_ZONE_W = RENDER_X_MAX + 0.5 - BAND_MAX, RIGHT_ZONE_X = (BAND_MAX + RENDER_X_MAX + 0.5) / 2;
const CLEAR_COLOR = 0x27342c;

// Geometry constants -----------------------------------------------------------

const WATER_Y = -0.3, LOG_TOP = 0.05, PAD_TOP = -0.22, LOG_BASE = -0.32, PAD_BASE = -0.29, TRAIN_Y = 0.09;
const NOSE_LEN = 2, CARRIAGE_LEN = 2;
/** x range, beyond the visible window, in which objects are still placed (tiles). */
const MARGIN = 2;
const MAX_ROWS = 64;
const YAWS: Readonly<Record<Dir, number>> = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
/** Unit vectors for each direction in world x and z (forward is −z). */
const DIR_X: Readonly<Record<Dir, number>> = { up: 0, down: 0, left: -1, right: 1 };
const DIR_Z: Readonly<Record<Dir, number>> = { up: -1, down: 1, left: 0, right: 0 };

// Light: from the upper left and the front, so the faces the camera sees (top, front, left) are lit.
const SUN_X = -0.42, SUN_Y = 0.8, SUN_Z = 0.62;
const SUN_LEN = Math.hypot(SUN_X, SUN_Y, SUN_Z);
const SUN_DIR = { x: SUN_X / SUN_LEN, y: SUN_Y / SUN_LEN, z: SUN_Z / SUN_LEN };
/** The shadow camera's right and up axes (horizontal right, and up in its image plane), for texel snapping. */
const SHADOW_RIGHT_LEN = Math.hypot(SUN_DIR.x, SUN_DIR.z);
const SR = { x: SUN_DIR.z / SHADOW_RIGHT_LEN, z: -SUN_DIR.x / SHADOW_RIGHT_LEN };
const SU = { x: SUN_DIR.y * SR.z, y: SUN_DIR.z * SR.x - SUN_DIR.x * SR.z, z: -SUN_DIR.y * SR.x };
const SHADOW_DIST = 40, SHADOW_MAP = 1024, SHADOW_MAX_RADIUS = 28, SHADOW_PAD = 2.5;

const ease = { out: (k: number): number => 1 - (1 - k) * (1 - k) * (1 - k), in: (k: number): number => k * k * k };

/** Deterministic 30-bit integer from two integers (the flowers, ripples, rock turns and edge variants).
 * Callers slice bit fields from it; staying in small-integer range keeps it from allocating. */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) & 0x3fffffff;
}

/** Height of the surface a thing at x stands on in a lane at time t: a log top, a pad top or the water. */
function surfaceAt(lane: Lane, x: number, t: number): number {
  if (lane.kind === 'river') return platformAt(lane, x, t) ? LOG_TOP : WATER_Y;
  if (lane.kind === 'lily') return platformAt(lane, x, t) ? PAD_TOP : WATER_Y;
  return 0;
}

const isWater = (lane: Lane): boolean => lane.kind === 'river' || lane.kind === 'lily';

/** A fixed-capacity InstancedMesh whose matrices and colours are written straight into its typed
 * arrays: translation, per-axis scale and a yaw about y, with a palette colour times a brightness. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  private readonly m: Float32Array;
  private readonly c: Float32Array;
  private readonly rm = { start: 0, count: 0 };
  private readonly rc = { start: 0, count: 0 };

  constructor(readonly cap: number, geometry: THREE.BufferGeometry, material: THREE.Material, cast: boolean, receive: boolean) {
    const mesh = new THREE.InstancedMesh(geometry, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The colour buffer exists from the start so every program is compiled with instance colours.
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.count = 0;
    this.mesh = mesh;
    this.m = mesh.instanceMatrix.array as Float32Array;
    this.c = mesh.instanceColor.array as Float32Array;
    keepRange(mesh.instanceMatrix, this.rm);
    keepRange(mesh.instanceColor, this.rc);
  }

  begin(): void { this.n = 0; }

  /** Adds an instance (dropped silently when full): position of the base centre, scale along its own
   * axes, a yaw, and palette entry `pi` (see PAL) times brightness `k`. */
  put(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pi: number, k: number): void {
    const n = this.n;
    if (n >= this.cap) return;
    const m = this.m, o = n * 16;
    let c = 1, s = 0;
    if (yaw !== 0) { c = Math.cos(yaw); s = Math.sin(yaw); }
    m[o] = sx * c; m[o + 1] = 0; m[o + 2] = -sx * s; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = sz * s; m[o + 9] = 0; m[o + 10] = sz * c; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    const q = n * 3, p = pi * 3;
    this.c[q] = PAL[p] * k; this.c[q + 1] = PAL[p + 1] * k; this.c[q + 2] = PAL[p + 2] * k;
    this.n = n + 1;
  }

  /** Adds an instance with a ready-made matrix (the player and the UFO turn and tumble freely). */
  putMatrix(matrix: THREE.Matrix4, pi: number, k: number): void {
    const n = this.n;
    if (n >= this.cap) return;
    matrix.toArray(this.m, n * 16);
    const q = n * 3, p = pi * 3;
    this.c[q] = PAL[p] * k; this.c[q + 1] = PAL[p + 1] * k; this.c[q + 2] = PAL[p + 2] * k;
    this.n = n + 1;
  }

  /** Shows the first `n` instances and uploads only those. */
  commit(): void {
    const mesh = this.mesh, n = this.n;
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    this.rm.count = n * 16;
    this.rc.count = n * 3;
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

/** Gives an attribute one update range for good, so an upload sends only the first `count` values (the
 * caller resizes the range each frame). Three empties the range list after every upload, which frees
 * and reallocates the list's storage each frame, so `clearUpdateRanges` is made a no-op here. */
function keepRange(attribute: THREE.BufferAttribute, range: { start: number; count: number }): void {
  attribute.updateRanges.push(range);
  attribute.clearUpdateRanges = (): void => { /* the range stays */ };
}

/** Throws when a WebGL renderer cannot be created. */
export function createScene(canvas: HTMLCanvasElement, options: { quality?: Quality } = {}): HopwayScene {
  const dpr = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, powerPreference: 'high-performance' });
  renderer.setClearColor(CLEAR_COLOR);
  renderer.shadowMap.type = THREE.BasicShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2 * CAMERA_DIST + 10);
  // The orientation never changes: look at the origin once, then only move the camera.
  camera.position.set(-FX * COS_P * CAMERA_DIST, SIN_P * CAMERA_DIST, -FZ * COS_P * CAMERA_DIST);
  camera.lookAt(0, 0, 0);

  const hemisphere = new THREE.HemisphereLight(0xe6f6ff, 0x6f9a55, 2.3);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.8);
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SHADOW_DIST * 2;
  scene.add(hemisphere, sun, sun.target);

  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], pools: Pool[] = [], litMaterials: THREE.Material[] = [];
  const geo = (g: THREE.BufferGeometry): THREE.BufferGeometry => { geometries.push(g); return g; };
  const mat = <M extends THREE.Material>(m: M, lit = false): M => { materials.push(m); if (lit) litMaterials.push(m); return m; };
  const pool = (geometry: THREE.BufferGeometry, material: THREE.Material, cap: number, cast = false, receive = false, order = 0): Pool => {
    const p = new Pool(cap, geometry, material, cast, receive);
    p.mesh.renderOrder = order;
    scene.add(p.mesh);
    pools.push(p);
    return p;
  };

  const lit = mat(new THREE.MeshLambertMaterial({ vertexColors: true }), true);
  const playerMaterial = mat(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true }), true);
  const unlit = mat(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const haloMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  const blobMaterial = mat(new THREE.MeshBasicMaterial({ color: 0x0b140e, transparent: true, opacity: 0.26, depthWrite: false }));
  // Transparent double-sided materials are single pass: three would otherwise draw them twice (back faces,
  // then front) and rebuild their program every frame.
  const beamMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const spotMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const shadeMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const dropMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));

  const box = geo(unitBoxGeometry());
  const train = trainGeometry(), car = [carBodyGeometry(), carDetailGeometry()], trucks = [truckGeometry(2), truckGeometry(3)];
  for (const g of [...car, train.nose.body, train.nose.detail, train.carriage.body, train.carriage.detail, ...trucks.flatMap(t => [t.body, t.detail])]) geo(g);

  // Pools: ground details first, then objects (casters), then the effects drawn last.
  const ground = pool(box, lit, 2600, false, true);
  const trees = [0, 1, 2].map(v => pool(geo(treeGeometry(v)), lit, 320, true));
  const rocks = [0, 1, 2].map(v => pool(geo(rockGeometry(v)), lit, 160, true));
  const carBody = pool(car[0], lit, 160, true), carDetail = pool(car[1], lit, 160);
  const truckBody = trucks.map(t => pool(t.body, lit, 96, true)), truckDetail = trucks.map(t => pool(t.detail, lit, 96, true));
  const noseBody = pool(train.nose.body, lit, 16, true), noseDetail = pool(train.nose.detail, lit, 16);
  const carriageBody = pool(train.carriage.body, lit, 96, true), carriageDetail = pool(train.carriage.detail, lit, 96);
  const logs = ([2, 3, 4] as const).map(len => pool(geo(logGeometry(len)), lit, 192, true));
  const lilies = pool(geo(lilyGeometry()), lit, 160);
  const posts = pool(geo(signalPostGeometry()), lit, 48, true);
  const lampGeo = geo(lampGeometry());
  const lamps = pool(lampGeo, unlit, 48), halos = pool(lampGeo, haloMaterial, 48, false, false, 4);
  const fx = pool(box, unlit, 96);
  const blobs = pool(box, blobMaterial, 640, false, false, 1);

  // The bunny and the UFO are one-instance pools, so every shadow caster is instanced and the shared
  // depth material never switches program between instanced and plain meshes.
  const playerPool = pool(geo(bunnyGeometry()), playerMaterial, 1, true);
  const ufoPool = pool(geo(ufoGeometry()), lit, 1, true);
  const beam = new THREE.Mesh(geo(beamGeometry()), beamMaterial);
  const spot = new THREE.Mesh(geo(spotRingGeometry()), spotMaterial);
  const shade = new THREE.Mesh(geo(ufoShadowGeometry()), shadeMaterial);
  // The soft ellipse on the ground under the bunny, in both quality tiers.
  const drop = new THREE.Mesh(geo(dropShadowGeometry()), dropMaterial);
  drop.renderOrder = 1;
  beam.renderOrder = 5;
  spot.renderOrder = 3;
  shade.renderOrder = 2;
  for (const m of [beam, spot, shade, drop]) { m.frustumCulled = false; scene.add(m); }

  // State ----------------------------------------------------------------------

  const stats: SceneStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, quality: options.quality ?? 'high' };
  let quality: Quality = stats.quality, low = quality === 'low';
  let disposed = false, fit = cameraFit(1, 1);
  /** Smoothed focus (row and x), the look-at point on the ground, and the shake offset. */
  let snap = true, focusRow = 0, focusX = 4, lookX = 4, lookZ = 0, shakeX = 0, shakeY = 0;
  let rowLo = 0, rowHi = 0;
  /** The frame being drawn. */
  let now = 0, anim = 0, reduced = false, colorBlind = false;
  /** The row being drawn: its z and the world x window that can be on screen. */
  let curZ = 0, winLo = 0, winHi = 0, curDir = 1;
  let curRoad = null as unknown as RoadLane;
  /** The death being shown: its time, the captured anchor and the surface under it. */
  let deathT = NaN, anchorX = 0, anchorZ = 0, anchorY = 0, anchorYaw = 0, anchorDrop = 0, groundY = 0, dropY = 0;
  /** The player's computed transform for this frame. */
  let pX = 0, pY = 0, pZ = 0, pSX = 1, pSY = 1, pSZ = 1, pYaw = 0, pRoll = 0, pTumbleZ = false, pAlpha = 1, pShow = true;
  /** The UFO's transform for this frame. */
  let uShow = false, uX = 0, uY = 0, uZ = 0, uSpin = 0;
  const span = { x0: 0, x1: 0 };
  const proxy = new THREE.Object3D();
  const qYaw = new THREE.Quaternion(), qTumble = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);

  // Quality ---------------------------------------------------------------------

  function applyShadows(on: boolean): void {
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
    for (const m of litMaterials) m.needsUpdate = true;
    if (!on && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }

  function applyPixelRatio(): void {
    renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  }

  function setQuality(next: Quality): void {
    if (disposed || next === quality) return;
    quality = next;
    low = next === 'low';
    stats.quality = next;
    applyShadows(!low);
    applyPixelRatio();
  }

  // Layout ------------------------------------------------------------------------

  /** Fits the shadow camera to the visible ground: a square around the view, snapped to texels. */
  function fitShadow(): void {
    const reach = Math.hypot(fit.halfWidth, fit.halfHeight / SIN_P) + SHADOW_PAD;
    const r = Math.min(reach, SHADOW_MAX_RADIUS), cam = sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.updateProjectionMatrix();
  }

  function resize(w: number, h: number): void {
    if (disposed || !(w >= 1 && h >= 1)) return;
    renderer.setSize(w, h, false);
    fit = cameraFit(w, h);
    camera.left = -fit.halfWidth; camera.right = fit.halfWidth; camera.top = fit.halfHeight; camera.bottom = -fit.halfHeight;
    camera.updateProjectionMatrix();
    fitShadow();
  }

  /** Moves the focus toward the player (never backward), places the camera and finds the rows on screen. */
  function aim(frame: SceneFrame): void {
    const state = frame.state, pose = frame.pose;
    const targetRow = Math.max(pose.z, state.safeLine + SAFE_LAG), targetX = focusXTarget(pose.x, fit.halfWidth);
    if (snap) { focusRow = targetRow; focusX = targetX; snap = false; } else {
      focusRow = stepFocusRow(focusRow, targetRow, frame.dt);
      focusX += (targetX - focusX) * smoothing(frame.dt);
    }
    // Shake: a short decaying wobble on car and train deaths, never under reduced motion.
    shakeX = 0; shakeY = 0;
    const death = state.death;
    if (!reduced && death !== null && (death.cause === 'car' || death.cause === 'train')) {
      const age = state.t - death.t;
      if (age >= 0 && age < SHAKE_TIME) {
        const a = SHAKE_AMP * (1 - age / SHAKE_TIME) * (1 - age / SHAKE_TIME);
        shakeX = a * Math.sin(age * 90); shakeY = a * Math.cos(age * 73 + 1.3);
      }
    }
    // The look-at point sits ahead of the focus along the camera's ground axis, so the player is 35% up.
    const ahead = ((0.5 - PLAYER_SCREEN) * 2 * fit.halfHeight) / SIN_P, back = shakeY / SIN_P;
    lookX = focusX + FX * (ahead + back) + RX * shakeX;
    lookZ = -focusRow + FZ * (ahead + back) + RZ * shakeX;
    camera.position.set(lookX - FX * COS_P * CAMERA_DIST, SIN_P * CAMERA_DIST, lookZ - FZ * COS_P * CAMERA_DIST);
    // Every row whose strip can touch the screen, plus one each side.
    const zr = fit.halfWidth * RZ + (fit.halfHeight / SIN_P) * -FZ;
    rowLo = Math.ceil(-0.5 - (lookZ + zr)) - 1;
    rowHi = Math.floor(0.5 - (lookZ - zr)) + 1;
    if (rowHi - rowLo >= MAX_ROWS) rowHi = rowLo + MAX_ROWS - 1;
    // The sun follows the view, snapped to shadow texels so edges do not crawl.
    const texel = (2 * sun.shadow.camera.right) / SHADOW_MAP;
    const a = lookX * SR.x + lookZ * SR.z, b = lookX * SU.x + lookZ * SU.z;
    const da = Math.round(a / texel) * texel - a, db = Math.round(b / texel) * texel - b;
    const sx = lookX + SR.x * da + SU.x * db, sy = SU.y * db, sz = lookZ + SR.z * da + SU.z * db;
    sun.target.position.set(sx, sy, sz);
    sun.position.set(sx + SUN_DIR.x * SHADOW_DIST, sy + SUN_DIR.y * SHADOW_DIST, sz + SUN_DIR.z * SHADOW_DIST);
  }

  /** Sets the row being drawn and the x window of objects that can be on screen on it. */
  function windowFor(row: number): void {
    curZ = -row;
    const off = (curZ - lookZ) * RZ;
    winLo = lookX + (-fit.halfWidth - off) / RX - MARGIN;
    winHi = lookX + (fit.halfWidth - off) / RX + MARGIN;
  }

  // Lane drawing --------------------------------------------------------------------

  /** A band across the whole lane: three boxes so the zones outside the band are darker. */
  function band(ci: number, y: number, h: number, zc: number, depth: number): void {
    ground.put(LEFT_ZONE_X, y, zc, LEFT_ZONE_W, h, depth, 0, ci, DARK);
    ground.put((BAND_MIN + BAND_MAX) / 2, y, zc, BAND_MAX - BAND_MIN, h, depth, 0, ci, 1);
    ground.put(RIGHT_ZONE_X, y, zc, RIGHT_ZONE_W, h, depth, 0, ci, DARK);
  }

  /** A flat dark square under a thing (low quality): thrown a little to the right and back, like the sun's shadow. */
  function blob(x: number, y: number, z: number, w: number, d: number): void {
    blobs.put(x + 0.1, y + 0.012, z - 0.08, w, 0.02, d, 0, C_WHITE, 1);
  }

  function putTree(x: number, variant: number, k: number): void {
    trees[variant < 0 ? 0 : variant > 2 ? 2 : variant | 0].put(x, 0, curZ, 1, 1, 1, 0, C_WHITE, k);
    if (low) blob(x, 0, curZ, 0.98, 0.96);
  }

  function putRock(x: number, variant: number, row: number, k: number): void {
    const turn = (hash(row, x + 400) & 3) * (Math.PI / 2);
    rocks[variant < 0 ? 0 : variant > 2 ? 2 : variant | 0].put(x, 0, curZ, 1, 1, 1, turn, C_WHITE, k);
    if (low) blob(x, 0, curZ, 0.9, 0.84);
  }

  function drawGrass(lane: GrassLane, row: number): void {
    band(C_GRASS + lane.shade, -0.5, 0.5, curZ, 1);
    for (let c = 0; c < COLS; c++) {
      if (c < winLo || c > winHi) continue;
      const o = lane.obstacles[c];
      if (o === 'tree') putTree(c, lane.variant[c], 1);
      else if (o === 'rock') putRock(c, lane.variant[c], row, 1);
    }
    for (let i = 0; i < lane.edge.length; i++) {
      const o = lane.edge[i];
      if (o === null) continue;
      const x = i < EDGE_COLS ? i - EDGE_COLS : i + 3;
      if (x < winLo || x > winHi || (low && (x < BAND_MIN - 3 || x > BAND_MAX + 3))) continue;
      if (o === 'tree') putTree(x, hash(row, x + 100) % 3, EDGE_SHADE);
      else putRock(x, hash(row, x + 100) % 3, row, EDGE_SHADE);
    }
    if (low) return;
    // Flowers: a hash of (row, x) picks the tiles (about one in seven), their spot and colour; obstacles keep their tile.
    for (let x = Math.max(Math.ceil(winLo), RENDER_X_MIN); x <= winHi && x <= RENDER_X_MAX; x++) {
      const h = hash(row, x);
      if ((h & 1023) >= 150) continue;
      const taken = x >= 0 && x < COLS ? lane.obstacles[x] !== null
        : x < 0 && x >= -EDGE_COLS ? lane.edge[x + EDGE_COLS] !== null
        : x > COLS - 1 && x <= COLS - 1 + EDGE_COLS ? lane.edge[x - 3] !== null : false;
      if (taken) continue;
      const dx = ((h >>> 10) & 255) / 255 - 0.5, dz = ((h >>> 18) & 63) / 63 - 0.5;
      ground.put(x + dx * 0.6, 0, curZ + dz * 0.6, 0.09, 0.1, 0.09, 0, C_FLOWER + ((h >>> 24) % 3), x < BAND_MIN || x > BAND_MAX ? DARK : 1);
    }
  }

  const onVehicle = (x0: number, x1: number, mover: Mover): void => {
    const cx = (x0 + x1) * 0.5, len = x1 - x0, yaw = curDir > 0 ? 0 : Math.PI, tint = C_VEHICLE + (mover.color % VEHICLE_PALETTE);
    if (curRoad.vehicle === 'car') {
      carBody.put(cx, 0, curZ, len, 1, 1, yaw, tint, 1);
      carDetail.put(cx, 0, curZ, len, 1, 1, yaw, C_WHITE, 1);
      if (low) blob(cx, 0, curZ, len + 0.3, 0.92);
    } else {
      const i = len > 2.5 ? 1 : 0, s = len / (i + 2);
      truckBody[i].put(cx, 0, curZ, s, 1, 1, yaw, tint, 1);
      truckDetail[i].put(cx, 0, curZ, s, 1, 1, yaw, C_WHITE, 1);
      if (low) blob(cx, 0, curZ, len + 0.3, 0.98);
    }
  };

  function drawRoad(lane: RoadLane, ahead: Lane, behind: Lane): void {
    band(C_ROAD, -0.5, 0.5, curZ, 1);
    if (ahead.kind === 'road') {
      // White dashes on the boundary between two road rows.
      const zb = curZ - 0.5;
      for (let k = Math.ceil(winLo); k <= winHi; k++) ground.put(k, 0, zb, 0.52, 0.03, 0.1, 0, C_DASH, k < BAND_MIN || k > BAND_MAX ? DARK : 1);
    } else if (ahead.kind !== 'rail') band(C_KERB, 0, 0.055, curZ - 0.43, 0.14);
    if (behind.kind !== 'road' && behind.kind !== 'rail') band(C_KERB, 0, 0.055, curZ + 0.43, 0.14);
    curRoad = lane;
    curDir = lane.dir;
    forEachMover(lane, now, winLo, winHi, onVehicle);
  }

  const onLog = (x0: number, x1: number, mover: Mover): void => {
    const len = x1 - x0, i = len > 3.5 ? 2 : len > 2.5 ? 1 : 0;
    logs[i].put((x0 + x1) * 0.5, LOG_BASE, curZ, len / (i + 2), 1, 1, 0, C_LOG + (mover.color % LOG_PALETTE), 1);
  };

  function drawWater(lane: RiverLane | LilyLane, row: number, ahead: Lane, behind: Lane): void {
    band(C_WATER, WATER_Y - 0.6, 0.6, curZ, 1);
    // Banks: a soil wall under the land ahead with a thin line of foam at its foot, and a thin foam line along the
    // near bank. Kept narrow so the gaps between logs read as open water, not as pale glass.
    if (!isWater(ahead)) {
      band(C_DIRT, WATER_Y - 0.02, 0.319, curZ - 0.498, 0.004);
      band(C_FOAM, WATER_Y, 0.014, curZ - 0.45, 0.1);
    }
    if (!isWater(behind)) band(C_FOAM, WATER_Y, 0.014, curZ + 0.44, 0.12);
    // A few light ripples drifting slowly, repeating every 14 tiles.
    for (let k = 0; k < 3; k++) {
      const h = hash(row, 200 + k), len = 0.5 + 0.7 * ((h >>> 19) & 63) / 63, zz = curZ + (((h >>> 25) & 31) / 31 - 0.5) * 0.52;
      const speed = (0.1 + 0.18 * ((h >>> 10) & 255) / 255) * ((h >>> 18) & 1 ? -1 : 1);
      const at = ((((h & 1023) / 1024) * 14 + speed * anim) % 14 + 14) % 14;
      for (let x = at + Math.ceil((winLo - len - at) / 14) * 14; x <= winHi + len; x += 14)
        ground.put(x, WATER_Y, zz, len, 0.012, 0.07, 0, C_RIPPLE, x < BAND_MIN || x > BAND_MAX ? DARK : 1);
    }
    if (lane.kind === 'river') {
      forEachMover(lane, now, winLo, winHi, onLog);
    } else {
      for (let c = 0; c < COLS; c++) if (lane.pads[c] && c >= winLo && c <= winHi) lilies.put(c, PAD_BASE, curZ, 1, 1, 1, 0, C_WHITE, 1);
    }
  }

  function signal(x: number, on: boolean, lit: boolean): void {
    if (x < winLo || x > winHi) return;
    // Beside the track, on the near edge, so a passing train never clips it.
    const z = curZ + 0.46;
    posts.put(x, 0, z, 1, 1, 1, 0, C_WHITE, 1);
    const s = on ? (lit ? 1.45 : 1) + (colorBlind ? 0.2 : 0) : 0.85;
    lamps.put(x, 1.12, z + 0.1, s, s, s, 0, lit ? C_LAMP_ON : C_LAMP_OFF, 1);
    if (lit) halos.put(x, 1.12, z + 0.12, 2.4, 2.4, 2.4, 0, C_LAMP_ON, 1);
  }

  function drawTrain(lane: RailLane, x0: number, x1: number): void {
    const dir = lane.dir, yaw = dir > 0 ? 0 : Math.PI, tint = C_TRAIN + (lane.color % TRAIN_PALETTE), front = dir > 0 ? x1 : x0;
    const nose = front - (dir * NOSE_LEN) / 2;
    if (nose >= winLo - 2 && nose <= winHi + 2) {
      noseBody.put(nose, TRAIN_Y, curZ, 1, 1, 1, yaw, tint, 1);
      noseDetail.put(nose, TRAIN_Y, curZ, 1, 1, 1, yaw, C_WHITE, 1);
    }
    const bodyLen = x1 - x0 - NOSE_LEN, n = Math.max(1, Math.round(bodyLen / CARRIAGE_LEN)), each = bodyLen / n, sx = each / CARRIAGE_LEN;
    for (let i = 0; i < n; i++) {
      const cc = front - dir * (NOSE_LEN + each * (i + 0.5));
      if (cc < winLo - 2 || cc > winHi + 2) continue;
      carriageBody.put(cc, TRAIN_Y, curZ, sx, 1, 1, yaw, tint, 1);
      carriageDetail.put(cc, TRAIN_Y, curZ, sx, 1, 1, yaw, C_WHITE, 1);
    }
    if (low) blob((x0 + x1) / 2, 0, curZ, x1 - x0 + 0.2, 0.98);
  }

  function drawRail(lane: RailLane): void {
    band(C_BALLAST, -0.5, 0.5, curZ, 1);
    for (let k = Math.ceil(winLo * 2); k <= winHi * 2; k++) {
      const x = k * 0.5;
      ground.put(x, 0, curZ, 0.15, 0.045, 0.88, 0, C_SLEEPER, x < BAND_MIN || x > BAND_MAX ? DARK : 1);
    }
    band(C_STEEL, 0.045, 0.06, curZ - 0.25, 0.07);
    band(C_STEEL, 0.045, 0.06, curZ + 0.25, 0.07);
    const s = trainSpan(lane, now, span);
    if (s !== null) drawTrain(lane, s.x0, s.x1);
    // The warning: the lamp alternates bright and dark at 2.5 Hz (under the three-flashes-a-second photosensitivity limit
    // for saturated red) and swells while it is bright.
    const on = railWarning(lane, now), lit = on && (now * 2.5) % 1 < 0.5;
    signal(-1.2, on, lit);
    signal(9.2, on, lit);
  }

  function drawRow(lane: Lane, row: number, ahead: Lane, behind: Lane): void {
    windowFor(row);
    switch (lane.kind) {
      case 'grass': drawGrass(lane, row); break;
      case 'road': drawRoad(lane, ahead, behind); break;
      case 'river': case 'lily': drawWater(lane, row, ahead, behind); break;
      case 'rail': drawRail(lane); break;
    }
  }

  // Effects ----------------------------------------------------------------------------

  /** A burst of cubes thrown from (x, y, z): an analytic arc of `age`; cubes below `y` are gone. */
  function burst(x: number, y: number, z: number, age: number, count: number, speed: number, lift: number, size: number, seed: number, colorA: number): void {
    const life = 0.7, fade = 1 - age / life;
    if (fade <= 0) return;
    for (let i = 0; i < count; i++) {
      const h = hash(seed, i), a = ((i + ((h & 255) / 255) * 0.7) * Math.PI * 2) / count;
      const v = speed * (0.7 + 0.6 * (((h >>> 8) & 255) / 255)), vy = lift * (0.7 + 0.6 * (((h >>> 16) & 255) / 255));
      const up = y + vy * age - 5.5 * age * age;
      if (up < y - 0.02) continue;
      const s = size * fade;
      fx.put(x + Math.cos(a) * v * age, up, z + Math.sin(a) * v * age, s, s, s, 0, colorA + (i & 1), 1);
    }
  }

  /** A ring of cubes spreading out from (x, y, z) over `dur` seconds, shrinking as it goes. */
  function ringBurst(x: number, y: number, z: number, age: number, count: number, maxRadius: number, size: number, dur: number, colorA: number): void {
    const k = age / dur;
    if (k < 0 || k >= 1) return;
    const r = 0.12 + (maxRadius - 0.12) * ease.out(k), s = size * (1 - k), h = y + 0.04 + 0.12 * Math.sin(Math.PI * k);
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.3) * Math.PI * 2) / count;
      fx.put(x + Math.cos(a) * r, h, z + Math.sin(a) * r, s, s, s, 0, colorA + (i & 1), 1);
    }
  }

  // Player and deaths ------------------------------------------------------------------

  function alive(frame: SceneFrame): void {
    const state = frame.state, pose = frame.pose, world = frame.world, t = state.t, hopping = state.hop >= 0;
    // Hop progress from the state's own clock, so the squash and the surface follow the hop whatever pose.progress means.
    const p = hopping ? clamp(state.hop / HOP_TIME, 0, 1) : 1;
    if (hopping) groundY = lerp(surfaceAt(world.lane(state.fromRow), state.fromX, t - state.hop), surfaceAt(world.lane(state.row), state.x, t), p);
    else groundY = surfaceAt(world.lane(state.row), pose.x, t);
    // The ground ellipse sits just above the surface (above the steel on a rail row).
    dropY = groundY + (world.lane(state.row).kind === 'rail' ? 0.11 : 0.04);
    pX = pose.x; pZ = -pose.z; pY = groundY + pose.lift; pYaw = YAWS[pose.facing];
    if (reduced) return;
    let sy = 1;
    if (hopping) {
      // Squash at take-off, stretch in the air, back to 1 on landing.
      sy = (state.hop < SQUASH_TIME ? lerp(0.8, 1, state.hop / SQUASH_TIME) : 1) + 0.08 * Math.sin(Math.PI * p);
    } else {
      const land = t - state.landedAt, bonk = t - state.bonkAt;
      if (land >= 0 && land < 0.08) sy = 1 - 0.12 * (1 - land / 0.08) * (1 - land / 0.08);
      else if (state.phase !== 'over') sy = 1 + 0.018 * Math.sin(t * 5.5);
      if (bonk >= 0 && bonk < 0.12) {
        // A small nudge toward the blocked tile and back, with a squash.
        const k = Math.sin((Math.PI * bonk) / 0.12);
        pX += DIR_X[state.bonkDir] * 0.15 * k; pZ += DIR_Z[state.bonkDir] * 0.15 * k;
        sy = Math.min(sy, 1 - 0.14 * k);
      }
    }
    pSY = sy;
    pSX = pSZ = 1 / Math.sqrt(sy);
  }

  function dying(frame: SceneFrame, death: Death, age: number): void {
    const total = reduced ? DEATH_TIME_REDUCED : DEATH_TIME, fade = 1 - clamp(age / total, 0, 1), dir = death.dir;
    pX = anchorX; pY = anchorY; pZ = anchorZ; pYaw = anchorYaw;
    switch (death.cause) {
      case 'car': {
        // Flattened and shoved a little way along the car; stays that way.
        const flat = reduced ? 1 : clamp(age / 0.05, 0, 1), slide = reduced ? 0.4 : 0.4 * ease.out(clamp(age / 0.2, 0, 1));
        pX += dir * slide;
        pSY = lerp(1, 0.15, flat); pSX = pSZ = lerp(1, 1.35, flat);
        if (!reduced) burst(anchorX, 0.12, anchorZ, age, 8, 1.4, 1.6, 0.1, 11, C_FLUFF);
        break;
      }
      case 'train': {
        if (reduced) { pAlpha = fade; pShow = age < total; break; }
        // Knocked off: flung along the train with an arc and a tumble, off screen by 0.6 s.
        pX += dir * 24 * age; pY += 9 * age - 12 * age * age; pTumbleZ = true; pRoll = -dir * 22 * age;
        pSX = pSY = pSZ = clamp((0.6 - age) / 0.15, 0, 1);
        pShow = age < 0.6;
        burst(anchorX, 0.15, anchorZ, age, 8, 1.7, 1.8, 0.1, 23, C_FLUFF);
        break;
      }
      case 'water': {
        if (reduced) { pAlpha = fade; pShow = age < total; break; }
        pY -= 1.1 * ease.out(clamp(age / 0.5, 0, 1));
        pRoll = 0.3 * Math.sin(age * 16) * (1 - clamp(age / 0.5, 0, 1)); pTumbleZ = true;
        pShow = age < 0.6;
        ringBurst(anchorX, WATER_Y, anchorZ, age, 12, 1.2, 0.16, 0.55, C_SPLASH);
        ringBurst(anchorX, WATER_Y, anchorZ, age - 0.1, 8, 0.8, 0.13, 0.5, C_SPLASH);
        burst(anchorX, WATER_Y, anchorZ, age, 12, 0.9, 3.3, 0.15, 31, C_SPLASH);
        break;
      }
      case 'swept': {
        if (reduced) { pAlpha = fade; pShow = age < total; break; }
        // Carried along with the log for a moment, tips off its near side and sinks.
        const drift = laneVelocity(frame.world.lane(death.row));
        const off = ease.out(clamp(age / 0.2, 0, 1)), sink = Math.max(0, age - 0.1);
        pX += drift * Math.min(age, 0.45); pZ += 0.62 * off;
        pY -= 9 * sink * sink;
        pRoll = 1.4 * off;
        pShow = age < 0.5;
        if (age > 0.2) {
          ringBurst(pX, WATER_Y, pZ, age - 0.2, 9, 0.8, 0.13, 0.45, C_SPLASH);
          burst(pX, WATER_Y, pZ, age - 0.2, 8, 0.8, 2.6, 0.12, 43, C_SPLASH);
        }
        break;
      }
      default: ufoDeath(age, total);
    }
  }

  /** The UFO takes the bunny: swoop in (0.3 s), beam on and the bunny rises shrinking (0.4 s), then the
   * UFO zips up and away (0.2 s). Under reduced motion it simply hovers with the beam while the bunny fades. */
  function ufoDeath(age: number, total: number): void {
    const hoverX = anchorX, hoverY = anchorY + 2.3, hoverZ = anchorZ - 0.4;
    let ux = hoverX, uy = hoverY, uz = hoverZ, beamK = 1;
    if (reduced) {
      pAlpha = 1 - clamp(age / total, 0, 1);
      pShow = age < total;
      uSpin = 0;
    } else {
      const k = total / DEATH_TIME, swoop = 0.3 * k, rise = 0.7 * k;
      uSpin = age * 5;
      if (age < swoop) {
        const e = ease.out(age / swoop);
        ux = lerp(hoverX + 2.4, hoverX, e); uy = lerp(hoverY + 13, hoverY, e); uz = lerp(hoverZ - 8, hoverZ, e);
        beamK = 0;
      } else if (age < rise) {
        const lift = (age - swoop) / (rise - swoop), e = lift * lift * (3 - 2 * lift);
        beamK = clamp((age - swoop) / 0.08, 0, 1);
        pY = lerp(anchorY, hoverY - 0.6, e);
        pZ = lerp(anchorZ, hoverZ, e);
        pSX = pSY = pSZ = lerp(1, 0.12, e);
        pYaw += lift * 9;
      } else {
        const z = ease.in(clamp((age - rise) / (total - rise), 0, 1));
        ux += 2.5 * z; uy += 16 * z; uz -= 9 * z;
        beamK = clamp(1 - z * 3, 0, 1);
        pShow = false;
      }
    }
    const visible = age < total;
    uShow = visible; uX = ux; uY = uy; uZ = uz;
    beam.visible = visible && beamK > 0;
    beamMaterial.opacity = beamK * 0.85;
    beam.position.set(ux, uy, uz);
    beam.scale.set(1.1, Math.max(0.2, uy - anchorY - 0.02), 1.1);
  }

  function actors(frame: SceneFrame): void {
    const state = frame.state, death = state.death;
    pSX = pSY = pSZ = 1; pRoll = 0; pTumbleZ = false; pAlpha = 1; pShow = true; uShow = false;
    beam.visible = false;
    if (death === null) {
      deathT = NaN;
      alive(frame);
    } else {
      if (death.t !== deathT) {
        // First frame of this death: remember where the bunny was, so the animation is anchored there.
        deathT = death.t;
        alive(frame);
        anchorX = pX; anchorZ = pZ; anchorY = groundY; anchorYaw = pYaw; anchorDrop = dropY;
        pSX = pSY = pSZ = 1;
      }
      dying(frame, death, Math.max(0, state.t - death.t));
    }
    if (pShow) {
      // The bunny's transform: scale, a yaw for its facing, and a world-axis tumble on top for deaths.
      proxy.position.set(pX, pY, pZ);
      proxy.scale.set(pSX, pSY, pSZ);
      qYaw.setFromAxisAngle(axisY, pYaw);
      if (pRoll !== 0) {
        qTumble.setFromAxisAngle(pTumbleZ ? axisZ : axisX, pRoll);
        proxy.quaternion.copy(qTumble).multiply(qYaw);
      } else proxy.quaternion.copy(qYaw);
      proxy.updateMatrix();
      playerPool.putMatrix(proxy.matrix, C_WHITE, 1);
    }
    playerMaterial.opacity = pAlpha;
    playerPool.mesh.castShadow = pAlpha > 0.5;
    if (uShow) {
      proxy.position.set(uX, uY, uZ);
      proxy.scale.set(1, 1, 1);
      proxy.quaternion.setFromAxisAngle(axisY, uSpin);
      proxy.updateMatrix();
      ufoPool.putMatrix(proxy.matrix, C_WHITE, 1);
    }
    // A soft dark ellipse on the ground under the bunny, in both quality tiers: it stays on the surface
    // while the bunny is in the air and shrinks and fades a little with height, so a hop reads even when
    // the real shadow is tiny or off.
    let dropOn = pShow, dropScale = 1, dropAlpha = 1, dropAt = dropY;
    if (death === null) {
      const lift = frame.pose.lift;
      dropScale = 1 - 0.5 * lift;
      dropAlpha = 1 - 0.8 * lift;
    } else if (death.cause === 'car') {
      dropScale = 1.3;
      dropAt = anchorDrop;
    } else if (death.cause === 'ufo-idle' || death.cause === 'ufo-behind') {
      const lift = Math.max(0, pY - anchorY);
      dropScale = Math.max(0.3, 1 - 0.4 * lift);
      dropAlpha = pAlpha * Math.max(0, 1 - lift / 1.6);
      dropAt = anchorDrop;
    } else dropOn = false;
    drop.visible = dropOn && dropAlpha > 0.02;
    dropMaterial.opacity = dropAlpha;
    drop.position.set(pX, dropAt, pZ);
    drop.scale.set(0.6 * dropScale, 1, 0.68 * dropScale);
    // The idle warning: a pulsing pale-yellow ring on the ground and a soft UFO shadow closing in.
    const warn = frame.ufoWarn && death === null;
    spot.visible = warn;
    shade.visible = warn;
    if (warn) {
      const pulse = 1 + 0.2 * (0.5 - 0.5 * Math.cos(now * Math.PI * 4)), idle = clamp((now - state.lastProgress - IDLE_WARN) / (IDLE_LIMIT - IDLE_WARN), 0, 1);
      spot.position.set(pX, groundY + 0.03, pZ);
      spot.scale.setScalar(pulse * 1.3);
      shade.position.set(pX, groundY + 0.02, pZ);
      shade.scale.set(lerp(2.6, 1.05, idle) * 1.15, 1, lerp(2.6, 1.05, idle));
    }
  }

  // Frame -------------------------------------------------------------------------------

  function render(frame: SceneFrame): void {
    if (disposed) return;
    const state = frame.state, world = frame.world;
    now = state.t;
    reduced = frame.reducedMotion;
    colorBlind = frame.colorBlind;
    anim = reduced ? 0 : now;
    aim(frame);
    for (let i = 0; i < pools.length; i++) pools[i].begin();
    let behind = world.lane(rowLo - 1), lane = world.lane(rowLo);
    for (let row = rowLo; row <= rowHi; row++) {
      const ahead = world.lane(row + 1);
      drawRow(lane, row, ahead, behind);
      behind = lane;
      lane = ahead;
    }
    actors(frame);
    for (let i = 0; i < pools.length; i++) pools[i].commit();
    renderer.render(scene, camera);
    const info = renderer.info;
    stats.calls = info.render.calls;
    stats.triangles = info.render.triangles;
    stats.geometries = info.memory.geometries;
    stats.textures = info.memory.textures;
    stats.programs = info.programs ? info.programs.length : 0;
  }

  function reset(): void {
    snap = true;
    deathT = NaN;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const p of pools) p.mesh.dispose();
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    hemisphere.dispose();
    sun.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    scene.clear();
    const info = renderer.info;
    stats.geometries = info.memory.geometries;
    stats.textures = info.memory.textures;
    stats.programs = info.programs ? info.programs.length : 0;
  }

  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  // Every pool is still visible with no instances: render once with shadows and once without so
  // every program (including the shadow depth ones) is compiled now, then settle on the quality.
  applyPixelRatio();
  applyShadows(true);
  renderer.render(scene, camera);
  applyShadows(false);
  renderer.render(scene, camera);
  for (const p of pools) p.mesh.visible = false;
  for (const m of [beam, spot, shade, drop]) m.visible = false;
  applyShadows(!low);
  applyPixelRatio();
  return { resize, render, setQuality, stats, reset, dispose };
}
