import {describe,expect,test} from 'vitest';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import type {Entity,SpawnReason} from '../../../src/games/blockcraft/engine/contracts';
import {sunBrightness} from '../../../src/games/blockcraft/entity/entities';
import {fill,harness,monster,walker} from './entities-helpers';

const settle=(h:ReturnType<typeof harness>)=>h.tick(3);

describe('damage, knockback and death',()=>{
  test('knockback halves the velocity and pushes along the attack, with a vertical hop on the ground',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    expect(h.game.entities.damage(e,4,{kind:'player',byPlayer:true,knockback:{x:2,z:0,strength:8}})).toBe(true);
    // On the ground vy is -0.0784 blocks/tick (gravity each tick), so the hop is min(0.4, vy/2 + 0.4) = 0.3608 (vanilla).
    expect(e.vx).toBeCloseTo(8,5);expect(e.vz).toBeCloseTo(0,5);expect(e.vy).toBeCloseTo((.4-.0784/2)*20,4);
    expect(e.hurtTime).toBe(10);expect(e.health).toBe(16);
  });
  test('a mob attacker knocks back from its position when no knockback is given',()=>{
    const h=harness({kinds:[walker(),monster()]}),e=h.game.entities.spawn('walker',.5,60,.5)!,z=h.game.entities.spawn('monster',.5,60,-1.5)!;settle(h);
    h.game.entities.damage(e,3,{kind:'mob',attacker:z});
    expect(e.vz).toBeGreaterThan(7);
  });
  test('10 ticks of invulnerability: equal hits are ignored, a bigger one deals the difference',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    const s={kind:'mob' as const};
    expect(h.game.entities.damage(e,4,s)).toBe(true);expect(e.health).toBe(16);
    expect(h.game.entities.damage(e,4,s)).toBe(false);expect(e.health).toBe(16);
    expect(h.game.entities.damage(e,6,s)).toBe(true);expect(e.health).toBe(14);
    h.tick(10);expect(e.hurtTime).toBe(0);
    expect(h.game.entities.damage(e,4,s)).toBe(true);expect(e.health).toBe(10);
  });
  test('the kind hurt hook can cancel damage',()=>{
    const seen:number[]=[];
    const h=harness({kinds:[walker({hurt:(_e,_g,source,amount)=>{seen.push(amount);return source.kind!=='projectile';}})]});
    const e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    expect(h.game.entities.damage(e,5,{kind:'projectile'})).toBe(false);expect(e.health).toBe(20);
    expect(h.game.entities.damage(e,5,{kind:'mob'})).toBe(true);expect(seen).toEqual([5,5]);
  });
  test('death: tips over for 20 ticks, drops loot always, xp only for the player, poof, then removal',()=>{
    const h=harness({kinds:[walker({drops:()=>[stack('leather',2)],xp:5,sounds:{name:'cow'}})]});
    const died:Entity[]=[];h.game.events.on('entityDied',({entity})=>died.push(entity));
    const a=h.game.entities.spawn('walker',.5,60,.5)!,b=h.game.entities.spawn('walker',8.5,60,8.5)!;settle(h);
    h.game.entities.damage(a,50,{kind:'fall'});
    h.game.entities.damage(b,50,{kind:'player',byPlayer:true});
    expect(died).toEqual([a,b]);expect(a.deathTime).toBe(1);
    expect(h.game.entities.damage(a,5,{kind:'mob'})).toBe(false);
    const items=h.game.entities.all().filter(e=>e.kind==='item');
    expect(items).toHaveLength(2);expect(items.every(i=>(i.data.stack as {id:string}).id==='leather')).toBe(true);
    const orbs=h.game.entities.all().filter(e=>e.kind==='xp_orb');
    expect(orbs.reduce((n,o)=>n+(o.data.points as number),0)).toBe(5);
    expect(orbs.every(o=>Math.hypot(o.x-b.x,o.z-b.z)<1)).toBe(true);
    expect(h.sounds()).toContain('mob:cow:death');
    h.tick(18);expect(a.removed).toBe(false);expect(a.deathTime).toBe(19);
    h.tick(1);expect(a.removed).toBe(true);
    expect(h.particles.filter(p=>p.kind==='poof')).toHaveLength(2);
  });
  test('a death soon after a player hit still drops experience',()=>{
    const h=harness({kinds:[walker({xp:3})]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    h.game.entities.damage(e,2,{kind:'player',byPlayer:true});h.tick(40);
    h.game.entities.damage(e,30,{kind:'fall'});
    expect(h.game.entities.all().filter(o=>o.kind==='xp_orb').length).toBeGreaterThan(0);
  });
  test('kind sounds: hurt, ambient about every few seconds, and steps while walking',()=>{
    const h=harness({kinds:[walker({sounds:{name:'cow'}}),walker({kind:'plain'})]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    h.game.entities.damage(e,1,{kind:'mob'});
    expect(h.sounds()).toContain('mob:cow:hurt');
    h.tick(600);
    const ambient=h.sounds().filter(s=>s==='mob:cow:ambient').length;
    expect(ambient).toBeGreaterThanOrEqual(3);expect(ambient).toBeLessThanOrEqual(12);
    e.moveX=2;h.tick(40);
    expect(h.sounds()).toContain('mob:cow:step');
    const p=h.game.entities.spawn('plain',.5,60,6.5)!;h.tick(2);p.moveX=2;h.tick(40);
    expect(h.sounds()).toContain('step:stone');
  });
  test('fire ticks hurt 1 every second; water puts the fire out',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;settle(h);
    e.fire=100;h.tick(100);
    expect(e.health).toBe(15);expect(e.fire).toBe(0);
    fill(h.game,4,60,-1,6,60,1,B.water);
    const w=h.game.entities.spawn('walker',5.5,60,.5)!;h.tick(1);w.fire=200;h.tick(2);
    expect(w.fire).toBe(0);
  });
  test('burnsInDaylight: ignites in the open at noon, not in shade, water, rain or at night',()=>{
    const burn=(setup?:(h:ReturnType<typeof harness>)=>void,day=6000)=>{
      const h=harness({kinds:[monster({burnsInDaylight:true})]});h.game.time.dayTime=day;
      setup?.(h);
      const e=h.game.entities.spawn('monster',.5,60,.5)!;h.tick(200);return e.fire;
    };
    expect(burn()).toBeGreaterThan(0);
    expect(burn(h=>fill(h.game,-2,63,-2,2,63,2,B.stone))).toBe(0);
    expect(burn(h=>fill(h.game,-2,60,-2,2,61,2,B.water))).toBe(0);
    expect(burn(h=>{h.game.weather.isRainingOn=()=>true;})).toBe(0);
    expect(burn(undefined,18000)).toBe(0);
  });
  test('land mobs drown with the head under water; water mobs dry out on land',()=>{
    const h=harness({kinds:[walker({physics:'none'}),walker({kind:'squid',category:'water',aquatic:true,physics:'none',width:.8,height:.8})]});
    fill(h.game,-2,60,-2,2,63,2,B.water);
    const e=h.game.entities.spawn('walker',.5,60,.5)!,s=h.game.entities.spawn('squid',8.5,60,.5)!,ok=h.game.entities.spawn('squid',.5,61,1.5)!;
    h.tick(300);expect(e.health).toBe(20);
    h.tick(30);expect(e.health).toBe(18);expect(s.health).toBeLessThan(20);expect(ok.health).toBe(20);
  });
  test('suffocates inside opaque blocks and is hurt by cacti',()=>{
    const h=harness({kinds:[walker({physics:'none'})]});
    h.game.world.set(0,61,0,B.stone);h.game.world.set(5,60,0,blockId('cactus'));
    const e=h.game.entities.spawn('walker',.5,60,.5)!,c=h.game.entities.spawn('walker',4.72,60,.5)!;
    h.tick(1);expect(e.health).toBe(19);expect(c.health).toBe(19);
  });
});

describe('lifecycle',()=>{
  test('spawning an unknown kind returns null; init gets the reason and entitySpawned reports it',()=>{
    const reasons:SpawnReason[]=[],events:SpawnReason[]=[];
    const h=harness({kinds:[walker({init:(e,_g,reason)=>{reasons.push(reason);e.data.ready=true;}})]});
    h.game.events.on('entitySpawned',({entity,reason})=>{if(entity.kind==='walker')events.push(reason);});
    expect(h.game.entities.spawn('nope',0,60,0)).toBeNull();
    const e=h.game.entities.spawn('walker',.5,60,.5,{reason:'breed',baby:true,data:{colour:3},yaw:1})!;
    expect(reasons).toEqual(['breed']);expect(events).toEqual(['breed']);
    expect(e).toMatchObject({baby:true,yaw:1,headYaw:1,data:{colour:3,ready:true},health:20,category:'passive'});
    expect(h.game.entities.byId(e.id)).toBe(e);
  });
  test('an init that spawns other entities gets distinct ids',()=>{
    const h=harness({kinds:[walker({kind:'rider'}),walker({kind:'mount',init:(e,game)=>{e.data.rider=(game.entities.spawn('rider',e.x,e.y+1,e.z) as {id:number}).id;}})]});
    const m=h.game.entities.spawn('mount',.5,60,.5)!;
    expect(m.data.rider).not.toBe(m.id);expect(new Set(h.game.entities.all().map(e=>e.id)).size).toBe(2);
  });
  test('init may veto a spawn by marking the entity removed',()=>{
    let seen=0;
    const h=harness({kinds:[walker({init:(e,_g,reason)=>{if(reason==='natural')e.removed=true;}})]});
    h.game.events.on('entitySpawned',()=>seen++);
    expect(h.game.entities.spawn('walker',.5,60,.5,{reason:'natural'})).toBeNull();expect(seen).toBe(0);
    expect(h.game.entities.all()).toHaveLength(0);
  });
  test('raycast honours pickable and skips the dying; near() fills the caller array',()=>{
    const h=harness({kinds:[walker(),walker({kind:'ghost',pickable:false})]});
    const a=h.game.entities.spawn('walker',.5,60,-3.5)!,g=h.game.entities.spawn('ghost',.5,60,-1.5)!;
    h.game.entities.dropItem(stack('stick'),.5,61,-1,{x:0,y:0,z:0});
    const o={x:.5,y:61,z:.5},d={x:0,y:0,z:-1};
    expect(h.game.entities.raycast(o,d,10)?.entity).toBe(a);
    expect(h.game.entities.raycast(o,d,10,a)).toBeNull();
    h.game.entities.damage(a,100,{kind:'mob'});
    expect(h.game.entities.raycast(o,d,10)).toBeNull();
    const out:Entity[]=[];
    const res=h.game.entities.near(.5,60,-1.5,1,undefined,out);
    expect(res).toBe(out);expect(out).toContain(g);expect(out).not.toContain(a);
    h.game.entities.near(.5,60,-1.5,1,e=>e.kind==='walker',out);expect(out).toHaveLength(0);
    expect(h.game.entities.count('passive')).toBe(1);
  });
});

describe('environment edge cases',()=>{
  test('no fall damage when landing in water, even in a one-block-deep pool',()=>{
    const h=harness({kinds:[walker()],layers:[[B.water,60,60]]});
    const mobs:Entity[]=[];
    for(let i=0;i<24;i++)mobs.push(h.game.entities.spawn('walker',-9.5+(i%6)*4,70+i*.37,-9.5+Math.floor(i/6)*4)!);
    h.tick(120);
    expect(mobs.map(e=>e.health)).toEqual(mobs.map(()=>20));
    expect(mobs.every(e=>e.inWater&&e.onGround)).toBe(true);
  });
  test('beds halve the fall distance before the 3-block allowance and bounce the mob back up',()=>{
    const bed=blockId('bed_foot_north');
    const drop=(y:number)=>{
      const h=harness({kinds:[walker()]});fill(h.game,-1,60,-1,1,60,1,bed);
      const e=h.game.entities.spawn('walker',.5,y,.5)!;
      let landed=-1,peak=-Infinity;
      for(let t=0;t<200;t++){h.tick();if(landed<0){if(e.onGround)landed=t;}else if(t<landed+40)peak=Math.max(peak,e.y);}
      return{damage:20-e.health,peak};
    };
    // Vanilla BedBlock.fallOn: ceil(fallDistance × 0.5 − 3). Dropped from 66 and 71 onto the bed top (9/16), the fall
    // distance before the landing tick (as vanilla counts it) is 4.84 and 9.67 blocks: 0 and 2 damage.
    const low=drop(66),high=drop(71);
    expect(low.damage).toBe(0);expect(high.damage).toBe(2);
    // BedBlock.bounceUp: -vy × 0.66 for living entities.
    expect(high.peak).toBeGreaterThan(60.5625+2);
  });
  test('sun burn uses the vanilla brightness curve f / (4 − 3f) and its burn chance',()=>{
    // Vanilla DimensionType.getBrightness values (Java floats give 0.50000006 at 12, so it still passes the > 0.5 test).
    expect(sunBrightness(12)).toBeCloseTo(.5,6);expect(sunBrightness(12)).toBeGreaterThan(.5);
    expect(sunBrightness(13)).toBeCloseTo(.6190,4);expect(sunBrightness(14)).toBeCloseTo(.7778,4);expect(sunBrightness(15)).toBe(1);
    const rate=(darkening:number)=>{
      const h=harness({kinds:[monster({burnsInDaylight:true,physics:'none'})],light:0xf0});h.game.time.dayTime=6000;
      (h.game.weather as {intensity:number}).intensity=darkening/3;// rain darkens the sky (isRainingOn stays false in the fake)
      const e=h.game.entities.spawn('monster',.5,60,.5)!;
      let burns=0;const n=20000;
      for(let i=0;i<n;i++){h.tick();if(e.fire===160)burns++;e.fire=0;}
      return burns/n;
    };
    // Mob.isSunBurnTick: random × 30 < (magic − 0.4) × 2, i.e. 0.67% per tick at brightness 12 and 4% at 15.
    const dusk=rate(3),noon=rate(0);
    expect(dusk).toBeGreaterThan(.004);expect(dusk).toBeLessThan(.0095);
    expect(noon).toBeGreaterThan(.033);expect(noon).toBeLessThan(.047);
  });
  test('undead mobs (burnsInDaylight) and the kinds that replace them never drown; land mobs still do',()=>{
    const h=harness({kinds:[monster({kind:'zombie',burnsInDaylight:true,physics:'none'}),
      monster({kind:'husk',physics:'none',spawn:{light:'dark',group:[1,1],biomes:[['desert',80]],replaces:'zombie'}}),walker({physics:'none'})]});
    fill(h.game,-6,60,-2,6,64,2,B.water);
    const z=h.game.entities.spawn('zombie',-3.5,60,.5)!,k=h.game.entities.spawn('husk',.5,60,.5)!,w=h.game.entities.spawn('walker',3.5,60,.5)!;
    h.tick(1000);
    expect(z.health).toBe(20);expect(k.health).toBe(20);expect(w.health).toBeLessThan(20);
  });
});
