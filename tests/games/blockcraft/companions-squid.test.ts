import {describe,expect,it} from 'vitest';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {newSquidLook} from '../../../src/games/blockcraft/entity/companions-art';
import {INK_COLOUR,lookOfSquid,squidBrain} from '../../../src/games/blockcraft/entity/companions-squid';
import {createHarness,dist,fill,type Harness} from './companions-harness';

/** A pool of still water x -12..12, y 60..69, z -6..6 on the stone floor. */
function pool(h:Harness){fill(h,-12,60,-6,12,69,6,B.water);}

describe('squid',()=>{
  it('swims in tentacle pulses with no gravity in water',()=>{
    // random 0.5: the movement vector points along -x with no vertical part.
    const h=createHarness({random:()=>.5});pool(h);
    const s=h.spawn('squid',5.5,64,.5,{reason:'natural'});
    const steps:number[]=[];let x=s.x;
    for(let i=0;i<120;i++){h.run(1);steps.push(x-s.x);x=s.x;expect(s.inWater).toBe(true);}
    expect(s.x).toBeLessThan(5.5-3);
    expect(s.y).toBeCloseTo(64,6);
    // Spurts: a strong stroke, then a long glide that slows almost to a stop.
    const moving=steps.slice(30);
    expect(Math.max(...moving)).toBeGreaterThan(.18);
    expect(Math.min(...moving)).toBeLessThan(.05);
    expect(Math.min(...moving)).toBeGreaterThanOrEqual(0);
  });
  it('turns toward where it swims, mantle first, spinning about its axis',()=>{
    const h=createHarness({random:()=>.5});pool(h);
    const s=h.spawn('squid',5.5,64,.5);
    h.run(100);
    // Swimming toward -x: yaw +90° (positive yaw turns left from north).
    expect(s.yaw).toBeCloseTo(Math.PI/2,1);
    const look=newSquidLook();lookOfSquid(s,1,look);
    expect(look.pitch).toBeCloseTo(-Math.PI/2,1);
    const spin=look.spin;h.run(5);lookOfSquid(s,1,look);
    expect(look.spin).toBeGreaterThan(spin);
  });
  it('picks random headings in water, up and down too',()=>{
    const h=createHarness();pool(h);
    const s=h.spawn('squid',.5,64,.5);
    let minY=s.y,maxY=s.y;const start={x:s.x,y:s.y,z:s.z};
    for(let i=0;i<400;i++){h.run(1);minY=Math.min(minY,s.y);maxY=Math.max(maxY,s.y);}
    expect(dist(s,start)).toBeGreaterThan(1);
    expect(maxY-minY).toBeGreaterThan(.3);
  });
  it('falls on land and lies there',()=>{
    const h=createHarness();
    const s=h.spawn('squid',.5,63,.5);
    h.run(40);
    expect(s.y).toBeCloseTo(60,3);expect(s.onGround).toBe(true);
    expect(s.vx).toBe(0);expect(s.vz).toBe(0);
    const look=newSquidLook();lookOfSquid(s,1,look);
    expect(look.pitch).toBeLessThan(-.3);
  });
  it('squirts black ink and flees from whoever hit it',()=>{
    const h=createHarness();pool(h);
    const p=h.game.player.state;p.x=.5;p.y=64;p.z=.5;
    const s=h.spawn('squid',2.5,64,.5);
    h.run(2);
    h.game.entities.damage(s,1,{kind:'player',byPlayer:true});
    // Vanilla Squid.spawnInk: 30 'ink' particles, each with its own direction (mostly down the tentacles, below the body).
    const ink=h.particles.filter(x=>x.kind==='ink');
    expect(ink.reduce((n,x)=>n+(x.options?.count??0),0)).toBe(30);expect(ink).toHaveLength(30);
    expect(ink.every(x=>x.options?.color===INK_COLOUR)).toBe(true);
    expect(new Set(ink.map(x=>x.options?.velocity?.x)).size).toBeGreaterThan(20);
    expect(h.particles.filter(x=>x.kind==='large_smoke')).toEqual([]);
    expect(h.sounds()).toContain('mob:squid_squirt:ambient');
    const before=dist(s,p);
    h.run(30);
    expect(dist(s,p)).toBeGreaterThan(before+2);
    expect(squidBrain(s,h.game).fleeTicks).toBeGreaterThan(0);
    expect(h.particles.some(x=>x.kind==='bubble')).toBe(true);
  });
  it('does not ink when hurt by its surroundings',()=>{
    const h=createHarness();pool(h);
    const s=h.spawn('squid',2.5,64,.5);
    h.game.entities.damage(s,2,{kind:'drown'});
    expect(h.particles.filter(x=>x.kind==='ink')).toEqual([]);
  });
  it('drops 1-3 ink sacs and 1-3 experience',()=>{
    const h=createHarness();pool(h);
    const counts=new Set<number>(),xp=new Set<number>();
    for(let i=0;i<200;i++){
      const s=h.spawn('squid',.5,64,.5);
      h.drops.length=0;h.xp.length=0;
      h.game.entities.damage(s,20,{kind:'player',byPlayer:true});
      expect(h.drops.length).toBe(1);expect(h.drops[0].id).toBe('ink_sac');
      counts.add(h.drops[0].count);xp.add(h.xp[0]);
      s.removed=true;
    }
    expect([...counts].sort()).toEqual([1,2,3]);
    expect([...xp].sort()).toEqual([1,2,3]);
  });
  it('keeps no saved data of its own',()=>{
    const h=createHarness();
    expect(h.game.entities.kind('squid')!.restoreData!({speed:9,attacker:'x'})).toEqual({});
  });
});
