import {describe,expect,test} from 'vitest';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {isSlimeChunk,moonBrightness,slimeCanSpawn,slimeHopSpeed} from '../../../src/games/blockcraft/entity/monsters-slime';
import type {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import type {Entity,SpawnReason} from '../../../src/games/blockcraft/engine/contracts';
import {createHarness,type MonsterHarness} from './monsters-fixture';

function slime(h:MonsterHarness,size:number|undefined,x=.5,y=60,z=.5,reason:SpawnReason='event'):Entity{
  const e=h.entities.spawn('slime',x,y,z,{reason,data:size===undefined?{}:{size}});
  if(!e)throw new Error('slime not registered');
  return e;
}
const live=(h:MonsterHarness)=>h.entities.all().filter(e=>e.kind==='slime'&&!e.removed&&e.deathTime===0);
const seq=(...values:number[])=>()=>values.length?values.shift()!:.5;
/** A seed whose chunk (0, 0) is (or is not) a slime chunk. */
function seedFor(slimy:boolean){for(let s=1;s<5000;s++)if(isSlimeChunk(s,0,0)===slimy)return s;throw new Error('no seed');}
function swamp(h:MonsterHarness){for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++)h.game.world.chunk(cx,cz)!.biomes.fill(biomeId('swamp'));}
/** Midnight sky: 11 levels of darkening (sky brightness 4 in the open). */
function night(h:MonsterHarness){h.game.time.skyDarkening=11;(h.game.world as VoxelWorld).skyDarkening=11;}

describe('slime sizes',()=>{
  test('registered as a hostile with the vanilla spawn entry and the large spawn box',()=>{
    const h=createHarness(),k=h.entities.kind('slime')!;
    expect(k.category).toBe('hostile');expect(k.width).toBeCloseTo(2.08);expect(k.height).toBeCloseTo(2.08);
    expect(k.spawn).toMatchObject({light:'dark',group:[4,4],weight:100});
    expect(k.spawn!.biomes!.map(([n])=>n)).not.toContain('mushroom_fields');
    // Vanilla slimes take no fall damage and despawn like other monsters.
    expect(k.noFallDamage).toBe(true);expect(k.despawns).toBe(true);
  });
  test.each([[1,.52,1],[2,1.04,4],[4,2.08,16]])('size %i: box %f, health %i, model scale and xp follow the size',(size,box,health)=>{
    const h=createHarness(),e=slime(h,size),k=h.entities.kind('slime')!;
    expect(e.width).toBeCloseTo(box);expect(e.height).toBeCloseTo(box);
    expect(e.maxHealth).toBe(health);expect(e.health).toBe(health);
    expect(k.model!.appearance!(e).scale).toBe(size);
    expect(typeof k.xp==='function'?k.xp(e):k.xp).toBe(size);
  });
  test('spawn eggs and spawners pick sizes 1, 2 and 4 with about equal odds',()=>{
    const h=createHarness({seed:5}),seen=new Map<number,number>();
    for(let i=0;i<600;i++){const e=slime(h,undefined,.5,60,.5,'egg');seen.set(e.data.size as number,(seen.get(e.data.size as number)??0)+1);e.removed=true;}
    expect([...seen.keys()].sort()).toEqual([1,2,4]);
    for(const n of seen.values()){expect(n).toBeGreaterThan(150);expect(n).toBeLessThan(250);}
  });
  test('restoreData keeps valid sizes and drops anything else',()=>{
    const k=createHarness().entities.kind('slime')!;
    expect(k.restoreData!({size:4,jump:7,dir:1})).toEqual({size:4,jump:7,dir:1});
    for(const bad of [{size:3},{size:'4'},{},{size:8}])expect(k.restoreData!(bad)).toBeNull();
    expect(k.restoreData!({size:2,jump:-1,dir:'x'})).toEqual({size:2});
  });
  test('a restored slime keeps its wounds but never exceeds its size',()=>{
    const h=createHarness(),k=h.entities.kind('slime')!,e=slime(h,4);
    e.health=5;k.init!(e,h.game,'restore');expect(e.health).toBe(5);expect(e.width).toBeCloseTo(2.08);
    e.data.size=1;e.health=12;k.init!(e,h.game,'restore');expect(e.health).toBe(1);
  });
});

