/** The hero models: the weapon in hand (with its own scene, camera and lights) and the fighters in the world.
 * `scene.ts` constructs these two, forwards the per-frame view and the match events, and renders the viewmodel after
 * the world. Lighting arrives through `HeroLighting`, so the same code works under the simple per-vertex bake and
 * under the baked light grid and reflection probes when those exist. */
import * as THREE from 'three';
import { createHeroViewmodel } from './viewmodel';
import type { Match, SimEvent } from '../../state';

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

/** The weapon in hand, with arms, in its own scene and camera. */
export function createViewmodel(renderer: THREE.WebGLRenderer, lighting: HeroLighting): Viewmodel {
  return createHeroViewmodel(renderer, lighting);
}

export { createFighters } from '../fighters/index';
