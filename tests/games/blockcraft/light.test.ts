// Lighting engine tests: hand-checked vanilla scenarios, a brute-force BFS reference on random
// worlds, border continuity between neighbouring chunks, the incremental relight path and the
// per-chunk time budget and scratch reuse on generated terrain (plain and cave-riddled).
import {describe,expect,test} from 'vitest';
import {AIR,B,BLOCKS,COLLISION_BOXES,LIGHT_EMISSION,LIGHT_OPACITY,OPAQUE,OUTLINE_BOX,blockId} from '../../../src/games/blockcraft/data/blocks';
import {CH,CHUNK_VOLUME,LAYER,PAD_VOLUME,padIndex,voxelIndex} from '../../../src/games/blockcraft/engine/constants';
import type {ChunkData,LightEngine,Vec3} from '../../../src/games/blockcraft/engine/contracts';
import {createLightEngine} from '../../../src/games/blockcraft/world/light';
import {changesLight} from '../../../src/games/blockcraft/world/light-shapes';
import {createTerrain} from '../../../src/games/blockcraft/world/terrain';

// ---- Test world: a 3×3 neighbourhood in centre-chunk local coordinates (x,z in -16..31) ----------
const blankChunk=():ChunkData=>({blocks:new Uint8Array(CHUNK_VOLUME),biomes:new Uint8Array(LAYER)});
const neighbourIndex=(x:number,z:number)=>(Math.floor(z/16)+1)*3+Math.floor(x/16)+1;
class Hood{
  readonly chunks:(ChunkData|null)[];
  constructor(missing:readonly number[]=[]){this.chunks=Array.from({length:9},(_,i)=>missing.includes(i)?null:blankChunk());}
  /** Block id; -1 for a missing chunk; air above the world. */
  get(x:number,y:number,z:number):number{
    if(y>=CH)return AIR;
    const c=this.chunks[neighbourIndex(x,z)];return c?c.blocks[voxelIndex(x&15,y,z&15)]:-1;
  }
  set(x:number,y:number,z:number,id:number){const c=this.chunks[neighbourIndex(x,z)];if(c)c.blocks[voxelIndex(x&15,y,z&15)]=id;}
  /** Inclusive box. */
  fill(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
    for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)this.set(x,y,z,id);
  }
}
const engine=createLightEngine();
function light(h:Hood,e:LightEngine=engine){const out=new Uint8Array(PAD_VOLUME);e.computePadded(h.chunks,out);return out;}
const sky=(out:Uint8Array,x:number,y:number,z:number)=>out[padIndex(x,y,z)]>>4;
const blk=(out:Uint8Array,x:number,y:number,z:number)=>out[padIndex(x,y,z)]&15;
/** Every padded voxel as [x,y,z]. */
function* padVoxels(){for(let y=-1;y<=CH;y++)for(let z=-1;z<=16;z++)for(let x=-1;x<=16;x++)yield [x,y,z] as const;}

