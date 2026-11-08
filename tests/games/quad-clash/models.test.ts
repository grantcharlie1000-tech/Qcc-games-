import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { buildFighter, buildGun, createKit, disposeOwned, setFighterGun } from '../../../src/games/quad-clash/models';
import { BODY, HITBOX, HOUSES, PRIMARIES } from '../../../src/games/quad-clash/config';

describe('egg fighters', () => {
  test('the visible shell fits movement bounds and covers the aiming and headshot region', () => {
    const kit = createKit(), flash = new THREE.SpriteMaterial();
    const f = buildFighter(kit, HOUSES[0].color, flash);
    const shell = f.body.children[0] as THREE.Mesh;
    f.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(shell);
    expect(bounds.min.y).toBeGreaterThan(0);
    expect(bounds.max.y).toBeLessThanOrEqual(BODY.height);
    expect(Math.max(-bounds.min.x, bounds.max.x)).toBeLessThanOrEqual(BODY.radius);
    expect(bounds.max.y).toBeGreaterThan(BODY.eye);
    // Every shell vertex must be inside a damage volume, including the wider egg shoulders.
    const vertices = shell.geometry.getAttribute('position');
    const point = new THREE.Vector3(), head = new THREE.Vector3(0, HITBOX.headY, 0);
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(shell.matrixWorld);
      const inBody = point.y <= HITBOX.bodyTop && Math.abs(point.x) <= BODY.radius && Math.abs(point.z) <= BODY.radius;
      expect(inBody || Math.hypot(point.x / HITBOX.headR, (point.y - head.y) / HITBOX.headRY, point.z / HITBOX.headRZ) <= 1).toBe(true);
    }
    const ray = new THREE.Raycaster(new THREE.Vector3(0, HITBOX.headY, -2), new THREE.Vector3(0, 0, 1));
    expect(ray.intersectObject(shell).length).toBeGreaterThan(0);
    disposeOwned(f.group); kit.dispose(); flash.dispose();
  });

  test('house colours remain visible and every primary can be swapped on the same egg', () => {
    const kit = createKit(), flash = new THREE.SpriteMaterial();
    for (const h of HOUSES) {
      const f = buildFighter(kit, h.color, flash);
      expect((f.feet[0].material as THREE.MeshStandardMaterial).color.getHex()).toBe(h.color);
      for (const id of PRIMARIES) {
        setFighterGun(kit, f, id);
        expect(f.gunHolder.children).toHaveLength(1);
        expect(f.gunHolder.children[0].userData.muzzle).toBeLessThan(0);
      }
      disposeOwned(f.group);
    }
    kit.dispose(); flash.dispose();
  });
});

test('all weapons share a bounded finish set, keep UVs after batching and release textures once',()=>{
  const created:THREE.Texture[]=[],released:number[]=[];
  const kit=createKit(()=>{const t=new THREE.Texture(),index=created.length;created.push(t);released.push(0);t.addEventListener('dispose',()=>released[index]++);return t;});
  const plain=kit.mat(0x1d2f5c);
  for(const id of [...PRIMARIES,'pencil'] as const) {
    const gun=buildGun(kit,id);
    for(const child of gun.children) {
      const mesh=child as THREE.Mesh,material=mesh.material as THREE.MeshStandardMaterial;
      if(material.userData.gunFinish)expect(material.map).toBeInstanceOf(THREE.Texture);
      const uv=mesh.geometry.getAttribute('uv');expect(uv.count).toBe(mesh.geometry.getAttribute('position').count);
      for(const v of uv.array)expect(Number.isFinite(v)).toBe(true);
    }
  }
  expect(created).toHaveLength(5);expect(plain.map).toBeNull();
  buildGun(kit,'bell');expect(created).toHaveLength(5);
  kit.dispose();expect(released).toEqual([1,1,1,1,1]);
  kit.dispose();expect(released).toEqual([1,1,1,1,1]);
});
