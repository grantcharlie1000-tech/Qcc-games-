import {describe,expect,test} from 'vitest';
import {AIR,B} from '../../../src/games/blockcraft/data/blocks';
import {mobSpeed,KNOCKBACK} from '../../../src/games/blockcraft/entity/hostile-ai';
import {creeperSwellDir,CREEPER_FUSE} from '../../../src/games/blockcraft/entity/hostile-creeper';
import {skeletonInaccuracy,bowInterval} from '../../../src/games/blockcraft/entity/hostile-skeletons';
import {HOSTILE_MOBS} from '../../../src/games/blockcraft/entity/hostile';
import type {AnimationState,Entity,EntityKind,PartPose} from '../../../src/games/blockcraft/engine/contracts';
import {createHarness,night,noon,sequence,type Harness} from './hostile-harness';

const kind=(h:Harness,name:string)=>h.game.entities.kind(name) as EntityKind;
const dist=(e:Entity,h:Harness)=>{const p=h.game.player.state;return Math.hypot(e.x-p.x,e.z-p.z);};
function fill(h:Harness,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)h.game.world.set(x,y,z,id);
}
function onGround(h:Harness){h.game.player.teleport(.5,60,.5);}
/** Runs single ticks until `done` holds (or `max` ticks pass); returns the ticks run. */
function until(h:Harness,done:()=>boolean,max:number){let n=0;while(n<max&&!done()){h.game.runTicks(1);n++;}return n;}

describe('registration',()=>{
  test('every hostile mob is registered with vanilla stats, sounds and spawn settings',()=>{
    const h=createHarness();
    expect([...HOSTILE_MOBS]).toEqual(['zombie','husk','drowned','skeleton','stray','creeper','spider']);
    for(const name of HOSTILE_MOBS){
      const k=kind(h,name);
      expect(k.category).toBe('hostile');expect(k.model).toBeDefined();expect(k.despawns).toBe(true);
      expect(k.spawn?.light).toBe('dark');expect(k.sounds?.name).toBe(name);
    }
    expect(kind(h,'zombie').maxHealth).toBe(20);expect(kind(h,'spider').maxHealth).toBe(16);expect(kind(h,'creeper').maxHealth).toBe(20);
    expect([kind(h,'spider').width,kind(h,'spider').height]).toEqual([1.4,.9]);expect(kind(h,'creeper').height).toBe(1.7);
    expect(kind(h,'husk').spawn).toMatchObject({replaces:'zombie'});expect(kind(h,'husk').spawn?.biomes?.map(b=>b[0])).toContain('desert');
    expect(kind(h,'stray').spawn).toMatchObject({replaces:'skeleton'});expect(kind(h,'stray').spawn?.biomes?.map(b=>b[0])).toContain('snowy_plains');
    expect(kind(h,'drowned').spawn?.biomes?.map(b=>b[0])).toEqual(expect.arrayContaining(['river','ocean']));
    expect(kind(h,'drowned').aquatic).toBe(true);
    for(const n of ['zombie','drowned','skeleton','stray'])expect(kind(h,n).burnsInDaylight).toBe(true);
    for(const n of ['husk','creeper','spider'])expect(kind(h,n).burnsInDaylight).toBeFalsy();
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
    }
  });
});