// ---- Brute-force reference ---------------------------------------------------------------------
// Straightforward FIFO flood fill over the whole 48×48 neighbourhood with bounds checks, following
// the vanilla Java rules: sky light 15 straight down until the first block with light opacity or an
// occluding face, then every step costs max(1, opacity) in all six directions; block light starts at
// LIGHT_EMISSION; opaque cubes and missing chunks stop light and read 0. Slabs, stairs, snow layers
// and farmland occlude light through faces their shape covers (vanilla useShapeForLightOcclusion),
// sampled here on a 16×16 grid per face.
const DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
const COVER=new Map<number,boolean[][]>();
for(const d of BLOCKS){
  if(!['slab','stairs','snow_layer','farmland'].includes(d.shape))continue;
  const boxes=d.shape==='snow_layer'?OUTLINE_BOX[d.id]:COLLISION_BOXES[d.id];
  COVER.set(d.id,DIRS.map(([dx,dy,dz])=>{
    const axis=dx?0:dy?1:2,positive=dx+dy+dz>0,[ua,va]=[0,1,2].filter(a=>a!==axis),cover=new Array<boolean>(256).fill(false);
    for(let b=0;b<boxes.length;b+=6){
      const min=boxes.slice(b,b+3),max=boxes.slice(b+3,b+6);
      if(positive?max[axis]<1:min[axis]>0)continue;
      for(let v=0;v<16;v++)for(let u=0;u<16;u++){const pu=(u+.5)/16,pv=(v+.5)/16;if(pu>min[ua]&&pu<max[ua]&&pv>min[va]&&pv<max[va])cover[u+v*16]=true;}
    }
    return cover;
  }));
}
function faceBlocked(from:number,to:number,dir:number){
  const a=COVER.get(from)?.[dir],b=COVER.get(to)?.[dir^1];
  if(!a&&!b)return false;
  for(let k=0;k<256;k++)if(!a?.[k]&&!b?.[k])return false;
  return true;
}
function reference(h:Hood):Uint8Array{
  const W=48,HH=CH+1,size=W*W*HH,at=(x:number,y:number,z:number)=>(x+16)+(z+16)*W+y*W*W;
  const ids=new Int16Array(size);
  for(let y=0;y<HH;y++)for(let z=-16;z<32;z++)for(let x=-16;x<32;x++)ids[at(x,y,z)]=h.get(x,y,z);
  const cost=(id:number)=>id<0||OPAQUE[id]?15:Math.min(15,Math.max(1,LIGHT_OPACITY[id]));
  const flood=(level:Uint8Array,queue:number[])=>{
    for(let q=0;q<queue.length;q++){
      const i=queue[q],x=i%W-16,z=Math.floor(i/W)%W-16,y=Math.floor(i/(W*W)),l=level[i];
      for(let dir=0;dir<6;dir++){
        const [dx,dy,dz]=DIRS[dir],nx=x+dx,ny=y+dy,nz=z+dz;
        if(nx<-16||nx>31||nz<-16||nz>31||ny<0||ny>=HH)continue;
        const n=at(nx,ny,nz),next=l-cost(ids[n]);
        if(next>level[n]&&!faceBlocked(ids[i],ids[n],dir)){level[n]=next;queue.push(n);}
      }
    }
  };
  const skyLight=new Uint8Array(size),blockLight=new Uint8Array(size),skyQueue:number[]=[],blockQueue:number[]=[];
  for(let z=-16;z<32;z++)for(let x=-16;x<32;x++){
    let above=AIR;skyLight[at(x,CH,z)]=15;skyQueue.push(at(x,CH,z));
    for(let y=CH-1;y>=0;y--){
      const id=ids[at(x,y,z)];
      if(id<0||OPAQUE[id]||LIGHT_OPACITY[id]!==0||faceBlocked(above,id,3))break;
      skyLight[at(x,y,z)]=15;skyQueue.push(at(x,y,z));above=id;
    }
  }
  flood(skyLight,skyQueue);
  for(let i=0;i<size;i++){const id=ids[i];if(id>=0&&LIGHT_EMISSION[id]>0){blockLight[i]=LIGHT_EMISSION[id];blockQueue.push(i);}}
  flood(blockLight,blockQueue);
  const out=new Uint8Array(PAD_VOLUME);
  for(const [x,y,z] of padVoxels()){
    if(y<0)continue;
    const i=at(x,y,z),id=ids[i];
    out[padIndex(x,y,z)]=id<0||OPAQUE[id]?0:skyLight[i]<<4|blockLight[i];
  }
  return out;
}
/** First padded voxel where two light volumes differ, for readable failures. */
function firstDifference(a:Uint8Array,b:Uint8Array):string|null{
  for(const [x,y,z] of padVoxels()){
    const i=padIndex(x,y,z);
    if(a[i]!==b[i])return `(${x},${y},${z}): sky ${a[i]>>4}/${b[i]>>4} block ${a[i]&15}/${b[i]&15}`;
  }
  return null;
}

