import {describe,expect,test} from 'vitest';
import {AIR,B} from '../../../src/games/blockcraft/data/blocks';
import {KNOCKBACK,difficultyScaled,mobSpeed} from '../../../src/games/blockcraft/entity/hostile-ai';
import {CREEPER_FUSE,creeperSwellDir,explosionPower} from '../../../src/games/blockcraft/entity/hostile-creeper';
import {STRAFE_SPEED,bowInterval,bowPower,skeletonInaccuracy} from '../../../src/games/blockcraft/entity/hostile-skeletons';
import {CLIMB_SPEED,spiderCalm} from '../../../src/games/blockcraft/entity/hostile-spider';
import {zombieSpeed} from '../../../src/games/blockcraft/entity/hostile-zombies';
import {HOSTILE_MOBS} from '../../../src/games/blockcraft/entity/hostile';
import {creeperLook} from '../../../src/games/blockcraft/entity/hostile-models';
import type {AnimationState,Entity,EntityKind,ModelPart,PartPose} from '../../../src/games/blockcraft/engine/contracts';
import {createHarness,fill,night,noon,sequence,until,type Harness} from './hostile-harness';

const kind=(h:Harness,name:string)=>h.game.entities.kind(name) as EntityKind;
const dist=(e:Entity,h:Harness)=>{const p=h.game.player.state;return Math.hypot(e.x-p.x,e.z-p.z);};
function onGround(h:Harness){h.game.player.teleport(.5,60,.5);}
function allParts(parts:readonly ModelPart[],out:ModelPart[]=[]):ModelPart[]{for(const p of parts){out.push(p);if(p.children)allParts(p.children,out);}return out;}

describe('registration',()=>{
  test('every hostile mob is registered with vanilla stats, sounds and spawn settings',()=>{
    const h=createHarness();
    expect([...HOSTILE_MOBS]).toEqual(['zombie','husk','drowned','skeleton','stray','creeper','spider']);
    for(const name of HOSTILE_MOBS){
      const k=kind(h,name);
      expect(k.category).toBe('hostile');expect(k.model).toBeDefined();expect(k.despawns).toBe(true);
      expect(k.spawn?.light).toBe('dark');expect(k.sounds?.name).toBe(name);expect(k.xp).toBeDefined();
    }
    expect(kind(h,'zombie').maxHealth).toBe(20);expect(kind(h,'spider').maxHealth).toBe(16);expect(kind(h,'creeper').maxHealth).toBe(20);
    expect([kind(h,'zombie').width,kind(h,'zombie').height]).toEqual([.6,1.95]);expect(kind(h,'skeleton').height).toBe(1.99);
    expect([kind(h,'spider').width,kind(h,'spider').height]).toEqual([1.4,.9]);expect(kind(h,'creeper').height).toBe(1.7);
    for(const n of ['zombie','skeleton','creeper','spider'])expect(kind(h,n).spawn).toMatchObject({group:[4,4]});
    expect(kind(h,'zombie').spawn?.weight).toBe(95);expect(kind(h,'skeleton').spawn?.weight).toBe(100);
    expect(kind(h,'husk').spawn).toMatchObject({replaces:'zombie',biomes:[['desert',80]]});
    expect(kind(h,'stray').spawn).toMatchObject({replaces:'skeleton'});expect(kind(h,'stray').spawn?.biomes?.map(b=>b[0])).toContain('snowy_plains');
    expect(kind(h,'drowned').spawn?.biomes?.map(b=>b[0])).toEqual(expect.arrayContaining(['river','ocean','deep_ocean']));
    expect(kind(h,'drowned').aquatic).toBe(true);
    for(const n of ['zombie','drowned','skeleton','stray'])expect(kind(h,n).burnsInDaylight,n).toBe(true);
    for(const n of ['husk','creeper','spider'])expect(kind(h,n).burnsInDaylight,n).toBeFalsy();
    expect(kind(h,'creeper').sounds?.ambient).toBe(false);
  });
  test('projectile kinds are unpickable, unsaved and move themselves',()=>{
    const h=createHarness();
    for(const name of ['arrow','snowball','egg','ender_pearl']){
      const k=kind(h,name);
      expect(k.category).toBe('projectile');expect(k.physics).toBe('none');expect(k.persist).toBe(false);expect(k.pickable).toBe(false);
    }
    expect(kind(h,'arrow').model).toBeDefined();
    for(const name of ['snowball','egg','ender_pearl']){
      const k=kind(h,name),e=h.spawn(name,0,70,0,{data:{owner:'player'}});
      expect(k.render).toBe('item');expect(k.item?.(e)).toEqual({id:name,count:1});
      expect(k.item?.(e)).toBe(k.item?.(e));// no allocation per frame
    }
  });
});

