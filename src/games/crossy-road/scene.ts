/** CrossyRoad's Three.js renderer, one of two modules (with models.ts) that import `three`. It draws one
 * frame from the shared contract (RunState, PlayerPose, a LaneSource) and keeps only presentation
 * state between frames: the camera focus, the death anchor and the quality tier. Every hazard is
 * drawn from lanes.ts at `state.t`, the same functions collision uses, and every repeated thing is an
 * InstancedMesh with a fixed capacity written straight into its typed arrays, so rendering allocates
 * nothing per frame. Deaths, splashes and the UFO are analytic functions of `state.t − death.t`, so
 * pausing, restoring and replaying are exact.
 *
 * World: x = column, y = up, z = −row × ROW_DEPTH (forward is −z). Lanes are drawn across
 * x ∈ [RENDER_X_MIN − 0.5, RENDER_X_MAX + 0.5]; the playable band [BAND_MIN, BAND_MAX] is bright and
 * the zones outside it are darkened. Orthographic camera, pitched 45° and yawed 20° (lanes fall to
 * the right on screen). */
import * as THREE from 'three';
import {carImpact, ufoFlight} from './motion';
import {obstacleAt, obstacleVariant, lilyAt} from './terrain';
import {
  DEATH_TIME, DEATH_TIME_REDUCED, HOP_TIME, IDLE_LIMIT, IDLE_WARN, SAFE_LAG, SQUASH_TIME,
  LOG_PALETTE, ROW_DEPTH, TRAFFIC_ROW_Z, TRAIN_BASE_Y, TRAIN_SCALE, clamp, lerp,
  type Death, type Dir, type GrassLane, type CrossyRoadScene, type Lane, type LaneSource, type LilyLane, type Mover, type Quality, type RailLane, type RiverLane, type RoadLane, type SceneFrame, type SceneStats,
} from './config';
import { forEachMover, forEachTrain, laneVelocity, moverCopy, platformAt, railWarning, trainCopy } from './lanes';
import {
  CAR_COLORS, CONTAINER_COLORS, LOG_COLORS, TRAIN_COLORS, TRUCK_COLORS, beamGeometry, chickenGeometry, carGeometry, groundBoxGeometry, lampGeometry, lilyGeometry, logGeometry, rockGeometry,
  signalGlowGeometry, signalHaloGeometry, signalPostGeometry, spotRingGeometry, trainGeometry, treeGeometry, truckGeometry, ufoGeometry, ufoShadowGeometry, unitBoxGeometry, mergeVehicle, type VehicleParts,
} from './models';
import {bushGeometry, crystalGeometry, decoratedTreeGeometry, giftsGeometry, lampPostGeometry, logPileGeometry, pineGeometry, snowmanGeometry} from './props';
import {
  CAR_MODELS, FIRE, LOCOS, PLOUGH, PROP, TRUCK_MODELS, WAGONS,
  carLength, carModel, lilyLook, mix, propAt, trainKind, truckModel, wagonAt,
} from './variety';

// Camera ---------------------------------------------------------------------

const PITCH = (45 * Math.PI) / 180, YAW = (20 * Math.PI) / 180;
const SIN_P = Math.sin(PITCH), COS_P = Math.cos(PITCH);
/** The camera's right axis and its forward axis along the ground, in world x and z. */
const RX = Math.cos(YAW), RZ = -Math.sin(YAW), FX = -Math.sin(YAW), FZ = -Math.cos(YAW);
/** Ground-cell framing and the player's height share when grounded. */
/** The whole view is 10% closer than the eight-cell phone and sixteen-unit landscape framing. */
const ZOOM = 1.1, PHONE_CELLS = 8 / ZOOM, PC_HEIGHT_UNITS = 16 / ZOOM, PLAYER_SCREEN = 0.35;
const CAMERA_DIST = 40;
const SHAKE_TIME = 0.25, SHAKE_AMP = 0.12;

/** Phones fit eight cells across. Landscape fits by height, exposing the same 15–17 rows
 * instead of enlarging the whole scene with screen width. The yaw is included in the phone fit. */