describe('models',()=>{
  const state:AnimationState={time:1.3,partial:.4,limbSwing:2,limbAmount:.8,headYaw:.3,headPitch:-.2,attack:0,reducedMotion:false};
  test('every box UV fits its texture and is painted, and animate poses parts with finite values',()=>{
    const h=createHarness();
    for(const name of [...HOSTILE_MOBS,'arrow']){
      const k=kind(h,name),m=k.model!,px=new Uint8ClampedArray(m.textureWidth*m.textureHeight*4);
      m.paint(px,m.textureWidth,m.textureHeight);
      const names=new Set<string>();
      for(const part of m.parts){
        expect(names.has(part.name),`${name}.${part.name} unique`).toBe(false);names.add(part.name);
        for(const b of part.boxes){
          const [w,hh,d]=b.size.map(Math.ceil),[u,v]=b.uv;
          expect(u+2*d+2*w,`${name}.${part.name} width`).toBeLessThanOrEqual(m.textureWidth);
          expect(v+d+hh,`${name}.${part.name} height`).toBeLessThanOrEqual(m.textureHeight);
          let opaque=0;for(let y=v+d;y<v+d+hh;y++)for(let x=u+d;x<u+d+w;x++)if(px[(y*m.textureWidth+x)*4+3]>0)opaque++;
          if(!part.name.startsWith('aura'))expect(opaque,`${name}.${part.name} front painted`).toBeGreaterThan(0);
        }
      }
      const e=h.spawn(name,0,61,0,{data:name==='arrow'?{owner:'mob'}:{}});
      const pose:Record<string,PartPose>={};
      m.animate?.(e,pose,state);
      for(const [part,p] of Object.entries(pose)){
        expect(names.has(part),`${name} poses known part ${part}`).toBe(true);
        for(const v of [p.x,p.y,p.z])expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  test('zombies raise their arms higher when chasing; creeper aura shows only when charged',()=>{
    const h=createHarness(),z=h.spawn('zombie',0,60,0),m=kind(h,'zombie').model!,pose:Record<string,PartPose>={};
    m.animate!(z,pose,state);const idle=pose.right_arm.x;
    z.data.aggressive=true;m.animate!(z,pose,state);
    expect(pose.right_arm.x).toBeGreaterThan(idle+.5);
    const c=h.spawn('creeper',0,60,0),cm=kind(h,'creeper').model!;
    cm.animate!(c,pose,state);expect(pose.aura_head.visible).toBe(false);
    c.data.charged=true;cm.animate!(c,pose,state);expect(pose.aura_head.visible).toBe(true);
  });
});

describe('zombie AI',()=>{
  test('vanilla ground speeds from the movement attribute',()=>{
    expect(mobSpeed(.23)).toBeCloseTo(2.33,1);expect(mobSpeed(.25,.8)).toBeCloseTo(1.76,1);expect(mobSpeed(.23*1.5)).toBeCloseTo(5.24,1);expect(mobSpeed(.3)).toBeCloseTo(3.96,1);
  });
  test('acquires a visible survival player within 35 blocks and walks toward them',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const z=h.spawn('zombie',.5,60,12.5);
    h.game.runTicks(60);
    expect(z.data.aggressive).toBe(true);expect(z.z).toBeLessThan(9);
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
  test('melee deals the base 3 damage with knockback once every 20 ticks',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const z=h.spawn('zombie',.5,60,1.7);
    until(h,()=>h.hurt.length>0,80);
    expect(h.hurt).toHaveLength(1);
    const first=h.hurt[0];
    expect(first.amount).toBe(3);expect(first.source).toMatchObject({kind:'mob',attacker:z});
    expect(first.source.knockback!.z).toBeLessThan(0);expect(first.source.knockback!.strength).toBe(KNOCKBACK);
    h.game.runTicks(40);
    expect(h.hurt).toHaveLength(3);
  });
  test('passes base damage at every difficulty (survival scales it) and peaceful removes hostiles',()=>{
    for(const difficulty of ['easy','normal','hard'] as const){
      const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty=difficulty;
      h.spawn('zombie',.5,60,1.7);until(h,()=>h.hurt.length>0,80);
      expect(h.hurt[0]?.amount,difficulty).toBe(3);
    }
    const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty='peaceful';
    const z=h.spawn('zombie',.5,60,1.7);h.game.runTicks(2);
    expect(z.removed).toBe(true);expect(h.hurt).toHaveLength(0);
  });
  test('a raised shield facing the zombie blocks the hit and wears the shield',()=>{
    const h=createHarness();night(h.game);onGround(h);
    h.game.inventory.setSlot(0,{id:'shield',count:1});h.setUsing('shield');
    h.game.player.state.yaw=Math.PI;// looking south (+z) at the zombie
    h.spawn('zombie',.5,60,1.7);
    h.game.runTicks(60);
    expect(h.hurt).toHaveLength(0);expect(h.wear.length).toBeGreaterThan(0);expect(h.wear[0]).toBe(4);
    h.game.player.state.yaw=0;// turned away
    h.game.runTicks(30);
    expect(h.hurt.length).toBeGreaterThan(0);
  });
  test('husk hits inflict Hunger for 7 seconds per difficulty level',()=>{
    for(const [difficulty,seconds] of [['easy',7],['normal',14],['hard',21]] as const){
      const h=createHarness();night(h.game);onGround(h);h.game.settings.difficulty=difficulty;
      h.spawn('husk',.5,60,1.7);until(h,()=>h.hurt.length>0,80);
      expect(h.effects[0]).toEqual({name:'hunger',seconds,level:1});
    }
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
  test('does not walk into lava while chasing',()=>{
    const h=createHarness();night(h.game);onGround(h);
    fill(h,-4,60,5,4,60,5,B.lava);
    const z=h.spawn('zombie',.5,60,9.5);
    h.game.runTicks(120);
    expect(z.data.aggressive).toBe(true);expect(z.z).toBeGreaterThan(6);expect(z.inLava).toBe(false);
  });
});

describe('daylight burning',()=>{
  function burnTest(name:string,setup:(h:Harness)=>void=()=>{}){
    const h=createHarness({mode:'creative'});noon(h.game);setup(h);
    const e=h.spawn(name,5.5,60,5.5);h.game.runTicks(200);
    return e.fire;
  }
  test('zombies, drowned, skeletons and strays ignite in open sunlight',()=>{
    for(const name of ['zombie','drowned','skeleton','stray'])expect(burnTest(name),name).toBeGreaterThan(0);
  });
  test('husks, creepers and spiders never burn',()=>{
    for(const name of ['husk','creeper','spider'])expect(burnTest(name),name).toBe(0);
  });
  test('shade, water, rain and night protect',()=>{
    expect(burnTest('zombie',h=>fill(h,2,63,2,9,63,9,B.stone))).toBe(0);
    expect(burnTest('zombie',h=>fill(h,3,60,3,8,60,8,B.water))).toBe(0);
    expect(burnTest('zombie',h=>{h.game.weather.isRainingOn=()=>true;})).toBe(0);
    expect(burnTest('zombie',h=>night(h.game))).toBe(0);
  });
});

describe('conversion',()=>{
  test('a zombie submerged for 30 s starts converting and becomes a drowned 15 s later',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    fill(h,-2,60,-2,3,64,3,B.water);
    const z=h.spawn('zombie',.5,60,.5);
    h.game.runTicks(600);
    expect(typeof z.data.converting).toBe('number');expect(h.spawned.some(s=>s.entity.kind==='drowned')).toBe(false);
    h.game.runTicks(305);
    const d=h.spawned.find(s=>s.entity.kind==='drowned');
    expect(d?.reason).toBe('convert');expect(z.removed).toBe(true);
  });
  test('leaving the water resets the timer',()=>{
    const h=createHarness({mode:'creative'});night(h.game);
    fill(h,-2,60,-2,3,64,3,B.water);
    const z=h.spawn('zombie',.5,60,.5);h.game.runTicks(500);
    fill(h,-2,60,-2,3,64,3,AIR);h.game.runTicks(5);
    fill(h,-2,60,-2,3,64,3,B.water);h.game.runTicks(500);
    expect(z.data.converting).toBeUndefined();
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
  test('hisses within 3 blocks and explodes with power 3 after 1.5 s',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const c=h.spawn('creeper',.5,60,3);
    until(h,()=>((c.data.swell as number)??0)>0,80);
    expect(h.sounds()).toContain('fuse');
    const ticks=until(h,()=>h.explosions.length>0,60);
    expect(ticks).toBe(CREEPER_FUSE-1);
    expect(h.explosions[0]).toMatchObject({power:3,source:c});expect(c.removed).toBe(true);
  });
  test('charged creepers blast twice as hard',()=>{
    const h=createHarness();night(h.game);onGround(h);
    h.spawn('creeper',.5,60,3,{data:{charged:true}});
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
    expect(kind(h,'creeper').interact!(c,h.game,{id:'flint_and_steel',count:1})).toBe(true);
    expect(h.sounds()).toContain('ignite');expect(h.wear).toEqual([1]);
    h.game.runTicks(CREEPER_FUSE+1);
    expect(h.explosions).toHaveLength(1);
  });
  test('restored data keeps only valid fields',()=>{
    const h=createHarness();
    expect(kind(h,'creeper').restoreData!({charged:'yes',swell:5,junk:1})).toEqual({swell:5});
    expect(kind(h,'creeper').restoreData!({charged:true,swell:99})).toEqual({charged:true});
  });
});

describe('skeleton',()=>{
  test('difficulty sets spread and bow interval',()=>{
    expect([skeletonInaccuracy('easy'),skeletonInaccuracy('normal'),skeletonInaccuracy('hard')]).toEqual([10,6,2]);
    expect([bowInterval('easy'),bowInterval('normal'),bowInterval('hard')]).toEqual([40,40,20]);
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
    expect(normal.arrows[0].data).toMatchObject({owner:'mob',ownerId:normal.s.id,pickup:false});
    expect(normal.h.sounds()).toContain('bow');
    expect(normal.h.hurt.length).toBeGreaterThan(0);expect(normal.h.hurt[0].source.kind).toBe('projectile');
  });
  test('stray arrows carry Slowness',()=>{
    const {arrows}=shots('normal','stray');
    expect(arrows[0].data.effect).toBe('slowness');
  });
  test('backs off when the player is too close and closes in from long range',()=>{
    const near=createHarness({random:sequence([],.05)});night(near.game);onGround(near);
    const a=near.spawn('skeleton',.5,60,4.5);near.game.runTicks(90);
    expect(dist(a,near)).toBeGreaterThan(5);
    const far=createHarness();night(far.game);onGround(far);
    const b=far.spawn('skeleton',.5,60,15.8);far.game.runTicks(100);
    expect(dist(b,far)).toBeLessThan(15);
  });
});

describe('spider',()=>{
  test('is neutral in daylight until attacked, hostile in the dark',()=>{
    const h=createHarness();noon(h.game);onGround(h);
    const s=h.spawn('spider',.5,60,5.5);h.game.runTicks(60);
    expect(s.data.aggressive).toBeFalsy();
    h.game.entities.damage(s,1,{kind:'player',byPlayer:true});h.game.runTicks(5);
    expect(s.data.aggressive).toBe(true);
    const d=createHarness();night(d.game);onGround(d);
    const t=d.spawn('spider',.5,60,5.5);d.game.runTicks(60);
    expect(t.data.aggressive).toBe(true);
  });
  test('climbs walls toward its target',()=>{
    const h=createHarness();night(h.game);
    fill(h,-4,60,3,4,62,3,B.stone);h.game.player.teleport(.5,63,3.5);
    const s=h.spawn('spider',.5,60,8.5);let top=0;
    for(let i=0;i<120;i++){h.game.runTicks(1);top=Math.max(top,s.y);}
    expect(top).toBeGreaterThanOrEqual(62);
  });
  test('pounces when 2 to 4 blocks away',()=>{
    const h=createHarness();night(h.game);onGround(h);
    const s=h.spawn('spider',.5,60,3.6);let top=0;
    for(let i=0;i<40;i++){h.game.runTicks(1);top=Math.max(top,s.y);}
    expect(top).toBeGreaterThan(60.5);
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
  });
});
