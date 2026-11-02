import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const path='public/game-assets/strongroom/models/';
function json(name:string){const b=readFileSync(path+name);expect(b.toString('utf8',0,4)).toBe('glTF');const bytes=b.readUInt32LE(12);return JSON.parse(b.toString('utf8',20,20+bytes));}
describe('final operator game assets',()=>{
 for(const body of ['ct','t'])it(`compressed ${body} has one material, both bounded LODs and the 12 kept clips`,()=>{
  const g=json(`soldier_${body}.glb`);expect(g.extensionsRequired).toContain('EXT_meshopt_compression');expect(g.materials).toHaveLength(1);expect(g.animations).toHaveLength(12);
  for(const [lod,max] of [[0,4000],[1,1500]]){const mesh=g.meshes.find((m:any)=>m.name===`Body_LOD${lod}`);expect(mesh).toBeTruthy();expect(mesh.primitives).toHaveLength(1);expect(g.accessors[mesh.primitives[0].indices].count/3).toBeLessThanOrEqual(max);}
  expect(readFileSync(path+`soldier_${body}.glb`).length).toBeLessThan(350000);
 });
 for(const side of ['attack','defend'])it(`${side} arms are the palette derivative with one untinted material`,()=>{const g=json(`viewmodels/arms_${side}.glb`);expect(g.materials).toHaveLength(1);expect(g.materials[0].name).toBe(`Arms_${side}`);expect(g.materials[0].pbrMetallicRoughness.baseColorTexture).toBeTruthy();});
});