// ---- Random worlds -------------------------------------------------------------------------------
function rng(seed:number){return()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const PALETTE=['stone','stone','stone','glass','oak_leaves','oak_leaves','water','water_3','ice','torch','wall_torch_east','glowstone','lava',
  'stone_slab','stone_slab_top','oak_stairs_north','oak_stairs_west','snow','farmland','furnace_lit_north','brown_mushroom','lantern','fire',
  'oak_log','short_grass','oak_door_lower_closed_north'].map(blockId);
function randomHood(seed:number,missing:readonly number[]=[]){
  const r=rng(seed),h=new Hood(missing),pick=()=>PALETTE[Math.floor(r()*PALETTE.length)];
  for(let z=-16;z<32;z++)for(let x=-16;x<32;x++){
    const ground=20+Math.floor(r()*4);
    h.fill(x,0,z,x,ground,z,B.stone);
    for(let y=ground+1;y<75;y++)if(r()<.12)h.set(x,y,z,pick());
  }
  // Roofs and floors make caves and overhangs; shafts open some of them.
  for(let k=0;k<14;k++){
    const x0=-16+Math.floor(r()*44),z0=-16+Math.floor(r()*44),w=2+Math.floor(r()*14),d=2+Math.floor(r()*14),y=24+Math.floor(r()*48);
    h.fill(x0,y,z0,Math.min(31,x0+w),y,Math.min(31,z0+d),r()<.6?B.stone:pick());
  }
  for(let k=0;k<6;k++){const x=-16+Math.floor(r()*48),z=-16+Math.floor(r()*48);h.fill(x,22,z,x,74,z,AIR);}
  return h;
}

// ---- Scenarios -----------------------------------------------------------------------------------
describe('sky light',()=>{
  test('open columns get full sky light straight down to the ground, through glass, plants and torches',()=>{
    const h=new Hood();h.fill(-16,0,-16,31,63,31,B.stone);
    h.fill(-16,70,-16,31,70,31,B.glass);h.set(3,64,3,B.shortGrass);h.set(5,64,5,B.torch);
    const out=light(h);
    for(const [x,y,z] of padVoxels()){
      const expectSky=y>=64?15:0;
      if(sky(out,x,y,z)!==expectSky)throw new Error(`sky at (${x},${y},${z}) = ${sky(out,x,y,z)}, expected ${expectSky}`);
    }
    expect(blk(out,5,64,5)).toBe(14);
  });
  test('sky light spreads sideways and down by one per step under an overhang',()=>{
    const h=new Hood();h.fill(-16,0,-16,31,63,31,B.stone);
    h.fill(0,70,-16,31,70,31,B.stone);
    h.fill(2,55,4,2,63,4,AIR);
    const out=light(h);
    for(let x=0;x<=16;x++)for(let y=64;y<=69;y++)expect(sky(out,x,y,8)).toBe(Math.max(0,14-x));
    expect(sky(out,-1,66,8)).toBe(15);
    // Down a pit under the roof: one level per block.
    for(let y=63;y>=55;y--)expect(sky(out,2,y,4)).toBe(12-(64-y));
  });
  test('a sealed cave is completely dark and a shaft lights it from the sky',()=>{
    const h=new Hood();h.fill(-16,0,-16,31,80,31,B.stone);
    h.fill(2,30,2,12,35,12,AIR);
    let out=light(h);
    for(let y=30;y<=35;y++)for(let z=2;z<=12;z++)for(let x=2;x<=12;x++)expect(out[padIndex(x,y,z)]).toBe(0);
    h.fill(5,36,5,5,80,5,AIR);
    out=light(h);
    for(let y=30;y<=80;y++)expect(sky(out,5,y,5)).toBe(15);
    for(let z=2;z<=12;z++)for(let x=2;x<=12;x++)expect(sky(out,x,32,z)).toBe(Math.max(0,15-Math.abs(x-5)-Math.abs(z-5)));
  });
  test('water and ice dim sky light by their light opacity per block',()=>{
    const water=LIGHT_OPACITY[B.water],ice=LIGHT_OPACITY[B.ice];
    expect(water).toBeGreaterThan(0);expect(ice).toBeGreaterThan(0);
    const h=new Hood();h.fill(-16,0,-16,31,39,31,B.stone);h.fill(-16,40,-16,31,62,31,B.water);
    let out=light(h);
    for(let depth=1;depth<=23;depth++)for(const [x,z] of [[0,0],[8,8],[-1,16],[16,-1]])expect(sky(out,x,63-depth,z)).toBe(Math.max(0,15-water*depth));
    expect(sky(out,8,63,8)).toBe(15);
    const g=new Hood();g.fill(-16,0,-16,31,49,31,B.stone);g.fill(-16,70,-16,31,70,31,B.ice);
    out=light(g);
    expect(sky(out,4,70,4)).toBe(15-ice);
    for(let y=69;y>=50;y--)expect(sky(out,4,y,4)).toBe(Math.max(0,15-ice-(70-y)));
  });
  test('leaves shade the ground under a tree',()=>{
    // A wide two-layer canopy: 14 in the upper leaves, 13 in the lower, then one less per block down.
    const h=new Hood();h.fill(-16,0,-16,31,63,31,B.stone);h.fill(-15,70,-15,30,71,30,B.oakLeaves);
    let out=light(h);
    expect(sky(out,8,71,8)).toBe(14);expect(sky(out,8,70,8)).toBe(13);
    for(let y=69;y>=64;y--)expect(sky(out,8,y,8)).toBe(12-(69-y));
    // A real tree: shade beside the trunk, full sky away from it.
    const t=new Hood();t.fill(-16,0,-16,31,63,31,B.grass);
    t.fill(5,67,5,11,68,11,B.oakLeaves);t.fill(7,69,7,9,70,9,B.oakLeaves);t.fill(8,64,8,8,69,8,B.oakLog);
    out=light(t);
    expect(sky(out,7,64,8)).toBeLessThan(15);expect(sky(out,7,64,8)).toBeGreaterThan(0);
    expect(sky(out,8,66,9)).toBeLessThan(sky(out,8,66,13));
    expect(sky(out,0,64,0)).toBe(15);
    expect(out).toEqual(reference(t));
  });
});

describe('block light',()=>{
  /** A sealed stone room (no sky light) over the whole neighbourhood interior. */
  function room(){const h=new Hood();h.fill(-16,0,-16,31,100,31,B.stone);h.fill(-15,40,-15,30,60,30,AIR);return h;}
  test('torch light falls off by one per block and opaque blocks are dark inside',()=>{
    const h=room();h.set(8,50,8,B.torch);h.set(8,50,10,B.stone);
    const out=light(h);
    for(const [x,y,z] of padVoxels()){
      if(y<40||y>60||(x===8&&y===50&&z===10))continue;
      // Taxicab falloff; the stone block casts a shadow straight behind it (light goes around it, two steps further).
      const d=Math.abs(x-8)+Math.abs(y-50)+Math.abs(z-8)+(x===8&&y===50&&z>10?2:0);
      if(blk(out,x,y,z)!==Math.max(0,14-d))throw new Error(`block light at (${x},${y},${z}) = ${blk(out,x,y,z)}, expected ${Math.max(0,14-d)}`);
    }
    expect(out[padIndex(8,50,10)]).toBe(0);expect(out[padIndex(8,39,8)]).toBe(0);
    for(let y=40;y<=60;y++)expect(sky(out,8,y,8)).toBe(0);
  });
  test('every emitter shines with its LIGHT_EMISSION (lantern 15, fire 15, torch 14, lit furnace 13)',()=>{
    expect(LIGHT_EMISSION[blockId('lantern')]).toBe(15);expect(LIGHT_EMISSION[blockId('fire')]).toBe(15);
    expect(LIGHT_EMISSION[B.torch]).toBe(14);expect(LIGHT_EMISSION[blockId('glowstone')]).toBe(15);
    expect(LIGHT_EMISSION[B.lava]).toBe(15);expect(LIGHT_EMISSION[blockId('furnace_lit_north')]).toBe(13);
    const emitters=BLOCKS.filter(d=>d.lightEmission>0);
    expect(emitters.length).toBeGreaterThan(10);
    for(const d of emitters){
      const h=room();h.set(8,50,8,d.id);
      const out=light(h);
      expect(blk(out,8,50,8),d.name).toBe(OPAQUE[d.id]?0:d.lightEmission);
      expect(blk(out,9,50,8),d.name).toBe(Math.max(0,d.lightEmission-1));
      expect(blk(out,8,50,4),d.name).toBe(Math.max(0,d.lightEmission-4));
    }
  });
  test('light passes through glass and leaves, and water dims it',()=>{
    const h=room();h.set(8,50,8,blockId('glowstone'));h.fill(10,40,-15,10,60,30,B.glass);h.fill(4,40,-15,4,60,30,B.water);
    h.fill(-15,40,4,30,60,4,B.oakLeaves);
    const out=light(h);
    expect(blk(out,11,50,8)).toBe(15-3);
    expect(blk(out,4,50,8)).toBe(15-4-LIGHT_OPACITY[B.water]+1);
    expect(blk(out,8,50,4)).toBe(15-4-LIGHT_OPACITY[B.oakLeaves]+1);
    expect(out[padIndex(8,50,8)]).toBe(0);
  });
});

describe('shapes, borders and missing chunks',()=>{
  test('slabs, stairs, snow and farmland block light through their full faces only',()=>{
    for(const roof of ['stone_slab','oak_stairs_north','snow','farmland']){
      const h=new Hood();h.fill(-16,0,-16,31,63,31,B.stone);h.fill(-16,70,-16,31,70,31,blockId(roof));
      const out=light(h);
      expect(sky(out,8,70,8),roof).toBe(15);
      expect(sky(out,8,69,8),roof).toBe(0);
    }
    // A top slab stops light at its top face; a bottom slab lets it in from the side.
    const h=new Hood();h.fill(-16,0,-16,31,63,31,B.stone);h.fill(0,70,-16,31,70,31,blockId('stone_slab_top'));
    let out=light(h);
    expect(sky(out,4,70,8)).toBe(15-5);expect(sky(out,4,69,8)).toBe(15-5);
    h.fill(0,70,-16,31,70,31,blockId('stone_slab'));
    out=light(h);
    expect(sky(out,4,70,8)).toBe(15);expect(sky(out,4,69,8)).toBe(15-5);
    // Light cannot squeeze between a bottom slab and a top slab side by side.
    const g=new Hood();g.fill(-16,0,-16,31,63,31,B.stone);g.fill(-16,70,-16,31,70,31,B.stone);
    g.fill(1,64,-16,31,69,31,B.stone);g.fill(-16,64,-16,-2,69,31,B.stone);g.set(-1,70,8,blockId('stone_slab'));g.set(0,70,8,blockId('stone_slab_top'));
    out=light(g);
    expect(sky(out,-1,70,8)).toBe(15);expect(sky(out,0,70,8)).toBe(0);
    expect(out).toEqual(reference(g));
  });
  test('missing neighbours are opaque except for open sky above the world',()=>{
    const h=new Hood([5,8]);h.fill(-16,0,-16,31,63,31,B.stone);h.fill(-16,70,-16,31,70,31,B.stone);h.set(15,64,8,B.torch);
    const out=light(h);
    // Chunks 5 (+x) and 8 (+x+z) are missing; (16, y, -1) belongs to the loaded +x-z chunk.
    for(let z=0;z<=16;z++)for(let y=-1;y<=CH;y++)expect(out[padIndex(16,y,z)]).toBe(y===CH?0xf0:0);
    expect(blk(out,16,64,-1)).toBe(14-10);
    expect(blk(out,14,64,8)).toBe(13);
    expect(sky(out,15,66,8)).toBe(0);
    expect(out).toEqual(reference(h));
  });
  test('the bottom pad layer is dark and the top pad layer is open sky',()=>{
    const out=light(randomHood(3));
    for(let z=-1;z<=16;z++)for(let x=-1;x<=16;x++){expect(out[padIndex(x,-1,z)]).toBe(0);expect(sky(out,x,CH,z)).toBe(15);}
  });
  test('matches a brute-force flood fill on random worlds',()=>{
    for(const [seed,missing] of [[1,[]],[2,[]],[3,[0]],[4,[2,6]],[5,[]],[6,[1,3,5,7]]] as const){
      const h=randomHood(seed,missing),got=light(h),want=reference(h);
      expect(firstDifference(got,want),`seed ${seed}`).toBeNull();
    }
  });
  test('matches the reference on generated terrain with torches',()=>{
    const t=createTerrain(99),h=new Hood();
    h.chunks.splice(0,9,...[-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>t.generate(dx,dz))));
    const r=rng(9);for(let k=0;k<60;k++){const x=-16+Math.floor(r()*48),z=-16+Math.floor(r()*48),y=5+Math.floor(r()*80);if(h.get(x,y,z)===AIR)h.set(x,y,z,B.torch);}
    expect(firstDifference(light(h),reference(h))).toBeNull();
  });
  test('padded border values equal what each neighbour computes for itself',()=>{
    for(const source of ['random','terrain'] as const){
      // 5×5 chunks around the centre; chunk (cx,cz) in -2..2.
      const r=rng(77),t=createTerrain(5),grid=new Map<string,ChunkData>();
      for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
        const c=source==='terrain'?t.generate(cx,cz):blankChunk();
        if(source==='random')for(let i=0;i<CHUNK_VOLUME;i++){const y=i>>8;c.blocks[i]=y<20?B.stone:y<75&&r()<.14?PALETTE[Math.floor(r()*PALETTE.length)]:AIR;}
        else for(let k=0;k<40;k++){const i=Math.floor(r()*CHUNK_VOLUME);if(c.blocks[i]===AIR)c.blocks[i]=B.torch;}
        grid.set(`${cx},${cz}`,c);
      }
      const hood=(cx:number,cz:number)=>[-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>grid.get(`${cx+dx},${cz+dz}`)??null));
      const compute=(cx:number,cz:number)=>{const out=new Uint8Array(PAD_VOLUME);engine.computePadded(hood(cx,cz),out);return out;};
      const centre=compute(0,0);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz)continue;
        const other=compute(dx,dz);
        for(const [x,y,z] of padVoxels()){
          const ox=x-16*dx,oz=z-16*dz;
          // Voxels of the centre's rim that lie inside the neighbour, and the neighbour's rim inside the centre.
          if(ox>=0&&ox<16&&oz>=0&&oz<16){
            if(centre[padIndex(x,y,z)]!==other[padIndex(ox,y,oz)])throw new Error(`${source}: rim (${x},${y},${z}) differs from neighbour ${dx},${dz}`);
          }
          const cx2=x+16*dx,cz2=z+16*dz;
          if(x>=-1&&x<=16&&z>=-1&&z<=16&&cx2>=0&&cx2<16&&cz2>=0&&cz2<16&&(x<0||x>15||z<0||z>15)){
            if(other[padIndex(x,y,z)]!==centre[padIndex(cx2,y,cz2)])throw new Error(`${source}: neighbour ${dx},${dz} rim (${x},${y},${z}) differs`);
          }
        }
      }
    }
  });
  test('results do not depend on earlier calls (scratch state is reset)',()=>{
    const a=randomHood(11),b=randomHood(12,[4]),e=createLightEngine();
    const first=light(a,e);light(b,e);
    expect(light(a,e)).toEqual(first);
    expect(light(b,e)).toEqual(light(b,createLightEngine()));
  });
});

