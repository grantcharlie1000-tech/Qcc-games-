import {describe,expect,test} from 'vitest';
import * as THREE from 'three';
import {createFakeGame} from './helpers/fake-game';
import {fieldOfView,governScale,mediumAt,sharedUniforms,voxelMaterial} from '../../../src/games/blockcraft/render/renderer';
import {boxEdges,crackFaces,createBlockOverlay,createScreenOverlay} from '../../../src/games/blockcraft/render/overlay';
import {CLOUD_PERIOD,CLOUD_Y,cloudOffset,createSky,createSkyFrame} from '../../../src/games/blockcraft/render/sky-dome';
import {CLOUD_CELLS,buildCloudGeometry,paintCloudMap} from '../../../src/games/blockcraft/render/sky-art';
import {particleTile} from '../../../src/games/blockcraft/render/particles';
import {B,FACE_TILE,TILE_INDEX,blockId} from '../../../src/games/blockcraft/data/blocks';

const atlas=()=>new THREE.DataTexture(new Uint8Array(4),1,1);

describe('chunk materials',()=>{
  test('every layer shares the world uniforms by reference and keeps the vertex layout attributes',()=>{
    const u=sharedUniforms(),a=atlas();
    const layers=(['opaque','cutout','translucent'] as const).map(l=>voxelMaterial(a,l,u));
    for(const m of layers){
      for(const k of ['daylight','fogColor','fogNear','fogFar','time','flash','flicker','nightVision','fogShape','sway'] as const)expect(m.uniforms[k]).toBe(u[k]);
      expect(m.vertexShader).toMatch(/in vec4 position;in vec4 uvt;in vec4 tint;/);
      expect(m.glslVersion).toBe(THREE.GLSL3);
    }
    const [opaque,cutout,translucent]=layers;
    expect(opaque.side).toBe(THREE.FrontSide);expect(opaque.transparent).toBe(false);expect(opaque.uniforms.alphaTest.value).toBe(0);
    expect(cutout.side).toBe(THREE.DoubleSide);expect(cutout.uniforms.alphaTest.value).toBe(.5);
    expect(translucent.transparent).toBe(true);expect(translucent.depthWrite).toBe(false);
  });
  test('the shader decodes the light byte and the sway, liquid-surface and emissive flags and animates the liquid tiles',()=>{
    const m=voxelMaterial(atlas(),'opaque',sharedUniforms());
    expect(m.vertexShader).toMatch(/lightByte=mod\(position\.w,256\.\),flags=floor\(position\.w\/256\.\)/);
    expect(m.vertexShader).toMatch(/swaying=mod\(flags,2\.\)>=1\.,surface=mod\(floor\(flags\/2\.\),2\.\)>=1\.,emissive=mod\(floor\(flags\/4\.\),2\.\)>=1\./);
    expect(m.vertexShader).toMatch(/emissive\?vec3\(1\.\):bcLightmap/);
    const tiles=m.uniforms.liquidTiles.value as THREE.Vector4;
    expect([tiles.x,tiles.y,tiles.z,tiles.w]).toEqual(['water_still','water_flow','lava_still','lava_flow'].map(n=>TILE_INDEX.get(n)));
  });
  test('a partial set of uniforms (other areas) still builds a material',()=>{
    const {fogShape,nightVision,flicker,sway,...shared}=sharedUniforms();void fogShape;void nightVision;void flicker;void sway;
    expect(voxelMaterial(atlas(),'cutout',shared).uniforms.fogShape.value).toBe(1);
  });
});

