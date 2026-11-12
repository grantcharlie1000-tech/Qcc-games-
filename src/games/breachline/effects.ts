/** Short-lived visuals, all pooled so nothing is allocated during a fight: dust and smoke, sparks, wall debris,
 * tracers, muzzle and blast flashes, and bullet holes on solid surfaces. */
import * as THREE from 'three';
import { makeMarks, makeSprite } from './textures';

// Camera-facing quads, instanced: one draw per pool. Smoke and dust turn slowly and are drawn back to front; sparks are
// stretched along their motion on screen. Near the camera a particle is capped in size and fades, so nothing fills
// the view.
const QUAD_VERT = `attribute vec2 corner; attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iTint; attribute vec3 iSRC;
uniform float stretch; varying vec2 vUv; varying vec4 vTint;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float d = -mv.z, size = min(iSRC.x, d * 0.5);
  vec2 off;
  if (stretch > 0.0) {
    vec2 v = (modelViewMatrix * vec4(iVel, 0.0)).xy; float sp = length(v);
    vec2 dir = sp > 1e-4 ? v / sp : vec2(1.0, 0.0);
    off = dir * corner.x * (size + sp * stretch) + vec2(-dir.y, dir.x) * corner.y * size;
  } else { float sn = sin(iSRC.y), cs = cos(iSRC.y); off = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs) * size; }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vUv = (corner + 0.5) * 0.5 + vec2(mod(iSRC.z, 2.0), floor(iSRC.z / 2.0)) * 0.5;
  vTint = vec4(iTint.rgb, iTint.a * smoothstep(0.4, 1.6, d));
}`;
const QUAD_FRAG = `uniform sampler2D map; uniform float gain; varying vec2 vUv; varying vec4 vTint;
void main(){ float a = texture2D(map, vUv).a * vTint.a; if (a < 0.004) discard; gl_FragColor = vec4(vTint.rgb * gain, a);
#include <colorspace_fragment>
}`;

