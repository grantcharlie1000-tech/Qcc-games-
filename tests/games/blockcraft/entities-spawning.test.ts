import {describe,expect,test} from 'vitest';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {BIOME_BY_NAME} from '../../../src/games/blockcraft/data/biomes';
import {SEA_LEVEL} from '../../../src/games/blockcraft/engine/constants';
import {HOSTILE_CAP,PASSIVE_CAP,WATER_CAP,spawnWeights} from '../../../src/games/blockcraft/entity/spawning';
import type {Entity,EntityKind,SpawnReason} from '../../../src/games/blockcraft/engine/contracts';
import {harness,monster,walker} from './entities-helpers';

const cow=walker({kind:'cow',width:.9,height:1.4,spawn:{light:'grass',group:[2,4]}});
const pig=walker({kind:'pig',width:.9,height:.9,spawn:{light:'grass',group:[2,4]}});
const wolf=walker({kind:'wolf',width:.6,height:.85,spawn:{light:'grass',group:[4,4],biomes:[['forest',5]]}});
const zombie=monster({kind:'zombie',spawn:{light:'dark',group:[2,4],weight:100}});
const husk=monster({kind:'husk',spawn:{light:'dark',group:[2,4],weight:80,biomes:[['desert',80]],replaces:'zombie'}});
const skeleton=monster({kind:'skeleton',spawn:{light:'dark',group:[2,4],weight:100}});
const squid=walker({kind:'squid',category:'water',aquatic:true,width:.8,height:.8,physics:{gravity:0},spawn:{light:'water',group:[1,4]}});
function record(h:ReturnType<typeof harness>){const out:{e:Entity;reason:SpawnReason}[]=[];h.game.events.on('entitySpawned',({entity,reason})=>out.push({e:entity,reason}));return out;}

describe('passive spawning',()=>{
  test('fresh chunks get packs from the biome weights on grass, capped at 20',()=>{
    const h=harness({kinds:[cow,pig,wolf],biome:'plains',block:B.grass,r:4,spawning:true,seed:3});
    const animals=h.game.entities.all().filter(e=>e.category==='passive');
    expect(animals.length).toBeGreaterThan(3);expect(animals.length).toBeLessThanOrEqual(PASSIVE_CAP);
    expect(new Set(animals.map(e=>e.kind))).toEqual(new Set(['cow','pig']));
    expect(animals.every(e=>e.y===60&&h.game.world.get(Math.floor(e.x),59,Math.floor(e.z))===B.grass)).toBe(true);
  });
  test('the chunk reason is reported and stone or disabled spawning gives nothing',()=>{
    const reasons=new Set<SpawnReason>();
    const probe=walker({kind:'cow',width:.9,height:1.4,spawn:{light:'grass',group:[2,4]},init:(_e,_g,reason)=>{reasons.add(reason);}});
    const h=harness({kinds:[probe],biome:'plains',block:B.grass,r:4,spawning:true});
    expect(h.game.entities.count('passive')).toBeGreaterThan(0);expect([...reasons]).toEqual(['chunk']);
    expect(harness({kinds:[cow],biome:'plains',block:B.stone,r:4,spawning:true}).game.entities.count('passive')).toBe(0);
    expect(harness({kinds:[cow],biome:'plains',block:B.grass,r:4,spawning:false}).game.entities.count('passive')).toBe(0);
    expect(harness({kinds:[cow],biome:'ocean',block:B.grass,r:4,spawning:true}).game.entities.count('passive')).toBe(0);
  });
  test('kinds that list biomes only spawn there',()=>{
    const h=harness({kinds:[wolf],biome:'forest',block:B.grass,r:4,spawning:true,seed:11});
    expect(h.game.entities.count('passive')).toBeGreaterThan(0);
    expect(harness({kinds:[wolf],biome:'plains',block:B.grass,r:4,spawning:true,seed:11}).game.entities.count('passive')).toBe(0);
  });
});

