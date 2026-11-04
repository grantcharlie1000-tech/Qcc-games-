/** Low-poly models built from Three.js primitives: the Q-bot fighters, the eight school-themed weapons, pickups and
 * projectiles. Shared geometries and materials are cached per mount and released by disposeModels(). */
import * as THREE from 'three';
import type { WeaponId } from './config';

export interface ModelKit {
  mat(color: number, opts?: { emissive?: number; rough?: number; metal?: number; transparent?: number }): THREE.MeshStandardMaterial;
  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T;
  dispose(): void;
}

export function createKit(): ModelKit {
  const mats = new Map<string, THREE.MeshStandardMaterial>(), geos = new Map<string, THREE.BufferGeometry>();
  return {
    mat(color, opts = {}) {
      const key = `${color}|${opts.emissive ?? ''}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.transparent ?? ''}`;
      let m = mats.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.05, flatShading: false });
        if (opts.emissive !== undefined) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 1; }
        if (opts.transparent !== undefined) { m.transparent = true; m.opacity = opts.transparent; m.depthWrite = false; }
        mats.set(key, m);
      }
      return m;
    },
    geo(key, make) {
      let g = geos.get(key);
      if (!g) { g = make(); geos.set(key, g); }
      return g as ReturnType<typeof make>;
    },
    dispose() { for (const m of mats.values()) m.dispose(); for (const g of geos.values()) g.dispose(); mats.clear(); geos.clear(); },
  };
}

const NAVY = 0x1d2f5c, GOLD = 0xf2b733, DARK = 0x2b2f36, STEEL = 0x8c96a1, WOOD = 0x9a6436;

function boxMesh(kit: ModelKit, w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, opts?: Parameters<ModelKit['mat']>[1]) {
  const m = new THREE.Mesh(kit.geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), kit.mat(color, opts));
  m.position.set(x, y, z);
  return m;
}
function cyl(kit: ModelKit, r: number, len: number, color: number, x = 0, y = 0, z = 0, opts?: Parameters<ModelKit['mat']>[1], r2 = r, seg = 12) {
  const m = new THREE.Mesh(kit.geo(`c${r},${r2},${len},${seg}`, () => new THREE.CylinderGeometry(r, r2, len, seg)), kit.mat(color, opts));
  m.rotation.x = Math.PI / 2; // along z
  m.position.set(x, y, z);
  return m;
}

