import {describe,expect,it} from 'vitest';
import {AIR,B,blockDef,blockId} from '../../../src/games/blockcraft/data/blocks';
import {itemDef,stack} from '../../../src/games/blockcraft/data/items';
import {bonemealAge,bowPower,SLEEP_MESSAGES} from '../../../src/games/blockcraft/interact/use';
import type {TreeKind,WeatherService} from '../../../src/games/blockcraft/engine/contracts';
import {ControlState} from '../../../src/games/blockcraft/player/controls-core';
import {createHarness,type Harness} from './interaction-harness';

const name=(h:Harness,x:number,y:number,z:number)=>blockDef(h.game.world.get(x,y,z)).name;
const TOP:[number,number,number]=[0,1,0],SOUTH:[number,number,number]=[0,0,1];
/** Aims at a face of (x,y,z) and clicks use once with `item` held (undefined keeps the hand). */
function useOn(h:Harness,item:string|null|undefined,x:number,y:number,z:number,n=TOP,count=1){
  if(item!==undefined)h.hold(item,count);
  h.aimFace(x,y,z,n[0],n[1],n[2]);h.step();h.click('use');h.step(4);
}
/** Holds use for `ticks` ticks (from a press), then releases. */
function holdUse(h:Harness,ticks:number){h.press('use');h.down('use');h.step(ticks);h.down('use',false);h.step();}
const speed=(e:{vx:number;vy:number;vz:number})=>Math.hypot(e.vx,e.vy,e.vz);

describe('block use',()=>{
  it('opens the crafting table, furnace, chest and barrel screens at the block',()=>{
    const h=createHarness(),w=h.game.world;
    w.set(0,60,-2,B.craftingTable);w.set(1,60,-2,blockId('furnace_lit_north'));w.set(-1,60,-2,blockId('chest_south'));w.set(3,60,-3,blockId('barrel'));
    useOn(h,null,0,60,-2,SOUTH);useOn(h,null,1,60,-2,SOUTH);useOn(h,null,-1,60,-2,SOUTH);useOn(h,null,3,60,-3,SOUTH);
    expect(h.opened).toEqual([{id:'crafting_table',at:{x:0,y:60,z:-2}},{id:'furnace',at:{x:1,y:60,z:-2}},{id:'chest',at:{x:-1,y:60,z:-2}},{id:'chest',at:{x:3,y:60,z:-3}}]);
    expect(h.log.swings).toBe(4);
  });
  it('a chest under an opaque block does not open; a barrel does',()=>{
    const h=createHarness(),w=h.game.world;
    w.set(0,60,-2,blockId('chest_south'));w.set(0,61,-2,B.stone);w.set(1,60,-2,blockId('barrel'));w.set(1,61,-2,B.stone);
    useOn(h,null,0,60,-2,SOUTH);useOn(h,null,1,60,-2,SOUTH);
    expect(h.opened.map(o=>o.at)).toEqual([{x:1,y:60,z:-2}]);
  });
  it('doors open and close both halves with sounds',()=>{
    const h=createHarness(),w=h.game.world;
    w.set(0,60,-2,blockId('oak_door_lower_closed_south'));w.set(0,61,-2,blockId('oak_door_upper_closed_south'));
    useOn(h,null,0,60,-2,SOUTH);
    expect(name(h,0,60,-2)).toBe('oak_door_lower_open_south');expect(name(h,0,61,-2)).toBe('oak_door_upper_open_south');
    expect(h.sounds()).toContain('door_open');
    // Open, the panel lies on the west side: click the upper half from there.
    h.aimFace(0,61,-2,1,0,0);h.step();h.click('use');
    expect(name(h,0,60,-2)).toBe('oak_door_lower_closed_south');expect(name(h,0,61,-2)).toBe('oak_door_upper_closed_south');
    expect(h.sounds()).toContain('door_close');
  });
});