export function cameraFit(width: number, height: number): { tilePx: number; halfWidth: number; halfHeight: number } {
  const w = Math.max(1, width), h = Math.max(1, height);
  const tilePx = w <= h ? w / (PHONE_CELLS * RX) : h / PC_HEIGHT_UNITS;
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

/** Forward camera leash. Kept separate from smoothing so auto-scroll does not
 * wait for the safe line to catch a stationary player's row. */
export function focusRowTarget(playerRow: number, safeLine: number, maxRow: number, started: boolean): number {
  return Math.max(playerRow, started ? safeLine + Math.min(SAFE_LAG, maxRow) : 0);
}

/** Follow the player's world x with the existing smooth camera response. */
export function focusXTarget(playerX: number, _halfWidth: number): number {
  return playerX;
}

// Palette --------------------------------------------------------------------

const COLORS: number[] = [];
const reg = (...hex: number[]): number => { const i = COLORS.length; COLORS.push(...hex); return i; };
const C_WHITE = reg(0xffffff), C_GRASS = reg(0xcdd9ea, 0xc4d1e4), C_ROAD = reg(0x424856), C_WATER = reg(0x75e3fc), C_BALLAST = reg(0x343a48);
const C_DASH = reg(0x6b6f83), C_SLEEPER = reg(0x7a5444), C_STEEL = reg(0x5b5d70), C_FOAM = reg(0xfaffff), C_RIPPLE = reg(0xb8f1ff);
const C_WATER_EDGE = reg(0x5ac3fc);
const C_DIRT = reg(0x633642);
/** Winter: snow lying on tracks and the grass, green tufts poking through it, and falling flakes. */
const C_SNOW = reg(0xe6eef8),
  /** The track: a two-step gravel bed with speckles, tie plates, and polished rail heads. */
  C_BED = reg(0x6a6774, 0x7d7a86), C_GRAVEL = reg(0x9c99a6, 0x4a4854), C_PLATE = reg(0x2f303a), C_RAIL_HEAD = reg(0xc3c6d6), C_TUFT = reg(0x7fb24a, 0x6a9e3c), C_FLAKE = reg(0xffffff);
/** Small floor details: mushrooms, cones, pebbles, flowers, manhole covers and reeds. */
const C_CAP = reg(0xd8343c), C_STEM = reg(0xf3ecdc), C_CONE = reg(0x7a4f38), C_PEBBLE = reg(0x8f8ba0, 0x77738a), C_PETAL = reg(0xffffff, 0x9a6fe0, 0xffd84a),
  C_COVER = reg(0x2c303b, 0x5b6070), C_REED = reg(0x9aa35c, 0x7a4b32);
const C_TRUCK = reg(...TRUCK_COLORS), C_FIRE = reg(0xd0202e), C_PLOUGH = reg(0xf08a1c);
const C_CAR = reg(...CAR_COLORS), C_TAXI = reg(0xf4d33e), C_TRAIN = reg(...TRAIN_COLORS), C_CONTAINER = reg(...CONTAINER_COLORS), C_LOG = reg(...LOG_COLORS);
const C_LAMP_ON = reg(0xff2a2a), C_LAMP_OFF = reg(0x3a1218), C_SPLASH = reg(0xffffff, 0xbfeaff), C_FLUFF = reg(0xfff4dc, 0xffffff);
/** Linear RGB triples, indexed by the constants above (times 3). */
const PAL = (() => {
  const out = new Float32Array(COLORS.length * 3), c = new THREE.Color();
  COLORS.forEach((hex, i) => { c.set(hex); out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; });
  return out;
})();

/** Lane colour multiplier for the zones outside the band, and for decor standing in them. */
const DARK = 0.80;
const CLEAR_COLOR = 0x2a3447;

// Geometry constants -----------------------------------------------------------

const WATER_Y = -0.12, LOG_TOP = 0.04, PAD_TOP = -0.072, LOG_BASE = -0.22, PAD_BASE = -0.125, TRAIN_Y = TRAIN_BASE_Y;
/** The drawn length of a locomotive and of a wagon. */
const PIECE_LEN = 2 * TRAIN_SCALE;
/** The track axis in its row: nearer the middle than road traffic, so the larger train stays inside the row. */
const TRACK_Z = 0.2;
/** Half the depth of a car and of a lorry at scale 1, wheels and mirrors included. */
const CAR_HALF = 0.35, TRUCK_HALF = 0.3;
/** How much larger than its model each obstacle stands (width, height), in PROP order: three bare trees, the stump,
 * three boulders, two pines, the Christmas tree, snowman, lamp, bush, log pile, presents and crystal. */
const PROP_SCALE: readonly (readonly [number, number])[] = [
  [1.25, 1.55], [1.25, 1.55], [1.25, 1.55], [1.4, 1.4], [1.25, 1.35], [1.25, 1.35], [1.25, 1.35], [1.3, 1.45], [1.3, 1.45],
  [1.3, 1.45], [1.4, 1.4], [1.35, 1.4], [1.3, 1.3], [1.25, 1.25], [1.3, 1.3], [1.35, 1.5],
];
/** Track layers (tiles): the gravel bed's two steps, sleeper thickness, rail centre lines from the track axis and the
 * rail-head top, which sits just above TRAIN_BASE_Y so bogies ride on the heads. */
const BED_LOW = 0.016, BED_TOP = 0.034, SLEEPER_H = 0.045, RAIL_GAUGE = 0.27, RAIL_TOP = 0.14;
/** The signal's two lamps: offset either side of the post and their height (see signalPostGeometry). */
const SIGNAL_LAMP_X = 0.2, SIGNAL_LAMP_Y = 1.06;
/** x range, beyond the visible window, in which objects are still placed (tiles). */
const MARGIN = 2;
const MAX_ROWS = 64;
// Cache just beyond the existing culling guard so routine camera motion does not
// shift every static instance slot. Animated rows still use the exact view window.
const STATIC_ROWS_AHEAD = 2, STATIC_COLUMNS = 1;
/** Falling snow: flakes per quality tier, and the height of the column they fall through (tiles). */
const FLAKES_HIGH = 220, FLAKES_LOW = 90, SNOW_H = 7;
const YAWS: Readonly<Record<Dir, number>> = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
/** Unit vectors for each direction in world x and z (forward is −z). */
const DIR_X: Readonly<Record<Dir, number>> = { up: 0, down: 0, left: -1, right: 1 };
const DIR_Z: Readonly<Record<Dir, number>> = { up: -1, down: 1, left: 0, right: 0 };

// Light: from the upper left and the front, so the faces the camera sees (top, front, left) are lit.
const SUN_X = -0.85, SUN_Y = 0.9, SUN_Z = 0;
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
  if (lane.kind === 'rail') return BED_TOP;
  return 0;
}

const isWater = (lane: Lane): boolean => lane.kind === 'river' || lane.kind === 'lily';

/** A fixed-capacity InstancedMesh whose matrices and colours are written straight into its typed
 * arrays: translation, per-axis scale and a yaw about y, with a palette colour times a brightness. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly shadow?: THREE.InstancedMesh;
  shadowFloor: number;
  shadowOpacity = 1;
  n = 0;
  cached = false;
  overflow = false;
  private readonly m: Float32Array;
  private readonly c: Float32Array;
  private readonly previous: Float64Array;
  private originX = 0;
  private matrixDirty = false;
  private colorDirty = false;
  private matrixFirst = Infinity;
  private matrixLast = -1;
  private colorFirst = Infinity;
  private colorLast = -1;
  private readonly rm = { start: 0, count: 0 };
  private readonly rc = { start: 0, count: 0 };

  constructor(readonly cap: number, geometry: THREE.BufferGeometry, material: THREE.Material, cast: boolean,
    shadowMaterial: THREE.ShaderMaterial, floor: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.count = 0;
    this.mesh = mesh;
    this.shadowFloor = floor;
    this.m = mesh.instanceMatrix.array as Float32Array;
    this.c = mesh.instanceColor.array as Float32Array;
    this.previous = new Float64Array(cap * 9).fill(NaN);
    keepRange(mesh.instanceMatrix, this.rm);
    keepRange(mesh.instanceColor, this.rc);
    if (cast) {
      // Project the actual voxel triangles in the main pass. One stencil mark
      // unions overlapping faces/casters, so shadows never darken themselves.
      const shadow = new THREE.InstancedMesh(geometry, shadowMaterial, cap);
      shadow.instanceMatrix = mesh.instanceMatrix;
      shadow.frustumCulled = false;
      shadow.matrixAutoUpdate = false;
      shadow.matrixWorldAutoUpdate = false;
      shadow.renderOrder = 1;
      shadow.count = 0;
      shadow.onBeforeRender = () => {
        shadowMaterial.uniforms.uFloor.value = this.shadowFloor;
        shadowMaterial.uniforms.uFade.value = this.shadowOpacity;
        shadowMaterial.uniformsNeedUpdate = true;
      };
      this.shadow = shadow;
    }
  }

  begin(originX = 0): void { this.originX = originX; this.n = 0; this.overflow = false; this.matrixDirty = this.colorDirty = false; this.matrixFirst = this.colorFirst = Infinity; this.matrixLast = this.colorLast = -1; }

  put(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pi: number, k: number): void {
    x -= this.originX;
    const n = this.n;
    if (n >= this.cap) { this.overflow = true; return; }
    const a = n * 9, previous = this.previous;
    if (previous[a] !== x || previous[a+1] !== y || previous[a+2] !== z || previous[a+3] !== sx || previous[a+4] !== sy || previous[a+5] !== sz || previous[a+6] !== yaw) {
      previous[a]=x; previous[a+1]=y; previous[a+2]=z; previous[a+3]=sx; previous[a+4]=sy; previous[a+5]=sz; previous[a+6]=yaw;
      const m = this.m, o = n * 16, c = yaw === 0 ? 1 : Math.cos(yaw), sn = yaw === 0 ? 0 : Math.sin(yaw);
      m[o]=sx*c; m[o+1]=0; m[o+2]=-sx*sn; m[o+3]=0;
      m[o+4]=0; m[o+5]=sy; m[o+6]=0; m[o+7]=0;
      m[o+8]=sz*sn; m[o+9]=0; m[o+10]=sz*c; m[o+11]=0;
      m[o+12]=x; m[o+13]=y; m[o+14]=z; m[o+15]=1;
      this.matrixDirty = true;
      this.matrixFirst=Math.min(this.matrixFirst,n);this.matrixLast=n;
    }
    this.tint(n, pi, k);
    this.n = n + 1;
  }

  private tint(n: number, pi: number, k: number): void {
    const a=n*9, previous=this.previous;
    if(previous[a+7]===pi && previous[a+8]===k)return;
    previous[a+7]=pi; previous[a+8]=k;
    const q=n*3,p=pi*3;
    this.c[q]=PAL[p]*k; this.c[q+1]=PAL[p+1]*k; this.c[q+2]=PAL[p+2]*k;
    this.colorDirty=true;
    this.colorFirst=Math.min(this.colorFirst,n);this.colorLast=n;
  }

  putMatrix(matrix: THREE.Matrix4, pi: number, k: number): void {
    const n=this.n;
    if(n>=this.cap)return;
    const o=n*16, values=matrix.elements;
    for(let i=0;i<16;i++){
      const value=Math.fround(values[i] - (i === 12 ? this.originX : 0));
      if(this.m[o+i]!==value){this.m[o+i]=value;this.matrixDirty=true;this.matrixFirst=Math.min(this.matrixFirst,n);this.matrixLast=n;}
    }
    this.previous[n*9]=NaN;
    this.tint(n,pi,k);
    this.n=n+1;
  }

  commit(full = false): void {
    const mesh=this.mesh,n=this.n;
    mesh.count=n; mesh.visible=n>0;
    if(this.shadow){this.shadow.count=n;this.shadow.visible=n>0&&this.shadowOpacity>0;}
    if(!n)return;
    if(full||this.matrixDirty){this.rm.start=full?0:this.matrixFirst*16;this.rm.count=full?this.cap*16:(this.matrixLast-this.matrixFirst+1)*16;mesh.instanceMatrix.needsUpdate=true;}
    if(full||this.colorDirty){this.rc.start=full?0:this.colorFirst*3;this.rc.count=full?this.cap*3:(this.colorLast-this.colorFirst+1)*3;mesh.instanceColor!.needsUpdate=true;}
  }

  dispose(): void { this.shadow?.dispose(); this.mesh.dispose(); }
}

/** Gives an attribute one update range for good, so an upload sends only the selected values (the
 * caller updates the range each frame). Three empties the range list after every upload, which frees
 * and reallocates the list's storage each frame, so `clearUpdateRanges` is made a no-op here. */