describe('incremental relight',()=>{
  test('relightPadded matches a full recompute after edits',()=>{
    const e=createLightEngine();
    expect(e.relightPadded).toBeTypeOf('function');
    for(const seed of [21,22,23,24]){
      const h=randomHood(seed,seed===24?[8]:[]),r=rng(seed*7),out=new Uint8Array(PAD_VOLUME);
      e.computePadded(h.chunks,out);
      for(let round=0;round<6;round++){
        const changed:Vec3[]=[],edits=1+Math.floor(r()*4);
        for(let k=0;k<edits;k++){
          const x=-16+Math.floor(r()*48),z=-16+Math.floor(r()*48),y=Math.floor(r()*CH);
          const kind=r();
          h.set(x,y,z,kind<.3?AIR:kind<.5?B.torch:kind<.7?B.stone:PALETTE[Math.floor(r()*PALETTE.length)]);
          changed.push({x,y,z});
        }
        // Sometimes open or close a whole shaft (sky light changes far below the edit).
        if(round===2){const x=Math.floor(r()*16),z=Math.floor(r()*16);for(let y=20;y<75;y++){h.set(x,y,z,AIR);changed.push({x,y,z});}}
        if(round===4){const x=Math.floor(r()*16),z=Math.floor(r()*16);h.set(x,74,z,B.stone);changed.push({x,y:74,z});}
        e.relightPadded!(h.chunks,out,changed);
        expect(firstDifference(out,light(h)),`seed ${seed} round ${round}`).toBeNull();
      }
    }
  });
  test('relightPadded with nothing changed leaves the volume alone',()=>{
    const h=randomHood(31),out=light(h),copy=out.slice();
    engine.relightPadded!(h.chunks,out,[]);
    expect(out).toEqual(copy);
  });
});

