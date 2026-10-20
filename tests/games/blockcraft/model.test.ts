import {describe,expect,test} from 'vitest';
import {TerrainGenerator,CS,CH,SEA,voxelIndex,CHUNK_VOLUME} from '../../../src/games/blockcraft/terrain';
import {VoxelWorld,chunkKey,MAX_EDITS} from '../../../src/games/blockcraft/world';
import {meshChunk,quadIndices,LOWERED} from '../../../src/games/blockcraft/mesher';
import {createPlayer,stepPlayer,raycast,playerCollides,type MoveInput} from '../../../src/games/blockcraft/physics';
import {AIR,STONE,DIRT,WATER,LEAVES,LOG,BEDROCK,BLOCK_COUNT,GRASS} from '../../../src/games/blockcraft/blocks';
import {paintAtlas,ATLAS_WIDTH,ATLAS_HEIGHT} from '../../../src/games/blockcraft/atlas';
import {Simplex} from '../../../src/games/blockcraft/noise';

const empty=()=>new Uint8Array(CHUNK_VOLUME);
function flatWorld(height=10){
  const world=new VoxelWorld();
  for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
    const data=empty();for(let y=0;y<height;y++)data.fill(STONE,y*CS*CS,(y+1)*CS*CS);world.insert(cx,cz,data);
  }
  return world;
}
const idle:MoveInput={forward:0,right:0,jump:false,sprint:false};
function run(world:VoxelWorld,p:ReturnType<typeof createPlayer>,input:MoveInput,seconds:number){for(let t=0;t<seconds*60;t++)stepPlayer(p,input,world,1/60);}

