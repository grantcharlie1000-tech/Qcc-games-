import {describe,expect,test} from 'vitest';
import * as THREE from 'three';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import {createMesher} from '../../../src/games/blockcraft/render/mesher';
import {sharedUniforms} from '../../../src/games/blockcraft/render/renderer';
import {createEntities} from '../../../src/games/blockcraft/entity/entities';
import {lightUniforms} from '../../../src/games/blockcraft/entity/model-render';
import {QuadWriter,compileModel,diffuse,entityMatrix,faceRects,identity,mat,packAtlas,writeModel} from '../../../src/games/blockcraft/entity/model';
import type {EntityModel,ModelPart,PartPose,RenderService} from '../../../src/games/blockcraft/engine/contracts';
import {createFakeGame} from './helpers/fake-game';
import {testModel,walker} from './entities-helpers';

function single(part:Partial<ModelPart>&{boxes:ModelPart['boxes']},w=64,h=32){
  const model:EntityModel={textureWidth:w,textureHeight:h,paint(){},parts:[{name:'p',pivot:[0,0,0],...part}]};
  return compileModel(model,{x:0,y:0,w,h},w,h);
}
function draw(m:ReturnType<typeof single>,pose:Record<string,PartPose>={},base=identity(mat())){
  const w=new QuadWriter(16);w.begin(0,0,0);writeModel(w,m,base,pose,{tint:-1});return w;
}
const corner=(w:QuadWriter,q:number,v:number)=>[w.position[q*12+v*3],w.position[q*12+v*3+1],w.position[q*12+v*3+2]];
const uvRect=(w:QuadWriter,q:number)=>[w.uv[q*8],w.uv[q*8+1],w.uv[q*8+6],w.uv[q*8+7]];

describe('box models',()=>{
  test('the atlas packs every region without overlap',()=>{
    const items=[{key:'a',w:64,h:64},{key:'b',w:128,h:64},{key:'c',w:64,h:32},...Array.from({length:40},(_,i)=>({key:'s'+i,w:16,h:16}))];
    const l=packAtlas(items,256),r=[...l.regions.values()];
    expect(r).toHaveLength(items.length);
    for(const a of r){expect(a.x+a.w).toBeLessThanOrEqual(l.width);expect(a.y+a.h).toBeLessThanOrEqual(l.height);}
    for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){
      const a=r[i],b=r[j];expect(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h).toBe(false);
    }
  });
  test('cuboid UVs follow the contract unwrap (top, bottom; -x, front, +x, back)',()=>{
    expect(faceRects([0,0],[8,8,8])).toEqual([[8,0,8,8],[16,0,8,8],[0,8,8,8],[8,8,8,8],[16,8,8,8],[24,8,8,8]]);
    const w=draw(single({boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]}));
    expect(w.quads).toBe(6);
    const front=uvRect(w,3);
    expect(front[0]*64).toBeCloseTo(8,1);expect(front[1]*32).toBeCloseTo(8,1);expect(front[2]*64).toBeCloseTo(16,1);expect(front[3]*32).toBeCloseTo(16,1);
    // The front face lies on -z; its top-left corner (texture left) is on the mob's right (+x) as seen from the front.
    expect(corner(w,3,0)).toEqual([4,8,-4]);expect(corner(w,3,3)).toEqual([-4,0,-4]);
    const top=uvRect(w,0);expect(top[0]*64).toBeCloseTo(8,1);expect(top[1]*32).toBeCloseTo(0,1);
  });
  test('mirror swaps the side regions and flips faces; inflate grows the box, not its UVs',()=>{
    expect(faceRects([0,0],[4,12,4],true)[2]).toEqual([8,4,4,12]);
    const w=draw(single({boxes:[{from:[-2,0,-2],size:[4,12,4],uv:[0,0],mirror:true}]}));
    const west=uvRect(w,2);expect(west[0]).toBeGreaterThan(west[2]);
    const g=draw(single({boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0],inflate:.5}]}));
    expect(corner(g,3,0)).toEqual([4.5,8.5,-4.5]);
    const plain=draw(single({boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]}));
    expect(uvRect(g,3)).toEqual(uvRect(plain,3));
  });
  test('zero-thickness boxes draw one face',()=>{
    expect(draw(single({boxes:[{from:[0,0,0],size:[6,4,0],uv:[0,0]}]})).quads).toBe(1);
  });
  test('parts rotate about their pivot (positive x swings a leg forward) and children follow their parent',()=>{
    const leg=single({pivot:[0,12,0],boxes:[{from:[-1,-12,-1],size:[2,12,2],uv:[0,0]}]});
    const w=draw(leg,{p:{x:Math.PI/2,y:0,z:0}});
    let minZ=Infinity,minY=Infinity;for(let q=0;q<w.quads;q++)for(let v=0;v<4;v++){const [,y,z]=corner(w,q,v);minZ=Math.min(minZ,z);minY=Math.min(minY,y);}
    expect(minZ).toBeCloseTo(-12,5);expect(minY).toBeCloseTo(11,5);
    const nested=single({pivot:[0,10,0],rotation:[0,Math.PI/2,0],boxes:[],children:[{name:'c',pivot:[0,0,-4],boxes:[{from:[0,0,0],size:[1,1,1],uv:[0,0]}]}]});
    const n=draw(nested);
    // The child pivot (0,0,-4) turned 90° left lands at (-4, 10, 0).
    expect(corner(n,1,1)[0]).toBeCloseTo(-4,5);expect(corner(n,1,1)[1]).toBeCloseTo(10,5);
    expect(draw(nested,{p:{x:0,y:0,z:0,visible:false}}).quads).toBe(0);
  });
  test('entity transform: yaw turns the front toward -x, scale converts pixels to blocks; vanilla diffuse light',()=>{
    const m=entityMatrix(mat(),10,60,5,Math.PI/2,0,1/16);
    const w=draw(single({boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]}),{},m);
    const [x,,z]=corner(w,3,0);expect(x).toBeCloseTo(10-.25,5);expect(z).toBeCloseTo(5-.25,5);
    expect(diffuse(0,1,0)).toBe(1);expect(diffuse(0,-1,0)).toBeCloseTo(.4,5);expect(diffuse(1,0,0)).toBeLessThan(diffuse(0,0,-1));
  });
});