describe('beds',()=>{
  function bed(dayTime:number,mode:'survival'|'creative'='survival'){
    const h=createHarness({mode}),w=h.game.world;
    w.set(0,60,-2,blockId('bed_foot_south'));w.set(0,60,-3,blockId('bed_head_south'));
    h.game.time.dayTime=dayTime;h.game.settings.daylightCycle=false;
    const slept:unknown[]=[];h.game.events.on('playerSlept',e=>slept.push(e));
    return{h,slept,use:()=>useOn(h,null,0,60,-2,TOP)};
  }
  it('at night sleeps to morning, sets the bed spawn at the head and emits playerSlept',()=>{
    const {h,slept,use}=bed(18000);use();
    expect(h.game.time.dayTime).toBe(0);expect(slept).toHaveLength(1);
    expect(h.game.player.state.bedSpawn).toEqual({x:0,y:60,z:-3});
    expect(h.game.toasts).toContain(SLEEP_MESSAGES.spawn);
  });
  it('by day refuses with a message but still sets the respawn point',()=>{
    const {h,slept,use}=bed(6000);use();
    expect(h.game.time.dayTime).toBe(6000);expect(slept).toHaveLength(0);
    expect(h.game.toasts.at(-1)).toBe('You can sleep only at night');
    expect(h.game.player.state.bedSpawn).toEqual({x:0,y:60,z:-3});
  });
  it('sleeps by day during a thunderstorm',()=>{
    const {h,slept,use}=bed(6000);(h.game.weather as {state:WeatherService['state']}).state='thunder';use();
    expect(slept).toHaveLength(1);
  });
  it('monsters within 8 blocks prevent sleep in survival, not in creative; slimes do not count',()=>{
    const s=bed(14000);s.h.ents.add('zombie',6.5,60,-3);s.use();
    expect(s.slept).toHaveLength(0);expect(s.h.game.toasts.at(-1)).toBe('You may not rest now; there are monsters nearby');
    const c=bed(14000,'creative');c.h.ents.add('zombie',6.5,60,-3);c.use();expect(c.slept).toHaveLength(1);
    const f=bed(14000);f.h.ents.add('zombie',9.6,60,-3);f.h.ents.add('slime',2.5,60,-3);f.use();expect(f.slept).toHaveLength(1);
  });
  it('too far away or obstructed beds refuse',()=>{
    const far=bed(14000);far.h.stand(.5,60,1.9);far.use();
    expect(far.slept).toHaveLength(0);expect(far.h.game.toasts.at(-1)).toBe(SLEEP_MESSAGES.far);
    const blocked=bed(14000);blocked.h.game.world.set(0,61,-3,B.stone);blocked.use();
    expect(blocked.slept).toHaveLength(0);expect(blocked.h.game.toasts.at(-1)).toBe('This bed is obstructed');
  });
});

describe('fire and TNT',()=>{
  it('flint and steel lights TNT into a primed_tnt entity started by the player',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('tnt'));
    useOn(h,'flint_and_steel',0,60,-2,SOUTH);
    expect(name(h,0,60,-2)).toBe('air');
    const tnt=h.ents.spawned.find(s=>s.entity.kind==='primed_tnt')!;
    expect(tnt.entity.data).toEqual({fuse:80,byPlayer:true});expect(tnt.entity).toMatchObject({x:.5,y:60,z:-1.5});
    expect(tnt.entity.vy).toBeCloseTo(4);expect(h.inv.damaged).toBe(1);
    // The fuse hisses once (interaction plays it; primed_tnt does not again), and lighting TNT is not an ignite.
    expect(h.sounds().filter(s=>s==='fuse')).toHaveLength(1);expect(h.sounds()).not.toContain('ignite');
  });
  it('flint and steel sets fire on top of a block, not in mid-air',()=>{
    const h=createHarness();useOn(h,'flint_and_steel',0,59,-2);
    expect(name(h,0,60,-2)).toBe('fire');expect(h.sounds()).toContain('ignite');expect(h.inv.damaged).toBe(1);
    h.game.world.set(1,62,-3,B.stone);useOn(h,'flint_and_steel',1,62,-3,SOUTH);
    expect(name(h,1,62,-2)).toBe('air');expect(h.inv.damaged).toBe(1);
  });
});