describe('camera helpers',()=>{
  test('the medium at the eye: water and lava below their surface, air above it',()=>{
    const game=createFakeGame();game.flat(60);
    game.world.set(0,60,0,B.water);game.world.set(2,60,0,B.lava);game.world.set(4,60,0,blockId('water_7'));
    expect(mediumAt(game.world,.5,60.5,.5)).toBe('water');expect(mediumAt(game.world,.5,60.95,.5)).toBe('air');
    expect(mediumAt(game.world,2.5,60.2,.5)).toBe('lava');expect(mediumAt(game.world,4.5,60.5,.5)).toBe('air');
    expect(mediumAt(game.world,4.5,60.05,.5)).toBe('water');expect(mediumAt(game.world,6.5,61,.5)).toBe('air');
    game.world.set(0,61,0,B.water);expect(mediumAt(game.world,.5,60.95,.5)).toBe('water');
  });
  test('field of view: the setting times the modifier, narrower in liquids and while dying',()=>{
    expect(fieldOfView(70,1,'air')).toBe(70);expect(fieldOfView(70,1.15,'air')).toBeCloseTo(80.5);
    expect(fieldOfView(70,1,'water')).toBeCloseTo(60);expect(fieldOfView(90,1,'lava')).toBeCloseTo(90*6/7);
    expect(fieldOfView(70,1,'air',20)).toBeLessThan(70);
  });
  test('the resolution governor lowers the scale when frames are slow and raises it after three fast seconds',()=>{
    let s=governScale(1.5,30,0,1.5);expect(s.scale).toBeCloseTo(1.2);
    s=governScale(.55,40,0,1.5);expect(s.scale).toBe(.5);
    let state={scale:.8,good:0};
    for(let i=0;i<2;i++){state=governScale(state.scale,10,state.good,1.5);expect(state.scale).toBe(.8);}
    state=governScale(state.scale,10,state.good,1.5);expect(state.scale).toBeCloseTo(.92);
    expect(governScale(1.5,10,2,1.5).scale).toBe(1.5);expect(governScale(1,18,2,1.5)).toEqual({scale:1,good:0});
  });
});

describe('sky and clouds',()=>{
  test('the cloud map tiles seamlessly with irregular blobs covering roughly a third of the sky',()=>{
    const map=paintCloudMap();let on=0;for(const v of map)on+=v;
    expect(on/map.length).toBeGreaterThan(.2);expect(on/map.length).toBeLessThan(.5);
    // Seams: the edges continue across the wrap as often as rows continue inside.
    let wrap=0,inside=0;
    for(let y=0;y<CLOUD_CELLS;y++){wrap+=+(map[y*CLOUD_CELLS]===map[y*CLOUD_CELLS+CLOUD_CELLS-1]);inside+=+(map[y*CLOUD_CELLS+20]===map[y*CLOUD_CELLS+21]);}
    expect(wrap).toBeGreaterThan(CLOUD_CELLS*.6);expect(inside).toBeGreaterThan(CLOUD_CELLS*.6);
  });
  test('cloud boxes get vanilla face shades, nearest cells first and no faces between neighbouring cells',()=>{
    const map=new Uint8Array(4*4);map[5]=map[6]=1;
    const g=buildCloudGeometry(map,4,12,4,1);
    // Two cells: tops and bottoms, 6 outer sides (the shared side is skipped).
    expect(g.quads).toBe(2*2+6);
    expect([...new Set(Array.from(g.shades,v=>Math.round(v*100)/100))].sort()).toEqual([.7,.8,.9,1]);
    const full=buildCloudGeometry(paintCloudMap(),CLOUD_CELLS,12,4,2),first=Math.hypot(full.positions[0],full.positions[2]);
    expect(first).toBeLessThan(40);
  });
  test('the tiled cloud mesh always surrounds the camera, drifting east',()=>{
    for(const [x,z,drift] of [[0,0,0],[1000,-3000,77],[-5555,123,9999],[CLOUD_PERIOD/2+1,0,CLOUD_PERIOD-1]]){
      const o=cloudOffset(x,z,drift);
      expect(Math.abs(x-o.x)).toBeLessThanOrEqual(CLOUD_PERIOD/2+1e-6);expect(Math.abs(z-o.z)).toBeLessThanOrEqual(CLOUD_PERIOD/2+1e-6);
      expect((((o.x-drift)%CLOUD_PERIOD)+CLOUD_PERIOD)%CLOUD_PERIOD).toBeCloseTo(0,6);
    }
    expect(CLOUD_Y).toBe(192);
  });
  test('the sky dome and clouds follow the frame inputs and the camera',()=>{
    const u=sharedUniforms(),sky=createSky(u),f=createSkyFrame();
    f.sky={r:.1,g:.2,b:.9};f.sunrise=[1,.5,.2,.8];f.sunriseSide=-1;f.angle=.25;f.moonPhase=3;f.stars=.4;f.cloudsVisible=false;
    sky.update(f,{x:5,y:70,z:-3});
    const dome=sky.dome.material as THREE.RawShaderMaterial;
    expect(sky.dome.position.toArray()).toEqual([5,70,-3]);expect(dome.uniforms.fogColor).toBe(u.fogColor);
    expect(dome.uniforms.angle.value).toBeCloseTo(Math.PI/2);expect(dome.uniforms.moonCell.value).toBe(4);
    expect(dome.uniforms.sunrise.value.w).toBeCloseTo(.8);expect(sky.clouds.visible).toBe(false);
    f.cloudsVisible=true;f.cloudTime=10;sky.update(f,{x:5,y:70,z:-3});
    expect(sky.clouds.visible).toBe(true);expect(sky.clouds.matrixWorld.elements[13]).toBe(CLOUD_Y);
    sky.dispose();
  });
});

