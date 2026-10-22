import {describe,expect,test} from 'vitest';
import {BLOCKS,BLOCK_COUNT,TILE_NAMES,blockId,blockDef,B,OPAQUE,familyStates,stateFor} from '../../../src/games/blockcraft/data/blocks';
import {ITEMS,ITEM_SPRITES,parseStack,itemForBlock,requireItem} from '../../../src/games/blockcraft/data/items';
import {BIOMES} from '../../../src/games/blockcraft/data/biomes';
import {CS,CH,CHUNK_LIMIT,CHUNK_VOLUME,LAYER,PAD_VOLUME,voxelIndex,chunkKey,keyX,keyZ} from '../../../src/games/blockcraft/engine/constants';
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
  test('chunk keys round-trip negative coordinates and stay small integers',()=>{
    for(const [x,z] of [[0,0],[-1,5],[300,-300],[-16000,16000],[-16384,16383]]){
      const k=chunkKey(x,z);expect([keyX(k),keyZ(k)]).toEqual([x,z]);expect(k).toBeGreaterThanOrEqual(0);expect(k).toBeLessThan(2**30);
    }
  });
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
  test('edits save as one compact segment per chunk, re-encoded only when that chunk changes',()=>{
    const world=flatWorld();
    for(let x=0;x<16;x++)for(let z=0;z<16;z++)world.set(x,12,z,B.glass);
    world.set(-20,3,-20,0);world.set(-20,4,-20,B.glass);
    const first=world.serializeEdits();expect(first).toHaveLength(2);
    expect(first.every(s=>typeof s==='string')).toBe(true);
    // 4 bytes of chunk coordinates, then 3 per edit, in base64.
    expect(first.reduce((n,s)=>n+s.length,0)).toBe(Math.ceil((4+256*3)/3)*4+Math.ceil((4+2*3)/3)*4);
    const again=world.serializeEdits();expect(again[0]).toBe(first[0]);expect(again[1]).toBe(first[1]);
    world.set(-20,5,-20,B.glass);
    const changed=world.serializeEdits(),i=changed.findIndex(s=>!first.includes(s));expect(i).toBeGreaterThanOrEqual(0);
    expect(changed.filter(s=>first.includes(s))).toHaveLength(1);
    const copy=new VoxelWorld();expect(copy.restoreEdits(JSON.parse(JSON.stringify(changed)))).toBe(true);expect(copy.editCount).toBe(259);
    copy.insert(-2,-2,chunk(b=>b.fill(B.stone,0,10*LAYER)));expect(copy.get(-20,5,-20)).toBe(B.glass);expect(copy.get(-20,3,-20)).toBe(0);
    // Saves from before (a flat list of cx, cz, count, then index/id pairs) still load.
    const legacy=new VoxelWorld();expect(legacy.restoreEdits([0,0,2,5,B.glass,6,B.glass,-1,3,1,7,0])).toBe(true);expect(legacy.editCount).toBe(3);
    expect(legacy.serializeEdits()).toHaveLength(2);
    // Malformed segments (bad base64, a ragged tail, out-of-range index or id, a repeated chunk, mixed lists) are refused.
    const seg=(bytes:number[])=>btoa(String.fromCharCode(...bytes));
    for(const bad of [['@@'],[seg([0,0,0,0,1])],[seg([0,0,0,0,0,0x80,1])],[seg([0,0,0,0,0,0,BLOCK_COUNT])],[seg([0,0x40,0,0])],
      [first[0],first[0]],[first[0],5]])expect(new VoxelWorld().restoreEdits(bad)).toBe(false);
    expect(new VoxelWorld().restoreEdits([seg([0,0,0,0,0,0,1])])).toBe(true);
    // Every chunk a key can name loads back: cx=-CHUNK_LIMIT is in range, cx=CHUNK_LIMIT (above) is not.
    expect(new VoxelWorld().restoreEdits([seg([0,0xc0,0xff,0x3f,0,0,1])])).toBe(true);
    const edge=new VoxelWorld();edge.insert(-CHUNK_LIMIT,CHUNK_LIMIT-1,chunk(b=>b.fill(B.stone,0,10*LAYER)));
    expect(edge.set(-CHUNK_LIMIT*16,3,CHUNK_LIMIT*16-1,0)).toBe(true);
    expect(new VoxelWorld().restoreEdits(JSON.parse(JSON.stringify(edge.serializeEdits())))).toBe(true);
    expect(new VoxelWorld().restoreEdits([0,0,0,-CHUNK_LIMIT,CHUNK_LIMIT-1,0])).toBe(true);
    expect(new VoxelWorld().restoreEdits([CHUNK_LIMIT,0,0])).toBe(false);
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

describe('fake game helper',()=>{
  test('builds a flat world, records sounds and advances time',async()=>{
    const {createFakeGame}=await import('./helpers/fake-game');
    const game=createFakeGame();game.flat(60);
    expect(game.world.get(0,59,0)).toBe(B.stone);expect(game.world.get(0,60,0)).toBe(0);
    game.sounds.play('click');expect(game.sounds.played[0].name).toBe('click');
    const before=game.time.dayTime;game.runTicks(20);expect(game.time.dayTime).toBe(before+20);
  });
});

describe('shell instance without WebGL 2',()=>{
  test('hands back the save it was restored with, so autosaves never replace the world with null',async()=>{
    const {fallbackInstance}=await import('../../../src/games/blockcraft/engine/game');
    let removed=0;
    const fresh=fallbackInstance(()=>{removed++;});expect(fresh.serialize()).toBeNull();
    const instance=fallbackInstance(()=>{removed++;}),world={version:2,seed:5,edits:[0,0,1,100,1],systems:{}};
    instance.restore(world);instance.pause();instance.resume();instance.restart();
    expect(instance.serialize()).toBe(world);
    instance.dispose();expect(removed).toBe(1);
  });
});