describe('eating and drinking',()=>{
  it('eats over 32 ticks with chewing sounds and particles, then feeds, uses the item and emits itemConsumed',()=>{
    const h=createHarness(),consumed:unknown[]=[];h.game.events.on('itemConsumed',e=>consumed.push(e));
    h.hold('bread',3);h.lookAt(.5,70,-10);h.step();
    h.press('use');h.down('use');h.step(20);
    expect(h.interaction.using).toEqual({item:'bread',progress:20/32});
    h.step(11);expect(h.surv.eaten).toHaveLength(0);
    h.step();
    expect(h.surv.eaten).toEqual([itemDef('bread')!.food]);expect(consumed).toEqual([{stack:stack('bread')}]);
    expect(h.inv.slots[0]).toEqual(stack('bread',2));expect(h.interaction.using).toBeNull();
    expect(h.sounds().filter(s=>s==='eat').length).toBe(7);
    expect(h.log.particles.some(p=>p.kind==='item'&&p.options?.item==='bread')).toBe(true);
  });
  it('every click made while an item is in use is discarded, two in one tick too (vanilla consumeClick loops)',()=>{
    const h=createHarness();h.hold('bread',3);h.lookAt(.5,70,-10);h.step();
    // The real input state counts presses (up to two unread per action); held state stays with the fake input.
    const controls=new ControlState();h.game.input={...h.game.input,pressed:a=>controls.pressed(a)};
    controls.tap('use');h.down('use');h.step(5);
    expect(h.interaction.using?.item).toBe('bread');
    // Two quick clicks of each kind, and use let go, between two ticks: that tick ends the eating.
    for(const a of ['attack','use','pick'] as const){controls.tap(a);controls.tap(a);}
    const swings=h.log.swings;h.down('use',false);h.step();
    expect(h.interaction.using).toBeNull();
    // No click is left over to attack (a swing at the air) or start eating again.
    h.step(3);
    expect(h.interaction.using).toBeNull();expect(h.log.swings).toBe(swings);expect(h.surv.eaten).toHaveLength(0);
  });
  it('letting go early eats nothing; a full stomach refuses unless the food is always edible',()=>{
    const h=createHarness();h.hold('apple',2);h.lookAt(.5,70,-10);
    holdUse(h,20);expect(h.surv.eaten).toHaveLength(0);expect(h.interaction.using).toBeNull();
    h.surv.hungry=false;h.press('use');h.down('use');h.step(40);h.down('use',false);h.step();
    expect(h.surv.eaten).toHaveLength(0);
    h.hold('golden_apple');h.press('use');h.down('use');h.step(33);h.down('use',false);
    expect(h.surv.eaten).toEqual([itemDef('golden_apple')!.food]);
  });
  it('stew leaves its bowl',()=>{
    const h=createHarness();h.hold('mushroom_stew');h.lookAt(.5,70,-10);holdUse(h,32);
    expect(h.inv.slots[0]).toEqual(stack('bowl'));
  });
  it('milk is drunk: clears effects, leaves a bucket, plays drink sounds',()=>{
    const h=createHarness(),consumed:unknown[]=[];h.game.events.on('itemConsumed',e=>consumed.push(e));
    h.surv.hungry=false;h.hold('milk_bucket');h.lookAt(.5,70,-10);holdUse(h,32);
    expect(h.surv.cleared).toBe(1);expect(h.inv.slots[0]).toEqual(stack('bucket'));
    expect(consumed).toEqual([{stack:stack('milk_bucket')}]);expect(h.sounds()).toContain('drink');
  });
  it('opening a screen or dying stops eating',()=>{
    const h=createHarness();h.hold('bread');h.lookAt(.5,70,-10);h.press('use');h.down('use');h.step(5);
    expect(h.interaction.using?.item).toBe('bread');
    h.game.setState('screen');h.game.input.clear();h.interaction.frame?.(.05);expect(h.interaction.using).toBeNull();
    h.game.setState('playing');h.step(40);expect(h.surv.eaten).toHaveLength(0);
  });
  it('switching items stops eating',()=>{
    const h=createHarness();h.hold('bread');h.lookAt(.5,70,-10);h.press('use');h.down('use');h.step(5);
    h.inv.select(3);h.step(40);
    expect(h.interaction.using).toBeNull();expect(h.surv.eaten).toHaveLength(0);
  });
});

