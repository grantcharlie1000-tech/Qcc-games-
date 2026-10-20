import {describe,expect,test} from 'vitest';
import {AIR,B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {ARROW_PHYSICS,THROWN_PHYSICS,arrowDamage,traceBlocks} from '../../../src/games/blockcraft/entity/projectiles';
import type {Entity} from '../../../src/games/blockcraft/engine/contracts';
import {createHarness,night,sequence,type Harness} from './hostile-harness';

function fill(h:Harness,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)h.game.world.set(x,y,z,id);
}
function fire(h:Harness,kind:string,x:number,y:number,z:number,vx:number,vy:number,vz:number,data:Record<string,unknown>):Entity{
  const e=h.spawn(kind,x,y,z,{data});e.vx=vx;e.vy=vy;e.vz=vz;return e;
}
const playerArrow=(extra:Record<string,unknown>={})=>({owner:'player',damage:2,pickup:true,crit:false,inGround:false,...extra});

describe('arrow ballistics',()=>{
  test('vanilla per-tick motion: move, 0.99 drag, then 0.05 blocks/tick² gravity',()=>{
    expect(ARROW_PHYSICS).toEqual({gravity:.05,drag:.99,waterDrag:.6});
    expect(THROWN_PHYSICS).toEqual({gravity:.03,drag:.99,waterDrag:.8});
    const h=createHarness(),a=fire(h,'arrow',.5,100,.5,0,0,-60,playerArrow());
    let y=100,z=.5,vy=0,vz=-3;
    for(let i=0;i<10;i++){y+=vy;z+=vz;vy*=.99;vz*=.99;vy-=.05;}
    h.game.runTicks(10);
    expect(a.z).toBeCloseTo(z,6);expect(a.y).toBeCloseTo(y,6);
    expect(a.vy).toBeCloseTo(vy*20,6);expect(a.vz).toBeCloseTo(vz*20,6);
    expect(a.yaw).toBeCloseTo(0,6);expect(a.pitch).toBeLessThan(0);
  });
  test('damage is the base damage times speed in blocks per tick, rounded up, plus a crit bonus',()=>{
    expect(arrowDamage(3,2,false,()=>0)).toBe(6);expect(arrowDamage(1.6,2.2,false,()=>0)).toBe(4);
    expect(arrowDamage(3,2,true,()=>.999)).toBe(10);expect(arrowDamage(3,2,true,()=>0)).toBe(6);
  });
  test('sticks flush into a wall with a hit sound, then stays put',()=>{
    const h=createHarness();fill(h,-2,60,-10,2,110,-10,B.stone);
    const a=fire(h,'arrow',.5,100,.5,0,0,-60,playerArrow());
    h.game.runTicks(10);
    expect(a.data.inGround).toBe(true);expect(a.z).toBeCloseTo(-9+.05,2);expect([a.vx,a.vy,a.vz]).toEqual([0,0,0]);
    expect(h.sounds()).toContain('arrow_hit');
    const at={x:a.x,y:a.y,z:a.z};h.game.runTicks(100);
    expect({x:a.x,y:a.y,z:a.z}).toEqual(at);
  });
  test('falls again when its block is removed and despawns after a minute in the ground',()=>{
    const h=createHarness();fill(h,-2,60,-10,2,110,-10,B.stone);
    const a=fire(h,'arrow',.5,100,.5,0,0,-60,playerArrow());h.game.runTicks(10);
    h.game.world.set(0,Math.floor(a.y),-10,AIR);h.game.runTicks(1);
    expect(a.data.inGround).toBe(false);
    const b=fire(h,'arrow',.5,62,5.5,0,-20,0,playerArrow());h.game.runTicks(5);
    expect(b.data.inGround).toBe(true);h.game.runTicks(1200);
    expect(b.removed).toBe(true);
  });
  test('slows sharply in water',()=>{
    const h=createHarness();fill(h,-3,60,-6,3,63,3,B.water);
    const a=fire(h,'arrow',.5,61.5,.5,0,0,-20,{owner:'mob'});h.game.runTicks(1);
    expect(a.vz).toBeCloseTo(-20*.6,6);
  });
  test('traceBlocks measures distance to partial shapes and reports the face',()=>{
    const h=createHarness(),hit={x:0,y:0,z:0,nx:0,ny:0,nz:0};
    expect(traceBlocks(h.game.world,.5,65,.5,0,-1,0,10,hit)).toBeCloseTo(5,6);expect(hit).toMatchObject({y:59,ny:1});
    h.game.world.set(0,60,0,blockId('stone_slab'));
    expect(traceBlocks(h.game.world,.5,65,.5,0,-1,0,10,hit)).toBeCloseTo(4.5,6);expect(hit).toMatchObject({y:60,ny:1});
    expect(traceBlocks(h.game.world,-2.5,60.25,.5,1,0,0,10,hit)).toBeCloseTo(2.5,6);expect(hit).toMatchObject({x:0,nx:-1});
    expect(traceBlocks(h.game.world,-2.5,60.75,.5,1,0,0,10,hit)).toBe(Infinity);// passes over the bottom slab
    expect(traceBlocks(h.game.world,.5,65,.5,0,1,0,10,hit)).toBe(Infinity);
  });
});

describe('pickup',()=>{
  test('the player picks up their stuck arrows; mob arrows stay',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    const mine=fire(h,'arrow',.5,61,2.6,0,-20,0,playerArrow()),theirs=fire(h,'arrow',-.5,61,2.6,0,-20,0,{owner:'mob',pickup:false});
    h.game.runTicks(3);expect(mine.data.inGround).toBe(true);
    h.game.player.teleport(.5,60,2);h.game.runTicks(10);
    expect(mine.removed).toBe(true);expect(h.game.inventory.count('arrow')).toBe(1);expect(h.sounds()).toContain('pop');
    expect(theirs.removed).toBe(false);
  });
});