/** A weapon model pointing down -z with its muzzle position stored in userData.muzzle (local). */
export function buildGun(kit: ModelKit, id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  let muzzle = -0.6;
  switch (id) {
    case 'bell':
      g.add(boxMesh(kit, 0.07, 0.11, 0.46, NAVY, 0, 0, -0.1), cyl(kit, 0.018, 0.3, DARK, 0, 0.02, -0.48), boxMesh(kit, 0.05, 0.16, 0.08, GOLD, 0, -0.11, -0.14),
        boxMesh(kit, 0.06, 0.1, 0.2, NAVY, 0, -0.01, 0.2), boxMesh(kit, 0.04, 0.04, 0.12, DARK, 0, 0.08, -0.1), boxMesh(kit, 0.05, 0.12, 0.05, DARK, 0, -0.1, 0.05));
      // The bell on the top rail.
      g.add(new THREE.Mesh(kit.geo('bell', () => new THREE.ConeGeometry(0.035, 0.05, 10)), kit.mat(GOLD, { metal: 0.6, rough: 0.3 })).translateY(0.13).translateZ(-0.24));
      muzzle = -0.64;
      break;
    case 'detention':
      g.add(cyl(kit, 0.032, 0.62, DARK, 0, 0.02, -0.32), cyl(kit, 0.028, 0.5, DARK, 0, -0.045, -0.28), boxMesh(kit, 0.07, 0.08, 0.2, WOOD, 0, -0.045, -0.3),
        boxMesh(kit, 0.07, 0.1, 0.18, NAVY, 0, -0.01, 0.02), boxMesh(kit, 0.06, 0.11, 0.24, WOOD, 0, -0.04, 0.22));
      muzzle = -0.64;
      break;
    case 'hallpass':
      g.add(boxMesh(kit, 0.06, 0.1, 0.56, 0xe9e1cf, 0, 0, -0.12), cyl(kit, 0.016, 0.28, DARK, 0, 0.02, -0.52), cyl(kit, 0.03, 0.2, DARK, 0, 0.1, -0.1),
        boxMesh(kit, 0.04, 0.12, 0.06, NAVY, 0, -0.1, -0.1), boxMesh(kit, 0.06, 0.12, 0.2, NAVY, 0, -0.02, 0.24));
      // Lanyard tag.
      g.add(boxMesh(kit, 0.005, 0.07, 0.05, GOLD, 0.035, -0.05, 0.05));
      muzzle = -0.67;
      break;
    case 'firedrill':
      g.add(cyl(kit, 0.075, 0.78, 0xd8322b, 0, 0.02, -0.18, { rough: 0.35 }), cyl(kit, 0.082, 0.05, GOLD, 0, 0.02, -0.5), cyl(kit, 0.082, 0.05, GOLD, 0, 0.02, 0.12),
        cyl(kit, 0.05, 0.08, DARK, 0, 0.02, -0.6, undefined, 0.08), boxMesh(kit, 0.05, 0.13, 0.06, DARK, 0, -0.1, -0.05), boxMesh(kit, 0.04, 0.06, 0.1, DARK, 0, 0.1, -0.2));
      muzzle = -0.62;
      break;
    case 'recess':
      g.add(boxMesh(kit, 0.07, 0.1, 0.3, 0x37c98b, 0, 0, -0.05), cyl(kit, 0.016, 0.14, DARK, 0, 0.01, -0.26), boxMesh(kit, 0.04, 0.22, 0.05, DARK, 0, -0.15, -0.08),
        boxMesh(kit, 0.05, 0.11, 0.05, DARK, 0, -0.09, 0.05), boxMesh(kit, 0.03, 0.03, 0.18, GOLD, 0, 0.065, -0.05));
      muzzle = -0.34;
      break;
    case 'valedictorian':
      g.add(boxMesh(kit, 0.065, 0.1, 0.5, NAVY, 0, 0, -0.08), cyl(kit, 0.018, 0.5, DARK, 0, 0.02, -0.58), cyl(kit, 0.038, 0.32, DARK, 0, 0.11, -0.1),
        cyl(kit, 0.045, 0.04, GOLD, 0, 0.11, -0.27), boxMesh(kit, 0.06, 0.13, 0.22, NAVY, 0, -0.02, 0.26), boxMesh(kit, 0.05, 0.1, 0.05, GOLD, 0, -0.1, 0.0));
      // Mortarboard tassel on the scope.
      g.add(boxMesh(kit, 0.09, 0.01, 0.09, DARK, 0, 0.16, -0.02), boxMesh(kit, 0.008, 0.06, 0.008, GOLD, 0.04, 0.13, 0.02));
      muzzle = -0.84;
      break;
    case 'triple':
      g.add(boxMesh(kit, 0.075, 0.12, 0.5, 0x6c4fd1, 0, 0, -0.08), cyl(kit, 0.02, 0.22, DARK, 0, 0.02, -0.43), boxMesh(kit, 0.05, 0.13, 0.08, DARK, 0, -0.11, 0.08),
        boxMesh(kit, 0.06, 0.04, 0.14, DARK, 0, 0.08, -0.12));
      for (let i = 0; i < 3; i++) g.add(boxMesh(kit, 0.078, 0.02, 0.025, GOLD, 0, 0.03, -0.24 + i * 0.05));
      muzzle = -0.55;
      break;
    case 'pencil':
      // A giant pencil: yellow hexagonal barrel, sharpened graphite tip, pink eraser grip.
      g.add(new THREE.Mesh(kit.geo('pencil-body', () => new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6).rotateX(Math.PI / 2)), kit.mat(0xffc93c)).translateZ(-0.12));
      g.add(new THREE.Mesh(kit.geo('pencil-tip', () => new THREE.ConeGeometry(0.035, 0.09, 6).rotateX(-Math.PI / 2)), kit.mat(0xf1d7a8)).translateZ(-0.295));
      g.add(new THREE.Mesh(kit.geo('pencil-lead', () => new THREE.ConeGeometry(0.012, 0.03, 6).rotateX(-Math.PI / 2)), kit.mat(DARK)).translateZ(-0.345));
      g.add(cyl(kit, 0.037, 0.03, 0xb9bec4, 0, 0, 0.025, { metal: 0.6 }), boxMesh(kit, 0.05, 0.13, 0.06, 0xf28bb0, 0, -0.08, 0.04));
      muzzle = -0.36;
      break;
  }
  g.userData.muzzle = muzzle;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return g;
}