describe('models',()=>{
  const state:AnimationState={time:1.3,partial:.4,limbSwing:2,limbAmount:.8,headYaw:.3,headPitch:-.2,attack:0,reducedMotion:false};
  test('every box UV fits its texture and is painted, and animate poses known parts with finite values',()=>{
    const h=createHarness();
    for(const name of [...HOSTILE_MOBS,'arrow']){
      const k=kind(h,name),m=k.model!,px=new Uint8ClampedArray(m.textureWidth*m.textureHeight*4);
      m.paint(px,m.textureWidth,m.textureHeight);
      const names=new Set<string>();
      for(const part of allParts(m.parts)){
        expect(names.has(part.name),`${name}.${part.name} unique`).toBe(false);names.add(part.name);
        for(const b of part.boxes){
          const [w,hh,d]=b.size,[u,v]=b.uv;
          expect(b.size.every(n=>Number.isInteger(n)&&n>0),`${name}.${part.name} integer size`).toBe(true);
          expect(u+2*d+2*w,`${name}.${part.name} width`).toBeLessThanOrEqual(m.textureWidth);
          expect(v+d+hh,`${name}.${part.name} height`).toBeLessThanOrEqual(m.textureHeight);
          let opaque=0;for(let y=v;y<v+d+hh;y++)for(let x=u;x<u+2*d+2*w;x++)if(px[(y*m.textureWidth+x)*4+3]>0)opaque++;
          expect(opaque,`${name}.${part.name} painted`).toBeGreaterThan(0);
        }
      }
      const e=h.spawn(name,0,61,0,{data:name==='arrow'?{owner:'mob'}:{}});
      const pose:Record<string,PartPose>={};
      m.animate?.(e,pose,state);
      for(const [part,p] of Object.entries(pose)){
        expect(names.has(part),`${name} poses known part ${part}`).toBe(true);
        for(const v of [p.x,p.y,p.z,p.px??0,p.py??0,p.pz??0])expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  test('textures are original pixels: faces differ and each mob has its own palette',()=>{
    const h=createHarness(),avg=(name:string)=>{
      const m=kind(h,name).model!,px=new Uint8ClampedArray(m.textureWidth*m.textureHeight*4);m.paint(px,m.textureWidth,m.textureHeight);
      let r=0,g=0,b=0,n=0;for(let i=0;i<px.length;i+=4)if(px[i+3]){r+=px[i];g+=px[i+1];b+=px[i+2];n++;}
      return[r/n,g/n,b/n];
    };
    const zombie=avg('zombie'),husk=avg('husk'),creeper=avg('creeper'),spider=avg('spider'),skeleton=avg('skeleton');
    expect(creeper[1]).toBeGreaterThan(creeper[0]+40);// green
    expect(husk[0]).toBeGreaterThan(zombie[0]+20);// sandy
    expect(skeleton[0]).toBeGreaterThan(150);expect(spider[0]).toBeLessThan(90);
  });
  test('zombies raise their arms higher when chasing and babies show the big head',()=>{
    const h=createHarness(),z=h.spawn('zombie',0,60,0),m=kind(h,'zombie').model!,pose:Record<string,PartPose>={};
    m.animate!(z,pose,state);const idle=pose.right_arm.x;
    expect(pose.head.visible).toBe(true);expect(pose.baby_head.visible).toBe(false);
    z.data.aggressive=true;m.animate!(z,pose,state);
    expect(pose.right_arm.x).toBeGreaterThan(idle+.5);
    z.baby=true;m.animate!(z,pose,state);
    expect(pose.head.visible).toBe(false);expect(pose.baby_head.visible).toBe(true);
    z.data.swing=10;m.animate!(z,pose,{...state,partial:0});const start=pose.right_arm.x;
    z.data.swing=5;m.animate!(z,pose,{...state,partial:0});expect(pose.right_arm.x).not.toBeCloseTo(start,3);
  });
  test('skeletons aim along the head pitch; the creeper aura shows only when charged; arrows pitch with flight',()=>{
    const h=createHarness(),s=h.spawn('skeleton',0,60,0),pose:Record<string,PartPose>={};
    s.data.aggressive=true;kind(h,'skeleton').model!.animate!(s,pose,{...state,headPitch:.3});
    expect(pose.right_arm.x).toBeCloseTo(Math.PI/2+.3,5);
    const c=h.spawn('creeper',0,60,0),cm=kind(h,'creeper').model!;
    cm.animate!(c,pose,state);expect(pose.aura_head.visible).toBe(false);
    c.data.charged=true;cm.animate!(c,pose,state);expect(pose.aura_head.visible).toBe(true);expect(pose.aura_body.visible).toBe(true);
    const a=h.spawn('arrow',0,61,0,{data:{owner:'mob'}});kind(h,'arrow').model!.animate!(a,pose,{...state,headPitch:-.4});
    expect(pose.arrow.x).toBeCloseTo(-.4,5);
  });
  test('a swelling creeper flashes and puffs up',()=>{
    const look={flash:0,scale:1};
    expect(creeperLook(0,look)).toEqual({flash:0,scale:1});
    creeperLook(28,look);expect(look.scale).toBeGreaterThan(1.2);
    const flashes=new Set<number>();for(let s=1;s<=28;s++)flashes.add(creeperLook(s,look).flash);
    expect(flashes.has(0)).toBe(true);expect([...flashes].some(f=>f>=.5)).toBe(true);
    const h=createHarness(),c=h.spawn('creeper',0,60,0);
    expect(kind(h,'creeper').model!.appearance!(c)).toMatchObject({flash:0,scale:1});
  });
});

describe('zombie AI',()=>{
  test('vanilla ground speeds from the movement attribute',()=>{
    expect(mobSpeed(.23)).toBeCloseTo(2.33,1);expect(mobSpeed(.25,.8)).toBeCloseTo(1.76,1);expect(mobSpeed(.23*1.5)).toBeCloseTo(5.24,1);expect(mobSpeed(.3)).toBeCloseTo(3.96,1);
    const h=createHarness(),z=h.spawn('zombie',0,60,0),baby=h.spawn('zombie',2,60,0,{baby:true});
    expect(zombieSpeed(z)).toBeCloseTo(2.33,1);expect(zombieSpeed(baby)).toBeCloseTo(5.24,1);
  });
  test('acquires a visible survival player within 35 blocks and walks toward them at about 2.3 blocks/s',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const z=h.spawn('zombie',.5,60,30.5);
    until(h,()=>z.data.aggressive===true,60);
    const z0=z.z;h.game.runTicks(40);
    expect(z.data.aggressive).toBe(true);
    const speed=(z0-z.z)/2;expect(speed).toBeGreaterThan(1.9);expect(speed).toBeLessThan(2.5);
  });
  test('ignores creative players, players beyond follow range and hidden players',()=>{
    for(const setup of ['creative','far','hidden'] as const){
      const h=createHarness({mode:setup==='creative'?'creative':'survival'});night(h.game);onGround(h);
      const z=h.spawn('zombie',.5,60,setup==='far'?36.5:10.5);
      if(setup==='hidden')fill(h,-4,60,5,4,63,5,B.stone);
      h.game.runTicks(80);
      expect(z.data.aggressive,setup).toBeFalsy();expect(h.hurt).toHaveLength(0);
    }
  });
  test('forgets a target that stays out of sight for 3 seconds',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const z=h.spawn('zombie',.5,60,12.5);
    until(h,()=>z.data.aggressive===true,80);
    h.game.player.teleport(.5,60,-20.5);fill(h,-6,60,-8,6,64,-8,B.stone);
    h.game.runTicks(70);
    expect(z.data.aggressive).toBeFalsy();
  });
  test('melee deals the base 3 damage with knockback once every 20 ticks',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const z=h.spawn('zombie',.5,60,1.7);
    until(h,()=>h.hurt.length>0,80);
    expect(h.hurt).toHaveLength(1);
    const first=h.hurt[0];
    expect(first.amount).toBe(3);expect(first.source).toMatchObject({kind:'mob',attacker:z});
    expect(first.source.knockback!.z).toBeLessThan(0);expect(first.source.knockback!.strength).toBe(KNOCKBACK);
    expect(z.data.swing).toBe(10);
    h.game.runTicks(40);
    expect(h.hurt).toHaveLength(3);
  });
  test('passes base damage at every difficulty (survival scales it) and peaceful removes hostiles',()=>{
    for(const difficulty of ['easy','normal','hard'] as const){
      const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty=difficulty;
      h.spawn('zombie',.5,60,1.7);until(h,()=>h.hurt.length>0,80);
      expect(h.hurt[0]?.amount,difficulty).toBe(3);
    }
    expect([difficultyScaled(createHarness().game,3)]).toEqual([3]);
    const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty='peaceful';
    const z=h.spawn('zombie',.5,60,1.7);h.game.runTicks(2);
    expect(z.removed).toBe(true);expect(h.hurt).toHaveLength(0);
  });
  test('a raised shield facing the zombie blocks the hit, wears the shield by difficulty and pushes the zombie back',()=>{
    for(const [difficulty,wear] of [['normal',4],['hard',5],['easy',0]] as const){
      const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty=difficulty;
      h.game.inventory.setSlot(0,{id:'shield',count:1});h.setUsing('shield');
      h.game.player.state.yaw=Math.PI;// looking south (+z) at the zombie
      const z=h.spawn('zombie',.5,60,1.7);
      until(h,()=>typeof z.data.swing==='number',60);
      expect(h.hurt,difficulty).toHaveLength(0);expect(h.wear,difficulty).toEqual(wear?[wear]:[]);expect(z.vz).toBeGreaterThan(3);
      h.game.player.state.yaw=0;// turned away
      h.game.runTicks(40);
      expect(h.hurt.length).toBeGreaterThan(0);
    }
  });
  test('husk hits inflict Hunger for 7 seconds per difficulty level',()=>{
    for(const [difficulty,seconds] of [['easy',7],['normal',14],['hard',21]] as const){
      const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty=difficulty;
      h.spawn('husk',.5,60,1.7);until(h,()=>h.hurt.length>0,80);
      expect(h.effects[0]).toEqual({name:'hunger',seconds,level:1});
    }
  });
  test('a burning zombie can set its target alight (2 s per whole regional difficulty)',()=>{
    const h=createHarness({random:()=>0});night(h.game);onGround(h);
    const z=h.spawn('zombie',.5,60,1.7);z.fire=200;
    until(h,()=>h.hurt.length>0,80);
    expect(h.ignited).toEqual([2]);
    const cold=createHarness({random:()=>0});night(cold.game);onGround(cold);
    cold.spawn('zombie',.5,60,1.7);until(cold,()=>cold.hurt.length>0,80);
    expect(cold.ignited).toEqual([]);
  });
  test('5% of naturally spawned zombies are fast, small babies',()=>{
    const h=createHarness({random:sequence([.01])});
    const baby=h.spawn('zombie',0,60,0,{reason:'natural'});
    expect(baby.baby).toBe(true);expect(baby.width).toBe(.3);expect(baby.height).toBeCloseTo(.975);
    const xp=kind(h,'zombie').xp as (e:Entity)=>number;
    expect(xp(baby)).toBe(12);
    const h2=createHarness({random:sequence([.2])}),adult=h2.spawn('zombie',0,60,0,{reason:'natural'});
    expect(adult.baby).toBe(false);expect(xp(adult)).toBe(5);
    const converted=createHarness({random:sequence([.01])}).spawn('zombie',0,60,0,{reason:'convert'});
    expect(converted.baby).toBe(false);
  });
  test('a hit from another mob turns the zombie on that mob',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    const z=h.spawn('zombie',.5,60,.5),s=h.spawn('skeleton',.5,60,8.5);
    h.game.entities.damage(z,2,{kind:'projectile',attacker:s});
    h.game.runTicks(40);
    expect(z.data.aggressive).toBe(true);expect(z.z).toBeGreaterThan(2);
  });
  test('hurting a zombie alerts the zombie-kin nearby (not skeletons)',()=>{
    const h=createHarness();night(h.game);onGround(h);
    fill(h,-6,60,4,6,64,4,B.stone);// hide the player from all of them
    const z=h.spawn('zombie',.5,60,10.5),husk=h.spawn('husk',8.5,60,14.5),far=h.spawn('zombie',.5,60,47.5),s=h.spawn('skeleton',-6.5,60,12.5);
    h.game.entities.damage(z,1,{kind:'player',byPlayer:true});
    h.game.runTicks(2);
    expect(z.data.aggressive).toBe(true);expect(husk.data.aggressive).toBe(true);
    expect(far.data.aggressive).toBeFalsy();expect(s.data.aggressive).toBeFalsy();
  });
  test('does not walk into lava while chasing',()=>{
    const h=createHarness();night(h.game);onGround(h);
    fill(h,-4,60,5,4,60,5,B.lava);
    const z=h.spawn('zombie',.5,60,9.5);
    h.game.runTicks(120);
    expect(z.data.aggressive).toBe(true);expect(z.z).toBeGreaterThan(6);expect(z.inLava).toBe(false);
  });
});

