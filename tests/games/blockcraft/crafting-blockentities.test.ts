import {describe,expect,test} from 'vitest';
import {AIR,B,blockDef,blockId} from '../../../src/games/blockcraft/data/blocks';
import {CHUNK_VOLUME,LAYER,chunkKey} from '../../../src/games/blockcraft/engine/constants';
import {createCrafting} from '../../../src/games/blockcraft/items/crafting';
import {createBlockEntities} from '../../../src/games/blockcraft/world/blockentities';
import {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import type {ChestEntity,FurnaceEntity,ItemStack} from '../../../src/games/blockcraft/engine/contracts';

const FLOOR=60;
/** The fake game's world is a real VoxelWorld (chunk insert/remove and edit lists). */
const voxels=(game:FakeGame)=>game.world as VoxelWorld;
/** A flat world (stone below FLOOR) with real crafting and block entity services; `edits` replays another world's edits. */
function setup(edits?:unknown){
  const game=createFakeGame();if(edits)voxels(game).restoreEdits(edits);game.flat(FLOOR,B.stone,1);
  // The engine's random() is a method on its own generator: calling it detached throws.
  const base=game.random;game.random=function(this:unknown){if(this!==game)throw new Error('game.random called unbound');return base();};
  game.crafting=createCrafting(game);
  const drops:{stack:ItemStack;x:number;y:number;z:number}[]=[],xp:number[]=[];
  game.entities.dropItem=(stack,x,y,z)=>{drops.push({stack:{...stack},x,y,z});};
  game.entities.dropXp=points=>{xp.push(points);};
  const be=createBlockEntities(game);game.blockEntities=be;be.init?.();
  const tick=(n:number)=>game.runTicks(n,[be]);
  const place=(name:string,x=0,z=0)=>{game.world.set(x,FLOOR,z,blockId(name));};
  const furnace=(name='furnace_north',x=0,z=0)=>{place(name,x,z);return be.get(x,FLOOR,z) as FurnaceEntity;};
  const blockName=(x=0,z=0)=>blockDef(game.world.get(x,FLOOR,z)).name;
  return{game,be,drops,xp,tick,place,furnace,blockName};
}
const total=(drops:{stack:ItemStack}[],id:string)=>drops.filter(d=>d.stack.id===id).reduce((n,d)=>n+d.stack.count,0);
const reload=(game:FakeGame)=>{
  const blocks=new Uint8Array(CHUNK_VOLUME);blocks.fill(B.stone,0,FLOOR*LAYER);voxels(game).insert(0,0,{blocks,biomes:new Uint8Array(LAYER)});
};

describe('block entity lifecycle',()=>{
  test('placing a chest or barrel creates an empty 27-slot chest entity',()=>{
    const {be,place}=setup();
    place('chest_south');place('barrel',3,3);
    for(const [x,z] of [[0,0],[3,3]]){
      const e=be.get(x,FLOOR,z) as ChestEntity;
      expect(e.kind).toBe('chest');expect(e.items).toHaveLength(27);expect(e.items.every(s=>s===null)).toBe(true);
    }
    expect(be.get(5,FLOOR-1,5)).toBeUndefined();
    expect(be.get(5,FLOOR,5)).toBeUndefined();
  });
  test('a new furnace is empty and unlit',()=>{
    const {furnace}=setup();
    expect(furnace()).toEqual({kind:'furnace',input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0});
  });
  test('get() creates the entity for a generated block that never fired blockChanged',()=>{
    const {game,be}=setup();
    const blocks=new Uint8Array(CHUNK_VOLUME);blocks[2+3*16+10*LAYER]=blockId('chest_east');
    voxels(game).insert(5,5,{blocks,biomes:new Uint8Array(LAYER)});
    expect(be.get(5*16+2,10,5*16+3)).toMatchObject({kind:'chest'});
  });
  test('contents drop inside the block when it is broken, and a new block starts empty',()=>{
    const {game,be,drops,place}=setup();
    place('chest_north',2,2);
    const chest=be.get(2,FLOOR,2) as ChestEntity;
    chest.items[0]={id:'dirt',count:5};chest.items[13]={id:'iron_pickaxe',count:1,damage:7};chest.items[26]={id:'cobblestone',count:64};
    game.world.set(2,FLOOR,2,AIR,'player');
    expect(total(drops,'dirt')).toBe(5);expect(total(drops,'cobblestone')).toBe(64);
    expect(drops.find(d=>d.stack.id==='iron_pickaxe')?.stack).toEqual({id:'iron_pickaxe',count:1,damage:7});
    // Vanilla splits big stacks into chunks of 10..30.
    for(const d of drops){
      expect(d.stack.count).toBeLessThanOrEqual(30);
      expect(d.x).toBeGreaterThanOrEqual(2);expect(d.x).toBeLessThan(3);expect(d.z).toBeGreaterThanOrEqual(2);expect(d.z).toBeLessThan(3);
      expect(d.y).toBeGreaterThanOrEqual(FLOOR);expect(d.y).toBeLessThan(FLOOR+1);
    }
    expect(be.get(2,FLOOR,2)).toBeUndefined();
    place('chest_north',2,2);
    expect((be.get(2,FLOOR,2) as ChestEntity).items.every(s=>s===null)).toBe(true);
  });
  test('each slot stack scatters from one spot and can be picked up at once (vanilla Containers.dropItemStack)',()=>{
    const {game,be,place}=setup();
    const spawned:{id:string;x:number;y:number;z:number;delay:number|undefined}[]=[];
    game.entities.dropItem=(stack,x,y,z,_velocity,delay)=>{spawned.push({id:stack.id,x,y,z,delay});};
    place('chest_north',2,2);
    const chest=be.get(2,FLOOR,2) as ChestEntity;chest.items[0]={id:'cobblestone',count:64};chest.items[9]={id:'dirt',count:64};
    game.world.set(2,FLOOR,2,AIR,'player');
    for(const id of ['cobblestone','dirt']){
      const pieces=spawned.filter(s=>s.id===id);
      expect(pieces.length).toBeGreaterThanOrEqual(3);// 64 split into pieces of 10..30
      for(const p of pieces)expect([p.x,p.y,p.z]).toEqual([pieces[0].x,pieces[0].y,pieces[0].z]);
    }
    expect(spawned.map(s=>s.delay)).toEqual(spawned.map(()=>0));
  });
  test('calls game.random as a method, as the engine binds it to its own generator',()=>{
    const {game,be,drops,xp,place,furnace}=setup();
    let seed=7;
    game.random=function(this:unknown){if(this!==game)throw new Error('random called unbound');seed=(seed*16807)%2147483647;return seed/2147483647;};
    place('chest_north');(be.get(0,FLOOR,0) as ChestEntity).items[0]={id:'dirt',count:40};
    expect(()=>game.world.set(0,FLOOR,0,AIR,'player')).not.toThrow();
    expect(total(drops,'dirt')).toBe(40);
    furnace().xp=1.5;
    expect(()=>game.world.set(0,FLOOR,0,AIR,'player')).not.toThrow();
    expect(xp).toHaveLength(1);
  });
  test('explosions and other replacements drop contents too',()=>{
    const {game,be,drops,place}=setup();
    place('barrel');(be.get(0,FLOOR,0) as ChestEntity).items[4]={id:'torch',count:12};
    game.world.set(0,FLOOR,0,AIR,'explosion');
    expect(total(drops,'torch')).toBe(12);
    place('chest_west');(be.get(0,FLOOR,0) as ChestEntity).items[1]={id:'stick',count:3};
    game.world.set(0,FLOOR,0,blockId('barrel'),'player');
    expect(total(drops,'stick')).toBe(3);
    expect((be.get(0,FLOOR,0) as ChestEntity).items.every(s=>s===null)).toBe(true);
  });
  test('furnace contents and stored experience drop when it is broken',()=>{
    const {game,drops,xp,furnace}=setup();
    const f=furnace();f.input={id:'raw_iron',count:3};f.fuel={id:'coal',count:2};f.output={id:'iron_ingot',count:4};f.xp=2.8;
    game.world.set(0,FLOOR,0,AIR,'player');
    expect([total(drops,'raw_iron'),total(drops,'coal'),total(drops,'iron_ingot')]).toEqual([3,2,4]);
    expect(xp).toHaveLength(1);expect([2,3]).toContain(xp[0]);
  });
  test('state changes within a family keep the same entity and drop nothing',()=>{
    const {game,be,drops,furnace,place}=setup();
    const f=furnace('furnace_north');f.input={id:'sand',count:3};
    game.world.set(0,FLOOR,0,blockId('furnace_lit_north'),'tick');
    expect(be.get(0,FLOOR,0)).toBe(f);
    game.world.set(0,FLOOR,0,blockId('furnace_east'),'player');
    expect(be.get(0,FLOOR,0)).toBe(f);
    place('chest_north',4,4);const c=be.get(4,FLOOR,4);
    game.world.set(4,FLOOR,4,blockId('chest_south'),'player');
    expect(be.get(4,FLOOR,4)).toBe(c);
    expect(drops).toEqual([]);
  });
  test('contents survive chunk unloads and come back with the chunk',()=>{
    const {game,be,place}=setup();
    place('chest_north',1,1);(be.get(1,FLOOR,1) as ChestEntity).items[3]={id:'diamond',count:2};
    voxels(game).remove(chunkKey(0,0));
    expect(game.world.get(1,FLOOR,1)).toBe(-1);
    expect((be.get(1,FLOOR,1) as ChestEntity).items[3]).toEqual({id:'diamond',count:2});
    reload(game);
    expect(blockDef(game.world.get(1,FLOOR,1)).family).toBe('chest');
    expect((be.get(1,FLOOR,1) as ChestEntity).items[3]).toEqual({id:'diamond',count:2});
  });
  test('reset clears every entity and dispose stops listening',()=>{
    const {game,be,drops,place}=setup();
    place('chest_north');(be.get(0,FLOOR,0) as ChestEntity).items[0]={id:'dirt',count:1};
    be.reset?.();
    expect((be.get(0,FLOOR,0) as ChestEntity).items[0]).toBeNull();
    (be.get(0,FLOOR,0) as ChestEntity).items[0]={id:'dirt',count:1};
    be.dispose?.();
    game.world.set(0,FLOOR,0,AIR,'player');
    expect(drops).toEqual([]);
  });
});

describe('furnace',()=>{
  test('timeline: lights, smelts one item per 10 s with xp, then goes out, keeping its facing',()=>{
    const {tick,furnace,blockName}=setup();
    const f=furnace('furnace_east');f.input={id:'raw_iron',count:2};f.fuel={id:'coal',count:1};
    tick(1);
    expect(blockName()).toBe('furnace_lit_east');
    expect(f.fuel).toBeNull();expect(f.burnTotal).toBe(80);expect(f.burn).toBe(80);expect(f.cook).toBeCloseTo(.05,9);
    tick(198);
    expect(f.output).toBeNull();expect(f.cook).toBeCloseTo(9.95,9);
    tick(1);
    expect(f.output).toEqual({id:'iron_ingot',count:1});expect(f.input).toEqual({id:'raw_iron',count:1});expect(f.cook).toBe(0);
    expect(f.xp).toBeCloseTo(.7,9);
    tick(200);
    expect(f.output).toEqual({id:'iron_ingot',count:2});expect(f.input).toBeNull();expect(f.xp).toBeCloseTo(1.4,9);
    expect(f.burn).toBeCloseTo(80-399/20,9);
    // The coal keeps burning out with nothing to cook: 1600 ticks in all.
    tick(1200);
    expect(blockName()).toBe('furnace_lit_east');expect(f.burn).toBeCloseTo(.05,9);
    tick(1);
    expect(blockName()).toBe('furnace_east');expect(f.burn).toBe(0);expect(f.burnTotal).toBe(80);
  });
  test('one coal smelts exactly eight items back to back with the next fuel',()=>{
    const {tick,furnace,blockName}=setup();
    const f=furnace();f.input={id:'cobblestone',count:16};f.fuel={id:'coal',count:2};
    tick(1600);
    expect(f.output).toEqual({id:'stone',count:8});expect(f.fuel).toEqual({id:'coal',count:1});
    tick(1);
    expect(f.fuel).toBeNull();expect(f.burn).toBe(80);expect(blockName()).toBe('furnace_lit_north');
    tick(1599);
    expect(f.output).toEqual({id:'stone',count:16});expect(f.input).toBeNull();
  });
  test('fuel is consumed only when the input can be smelted into the output slot',()=>{
    const {tick,furnace,blockName}=setup();
    const f=furnace();f.fuel={id:'coal',count:1};
    tick(40);expect(f.fuel).toEqual({id:'coal',count:1});expect(f.burn).toBe(0);expect(blockName()).toBe('furnace_north');
    f.input={id:'dirt',count:1};
    tick(40);expect(f.fuel).toEqual({id:'coal',count:1});
    f.input={id:'raw_iron',count:1};f.output={id:'iron_ingot',count:64};
    tick(40);expect(f.fuel).toEqual({id:'coal',count:1});
    f.output={id:'gold_ingot',count:1};
    tick(40);expect(f.fuel).toEqual({id:'coal',count:1});expect(f.cook).toBe(0);
    f.output={id:'iron_ingot',count:63};
    tick(1);expect(f.fuel).toBeNull();expect(blockName()).toBe('furnace_lit_north');
    tick(199);expect(f.output).toEqual({id:'iron_ingot',count:64});
  });
  test('non-fuel items are never burned and input without fuel does not cook',()=>{
    const {tick,furnace}=setup();
    const f=furnace();f.input={id:'sand',count:4};f.fuel={id:'stone',count:5};
    tick(100);
    expect(f.fuel).toEqual({id:'stone',count:5});expect(f.cook).toBe(0);expect(f.output).toBeNull();
    f.fuel=null;tick(10);expect(f.cook).toBe(0);
  });
  test('a lava bucket burns 1000 s and leaves an empty bucket in the fuel slot',()=>{
    const {tick,furnace}=setup();
    const f=furnace();f.input={id:'sand',count:1};f.fuel={id:'lava_bucket',count:1};
    tick(1);
    expect(f.fuel).toEqual({id:'bucket',count:1});expect(f.burnTotal).toBe(1000);
    tick(199);expect(f.output).toEqual({id:'glass',count:1});
  });
  test('without fuel, cooking progress falls back two ticks per tick; switching the input resets it',()=>{
    const {tick,furnace,blockName}=setup();
    const f=furnace();f.input={id:'raw_gold',count:2};f.fuel={id:'stick',count:1};
    tick(100);
    expect(f.cook).toBeCloseTo(5,9);expect(f.burn).toBeCloseTo(.05,9);
    tick(1);
    expect(blockName()).toBe('furnace_north');expect(f.cook).toBeCloseTo(4.9,9);
    tick(10);
    expect(f.cook).toBeCloseTo(3.9,9);
    f.fuel={id:'coal',count:1};tick(1);
    expect(f.cook).toBeCloseTo(3.95,9);expect(blockName()).toBe('furnace_lit_north');
    f.input={id:'raw_iron',count:1};tick(1);
    expect(f.cook).toBeCloseTo(.05,9);
    f.input={id:'raw_iron',count:3};tick(1);
    expect(f.cook).toBeCloseTo(.1,9);
  });
  test('a lit block with an idle furnace goes out; an unlit block with burning fuel lights',()=>{
    const {game,tick,furnace,blockName}=setup();
    furnace('furnace_lit_west');tick(1);
    expect(blockName()).toBe('furnace_west');
    const f=furnace('furnace_south',2,0);f.burn=10;f.burnTotal=80;
    tick(1);expect(blockName(2,0)).toBe('furnace_lit_south');
    expect(game.world.get(2,FLOOR,0)).toBe(blockId('furnace_lit_south'));
  });
  test('lit furnaces near the player smoke at their front and crackle now and then; distant ones stay quiet',()=>{
    const {game,tick,furnace}=setup();
    const particles:{kind:string;x:number;z:number}[]=[];
    game.render.spawnParticles=(kind,x,_y,z)=>{particles.push({kind,x,z});};
    const f=furnace('furnace_south',0,0);f.input={id:'cobblestone',count:64};f.fuel={id:'coal_block',count:1};
    game.player.teleport(.5,FLOOR,4.5);
    tick(1000);
    expect(particles.some(p=>p.kind==='smoke')).toBe(true);expect(particles.some(p=>p.kind==='flame')).toBe(true);
    for(const p of particles)expect(p.z).toBeCloseTo(1.02,5);// the south (+z) face
    expect(game.sounds.played.some(s=>s.name==='furnace')).toBe(true);
    particles.length=0;game.sounds.played.length=0;
    game.player.teleport(.5,FLOOR,40.5);
    tick(1000);
    expect(particles).toEqual([]);expect(game.sounds.played).toEqual([]);
  });
  test('a burning furnace looks up its recipe only when the input item changes',()=>{
    const {game,tick,furnace}=setup();
    let lookups=0;const smelt=game.crafting.smelt;game.crafting.smelt=id=>{lookups++;return smelt(id);};
    const f=furnace();f.input={id:'cobblestone',count:64};f.fuel={id:'coal',count:8};
    tick(400);
    expect(f.output).toEqual({id:'stone',count:2});expect(lookups).toBe(1);
    f.output=null;f.input={id:'raw_iron',count:1};
    tick(200);
    expect(f.output).toEqual({id:'iron_ingot',count:1});expect(lookups).toBe(2);
  });
  test('lit-furnace effects reuse their option objects instead of allocating per tick',()=>{
    const {game,tick,furnace}=setup();
    const particleOptions=new Set<unknown>(),soundOptions=new Set<unknown>();
    game.render.spawnParticles=(_kind,_x,_y,_z,options)=>{particleOptions.add(options);};
    const play=game.sounds.play.bind(game.sounds);
    game.sounds.play=(name,at,options)=>{soundOptions.add(options);play(name,at,options);};
    const f=furnace('furnace_south');f.input={id:'cobblestone',count:64};f.fuel={id:'coal_block',count:1};
    game.player.teleport(.5,FLOOR,4.5);
    tick(2000);
    expect(particleOptions.size).toBe(1);expect([...particleOptions][0]).toEqual({count:1,spread:.02});
    expect(soundOptions.size).toBe(1);expect([...soundOptions][0]).toEqual({volume:1,pitch:1});
  });
  test('only furnaces in loaded chunks tick',()=>{
    const {game,be,tick,furnace}=setup();
    const f=furnace('furnace_north',1,1);f.input={id:'sand',count:2};f.fuel={id:'coal',count:1};
    tick(10);
    const cook=f.cook;
    voxels(game).remove(chunkKey(0,0));
    tick(400);
    expect(f.cook).toBe(cook);expect(f.output).toBeNull();
    reload(game);
    expect(be.get(1,FLOOR,1)).toBe(f);
    tick(200-10);
    expect(f.output).toEqual({id:'glass',count:1});
  });
});

describe('persistence',()=>{
  /** A second world with the same block edits, restored from the first one's JSON save. */
  function roundTrip(from:ReturnType<typeof setup>){
    const to=setup(voxels(from.game).serializeEdits());
    to.be.restore?.(JSON.parse(JSON.stringify(from.be.serialize?.())));
    return to.be;
  }
  test('chests, barrels and furnaces restore by position',()=>{
    const world=setup(),{be,place,furnace}=world;
    place('chest_north',1,0);(be.get(1,FLOOR,0) as ChestEntity).items[5]={id:'iron_sword',count:1,damage:30};
    place('barrel',-3,4);(be.get(-3,FLOOR,4) as ChestEntity).items[26]={id:'wheat',count:17};
    const f=furnace('furnace_lit_east',4,-2);Object.assign(f,{input:{id:'beef',count:3},fuel:{id:'coal',count:1},output:{id:'cooked_beef',count:2},
      burn:42.5,burnTotal:80,cook:3.35,xp:.7});
    const copy=roundTrip(world);
    expect((copy.get(1,FLOOR,0) as ChestEntity).items[5]).toEqual({id:'iron_sword',count:1,damage:30});
    expect((copy.get(-3,FLOOR,4) as ChestEntity).items[26]).toEqual({id:'wheat',count:17});
    expect(copy.get(4,FLOOR,-2)).toEqual(f);
  });
  test('restored contents wait in unloaded chunks',()=>{
    const {be,place}=setup();
    place('chest_north',1,0);(be.get(1,FLOOR,0) as ChestEntity).items[0]={id:'apple',count:3};
    const data=JSON.parse(JSON.stringify(be.serialize?.()));
    const game=createFakeGame();game.crafting=createCrafting(game);
    const copy=createBlockEntities(game);copy.init?.();copy.restore?.(data);
    expect((copy.get(1,FLOOR,0) as ChestEntity).items[0]).toEqual({id:'apple',count:3});
  });
  test('invalid data is ignored without throwing',()=>{
    const {be,place}=setup();
    place('chest_north',0,1);place('furnace_north',0,2);
    for(const bad of [null,undefined,42,'x',{},{entities:'x'},[[1,2]],{v:1,entities:[[0,1]]}])expect(()=>be.restore?.(bad)).not.toThrow();
    be.restore?.({v:1,entities:[
      [0.5,FLOOR,0,{kind:'chest',items:[]}],
      [0,FLOOR,1,{kind:'chest',items:new Array(27).fill({id:'nope',count:1})}],
      [0,FLOOR,2,{kind:'furnace',input:{id:'sand',count:999},fuel:null,output:null,burn:-1,burnTotal:'x',cook:Infinity,xp:NaN}],
      [0,999,3,{kind:'chest',items:new Array(27).fill(null)}],
      [0,FLOOR,4,{kind:'hopper'}]]});
    const c=be.get(0,FLOOR,1) as ChestEntity;
    expect(c.items).toHaveLength(27);expect(c.items.every(s=>s===null)).toBe(true);
    const f=be.get(0,FLOOR,2) as FurnaceEntity;
    expect(f.kind).toBe('furnace');expect(f.input).toBeNull();
    for(const k of ['burn','burnTotal','cook','xp'] as const){expect(Number.isFinite(f[k])).toBe(true);expect(f[k]).toBeGreaterThanOrEqual(0);}
    expect(be.get(0,FLOOR,4)).toBeUndefined();
  });
  test('a stale restored entity whose block is gone is discarded without drops',()=>{
    const {be,place}=setup();
    place('chest_north',1,0);(be.get(1,FLOOR,0) as ChestEntity).items[0]={id:'apple',count:3};
    const data=JSON.parse(JSON.stringify(be.serialize?.()));
    const {be:copy,drops}=setup();// the chest was never placed in this world
    copy.restore?.(data);
    expect(copy.get(1,FLOOR,0)).toBeUndefined();expect(drops).toEqual([]);
  });
});