export interface FighterModel {
  group: THREE.Group;
  body: THREE.Mesh;
  arms: THREE.Group;
  gunHolder: THREE.Group;
  feet: [THREE.Mesh, THREE.Mesh];
  shield: THREE.Mesh;
  marker: THREE.Mesh;
  gunId: WeaponId | null;
  walk: number;
  flash: THREE.Sprite;
  flashTime: number;
}

/** A Q-bot: rounded body in the fighter's colour, pale helmet, dark visor with glowing eyes, antenna and QCC crest. */
export function buildFighter(kit: ModelKit, color: number, crest: THREE.Texture, flashMat: THREE.SpriteMaterial): FighterModel {
  const group = new THREE.Group();
  const bodyMat = kit.mat(color, { rough: 0.45 });
  const body = new THREE.Mesh(kit.geo('fbody', () => new THREE.CapsuleGeometry(0.36, 0.42, 6, 16)), bodyMat);
  body.position.y = 0.78;
  const belly = new THREE.Mesh(kit.geo('fbelly', () => new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)), kit.mat(0xf3efe6));
  belly.rotation.x = -Math.PI / 2; belly.position.set(0, 0.72, -0.12); belly.scale.set(0.9, 0.95, 0.75);
  const head = new THREE.Mesh(kit.geo('fhead', () => new THREE.SphereGeometry(0.29, 18, 14)), kit.mat(0xf3efe6, { rough: 0.35 }));
  head.position.y = 1.43;
  const cap = new THREE.Mesh(kit.geo('fcap', () => new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)), bodyMat);
  cap.position.y = 1.45;
  const visor = new THREE.Mesh(kit.geo('fvisor', () => new THREE.SphereGeometry(0.235, 18, 12, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.32, Math.PI * 0.34)), kit.mat(0x14213d, { rough: 0.15, metal: 0.4 }));
  visor.position.set(0, 1.42, -0.07); visor.scale.set(1.12, 1, 1.1);
  const eyeMat = kit.mat(0x9ff3ff, { emissive: 0x6fe6ff });
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(kit.geo('feye', () => new THREE.SphereGeometry(0.035, 8, 6)), eyeMat);
    eye.position.set(x, 1.44, -0.315); eye.scale.set(1, 1.3, 0.5);
    group.add(eye);
  }
  const antenna = new THREE.Mesh(kit.geo('fant', () => new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6)), kit.mat(DARK));
  antenna.position.set(0.12, 1.78, 0.04);
  const bulb = new THREE.Mesh(kit.geo('fbulb', () => new THREE.SphereGeometry(0.045, 10, 8)), kit.mat(color, { emissive: color }));
  bulb.position.set(0.12, 1.9, 0.04);
  const badge = new THREE.Mesh(kit.geo('fbadge', () => new THREE.PlaneGeometry(0.2, 0.2)), new THREE.MeshStandardMaterial({ map: crest, transparent: true, roughness: 0.5 }));
  badge.position.set(-0.15, 0.98, -0.33); badge.rotation.y = Math.PI + 0.35; badge.rotation.x = 0.1;
  badge.userData.ownMaterial = true;
  const feet: [THREE.Mesh, THREE.Mesh] = [0, 1].map(i => {
    const f = new THREE.Mesh(kit.geo('ffoot', () => new THREE.CapsuleGeometry(0.09, 0.12, 4, 8).rotateX(Math.PI / 2)), kit.mat(DARK));
    f.position.set(i ? 0.16 : -0.16, 0.09, -0.04);
    return f;
  }) as unknown as [THREE.Mesh, THREE.Mesh];
  const arms = new THREE.Group();
  arms.position.set(0, 1.1, 0);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.24, -0.05, -0.32);
  gunHolder.scale.setScalar(1.25);
  arms.add(gunHolder);
  for (const [x, z] of [[0.24, -0.18], [0.12, -0.5]] as const) {
    const hand = new THREE.Mesh(kit.geo('fhand', () => new THREE.SphereGeometry(0.075, 10, 8)), kit.mat(0xf3efe6));
    hand.position.set(x, -0.1, z);
    arms.add(hand);
  }
  const shield = new THREE.Mesh(kit.geo('fshield', () => new THREE.SphereGeometry(1.05, 20, 14)), kit.mat(0x9fe8ff, { transparent: 0.22, emissive: 0x2a8fb5 }));
  shield.position.y = 0.95; shield.visible = false;
  const marker = new THREE.Mesh(kit.geo('fmarker', () => new THREE.ConeGeometry(0.13, 0.22, 4).rotateX(Math.PI)), kit.mat(color, { emissive: color }));
  marker.position.y = 2.25; marker.visible = false;
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(0.45); flash.visible = false;
  group.add(body, belly, head, cap, visor, antenna, bulb, badge, ...feet, arms, shield, marker, flash);
  for (const m of [body, head, cap, ...feet]) m.castShadow = true;
  return { group, body, arms, gunHolder, feet, shield, marker, gunId: null, walk: 0, flash, flashTime: 0 };
}