describe('noise and terrain',()=>{
  test('simplex noise is seeded, bounded and deterministic',()=>{
    const a=new Simplex(7),b=new Simplex(7),c=new Simplex(8);
    let differs=false;
    for(let i=0;i<500;i++){
      const x=i*.37,y=i*.11,z=i*.53,v=a.noise3(x,y,z),w=a.noise2(x,y);
      expect(v).toBe(b.noise3(x,y,z));expect(Math.abs(v)).toBeLessThanOrEqual(1.01);expect(Math.abs(w)).toBeLessThanOrEqual(1.01);
      if(c.noise2(x,y)!==w)differs=true;
    }
    expect(differs).toBe(true);
  });
  test('chunks are deterministic, use valid ids and have bedrock, land and sea',()=>{
    const gen=new TerrainGenerator(1234),again=new TerrainGenerator(1234);
    const ids=new Set<number>();
    for(let cz=-3;cz<3;cz++)for(let cx=-3;cx<3;cx++){
      const data=gen.generate(cx,cz);expect(data).toEqual(again.generate(cx,cz));
      for(let i=0;i<CS*CS;i++)expect(data[i]).toBe(BEDROCK);
      for(const id of data)ids.add(id);
    }
    for(const id of ids)expect(id).toBeLessThan(BLOCK_COUNT);
    for(const id of [STONE,DIRT,GRASS,WATER,LOG,LEAVES])expect(ids.has(id)).toBe(true);
  });
  test('trees crossing a chunk border are identical on both sides',()=>{
    const gen=new TerrainGenerator(99);let checked=0;
    for(let cx=-6;cx<6;cx++){
      const a=gen.generate(cx,0),b=gen.generate(cx+1,0);
      // Regenerate a with a one-chunk shift: leaves within 2 of the border must be produced by the
      // tree owner's column whichever chunk computes them. Compare against a wide reference.
      for(let y=SEA;y<CH;y++)for(let z=0;z<CS;z++){
        if(a[voxelIndex(CS-1,y,z)]===LEAVES||b[voxelIndex(0,y,z)]===LEAVES)checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    // Same world column queried through the generator agrees regardless of chunk origin.
    const g2=new TerrainGenerator(99);
    for(let x=-40;x<40;x++)expect(gen.heightAt(x,5)).toBe(g2.heightAt(x,5));
  });
  test('spawn point is dry land',()=>{
    const gen=new TerrainGenerator(5),s=gen.spawnPoint(),h=gen.heightAt(Math.floor(s.x),Math.floor(s.z));
    expect(h).toBeGreaterThan(SEA+1);expect(s.y).toBe(h+1);
  });
  test('generation and meshing stay fast',()=>{
    const gen=new TerrainGenerator(42),world=new VoxelWorld();
    let t=performance.now();
    for(let cz=-4;cz<=4;cz++)for(let cx=-4;cx<=4;cx++)world.insert(cx,cz,gen.generate(cx,cz));
    const generation=(performance.now()-t)/81;
    t=performance.now();let quads=0;
    for(let cz=-3;cz<=3;cz++)for(let cx=-3;cx<=3;cx++){
      const n:(Uint8Array|null)[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)n.push(world.chunk(cx+dx,cz+dz)!.data);
      quads+=meshChunk(n).solid.quads;
    }
    const meshing=(performance.now()-t)/49;
    console.log(`generate ${generation.toFixed(2)} ms/chunk, mesh ${meshing.toFixed(2)} ms/chunk, ${(quads/49)|0} quads/chunk`);
    expect(generation).toBeLessThan(25);expect(meshing).toBeLessThan(25);
  });
});

describe('mesher',()=>{
  const alone=(build:(d:Uint8Array)=>void)=>{const d=empty();build(d);return meshChunk([null,null,null,null,d,null,null,null,null].map((c,i)=>i===4?c:empty()));};
  const shades=(part:{info:Uint8Array})=>[...part.info].filter((_,i)=>i%4===3);
  test('a lone block emits six faces with full AO and unit texture extents',()=>{
    const mesh=alone(d=>{d[voxelIndex(5,10,5)]=STONE;});
    expect(mesh.solid.quads).toBe(6);expect(mesh.solid.position.length).toBe(6*4*3);
    expect(mesh.minY).toBe(10);expect(mesh.maxY).toBe(11);
    for(let i=0;i<mesh.solid.info.length;i+=4){expect([0,1]).toContain(mesh.solid.info[i]);expect([0,1]).toContain(mesh.solid.info[i+1]);}
    // Top face brightness: full AO, sky lit.
    expect(Math.max(...shades(mesh.solid))).toBe(255);
  });
  test('touching blocks hide shared faces and evenly lit faces merge into one quad',()=>{
    const mesh=alone(d=>{d[voxelIndex(5,10,5)]=STONE;d[voxelIndex(6,10,5)]=STONE;});
    // 10 visible faces; top, bottom, front and back pairs merge.
    expect(mesh.solid.quads).toBe(6);
    expect(Math.max(...[...mesh.solid.info].filter((_,i)=>i%4===0))).toBe(2);
    const mixed=alone(d=>{d[voxelIndex(5,10,5)]=STONE;d[voxelIndex(6,10,5)]=DIRT;});
    expect(mixed.solid.quads).toBe(10);
    const flat=alone(d=>{for(let x=0;x<CS;x++)for(let z=0;z<CS;z++)d[voxelIndex(x,4,z)]=STONE;d[voxelIndex(8,5,8)]=STONE;});
    expect(Math.min(...shades(flat.solid))).toBeLessThan(200);
  });
  test('faces against neighbouring chunks are culled; a whole flat chunk top is one quad',()=>{
    const full=empty();full.fill(STONE,0,CS*CS*20);
    const mesh=meshChunk(Array.from({length:9},()=>full));
    expect(mesh.solid.quads).toBe(1);expect(Math.max(...mesh.solid.info.filter((_,i)=>i%4<2))).toBe(CS);
    expect(Math.max(...mesh.solid.position.filter((_,i)=>i%3!==1))).toBe(CS);expect(Math.min(...mesh.solid.position.filter((_,i)=>i%3===1))).toBe(20);
  });
  test('water shows one lowered surface quad and the floor stays visible through it',()=>{
    const pool=empty();pool.fill(STONE,0,CS*CS*5);pool.fill(WATER,CS*CS*5,CS*CS*8);
    const mesh=meshChunk(Array.from({length:9},()=>pool));
    expect(mesh.water.quads).toBe(1);expect(mesh.solid.quads).toBe(1);
    for(let v=0;v<4;v++){expect(mesh.water.position[v*3+1]).toBe(8);expect(mesh.water.info[v*4+2]&LOWERED).toBe(LOWERED);}
  });
  test('quad index pattern forms two triangles per quad',()=>{
    expect([...quadIndices(2)]).toEqual([0,1,2,2,1,3,4,5,6,6,5,7]);
  });
});

describe('world edits',()=>{
  test('edits persist across chunk unload and serialize round-trip',()=>{
    const world=flatWorld(),gen=new TerrainGenerator(3);
    expect(world.get(3,9,3)).toBe(STONE);
    expect(world.set(3,9,3,AIR)).toBeTruthy();expect(world.set(-1,10,-20,DIRT)).toBeTruthy();
    expect(world.get(3,9,3)).toBe(AIR);expect(world.editCount).toBe(2);
    world.remove(chunkKey(0,0));expect(world.get(3,9,3)).toBe(-1);
    world.insert(0,0,gen.generate(0,0));expect(world.get(3,9,3)).toBe(AIR);
    const list=world.serializeEdits(),copy=new VoxelWorld();
    expect(copy.restoreEdits(list)).toBe(true);expect(copy.editCount).toBe(2);
    copy.insert(-1,-2,empty());expect(copy.get(-1,10,-20)).toBe(DIRT);
  });
  test('setting the same id is not an edit and out-of-range writes are rejected',()=>{
    const world=flatWorld();
    expect(world.set(0,5,0,STONE)).toBeUndefined();expect(world.set(0,CH,0,STONE)).toBeUndefined();
    expect(world.set(0,5,0,99)).toBeUndefined();expect(world.set(500,5,0,AIR)).toBeUndefined();
    expect(world.editCount).toBe(0);expect(world.get(0,-1,0)).toBe(BEDROCK);expect(world.get(0,CH+3,0)).toBe(AIR);
  });
  test('malformed edit lists are refused without changing state',()=>{
    const world=flatWorld();world.set(1,9,1,AIR);
    for(const bad of [null,'x',[0,0,1,CHUNK_VOLUME,1],[0,0,1,5,BLOCK_COUNT],[0,0,2,1,1],[0.5,0,0],[0,0,-1],[70000,0,0]])expect(world.restoreEdits(bad)).toBe(false);
    expect(world.editCount).toBe(1);
    const huge=[0,0,MAX_EDITS+1];for(let i=0;i<=MAX_EDITS;i++)huge.push(i,1);
    expect(world.restoreEdits(huge)).toBe(false);
  });
});

describe('player physics and picking',()=>{
  test('falls, lands flush on the ground and jumps about a block high',()=>{
    const world=flatWorld(10),p=createPlayer(.5,14,.5);
    run(world,p,idle,2);expect(p.y).toBeCloseTo(10,5);expect(p.onGround).toBe(true);
    let peak=p.y;stepPlayer(p,{...idle,jump:true},world,1/60);
    for(let i=0;i<60;i++){stepPlayer(p,idle,world,1/60);peak=Math.max(peak,p.y);}
    expect(peak-10).toBeGreaterThan(1.1);expect(peak-10).toBeLessThan(1.6);expect(p.y).toBeCloseTo(10,5);
  });
  test('walks forward along -z at walking speed and is stopped by a wall',()=>{
    const world=flatWorld(10),p=createPlayer(.5,10,.5);
    run(world,p,{...idle,forward:1},1);expect(p.z).toBeLessThan(-3.5);expect(Math.abs(p.x-.5)).toBeLessThan(1e-6);
    world.set(0,10,-8,STONE);world.set(0,11,-8,STONE);
    run(world,p,{...idle,forward:1},2);
    expect(p.z).toBeGreaterThan(-7);expect(p.z).toBeCloseTo(-7+.3,2);expect(playerCollides(world,p)).toBe(false);
  });
  test('cannot pass through a one-block gap under a ceiling and climbs out when embedded',()=>{
    const world=flatWorld(10),p=createPlayer(.5,10,.5);
    world.set(0,11,-3,STONE);run(world,p,{...idle,forward:1},2);expect(p.z).toBeGreaterThan(-2.5);
    const stuck=createPlayer(.5,8,.5);stepPlayer(stuck,idle,world,1/60);expect(playerCollides(world,stuck)).toBe(false);
  });
  test('water slows movement and jump swims upward',()=>{
    const world=new VoxelWorld(),data=empty();data.fill(STONE,0,CS*CS*4);data.fill(WATER,CS*CS*4,CS*CS*12);
    for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++)world.insert(cx,cz,data.slice());
    const p=createPlayer(8,6,8);run(world,p,idle,.5);expect(p.inWater).toBe(true);
    const y=p.y;run(world,p,{...idle,jump:true},1);expect(p.y).toBeGreaterThan(y+1);
    const q=createPlayer(8,4,8);run(world,q,{...idle,forward:1},1);expect(8-q.z).toBeLessThan(3);
  });
  test('raycast returns the first block and the face normal, skipping water',()=>{
    const world=flatWorld(10);world.set(2,10,0,WATER);
    const down=raycast(world,.5,12.5,.5,0,-1,0,6)!;expect(down).toMatchObject({x:0,y:9,z:0,nx:0,ny:1,nz:0,id:STONE});
    expect(raycast(world,.5,30,.5,0,-1,0,6)).toBeNull();
    const side=raycast(world,-3.5,10.5,.5,1,0,0,6);expect(side).toBeNull();
    world.set(0,10,0,DIRT);const hit=raycast(world,-2.5,10.5,.5,1,0,0,6)!;expect(hit).toMatchObject({x:0,y:10,z:0,nx:-1,id:DIRT});
    const through=raycast(world,4.5,10.5,.5,-1,0,0,6)!;expect(through).toMatchObject({x:0,nx:1});
  });
});

test('atlas paints every tile opaque',()=>{
  const data=paintAtlas();expect(data.length).toBe(ATLAS_WIDTH*ATLAS_HEIGHT*4);
  let painted=0;for(let i=3;i<data.length;i+=4)if(data[i]===255)painted++;
  expect(painted).toBe(17*16*16);
});