describe('slime splitting',()=>{
  test('a big slime splits into 2–4 medium slimes around it',()=>{
    const h=createHarness(),e=slime(h,4,.5,60,.5);
    h.entities.damage(e,100,{kind:'player',byPlayer:true});
    const kids=live(h);
    expect(kids.length).toBeGreaterThanOrEqual(2);expect(kids.length).toBeLessThanOrEqual(4);
    for(const k of kids){
      expect(k.data.size).toBe(2);expect(k.health).toBe(4);
      expect(Math.abs(k.x-e.x)).toBeCloseTo(.5);expect(Math.abs(k.z-e.z)).toBeCloseTo(.5);expect(k.y).toBeCloseTo(60.5);
    }
    expect(h.xp).toEqual([4]);expect(h.dropped).toEqual([]);
  });
  test('medium slimes split into 2, 3 or 4 small slimes',()=>{
    const h=createHarness({seed:11}),counts=new Set<number>();
    for(let i=0;i<120;i++){
      const before=live(h).length,e=slime(h,2,(i%10)*3-15,60,Math.floor(i/10)*3-15);
      h.entities.damage(e,100,{kind:'player'});
      const kids=live(h).slice(before);
      counts.add(kids.length);
      for(const k of kids){expect(k.data.size).toBe(1);expect(k.width).toBeCloseTo(.52);}
      for(const k of kids)k.removed=true;
    }
    expect([...counts].sort()).toEqual([2,3,4]);
  });
  test('small slimes do not split and drop 0–2 slime balls',()=>{
    const h=createHarness({seed:4}),totals=new Set<number>();let balls=0;
    for(let i=0;i<400;i++){
      h.dropped.length=0;const e=slime(h,1,(i%20)-9.5,60,Math.floor(i/20)-9.5);
      h.entities.damage(e,5,{kind:'player',byPlayer:true});
      const n=h.dropped.filter(s=>s.id==='slime_ball').reduce((a,s)=>a+s.count,0);
      totals.add(n);balls+=n;
      expect(live(h).length).toBe(0);
    }
    expect([...totals].sort()).toEqual([0,1,2]);
    expect(balls/400).toBeGreaterThan(.85);expect(balls/400).toBeLessThan(1.15);
  });
});

/** The contract's moveX is a steady ground speed: vanilla input speed s settles at s² / (1 − 0.6 × 0.91) blocks per tick. */
const inputSpeed=(moveX:number)=>Math.sqrt(moveX/20*(1-.6*.91));
/** Blocks covered by one vanilla hop on flat ground (LivingEntity.travel): the jump tick accelerates by s² on the ground,
 *  then 0.02 × s per tick in the air with 0.91 drag; jump 0.42, gravity 0.08, vertical drag 0.98. */
function vanillaHop(s:number):number{
  let x=0,y=0,vx=s*s,vy=.42;
  x+=vx;y+=vy;vx*=.6*.91;vy=(vy-.08)*.98;
  for(;;){vx+=.02*s;x+=vx;y+=vy;if(y<=0)return x;vx*=.91;vy=(vy-.08)*.98;}
}

