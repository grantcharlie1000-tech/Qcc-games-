/** The hero models: the weapon in hand (with its own scene, camera and lights) and the fighters in the world.
 * `scene.ts` constructs these two, forwards the per-frame view and the match events, and renders the viewmodel after
 * the world. Lighting arrives through `HeroLighting`, so the same code works under the simple per-vertex bake and
 * under the baked light grid and reflection probes when those exist. */
import * as THREE from 'three';
import { SQUADS, WEAPONS, type WeaponId } from '../../config';
import { SHIN, THIGH, armParts, boxes, makeFigure, weaponParts, type Figure } from '../../models';
import { ACT, weaponIdOf, type Match, type SimEvent } from '../../state';
import { makeSprite } from '../../textures';

export interface HeroLighting {
  /** Light arriving at a point, for anything that moves. Colour now; spherical harmonics when the light grid lands. */
  probe(x: number, y: number, z: number): { color: [number, number, number]; sh?: Float32Array };
  /** Reflection environment for the place the camera is in, or null before one exists. */
  environment(x: number, z: number): THREE.Texture | null;
  sun: { x: number; y: number; z: number; color: [number, number, number] };
}

/** What the hero modules read each frame. `scene.ts`'s `SceneView` satisfies it. */
export interface HeroView {
  m: Match;
  self: number; watch: number;
  yaw: number; pitch: number;
  px: number; pz: number; alpha: number;
  dt: number;
  reduced: boolean;
  menu: boolean;
}

export interface Viewmodel {
  /** Poses the weapon in hand for this frame. `time` is the scene clock in seconds. */
  update(view: HeroView, time: number): void;
  /** Reacts to the local player's own events (shots). */
  handle(events: readonly SimEvent[], m: Match, self: number): void;
  /** Draws the weapon over the world (call after the world, with the colour buffer intact). Returns draw calls. */
  render(): number;
  readonly visible: boolean;
  resize(aspect: number): void;
  dispose(): void;
}

/** Where a fighter is drawn this frame (smoothed from the simulation), for the camera and effects. */
export interface FighterPose { x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number; phase: number }
export interface Fighters {
  update(view: HeroView): void;
  pose(i: number): FighterPose | null;
  /** World position of fighter `i`'s muzzle if it is drawn, written to `out`. */
  muzzle(i: number, out: THREE.Vector3): boolean;
  /** Snap every fighter to its simulated pose on the next frame (round start). */
  reset(ids?: Iterable<number>): void;
  dispose(): void;
}

interface FigState { fig: Figure; squad: 0 | 1; x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number; phase: number; dead: number; fresh: boolean }
interface GunView { group: THREE.Group; slide: THREE.Mesh | null; mag: THREE.Mesh | null; muzzle: number; dot: THREE.Mesh | null }

const hex = (c: string) => Number(`0x${c.slice(1)}`);
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