describe('hostile spawning',()=>{
  test('monsters spawn in darkness on opaque ground, 24 to 64 blocks from the player',()=>{
    const h=harness({kinds:[zombie],r:4,light:0,spawning:true});
    const spawned=record(h);
    h.tick(600);
    const natural=spawned.filter(s=>s.reason==='natural');
    expect(natural.length).toBeGreaterThan(0);
    const p=h.game.player.state;
    for(const {e} of natural){
      expect(Math.hypot(e.x-p.x,e.y-p.y,e.z-p.z)).toBeGreaterThan(24);expect(Math.hypot(e.x-p.x,e.z-p.z)).toBeLessThanOrEqual(64);
      expect(e.y).toBe(60);expect(h.game.world.get(Math.floor(e.x),59,Math.floor(e.z))).toBe(B.stone);
    }
    expect(h.game.entities.count('hostile')).toBeLessThanOrEqual(HOSTILE_CAP);
  });
  test('no monsters in full daylight, under torchlight or in peaceful',()=>{
    const day=harness({kinds:[zombie],r:4,light:0xf0,spawning:true});day.tick(600);expect(day.game.entities.count('hostile')).toBe(0);
    const lit=harness({kinds:[zombie],r:4,light:0x0e,spawning:true});lit.tick(600);expect(lit.game.entities.count('hostile')).toBe(0);
    const calm=harness({kinds:[zombie],r:4,light:0,spawning:true});calm.game.settings.difficulty='peaceful';calm.tick(600);
    expect(calm.game.entities.count('hostile')).toBe(0);
  });
  test('peaceful removes hostile mobs',()=>{
    const h=harness({kinds:[zombie,cow]}),z=h.game.entities.spawn('zombie',3.5,60,3.5)!,c=h.game.entities.spawn('cow',5.5,60,5.5)!;
    h.game.settings.difficulty='peaceful';h.tick();
    expect(z.removed).toBe(true);expect(c.removed).toBe(false);
  });
  test('the cap of 40 stops natural spawning',()=>{
    const h=harness({kinds:[zombie],r:4,light:0,spawning:true});
    for(let i=0;i<HOSTILE_CAP;i++)h.game.entities.spawn('zombie',-30.5+i,60,30.5);
    const spawned=record(h);h.tick(300);
    expect(spawned.filter(s=>s.reason==='natural')).toHaveLength(0);
  });
  test('weights: biome filters, replacements and no monsters in mushroom fields',()=>{
    const kinds:EntityKind[]=[zombie,husk,skeleton];
    const w=(biome:string)=>Object.fromEntries(spawnWeights(kinds,BIOME_BY_NAME.get(biome)!,'dark').map(([k,n])=>[k.kind,n]));
    expect(w('desert')).toEqual({zombie:20,husk:80,skeleton:100});
    expect(w('plains')).toEqual({zombie:100,skeleton:100});
    expect(w('mushroom_fields')).toEqual({});
    expect(spawnWeights([cow,pig,wolf],BIOME_BY_NAME.get('plains')!,'grass').map(([k,n])=>[k.kind,n])).toEqual([['cow',10],['pig',10]]);
  });
  test('despawning: instantly beyond 128 blocks, randomly beyond 32 after idling, never for animals',()=>{
    const h=harness({kinds:[zombie,cow]});
    const far=h.game.entities.spawn('zombie',140.5,60,.5)!,mid=h.game.entities.spawn('zombie',.5,60,30.5)!,near=h.game.entities.spawn('zombie',.5,60,10.5)!;
    mid.z=40.5;// beyond 32 but in a loaded chunk
    const animal=h.game.entities.spawn('cow',200.5,60,.5)!;
    h.tick(1);expect(far.removed).toBe(true);
    h.tick(600);expect(mid.removed).toBe(false);
    h.tick(6000);
    expect(mid.removed).toBe(true);expect(near.removed).toBe(false);expect(animal.removed).toBe(false);
  });
});

describe('aquatic monsters',()=>{
  test('an aquatic kind that replaces another spawns in its place in water, keeping land weights',()=>{
    const drowned=monster({kind:'drowned',aquatic:true,spawn:{light:'dark',group:[1,2],weight:100,biomes:[['river',100]],replaces:'zombie'}});
    expect(spawnWeights([zombie,drowned],BIOME_BY_NAME.get('river')!,'dark').map(([k,n])=>[k.kind,n])).toEqual([['zombie',100],['drowned',100]]);
    const h=harness({kinds:[zombie,drowned],r:4,height:50,layers:[[B.water,50,58]],biome:'river',light:0,spawning:true});
    h.tick(900);
    const list=h.game.entities.all().filter(e=>e.category==='hostile');
    expect(list.length).toBeGreaterThan(0);
    for(const e of list){expect(e.kind).toBe('drowned');expect(h.game.world.get(Math.floor(e.x),Math.floor(e.y),Math.floor(e.z))).toBe(B.water);}
  });
});

describe('water spawning',()=>{
  test('squid spawn in ocean water columns, capped at 8',()=>{
    const h=harness({kinds:[squid],r:4,height:45,layers:[[B.water,45,SEA_LEVEL]],biome:'ocean',spawning:true});
    h.tick(400);
    const list=h.game.entities.all().filter(e=>e.category==='water');
    expect(list.length).toBeGreaterThan(0);expect(list.length).toBeLessThanOrEqual(WATER_CAP);
    expect(list.every(e=>e.y>=SEA_LEVEL-12&&e.y<=SEA_LEVEL+1&&e.inWater)).toBe(true);
    const plains=harness({kinds:[squid],r:4,height:45,layers:[[B.water,45,SEA_LEVEL]],biome:'plains',spawning:true});plains.tick(400);
    expect(plains.game.entities.count('water')).toBe(0);
  });
});