describe('slime hopping and contact damage',()=>{
  test.each([[1,.741],[2,1.184],[4,2.366]])('size %i: vanilla speed attribute 0.2 + 0.1 × size, about %f blocks per hop',(size,blocks)=>{
    const s=inputSpeed(slimeHopSpeed(size));
    expect(s).toBeCloseTo(.2+.1*size,6);
    expect(vanillaHop(s)).toBeCloseTo(blocks,2);
  });
  test('hops toward the player: still between hops, moving while airborne, squish on landing',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    const e=slime(h,4,.5,60,-5.5);e.data.chase=true;
    let ticks=0;while(!e.jump&&ticks<40){h.entities.tick();ticks++;}
    expect(e.jump).toBe(true);
    expect(e.moveZ).toBeCloseTo(slimeHopSpeed(4));expect(e.moveX).toBeCloseTo(0);
    e.onGround=false;e.jump=false;h.entities.tick();
    expect(e.moveZ).toBeCloseTo(slimeHopSpeed(4));
    e.onGround=true;h.entities.tick();
    expect(e.moveX).toBe(0);expect(e.moveZ).toBe(0);
    expect(h.particles.some(p=>p.kind==='slime')).toBe(true);
    expect(h.sounds('mob:slime:step')).toBe(1);
  });
  test('big slimes chasing hop three times as often as small ones',()=>{
    const gaps=(size:number)=>{
      const h=createHarness({seed:21});h.game.player.teleport(.5,60,.5);
      const e=slime(h,size,.5,60,-3.5);e.data.chase=true;
      const out:number[]=[];let last=-1;
      for(let t=0;t<600;t++){h.entities.tick();if(e.jump){if(last>=0)out.push(t-last);last=t;e.jump=false;}}
      return out;
    };
    const big=gaps(4),small=gaps(1);
    expect(Math.max(...big)).toBeLessThanOrEqual(9);expect(Math.min(...big)).toBeGreaterThanOrEqual(3);
    expect(Math.min(...small)).toBeGreaterThanOrEqual(10);expect(Math.max(...small)).toBeLessThanOrEqual(29);
  });
  test('wandering slimes change direction every few seconds',()=>{
    const h=createHarness();h.game.player.teleport(40.5,60,40.5);
    const e=slime(h,2,.5,60,.5),dirs=new Set<number>();
    for(let t=0;t<400;t++){h.entities.tick();dirs.add(e.data.dir as number);}
    expect(dirs.size).toBeGreaterThanOrEqual(3);expect(dirs.size).toBeLessThanOrEqual(12);
  });
  test('floats up in water',()=>{
    const h=createHarness(),e=slime(h,1);e.inWater=true;e.onGround=false;
    let jumps=0;for(let i=0;i<20;i++){e.jump=false;h.entities.tick();if(e.jump)jumps++;}
    expect(jumps).toBeGreaterThan(10);
  });
  test.each([[2,-.5,2],[4,-1.5,4]])('size %i deals its size in damage on contact',(size,z,damage)=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    slime(h,size,.5,60,z);
    h.entities.tick();
    expect(h.playerHits.map(x=>x.amount)).toEqual([damage]);
    expect(h.playerHits[0].source.kind).toBe('mob');
  });
  test('a touching slime hits once per 10 ticks (the player\'s invulnerability); a refused hit is retried next tick',()=>{
    let h=createHarness();h.game.player.teleport(.5,60,.5);
    slime(h,4,.5,60,-1.5);
    for(let i=0;i<20;i++)h.entities.tick();
    expect(h.playerHits.map(x=>x.amount)).toEqual([4,4]);
    h=createHarness();h.game.player.teleport(.5,60,.5);
    let calls=0;h.game.survival={...h.game.survival,damage:()=>++calls>3?4:0};
    slime(h,4,.5,60,-1.5);
    for(let i=0;i<8;i++)h.entities.tick();
    expect(calls).toBe(4);
  });
  test('a chasing slime forgets a player it has not seen for about three seconds',()=>{
    const h=createHarness();h.game.player.teleport(.5,60,.5);
    const e=slime(h,2,.5,60,-8.5);e.data.chase=true;
    for(let i=0;i<80;i++)h.entities.tick();
    expect(e.data.chase).toBe(true);// in plain view
    for(let y=60;y<=64;y++)for(let x=-4;x<=4;x++)h.game.world.set(x,y,-4,B.stone,'player');
    let t=0;while(e.data.chase===true&&t<200){h.entities.tick();t++;}
    expect(e.data.chase).toBe(false);
    expect(t).toBeGreaterThanOrEqual(58);expect(t).toBeLessThanOrEqual(64);
    for(let i=0;i<100;i++)h.entities.tick();
    expect(e.data.chase).toBe(false);// cannot pick the player up again through the wall
  });
  test('small slimes, distant slimes and creative players take no contact damage',()=>{
    // Well inside the 0.6 × size reach: size 1 is still harmless.
    let h=createHarness();h.game.player.teleport(.5,60,.5);slime(h,1,.5,60,.2);h.entities.tick();expect(h.playerHits).toEqual([]);
    h=createHarness();h.game.player.teleport(.5,60,.5);slime(h,2,.5,60,-1.8);h.entities.tick();expect(h.playerHits).toEqual([]);
    h=createHarness({mode:'creative'});h.game.player.teleport(.5,60,.5);slime(h,4,.5,60,-1);h.entities.tick();expect(h.playerHits).toEqual([]);
    h=createHarness();h.game.player.teleport(.5,60,.5);h.game.world.set(0,60,-1,B.stone,'player');h.game.world.set(0,61,-1,B.stone,'player');
    // A wall between them blocks the hit.
    slime(h,4,.5,60,-1.5);h.entities.tick();expect(h.playerHits).toEqual([]);
  });
});