describe('buckets',()=>{
  it('an empty bucket picks up a water source; a stack keeps the rest',()=>{
    const h=createHarness();h.game.world.set(0,59,-2,B.water);
    useOn(h,'bucket',0,59,-2,TOP,3);
    expect(name(h,0,59,-2)).toBe('air');expect(h.inv.slots[0]).toEqual(stack('bucket',2));
    expect(h.inv.count('water_bucket')).toBe(1);expect(h.sounds()).toContain('bucket_fill');
  });
  it('flowing water is not picked up',()=>{
    const h=createHarness();h.game.world.set(0,59,-2,blockId('water_3'));
    useOn(h,'bucket',0,59,-2);expect(name(h,0,59,-2)).toBe('water_3');expect(h.inv.slots[0]).toEqual(stack('bucket'));
  });
  it('lava fills a lava bucket',()=>{
    const h=createHarness();h.game.world.set(0,59,-2,B.lava);useOn(h,'bucket',0,59,-2);
    expect(h.inv.slots[0]).toEqual(stack('lava_bucket'));
  });
  it('a full bucket places its source against the face and returns the empty bucket',()=>{
    const h=createHarness();useOn(h,'water_bucket',0,59,-2);
    expect(name(h,0,60,-2)).toBe('water');expect(h.inv.slots[0]).toEqual(stack('bucket'));expect(h.sounds()).toContain('bucket_empty');
    useOn(h,'lava_bucket',2,59,-2);expect(name(h,2,60,-2)).toBe('lava');
  });
  it('water washes away a torch, dropping it with its break particles and sound; rays pass beside thin shapes',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.torch);
    h.hold('water_bucket');h.aimFace(0,59,-2,0,1,0,{u:.15,v:.15});h.step();h.click('use');
    expect(name(h,0,60,-2)).toBe('water');expect(h.ents.drops.map(d=>d.stack)).toEqual([stack('torch')]);
    // Level.destroyBlock's level event 2001, as when a torch pops off.
    expect(h.sounds()).toEqual(expect.arrayContaining([`break:${blockDef(B.torch).sound}`,'bucket_empty']));
    expect(h.log.particles.some(p=>p.kind==='block'&&p.options?.block===B.torch&&p.x===.5&&p.z===-1.5)).toBe(true);
  });
  it('a bucket emptied into fire puts it out without break particles or sound (destroyBlock skips fire)',()=>{
    // Emptied against the side of a block beside the fire, above the fire's thin outline.
    const h=createHarness();h.game.world.set(0,60,-2,blockId('fire'));h.game.world.set(1,60,-2,B.stone);
    useOn(h,'water_bucket',1,60,-2,[-1,0,0]);
    expect(name(h,0,60,-2)).toBe('water');
    expect(h.sounds().some(s=>s.startsWith('break:'))).toBe(false);expect(h.log.particles.some(p=>p.kind==='block')).toBe(false);
  });
  it('creative keeps the full bucket',()=>{
    const h=createHarness({mode:'creative'});useOn(h,'water_bucket',0,59,-2);
    expect(name(h,0,60,-2)).toBe('water');expect(h.inv.slots[0]).toEqual(stack('water_bucket'));
  });
});