describe('overlays',()=>{
  test('the outline has the 12 edges of the box',()=>{
    const e=boxEdges({minX:0,minY:0,minZ:0,maxX:1,maxY:.5,maxZ:1});expect(e.length).toBe(72);
    for(let i=0;i<72;i+=6){const d=[e[i+3]-e[i],e[i+4]-e[i+1],e[i+5]-e[i+2]].filter(v=>v!==0);expect(d.length).toBe(1);}
  });
  test('the crack covers every face of the outline box with UVs cropped like the block model',()=>{
    const pos:number[]=[],uv:number[]=[];crackFaces({minX:3,minY:10,minZ:-2,maxX:4,maxY:10.5,maxZ:-1},pos,uv);
    expect(pos.length).toBe(6*4*3);expect(uv.length).toBe(6*4*2);
    for(const v of uv){expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(1);}
    // The east face of a bottom slab uses the lower half of the crack tile.
    expect(Math.max(uv[1],uv[3],uv[5],uv[7])).toBeCloseTo(.5);
  });
  test('the block overlay shows the outline and the crack only while set, and sizes the crack to the block',()=>{
    const o=createBlockOverlay(atlas());expect(o.mesh.visible).toBe(false);
    o.setSelection({minX:1,minY:2,minZ:3,maxX:2,maxY:3,maxZ:4});expect(o.mesh.visible).toBe(true);
    const m=o.mesh.material as THREE.RawShaderMaterial;expect(m.uniforms.showOutline.value).toBe(1);
    o.setBreaking({x:1,y:2,z:3},4,B.stone);expect(m.uniforms.showCrack.value).toBe(1);
    const tile=TILE_INDEX.get('destroy_stage_4')!;expect(m.uniforms.crackTile.value.toArray()).toEqual([tile%16,Math.floor(tile/16)]);
    const p=o.mesh.geometry.getAttribute('position').array as Float32Array;
    let minX=Infinity,maxY=-Infinity;for(let i=48*3;i<p.length;i+=3){minX=Math.min(minX,p[i]);maxY=Math.max(maxY,p[i+1]);}
    expect(minX).toBeCloseTo(.999,3);expect(maxY).toBeCloseTo(3.001,3);
    o.setBreaking(null,0,0);o.setSelection(null);expect(o.mesh.visible).toBe(false);
    o.setBreaking({x:1,y:2,z:3},12,B.stone);expect(m.uniforms.showCrack.value).toBe(0);
    o.dispose();
  });
  test('screen overlays: every kind, strength clamped, null clears and unknown kinds are ignored',()=>{
    const s=createScreenOverlay(atlas());
    for(const k of ['water','lava','hurt','fire','portal'] as const){s.set(k,.5);expect(s.mesh.visible).toBe(true);expect(s.kind).toBe(k);}
    s.set('hurt',3);expect(s.strength).toBe(1);
    s.set(null,1);expect(s.mesh.visible).toBe(false);
    s.set('nope' as 'hurt',1);expect(s.kind).toBeNull();expect(s.mesh.visible).toBe(false);
    s.dispose();
  });
});

describe('particle textures',()=>{
  test('blocks break into their particle texture: dirt for grass blocks, the side otherwise',()=>{
    expect(particleTile(B.grass)).toBe(TILE_INDEX.get('dirt'));expect(particleTile(blockId('podzol'))).toBe(TILE_INDEX.get('dirt'));
    expect(particleTile(B.oakLog)).toBe(FACE_TILE[B.oakLog*6]);
  });
});