describe('entity rendering',()=>{
  function scene(){
    const game=createFakeGame();game.settings.mobSpawning=false;
    const camera=new THREE.PerspectiveCamera(70,16/9,.05,200);camera.position.set(.5,62,8);camera.lookAt(.5,61,-4);camera.updateMatrixWorld();
    const s=new THREE.Scene();
    const atlas=new THREE.DataTexture(new Uint8Array(256*256*4),256,256);
    game.render={...game.render,scene:s,camera,atlas,uniforms:sharedUniforms()} as unknown as RenderService;
    game.mesher=createMesher();
    const entities=createEntities(game);game.entities=entities;
    entities.register(walker({model:testModel({appearance:e=>({tint:e.id%2?0xff0000:0xffffff})})}));
    entities.register({kind:'falling',category:'misc',width:.98,height:.98,maxHealth:1,render:'block',block:()=>B.sand,physics:'none'});
    entities.register({kind:'thrown',category:'projectile',width:.25,height:.25,maxHealth:1,render:'item',item:()=>stack('snowball'),physics:'none'});
    entities.init?.();
    game.flat(60);
    const p=game.player.state;p.x=.5;p.y=60;p.z=8;
    return{game,entities,s};
  }
  test('60 mixed entities draw in at most 3 draw calls',()=>{
    const {entities,s}=scene();
    for(let i=0;i<40;i++)entities.spawn('walker',-4.5+i%10,60,-1.5-Math.floor(i/10)*2,{baby:i%5===0,yaw:i});
    for(let i=0;i<5;i++)entities.dropItem(stack(i%2?'stick':'dirt',1+i*15),-3+i*1.5,60.2,3,{x:0,y:0,z:0});
    for(let i=0;i<5;i++)entities.dropItem(stack('torch',1),-3+i*1.5,60.2,4.5,{x:0,y:0,z:0});
    for(let i=0;i<5;i++)entities.spawn('xp_orb',-3+i*1.5,60.3,5.5,{data:{points:3+i*10}});
    for(let i=0;i<5;i++)entities.spawn('falling',-3+i*1.5,61,1);
    expect(entities.all()).toHaveLength(60);
    entities.frame?.(1/60);
    const meshes=s.children.filter(c=>c.name==='entities') as THREE.Mesh[];
    expect(meshes).toHaveLength(2);
    expect(meshes.filter(m=>m.visible)).toHaveLength(2);
    const stats=entities.debug.render!;
    expect(stats.drawCalls).toBeLessThanOrEqual(3);
    expect(stats.entities).toBe(60);
    // 40 two-box models (6 faces each), 5 sprite items (copies by count), 5 orbs.
    expect(stats.quads).toBeGreaterThanOrEqual(40*12+5+5);
    // 5 falling sand cubes, dirt cubes (copies) and 5 flat torch tiles in the block layer.
    expect(stats.blockQuads).toBeGreaterThanOrEqual(5*6+3*6+5);
    for(const m of meshes)expect(m.geometry.drawRange.count).toBe((m===meshes[0]?stats.quads:stats.blockQuads)*6);
    // CPU budget (≤ 1 ms for 60 entities in the brief); generous here for a shared test machine.
    const t0=performance.now();for(let i=0;i<30;i++)entities.frame?.(1/60);
    expect((performance.now()-t0)/30).toBeLessThan(4);
  });
  test('entity materials light and fog like the chunks: the renderer lightmap and the shared light and fog uniforms',()=>{
    const {game,entities,s}=scene();
    entities.spawn('walker',.5,60,-1.5);entities.frame?.(1/60);
    const u=game.render.uniforms as ReturnType<typeof sharedUniforms>;
    for(const m of s.children.filter(c=>c.name==='entities') as THREE.Mesh[]){
      const mat=m.material as THREE.RawShaderMaterial;
      for(const k of ['daylight','flash','flicker','nightVision','fogColor','fogNear','fogFar','fogShape'] as const)expect(mat.uniforms[k],k).toBe(u[k]);
      expect(mat.vertexShader).toContain('bcLightmap(sky,block,daylight,flash,flicker,nightVision)');
      expect(mat.fragmentShader).toContain('bcFog(bcFogDistance(vRel,fogShape),fogNear,fogFar)');
    }
  });
  test('without the renderer\'s extra uniforms the entity shader gets neutral flicker, night vision and fog shape',()=>{
    expect(lightUniforms({daylight:{value:1},skyDarkening:{value:0},fogColor:{value:new THREE.Color()},fogNear:{value:1},fogFar:{value:2},time:{value:0},flash:{value:0}}))
      .toEqual({flicker:{value:0},nightVision:{value:0},fogShape:{value:1}});
  });
  test('thrown items face the camera; primed blocks flash white',()=>{
    const {entities,s}=scene();
    entities.spawn('thrown',.5,61,2);entities.frame?.(1/60);
    const [models,blocks]=s.children.filter(c=>c.name==='entities') as THREE.Mesh[];
    const p=models.geometry.getAttribute('position').array as Float32Array;
    // The billboard's right edge follows the camera's right vector (+x here): both top corners share z.
    expect(p[2]).toBeCloseTo(p[5],4);expect(p[3]-p[0]).toBeCloseTo(.5,3);
    const t=entities.spawn('falling',.5,60,0,{data:{fuse:10}})!;entities.frame?.(1/60);
    expect((blocks.geometry.getAttribute('extra').array as Uint8Array)[2]).toBe(191);
    t.data.fuse=5;entities.frame?.(1/60);
    expect((blocks.geometry.getAttribute('extra').array as Uint8Array)[2]).toBe(0);
  });
  test('nothing visible means no draw calls; hurt, death and baby states change the output',()=>{
    const {entities,s}=scene();
    entities.frame?.(1/60);
    expect((s.children.filter(c=>c.name==='entities') as THREE.Mesh[]).every(m=>!m.visible)).toBe(true);
    const e=entities.spawn('walker',.5,60,0)!;
    entities.frame?.(1/60);
    const m=(s.children.find(c=>c.name==='entities') as THREE.Mesh).geometry;
    const extra=m.getAttribute('extra').array as Uint8Array;
    expect(extra[1]).toBe(0);
    entities.damage(e,1,{kind:'mob'});entities.frame?.(1/60);
    expect(extra[1]).toBe(255);
    const pos=()=>Array.from((m.getAttribute('position').array as Float32Array).slice(0,entities.debug.render!.quads*12));
    const height=()=>{const p=pos();let max=-Infinity;for(let i=1;i<p.length;i+=3)max=Math.max(max,p[i]);return max-60;};
    const adult=height();e.baby=true;entities.frame?.(1/60);
    expect(height()).toBeCloseTo(adult/2,1);
  });
});