describe('daylight',()=>{
  test('the undead burn in daylight through the entity service (burnsInDaylight); husks, creepers and spiders do not',()=>{
    const h=createHarness();
    expect(HOSTILE_MOBS.filter(n=>kind(h,n).burnsInDaylight)).toEqual(['zombie','drowned','skeleton','stray']);
    expect(HOSTILE_MOBS.filter(n=>kind(h,n).fireImmune)).toEqual([]);
  });
  test('a skeleton burning in the sun without a target walks into shade',()=>{
    const h=createHarness({mode:'creative'});noon(h.game);
    fill(h,4,62,-3,9,62,3,B.stone);
    const s=h.spawn('skeleton',.5,60,.5);
    for(let i=0;i<160&&s.x<4.2;i++){s.fire=100;h.game.runTicks(1);}
    expect(s.x).toBeGreaterThan(4.2);
  });
  test('by day a drowned on land heads back into the water',()=>{
    const h=createHarness({mode:'creative'});noon(h.game);
    fill(h,6,59,-3,9,59,3,B.water);
    const d=h.spawn('drowned',.5,60,.5);
    until(h,()=>d.inWater,240);
    expect(d.inWater).toBe(true);
  });
});

describe('conversion',()=>{
  test('a zombie submerged for 30 s starts converting and becomes a drowned 15 s later',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    fill(h,-2,60,-2,3,64,3,B.water);
    const z=h.spawn('zombie',.5,60,.5,{baby:true});
    h.game.runTicks(600);
    expect(typeof z.data.converting).toBe('number');expect(h.spawned.some(s=>s.entity.kind==='drowned')).toBe(false);
    h.game.runTicks(305);
    const d=h.spawned.find(s=>s.entity.kind==='drowned');
    expect(d?.reason).toBe('convert');expect(d?.entity.baby).toBe(true);expect(z.removed).toBe(true);
  });
  test('leaving the water resets the timer; husks become zombies; drowned stay',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    fill(h,-2,60,-2,3,64,3,B.water);
    const z=h.spawn('zombie',.5,60,.5);h.game.runTicks(500);
    fill(h,-2,60,-2,3,64,3,AIR);h.game.runTicks(5);
    fill(h,-2,60,-2,3,64,3,B.water);h.game.runTicks(500);
    expect(z.data.converting).toBeUndefined();
    const k=createHarness({mode:'creative'});night(k.game);fill(k,-2,60,-2,3,64,3,B.water);
    const husk=k.spawn('husk',.5,60,.5),drowned=k.spawn('drowned',1.5,60,1.5);
    k.game.runTicks(905);
    expect(husk.removed).toBe(true);expect(k.spawned.filter(s=>s.reason==='convert').map(s=>s.entity.kind)).toEqual(['zombie']);
    expect(drowned.removed).toBe(false);
  });
});