function keepRange(attribute: THREE.BufferAttribute, range: { start: number; count: number }): void {
  attribute.updateRanges.push(range);
  attribute.clearUpdateRanges = (): void => { /* the range stays */ };
}

/** Throws when a WebGL renderer cannot be created. */
export function createScene(canvas: HTMLCanvasElement, options: { quality?: Quality } = {}): CrossyRoadScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setClearColor(CLEAR_COLOR);
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2 * CAMERA_DIST + 10);
  // The orientation never changes: look at the origin once, then only move the camera.
  camera.position.set(-FX * COS_P * CAMERA_DIST, SIN_P * CAMERA_DIST, -FZ * COS_P * CAMERA_DIST);
  camera.lookAt(0, 0, 0);

  const hemisphere = new THREE.HemisphereLight(0xbcb7dc, 0x50535f, 2.0);
  const sun = new THREE.DirectionalLight(0xf9ffe2, 3.05);
  sun.position.set(SUN_X, SUN_Y, SUN_Z);
  scene.add(hemisphere, sun, sun.target);

  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], pools: Pool[] = [];
  const geo = (g: THREE.BufferGeometry): THREE.BufferGeometry => { geometries.push(g); return g; };
  const mat = <M extends THREE.Material>(m: M): M => { materials.push(m); return m; };
  const shadowMaterial = mat(new THREE.ShaderMaterial({
    uniforms: {uFloor:{value:0},uFade:{value:1},uSlope:{value:-SUN_X/SUN_Y},uTint:{value:new THREE.Color(0x171b1a)}},
    vertexShader: `uniform float uFloor; uniform float uSlope;
      void main(){vec4 world=instanceMatrix*vec4(position,1.0);
        world.x+=(world.y-uFloor)*uSlope;world.y=uFloor+0.018;
        gl_Position=projectionMatrix*modelViewMatrix*world;}`,
    fragmentShader: `uniform vec3 uTint; uniform float uFade;
      void main(){gl_FragColor=vec4(uTint,0.47*uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    // Light-facing faces of each closed voxel already cover its full projected
    // silhouette. Back faces add fragment/stencil work with no visible detail.
    transparent:true,depthWrite:false,side:THREE.FrontSide,
    stencilWrite:true,stencilRef:1,stencilFunc:THREE.NotEqualStencilFunc,stencilZPass:THREE.ReplaceStencilOp,
  }));
  const pool = (geometry: THREE.BufferGeometry, material: THREE.Material, cap: number, cast = false, _receive = false, order = 0, floor = 0): Pool => {
    const p = new Pool(cap, geometry, material, cast, shadowMaterial, floor);
    p.mesh.renderOrder = order;
    scene.add(p.mesh);
    if(p.shadow)scene.add(p.shadow);
    pools.push(p);
    return p;
  };

  const lit = mat(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const painted = mat(new THREE.MeshLambertMaterial({ vertexColors: true }));
  painted.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float paint;\n' + shader.vertexShader.replace('#include <color_vertex>',
      THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, paint);'));
  };
  painted.customProgramCacheKey = () => 'crossy-vehicle-paint-v1';
  const playerMaterial = mat(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true }));
  const unlit = mat(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const glowMaterial = mat(new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true}));
  // Transparent double-sided materials are single pass: three would otherwise draw them twice (back faces,
  // then front) and rebuild their program every frame.
  const beamMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const spotMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const shadeMaterial = mat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));

  const box = geo(unitBoxGeometry());
  const merged = (parts: VehicleParts): THREE.BufferGeometry => {
    const geometry = geo(mergeVehicle(parts));
    parts.body.dispose(); parts.detail.dispose();
    return geometry;
  };
  const train = trainGeometry();

  // Pools: ground details first, then objects (casters), then the effects drawn last.
  const ground = pool(geo(groundBoxGeometry()), lit, 6400, false, true);
  const waterFx = pool(box, lit, 640);
  // Scenery in PROP order: bare trees, the stump, boulders, then the zone models.
  const props = [
    ...[0, 1, 2, 3].map(treeGeometry), ...[0, 1, 2].map(rockGeometry), pineGeometry(false), pineGeometry(true), decoratedTreeGeometry(),
    snowmanGeometry(), lampPostGeometry(), bushGeometry(), logPileGeometry(), giftsGeometry(), crystalGeometry(),
  ].map((g, i) => pool(geo(g), lit, i < PROP.stump || i === PROP.pineSmall || i === PROP.pineTall ? 320 : 160, true));
  const carBody = CAR_MODELS.map(model => pool(merged(carGeometry(model)), painted, 80, true));
  /** Lorries by model, then by length (2 or 3 tiles). The fire engine and the plough have no long form. */
  const truckBody = TRUCK_MODELS.map((model, i) => ([2, 3] as const).map(len => len === 3 && i >= FIRE ? null : pool(merged(truckGeometry(len, model)), painted, 48, true)));
  const locoBody = LOCOS.map(name => pool(merged(train[name]), painted, 16, true));
  const wagonBody = WAGONS.map(name => pool(merged(train[name]), painted, name === 'carriage' ? 96 : 48, true));
  // Logs carry a paint mask: the bark takes the log colour, end grain and snow stay fixed.
  const logs = ([2, 3, 4] as const).map(len => pool(geo(logGeometry(len)), painted, 192, true, false, 0, WATER_Y));
  const lilies = [0, 1, 2].map(v => pool(geo(lilyGeometry(v)), lit, 96));
  const posts = pool(geo(signalPostGeometry()), lit, 48, true);
  const lampGeo = geo(lampGeometry());
  const lamps = pool(lampGeo, unlit, 96), glows = pool(geo(signalGlowGeometry()), glowMaterial, 48, false, false, 3);
  // Additive halos make a lit lamp bloom against the scene.
  const haloMaterial = mat(new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending}));
  const halos = pool(geo(signalHaloGeometry()), haloMaterial, 48, false, false, 6);
  const fx = pool(box, unlit, 96);
  const flakes = pool(box, unlit, FLAKES_HIGH, false, false, 4);

  for (const p of [ground, ...props, ...lilies, posts]) p.cached = true;

  // The bird and the UFO use the same pooled transforms and projected shadows.
  const playerPool = pool(geo(chickenGeometry().scale(0.78, 1, 0.78)), playerMaterial, 1, true);
  const ufoPool = pool(geo(ufoGeometry()), lit, 1, true);
  const beam = new THREE.Mesh(geo(beamGeometry()), beamMaterial);
  const spot = new THREE.Mesh(geo(spotRingGeometry()), spotMaterial);
  const shade = new THREE.Mesh(geo(ufoShadowGeometry()), shadeMaterial);
  beam.renderOrder = 5;
  spot.renderOrder = 3;
  shade.renderOrder = 2;
  for (const m of [beam, spot, shade]) { m.frustumCulled = false; scene.add(m); }

  // State ----------------------------------------------------------------------

  const stats: SceneStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, quality: options.quality ?? 'high' };
  let quality: Quality = stats.quality, low = quality === 'low';
  let resolutionCap = 2, cssWidth = 0, cssHeight = 0;
  let disposed = false, fit = cameraFit(1, 1);
  /** Smoothed focus (row and x), the look-at point on the ground, and the shake offset. */
  let snap = true, focusRow = 0, focusX = 4, lookX = 4, lookZ = 0, shakeX = 0, shakeY = 0;
  let rowLo = 0, rowHi = 0, renderOriginX = 0;
  const cachedLanes: (Lane | undefined)[] = new Array(MAX_ROWS + STATIC_ROWS_AHEAD + 2);
  const staticWindows = new Int32Array((cachedLanes.length - 2) * 2);
  let staticRowLo = 0, staticRowHi = -1, staticOrigin = NaN;
  let staticPass = false, padStatic = true;
  /** The frame being drawn. */
  let now = 0, anim = 0, reduced = false, colorBlind = false;
  /** The row being drawn: its z and the world x window that can be on screen. */
  let curZ = 0, winLo = 0, winHi = 0, curDir = 1;
  let curRoad = null as unknown as RoadLane;
  /** The death being shown: its time, the captured anchor and the surface under it. */
  let deathT = NaN, anchorX = 0, anchorZ = 0, anchorY = 0, anchorYaw = 0, groundY = 0;
  /** The player's computed transform for this frame. */
  let pX = 0, pY = 0, pZ = 0, pSX = 1, pSY = 1, pSZ = 1, pYaw = 0, pRoll = 0, pTumbleZ = false, pAlpha = 1, pShow = true;
  /** The UFO's transform for this frame. */
  let uShow = false, uX = 0, uY = 0, uZ = 0, uSpin = 0;
  const proxy = new THREE.Object3D();
  const qYaw = new THREE.Quaternion(), qTumble = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0), axisZ = new THREE.Vector3(0, 0, 1);

  // Quality ---------------------------------------------------------------------

  function applyPixelRatio(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, quality === 'high' ? resolutionCap : Math.min(resolutionCap, 1.5));
    const width = cssWidth || 1, height = cssHeight || 1;
    if (renderer.getPixelRatio() === ratio && canvas.width === Math.floor(width * ratio) && canvas.height === Math.floor(height * ratio)) return;
    renderer.setDrawingBufferSize(width, height, ratio);
  }

  function setResolutionCap(cap: number): void {
    if (disposed) return;
    resolutionCap = clamp(cap, 1, 2);
    applyPixelRatio();
  }

  function setQuality(next: Quality): void {
    if (disposed || next === quality) return;
    quality = next;
    low = next === 'low';
    stats.quality = next;
    applyPixelRatio();
  }

  // Layout ------------------------------------------------------------------------

  function resize(w: number, h: number): void {
    if (disposed || !(w >= 1 && h >= 1)) return;
    const changed = w !== cssWidth || h !== cssHeight;
    cssWidth = w; cssHeight = h;
    applyPixelRatio();
    if (!changed) return;
    fit = cameraFit(w, h);
    staticOrigin = NaN;
    padStatic = true;
    camera.left = -fit.halfWidth; camera.right = fit.halfWidth; camera.top = fit.halfHeight; camera.bottom = -fit.halfHeight;
    camera.updateProjectionMatrix();
  }

  /** Moves the focus toward the player (never backward), places the camera and finds the rows on screen. */
  function aim(frame: SceneFrame): void {
    const state = frame.state, pose = frame.pose;
    const targetRow = focusRowTarget(pose.z, state.safeLine, state.maxRow, state.started), targetX = focusXTarget(pose.x, fit.halfWidth);
    if (snap) { focusRow = targetRow; focusX = targetX; snap = false; } else {
      focusRow = stepFocusRow(focusRow, targetRow, frame.dt);
      focusX += (targetX - focusX) * smoothing(frame.dt);
    }
    renderOriginX = Math.floor(focusX / 32) * 32;
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
    lookZ = -focusRow * ROW_DEPTH + FZ * (ahead + back) + RZ * shakeX;
    camera.position.set(lookX - renderOriginX - FX * COS_P * CAMERA_DIST, SIN_P * CAMERA_DIST, lookZ - FZ * COS_P * CAMERA_DIST);
    // Every row whose strip can touch the screen, plus one each side.
    const zr = fit.halfWidth * Math.abs(RZ) + (fit.halfHeight / SIN_P) * -FZ;
    rowLo = Math.ceil(-0.5 - (lookZ + zr) / ROW_DEPTH) - 1;
    rowHi = Math.floor(0.5 - (lookZ - zr) / ROW_DEPTH) + 1;
    if (rowHi - rowLo >= MAX_ROWS) rowHi = rowLo + MAX_ROWS - 1;

  }

  /** Sets the row being drawn and the x window of objects that can be on screen on it. */
  function windowFor(row: number): void {
    curZ = -row * ROW_DEPTH;
    const off = (curZ - lookZ) * RZ;
    winLo = Math.floor(lookX + (-fit.halfWidth - off) / RX - MARGIN);
    winHi = Math.ceil(lookX + (fit.halfWidth - off) / RX + MARGIN);
  }

  // Lane drawing --------------------------------------------------------------------

  // Ground never rotates or casts shadows; the fixed orthographic camera faces
  // the three retained sides for every view, including camera shake.
  function putGround(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void {
    ground.put(x, y, z, sx, sy, sz, 0, color, 1);
  }

  /** A bounded strip snapped to horizontal chunks, extending beyond the frustum. */
  function band(ci: number, y: number, h: number, zc: number, depth: number, _edge = ci, _shade = DARK): void {
    const left = Math.floor(winLo / 16) * 16 - 8, right = Math.ceil(winHi / 16) * 16 + 8;
    putGround((left+right)/2, y, zc, right-left, h, depth, ci);
  }

  function tuft(x: number, z: number, h: number): void {
    ground.put(x, 0, z, 0.07, 0.1, 0.07, 0, C_TUFT + ((h >>> 12) & 1), 1);
    ground.put(x + 0.08, 0, z + 0.04, 0.06, 0.07, 0.06, 0, C_TUFT + ((h >>> 13) & 1), 1);
  }

  /** Small details on an open cell. Nothing here is tall enough to look like an obstacle. */
  function decor(c: number, row: number): void {
    const h = hash(row, c + 1000), kind = h & 15, a = (h >>> 14) & 3;
    const x = c + (((h >>> 4) & 15) / 15 - 0.5) * 0.6, z = curZ + (((h >>> 8) & 15) / 15 - 0.5) * 0.7 * ROW_DEPTH;
    switch (kind) {
      case 0: tuft(x, z, h); break;
      case 1: case 2: ground.put(x, 0, z, 0.3 + a * 0.08, 0.05, 0.22, 0, C_SNOW, 1); break;
      case 3:
        ground.put(x, 0, z, 0.12, 0.06, 0.1, 0, C_PEBBLE, 1);
        ground.put(x + 0.13, 0, z + 0.06, 0.07, 0.04, 0.07, 0, C_PEBBLE + 1, 1);
        break;
      case 4:
        // Two red mushrooms.
        for (let i = 0; i < 2; i++) {
          const s = 1 - i * 0.35, mx = x + i * 0.14, mz = z + i * 0.09;
          ground.put(mx, 0, mz, 0.05 * s, 0.08 * s, 0.05 * s, 0, C_STEM, 1);
          ground.put(mx, 0.08 * s, mz, 0.14 * s, 0.05 * s, 0.14 * s, 0, C_CAP, 1);
        }
        break;
      case 5: ground.put(x, 0, z, 0.09, 0.07, 0.13, 0, C_CONE, 1); break;
      case 6: ground.put(x, 0, z, 0.36, 0.03, 0.04, 0, C_SLEEPER, 1); break;
      case 7:
        // A candy cane stuck in the snow.
        for (let i = 0; i < 4; i++) ground.put(x, i * 0.055, z, 0.05, 0.055, 0.05, 0, i & 1 ? C_WHITE : C_CAP, 1);
        ground.put(x + 0.05, 0.165, z, 0.05, 0.055, 0.05, 0, C_CAP, 1);
        break;
      case 8:
        // A winter flower: white, purple or yellow.
        ground.put(x, 0, z, 0.03, 0.1, 0.03, 0, C_TUFT, 1);
        ground.put(x, 0.1, z, 0.09, 0.05, 0.09, 0, C_PETAL + a % 3, 1);
    }
  }

  function drawGrass(lane: GrassLane, row: number): void {
    if (!staticPass) return;
    band(C_GRASS + lane.shade, -0.5, 0.5, curZ, ROW_DEPTH);
    for (let c = Math.floor(winLo); c <= Math.ceil(winHi); c++) {
      const o = obstacleAt(lane, c);
      if (o === null) { decor(c, row); continue; }
      const h = hash(row, c + 400), i = propAt(o, obstacleVariant(lane, c), h >>> 2);
      // Boulders and crystals turn a quarter at a time; everything else faces the camera.
      const turn = (i >= PROP.rock && i < PROP.rock + 3) || i === PROP.crystal ? (h & 3) * (Math.PI / 2) : 0;
      // The forest behind the start keeps its model size, so it does not hide the bird on row 0.
      const wide = row < 0 ? 1 : PROP_SCALE[i][0], tall = row < 0 ? 1 : PROP_SCALE[i][1];
      props[i].put(c, 0, curZ, wide, tall, wide, turn, C_WHITE, 1);
    }
  }

  const onVehicle = (x0: number, x1: number, mover: Mover, index: number): void => {
    const cx = (x0 + x1) * 0.5, len = x1 - x0, yaw = curDir > 0 ? 0 : Math.PI;
    // Each vehicle keeps one look for as long as it drives: the pick comes from its lane, its mover and its copy.
    const id = mix(curRoad.row, index, moverCopy(curRoad, mover, x0, now)), paint = id >>> 8;
    // Lorries are two tiles or longer. A taxi lane, or a yellow wagon in a mixed lane, stays a taxi.
    // The lane's scale makes the whole vehicle larger; it moves toward the middle of the row so it stays inside it.
    const scale = curRoad.scale ?? 1, base = mover.len / scale;
    if (base < 2) {
      const taxi = curRoad.style !== undefined ? curRoad.style === 'taxi' : base >= 1.5 && mover.color === 2;
      const i = carModel(base, taxi, id), name = CAR_MODELS[i];
      const tint = name === 'taxi' ? C_TAXI : name === 'police' ? C_WHITE : C_CAR + paint % CAR_COLORS.length;
      carBody[i].put(cx, 0, curZ + Math.min(TRAFFIC_ROW_Z, ROW_DEPTH / 2 - 0.02 - CAR_HALF * scale), len / carLength(name), scale, scale, yaw, tint, 1);
    } else {
      const long = base > 2.5 ? 1 : 0, i = truckModel(long === 1, id);
      const tint = i === FIRE ? C_FIRE : i === PLOUGH ? C_PLOUGH : C_TRUCK + paint % TRUCK_COLORS.length;
      truckBody[i][long]!.put(cx, 0, curZ + Math.min(TRAFFIC_ROW_Z, ROW_DEPTH / 2 - 0.02 - TRUCK_HALF * scale), len / (long + 2), scale, scale, yaw, tint, 1);
    }
  };

  function drawRoad(lane: RoadLane, row: number, ahead: Lane, behind: Lane): void {
    if (staticPass) {
      band(C_ROAD, -0.5, 0.5, curZ, ROW_DEPTH);
      if (ahead.kind === 'road') {
        // Muted, one-tile dashes on a two-tile repeat, only between road lanes.
        const zb = curZ - ROW_DEPTH / 2;
        for (let k = Math.ceil(winLo / 2) * 2; k <= winHi; k += 2) ground.put(k, 0, zb, 0.98, 0.012, 0.065, 0, C_DASH, 1);
      }
      for (let c = Math.floor(winLo); c <= Math.ceil(winHi); c++) {
        // Now and then a manhole cover in the asphalt.
        const h = hash(row, c + 5000);
        if ((h & 31) === 0) {
          const x = c + (((h >>> 5) & 15) / 15 - 0.5) * 0.5, z = curZ + (((h >>> 9) & 15) / 15 - 0.5) * 0.6;
          ground.put(x, 0, z, 0.38, 0.006, 0.38, 0, C_COVER + 1, 1);
          ground.put(x, 0, z, 0.28, 0.009, 0.28, 0, C_COVER, 1);
        }
        // Ploughed snow lies along a kerb that meets grass.
        for (let side = -1; side <= 1; side += 2) if ((side < 0 ? ahead : behind).kind === 'grass') {
          const k = hash(row * 2 + side, c + 6000), d = 0.07 + ((k >>> 2) & 3) * 0.03;
          if ((k & 1) !== 0) ground.put(c + ((k >>> 4) & 7) * 0.06, 0, curZ + side * (ROW_DEPTH - d) / 2, 0.45 + ((k >>> 7) & 7) * 0.08, 0.016, d, 0, C_SNOW, 1);
        }
      }
      return;
    }
    curRoad = lane;
    curDir = lane.dir;
    forEachMover(lane, now, winLo, winHi, onVehicle);
  }

  const onLog = (x0: number, x1: number, mover: Mover): void => {
    const len = x1 - x0, i = len > 3.5 ? 2 : len > 2.5 ? 1 : 0;
    logs[i].put((x0 + x1) * 0.5, LOG_BASE, curZ, len / (i + 2), 1, 1, 0, C_LOG + (mover.color % LOG_PALETTE), 1);
  };

  function drawWater(lane: RiverLane | LilyLane, row: number, ahead: Lane, behind: Lane): void {
    if (staticPass) {
      band(C_WATER, WATER_Y - 0.6, 0.6, curZ, ROW_DEPTH, C_WATER_EDGE, 1);
      // Both shorelines end at the exact half-cell boundary. The soil wall and
      // narrow rim stay inside this water cell; adjacent road/rail strips remain whole.
      for (let side = -1; side <= 1; side += 2) if (!isWater(side < 0 ? ahead : behind)) {
        band(C_DIRT, WATER_Y, -WATER_Y, curZ + side * (ROW_DEPTH / 2 - 0.006), 0.012);
        band(C_RIPPLE, WATER_Y, 0.008, curZ + side * (ROW_DEPTH / 2 - 0.028), 0.025);
        // Clumps of reeds stand in the shallows against the bank.
        for (let c = Math.floor(winLo); c <= Math.ceil(winHi); c++) {
          const h = hash(row * 2 + side, c + 7000);
          if ((h & 7) !== 0) continue;
          for (let i = 0; i < 2; i++) {
            const x = c + ((h >>> 3) & 7) * 0.08 + i * 0.08, z = curZ + side * (ROW_DEPTH / 2 - 0.07 - (i & 1) * 0.05), tall = 0.2 + ((h >>> (6 + i * 2)) & 3) * 0.05;
            ground.put(x, WATER_Y, z, 0.035, tall, 0.035, 0, C_REED, 1);
            ground.put(x, WATER_Y + tall, z, 0.055, 0.08, 0.055, 0, C_REED + 1, 1);
          }
        }
      }
      if (lane.kind === 'lily') {
        for (let c = winLo; c <= winHi; c++) if (lilyAt(lane, c)) {
          const h = hash(row, c);
          lilies[lilyLook(h >>> 3)].put(c, PAD_BASE, curZ, 1, 1, 1, ((h % 7) - 3) * 0.035, C_WHITE, 1);
        }
      }
      return;
    }
    // A few light ripples drifting slowly, repeating every 14 tiles.
    for (let k = 0; k < 1; k++) {
      const h = hash(row, 200 + k), len = 0.5 + 0.7 * ((h >>> 19) & 63) / 63, zz = curZ + (((h >>> 25) & 31) / 31 - 0.5) * 0.52 * ROW_DEPTH;
      const speed = (0.1 + 0.18 * ((h >>> 10) & 255) / 255) * ((h >>> 18) & 1 ? -1 : 1);
      const at = ((((h & 1023) / 1024) * 14 + speed * anim) % 14 + 14) % 14;
      for (let x = at + Math.ceil((winLo - len - at) / 14) * 14; x <= winHi + len; x += 14)
        waterFx.put(x, WATER_Y, zz, len, 0.008, 0.035, 0, C_RIPPLE, 1);
    }
    const flow = lane.kind === 'river' ? lane.dir * 0.35 : 0.12;
    const foamAt = (hash(Math.floor(row / 2), 823) % 90) / 10 + anim * flow;
    for (let x = foamAt + Math.ceil((winLo - foamAt) / 9) * 9; x <= winHi; x += 9) {
      const k = 1, shape = hash(row, 825);
      waterFx.put(x, WATER_Y + 0.002, curZ - 0.27 * ROW_DEPTH, 0.60 + (shape & 3) * 0.05, 0.012, 0.28 * ROW_DEPTH, 0, C_FOAM, k);
      waterFx.put(x - 0.12, WATER_Y + 0.002, curZ - 0.02 * ROW_DEPTH, 0.75 + ((shape >>> 2) & 3) * 0.035, 0.012, 0.32 * ROW_DEPTH, 0, C_FOAM, k);
      waterFx.put(x + 0.07, WATER_Y + 0.002, curZ + 0.24 * ROW_DEPTH, 0.50 + ((shape >>> 4) & 3) * 0.03, 0.012, 0.24 * ROW_DEPTH, 0, C_FOAM, k);
    }
    if (lane.kind === 'river') {
      forEachMover(lane, now, winLo, winHi, onLog);
    }
  }

  /** A level-crossing signal beside the track: two red lamps under a crossbuck. While a train is due they flash
   * alternately (a wig-wag), each lit lamp swelling with a soft additive halo and a red spill on the ground; at
   * rest both lamps sit dark. `phase` is 0 or 1 for which lamp is lit. */
  function signal(x: number, on: boolean, phase: number): void {
    if (x < winLo - 1 || x > winHi + 1) return;
    // Beside the track, on the near edge, so a passing train never clips it.
    const z = curZ + ROW_DEPTH / 2 - 0.05, face = curZ + ROW_DEPTH / 2 - 0.007;
    if (staticPass) {
      posts.put(x, 0, z, 1, 1, 1, 0, C_WHITE, 1);
      return;
    }
    for (let side = 0; side < 2; side++) {
      const lx = x + (side === 0 ? -SIGNAL_LAMP_X : SIGNAL_LAMP_X), lit = on && side === phase;
      const s = lit ? 1.08 + (colorBlind ? 0.25 : 0) : 0.9;
      lamps.put(lx, SIGNAL_LAMP_Y, face, s, s, 0.05, 0, lit ? C_LAMP_ON : C_LAMP_OFF, 1);
      if (lit) {
        halos.put(lx, SIGNAL_LAMP_Y, face + 0.02, 1, 1, 1, 0, C_WHITE, 1);
        glows.put(lx, 0.112, z, 0.95, 1, 0.95, 0, C_WHITE, 1);
      }
    }
  }

  function drawTrain(lane: RailLane, x0: number, x1: number): void {
    const dir = lane.dir, yaw = dir > 0 ? 0 : Math.PI, front = dir > 0 ? x1 : x0;
    // Each train that passes is a passenger, freight or steam train in its own colour.
    const id = mix(lane.row, trainCopy(lane, x0, now), 5), kind = trainKind(id), tint = C_TRAIN + (lane.color + (id >>> 8)) % TRAIN_COLORS.length;
    const nose = front - (dir * PIECE_LEN) / 2;
    if (nose >= winLo - 2 && nose <= winHi + 2) {
      locoBody[kind].put(nose, TRAIN_Y, curZ + TRACK_Z, TRAIN_SCALE, TRAIN_SCALE, TRAIN_SCALE, yaw, tint, 1);
    }
    const bodyLen = x1 - x0 - PIECE_LEN, n = Math.max(1, Math.round(bodyLen / PIECE_LEN)), each = bodyLen / n, sx = each / 2;
    for (let i = 0; i < n; i++) {
      const cc = front - dir * (PIECE_LEN + each * (i + 0.5));
      if (cc < winLo - 2 || cc > winHi + 2) continue;
      const h = mix(id, i), wagon = wagonAt(kind, i, h);
      // Containers are each their own colour; other wagons take the train's.
      wagonBody[wagon].put(cc, TRAIN_Y, curZ + TRACK_Z, sx, TRAIN_SCALE, TRAIN_SCALE, yaw, WAGONS[wagon] === 'container' ? C_CONTAINER + (h >>> 4) % CONTAINER_COLORS.length : tint, 1);
    }
  }

  function drawRail(lane: RailLane): void {
    if (staticPass) {
      band(C_BALLAST, -0.5, 0.5, curZ, ROW_DEPTH);
      // Snowy shoulders either side of the track bed.
      band(C_SNOW, 0, 0.02, curZ - ROW_DEPTH / 2 + 0.17, 0.34);
      band(C_SNOW, 0, 0.02, curZ + ROW_DEPTH / 2 - 0.1, 0.2);
      // A raised gravel bed in two steps, so its edges catch the light like a real ballast shoulder.
      const tz = curZ + TRACK_Z;
      band(C_BED, 0, BED_LOW, tz, 0.98);
      band(C_BED + 1, BED_LOW, BED_TOP - BED_LOW, tz, 0.86);
      for (let x = Math.ceil(winLo); x <= winHi; x++) {
        const h = hash(lane.row, x + 3000);
        // Chunky sleepers every half tile on the bed, each with a dark tie plate under both rails.
        for (const sx of [x - 0.25, x + 0.25]) {
          ground.put(sx, BED_TOP, tz, 0.17, SLEEPER_H, 0.8, 0, C_SLEEPER, 1);
          for (const rz of [-RAIL_GAUGE, RAIL_GAUGE]) ground.put(sx, BED_TOP + SLEEPER_H, tz + rz, 0.19, 0.008, 0.12, 0, C_PLATE, 1);
        }
        // Gravel speckles between the sleepers.
        putGround(x + 0.02 + ((h >>> 16) & 3) * 0.03, BED_TOP, tz + (((h >>> 18) & 15) / 15 - 0.5) * 0.6, 0.06, 0.012, 0.05, C_GRAVEL + ((h >>> 22) & 1));
        putGround(x + 0.5 + ((h >>> 23) & 3) * 0.02, BED_TOP, tz + (((h >>> 25) & 15) / 15 - 0.5) * 0.6, 0.05, 0.01, 0.06, C_GRAVEL + ((h >>> 29) & 1));
        // Snow settles on most sleepers and drifts between some of them.
        if ((h & 3) !== 0) putGround(x + 0.25, BED_TOP + SLEEPER_H, tz + (((h >>> 2) & 7) - 3.5) * 0.02, 0.15, 0.016, 0.22 + ((h >>> 5) & 3) * 0.05, C_SNOW);
        if (((h >>> 8) & 3) === 0) putGround(x + 0.5, BED_TOP, tz + (((h >>> 10) & 7) - 3.5) * 0.04, 0.26 + ((h >>> 13) & 3) * 0.08, 0.025, 0.16, C_SNOW);
      }
      // Each rail: a wide foot, a narrow web and a polished head standing on the plates.
      const foot = BED_TOP + SLEEPER_H + 0.008;
      for (const rz of [-RAIL_GAUGE, RAIL_GAUGE]) {
        band(C_STEEL, foot, 0.008, tz + rz, 0.1);
        band(C_STEEL, foot + 0.008, RAIL_TOP - foot - 0.03, tz + rz, 0.035);
        band(C_RAIL_HEAD, RAIL_TOP - 0.022, 0.022, tz + rz, 0.075);
      }
    } else {
      curRail=lane;
      forEachTrain(lane, now, winLo, winHi, onTrain);
    }
    // Signals repeat spatially; each warns about arrival at its own column.
    // The two lamps alternate about 1.4 times a second; reduced motion still alternates (a light change, not motion).
    for(let x=Math.ceil((winLo-.15)/8)*8+.15;x<=winHi+1;x+=8) {
      const on=!staticPass && railWarning(lane,now,x);
      signal(x,on,(now*1.4)%1<.5?0:1);
    }
  }

  let curRail: RailLane;
  const onTrain=(x0:number,x1:number):void=>drawTrain(curRail,x0,x1);

  function drawRow(lane: Lane, row: number, ahead: Lane, behind: Lane): void {
    switch (lane.kind) {
      case 'grass': drawGrass(lane, row); break;
      case 'road': drawRoad(lane, row, ahead, behind); break;
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
    const state = frame.state, pose = frame.pose, world = frame.world, t = state.death?.t ?? state.t, hopping = state.hop >= 0;
    // Hop progress from the state's own clock, so the squash and the surface follow the hop whatever pose.progress means.
    const p = hopping ? clamp(state.hop / HOP_TIME, 0, 1) : 1;
    if (hopping) groundY = lerp(surfaceAt(world.lane(state.fromRow), state.fromX, t - state.hop), surfaceAt(world.lane(state.row), state.x, t), p);
    else groundY = surfaceAt(world.lane(state.row), pose.x, t);
    pX = pose.x; pZ = -pose.z * ROW_DEPTH; pY = groundY + pose.lift; pYaw = YAWS[pose.facing];
    if (reduced) return;
    let sy = 1;
    if (hopping) {
      // Squash at take-off, stretch in the air, back to 1 on landing.
      sy = (state.hop < SQUASH_TIME ? lerp(0.8, 1, state.hop / SQUASH_TIME) : 1) + 0.18 * Math.sin(Math.PI * p);
    } else {
      const land = t - state.landedAt, bonk = t - state.bonkAt;
      if(frame.pressed) sy=0.8;
      else if (land >= 0 && land < 0.08) sy = 1 - 0.18 * (1 - land / 0.08) * (1 - land / 0.08);
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
        const contact = carImpact(reduced ? 0.15 : age, -anchorZ / ROW_DEPTH, death.row, anchorY, death.contact?.mode === 'hop-in');
        pX += dir * contact.slide; pZ = -contact.row * ROW_DEPTH; pY = contact.height;
        pSY = contact.sy; pSX = pSZ = contact.sx;
        if (!reduced) burst(anchorX, 0.12, -death.row * ROW_DEPTH, age, 8, 1.4, 1.6, 0.1, 11, C_FLUFF);
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

  /** Swoop from above, grab, then carry the bird off the top in under 0.7 s. */
  function ufoDeath(age: number, _total: number): void {
    const flight = ufoFlight(age, reduced);
    uShow = flight.visible;
    uX = anchorX + flight.sideways; uY = anchorY + flight.height; uZ = anchorZ + flight.forward;
    uSpin = reduced ? 0 : age * 4;
    pY = anchorY + flight.birdLift;
    pZ = anchorZ + flight.birdForward;
    pX = anchorX + (age > 0.34 ? flight.sideways : 0);
    pSX = pSY = pSZ = flight.birdScale;
    pAlpha = flight.birdAlpha;
    pShow = flight.visible;
    beam.visible = flight.visible && flight.beam > 0;
    beamMaterial.opacity = flight.beam * 0.65;
    beam.position.set(uX, uY, uZ);
    beam.scale.set(0.75, Math.max(0.2, uY - pY), 0.75);
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
        // First frame of this death: remember where the bird was, so the animation is anchored there.
        deathT = death.t;
        alive(frame);
        anchorX = pX; anchorZ = pZ; anchorY = pY; anchorYaw = pYaw;
        pSX = pSY = pSZ = 1;
      }
      dying(frame, death, Math.max(0, state.t - death.t));
    }
    if (pShow) {
      // The bird's transform: scale, a yaw for its facing, and a world-axis tumble on top for deaths.
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
    playerPool.shadowOpacity = pAlpha > 0.5 ? 1 : 0;
    playerPool.shadowFloor = isWater(frame.world.lane(state.row)) ? WATER_Y : 0;
    ufoPool.shadowFloor = playerPool.shadowFloor;
    if (uShow) {
      proxy.position.set(uX, uY, uZ);
      proxy.scale.set(1, 1, 1);
      proxy.quaternion.setFromAxisAngle(axisY, uSpin);
      proxy.updateMatrix();
      ufoPool.putMatrix(proxy.matrix, C_WHITE, 1);
    }
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

  /** Falling snow: flakes anchored in world space (so they don't slide with the camera) inside a column around the
   * view, falling and swaying as analytic functions of `anim`. Reduced motion freezes them where they are. */
  function snowfall(): void {
    const count = low ? FLAKES_LOW : FLAKES_HIGH;
    const W = (2 * fit.halfWidth) / RX + 6 + SNOW_H * Math.abs(FX), D = (2 * fit.halfHeight) / SIN_P + 6 + SNOW_H * -FZ;
    // A flake at height y appears y·cot(pitch) further ahead, so the column is centred behind the look point.
    const cx = lookX - FX * SNOW_H * 0.5, cz = lookZ - FZ * SNOW_H * 0.5;
    for (let i = 0; i < count; i++) {
      const h = hash(i, 9001), g = hash(i, 9002);
      const speed = 0.55 + 0.5 * ((g & 255) / 255), sway = 0.22 * Math.sin(anim * (0.9 + ((g >>> 8) & 7) * 0.1) + i);
      const y = SNOW_H - (((((h >>> 20) & 1023) / 1024) * SNOW_H + anim * speed) % SNOW_H) - 0.3;
      if (y < 0.02) continue;
      const bx = ((h & 1023) / 1024) * W + sway + anim * 0.12, bz = (((h >>> 10) & 1023) / 1024) * D;
      const x = cx + ((((bx - cx) % W) + W) % W) - W / 2, z = cz + ((((bz - cz) % D) + D) % D) - D / 2;
      const size = 0.05 + 0.015 * ((g >>> 12) & 3);
      flakes.put(x, y, z, size, size, size, 0, C_FLAKE, 1);
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
    if (!retainsStatic(world)) rebuildTerrain(world);
    for (const p of pools) if (!p.cached) p.begin(renderOriginX);
    for (let row = rowLo; row <= rowHi; row++) {
      const i = row - staticRowLo + 1;
      windowFor(row);
      drawRow(cachedLanes[i]!, row, cachedLanes[i + 1]!, cachedLanes[i - 1]!);
    }
    actors(frame);
    snowfall();
    if(beam.visible)beam.position.x-=renderOriginX;
    if(spot.visible)spot.position.x-=renderOriginX;
    if(shade.visible)shade.position.x-=renderOriginX;
    for (const p of pools) if (!p.cached) p.commit();
    renderer.render(scene, camera);
    const info = renderer.info;
    stats.calls = info.render.calls;
    stats.triangles = info.render.triangles;
    stats.geometries = info.memory.geometries;
    stats.textures = info.memory.textures;
    stats.programs = info.programs ? info.programs.length : 0;
  }

  function retainsStatic(world: LaneSource): boolean {
    if (renderOriginX !== staticOrigin || rowLo < staticRowLo || rowHi > staticRowHi) return false;
    for (let row = rowLo - 1; row <= rowHi + 1; row++) {
      const i = row - staticRowLo;
      if (cachedLanes[i + 1] !== world.lane(row)) return false;
      if (row < rowLo || row > rowHi) continue;
      windowFor(row);
      if (winLo < staticWindows[i * 2] || winHi > staticWindows[i * 2 + 1]) return false;
    }
    return true;
  }

  function rebuildTerrain(world: LaneSource, forceUpload = false): void {
    staticRowLo = rowLo;
    staticRowHi = rowHi + (padStatic ? STATIC_ROWS_AHEAD : 0);
    const columns = padStatic ? STATIC_COLUMNS : 0;
    staticOrigin = renderOriginX;
    for (let row = staticRowLo - 1; row <= staticRowHi + 1; row++) cachedLanes[row - staticRowLo + 1] = world.lane(row);
    for (const p of pools) if (p.cached) p.begin(renderOriginX);
    staticPass = true;
    for (let row = staticRowLo; row <= staticRowHi; row++) {
      const i = row - staticRowLo;
      windowFor(row);
      staticWindows[i * 2] = winLo -= columns;
      staticWindows[i * 2 + 1] = winHi += columns;
      drawRow(cachedLanes[i + 1]!, row, cachedLanes[i + 2]!, cachedLanes[i]!);
    }
    staticPass = false;
    // On unusually wide views, keep the original window and pool limits instead
    // of letting cache padding crowd out geometry the camera can actually see.
    // Commit first so a pool empty after the retry still uploads its pending
    // changes when geometry re-enters. Nonempty pools upload all touched slots.
    for (const p of pools) if (p.cached) p.commit(forceUpload);
    if (padStatic && pools.some(p => p.cached && p.overflow)) {
      padStatic = false;
      rebuildTerrain(world, true);
    }
  }

  function reset(): void {
    snap = true;
    staticOrigin = NaN;
    deathT = NaN;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const p of pools) p.dispose();
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
  // Compile each shared program once without allocating a shadow framebuffer.
  renderer.compile(scene, camera);
  for (const p of pools) {p.mesh.visible=false;if(p.shadow)p.shadow.visible=false;}
  for (const m of [beam, spot, shade]) m.visible=false;
  applyPixelRatio();
  return { resize, render, setQuality, setResolutionCap, stats, reset, dispose };
}
