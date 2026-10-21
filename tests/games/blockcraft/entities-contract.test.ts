// Entity framework behaviour added for the integrated contract: the undead flag, zero-damage hits, entityRemoved,
// player-kill memory in entityDied, despawn predicates, spawn.check, water-avoiding paths, the biome top block for
// animal spawns and the ledge climb-out of aquatic land mobs.
import {describe,expect,test} from 'vitest';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import {findPath} from '../../../src/games/blockcraft/entity/ai-path';
import {DEATH_TICKS,PLAYER_KILL_MEMORY} from '../../../src/games/blockcraft/entity/entities';
import {isDarkEnoughToSpawn} from '../../../src/games/blockcraft/entity/spawning';
import type {DamageSource,Entity,EntityKind,SpawnReason} from '../../../src/games/blockcraft/engine/contracts';
import {registerHostileMobs} from '../../../src/games/blockcraft/entity/hostile';
import {registerMonsters} from '../../../src/games/blockcraft/entity/monsters';
import {fill,harness,monster,walker} from './entities-helpers';

const settle=(h:ReturnType<typeof harness>)=>h.tick(3);
function removals(h:ReturnType<typeof harness>){const out:Entity[]=[];h.game.events.on('entityRemoved',p=>{if(p)out.push(p.entity);});return out;}
function spawns(h:ReturnType<typeof harness>){const out:{e:Entity;reason:SpawnReason}[]=[];h.game.events.on('entitySpawned',({entity,reason})=>out.push({e:entity,reason}));return out;}

describe('undead flag',()=>{
  test('undead kinds never drown; an explicit undead:false overrides the burnsInDaylight inference',()=>{
    const h=harness({kinds:[monster({kind:'ghoul',undead:true,physics:'none'}),monster({kind:'wight',undead:false,burnsInDaylight:true,physics:'none'}),
      monster({kind:'zombie',burnsInDaylight:true,physics:'none'})]});
    fill(h.game,-8,60,-2,8,64,2,B.water);
    const ghoul=h.game.entities.spawn('ghoul',-4.5,60,.5)!,wight=h.game.entities.spawn('wight',.5,60,.5)!,zombie=h.game.entities.spawn('zombie',4.5,60,.5)!;
    h.tick(400);
    expect(ghoul.health).toBe(20);expect(zombie.health).toBe(20);expect(wight.health).toBeLessThan(20);
  });
});

