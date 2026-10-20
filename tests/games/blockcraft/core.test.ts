import {describe,expect,test} from 'vitest';
import {BLOCKS,BLOCK_COUNT,TILE_NAMES,blockId,blockDef,B,OPAQUE,familyStates,stateFor} from '../../../src/games/blockcraft/data/blocks';
import {ITEMS,ITEM_SPRITES,parseStack,itemForBlock,requireItem} from '../../../src/games/blockcraft/data/items';
import {BIOMES} from '../../../src/games/blockcraft/data/biomes';
import {CS,CH,CHUNK_VOLUME,LAYER,PAD_VOLUME,voxelIndex,chunkKey,keyX,keyZ} from '../../../src/games/blockcraft/engine/constants';
import {VoxelWorld,MAX_EDITS} from '../../../src/games/blockcraft/world/world';
import {moveBody,raycast,bodyCollides,rayBox} from '../../../src/games/blockcraft/engine/physics';
import {EventBus} from '../../../src/games/blockcraft/engine/events';
import {createTerrain} from '../../../src/games/blockcraft/world/terrain';
import {createLightEngine} from '../../../src/games/blockcraft/world/light';
import {createMesher} from '../../../src/games/blockcraft/render/mesher';
import {daylightAt} from '../../../src/games/blockcraft/engine/game';
import type {ChunkData,GameEvents} from '../../../src/games/blockcraft/engine/contracts';

const chunk=(fill:(b:Uint8Array)=>void=()=>{}):ChunkData=>{const blocks=new Uint8Array(CHUNK_VOLUME);fill(blocks);return{blocks,biomes:new Uint8Array(LAYER)};};
function flatWorld(height=10){
  const world=new VoxelWorld();
  for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++)world.insert(cx,cz,chunk(b=>b.fill(B.stone,0,height*LAYER)));
  return world;
}

describe('registries',()=>{
  test('block ids fit in a byte, names are unique and every tile is listed',()=>{
    expect(BLOCK_COUNT).toBeLessThanOrEqual(256);expect(new Set(BLOCKS.map(b=>b.name)).size).toBe(BLOCK_COUNT);
    for(const b of BLOCKS)for(const t of b.tiles)expect(TILE_NAMES).toContain(t);
    expect(blockDef(blockId('stone')).name).toBe('stone');expect(OPAQUE[B.stone]).toBe(1);expect(OPAQUE[B.glass]).toBe(0);
  });
  test('stateful blocks resolve by family and state',()=>{
    expect(familyStates('wheat')).toHaveLength(8);
    expect(stateFor('furnace',{facing:'east',lit:true})?.name).toBe('furnace_lit_east');
    expect(stateFor('oak_door',{half:'upper',open:true,facing:'north'})?.name).toBe('oak_door_upper_open_north');
  });
  test('items: every sprite listed, block items exist, stacks validate',()=>{
    expect(new Set(ITEM_SPRITES).size).toBe(ITEM_SPRITES.length);
    for(const d of ITEMS.values())if(d.icon.kind==='sprite')expect(ITEM_SPRITES).toContain(d.icon.sprite);
    expect(itemForBlock(B.grass)?.id).toBe('grass_block');expect(requireItem('diamond_pickaxe').tool?.level).toBe(3);
    expect(parseStack({id:'stone',count:64})).toEqual({id:'stone',count:64});
    for(const bad of [null,{id:'nope',count:1},{id:'stone',count:65},{id:'stone',count:0},{id:'iron_pickaxe',count:1,damage:9999}])expect(parseStack(bad)).toBeNull();
  });
  test('biomes reference real blocks',()=>{for(const b of BIOMES)for(const n of [b.top,b.filler,b.underwater])expect(()=>blockId(n)).not.toThrow();});
});

