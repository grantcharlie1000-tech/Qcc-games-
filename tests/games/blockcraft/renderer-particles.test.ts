import {describe,expect,test} from 'vitest';
import * as THREE from 'three';
import {createFakeGame} from './helpers/fake-game';
import {createParticles,MAX_PARTICLES,PARTICLE_KINDS} from '../../../src/games/blockcraft/render/particles';
import {paintParticleSheet,PARTICLE_SPRITES,SHEET_WIDTH,SHEET_HEIGHT,ITEM_SLOT_BASE,ITEM_SLOTS,SHEET_COLUMNS} from '../../../src/games/blockcraft/render/particles-art';
import {sharedUniforms} from '../../../src/games/blockcraft/render/renderer';
import {B,FACE_TILE,TILE_INDEX,ATLAS_COLUMNS,ATLAS_ROWS,blockId,LAYER} from '../../../src/games/blockcraft/data/blocks';
import {biomeDef} from '../../../src/games/blockcraft/data/biomes';
import type {ParticleKind} from '../../../src/games/blockcraft/engine/contracts';

function setup(){
  const game=createFakeGame();game.flat(60);
  const atlas=new THREE.DataTexture(new Uint8Array(4),1,1);
  const system=createParticles(game,atlas,{...sharedUniforms(),fogShape:{value:1},nightVision:{value:0},flicker:{value:0}});
  return{game,system};
}
const tileRect=(tile:number)=>{const col=tile%ATLAS_COLUMNS,row=Math.floor(tile/ATLAS_COLUMNS);
  return{u0:col/ATLAS_COLUMNS,u1:(col+1)/ATLAS_COLUMNS,v0:1-(row+1)/ATLAS_ROWS,v1:1-row/ATLAS_ROWS};};

describe('particle sprite sheet',()=>{
  test('every sprite frame is painted with transparent surroundings and frames differ',()=>{
    const sheet=paintParticleSheet();expect(sheet.length).toBe(SHEET_WIDTH*SHEET_HEIGHT*4);
    const cellPixels=(cell:number)=>{const out:number[]=[];const cx=(cell%SHEET_COLUMNS)*16,cy=Math.floor(cell/SHEET_COLUMNS)*16;
      for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=((cy+y)*SHEET_WIDTH+cx+x)*4;out.push(sheet[i],sheet[i+1],sheet[i+2],sheet[i+3]);}return out;};
    for(const [name,{cell,frames}] of Object.entries(PARTICLE_SPRITES)){
      const seen=new Set<string>();
      for(let f=0;f<frames;f++){
        const px=cellPixels(cell+f),opaque=px.filter((_,i)=>i%4===3&&px[i]>0).length;
        expect(opaque,`${name} frame ${f}`).toBeGreaterThan(0);expect(opaque,`${name} frame ${f}`).toBeLessThan(256);
        seen.add(px.join());
      }
      expect(seen.size,name).toBe(frames);
    }
    expect(ITEM_SLOT_BASE+ITEM_SLOTS).toBeLessThanOrEqual((SHEET_WIDTH/16)*(SHEET_HEIGHT/16));
  });
});

