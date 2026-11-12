/** Assembles a fighter's mesh for a squad and level of detail: the body and the kit merged into one skinned geometry
 * (one draw call) with the hero toolkit's per-vertex surface attributes, curvature and baked occlusion. Built once per
 * squad and level, on first use, and shared by every fighter. */
import * as THREE from 'three';
import { Builder } from '../hero/geom';
import { bodyParts } from './body';
import { buildKit } from './kit';
import { LOOKS, bodySurfaces } from './look';
import { SIDE } from './skeleton';

/** Arm bones are left out of the occlusion bake: in the bind pose the arms hang by the torso, which would darken its
 * sides where the arms are never found when holding a weapon. */
const ARM_BONES = SIDE.flatMap(S => [S.clav, S.delt, S.upper, S.elbow, S.fore, S.twist, S.hand]);

export interface FigureGeo { geo: THREE.BufferGeometry; triangles: number; ms: number; census: Record<string, number> }
const cache = new Map<string, FigureGeo>();

export function figureGeometry(squad: 0 | 1, lod: number): FigureGeo {
  const key = `${squad}:${lod}`, hit = cache.get(key);
  if (hit) return hit;
  const t0 = performance.now(), l = LOOKS[squad], b = new Builder(lod), surfs = bodySurfaces(l);
  b.tag = 'body';
  for (const g of bodyParts(lod, l.mask)) b.addTagged(g, surfs);
  b.tag = 'kit';
  buildKit(b, l, lod);
  const census = b.census();
  const geo = b.build({ ao: lod < 2, aoRange: 0.04, aoSkipBones: ARM_BONES });
  const out = { geo, triangles: geo.index!.count / 3, ms: performance.now() - t0, census };
  cache.set(key, out);
  return out;
}

/** Whether a level is built yet (building one costs tens to hundreds of milliseconds). */
export const figureBuilt = (squad: 0 | 1, lod: number) => cache.has(`${squad}:${lod}`);