describe('slime spawn rules',()=>{
  test('slime chunks are a deterministic one in ten, different per seed',()=>{
    let hits=0,differ=0;
    for(let cz=-50;cz<50;cz++)for(let cx=-50;cx<50;cx++){
      const a=isSlimeChunk(12345,cx,cz);expect(isSlimeChunk(12345,cx,cz)).toBe(a);
      if(a)hits++;if(a!==isSlimeChunk(54321,cx,cz))differ++;
    }
    expect(hits/10000).toBeGreaterThan(.09);expect(hits/10000).toBeLessThan(.11);
    expect(differ).toBeGreaterThan(1000);
  });
  test('slime chunks allow spawns below y 40 only, on a one-in-ten roll',()=>{
    const h=createHarness();
    h.game.terrain={...h.game.terrain,seed:seedFor(true)};
    expect(slimeCanSpawn(h.game,5,30,5,seq(.05))).toBe(true);
    expect(slimeCanSpawn(h.game,5,30,5,seq(.15))).toBe(false);
    expect(slimeCanSpawn(h.game,5,40,5,seq(.05))).toBe(false);
    h.game.terrain={...h.game.terrain,seed:seedFor(false)};
    expect(slimeCanSpawn(h.game,5,30,5,seq(.05))).toBe(false);
  });
  test('swamps allow surface spawns between y 50 and 70 at night, more under a full moon',()=>{
    const h=createHarness();swamp(h);h.game.terrain={...h.game.terrain,seed:seedFor(false)};
    // Noon: day, and sky light 15 is never at or below the random 0..7.
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99,.9))).toBe(false);
    night(h);// brightness 4
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99))).toBe(true);
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.4,.9))).toBe(false);// brightness 4 > random 3
    expect(slimeCanSpawn(h.game,5,60,5,seq(.6,.9))).toBe(false);// the 50 % roll
    expect(slimeCanSpawn(h.game,5,70,5,seq(.1,.1,.99,.9))).toBe(false);
    expect(slimeCanSpawn(h.game,5,50,5,seq(.1,.1,.99,.9))).toBe(false);
    h.game.time.day=5;// new moon
    expect(moonBrightness(5)).toBe(0);
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99,.9))).toBe(false);
    h.game.time.day=9;expect(moonBrightness(9)).toBe(1);
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99))).toBe(true);
  });
  test('a dark swamp in daytime is not night: no surface slimes there',()=>{
    const h=createHarness();swamp(h);h.game.terrain={...h.game.terrain,seed:seedFor(false)};
    // A roofed-over swamp at noon: brightness 0, but it is day.
    for(let z=0;z<=10;z++)for(let x=0;x<=10;x++)h.game.world.set(x,63,z,B.stone,'player');
    expect(h.game.world.brightnessAt(5,60,5)).toBeLessThanOrEqual(7);
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99,.9))).toBe(false);
    // Dusk darkening of 4 counts as night (vanilla Level.isNight), so do thunderstorms.
    h.game.time.skyDarkening=4;
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99))).toBe(true);
  });
  test('other biomes do not allow surface slimes; peaceful allows none',()=>{
    const h=createHarness();h.game.terrain={...h.game.terrain,seed:seedFor(true)};
    night(h);
    expect(slimeCanSpawn(h.game,5,60,5,seq(.1,.1,.99,.9))).toBe(false);
    h.game.updateSettings({difficulty:'peaceful'});
    expect(slimeCanSpawn(h.game,5,30,5,seq(.05))).toBe(false);
  });
  test('natural spawns that break the rules are dropped; valid ones get a random size',()=>{
    const h=createHarness();h.game.terrain={...h.game.terrain,seed:seedFor(true)};
    const surface=slime(h,undefined,5.5,60,5.5,'natural');
    expect(surface.removed).toBe(true);
    h.queueRandom(.05,.9);// the slime chunk roll, then the size roll (→ 4)
    const deep=slime(h,undefined,5.5,30,5.5,'natural');
    expect(deep.removed).toBe(false);expect(deep.data.size).toBe(4);expect(deep.width).toBeCloseTo(2.08);
  });
});