describe('performance',()=>{
  /** A 5×5 patch of generated chunks around chunk (0,0), keyed "cx,cz". */
  function terrainGrid(seed:number){
    const t=createTerrain(seed),grid=new Map<string,ChunkData>();
    for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++)grid.set(`${cx},${cz}`,t.generate(cx,cz));
    return grid;
  }
  /** The nine 3×3 neighbourhoods of the inner chunks of a 5×5 grid, as streaming builds them. */
  function hoodsOf(grid:Map<string,ChunkData>){
    const hoods:(ChunkData|null)[][]=[];
    for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++)hoods.push([-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>grid.get(`${cx+dx},${cz+dz}`)!)));
    return hoods;
  }
  /** Carves vanilla-like caves through a grid in world coordinates: caverns and winding tunnels at every depth, some
   *  opening at the surface, lava below y = 10. Returns the carved share of the underground blocks. */
  function carveCaves(grid:Map<string,ChunkData>,seed:number){
    const r=rng(seed),chunkAt=(x:number,z:number)=>grid.get(`${Math.floor(x/16)},${Math.floor(z/16)}`);
    let underground=0,carved=0;
    for(const c of grid.values())for(let i=LAYER;i<CHUNK_VOLUME;i++)if(c.blocks[i]!==AIR&&c.blocks[i]!==B.water)underground++;
    const sphere=(cx:number,cy:number,cz:number,radius:number)=>{
      for(let y=Math.max(1,Math.floor(cy-radius));y<=Math.min(CH-1,Math.ceil(cy+radius));y++)
        for(let z=Math.floor(cz-radius);z<=Math.ceil(cz+radius);z++)for(let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++){
          const c=chunkAt(x,z),i=voxelIndex(x&15,y,z&15);
          if(!c||(x-cx)**2+(y-cy)**2+(z-cz)**2>radius*radius||c.blocks[i]===AIR||c.blocks[i]===B.water)continue;
          c.blocks[i]=y<10?B.lava:AIR;carved++;
        }
    };
    const top=(x:number,z:number)=>{const c=chunkAt(x,z)!;let y=CH-1;while(y>0&&c.blocks[voxelIndex(x&15,y,z&15)]===AIR)y--;return y;};
    for(let k=0;k<8;k++)sphere(-32+r()*80,12+r()*34,-32+r()*80,5+r()*4);
    for(let k=0;k<44;k++){
      let x=-32+r()*80,z=-32+r()*80,y=k%5===0?top(Math.floor(x),Math.floor(z)):6+r()*54,yaw=r()*Math.PI*2,pitch=(r()-.5)*.6;
      for(let step=0;step<110;step++){
        sphere(x,y,z,1.5+1.5*Math.sin(step*.15+k)**2);
        yaw+=(r()-.5)*.6;pitch=Math.max(-.7,Math.min(.7,pitch+(r()-.5)*.3));
        x+=Math.cos(yaw)*Math.cos(pitch);z+=Math.sin(yaw)*Math.cos(pitch);y=Math.max(4,Math.min(90,y+Math.sin(pitch)));
      }
    }
    return carved/underground;
  }
  /** Average milliseconds per chunk over rounds of every neighbourhood (after a warm-up); the best round is the least noisy. */
  function measure(label:string,hoods:readonly (ChunkData|null)[][]){
    const e=createLightEngine(),out=new Uint8Array(PAD_VOLUME);
    for(let k=0;k<3;k++)for(const n of hoods)e.computePadded(n,out);
    const rounds:number[]=[];
    for(let round=0;round<7;round++){
      const begin=performance.now();
      for(const n of hoods)e.computePadded(n,out);
      rounds.push((performance.now()-begin)/hoods.length);
    }
    const best=Math.min(...rounds);
    console.log(`light, ${label}: ${rounds.map(r=>r.toFixed(2)).join(', ')} ms per chunk (best ${best.toFixed(2)})`);
    return best;
  }
  test('computes generated terrain in at most 3 ms per chunk on average',()=>{
    expect(measure('generated terrain',[...hoodsOf(terrainGrid(1234)),...hoodsOf(terrainGrid(42))])).toBeLessThanOrEqual(3);
  });
  test('stays within the budget in cave-riddled terrain with lava lakes',()=>{
    const grid=terrainGrid(77),share=carveCaves(grid,7),hoods=hoodsOf(grid);
    expect(share).toBeGreaterThan(.08);
    // Still exact: caves bring sky light and lava light into the flood.
    const h=new Hood();h.chunks.splice(0,9,...hoods[4]);
    expect(firstDifference(light(h),reference(h))).toBeNull();
    expect(measure(`caves (${(share*100).toFixed(0)}% of the underground carved)`,hoods)).toBeLessThanOrEqual(3);
  });
  test('reuses its scratch state: the queue pool does not grow on generated terrain',()=>{
    const e=createLightEngine(),out=new Uint8Array(PAD_VOLUME),capacity=e.queueCapacity,cavern=terrainGrid(77);
    carveCaves(cavern,7);
    let peak=0;
    for(const n of [...hoodsOf(terrainGrid(1234)),...hoodsOf(cavern)]){e.computePadded(n,out);peak=Math.max(peak,e.queuePeak);}
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(capacity/2);
    expect(e.queueCapacity).toBe(capacity);
  });
  test('grows the queue pool once for a world dense with emitters and stays exact',()=>{
    // A checkerboard of torches fills the whole neighbourhood: more seeds than the initial pool holds.
    const h=new Hood();
    for(let y=0;y<CH;y++)for(let z=-16;z<32;z++)for(let x=-16;x<32;x++)if((x+y+z)%2===0)h.set(x,y,z,B.torch);
    const e=createLightEngine(),capacity=e.queueCapacity;
    const out=light(h,e);
    expect(e.queueCapacity).toBeGreaterThan(capacity);
    expect(firstDifference(out,reference(h))).toBeNull();
    const grown=e.queueCapacity;
    expect(light(h,e)).toEqual(out);
    expect(e.queueCapacity).toBe(grown);
  });
});

describe('light-shapes',()=>{
  test('changesLight reports edits that can change light anywhere',()=>{
    expect(changesLight(AIR,B.stone)).toBe(true);
    expect(changesLight(AIR,B.torch)).toBe(true);
    expect(changesLight(AIR,blockId('stone_slab'))).toBe(true);
    expect(changesLight(blockId('stone_slab'),blockId('stone_slab_top'))).toBe(true);
    expect(changesLight(B.water,blockId('water_3'))).toBe(false);
    expect(changesLight(B.stone,blockId('cobblestone'))).toBe(false);
    expect(changesLight(AIR,B.shortGrass)).toBe(false);
    expect(changesLight(blockId('oak_stairs_north'),blockId('cobblestone_stairs_north'))).toBe(false);
  });
});