describe('arrow hits',()=>{
  test('a player arrow hurts a mob with knockback, attributed to the player',()=>{
    const h=createHarness({mode:'creative'}),z=h.spawn('zombie',.5,60,-5.5);
    const a=fire(h,'arrow',.5,61,.5,0,0,-60,playerArrow());
    h.game.runTicks(3);
    expect(h.hits).toHaveLength(1);
    expect(h.hits[0]).toMatchObject({entity:z,amount:6,source:{kind:'projectile',projectile:a,byPlayer:true}});
    expect(h.hits[0].source.knockback!.z).toBeLessThan(0);expect(a.removed).toBe(true);
  });
  test('a skeleton arrow hurts the player through survival with the shooter as attacker',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    const s=h.spawn('skeleton',30.5,60,30.5);
    const a=fire(h,'arrow',.5,61.2,-5.5,0,0,32,{owner:'mob',ownerId:s.id,damage:2.2,pickup:false});
    h.game.runTicks(6);
    expect(h.hurt).toHaveLength(1);
    expect(h.hurt[0].amount).toBe(4);expect(h.hurt[0].source).toMatchObject({kind:'projectile',attacker:s,projectile:a});
    expect(a.removed).toBe(true);
  });
  test('stray arrows add Slowness for 30 s',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    fire(h,'arrow',.5,61.2,-5.5,0,0,32,{owner:'mob',damage:2,effect:'slowness'});
    h.game.runTicks(6);
    expect(h.effects).toEqual([{name:'slowness',seconds:30,level:1}]);
  });
  test('a raised shield facing the arrow deflects it and wears the shield',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    h.game.inventory.setSlot(0,{id:'shield',count:1});h.setUsing('shield');h.game.player.state.yaw=0;// facing north, toward the shooter
    const a=fire(h,'arrow',.5,61.2,-5.5,0,0,32,{owner:'mob',damage:2.2});
    let speed=0;for(let i=0;i<6&&!h.wear.length;i++){speed=Math.hypot(a.vx,a.vy,a.vz);h.game.runTicks(1);}
    expect(h.hurt).toHaveLength(0);expect(h.wear).toEqual([5]);
    expect(a.vz).toBeLessThan(0);expect(Math.hypot(a.vx,a.vy,a.vz)).toBeLessThan(speed*.2);
    const b=createHarness();b.game.player.teleport(.5,60,.5);b.setUsing('shield');b.game.player.state.yaw=Math.PI;// facing away
    fire(b,'arrow',.5,61.2,-5.5,0,0,32,{owner:'mob',damage:2.2});b.game.runTicks(6);
    expect(b.hurt).toHaveLength(1);
  });
  test('a mob arrow that hits a zombie starts a fight with the shooter',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    const s=h.spawn('skeleton',.5,60,10.5),z=h.spawn('zombie',.5,60,4.5);
    fire(h,'arrow',.5,61.2,9.5,0,0,-32,{owner:'mob',ownerId:s.id,damage:2});
    h.game.runTicks(30);
    expect(h.hits.some(x=>x.entity===z)).toBe(true);expect(z.data.aggressive).toBe(true);expect(z.z).toBeGreaterThan(5);
  });
});

describe('thrown items',()=>{
  test('snowballs break on blocks with item particles and knock mobs back without damage',()=>{
    const h=createHarness({mode:'creative'});
    const s=fire(h,'snowball',.5,61,.5,0,-10,0,{owner:'player'});h.game.runTicks(3);
    expect(s.removed).toBe(true);expect(h.particles.some(p=>p.kind==='item'&&p.options?.item==='snowball')).toBe(true);
    const z=h.spawn('zombie',.5,60,-4.5);
    fire(h,'snowball',.5,61,.5,0,0,-30,{owner:'player'});h.game.runTicks(4);
    expect(h.hits).toHaveLength(1);expect(h.hits[0].entity).toBe(z);expect(h.hits[0].amount).toBe(0);
    expect(h.hits[0].source.knockback).toBeDefined();
  });
  test('eggs hatch a baby chicken one time in eight',()=>{
    const lucky=createHarness({random:sequence([.05,.5])});
    fire(lucky,'egg',.5,61,.5,0,-10,0,{owner:'player'});lucky.game.runTicks(3);
    const chick=lucky.spawned.find(s=>s.entity.kind==='chicken');
    expect(chick?.entity.baby).toBe(true);expect(chick?.reason).toBe('egg');
    expect(lucky.particles.some(p=>p.kind==='item'&&p.options?.item==='egg')).toBe(true);
    const unlucky=createHarness({random:sequence([.2])});
    fire(unlucky,'egg',.5,61,.5,0,-10,0,{owner:'player'});unlucky.game.runTicks(3);
    expect(unlucky.spawned.some(s=>s.entity.kind==='chicken')).toBe(false);
  });
  test('ender pearls teleport the thrower to the impact with 5 fall damage, portal particles and a sound',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    const p=fire(h,'ender_pearl',.5,61.6,.5,0,8,-20,{owner:'player'});
    for(let i=0;i<80&&!p.removed;i++)h.game.runTicks(1);
    expect(p.removed).toBe(true);expect(h.teleports).toHaveLength(1);
    const to=h.teleports[0];expect(to.y).toBeCloseTo(60,3);expect(to.z).toBeLessThan(-3);
    expect(h.hurt).toEqual([{amount:5,source:{kind:'fall'}}]);
    expect(h.sounds()).toContain('teleport');expect(h.particles.some(q=>q.kind==='portal')).toBe(true);
  });
});