describe('drowned',()=>{
  test('hunts only swimmers by day but anyone at night, and swims up toward them',()=>{
    const day=createHarness();noon(day.game);onGround(day);
    const a=day.spawn('drowned',.5,60,5.5);day.game.runTicks(60);
    expect(a.data.aggressive).toBeFalsy();
    const swim=createHarness();noon(swim.game);onGround(swim);swim.game.player.state.inWater=true;
    const b=swim.spawn('drowned',.5,60,5.5);swim.game.runTicks(60);
    expect(b.data.aggressive).toBe(true);
    swim.game.player.state.inWater=false;swim.game.runTicks(2);
    expect(b.data.aggressive).toBeFalsy();
    const pool=createHarness();night(pool.game);
    fill(pool,-4,60,-4,4,72,4,B.water);pool.game.player.teleport(.5,69,.5);pool.game.player.state.inWater=true;
    const c=pool.spawn('drowned',2.5,60,2.5);pool.game.runTicks(60);
    expect(c.data.aggressive).toBe(true);expect(c.y).toBeGreaterThan(62);
  });
});

describe('creeper',()=>{
  test('swell direction follows the vanilla SwellGoal rules',()=>{
    expect(creeperSwellDir(true,2.5,true,false,false)).toBe(1);
    expect(creeperSwellDir(true,5,true,false,false)).toBe(-1);// not yet started: keeps approaching
    expect(creeperSwellDir(true,5,true,true,false)).toBe(1);// already swelling: keeps going within 7
    expect(creeperSwellDir(true,7.5,true,true,false)).toBe(-1);
    expect(creeperSwellDir(true,2,false,true,false)).toBe(-1);
    expect(creeperSwellDir(false,0,false,false,true)).toBe(1);// ignited
    expect(CREEPER_FUSE).toBe(30);
  });
  test('approaches silently, hisses within 3 blocks and explodes with power 3 after 1.5 s',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const c=h.spawn('creeper',.5,60,9.5);
    until(h,()=>((c.data.swell as number)??0)>0,160);
    expect(dist(c,h)).toBeLessThan(3.1);expect(h.sounds()).toEqual(['fuse']);
    const at=c.z,ticks=until(h,()=>h.explosions.length>0,60);
    expect(ticks).toBe(CREEPER_FUSE-1);expect(Math.abs(c.z-at)).toBeLessThan(.3);// stood still while swelling
    expect(h.explosions[0]).toMatchObject({power:3,source:c,byPlayer:false,fire:false});expect(c.removed).toBe(true);
    expect(h.hurt).toHaveLength(0);// the blast is the explosion's business
  });
  test('charged creepers blast twice as hard',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const c=h.spawn('creeper',.5,60,3,{data:{charged:true}});
    expect(explosionPower(c)).toBe(6);
    until(h,()=>h.explosions.length>0,120);
    expect(h.explosions[0].power).toBe(6);
  });
  test('defuses when the player escapes beyond 7 blocks',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const c=h.spawn('creeper',.5,60,3);
    until(h,()=>((c.data.swell as number)??0)>=10,120);
    h.game.player.teleport(.5,60,3+7.6);
    h.game.runTicks(10);
    expect(c.data.swell).toBe(0);expect(h.explosions).toHaveLength(0);
  });
  test('flint and steel ignites it whatever the distance',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    const c=h.spawn('creeper',20.5,60,20.5);
    expect(kind(h,'creeper').interact!(c,h.game,{id:'stick',count:1})).toBe(false);
    expect(kind(h,'creeper').interact!(c,h.game,{id:'flint_and_steel',count:1})).toBe(true);
    expect(h.sounds()).toContain('ignite');expect(h.wear).toEqual([1]);
    h.game.runTicks(CREEPER_FUSE+1);
    expect(h.explosions).toHaveLength(1);
  });
  test('a fall swells it (1.5 ticks per block, at most 25), then it relaxes',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    const c=h.spawn('creeper',.5,70,.5);
    until(h,()=>c.onGround,60);h.game.runTicks(1);
    expect(c.data.swell).toBe(14);// floor(10 × 1.5) − 1 relaxed the same tick
    h.game.runTicks(20);expect(c.data.swell).toBe(0);expect(h.explosions).toHaveLength(0);
  });
  test('restored data keeps only valid fields',()=>{
    const h=createHarness();
    expect(kind(h,'creeper').restoreData!({charged:'yes',swell:5,junk:1})).toEqual({swell:5});
    expect(kind(h,'creeper').restoreData!({charged:true,swell:99})).toEqual({charged:true});
    expect(kind(h,'zombie').restoreData!({converting:120,aggressive:true})).toEqual({converting:120});
  });
});