describe('particles',()=>{
  test('every particle kind spawns and all of them share one instanced draw',()=>{
    const {system}=setup();
    for(const kind of PARTICLE_KINDS){
      const before=system.count;system.spawn(kind,.5,62,.5,{block:B.stone,item:'apple'});
      expect(system.count,kind).toBeGreaterThan(before);
    }
    expect(PARTICLE_KINDS.length).toBe(21);
    system.update(0);
    const geometry=system.mesh.geometry as THREE.InstancedBufferGeometry;
    expect(system.mesh.visible).toBe(true);expect(geometry.instanceCount).toBe(system.count);
    expect(system.mesh.isMesh).toBe(true);
  });
  test('is capped near 2000 and evicts the oldest particles for new ones',()=>{
    const {system}=setup();
    system.spawn('block',.5,62,.5,{block:B.stone,count:3000});expect(system.count).toBe(MAX_PARTICLES);
    system.spawn('heart',.5,62,.5,{count:1});expect(system.count).toBe(MAX_PARTICLES);
    expect(system.particles().some(p=>p.kind==='heart')).toBe(true);
  });
  test('block debris shows a 4×4 pixel piece of the block tile, dimmed like vanilla; grass breaks into dirt',()=>{
    const {system}=setup();
    system.spawn('block',.5,62,.5,{block:B.stone,count:10});
    const rect=tileRect(FACE_TILE[B.stone*6]);
    for(const p of system.particles()){
      expect(p.texture).toBe('atlas');expect(p.u0).toBeGreaterThanOrEqual(rect.u0-1e-6);expect(p.u1).toBeLessThanOrEqual(rect.u1+1e-6);
      expect(p.v0).toBeGreaterThanOrEqual(rect.v0-1e-6);expect(p.v1).toBeLessThanOrEqual(rect.v1+1e-6);
      expect(p.u1-p.u0).toBeCloseTo(4/(16*ATLAS_COLUMNS),3);expect(p.r).toBeCloseTo(.6);
    }
    system.reset();system.spawn('block',.5,62,.5,{block:B.grass,count:4});
    const dirt=tileRect(TILE_INDEX.get('dirt')!);for(const p of system.particles())expect(p.u0).toBeGreaterThanOrEqual(dirt.u0-1e-6);
  });
  test('leaf debris is tinted by the biome foliage colour',()=>{
    const {system}=setup();system.spawn('block',.5,62,.5,{block:B.oakLeaves,count:3});
    const foliage=biomeDef(0).foliage,g=(foliage>>8&255)/255;
    for(const p of system.particles())expect(p.g).toBeCloseTo(.6*g,2);
  });
  test('item crumbs use the item sprite from a sheet slot, and many items recycle the slots',()=>{
    const {system}=setup();
    system.spawn('item',.5,62,.5,{item:'apple',count:3});
    for(const p of system.particles()){expect(p.texture).toBe('sheet');expect(p.v1).toBeLessThanOrEqual(1-(Math.floor(ITEM_SLOT_BASE/SHEET_COLUMNS)*16)/SHEET_HEIGHT+1e-6);}
    const items=['bread','beef','cookie','carrot','potato','egg','snowball','bone','stick','coal','diamond','emerald','feather','string','wheat','sugar','paper','book',
      'bowl','arrow','flint','leather','gunpowder','clay_ball','brick','iron_ingot','gold_ingot','raw_iron','raw_gold','raw_copper','redstone','slime_ball','ender_pearl','melon_slice'];
    for(const item of items)system.spawn('item',.5,62,.5,{item,count:1});
    expect(system.count).toBe(3+items.length);
    // A block item breaks into its block tile instead.
    system.reset();system.spawn('item',.5,62,.5,{item:'cobblestone',count:2});
    for(const p of system.particles())expect(p.texture).toBe('atlas');
    system.reset();system.spawn('slime',.5,62,.5,{count:2});for(const p of system.particles())expect(p.texture).toBe('sheet');
  });
  test('debris falls under gravity and comes to rest on the ground without sinking through it',()=>{
    const {system}=setup();system.spawn('block',.5,61.5,.5,{block:B.dirt,count:200});
    let rested=0;
    for(let t=0;t<60;t++){
      system.tick();
      for(const p of system.particles()){expect(p.y).toBeGreaterThanOrEqual(60-1e-9);if(p.onGround&&Math.abs(p.y-60)<1e-6)rested++;}
    }
    expect(rested).toBeGreaterThan(0);
    for(let t=0;t<60;t++)system.tick();
    expect(system.count).toBe(0);
  });
  test('smoke drifts upward; flames, lava and explosions glow at full brightness',()=>{
    const {system}=setup();system.spawn('smoke',.5,64,.5,{count:20});
    const y0=avg(system.particles().map(p=>p.y));for(let t=0;t<6;t++)system.tick();
    expect(avg(system.particles().map(p=>p.y))).toBeGreaterThan(y0);
    for(const p of system.particles())expect(p.emissive).toBe(false);
    system.reset();
    for(const kind of ['flame','lava','explosion'] as ParticleKind[])system.spawn(kind,.5,64,.5,{count:2});
    for(const p of system.particles())expect(p.emissive).toBe(true);
    expect(Math.max(...system.particles().filter(p=>p.kind==='explosion').map(p=>p.size))).toBeGreaterThanOrEqual(1.9);
  });
  test('lava particles leave smoke trails',()=>{
    const {system}=setup();system.spawn('lava',.5,64,.5,{count:20});
    for(let t=0;t<4;t++)system.tick();
    expect(system.particles().some(p=>p.kind==='smoke')).toBe(true);
  });
  test('bubbles rise in water and pop in air',()=>{
    const {game,system}=setup();
    for(let y=60;y<70;y++)game.world.set(3,y,3,B.water);
    system.spawn('bubble',3.5,63.5,3.5,{count:5,spread:.1});system.spawn('bubble',.5,64,.5,{count:5,spread:.1});
    expect(system.count).toBe(10);
    system.tick();expect(system.count).toBe(5);
    const y0=avg(system.particles().map(p=>p.y));for(let t=0;t<3;t++)system.tick();
    expect(avg(system.particles().map(p=>p.y))).toBeGreaterThan(y0);
  });
  test('drips hang, fall and splat; lava drips glow orange, water drips are blue',()=>{
    const {game,system}=setup();
    game.world.set(0,66,0,B.lava);game.world.set(2,66,0,B.water);
    system.spawn('drip',.5,65.95,.5,{count:1,spread:0});system.spawn('drip',2.5,65.95,.5,{count:1,spread:0});
    const [lava,water]=system.particles();
    expect(lava.emissive).toBe(true);expect(lava.r).toBeGreaterThan(lava.b+.5);
    expect(water.emissive).toBe(false);expect(water.b).toBeGreaterThan(water.r+.5);
    for(let t=0;t<20;t++)system.tick();
    expect(system.particles()[0].y).toBeGreaterThan(65.5);
    let landed=false;for(let t=0;t<200&&system.count;t++){system.tick();if(system.particles().some(p=>p.state===2&&Math.abs(p.y-60)<.01))landed=true;}
    expect(landed).toBe(true);
  });
  test('velocity, colour, count and spread options are honoured',()=>{
    const {system}=setup();
    system.spawn('spell',.5,70,.5,{count:6,spread:1,color:0xff0000});
    expect(system.count).toBe(6);
    for(const p of system.particles()){expect(p.r).toBeCloseTo(1);expect(p.g).toBeCloseTo(0);expect(Math.abs(p.x-.5)).toBeLessThanOrEqual(1);expect(Math.abs(p.z-.5)).toBeLessThanOrEqual(1);}
    system.reset();system.spawn('crit',.5,70,.5,{count:8,velocity:{x:20,y:0,z:0}});
    const x0=avg(system.particles().map(p=>p.x));system.tick();system.tick();
    expect(avg(system.particles().map(p=>p.x))).toBeGreaterThan(x0+.3);
  });
  test('portal particles are drawn in toward where they were spawned',()=>{
    const {system}=setup();system.spawn('portal',10.5,70,10.5,{count:1,spread:0,velocity:{x:20,y:0,z:0}});
    const p0=system.particles()[0];
    let last=p0;for(let t=0;t<60&&system.count;t++){last=system.particles()[0];system.tick();}
    expect(Math.abs(last.x-10.5)).toBeLessThan(.2);expect(last.y).toBeGreaterThanOrEqual(70-1e-6);
  });
  test('explosion clusters appear over several ticks like the vanilla emitter',()=>{
    const {system}=setup();system.spawn('explosion',.5,70,.5,{count:18,spread:2});
    system.update(0);const first=(system.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount;
    expect(first).toBeLessThan(18);expect(first).toBeGreaterThan(0);
    system.tick();system.tick();system.tick();system.update(0);
    expect((system.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBeGreaterThan(first);
  });
  test('instance buffers interpolate between ticks and hide when no particle is alive',()=>{
    const {system}=setup();system.spawn('crit',.5,70,.5,{count:1,spread:0,velocity:{x:20,y:0,z:0}});
    system.tick();const p=system.particles()[0];system.update(.5);
    const pos=(system.mesh.geometry.getAttribute('iPos') as THREE.InstancedBufferAttribute).array;
    expect(pos[0]).toBeCloseTo((p.prevX+p.x)/2,5);
    system.reset();system.update(0);expect(system.mesh.visible).toBe(false);
  });
  test('particles take the light of the block they are in',()=>{
    const {game,system}=setup();
    const chunk=game.world.chunk(0,0)!;chunk.light=new Uint8Array(chunk.blocks.length);chunk.light[0+0*16+64*LAYER]=0x37;
    system.spawn('poof',.5,64.5,.5,{count:1,spread:0,velocity:{x:0,y:0,z:0}});system.tick();
    expect(system.particles()[0].light).toBe(0x37);
  });
  test('dispose frees the geometry, material and sheet texture',()=>{
    const {system}=setup();const disposed:string[]=[];
    system.mesh.geometry.addEventListener('dispose',()=>disposed.push('geometry'));
    (system.mesh.material as THREE.Material).addEventListener('dispose',()=>disposed.push('material'));
    system.sheet.addEventListener('dispose',()=>disposed.push('sheet'));
    system.dispose();expect(disposed.sort()).toEqual(['geometry','material','sheet']);
  });
  test('ignores unknown kinds and invalid positions',()=>{
    const {system}=setup();
    system.spawn('nope' as ParticleKind,0,64,0);system.spawn('smoke',NaN,64,0);system.spawn('block',0,64,0,{block:blockId('air')});
    expect(system.count).toBe(0);
  });
});
const avg=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