export function setFighterGun(kit: ModelKit, model: FighterModel, id: WeaponId) {
  if (model.gunId === id) return;
  model.gunHolder.clear();
  const gun = buildGun(kit, id);
  model.gunHolder.add(gun);
  model.gunId = id;
}

/** Ammo box: a navy case with a gold band. Grenade: the Science Fair flask with green fizz. */
export function buildPickup(kit: ModelKit, kind: 'ammo' | 'grenade'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'ammo') {
    g.add(boxMesh(kit, 0.55, 0.32, 0.36, NAVY), boxMesh(kit, 0.57, 0.08, 0.38, GOLD), boxMesh(kit, 0.18, 0.05, 0.05, DARK, 0, 0.19, 0));
  } else {
    g.add(buildFlask(kit, 1.6));
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function buildFlask(kit: ModelKit, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(kit.geo('flask', () => new THREE.SphereGeometry(0.1, 14, 10)), kit.mat(0x7dff8a, { emissive: 0x2fbf4a, rough: 0.2 }));
  const neck = new THREE.Mesh(kit.geo('flask-neck', () => new THREE.CylinderGeometry(0.035, 0.05, 0.1, 10)), kit.mat(0xd8f3ff, { transparent: 0.7 }));
  neck.position.y = 0.12;
  const cork = new THREE.Mesh(kit.geo('flask-cork', () => new THREE.CylinderGeometry(0.04, 0.035, 0.05, 10)), kit.mat(WOOD));
  cork.position.y = 0.19;
  g.add(glass, neck, cork);
  g.scale.setScalar(scale);
  return g;
}

export function buildRocket(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(kit, 0.06, 0.32, 0xd8322b), cyl(kit, 0.062, 0.05, GOLD, 0, 0, 0.1));
  const tip = new THREE.Mesh(kit.geo('rtip', () => new THREE.ConeGeometry(0.06, 0.14, 10).rotateX(-Math.PI / 2)), kit.mat(0xf3efe6));
  tip.position.z = -0.23;
  g.add(tip);
  return g;
}

export function disposeOwned(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.ownMaterial) (mesh.material as THREE.Material).dispose();
  });
}