describe('farming',()=>{
  it('hoes till grass and dirt into farmland when the block above is free',()=>{
    const h=createHarness(),w=h.game.world;w.set(0,59,-2,B.grass);w.set(1,59,-2,B.dirt);
    // Covered grass, clicked on its exposed south side.
    w.set(-1,59,-2,B.grass);w.set(-1,60,-2,B.stone);w.set(-1,59,-1,AIR);
    useOn(h,'iron_hoe',0,59,-2);useOn(h,undefined,1,59,-2);useOn(h,undefined,-1,59,-2,SOUTH);
    expect(name(h,0,59,-2)).toBe('farmland');expect(name(h,1,59,-2)).toBe('farmland');expect(name(h,-1,59,-2)).toBe('grass_block');
    expect(h.inv.damaged).toBe(2);
    // HoeItem plays HOE_TILL for each tilled block.
    expect(h.sounds().filter(s=>s==='till')).toHaveLength(2);expect(h.sounds()).not.toContain('place:gravel');
    w.set(2,59,-2,blockId('coarse_dirt'));useOn(h,undefined,2,59,-2);expect(name(h,2,59,-2)).toBe('dirt');
  });
  it('bone meal grows crops 2-5 stages and is used; a ripe crop refuses it',()=>{
    const h=createHarness(),w=h.game.world;w.set(0,59,-2,B.farmland);w.set(0,60,-2,blockId('wheat_0'));
    useOn(h,'bone_meal',0,60,-2,TOP,5);
    const age=blockDef(w.get(0,60,-2)).age!;expect(age).toBeGreaterThanOrEqual(2);expect(age).toBeLessThanOrEqual(5);
    expect(h.inv.slots[0]!.count).toBe(4);expect(h.log.particles.some(p=>p.kind==='happy')).toBe(true);
    expect(h.sounds().filter(s=>s==='bone_meal')).toHaveLength(1);
    w.set(0,60,-2,blockId('wheat_7'));useOn(h,undefined,0,60,-2);expect(h.inv.slots[0]!.count).toBe(4);
    expect(h.sounds().filter(s=>s==='bone_meal')).toHaveLength(1);
  });
  it('maps bone meal on 4-stage crops onto the 8 vanilla ages',()=>{
    const carrots0=blockDef(blockId('carrots_0')),carrots2=blockDef(blockId('carrots_2'));
    expect(bonemealAge(carrots0,2)).toBe(1);expect(bonemealAge(carrots0,5)).toBe(2);
    expect(bonemealAge(carrots2,2)).toBe(2);expect(bonemealAge(carrots2,3)).toBe(3);
    expect(bonemealAge(blockDef(blockId('wheat_4')),5)).toBe(7);
  });
  it('bone meal on a sapling grows a tree 45% of the time through terrain.growTree; oak sometimes grows big',()=>{
    const h=createHarness(),w=h.game.world,grown:TreeKind[]=[];
    h.game.terrain.growTree=(_w,_x,_y,_z,kind)=>{grown.push(kind);return false;};
    w.set(0,59,-2,B.dirt);w.set(0,60,-2,blockId('oak_sapling'));
    for(let i=0;i<300;i++){h.hold('bone_meal',64);h.aimFace(0,60,-2,0,1,0);h.click('use');h.step(4);}
    expect(h.inv.consumed).toBe(300);
    expect(grown.length/300).toBeGreaterThan(.35);expect(grown.length/300).toBeLessThan(.55);
    expect(grown.filter(k=>k==='big_oak').length).toBeGreaterThan(0);expect(grown.filter(k=>k==='oak').length).toBeGreaterThan(grown.length/2);
  });
  it('2×2 spruce saplings grow a mega spruce from their corner; a lone dark oak sapling cannot grow',()=>{
    const h=createHarness(),w=h.game.world,calls:[number,number,TreeKind][]=[];
    h.game.terrain.growTree=(_w,x,_y,z,kind)=>{calls.push([x,z,kind]);return true;};
    h.game.random=()=>.1;
    for(const [x,z] of [[0,-3],[1,-3],[0,-2],[1,-2]]){w.set(x,59,z,B.dirt);w.set(x,60,z,blockId('spruce_sapling'));}
    useOn(h,'bone_meal',1,60,-2);
    expect(calls).toEqual([[0,-3,'mega_spruce']]);
    w.set(-2,59,-2,B.dirt);w.set(-2,60,-2,blockId('dark_oak_sapling'));useOn(h,'bone_meal',-2,60,-2);
    expect(calls).toHaveLength(1);expect(h.inv.slots[0]).toBeNull();
  });
  it('bone meal on grass spreads short grass and flowers',()=>{
    const h=createHarness(),w=h.game.world;
    for(let x=-3;x<=3;x++)for(let z=-5;z<=1;z++)w.set(x,59,z,B.grass);
    useOn(h,'bone_meal',0,59,-2);
    let plants=0;for(let x=-3;x<=3;x++)for(let z=-5;z<=1;z++)if(w.get(x,60,z)!==AIR)plants++;
    expect(plants).toBeGreaterThan(5);expect(h.inv.slots[0]).toBeNull();
  });
  it('axes scrape a stage of oxidation off copper',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('weathered_copper'));useOn(h,'stone_axe',0,60,-2,SOUTH);
    expect(name(h,0,60,-2)).toBe('exposed_copper');expect(h.inv.damaged).toBe(1);
    expect(h.sounds()).toContain('scrape');expect(h.log.particles.length).toBeGreaterThan(0);
  });
});