describe('skeleton',()=>{
  test('difficulty sets spread, bow interval and strafing speed',()=>{
    expect([skeletonInaccuracy('easy'),skeletonInaccuracy('normal'),skeletonInaccuracy('hard')]).toEqual([10,6,2]);
    expect([bowInterval('easy'),bowInterval('normal'),bowInterval('hard')]).toEqual([40,40,20]);
    expect(bowPower(20)).toBe(1);expect(bowPower(10)).toBeCloseTo(5/12,5);
    expect(STRAFE_SPEED).toBeCloseTo(1.95,2);
  });
  function shots(difficulty:'normal'|'hard',kindName='skeleton'){
    const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty=difficulty;
    const s=h.spawn(kindName,.5,60,10.5);h.game.runTicks(200);
    return {h,s,arrows:h.spawned.filter(x=>x.entity.kind==='arrow').map(x=>x.entity)};
  }
  test('shoots aimed mob arrows every 3 s on normal and every 2 s on hard',()=>{
    const normal=shots('normal'),hard=shots('hard');
    expect(normal.arrows.length).toBeGreaterThanOrEqual(2);expect(normal.arrows.length).toBeLessThanOrEqual(4);
    expect(hard.arrows.length).toBeGreaterThan(normal.arrows.length);
    const a=normal.arrows[0];
    expect(a.data).toMatchObject({owner:'mob',ownerId:normal.s.id,pickup:false,crit:false});
    expect(a.data.damage as number).toBeGreaterThan(1.4);expect(a.data.damage as number).toBeLessThan(3);
    expect(normal.h.sounds()).toContain('bow');
    expect(normal.h.hurt.length).toBeGreaterThan(0);expect(normal.h.hurt[0].source).toMatchObject({kind:'projectile',attacker:normal.s});
  });
  test('stray arrows carry Slowness',()=>{
    const {arrows,h}=shots('normal','stray');
    expect(arrows[0].data).toMatchObject({effect:'slowness',effectSeconds:30});
    expect(h.effects.some(e=>e.name==='slowness'&&e.seconds===30)).toBe(true);
  });
  test('backs off when the player is too close and closes in from long range',()=>{
    const near=createHarness({random:sequence([],.05)});night(near.game);onGround(near);
    const a=near.spawn('skeleton',.5,60,4.5);near.game.runTicks(90);
    expect(dist(a,near)).toBeGreaterThan(5);
    const far=createHarness();night(far.game);onGround(far);
    const b=far.spawn('skeleton',.5,60,15.8);far.game.runTicks(100);
    expect(dist(b,far)).toBeLessThan(15);
  });
  test('runs from wolves and holds its fire meanwhile',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const s=h.spawn('skeleton',.5,60,10.5);h.spawn('wolf',.5,60,13.5);
    h.game.runTicks(25);
    expect(s.z).toBeLessThan(9.5);expect(h.spawned.some(x=>x.entity.kind==='arrow')).toBe(false);
  });
});