let atlas: THREE.CanvasTexture | null = null;
/** A 2 x 2 atlas: three lumpy smoke puffs (soft noise on a round falloff) and a spark's hot core. */
function particleAtlas() {
  if (atlas) return atlas;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N * 2;
  const g = c.getContext('2d')!, img = g.createImageData(N * 2, N * 2);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let cell = 0; cell < 4; cell++) {
    // A few soft blobs per puff, so each has its own lumpy outline.
    const blobs = Array.from({ length: 7 }, () => [0.5 + (rnd() - 0.5) * 0.36, 0.5 + (rnd() - 0.5) * 0.36, 0.16 + rnd() * 0.16]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N, v = (y + 0.5) / N, r = Math.hypot(u - 0.5, v - 0.5) * 2;
      let a: number;
      if (cell === 3) a = Math.max(0, 1 - r) ** 2.2;
      else {
        let m = 0; for (const [bx, by, br] of blobs) m = Math.max(m, 1 - Math.hypot(u - bx, v - by) / br);
        const n = 0.75 + 0.25 * Math.sin(u * 23 + cell * 3) * Math.sin(v * 19 - cell);
        a = Math.max(0, Math.min(1, m * 1.4)) * n * Math.max(0, 1 - r) ** 0.6;
      }
      const i = ((y + (cell >> 1) * N) * N * 2 + x + (cell & 1) * N) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return (atlas = new THREE.CanvasTexture(c));
}

/** One pool of camera-facing quads with per-particle colour, size, spin and motion; nothing is allocated after it is
 * built. Live particles are packed into the instance buffers each frame (back to front for the blended pool). */
class Points {
  readonly object: THREE.Mesh;
  private pos: Float32Array; private tint: Float32Array; private vel: Float32Array; private life: Float32Array; private span: Float32Array;
  private base: Float32Array; private grow: Float32Array; private drag: Float32Array; private gravity: Float32Array; private alpha: Float32Array;
  private rot: Float32Array; private spin: Float32Array; private cell: Float32Array;
  private gPos: Float32Array; private gVel: Float32Array; private gTint: Float32Array; private gSRC: Float32Array;
  private order: Int32Array; private depth: Float32Array;
  private next = 0; private live = 0;
  readonly material: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private cam = new THREE.Vector3(); private fwd = new THREE.Vector3();
  constructor(private max: number, private additive: boolean) {
    const f = (n: number) => new Float32Array(max * n);
    this.pos = f(3); this.vel = f(3); this.tint = f(4); this.life = f(1); this.span = f(1); this.base = f(1); this.grow = f(1); this.drag = f(1); this.gravity = f(1); this.alpha = f(1);
    this.rot = f(1); this.spin = f(1); this.cell = f(1);
    this.gPos = f(3); this.gVel = f(3); this.gTint = f(4); this.gSRC = f(3); this.order = new Int32Array(max); this.depth = f(1);
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.gPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iVel', new THREE.InstancedBufferAttribute(this.gVel, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iTint', new THREE.InstancedBufferAttribute(this.gTint, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iSRC', new THREE.InstancedBufferAttribute(this.gSRC, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({ uniforms: { map: { value: particleAtlas() }, stretch: { value: additive ? 0.035 : 0 }, gain: { value: additive ? 3 : 1 } }, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.object = new THREE.Mesh(g, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = additive ? 6 : 5;
    // Packed when drawn, so the blended pool can be sorted for the camera that draws it.
    this.object.onBeforeRender = (_r, _s, camera) => this.pack(camera);
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, r: number, g: number, b: number, alpha: number, grow: number, gravity: number, drag: number) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.tint[i * 4] = r; this.tint[i * 4 + 1] = g; this.tint[i * 4 + 2] = b; this.tint[i * 4 + 3] = alpha;
    this.life[i] = this.span[i] = life; this.base[i] = size; this.grow[i] = grow; this.gravity[i] = gravity; this.drag[i] = drag; this.alpha[i] = alpha;
    this.rot[i] = Math.random() * 6.28; this.spin[i] = (Math.random() - 0.5) * 1.2; this.cell[i] = this.additive ? 3 : Math.floor(Math.random() * 3);
    this.live = Math.max(this.live, 1);
  }
  update(dt: number) {
    if (!this.live) return;
    let any = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      if ((this.life[i] -= dt) <= 0) continue;
      any++;
      const k = Math.max(0, 1 - this.drag[i] * dt), j = i * 3;
      this.vel[j] *= k; this.vel[j + 1] = this.vel[j + 1] * k - this.gravity[i] * dt; this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02) { this.pos[j + 1] = 0.02; this.vel[j + 1] = 0; }
      this.rot[i] += this.spin[i] * dt;
    }
    this.live = any;
  }
  /** Writes the live particles into the instance buffers, the blended ones furthest first. */
  private pack(camera: THREE.Camera) {
    let n = 0;
    camera.getWorldPosition(this.cam); camera.getWorldDirection(this.fwd);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3, d = (this.pos[j] - this.cam.x) * this.fwd.x + (this.pos[j + 1] - this.cam.y) * this.fwd.y + (this.pos[j + 2] - this.cam.z) * this.fwd.z;
      if (d < 0.05) continue;
      // Insertion by depth, furthest first (a few hundred at most).
      let k = n++;
      if (!this.additive) while (k > 0 && this.depth[k - 1] < d) { this.order[k] = this.order[k - 1]; this.depth[k] = this.depth[k - 1]; k--; }
      this.order[k] = i; this.depth[k] = d;
    }
    for (let k = 0; k < n; k++) {
      const i = this.order[k], t = this.life[i] / this.span[i];
      this.gPos[k * 3] = this.pos[i * 3]; this.gPos[k * 3 + 1] = this.pos[i * 3 + 1]; this.gPos[k * 3 + 2] = this.pos[i * 3 + 2];
      this.gVel[k * 3] = this.vel[i * 3]; this.gVel[k * 3 + 1] = this.vel[i * 3 + 1]; this.gVel[k * 3 + 2] = this.vel[i * 3 + 2];
      this.gTint[k * 4] = this.tint[i * 4]; this.gTint[k * 4 + 1] = this.tint[i * 4 + 1]; this.gTint[k * 4 + 2] = this.tint[i * 4 + 2];
      // Fades in over the first tenth of its life and out over the rest, so a puff never pops.
      this.gTint[k * 4 + 3] = this.alpha[i] * Math.min(1, (1 - t) * 10, t * 1.8);
      this.gSRC[k * 3] = this.base[i] * (1 + this.grow[i] * (1 - t)); this.gSRC[k * 3 + 1] = this.rot[i]; this.gSRC[k * 3 + 2] = this.cell[i];
    }
    this.geo.instanceCount = n;
    if (n) for (const name of ['iPos', 'iVel', 'iTint', 'iSRC']) { const a = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute; a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
  clear() { this.life.fill(0); this.live = 0; this.geo.instanceCount = 0; }
  dispose() { this.geo.dispose(); this.material.dispose(); }
}