describe('bows and throwing',()=>{
  it('a full 1 s draw shoots a critical arrow at 60 blocks/second and uses an arrow',()=>{
    const h=createHarness();h.hold('bow');h.inv.slots[5]=stack('arrow',4);h.lookAt(.5,62,-10);h.step();
    h.press('use');h.down('use');h.step(20);
    expect(h.interaction.using).toEqual({item:'bow',progress:1});
    // The player area owns the FOV (flight, speed, bow draw from interaction.using, reduced motion): interaction never sets it.
    expect(h.log.fov).toEqual([]);
    h.down('use',false);h.step();
    const arrow=h.ents.spawned.find(s=>s.entity.kind==='arrow')!.entity;
    expect(speed(arrow)).toBeGreaterThan(58);expect(speed(arrow)).toBeLessThan(62);expect(arrow.vz).toBeLessThan(-55);
    expect(arrow.data).toMatchObject({owner:'player',damage:2,pickup:true,crit:true,inGround:false});
    expect(arrow.y).toBeCloseTo(61.52);
    expect(h.inv.count('arrow')).toBe(3);expect(h.inv.damaged).toBe(1);expect(h.sounds()).toContain('bow');
    expect(h.log.fov).toEqual([]);expect(h.interaction.using).toBeNull();
  });
  it('a tap does not shoot; no arrows means no draw in survival; creative needs none and its arrows stay',()=>{
    const h=createHarness();h.hold('bow');h.inv.slots[5]=stack('arrow',4);h.lookAt(.5,62,-10);
    h.click('use');h.step();expect(h.ents.spawned).toHaveLength(0);expect(h.inv.count('arrow')).toBe(4);
    h.inv.slots[5]=null;h.press('use');h.down('use');h.step(3);expect(h.interaction.using).toBeNull();h.down('use',false);
    const c=createHarness({mode:'creative'});c.hold('bow');c.lookAt(.5,62,-10);holdUse(c,10);
    const arrow=c.ents.spawned.find(s=>s.entity.kind==='arrow')!.entity;
    expect(speed(arrow)/(60*bowPower(11))).toBeCloseTo(1,1);expect(arrow.data).toMatchObject({pickup:false,crit:false});
  });
  it('snowballs, eggs and ender pearls fly at 30 blocks/second with the throw sound; pearls have a 1 s cooldown',()=>{
    for(const item of ['snowball','egg','ender_pearl']){
      const h=createHarness();h.hold(item,4);h.lookAt(.5,62,-10);h.step();h.click('use');
      const e=h.ents.spawned.find(s=>s.entity.kind===item)!.entity;
      expect(speed(e)).toBeGreaterThan(29);expect(speed(e)).toBeLessThan(31);expect(e.data).toEqual({owner:'player'});
      // Thrown from 0.1 below the eye, facing its flight (Projectile.shoot): yaw 0 looks -z, pitch up-positive.
      expect(e.y).toBeCloseTo(h.game.player.eye().y-.1,5);
      expect(e.yaw).toBeCloseTo(Math.atan2(-e.vx,-e.vz),5);expect(e.pitch).toBeCloseTo(Math.atan2(e.vy,Math.hypot(e.vx,e.vz)),5);
      expect(h.inv.slots[0]!.count).toBe(3);expect(h.sounds()).toContain('throw');
    }
    const h=createHarness();h.hold('ender_pearl',4);h.lookAt(.5,62,-10);
    h.click('use');h.step(5);h.click('use');expect(h.inv.slots[0]!.count).toBe(3);
    h.step(16);h.click('use');expect(h.inv.slots[0]!.count).toBe(2);
  });
  it('the shield is raised while use is held and lowered on release',()=>{
    const h=createHarness();h.inv.offhand=stack('shield');h.lookAt(.5,70,-10);
    h.press('use');h.down('use');h.step(10);
    expect(h.interaction.using).toEqual({item:'shield',progress:1});
    h.down('use',false);h.step();expect(h.interaction.using).toBeNull();
  });
});

