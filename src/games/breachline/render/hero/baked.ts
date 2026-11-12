/** Loads the second-build weapons (SDF sculpts baked offline by scripts/breachline-assets/hero/sculpt.ts): the game
 * mesh with its lens from `mesh.bin`, the texture set beside it, and the design's sockets. Registers each with the
 * weapon table so the rig holds the baked model; hand placements are recomputed from the new sockets. */
import * as THREE from 'three';
import type { WeaponId } from '../../config';
import { ART_BASE, type ArtLoader } from '../assets';
import { readMeshBin } from './meshbin';
import { texturedMaterial } from './material';
import { resetHolds } from './rig';
import { ar5Sockets, corvinSockets, haldenSockets, ternSockets, wrenSockets } from './sculpt/designs';
import { registerBaked, type WeaponSockets } from './weapons';

/** Weapons with a baked second build: game id, asset directory, sockets. */
export const BAKED: { id: WeaponId; dir: string; sockets: () => WeaponSockets }[] = [
  { id: 'ar', dir: 'ar5', sockets: ar5Sockets },
  { id: 'shotgun', dir: 'halden12', sockets: haldenSockets },
  { id: 'carbine', dir: 'tern', sockets: ternSockets },
  { id: 'smg', dir: 'wren', sockets: wrenSockets },
  { id: 'dmr', dir: 'corvin', sockets: corvinSockets },
];

/** Grey clay for the gates' shape reviews (`?heroclay`): the textured material with flat maps, so the reticle still
 * glows. Mid grey: the viewmodel is lit hotter than the world. */
export function clayMaterial(): THREE.MeshStandardMaterial {
  const px = (r: number, g: number, b: number, srgb = false) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t; };
  return texturedMaterial({ map: px(0x5c, 0x5c, 0x5a, true), normalMap: px(128, 128, 255), arm: px(255, 158, 0) });
}

/** Loads one baked weapon and returns its material (textured, or `clay` when given). Rejects if anything is missing. */
export async function loadBaked(entry: (typeof BAKED)[number], art: ArtLoader, size: number, clay: THREE.Material | null): Promise<THREE.Material> {
  const res = await fetch(`${ART_BASE}hero/${entry.dir}/mesh.bin`);
  if (!res.ok) throw new Error(`${res.status} hero/${entry.dir}/mesh.bin`);
  const { geometries, header } = readMeshBin(await res.arrayBuffer());
  let mat = clay;
  if (!mat) {
    const maps = await Promise.all((['diff', 'nor', 'arm'] as const).map(k => art.texture(`../hero/${entry.dir}`, k, size)));
    for (const t of maps) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    mat = texturedMaterial({ map: maps[0], normalMap: maps[1], arm: maps[2] });
  }
  const geo = geometries.get('weapon')!;
  registerBaked(entry.id, { geo, lens: geometries.get('lens') ?? null, sockets: entry.sockets(), triangles: geo.index!.count / 3, texelDensity: Number(header.info?.texelDensity ?? 0) });
  resetHolds();
  return mat;
}