export function createViewmodel(renderer: THREE.WebGLRenderer, lighting: HeroLighting): Viewmodel {
  const viewScene = new THREE.Scene(), viewCamera = new THREE.PerspectiveCamera(54, 16 / 9, 0.01, 5);
  const vHemi = new THREE.HemisphereLight(0xffffff, 0x8a847c, 1.5), vKey = new THREE.DirectionalLight(0xffffff, 1);
  vKey.position.set(-0.5, 1, 0.9); viewScene.add(vHemi, vKey);
  const vm = new THREE.Group(); viewScene.add(vm);
  const vmMat = new THREE.MeshLambertMaterial({ vertexColors: true }), dotMat = new THREE.MeshBasicMaterial({ color: 0xff3524 });
  const guns = new Map<string, GunView>();
  const flashTex = makeSprite('flash');
  const vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  vmFlash.visible = false; vm.add(vmFlash);
  let gunKey = '', kick = 0, pump = 9, flashLife = 0, swayX = 0, swayY = 0, lastYaw = 0, lastPitch = 0, bob = 0, sprintT = 0, useT = 0;
  function gunFor(id: WeaponId, squad: 0 | 1): GunView {
    const k = `${id}${squad}`;
    let g = guns.get(k);
    if (g) return g;
    const parts = weaponParts(id), group = new THREE.Group();
    group.add(new THREE.Mesh(boxes([...parts.fixed, ...armParts(id, hex(SQUADS[squad].color))]), vmMat));
    const slide = parts.slide.length ? new THREE.Mesh(boxes(parts.slide), vmMat) : null, mag = parts.mag.length ? new THREE.Mesh(boxes(parts.mag), vmMat) : null;
    if (slide) group.add(slide);
    if (mag) group.add(mag);
    let dot: THREE.Mesh | null = null;
    if (parts.sightGlow && id !== 'dmr') { dot = new THREE.Mesh(new THREE.PlaneGeometry(0.0045, 0.0045), dotMat); dot.position.set(...parts.sightGlow); group.add(dot); }
    group.visible = false; vm.add(group);
    g = { group, slide, mag, muzzle: parts.muzzle, dot };
    guns.set(k, g);
    return g;
  }

  return {
    get visible() { return vm.visible; },
    update(view, time) {
      const { m, dt } = view, p = m.players[view.self];
      const show = !!p && p.alive && view.watch === view.self && !view.menu && m.phase !== 'lobby';
      vm.visible = show;
      if (!show || !p) { gunKey = ''; return; }
      const id = weaponIdOf(m, p), def = WEAPONS[id], key2 = `${id}${p.squad}`, gun = gunFor(id, p.squad);
      if (key2 !== gunKey) { for (const g of guns.values()) g.group.visible = false; gun.group.visible = true; gunKey = key2; }
      const ads = smooth(p.adsT), pistol = id === 'pistol', scoped = id === 'dmr' && ads > 0.9;
      gun.group.visible = !scoped;
      kick = Math.max(0, kick - dt * 9 * Math.max(0.25, kick)); pump += dt; bob += dt * (2 + p.pace * 8);
      sprintT += ((p.sprint ? 1 : 0) - sprintT) * Math.min(1, dt * 9);
      useT += ((p.act !== ACT.none || p.using ? 1 : 0) - useT) * Math.min(1, dt * 8);
      const dyaw = wrap(view.yaw - lastYaw), dpitch = view.pitch - lastPitch; lastYaw = view.yaw; lastPitch = view.pitch;
      swayX += (Math.max(-0.04, Math.min(0.04, dyaw * 0.5)) - swayX) * Math.min(1, dt * 10); swayY += (Math.max(-0.04, Math.min(0.04, dpitch * 0.5)) - swayY) * Math.min(1, dt * 10);
      const still = view.reduced ? 0 : 1, hipX = pistol ? 0.13 : 0.2, hipY = pistol ? -0.12 : -0.15, hipZ = pistol ? -0.46 : -0.36, adsZ = pistol ? -0.4 : id === 'shotgun' ? -0.26 : -0.2;
      let x = hipX * (1 - ads), y = hipY * (1 - ads), z = hipZ + (adsZ - hipZ) * ads, rx = 0, ry = 0.035 * (1 - ads), rz = 0;
      const paceBob = Math.min(1.4, p.pace) * (1 - ads * 0.8) * still;
      x += Math.sin(bob) * 0.007 * paceBob + swayX * (1 - ads * 0.7); y += Math.abs(Math.cos(bob)) * 0.008 * paceBob + Math.sin(time * 1.3) * 0.0015 * still - swayY * (1 - ads * 0.7);
      rz += -p.lean * 0.12 + swayX * 1.2;
      // Sprint: carried across the body. Using something: lowered out of the way.
      x -= sprintT * 0.06; y -= sprintT * 0.05 + useT * 0.26; ry += sprintT * 0.75; rx -= sprintT * 0.22 + useT * 0.5;
      if (p.reload > 0) { const t = 1 - p.reload / def.reload, w = Math.sin(Math.PI * Math.min(1, t * 1.15)); y -= w * 0.12; rx += w * 0.42; rz += w * 0.32; if (gun.mag) gun.mag.position.y = -0.32 * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.15) / 0.5)))); }
      else if (gun.mag) gun.mag.position.y = 0;
      if (p.swap > 0) { const t = p.swap / 0.42; y -= t * 0.3; rx -= t * 0.6; }
      if (p.meleeCool > 0.4) { const t = Math.sin(Math.PI * (0.75 - p.meleeCool) / 0.35); z -= t * 0.2; ry -= t * 0.55; x -= t * 0.08; }
      z += kick * (pistol ? 0.03 : 0.045) * (1 - ads * 0.35); rx += kick * (pistol ? 0.14 : 0.05) * (1 - ads * 0.5);
      if (gun.slide) gun.slide.position.z = id === 'shotgun' ? (pump < 0.5 ? Math.sin(Math.PI * Math.max(0, (pump - 0.12) / 0.38)) * 0.09 : 0) : kick * 0.035;
      vm.position.set(x, y, z); vm.rotation.set(rx, ry, rz);
      const l = lighting.probe(p.x, 1.4, p.z).color;
      vHemi.color.setRGB(Math.min(1.4, 0.3 + l[0]), Math.min(1.4, 0.3 + l[1]), Math.min(1.4, 0.3 + l[2])); vKey.intensity = 0.25 + (l[0] + l[1] + l[2]) * 0.3;
      if (flashLife > 0) { flashLife -= dt; vmFlash.visible = flashLife > 0 && !scoped; vmFlash.position.set(0, -0.055, gun.muzzle - 0.04); }
      else vmFlash.visible = false;
      viewCamera.fov = 54 - ads * 9; viewCamera.updateProjectionMatrix();
    },
    handle(events, _m, self) {
      for (const e of events) {
        if (e.e !== 'shot' || e.id !== self) continue;
        kick = Math.min(1.6, kick + (e.w === 'shotgun' ? 1.5 : e.w === 'dmr' ? 1.1 : 0.55)); pump = 0; flashLife = 0.045;
        vmFlash.scale.setScalar(0.1 + Math.random() * 0.05); (vmFlash.material as THREE.SpriteMaterial).rotation = Math.random() * 6;
      }
    },
    render() {
      if (!vm.visible) return 0;
      renderer.clearDepth(); renderer.render(viewScene, viewCamera);
      return renderer.info.render.calls;
    },
    resize(aspect) { viewCamera.aspect = aspect; viewCamera.updateProjectionMatrix(); },
    dispose() {
      viewScene.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); });
      flashTex.dispose(); vmMat.dispose(); dotMat.dispose(); (vmFlash.material as THREE.Material).dispose();
    },
  };
}

