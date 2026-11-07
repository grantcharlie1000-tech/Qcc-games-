import {expect,it} from 'vitest';
import {voxel,type Part} from '../../../src/games/crossy-road/models';

it('drops the two internal faces between touching cubes without changing their outer bounds',()=>{
  const mesh=voxel([[0,0,0,1,1,1,0xff0000],[1,0,0,1,1,1,0x00ff00]]);
  expect(mesh.index!.count).toBe(60); // Ten external quads, not twelve.
  expect(mesh.getAttribute('position').count).toBe(40);
  mesh.computeBoundingBox();expect(mesh.boundingBox!.min.toArray()).toEqual([-.5,0,-.5]);expect(mesh.boundingBox!.max.toArray()).toEqual([1.5,1,.5]);
  mesh.dispose();
});
it('retains exposed partial faces, coplanar paint and rotated details',()=>{
  for(const other of [[1,0,0,1,.5,1,0x00ff00],[0,0,0,1,1,1,0x00ff00],[1,0,0,1,1,1,0x00ff00,.1]] as Part[]){
    const mesh=voxel([[0,0,0,1,1,1,0xff0000],other]);
    // Partial overlap hides only the smaller cube's covered face. Duplicate
    // surfaces must not both disappear, and rotated faces need exact geometry.
    expect(mesh.index!.count).toBe(other[4]===.5?66:72);mesh.dispose();
  }
});
it('removes a completely enclosed cube, including its unused vertex storage',()=>{
  const mesh=voxel([[0,0,0,2,2,2,0xffffff],[0,.5,0,.5,.5,.5,0xff0000]]);
  expect(mesh.index!.count).toBe(36);expect(mesh.getAttribute('position').count).toBe(24);mesh.dispose();
});
