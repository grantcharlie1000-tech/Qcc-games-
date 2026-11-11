/** The hero models: the weapon in hand (with its own scene, camera and lights) and the fighters in the world.
 * `scene.ts` constructs these two, forwards the per-frame view and the match events, and renders the viewmodel after
 * the world. Lighting arrives through `HeroLighting`, so the same code works under the simple per-vertex bake and
 * under the baked light grid and reflection probes when those exist. */
import * as THREE from 'three';
import { SHIN, THIGH, makeFigure, type Figure } from '../../models';
import { createHeroViewmodel } from './viewmodel';
import type { Match, SimEvent } from '../../state';
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

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** The weapon in hand, with arms, in its own scene and camera. */
export function createViewmodel(renderer: THREE.WebGLRenderer, lighting: HeroLighting): Viewmodel {
  return createHeroViewmodel(renderer, lighting);
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