describe('spider',()=>{
  test('is neutral in bright light until attacked, hostile in the dark',()=>{
    const h=createHarness();noon(h.game);onGround(h);
    const s=h.spawn('spider',.5,60,5.5);h.game.runTicks(60);
    expect(spiderCalm(h.game,s)).toBe(true);expect(s.data.aggressive).toBeFalsy();
    h.game.entities.damage(s,1,{kind:'player',byPlayer:true});h.game.runTicks(5);
    expect(s.data.aggressive).toBe(true);
    const d=createHarness();night(d.game);onGround(d);
    const t=d.spawn('spider',.5,60,5.5);d.game.runTicks(60);
    expect(spiderCalm(d.game,t)).toBe(false);expect(t.data.aggressive).toBe(true);
  });
  test('climbs walls toward its target',()=>{
    const h=createHarness();night(h.game);
    fill(h,-4,60,3,4,62,3,B.stone);h.game.player.teleport(.5,63,3.5);
    const s=h.spawn('spider',.5,60,8.5);let top=0;
    for(let i=0;i<120;i++){h.game.runTicks(1);top=Math.max(top,s.y);}
    expect(top).toBeGreaterThanOrEqual(62);expect(CLIMB_SPEED).toBeCloseTo(2.35,2);
  });
  test('pounces when 2 to 4 blocks away and bites for 2',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const s=h.spawn('spider',.5,60,3.6);let top=0;
    for(let i=0;i<40;i++){h.game.runTicks(1);top=Math.max(top,s.y);}
    expect(top).toBeGreaterThan(60.5);
    expect(h.hurt[0]).toMatchObject({amount:2,source:{kind:'mob',attacker:s}});
  });
});