const bx = new THREE.Vector3(), by = new THREE.Vector3(), flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), yawQ = new THREE.Quaternion();
const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Effects {
  readonly group = new THREE.Group();
  private dustP: Points; private sparkP: Points;
  private chunks: THREE.InstancedMesh; private chunk: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; spin: number; size: number; life: number; stay: boolean; rest: boolean; flat: number }[] = []; private chunkNext = 0; private chunkLive = 0;
  private tracers: THREE.InstancedMesh; private tracerLife: Float32Array; private tracerNext = 0; private tracerLive = 0;
  private scorches: THREE.InstancedMesh; private scorchNext = 0; private scorchTag = new Int32Array(32).fill(-1);
  private scars: THREE.InstancedMesh; private scarNext = 0;
  private powders: THREE.InstancedMesh; private powderNext = 0;
  private holes: THREE.InstancedMesh; private holeNext = 0; private holeTag = new Int32Array(256).fill(-1);
  private holeCell = new THREE.InstancedBufferAttribute(new Float32Array(256), 1);
  private pools: THREE.InstancedMesh; private poolNext = 0; private poolLive = 0; private poolCell = new THREE.InstancedBufferAttribute(new Float32Array(24), 1);
  private poolState: ({ x: number; y: number; z: number; rx: number; rz: number; t: number; grow: number; yaw: number } | null)[] = new Array(24).fill(null);
  private flashes: { sprite: THREE.Sprite; life: number; span: number; size: number }[] = [];
  private rings: { mesh: THREE.Mesh; life: number; span: number; size: number }[] = [];
  private textures: THREE.Texture[] = [];
  /** 1 full effects; lower on the performance preset. */
  density = 1;
  constructor(readonly maxChunks = 180) {
    const puff = makeSprite('puff'), flash = makeSprite('flash'), hole = makeMarks(), scorch = makeSprite('scorch'), scar = makeSprite('scar');
    this.textures.push(puff, flash, hole, scorch, scar);
    this.scars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scar, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 80);
    this.scars.frustumCulled = false; this.scars.renderOrder = 2;
    // Plaster powder on the floor under shot walls: soft pale patches that stay for the round.
    this.powders = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: puff, color: 0xd8d2c4, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 64);
    this.powders.frustumCulled = false; this.powders.renderOrder = 1;
    for (let i = 0; i < 64; i++) this.powders.setMatrixAt(i, ZERO);
    for (let i = 0; i < 80; i++) this.scars.setMatrixAt(i, ZERO);
    for (let i = 0; i < 64; i++) this.powders.setMatrixAt(i, ZERO);
    this.powders.instanceMatrix.needsUpdate = true;
    this.scorches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 32);
    this.scorches.frustumCulled = false; this.scorches.renderOrder = 1;
    for (let i = 0; i < 32; i++) this.scorches.setMatrixAt(i, ZERO);
    for (let i = 0; i < 80; i++) this.scars.setMatrixAt(i, ZERO);
    this.scars.instanceMatrix.needsUpdate = true;
    this.dustP = new Points(280, false); this.sparkP = new Points(160, true);
    this.chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), maxChunks);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chunks.frustumCulled = false;
    for (let i = 0; i < maxChunks; i++) { this.chunks.setMatrixAt(i, ZERO); this.chunks.setColorAt(i, col.setRGB(1, 1, 1)); this.chunk.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, spin: 0, size: 0, life: 0, stay: false, rest: false, flat: 0.6 }); }
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, 0.5);
    this.tracers = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }), 40);
    this.tracers.frustumCulled = false; this.tracers.renderOrder = 6; this.tracerLife = new Float32Array(40);
    for (let i = 0; i < 40; i++) this.tracers.setMatrixAt(i, ZERO);
    // Bullet marks: one pool, the mark per material picked from an atlas by a per-instance cell, tinted per instance.
    const markMat = new THREE.MeshBasicMaterial({ map: hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    markMat.onBeforeCompile = sh => { sh.vertexShader = 'attribute float markCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = (vMapUv + vec2(mod(markCell, 4.0), 2.0 - floor(markCell / 4.0))) * vec2(0.25, 1.0 / 3.0);'); };
    markMat.customProgramCacheKey = () => 'breachline-marks';
    const markGeo = new THREE.PlaneGeometry(1, 1);
    markGeo.setAttribute('markCell', this.holeCell);
    this.holes = new THREE.InstancedMesh(markGeo, markMat, 256);
    const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.setAttribute('markCell', this.poolCell);
    this.pools = new THREE.InstancedMesh(poolGeo, markMat, 24); this.pools.frustumCulled = false; this.pools.renderOrder = 1;
    for (let i = 0; i < 24; i++) { this.pools.setMatrixAt(i, ZERO); this.pools.setColorAt(i, col.setRGB(1, 1, 1)); }
    for (let i = 0; i < 256; i++) this.holes.setColorAt(i, col.setRGB(1, 1, 1));
    this.holes.frustumCulled = false; this.holes.renderOrder = 2;
    for (let i = 0; i < 256; i++) this.holes.setMatrixAt(i, ZERO);
    for (let i = 0; i < 10; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sprite.visible = false; sprite.renderOrder = 7; this.group.add(sprite); this.flashes.push({ sprite, life: 0, span: 1, size: 1 });
    }
    // Shock rings: a bright edge racing out across the floor (the impact grenade's signature), pooled.
    const ringTex = makeSprite('ring'); this.textures.push(ringTex);
    const ringGeo = new THREE.PlaneGeometry(1, 1); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, color: 0xd8ecff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
      mesh.visible = false; mesh.renderOrder = 6; this.group.add(mesh); this.rings.push({ mesh, life: 0, span: 1, size: 1 });
    }
    this.group.add(this.pools, this.scorches, this.powders, this.scars, this.holes, this.chunks, this.tracers, this.dustP.object, this.sparkP.object);
  }
  dust(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, r: number, g: number, b: number, alpha = 0.5, grow = 1.6, gravity = 0, drag = 2.2) { this.dustP.add(x, y, z, vx, vy, vz, size, life, r, g, b, alpha, grow, gravity, drag); }
  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, size = 0.05, life = 0.3) { this.sparkP.add(x, y, z, vx, vy, vz, size, life, 1, 0.72, 0.3, 1, -0.6, 9, 1); }
  /** A tumbling chunk. With `stay`, it stays where it comes to rest until the round is cleared (the pool recycles the
   * oldest first). */
  debris(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, r: number, g: number, b: number, stay = false, flat = 0.6) {
    const i = this.chunkNext; this.chunkNext = (this.chunkNext + 1) % this.maxChunks;
    const c = this.chunk[i];
    c.x = x; c.y = y; c.z = z; c.vx = vx; c.vy = vy; c.vz = vz; c.rx = Math.random() * 6; c.ry = Math.random() * 6; c.rz = Math.random() * 6; c.spin = 4 + Math.random() * 9; c.size = size; c.life = 2.2 + Math.random() * 1.6; c.stay = stay; c.rest = false; c.flat = flat;
    this.chunks.setColorAt(i, col.setRGB(r, g, b)); this.chunks.instanceColor!.needsUpdate = true;
    this.chunkLive = 1;
  }
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 1.5) return;
    const i = this.tracerNext; this.tracerNext = (this.tracerNext + 1) % 40;
    mat.lookAt(v.set(bx, by, bz), s.set(ax, ay, az), n.set(0, 1, 0));
    q.setFromRotationMatrix(mat);
    this.tracers.setMatrixAt(i, mat.compose(v.set(ax, ay, az), q, s.set(0.014, 0.014, len)));
    this.tracers.instanceMatrix.needsUpdate = true; this.tracerLife[i] = 0.06; this.tracerLive = 1;
  }
  /** A bullet-hole decal. `tag` names what it is painted on (a wall cell), so it can go when that falls away. */
  hole(x: number, y: number, z: number, nx: number, ny: number, nz: number, size = 0.09, tag = -1, cell = 0, tint: readonly [number, number, number] = [1, 1, 1], aspect: readonly [number, number] = [1, 1], upright = false) {
    const i = this.holeNext; this.holeNext = (this.holeNext + 1) % 256;
    this.holeTag[i] = tag;
    this.holeCell.setX(i, cell); this.holeCell.needsUpdate = true;
    this.holes.setColorAt(i, col.setRGB(tint[0], tint[1], tint[2])); this.holes.instanceColor!.needsUpdate = true;
    if (upright && Math.abs(ny) < 0.9) {
      // Keep the mark's up along the world's up (drips run down), stretched by `aspect` along it.
      n.set(nx, ny, nz); bx.set(0, 1, 0).cross(n).normalize(); by.copy(n).cross(bx);
      q.setFromRotationMatrix(mat.makeBasis(bx, by, n));
    } else q.setFromUnitVectors(up, n.set(nx, ny, nz));
    this.holes.setMatrixAt(i, mat.compose(v.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012), q, s.set(size * aspect[0], size * aspect[1], size)));
    this.holes.instanceMatrix.needsUpdate = true;
  }
  /** A pool spreading on the floor at (x, z) to rx by rz metres over `grow` seconds, at height y (stays for the round). */
  pool(x: number, y: number, z: number, rx: number, rz: number, grow = 4, cell = 11, tint: readonly [number, number, number] = [1, 1, 1], delay = 0) {
    const i = this.poolNext; this.poolNext = (this.poolNext + 1) % 24;
    this.poolState[i] = { x, y, z, rx, rz, t: -delay, grow, yaw: Math.random() * 6.28 };
    this.pools.setColorAt(i, col.setRGB(tint[0], tint[1], tint[2])); this.pools.instanceColor!.needsUpdate = true;
    this.poolCell.setX(i, cell); this.poolCell.needsUpdate = true; this.poolLive = 1;
  }
  /** A round stopped by steel: a bright scar where the paint came off (never a hole). */
  scar(x: number, y: number, z: number, nx: number, ny: number, nz: number, size = 0.06) {
    const i = this.scarNext; this.scarNext = (this.scarNext + 1) % 80;
    q.setFromUnitVectors(up, n.set(nx, ny, nz)).multiply(yawQ.setFromAxisAngle(up, Math.random() * 6.28));
    this.scars.setMatrixAt(i, mat.compose(v.set(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004), q, s.set(size, size, size)));
    this.scars.instanceMatrix.needsUpdate = true;
  }
  /** A patch of plaster powder on the floor (stays for the round). */
  powder(x: number, z: number, size: number) {
    const i = this.powderNext; this.powderNext = (this.powderNext + 1) % 64;
    q.setFromUnitVectors(up, n.set(0, 1, 0)).multiply(yawQ.setFromAxisAngle(up, Math.random() * 6.28));
    this.powders.setMatrixAt(i, mat.compose(v.set(x, 0.004, z), q, s.set(size, size * (0.6 + Math.random() * 0.4), size)));
    this.powders.instanceMatrix.needsUpdate = true;
  }
  /** A soot mark from a blast, on the floor or a wall (`tag` as for holes). */
  scorch(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, tag = -1) {
    const i = this.scorchNext; this.scorchNext = (this.scorchNext + 1) % 32;
    this.scorchTag[i] = tag;
    q.setFromUnitVectors(up, n.set(nx, ny, nz)).multiply(yawQ.setFromAxisAngle(up, Math.random() * 6.28));
    this.scorches.setMatrixAt(i, mat.compose(v.set(x + nx * 0.006, y + ny * 0.006, z + nz * 0.006), q, s.set(size, size, size)));
    this.scorches.instanceMatrix.needsUpdate = true;
  }
  /** Removes the decals painted on something that has gone (a wall cell knocked out). */
  clearHoles(tag: number) {
    let any = false;
    for (let i = 0; i < 32; i++) if (this.scorchTag[i] === tag) { this.scorchTag[i] = -1; this.scorches.setMatrixAt(i, ZERO); this.scorches.instanceMatrix.needsUpdate = true; }
    for (let i = 0; i < 256; i++) if (this.holeTag[i] === tag) { this.holeTag[i] = -1; this.holes.setMatrixAt(i, ZERO); any = true; }
    if (any) this.holes.instanceMatrix.needsUpdate = true;
  }
  flash(x: number, y: number, z: number, size: number, life: number, tint: readonly [number, number, number] = [1, 1, 1]) {
    let f = this.flashes[0];
    for (const c of this.flashes) if (c.life <= 0) { f = c; break; } else if (c.life < f.life) f = c;
    f.life = f.span = life; f.size = size; f.sprite.position.set(x, y, z); f.sprite.scale.setScalar(size); f.sprite.visible = true;
    (f.sprite.material as THREE.SpriteMaterial).opacity = 1; (f.sprite.material as THREE.SpriteMaterial).rotation = Math.random() * 6;
    (f.sprite.material as THREE.SpriteMaterial).color.setRGB(tint[0], tint[1], tint[2]);
  }
  /** A burst of smoke, sparks and a flash. `kind` gives each source its own look: the frag a fiery flash, a heavy
   * dust cloud and debris; the impact grenade a cold white flash, a sharp shock ring and more sparks than smoke. */
  blast(x: number, y: number, z: number, power: number, light: readonly [number, number, number], kind: 'frag' | 'impact' | 'charge' = 'frag') {
    this.flash(x, y, z, 3.2 * power, 0.14, kind === 'impact' ? [0.75, 0.85, 1.3] : [1, 1, 1]);
    if (kind === 'impact') {
      const r = this.rings.reduce((a, b) => (b.life < a.life ? b : a));
      r.life = r.span = 0.28; r.size = 5.5; r.mesh.position.set(x, Math.max(0.03, Math.min(y, 0.06)), z); r.mesh.scale.setScalar(0.3); r.mesh.visible = true;
      for (let i = 0; i < 30 * this.density; i++) { const a = Math.random() * 6.28, sp = 6 + Math.random() * 10; this.spark(x, y, z, Math.cos(a) * sp, Math.random() * 5, Math.sin(a) * sp, 0.05, 0.25 + Math.random() * 0.25); }
    }
    if (kind === 'frag') {
      // Floor and wall bits thrown out that come to rest and stay, and an ember-orange core to the flash.
      this.flash(x, y + 0.2, z, 2.2 * power, 0.22, [1.3, 0.75, 0.4]);
      for (let i = 0; i < 14 * this.density; i++) { const a = Math.random() * 6.28, sp = 2 + Math.random() * 6, g = 0.3 + Math.random() * 0.2; this.debris(x, y + 0.1, z, Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp, 0.02 + Math.random() * 0.04, g * light[0] * 2, g * light[1] * 2, g * light[2] * 2, true, 0.5); }
    }
    // Fewer, denser puffs: each blended layer the size of the screen costs a full-screen pass to fill.
    const count = Math.round(9 * power * this.density);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, sp = 1 + Math.random() * 3.5 * power, g = 0.3 + Math.random() * 0.25;
      this.dust(x, y, z, Math.cos(a) * sp, 0.4 + Math.random() * 2.2, Math.sin(a) * sp, 0.9 + Math.random() * 0.9, 1.6 + Math.random() * 1.6, g * light[0] * 2.4, g * light[1] * 2.4, g * light[2] * 2.4, 0.7, 1.6, -0.25, 1.6);
    }
    for (let i = 0; i < 26 * this.density; i++) { const a = Math.random() * 6.28, sp = 3 + Math.random() * 9; this.spark(x, y, z, Math.cos(a) * sp, 1 + Math.random() * 7, Math.sin(a) * sp, 0.06, 0.35 + Math.random() * 0.4); }
    // The pressure ring: a skirt of dust racing out along the floor, fast and low, then dragging to a stop.
    const ring = Math.round(16 * power * this.density);
    for (let i = 0; i < ring; i++) {
      const a = i / ring * 6.283 + Math.random() * 0.2, sp = 7 + Math.random() * 4 * power, g = 0.42 + Math.random() * 0.2;
      this.dust(x, 0.08 + Math.random() * 0.15, z, Math.cos(a) * sp, 0.2 + Math.random() * 0.5, Math.sin(a) * sp, 0.35 + Math.random() * 0.3, 0.7 + Math.random() * 0.5, g * light[0] * 2, g * light[1] * 2, g * light[2] * 2, 0.4, 3, -0.1, 4.5);
    }
    // Soot on the floor under it.
    if (y < 2.2) this.scorch(x, 0.002, z, 0, 1, 0, (kind === 'impact' ? 0.8 : 1.4) * power + Math.random() * 0.4);
  }
  update(dt: number, pixelHeight: number, fov: number) {
    if (this.poolLive) {
      let growing = 0;
      this.poolState.forEach((p, i) => {
        if (!p || p.t >= p.grow) return;
        p.t = Math.min(p.grow, p.t + dt); growing++;
        const k = p.t <= 0 ? 0 : 1 - (1 - p.t / p.grow) ** 2;
        yawQ.setFromAxisAngle(n.set(0, 1, 0), p.yaw);
        this.pools.setMatrixAt(i, mat.compose(v.set(p.x, p.y, p.z), q.copy(yawQ).multiply(flat), s.set(Math.max(0.01, p.rx * 2 * k), Math.max(0.01, p.rz * 2 * k), 1)));
      });
      this.pools.instanceMatrix.needsUpdate = true;
      if (!growing) this.poolLive = 0;
    }
    this.dustP.update(dt); this.sparkP.update(dt);
    if (this.chunkLive) {
      let any = 0;
      for (let i = 0; i < this.maxChunks; i++) {
        const c = this.chunk[i];
        if (c.life <= 0) continue;
        if (c.rest) { any++; continue; }
        c.life -= dt;
        if (c.life <= 0) { this.chunks.setMatrixAt(i, ZERO); continue; }
        any++;
        c.vy -= 13 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        const floor = c.size * 0.5;
        if (c.y < floor) {
          c.y = floor; c.vy = Math.abs(c.vy) > 1.2 ? -c.vy * 0.32 : 0; c.vx *= 0.55; c.vz *= 0.55; c.spin *= 0.5;
          // Debris that stays lies flat once it stops (and is then left alone: no more updates).
          if (c.stay && c.vy === 0 && Math.hypot(c.vx, c.vz) < 0.15) { c.rest = true; c.life = 1; c.rx = Math.round(c.rx / Math.PI) * Math.PI; c.rz = Math.round(c.rz / Math.PI) * Math.PI; }
        }
        c.rx += c.spin * dt; c.rz += c.spin * 0.7 * dt;
        const k = c.size * Math.min(1, c.life * 2.5);
        this.chunks.setMatrixAt(i, mat.compose(v.set(c.x, c.y, c.z), q.setFromEuler(e.set(c.rx, c.ry, c.rz)), s.set(k, k * c.flat, k)));
      }
      this.chunkLive = any; this.chunks.instanceMatrix.needsUpdate = true;
    }
    if (this.tracerLive) {
      let any = 0;
      for (let i = 0; i < 40; i++) if (this.tracerLife[i] > 0) { if ((this.tracerLife[i] -= dt) <= 0) this.tracers.setMatrixAt(i, ZERO); else any++; }
      this.tracerLive = any; this.tracers.instanceMatrix.needsUpdate = true;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const t = 1 - r.life / r.span; r.mesh.scale.setScalar(0.3 + r.size * Math.sqrt(t)); (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 1.6;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.sprite.visible = false; continue; }
      const t = f.life / f.span; (f.sprite.material as THREE.SpriteMaterial).opacity = t; f.sprite.scale.setScalar(f.size * (1.25 - 0.25 * t));
    }
  }
  /** Objects that are hidden until first use (the flash sprites): shown for a warm-up compile, then hidden again. */
  prime(on: boolean) {
    const f = this.flashes[0]; f.sprite.visible = on; if (on) f.sprite.scale.setScalar(1e-4);
    const r = this.rings[0]; r.mesh.visible = on; if (on) r.mesh.scale.setScalar(1e-4);
  }
  /** A new round: sweep everything away. */
  clear() {
    this.dustP.clear(); this.sparkP.clear();
    for (let i = 0; i < this.maxChunks; i++) { this.chunk[i].life = 0; this.chunks.setMatrixAt(i, ZERO); }
    for (let i = 0; i < 256; i++) this.holes.setMatrixAt(i, ZERO);
    this.holeTag.fill(-1);
    for (let i = 0; i < 24; i++) { this.poolState[i] = null; this.pools.setMatrixAt(i, ZERO); } this.pools.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 32; i++) this.scorches.setMatrixAt(i, ZERO);
    this.scorchTag.fill(-1); this.scorches.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 40; i++) { this.tracerLife[i] = 0; this.tracers.setMatrixAt(i, ZERO); }
    this.chunks.instanceMatrix.needsUpdate = this.holes.instanceMatrix.needsUpdate = this.tracers.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) { f.life = 0; f.sprite.visible = false; }
    for (const r of this.rings) { r.life = 0; r.mesh.visible = false; }
  }
  dispose() {
    this.dustP.dispose(); this.sparkP.dispose();
    for (const m of [this.pools, this.chunks, this.tracers, this.holes, this.scorches, this.scars, this.powders]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); }
    for (const f of this.flashes) f.sprite.material.dispose();
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
    this.rings[0]?.mesh.geometry.dispose();
    for (const t of this.textures) t.dispose();
  }
}