describe('world',()=>{
  test('chunk keys round-trip negative coordinates',()=>{for(const [x,z] of [[0,0],[-1,5],[300,-300],[-32000,32000]])expect([keyX(chunkKey(x,z)),keyZ(chunkKey(x,z))]).toEqual([x,z]);});
  test('edits persist across unload, emit events and maintain the heightmap',()=>{
    const events=new EventBus<GameEvents>(),seen:number[]=[];events.on('blockChanged',e=>seen.push(e.to));
    const world=new VoxelWorld(events);world.insert(0,0,chunk(b=>b.fill(B.stone,0,10*LAYER)));
    expect(world.topY(3,3)).toBe(9);
    expect(world.set(3,9,3,0)).toBe(true);expect(world.topY(3,3)).toBe(8);expect(seen).toEqual([0]);
    expect(world.set(3,20,3,B.glass)).toBe(true);expect(world.topY(3,3)).toBe(20);
    world.remove(chunkKey(0,0));expect(world.get(3,9,3)).toBe(-1);
    world.insert(0,0,chunk(b=>b.fill(B.stone,0,10*LAYER)));expect(world.get(3,9,3)).toBe(0);
    const copy=new VoxelWorld();expect(copy.restoreEdits(world.serializeEdits())).toBe(true);expect(copy.editCount).toBe(2);
  });
  test('rejects invalid writes and malformed edit lists',()=>{
    const world=flatWorld();
    expect(world.set(0,CH,0,1)).toBe(false);expect(world.set(0,5,0,999)).toBe(false);expect(world.set(500,5,0,0)).toBe(false);expect(world.set(.5,5,0,0)).toBe(false);
    for(const bad of [null,'x',[0,0,1,CHUNK_VOLUME,1],[0,0,1,5,BLOCK_COUNT],[0,0,2,1,1],[.5,0,0]])expect(world.restoreEdits(bad)).toBe(false);
    expect(MAX_EDITS).toBeGreaterThan(1000);
  });
  test('light falls back to sky above the heightmap until meshed',()=>{const w=flatWorld(10);expect(w.lightAt(0,12,0)>>4).toBe(15);expect(w.lightAt(0,5,0)).toBe(0);});
});

describe('physics',()=>{
  test('a body falls, lands flush and is stopped by walls',()=>{
    const w=flatWorld(10),b={x:.5,y:14,z:.5,vx:0,vy:0,vz:0,onGround:false};
    for(let i=0;i<120;i++){b.vy-=32/60;moveBody(w,b,.3,1.8,1/60);}
    expect(b.y).toBeCloseTo(10,5);expect(b.onGround).toBe(true);
    w.set(0,10,-3,B.stone);w.set(0,11,-3,B.stone);
    for(let i=0;i<120;i++){b.vz=-4;moveBody(w,b,.3,1.8,1/60);}
    expect(b.z).toBeCloseTo(-2+.3,2);expect(bodyCollides(w,b,.3,1.8)).toBe(false);
  });
  test('raycast hits the first solid block and skips liquids; rayBox measures entity hits',()=>{
    const w=flatWorld(10);w.set(2,10,0,B.water);
    expect(raycast(w,.5,12.5,.5,0,-1,0,6)).toMatchObject({x:0,y:9,z:0,ny:1});
    expect(raycast(w,-3.5,10.5,.5,1,0,0,6)).toBeNull();
    expect(rayBox(0,0,0,1,0,0,2,-1,-1,3,1,1)).toBeCloseTo(2);expect(rayBox(0,0,0,-1,0,0,2,-1,-1,3,1,1)).toBe(-1);
  });
});

describe('pipeline stubs',()=>{
  test('terrain is deterministic with biomes and a dry spawn',()=>{
    const a=createTerrain(42),b=createTerrain(42),c=a.generate(0,0);
    expect(c.blocks).toEqual(b.generate(0,0).blocks);expect(c.blocks.length).toBe(CHUNK_VOLUME);expect(c.biomes.length).toBe(LAYER);
    const s=a.spawnPoint();expect(s.y).toBeGreaterThan(60);
  });
  test('light and mesher produce the shared vertex layout',()=>{
    const t=createTerrain(7),n:ChunkData[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)n.push(t.generate(dx,dz));
    const light=new Uint8Array(PAD_VOLUME);createLightEngine().computePadded(n,light);
    const mesh=createMesher().meshChunk(n,light);
    expect(mesh.opaque.quads).toBeGreaterThan(50);
    for(const part of [mesh.opaque,mesh.cutout,mesh.translucent]){expect(part.position.length).toBe(part.quads*16);expect(part.uvt.length).toBe(part.quads*16);expect(part.tint.length).toBe(part.quads*16);}
    const maxX=Math.max(...[...mesh.opaque.position].filter((_,i)=>i%4===0));expect(maxX).toBeLessThanOrEqual(CS*16);
  });
  test('daylight peaks at noon and is dark at midnight',()=>{expect(daylightAt(6000)).toBe(1);expect(daylightAt(18000)).toBe(0);expect(daylightAt(0)).toBeGreaterThan(.2);});
});