describe('spawn eggs',()=>{
  it('spawn their mob on the clicked face with reason egg, and babies on an adult of their kind',()=>{
    const h=createHarness();useOn(h,'cow_spawn_egg',0,59,-2,TOP,2);
    const cow=h.ents.spawned[0];
    expect(cow.reason).toBe('egg');expect(cow.entity).toMatchObject({kind:'cow',x:.5,y:60,z:-1.5,baby:false});
    expect(h.inv.slots[0]!.count).toBe(1);
    h.aimFace(0,60,-2,0,0,1);h.lookAt(cow.entity.x,cow.entity.y+.7,cow.entity.z);h.step();
    expect(h.interaction.entityTarget).toBe(cow.entity);
    h.click('use');expect(h.ents.spawned[1].entity).toMatchObject({kind:'cow',baby:true});
  });
});

describe('service surface',()=>{
  it('blockDrops is the loot entry point; explosions may ignore tool requirements',()=>{
    const h=createHarness();
    expect(h.interaction.blockDrops(B.stone,null)).toEqual([]);
    expect(h.interaction.blockDrops(B.stone,stack('wooden_pickaxe'))).toEqual([stack('cobblestone')]);
    expect(h.interaction.blockDrops(B.stone,null,'explosion')).toEqual([stack('cobblestone')]);
  });
  it('hides the selection when looking at the sky and shows it again on a block',()=>{
    const h=createHarness();h.aimFace(0,59,-2,0,1,0);h.step();expect(h.log.selection).not.toBeNull();
    h.lookAt(.5,90,-1);h.step();expect(h.log.selection).toBeNull();expect(h.interaction.target).toBeNull();
    h.aimFace(0,59,-2,0,1,0);h.step();expect(h.log.selection).toEqual({minX:0,minY:59,minZ:-2,maxX:1,maxY:60,maxZ:-1});
  });
});

describe('pick block, drop and swap',()=>{
  it('creative pick block puts the block item in the hotbar or selects it',()=>{
    const h=createHarness({mode:'creative'});h.hold('dirt',1);
    h.aimFace(0,59,-2,0,1,0);h.click('pick');
    expect(h.inv.selected).toBe(1);expect(h.inv.slots[1]).toEqual(stack('stone'));
    h.inv.select(0);h.click('pick');expect(h.inv.selected).toBe(1);
    h.game.world.set(0,60,-2,blockId('wheat_3'));h.click('pick');expect(h.inv.slots[2]).toEqual(stack('wheat_seeds'));
    h.game.world.set(1,60,-2,blockId('wall_torch_north'));h.aimFace(1,60,-2,0,1,0);h.click('pick');expect(h.inv.slots[3]).toEqual(stack('torch'));
  });
  it('survival pick block only selects or swaps in what the inventory holds',()=>{
    const h=createHarness();h.aimFace(0,59,-2,0,1,0);h.click('pick');expect(h.inv.slots.every(s=>!s)).toBe(true);
    h.inv.slots[20]=stack('stone',7);h.inv.slots[0]=stack('dirt');h.click('pick');
    expect(h.inv.slots[1]).toEqual(stack('stone',7));expect(h.inv.slots[20]).toBeNull();expect(h.inv.selected).toBe(1);
  });
  it('drop, drop stack and swap hands act on their presses',()=>{
    const h=createHarness(),drops:boolean[]=[];let swaps=0;
    h.inv.dropHeld=all=>{drops.push(all);};h.inv.swapHands=()=>{swaps++;};h.hold('dirt',5);
    h.click('drop');h.click('dropStack');h.click('swapHands');
    expect(drops).toEqual([false,true]);expect(swaps).toBe(1);
  });
});
