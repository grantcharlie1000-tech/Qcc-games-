/** The Quad Clash Three.js scene: arena meshes from the collision boxes, fighters, pickups, projectiles, the objective
 * zone, effects, the first-person weapon (a separate overlay scene) and the camera, including the death camera. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BODY, FFA_COLORS, HOUSES, WEAPONS, type WeaponId } from './config';
import { getMap, type MapDef, type MapId, type Material } from './map';
import { buildFighter, buildFlask, buildGun, buildPickup, buildRocket, createKit, disposeOwned, setFighterGun, type FighterModel } from './models';
import { createEffects } from './effects';
import { crestTexture, dotTexture, flashTexture, groundTexture, materialTexture, MATERIAL_SCALE, signTexture, skyTexture } from './textures';
import { modeOf, mapOf } from './sim';
import { weaponOf, type Fighter, type Match, type SimEvent } from './state';

export interface SceneView {
  m: Match;
  /** Interpolation between the previous and current simulation step. */
  alpha: number;
  /** x, y, z per fighter at the previous step. */
  prev: Float32Array;
  yaw: number;
  pitch: number;
  dt: number;
  reduced: boolean;
  colorBlind: boolean;
  /** 0..1 while aiming down sights. */
  ads: number;
  /** Look movement this frame (radians), for weapon sway. */
  lookDX: number;
  lookDY: number;
}