export function createFighters(scene: THREE.Scene, lighting: HeroLighting): Fighters {
  const figs: (FigState | null)[] = [];
  const blobTex = makeSprite('blob');
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7 });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, 10);
  blobs.frustumCulled = false; blobs.renderOrder = 1; scene.add(blobs);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  function figFor(i: number, squad: 0 | 1): FigState {
    let f = figs[i];
    if (f && f.squad === squad) return f;
    if (f) { scene.remove(f.fig.root); f.fig.material.dispose(); }
    const fig = makeFigure(squad);
    fig.root.rotation.order = 'YXZ';
    scene.add(fig.root);
    f = { fig, squad, x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, phase: 0, dead: 0, fresh: true };
    figs[i] = f;
    return f;
  }

  return {
    update(view) {
      const { m, dt } = view, k = 1 - Math.exp(-dt * 16);
      let blob = 0;
      for (let i = 0; i < Math.max(figs.length, m.players.length); i++) {
        const p = m.players[i];
        if (!p || m.phase === 'lobby') { const f = figs[i]; if (f) f.fig.root.visible = false; continue; }
        const f = figFor(i, p.squad), local = i === view.self;
        const tx = local ? view.px + (p.x - view.px) * view.alpha : p.x, tz = local ? view.pz + (p.z - view.pz) * view.alpha : p.z;
        if (f.fresh || local || Math.hypot(tx - f.x, tz - f.z) > 4) { f.x = tx; f.z = tz; f.yaw = local ? view.yaw : p.yaw; f.pitch = local ? view.pitch : p.pitch; f.crouch = p.crouch; f.lean = p.lean; f.fresh = false; }
        else { f.x += (tx - f.x) * k; f.z += (tz - f.z) * k; f.yaw += wrap(p.yaw - f.yaw) * k; f.pitch += (p.pitch - f.pitch) * k; f.crouch += (p.crouch - f.crouch) * k; f.lean += (p.lean - f.lean) * k; }
        f.dead += ((p.alive ? 0 : 1) - f.dead) * Math.min(1, dt * (p.alive ? 30 : 5));
        const g = f.fig, show = !(i === view.watch && p.alive) && (p.alive || f.dead > 0.01) && !view.menu;
        g.root.visible = show;
        if (!show) continue;
        const pace = p.alive ? Math.min(1.5, p.pace) : 0;
        f.phase += pace * dt * 8.5;
        const c = f.crouch * (1 - f.dead), swing = Math.sin(f.phase) * 0.62 * Math.min(1, pace), crouchT = 1.15 * c, crouchS = -2 * c;
        let low = 0;
        for (let s = 0; s < 2; s++) {
          const a = crouchT + (s ? swing : -swing), b = crouchS - Math.max(0, s ? -Math.sin(f.phase + 0.6) : Math.sin(f.phase + 0.6)) * 0.9 * Math.min(1, pace);
          g.thigh[s].rotation.x = a; g.shin[s].rotation.x = b;
          low = Math.max(low, THIGH * Math.cos(a) + SHIN * Math.cos(a + b));
        }
        g.hips.position.y = low + 0.05 + Math.abs(Math.sin(f.phase * 2)) * 0.012 * pace;
        g.upper.rotation.x = f.pitch * 0.55 - c * 0.2; g.upper.rotation.z = -f.lean * 0.4;
        g.upper.position.x = f.lean * 0.12;
        g.root.position.set(f.x, f.dead * 0.14, f.z);
        g.root.rotation.set(-f.dead * 1.48, f.yaw, 0);
        const l = lighting.probe(f.x, 1.1, f.z).color;
        g.material.color.setRGB(Math.min(1.5, 0.25 + l[0] * 1.15), Math.min(1.5, 0.25 + l[1] * 1.15), Math.min(1.5, 0.25 + l[2] * 1.15));
        if (blob < 10) blobs.setMatrixAt(blob++, m4.compose(v3.set(f.x, 0.04, f.z), q4.identity(), s3.set(1.1 + f.dead * 0.9, 1, 1.1 + f.dead * 0.9)));
      }
      for (let i = blob; i < 10; i++) blobs.setMatrixAt(i, m4.makeScale(0, 0, 0));
      blobs.instanceMatrix.needsUpdate = true;
    },
    pose(i) { return figs[i] ?? null; },
    muzzle(i, out) {
      const f = figs[i];
      if (!f || !f.fig.root.visible) return false;
      f.fig.muzzle.getWorldPosition(out);
      return true;
    },
    reset(ids) {
      if (!ids) { for (const f of figs) if (f) { f.fresh = true; f.dead = 0; } return; }
      for (const id of ids) { const f = figs[id]; if (f) { f.fresh = true; f.dead = 0; } }
    },
    dispose() {
      for (const f of figs) if (f) { scene.remove(f.fig.root); f.fig.material.dispose(); }
      scene.remove(blobs); blobGeo.dispose(); blobMat.dispose(); blobTex.dispose();
    },
  };
}