describe('drops',()=>{
  function tally(h:Harness,name:string,byPlayer:boolean,trials=3000){
    const k=kind(h,name),e=h.spawn(name,0,60,0),out=new Map<string,number>(),per=new Map<string,number>();
    for(let i=0;i<trials;i++)for(const s of k.drops!(e,h.game,byPlayer)){
      out.set(s.id,(out.get(s.id)??0)+s.count);per.set(s.id,Math.max(per.get(s.id)??0,s.count));
      expect(s.count).toBeGreaterThan(0);
    }
    return {out,per,trials};
  }
  test('zombies: 0-2 rotten flesh, rare iron/carrot/potato only for player kills',()=>{
    const h=createHarness(),plain=tally(h,'zombie',false),player=tally(h,'zombie',true);
    expect(plain.per.get('rotten_flesh')).toBe(2);expect(plain.out.get('rotten_flesh')!/plain.trials).toBeCloseTo(1,1);
    for(const id of ['iron_ingot','carrot','potato'])expect(plain.out.get(id)).toBeUndefined();
    const rare=['iron_ingot','carrot','potato'].reduce((n,id)=>n+(player.out.get(id)??0),0)/player.trials;
    expect(rare).toBeGreaterThan(.012);expect(rare).toBeLessThan(.04);
    for(const id of ['iron_ingot','carrot','potato'])expect(player.out.get(id),id).toBeGreaterThan(0);
  });
  test('drowned drop copper only for player kills; spiders drop eyes only for player kills',()=>{
    const h=createHarness();
    expect(tally(h,'drowned',false).out.get('copper_ingot')).toBeUndefined();
    const copper=tally(h,'drowned',true).out.get('copper_ingot')!/3000;expect(copper).toBeGreaterThan(.08);expect(copper).toBeLessThan(.14);
    expect(tally(h,'spider',false).out.get('spider_eye')).toBeUndefined();
    const eyes=tally(h,'spider',true).out.get('spider_eye')!/3000;expect(eyes).toBeGreaterThan(.28);expect(eyes).toBeLessThan(.39);
  });
  test('skeletons, creepers and spiders drop their vanilla materials',()=>{
    const h=createHarness();
    const s=tally(h,'skeleton',false);expect(s.per.get('bone')).toBe(2);expect(s.per.get('arrow')).toBe(2);
    const c=tally(h,'creeper',false);expect(c.per.get('gunpowder')).toBe(2);expect(c.out.get('gunpowder')!/c.trials).toBeCloseTo(1,1);
    expect(tally(h,'spider',false).per.get('string')).toBe(2);
    expect(tally(h,'stray',false).per.get('bone')).toBe(2);
    expect(tally(h,'husk',false).per.get('rotten_flesh')).toBe(2);
  });
  test('a mob killed in the harness drops its loot through the entity service',()=>{
    const h=createHarness({mode:'creative'}),c=h.spawn('creeper',0,60,0);
    h.game.entities.damage(c,25,{kind:'player',byPlayer:true});
    expect(c.deathTime).toBe(1);expect(h.drops.every(d=>d.id==='gunpowder')).toBe(true);
  });
});