describe('zero-damage hits',()=>{
  test('flash, invulnerability, knockback, the hurt hook and the hurt sound, but no health lost',()=>{
    const hooks:number[]=[];
    const h=harness({kinds:[walker({sounds:{name:'cow'},hurt:(_e,_g,_s,amount)=>{hooks.push(amount);}})]});
    const e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    const snowball:DamageSource={kind:'projectile',byPlayer:true,knockback:{x:1,z:0,strength:8}};
    expect(h.game.entities.damage(e,0,snowball)).toBe(true);
    expect(e.health).toBe(20);expect(e.hurtTime).toBe(10);expect(e.vx).toBeCloseTo(8,5);expect(e.vy).toBeGreaterThan(0);
    expect(hooks).toEqual([0]);expect(h.sounds()).toContain('mob:cow:hurt');
    // During the invulnerability another zero hit is refused; a real hit deals its full amount (lastHurt 0).
    expect(h.game.entities.damage(e,0,snowball)).toBe(false);expect(hooks).toEqual([0]);
    expect(h.game.entities.damage(e,3,{kind:'mob'})).toBe(true);expect(e.health).toBe(17);
    h.tick(10);
    expect(h.game.entities.damage(e,0,snowball)).toBe(true);expect(hooks).toEqual([0,3,0]);
  });
  test('negative and non-finite amounts are still refused; items ignore zero hits',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    expect(h.game.entities.damage(e,-1,{kind:'mob'})).toBe(false);expect(h.game.entities.damage(e,Number.NaN,{kind:'mob'})).toBe(false);
    expect(e.hurtTime).toBe(0);
    h.game.entities.dropItem(stack('stick'),3.5,60,3.5);
    const item=h.game.entities.all().find(o=>o.kind==='item')!;
    expect(h.game.entities.damage(item,0,{kind:'projectile'})).toBe(false);
  });
  test('a hurt hook can still cancel a zero hit (endermen dodge snowballs)',()=>{
    const h=harness({kinds:[walker({hurt:()=>false})]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    expect(h.game.entities.damage(e,0,{kind:'projectile',knockback:{x:1,z:0,strength:8}})).toBe(false);
    expect(e.hurtTime).toBe(0);expect(Math.abs(e.vx)).toBeLessThan(1e-9);
  });
});

describe('entityRemoved',()=>{
  test('emitted once by remove(), at the end of the death animation and on despawn, never by reset()',()=>{
    const h=harness({kinds:[walker(),monster({kind:'zombie'})]}),gone=removals(h);
    const a=h.game.entities.spawn('walker',.5,60,.5)!,b=h.game.entities.spawn('walker',4.5,60,.5)!,far=h.game.entities.spawn('zombie',140.5,60,.5)!;
    h.game.entities.remove(a);h.game.entities.remove(a);
    expect(gone).toEqual([a]);
    h.game.entities.damage(b,50,{kind:'fall'});
    // deathTime is 1 after the killing blow and counts up each tick; removal at DEATH_TICKS.
    h.tick(1);expect(gone).toEqual([a,far]);
    h.tick(DEATH_TICKS-3);expect(gone).toEqual([a,far]);
    h.tick(1);expect(gone).toEqual([a,far,b]);expect(b.deathTime).toBe(DEATH_TICKS);
    h.game.entities.spawn('walker',8.5,60,.5);h.game.entities.reset?.();
    expect(gone).toHaveLength(3);
  });
  test('an entity flagged removed directly is announced and dropped at the next compaction',()=>{
    const h=harness({kinds:[walker()]}),gone=removals(h),e=h.game.entities.spawn('walker',.5,60,.5)!;
    e.removed=true;h.tick(1);
    expect(gone).toEqual([e]);expect(h.game.entities.all()).toHaveLength(0);
  });
  test('listeners may spawn entities while a dead one is removed (slime splits)',()=>{
    const h=harness({kinds:[walker()]});
    h.game.events.on('entityRemoved',p=>{const e=p?.entity;if(e&&e.deathTime>0)h.game.entities.spawn('walker',e.x,e.y,e.z,{reason:'event'});});
    const e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    h.game.entities.damage(e,50,{kind:'fall'});h.tick(DEATH_TICKS);
    expect(e.removed).toBe(true);
    const left=h.game.entities.all().filter(o=>o.kind==='walker');
    expect(left).toHaveLength(1);expect(left[0]).not.toBe(e);
  });
});

describe('entityDied source',()=>{
  test('byPlayer follows the 100-tick player-hit memory',()=>{
    const h=harness({kinds:[walker()]}),seen:boolean[]=[];
    h.game.events.on('entityDied',({source})=>seen.push(!!source.byPlayer));
    const a=h.game.entities.spawn('walker',.5,60,.5)!,b=h.game.entities.spawn('walker',4.5,60,.5)!;settle(h);
    h.game.entities.damage(a,2,{kind:'player',byPlayer:true});h.game.entities.damage(b,2,{kind:'player',byPlayer:true});
    h.tick(40);h.game.entities.damage(a,50,{kind:'fall'});
    h.tick(PLAYER_KILL_MEMORY);h.game.entities.damage(b,50,{kind:'fall'});
    expect(seen).toEqual([true,false]);
  });
});

describe('despawn predicate',()=>{
  test('a predicate keeps some entities of a despawning kind',()=>{
    const h=harness({kinds:[monster({kind:'ender',despawns:e=>e.data.carried===undefined}),monster({kind:'broken',despawns:()=>{throw new Error('x');}})]});
    const holding=h.game.entities.spawn('ender',140.5,60,.5,{data:{carried:3}})!,empty=h.game.entities.spawn('ender',140.5,60,4.5)!;
    const broken=h.game.entities.spawn('broken',140.5,60,8.5)!;
    h.tick(1);
    expect(holding.removed).toBe(false);expect(empty.removed).toBe(true);
    // A throwing predicate falls back to the category default (hostile mobs despawn).
    expect(broken.removed).toBe(true);
  });
});

describe('spawn.check',()=>{
  test('isDarkEnoughToSpawn is vanilla Monster.isDarkEnoughToSpawn',()=>{
    const dark=harness({light:0}),day=harness({light:0xf0}),torch=harness({light:0x01});
    let n=0;for(let i=0;i<200;i++)if(isDarkEnoughToSpawn(dark.game,3,60,3))n++;
    // brightness 0 ≤ a random 0..7 always; sky light 0 ≤ a random 0..31 always.
    expect(n).toBe(200);
    for(let i=0;i<50;i++){expect(isDarkEnoughToSpawn(day.game,3,60,3)).toBe(false);expect(isDarkEnoughToSpawn(torch.game,3,60,3)).toBe(false);}
  });
  test('the check replaces the darkness test and gets the feet cell; floor, room and distance still apply',()=>{
    const cells:[number,number,number][]=[];
    const anyLight=monster({kind:'blob',spawn:{light:'dark',group:[1,1],weight:100,check:(_g,x,y,z)=>{cells.push([x,y,z]);return true;}}});
    const h=harness({kinds:[anyLight],r:4,light:0xf0,spawning:true}),list=spawns(h);
    h.tick(300);
    const natural=list.filter(s=>s.reason==='natural');
    expect(natural.length).toBeGreaterThan(0);
    expect(cells.length).toBeGreaterThan(0);
    for(const [x,y,z] of cells){expect(Number.isInteger(x)&&Number.isInteger(y)&&Number.isInteger(z)).toBe(true);expect(h.game.world.get(x,y-1,z)).toBe(B.stone);}
    const p=h.game.player.state;
    for(const {e} of natural){expect(Math.hypot(e.x-p.x,e.y-p.y,e.z-p.z)).toBeGreaterThan(24);expect(e.y).toBe(60);}
  });
  test('a refusing or throwing check stops the spawns even in darkness',()=>{
    for(const check of [()=>false,()=>{throw new Error('bad');}]){
      const h=harness({kinds:[monster({kind:'blob',spawn:{light:'dark',group:[1,1],weight:100,check}})],r:4,light:0,spawning:true});
      h.tick(300);expect(h.game.entities.count('hostile')).toBe(0);
    }
  });
  test('grass kinds: the check replaces the light test',()=>{
    let calls=0;
    const h=harness({kinds:[walker({kind:'cow',spawn:{light:'grass',group:[2,2],check:()=>{calls++;return false;}}})],biome:'plains',block:B.grass,r:4,spawning:true});
    expect(calls).toBeGreaterThan(0);expect(h.game.entities.count('passive')).toBe(0);
  });
});

describe('animal ground',()=>{
  const count=(kind:EntityKind,biome:string,block:number,layers?:[number,number,number][])=>{
    // Packs come at chunk generation, before any light is computed (as in the game).
    const h=harness({kinds:[kind],biome,block,r:4,spawning:true,seed:5,layers});
    return h.game.entities.all().filter(e=>e.category==='passive');
  };
  test('sand rabbits in deserts, mooshrooms on mycelium and animals on snowy grass',()=>{
    const rabbit=walker({kind:'rabbit',width:.4,height:.5,spawn:{light:'grass',group:[2,3]}});
    const cow=walker({kind:'cow',width:.9,height:1.4,spawn:{light:'grass',group:[2,4]}});
    const desert=count(rabbit,'desert',B.sand);
    expect(desert.length).toBeGreaterThan(0);expect(desert.every(e=>e.y===60)).toBe(true);
    expect(count(cow,'mushroom_fields',blockId('mycelium')).length).toBeGreaterThan(0);
    // Snowy grass: the feet stand in the snow layer, which has no collision and lets the sky light through.
    const snowy=count(rabbit,'snowy_plains',B.grass,[[B.snow,60,60]]);
    expect(snowy.length).toBeGreaterThan(0);expect(snowy.every(e=>e.y===60)).toBe(true);
    // Short grass on the surface does not hide the sky either.
    expect(count(cow,'plains',B.grass,[[blockId('short_grass'),60,60]]).length).toBeGreaterThan(0);
    // Under a roof it stays dark.
    expect(count(cow,'plains',B.grass,[[B.stone,62,62]])).toHaveLength(0);
  });
  test('sand outside sandy biomes and stone are not animal ground',()=>{
    const cow=walker({kind:'cow',width:.9,height:1.4,spawn:{light:'grass',group:[2,4]}});
    expect(count(cow,'plains',B.sand)).toHaveLength(0);
    expect(count(cow,'plains',B.stone)).toHaveLength(0);
    expect(count(cow,'plains',B.grass).length).toBeGreaterThan(0);
  });
});

describe('water-avoiding paths',()=>{
  const path=new Int32Array(64*3),size={width:.6,height:2.9};
  /** A 1-wide water channel across x = 3 (z -6..6) sunk into the floor, between start and goal. */
  function channel(){const h=harness();fill(h.game,3,59,-6,3,59,6,B.water);return h;}
  const wet=(h:ReturnType<typeof harness>,n:number)=>{
    let any=false;for(let i=0;i<n;i++)if(h.game.world.get(path[i*3],path[i*3+1],path[i*3+2])===B.water)any=true;return any;
  };
  test('findPath walks around water for avoidWater and swims through it otherwise',()=>{
    const h=channel();
    const plain=findPath(h.game.world,0,60,0,6,60,0,size,path);
    expect(plain.complete).toBe(true);expect(wet(h,plain.length)).toBe(true);
    const dry=findPath(h.game.world,0,60,0,6,60,0,{...size,avoidWater:true},path);
    expect(dry.complete).toBe(true);expect(wet(h,dry.length)).toBe(false);
  });
  test('navigate honours EntityKind.avoidsWater',()=>{
    const h=channel();
    const k=walker({kind:'ender',category:'hostile',height:2.9,avoidsWater:true});
    h.game.entities.register(k);
    const e=h.game.entities.spawn('ender',.5,60,.5)!;let wetTicks=0;
    for(let i=0;i<400&&Math.hypot(e.x-6.5,e.z-.5)>1;i++){h.game.entities.ai.navigate(e,6.5,60,.5,4);h.tick(1);if(e.inWater||e.y<59.9)wetTicks++;}
    expect(Math.hypot(e.x-6.5,e.z-.5)).toBeLessThanOrEqual(1);expect(wetTicks).toBe(0);
  });
});

describe('aquatic land mobs climb out',()=>{
  /** A pool x -8..0 (water y 55..59, surface 59.9) against a stone bank at x ≥ 1 whose top is y 60. The swimmers have no
   *  gravity and float with their feet just under the surface, where the climb-out test can pass. */
  function pool(kinds:EntityKind[]){
    const h=harness({kinds});fill(h.game,-8,55,-4,0,59,4,B.water);
    h.game.player.state.x=-20;// out of the way: mobs push the player and are pushed back
    return h;
  }
  const floating={physics:{gravity:0},aquatic:true} as const;
  function swim(h:ReturnType<typeof harness>,e:Entity,ticks:number,intent:number,push=0){
    for(let i=0;i<ticks;i++){e.moveX=intent;e.moveZ=0;if(push)e.vx=push;h.tick(1);}
  }
  test('an aquatic hostile (drowned) whose intent points at the bank climbs onto land',()=>{
    const h=pool([monster({kind:'drowned',...floating})]),e=h.game.entities.spawn('drowned',-1.5,59.45,.5)!;
    swim(h,e,80,2.3);
    expect(e.x).toBeGreaterThan(1.3);expect(e.y).toBeGreaterThanOrEqual(60-1e-6);expect(e.inWater).toBe(false);
  });
  test('water mobs never climb out; nor does a drowned pushed against the bank without an intent',()=>{
    const h=pool([walker({kind:'fish',category:'water',width:.8,height:.8,...floating}),monster({kind:'drowned',...floating})]);
    const fish=h.game.entities.spawn('fish',-1.5,59.45,-2.5)!,d=h.game.entities.spawn('drowned',-.5,59.45,2.5)!;
    swim(h,fish,80,2.3);
    swim(h,d,80,0,3);
    expect(fish.x).toBeLessThan(1);expect(fish.inWater).toBe(true);
    expect(d.x).toBeLessThan(1);expect(d.inWater).toBe(true);
  });
});

describe('with the real mob kinds',()=>{
  test('a slime splits only when its death animation ends',()=>{
    const h=harness();registerMonsters(h.game);
    const big=h.game.entities.spawn('slime',4.5,60,4.5,{data:{size:4}})!;settle(h);
    h.game.entities.damage(big,100,{kind:'player',byPlayer:true});
    const slimes=()=>h.game.entities.all().filter(e=>e.kind==='slime'&&e!==big);
    h.tick(DEATH_TICKS-2);expect(slimes()).toHaveLength(0);
    h.tick(1);expect(big.removed).toBe(true);
    expect(slimes().length).toBeGreaterThanOrEqual(2);expect(slimes().every(e=>e.data.size===2)).toBe(true);
    // Removed without dying (despawn, peaceful): no split.
    const before=slimes().length,other=h.game.entities.spawn('slime',-4.5,60,-4.5,{data:{size:4}})!;
    h.game.entities.remove(other);h.tick(1);
    expect(slimes()).toHaveLength(before);
  });
  test('a thrown snowball lands a zero-damage hit: flash, knockback, the hurt sound and no damage',()=>{
    const h=harness({kinds:[walker({sounds:{name:'cow'}})]});registerHostileMobs(h.game);
    h.game.player.state.x=-20;
    const cow=h.game.entities.spawn('walker',.5,60,-4.5)!;settle(h);
    const ball=h.game.entities.spawn('snowball',.5,61,.5,{data:{owner:'player'}})!;ball.vz=-30;
    let flashed=false;for(let i=0;i<10;i++){h.tick(1);if(cow.hurtTime>0)flashed=true;}
    expect(ball.removed).toBe(true);expect(flashed).toBe(true);expect(cow.health).toBe(20);
    expect(h.sounds()).toContain('mob:cow:hurt');
  });
  test('an enderman holding a block stays when far away; snowballs make it teleport',()=>{
    const h=harness({r:3});registerMonsters(h.game);registerHostileMobs(h.game);
    const carrying=h.game.entities.spawn('enderman',.5,60,40.5,{data:{carried:blockId('dirt')}})!;
    expect(carrying.data.carried).toBe(blockId('dirt'));
    h.game.player.state.x=200;h.tick(1);
    expect(carrying.removed).toBe(false);
    h.game.player.state.x=.5;
    const e=h.game.entities.spawn('enderman',.5,60,-6.5)!;settle(h);
    const at={x:e.x,z:e.z};
    const ball=h.game.entities.spawn('snowball',.5,62,.5,{data:{owner:'player'}})!;ball.vz=-30;
    h.tick(6);
    expect(ball.removed).toBe(true);expect(Math.hypot(e.x-at.x,e.z-at.z)).toBeGreaterThan(1);expect(e.health).toBe(40);
    expect(h.sounds()).toContain('teleport');
  });
});