export interface ClashScene {
  setMatch(m: Match): void;
  handle(events: readonly SimEvent[], m: Match): void;
  render(v: SceneView): void;
  resize(width: number, height: number): void;
  setPixelCap(cap: number): void;
  readonly stats: { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
}

export const fighterColor = (m: Match, f: Fighter) => modeOf(m).teams ? HOUSES[f.team].color : FFA_COLORS[f.paint % FFA_COLORS.length];

const PAD = 10;
const VM_HIP = new THREE.Vector3(0.14, -0.145, -0.42);
const VM_ADS = new THREE.Vector3(0, -0.1, -0.4);
const VM_SCALE = 0.6;

export function createScene(canvas: HTMLCanvasElement, opts: { shadows: boolean }): ClashScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = opts.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let pixelCap = 2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 420);
  camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xd9ecff, 0x6f8f52, 1.25);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
  sun.castShadow = opts.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  const kit = createKit();
  const crest = crestTexture(), dot = dotTexture(), flashTex = flashTexture();
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const effects = createEffects(dot);
  scene.add(effects.group);

  let arena: { group: THREE.Group; dispose(): void; flag?: THREE.Mesh } | null = null;
  let arenaId: MapId | null = null;
  const fighterModels: FighterModel[] = [];
  const fighterRoot = new THREE.Group();
  scene.add(fighterRoot);
  const pickupModels = new Map<number, THREE.Group>();
  const pickupRoot = new THREE.Group();
  scene.add(pickupRoot);
  const rockets: THREE.Group[] = [], grenades: THREE.Group[] = [];
  const projRoot = new THREE.Group();
  scene.add(projRoot);

  // Objective zone: floor ring, translucent wall and a tall beacon.
  const zoneGroup = new THREE.Group();
  const zoneWallMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const zoneRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0), zoneWallMat);
  const zoneRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), zoneRingMat);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 40, 8, 1, true).translate(0, 20, 0), zoneWallMat);
  zoneGroup.add(zoneWall, zoneRing, beacon);
  zoneGroup.visible = false;
  scene.add(zoneGroup);

  // ---- First-person weapon overlay ----
  const vmScene = new THREE.Scene();
  const vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const vmSun = new THREE.DirectionalLight(0xffffff, 1.8);
  vmSun.position.set(0.5, 1, 0.6);
  vmScene.add(vmSun);
  const vmRoot = new THREE.Group();
  vmScene.add(vmRoot);
  const vmGuns = new Map<WeaponId, THREE.Group>();
  const vmHands = new THREE.Group();
  const gloveMat = kit.mat(0xf3efe6, { rough: 0.5 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xffc23d, roughness: 0.5 });
  for (const [x, y, z] of [[0.025, -0.09, 0.05], [-0.01, -0.06, -0.22]] as const) {
    const hand = new THREE.Mesh(kit.geo('vmhand', () => new THREE.SphereGeometry(0.042, 12, 10)), gloveMat);
    hand.position.set(x, y, z); hand.scale.set(1, 0.9, 1.25);
    const cuff = new THREE.Mesh(kit.geo('vmcuff', () => new THREE.CylinderGeometry(0.036, 0.04, 0.07, 10).rotateX(Math.PI / 2)), sleeveMat);
    cuff.position.set(x + 0.01, y - 0.02, z + 0.07); cuff.rotation.set(-0.3, 0, 0);
    vmHands.add(hand, cuff);
  }
  vmHands.scale.setScalar(VM_SCALE);
  vmRoot.add(vmHands);
  const vmFlash = new THREE.Sprite(flashMat);
  vmFlash.scale.setScalar(0.12);
  vmFlash.visible = false;
  vmRoot.add(vmFlash);
  let vmGunId: WeaponId | null = null, vmKick = 0, vmFlashT = 0, vmBob = 0, vmSwayX = 0, vmSwayY = 0, vmRaise = 0;
  let shake = 0, lastWidth = 1, lastHeight = 1;
  let deathCam = { active: false, t: 0, x: 0, y: 0, z: 0, killer: -1 };

  function vmGun(id: WeaponId) {
    let g = vmGuns.get(id);
    if (!g) { g = buildGun(kit, id); g.scale.setScalar(VM_SCALE); g.traverse(o => { o.castShadow = false; }); vmGuns.set(id, g); vmRoot.add(g); }
    return g;
  }

  // ---- Arena construction ----
  function buildArena(map: MapDef) {
    const group = new THREE.Group();
    const owned: { dispose(): void }[] = [];
    const byMat = new Map<Material, { p: number[]; n: number[]; uv: number[]; idx: number[] }>();
    for (const b of map.boxes) {
      const acc = byMat.get(b.mat) ?? { p: [], n: [], uv: [], idx: [] };
      byMat.set(b.mat, acc);
      addBox(acc, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, b.mat);
    }
    for (const [mat, acc] of byMat) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(acc.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(acc.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
      geo.setIndex(acc.idx);
      const tex = materialTexture(mat, aniso);
      const material = new THREE.MeshStandardMaterial({ map: tex, roughness: mat === 'metal' || mat === 'roof' ? 0.45 : 0.85, metalness: mat === 'metal' || mat === 'roof' ? 0.35 : 0 });
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      owned.push(geo, tex, material);
    }
    // Rooftop parapets on the perimeter buildings.
    const capGeo: THREE.BufferGeometry[] = [];
    for (const b of map.boxes) if (b.y1 >= map.wallHeight - 0.01 && b.mat === 'brick') {
      capGeo.push(new THREE.BoxGeometry(b.x1 - b.x0 + 0.3, 0.35, b.z1 - b.z0 + 0.3).translate((b.x0 + b.x1) / 2, b.y1 + 0.17, (b.z0 + b.z1) / 2));
    }
    if (capGeo.length) {
      const merged = mergeGeometries(capGeo)!;
      capGeo.forEach(g => g.dispose());
      const capMat = new THREE.MeshStandardMaterial({ color: 0xefe2c4, roughness: 0.8 });
      const caps = new THREE.Mesh(merged, capMat);
      caps.receiveShadow = true;
      group.add(caps);
      owned.push(merged, capMat);
    }
    // Ground plan and the wider lawn beyond the walls.
    const gtex = groundTexture(map, PAD, aniso);
    const gmat = new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.95 });
    const ggeo = new THREE.PlaneGeometry((map.hx + PAD) * 2, (map.hz + PAD) * 2).rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(ggeo, gmat);
    ground.receiveShadow = true;
    group.add(ground);
    const lawnGeo = new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2).translate(0, -0.05, 0);
    const lawnMat = new THREE.MeshLambertMaterial({ color: 0x5f9a48 });
    group.add(new THREE.Mesh(lawnGeo, lawnMat));
    owned.push(gtex, gmat, ggeo, lawnGeo, lawnMat);
    // Distant hills ring the school.
    const hillGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.07, r = 150 + (i % 5) * 22, h = 22 + ((i * 37) % 30);
      hillGeos.push(new THREE.ConeGeometry(30 + (i % 4) * 10, h, 7, 1).translate(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r));
    }
    const hillGeo = mergeGeometries(hillGeos)!;
    hillGeos.forEach(g => g.dispose());
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x4f7f5a, flatShading: true });
    group.add(new THREE.Mesh(hillGeo, hillMat));
    owned.push(hillGeo, hillMat);
    // Trees: trunks are colliders (already in the boxes); canopies are decoration.
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, flatShading: true });
    owned.push(leafGeo, leafMat);
    for (const t of map.trees) {
      for (const [dx, dy, dz, s] of [[0, 0.62, 0, 1.6], [0.7, 0.45, 0.3, 1.1], [-0.6, 0.5, -0.4, 1.15], [0.1, 0.85, -0.2, 1]] as const) {
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(t.x + dx, t.h * dy + 1.4, t.z + dz); leaf.scale.setScalar(s * (t.h / 5));
        leaf.castShadow = true;
        group.add(leaf);
      }
    }
    // Bushes along the planters.
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x4c9a3e, flatShading: true });
    owned.push(bushMat);
    for (const b of map.boxes) if (b.mat === 'planter') {
      const along = b.x1 - b.x0 > b.z1 - b.z0, len = along ? b.x1 - b.x0 : b.z1 - b.z0;
      for (let k = 0.6; k < len; k += 0.9) {
        const bush = new THREE.Mesh(leafGeo, bushMat);
        bush.position.set(along ? b.x0 + k : (b.x0 + b.x1) / 2, b.y1 + 0.15, along ? (b.z0 + b.z1) / 2 : b.z0 + k);
        bush.scale.set(0.45, 0.32, 0.45);
        group.add(bush);
      }
    }
    // Signs.
    for (const s of map.signs) {
      const tex = signTexture(s.text, s.sub, s.w, s.h);
      const geo = new THREE.PlaneGeometry(s.w, s.h);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      const sign = new THREE.Mesh(geo, mat);
      const off = 0.03;
      if (s.face === 's') sign.position.set(s.x, s.y, s.z + off);
      if (s.face === 'n') { sign.position.set(s.x, s.y, s.z - off); sign.rotation.y = Math.PI; }
      if (s.face === 'e') { sign.position.set(s.x + off, s.y, s.z); sign.rotation.y = Math.PI / 2; }
      if (s.face === 'w') { sign.position.set(s.x - off, s.y, s.z); sign.rotation.y = -Math.PI / 2; }
      group.add(sign);
      owned.push(tex, geo, mat);
    }
    // The school flag on the north roof.
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 7, 8).translate(0, 3.5, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(-map.hx * 0.45, map.wallHeight, -map.hz - 2);
    const flagTex = crestTexture();
    const flagGeo = new THREE.PlaneGeometry(2.4, 1.5, 12, 4).translate(1.2, 0, 0);
    const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
    const flagBack = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0x1d2f5c, side: THREE.DoubleSide }));
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0, 6.1, 0); flagBack.position.set(0, 6.1, -0.01);
    pole.add(flag, flagBack);
    group.add(pole);
    owned.push(poleGeo, poleMat, flagTex, flagGeo, flagMat, flagBack.material as THREE.Material);
    // Sun and shadow frustum fitted to the arena.
    const ext = Math.max(map.hx, map.hz) + 6;
    sun.position.set(ext * 0.8, 60, ext * 0.5);
    sun.target.position.set(0, 0, 0);
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 160 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.background = skyTexture(map);
    owned.push(scene.background as THREE.Texture);
    scene.fog = new THREE.Fog(map.ground === 'field' ? 0xe8e4d6 : 0xd8ebf5, 70, 260);
    return { group, flag, dispose() { owned.forEach(o => o.dispose()); } };
  }

  function addBox(acc: { p: number[]; n: number[]; uv: number[]; idx: number[] }, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Material) {
    const sc = MATERIAL_SCALE[mat];
    const face = (corners: number[][], n: [number, number, number], uvs: number[][]) => {
      const base = acc.p.length / 3;
      for (let i = 0; i < 4; i++) { acc.p.push(...corners[i]); acc.n.push(...n); acc.uv.push(...uvs[i]); }
      acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const U = (v: number) => v / sc.u, V = (v: number) => v / sc.v;
    const fu = (a0: number, a1: number, b0: number, b1: number, wu: (v: number) => number, wv: (v: number) => number) => sc.face ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[wu(a0), wv(b0)], [wu(a1), wv(b0)], [wu(a1), wv(b1)], [wu(a0), wv(b1)]];
    // +z face (front), counter-clockwise from bottom-left as seen from outside.
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], fu(x0, x1, y0, y1, U, V));
    face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], fu(-x1, -x0, y0, y1, U, V));
    face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], fu(-z1, -z0, y0, y1, U, V));
    face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], fu(z0, z1, y0, y1, U, V));
    face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], fu(x0, x1, -z1, -z0, U, U));
    if (y0 > 0.01) face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], fu(x0, x1, z0, z1, U, U));
  }

  function clearDynamic() {
    for (const fm of fighterModels) { disposeOwned(fm.group); fighterRoot.remove(fm.group); }
    fighterModels.length = 0;
    for (const g of pickupModels.values()) pickupRoot.remove(g);
    pickupModels.clear();
    effects.clear();
  }

  // ---- Per-frame helpers ----
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let time = 0;

  function syncFighters(v: SceneView) {
    const m = v.m;
    for (const f of m.fighters) {
      const fm = fighterModels[f.id];
      const local = f.id === 0;
      fm.group.visible = f.alive && !local;
      if (!fm.group.visible) continue;
      const a = v.alpha, px = v.prev[f.id * 3], py = v.prev[f.id * 3 + 1], pz = v.prev[f.id * 3 + 2];
      const x = px + (f.x - px) * a, y = py + (f.y - py) * a, z = pz + (f.z - pz) * a;
      fm.group.position.set(x, y, z);
      fm.group.rotation.y = f.yaw;
      fm.arms.rotation.x = f.pitch * 0.8;
      setFighterGun(kit, fm, weaponOf(f).id);
      const speed = Math.hypot(f.vx, f.vz);
      fm.walk += speed * v.dt * 2.4;
      const sw = Math.sin(fm.walk) * 0.13 * Math.min(1, speed / 5);
      fm.feet[0].position.z = -0.04 + sw; fm.feet[1].position.z = -0.04 - sw;
      fm.feet[0].position.y = 0.09 + Math.max(0, Math.cos(fm.walk)) * 0.06 * Math.min(1, speed / 5);
      fm.feet[1].position.y = 0.09 + Math.max(0, -Math.cos(fm.walk)) * 0.06 * Math.min(1, speed / 5);
      fm.body.position.y = 0.78 + (v.reduced ? 0 : Math.abs(Math.sin(fm.walk)) * 0.03 * Math.min(1, speed / 5));
      fm.shield.visible = m.t < f.shieldUntil;
      const protectedNow = m.t < f.protectUntil;
      if (protectedNow && !v.reduced) fm.group.visible = Math.floor(time * 10) % 2 === 0;
      fm.marker.visible = modeOf(m).teams && f.team === m.fighters[0].team;
      fm.marker.rotation.y = time * 2;
      if (fm.flashTime > 0) {
        fm.flashTime -= v.dt;
        const muzzle = (fm.gunHolder.children[0]?.userData.muzzle as number | undefined) ?? -0.6;
        fm.gunHolder.updateWorldMatrix(true, false);
        tmp.set(0, 0.02, muzzle).applyMatrix4(fm.gunHolder.matrixWorld);
        fm.group.worldToLocal(tmp);
        fm.flash.position.copy(tmp);
        fm.flash.visible = true;
        fm.flash.material.rotation = Math.random() * 6;
      } else fm.flash.visible = false;
    }
  }

  function syncPickups(m: Match) {
    const seen = new Set<number>();
    for (const p of m.pickups) {
      seen.add(p.id);
      let g = pickupModels.get(p.id);
      if (!g) { g = buildPickup(kit, p.kind); pickupModels.set(p.id, g); pickupRoot.add(g); }
      g.visible = p.active;
      g.position.set(p.x, p.y + 0.45 + Math.sin(time * 2.4 + p.id) * 0.08, p.z);
      g.rotation.y = time * 1.6 + p.id;
      if (p.dropped && p.expires - m.t < 4) g.visible = p.active && Math.floor(time * 6) % 2 === 0;
    }
    for (const [id, g] of pickupModels) if (!seen.has(id)) { pickupRoot.remove(g); pickupModels.delete(id); }
  }

  function syncProjectiles(v: SceneView) {
    let r = 0, gI = 0;
    for (const p of v.m.projectiles) {
      if (p.kind === 'rocket') {
        let mesh = rockets[r];
        if (!mesh) { mesh = buildRocket(kit); rockets.push(mesh); projRoot.add(mesh); }
        mesh.visible = true;
        mesh.position.set(p.x, p.y, p.z);
        tmp.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        mesh.lookAt(tmp);
        if (!v.reduced || Math.random() < 0.4) effects.smoke(p.x, p.y, p.z, 1, 0.3);
        r++;
      } else {
        let mesh = grenades[gI];
        if (!mesh) { mesh = buildFlask(kit, 1.3); grenades.push(mesh); projRoot.add(mesh); }
        mesh.visible = true;
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.x += v.dt * 8; mesh.rotation.z += v.dt * 5;
        gI++;
      }
    }
    for (let i = r; i < rockets.length; i++) rockets[i].visible = false;
    for (let i = gI; i < grenades.length; i++) grenades[i].visible = false;
  }

  function syncZone(m: Match) {
    if (m.settings.mode !== 'quad' || m.over) { zoneGroup.visible = false; return; }
    const z = mapOf(m).zones[m.zoneIndex];
    zoneGroup.visible = true;
    zoneGroup.position.set(z.x, z.y + 0.03, z.z);
    zoneWall.scale.set(z.r, 2.4, z.r);
    zoneRing.scale.set(z.r, 1, z.r);
    const color = m.zoneOwner >= 0 ? HOUSES[m.zoneOwner].color : m.zoneOwner === -2 ? (Math.floor(time * 4) % 2 ? 0xff4d6a : 0xffffff) : 0xffffff;
    zoneWallMat.color.setHex(color); zoneRingMat.color.setHex(color);
    zoneWallMat.opacity = 0.12 + Math.sin(time * 3) * 0.04;
  }

  function updateViewmodel(v: SceneView, you: Fighter) {
    const wpn = weaponOf(you);
    const gun = vmGun(wpn.id);
    if (vmGunId !== wpn.id) { for (const [id, g] of vmGuns) g.visible = id === wpn.id; vmGunId = wpn.id; }
    const scoped = wpn.id === 'valedictorian' && v.ads > 0.85;
    vmRoot.visible = you.alive && !scoped && !v.m.over;
    if (!vmRoot.visible) return;
    const speed = Math.hypot(you.vx, you.vz), dt = v.dt;
    vmBob += speed * dt * 1.6;
    const bobAmt = v.reduced ? 0 : Math.min(1, speed / 6) * (1 - v.ads * 0.85) * (you.grounded ? 1 : 0.3);
    vmSwayX += (-v.lookDX * 0.6 - vmSwayX) * Math.min(1, dt * 10);
    vmSwayY += (v.lookDY * 0.6 - vmSwayY) * Math.min(1, dt * 10);
    vmKick = Math.max(0, vmKick - dt * 9);
    vmRaise = Math.max(0, vmRaise - dt * 3.5);
    let reload = 0;
    if (you.reloadEnd > 0) reload = Math.sin(Math.min(1, (v.m.t - you.reloadStart) / Math.max(0.01, you.reloadEnd - you.reloadStart)) * Math.PI);
    const base = tmp.copy(VM_HIP).lerp(VM_ADS, v.ads);
    gun.position.set(
      base.x + Math.sin(vmBob) * 0.012 * bobAmt + vmSwayX * (v.reduced ? 0.2 : 1),
      base.y + Math.abs(Math.cos(vmBob)) * 0.01 * bobAmt + vmSwayY * (v.reduced ? 0.2 : 1) - reload * 0.08 - vmRaise * 0.25,
      base.z + vmKick * 0.07,
    );
    gun.rotation.set(vmKick * (v.reduced ? 0.05 : 0.18) + reload * 0.5 - vmRaise * 0.6, vmSwayX * 0.6, -reload * 0.5);
    vmHands.position.copy(gun.position);
    vmHands.rotation.copy(gun.rotation);
    sleeveMat.color.setHex(fighterColor(v.m, you));
    const muzzle = (gun.userData.muzzle as number) ?? -0.6;
    if (vmFlashT > 0) {
      vmFlashT -= dt;
      tmp2.set(0, 0.02 * VM_SCALE, muzzle * VM_SCALE).applyEuler(gun.rotation).add(gun.position);
      vmFlash.position.copy(tmp2);
      vmFlash.visible = true;
      vmFlash.material.rotation = Math.random() * 6;
    } else vmFlash.visible = false;
  }

  /** World position of the local player's muzzle, for tracer starts. */
  function localMuzzle(out: THREE.Vector3) {
    return out.set(0.16, -0.13, -0.6).applyQuaternion(camera.quaternion).add(camera.position);
  }

  const api: ClashScene = {
    stats: { calls: 0, triangles: 0, pixelRatio: 1 },
    setMatch(m) {
      clearDynamic();
      deathCam.active = false;
      if (arenaId !== m.settings.map) {
        if (arena) { scene.remove(arena.group); arena.dispose(); }
        arena = buildArena(getMap(m.settings.map));
        arenaId = m.settings.map;
        scene.add(arena.group);
      }
      for (const f of m.fighters) {
        const fm = buildFighter(kit, fighterColor(m, f), crest, flashMat);
        fighterModels.push(fm);
        fighterRoot.add(fm.group);
      }
    },
    handle(events, m) {
      for (const e of events) {
        switch (e.type) {
          case 'shot': {
            if (e.owner === 0) { vmKick = Math.min(1.4, vmKick + (WEAPONS[e.weapon].recoil > 0.04 ? 1 : 0.55)); vmFlashT = 0.05; }
            else { const fm = fighterModels[e.owner]; if (fm) fm.flashTime = 0.05; }
            break;
          }
          case 'tracer': {
            if (e.owner === 0) localMuzzle(tmp); else { const f = m.fighters[e.owner]; tmp.set(f.x, f.y + BODY.eye - 0.3, f.z); }
            if (e.weapon !== 'detention' || Math.random() < 0.4) effects.tracer(tmp.x, tmp.y, tmp.z, e.tx, e.ty, e.tz, e.owner === 0 ? 0xfff1b0 : 0xffd27a);
            if (e.impact === 'world') effects.sparks(e.tx, e.ty, e.tz, e.nx, e.ny, e.nz, 0xe6dccb, 3, 2.5);
            break;
          }
          case 'hit': {
            const f = m.fighters[e.target];
            effects.sparks(e.x, e.y, e.z, 0, 0.5, 0, fighterColor(m, f), e.head ? 9 : 5, 3);
            if (e.target === 0) shake = Math.min(1, shake + e.amount / 60);
            break;
          }
          case 'kill': {
            const f = m.fighters[e.victim];
            // Your own burst would fill the death camera: only other fighters scatter confetti.
            if (e.victim !== 0) { effects.confetti(f.x, f.y + 0.6, f.z, fighterColor(m, f), 70); effects.smoke(f.x, f.y + 0.8, f.z, 6, 0.6); }
            if (e.victim === 0) deathCam = { active: true, t: 0, x: f.x, y: f.y + BODY.eye, z: f.z, killer: e.killer };
            break;
          }
          case 'explode': {
            effects.blast(e.x, e.y, e.z, e.r * 0.6);
            const you = m.fighters[0];
            const d = Math.hypot(you.x - e.x, you.y - e.y, you.z - e.z);
            if (d < 18) shake = Math.min(1, shake + (1 - d / 18) * 0.8);
            break;
          }
          case 'spawn': if (e.owner === 0) { deathCam.active = false; vmRaise = 1; } break;
          case 'swap': if (e.owner === 0) vmRaise = 1; break;
          case 'pickup': { const f = m.fighters[e.owner]; effects.sparks(f.x, f.y + 0.8, f.z, 0, 1, 0, e.kind === 'ammo' ? 0xf2b733 : 0x7dff8a, 8, 2); break; }
          case 'land': if (e.owner !== 0) { const f = m.fighters[e.owner]; effects.smoke(f.x, f.y + 0.1, f.z, 3, 0.4); } break;
        }
      }
    },
    render(v) {
      const m = v.m, you = m.fighters[0];
      time += v.dt;
      syncFighters(v);
      syncPickups(m);
      syncProjectiles(v);
      syncZone(m);
      effects.update(v.dt, v.reduced);
      if (arena?.flag) arena.flag.rotation.y = v.reduced ? 0.2 : Math.sin(time * 1.7) * 0.25;
      // Camera.
      const aspect = lastWidth / lastHeight;
      const baseFov = aspect >= 1 ? 74 : Math.min(98, 74 + (1 - aspect) * 46);
      const zoom = 1 + (weaponOf(you).zoom - 1) * v.ads;
      const fov = baseFov / zoom;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      effects.setScale((lastHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      shake = Math.max(0, shake - v.dt * 2.5);
      const sk = v.reduced ? 0 : shake * shake * 0.06;
      if (you.alive || !deathCam.active) {
        const a = v.alpha, px = v.prev[0], py = v.prev[1], pz = v.prev[2];
        camera.position.set(px + (you.x - px) * a, py + (you.y - py) * a + BODY.eye, pz + (you.z - pz) * a);
        camera.rotation.set(v.pitch + (Math.random() - 0.5) * sk, v.yaw + (Math.random() - 0.5) * sk, 0);
      } else {
        // Death camera: drift up and back from where you fell, watching whoever got you.
        deathCam.t += v.dt;
        const k = Math.min(1, deathCam.t / 1.2), e = 1 - (1 - k) * (1 - k);
        const killer = m.fighters[deathCam.killer];
        const look = killer && killer.id !== 0 && killer.alive ? tmp2.set(killer.x, killer.y + 1.2, killer.z) : tmp2.set(deathCam.x, deathCam.y - 1, deathCam.z);
        const dx = deathCam.x - look.x, dz = deathCam.z - look.z, dl = Math.hypot(dx, dz) || 1;
        camera.position.set(deathCam.x + (dx / dl) * 2.5 * e, deathCam.y + 2.4 * e, deathCam.z + (dz / dl) * 2.5 * e);
        camera.lookAt(look);
      }
      updateViewmodel(v, you);
      vmCamera.aspect = aspect;
      vmCamera.fov = aspect >= 1 ? 55 : 70;
      vmCamera.updateProjectionMatrix();
      renderer.info.reset();
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(vmScene, vmCamera);
      api.stats.calls = renderer.info.render.calls;
      api.stats.triangles = renderer.info.render.triangles;
    },
    resize(width, height) {
      lastWidth = Math.max(1, width); lastHeight = Math.max(1, height);
      const ratio = Math.min(window.devicePixelRatio || 1, pixelCap);
      renderer.setPixelRatio(ratio);
      renderer.setSize(lastWidth, lastHeight, false);
      camera.aspect = lastWidth / lastHeight;
      camera.updateProjectionMatrix();
      api.stats.pixelRatio = ratio;
    },
    setPixelCap(cap) { pixelCap = cap; api.resize(lastWidth, lastHeight); },
    dispose() {
      clearDynamic();
      if (arena) { arena.dispose(); arena = null; }
      effects.dispose();
      kit.dispose();
      crest.dispose(); dot.dispose(); flashTex.dispose(); flashMat.dispose(); sleeveMat.dispose();
      zoneWall.geometry.dispose(); zoneRing.geometry.dispose(); beacon.geometry.dispose(); zoneWallMat.dispose(); zoneRingMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return api;
}
