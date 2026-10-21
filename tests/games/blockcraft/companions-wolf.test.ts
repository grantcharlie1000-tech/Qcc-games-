import {describe,expect,it} from 'vitest';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import type {Entity} from '../../../src/games/blockcraft/engine/contracts';
import {DYE_COLOURS,newWolfLook} from '../../../src/games/blockcraft/entity/companions-art';
import {BABY_TICKS,BREED_COOLDOWN,FOLLOW_STOP,LOVE_TICKS,TAME_CHANCE,TAME_HEALTH,WILD_HEALTH,WOLF_DAMAGE,angerOf,canTeleportTo,isSitting,isTame,
  lookOfWolf,restoreWolfData,tailAngle,tame,teleportToOwner,variantForBiome,wolfBrain} from '../../../src/games/blockcraft/entity/companions-wolf';
import {createHarness,dist,fill,sequence,until,type Harness} from './companions-harness';

function tamedWolf(h:Harness,x:number,z:number,sitting=false):Entity{
  const w=h.spawn('wolf',x,60,z,{data:{owner:'player',sitting}});
  expect(isTame(w)).toBe(true);
  return w;
}
const player=(h:Harness)=>h.game.player.state;

describe('wolf kind',()=>{
  it('registers the wolf and squid with vanilla sizes, health and spawning',()=>{
    const h=createHarness(),wolf=h.game.entities.kind('wolf')!,squid=h.game.entities.kind('squid')!;
    expect(wolf).toMatchObject({category:'passive',width:.6,height:.85,maxHealth:WILD_HEALTH,spawn:{light:'grass',group:[4,4]}});
    expect(wolf.sounds).toEqual({name:'wolf',ambient:false,step:true});
    expect(squid).toMatchObject({category:'water',width:.8,height:.8,maxHealth:10,aquatic:true,physics:{gravity:0},spawn:{light:'water',group:[1,4]}});
  });
  it('picks the vanilla variant for the biome and makes 5% of natural spawns puppies',()=>{
    expect(variantForBiome('forest')).toBe('woods');
    expect(variantForBiome('taiga')).toBe('pale');
    expect(variantForBiome('snowy_taiga')).toBe('ashen');
    expect(variantForBiome('plains')).toBe('pale');
    const h=createHarness({random:(()=>{let s=7;return()=>{s=(Math.imul(s,1103515245)+12345)>>>0;return s/2**32;};})()});
    let babies=0;
    for(let i=0;i<2000;i++){const w=h.spawn('wolf',.5,60,.5,{reason:'chunk'});if(w.baby)babies++;w.removed=true;}
    expect(babies/2000).toBeGreaterThan(.03);expect(babies/2000).toBeLessThan(.07);
    const pup=h.spawn('wolf',.5,60,.5,{baby:true});
    expect(pup.width).toBeCloseTo(.3);expect(pup.height).toBeCloseTo(.425);expect(pup.data.growth).toBe(-BABY_TICKS);
  });
});

describe('taming',()=>{
  it('tames with a bone one time in three: hearts, entityTamed, owner, sitting, 40 health and a red collar',()=>{
    const h=createHarness({random:sequence([.2])}),w=h.spawn('wolf',3.5,60,.5),tamed:Entity[]=[];
    h.game.events.on('entityTamed',({entity})=>tamed.push(entity));
    h.hold('bone',5);
    expect(h.use(w)).toBe(true);
    expect(tamed).toEqual([w]);
    expect(w.data).toMatchObject({owner:'player',sitting:true,collar:'red'});
    expect(w.maxHealth).toBe(TAME_HEALTH);expect(w.health).toBe(TAME_HEALTH);
    expect(h.particles.filter(p=>p.kind==='heart').reduce((n,p)=>n+(p.options?.count??1),0)).toBe(7);
    expect(h.game.inventory.held()).toEqual({id:'bone',count:4});
  });
  it('fails with smoke otherwise, and the odds are 1/3 per bone',()=>{
    const h=createHarness({random:sequence([.5])}),w=h.spawn('wolf',3.5,60,.5);
    h.hold('bone',5);
    expect(h.use(w)).toBe(true);
    expect(isTame(w)).toBe(false);
    expect(h.particles.some(p=>p.kind==='smoke')).toBe(true);
    expect(h.consumed).toBe(1);
    const r=createHarness();
    let ok=0;const n=3000;
    for(let i=0;i<n;i++){const x=r.spawn('wolf',.5,60,.5);r.hold('bone',1);r.use(x);if(isTame(x))ok++;x.removed=true;}
    expect(ok/n).toBeGreaterThan(TAME_CHANCE-.03);expect(ok/n).toBeLessThan(TAME_CHANCE+.03);
  });
  it('keeps bones in creative and refuses them while angry',()=>{
    const h=createHarness({mode:'creative',random:sequence([.9])}),w=h.spawn('wolf',3.5,60,.5);
    h.hold('bone',1);h.use(w);
    expect(h.game.inventory.held()).toEqual({id:'bone',count:1});
    w.data.anger=200;
    expect(h.use(w)).toBe(false);
  });
});

describe('sitting',()=>{
  it('toggles on right click with an empty hand (or any item it does not use) and stands up when hurt',()=>{
    const h=createHarness(),w=tamedWolf(h,2.5,.5);
    h.hold(null);
    expect(h.use(w)).toBe(true);expect(isSitting(w)).toBe(true);
    h.hold('stick');
    expect(h.use(w)).toBe(true);expect(isSitting(w)).toBe(false);
    h.use(w);expect(isSitting(w)).toBe(true);
    h.game.entities.damage(w,1,{kind:'cactus'});
    expect(isSitting(w)).toBe(false);
    // Wild wolves do not sit.
    const wild=h.spawn('wolf',5.5,60,.5);h.hold(null);
    expect(h.use(wild)).toBe(false);
  });
  it('a sitting wolf stays put however far the owner goes and is drawn sitting',()=>{
    const h=createHarness(),w=tamedWolf(h,.5,.5,true);
    h.run(5);
    player(h).x=30.5;
    h.run(120);
    expect(w.x).toBeCloseTo(.5,1);expect(w.z).toBeCloseTo(.5,1);
    const look=newWolfLook();lookOfWolf(w,1,look);
    expect(look.sitting).toBe(true);
  });
});

describe('following the owner',()=>{
  it('walks to the owner from 10 blocks and stops within 2',()=>{
    const h=createHarness(),w=tamedWolf(h,.5,.5);
    player(h).x=11.5;
    let maxStep=0,last={x:w.x,y:w.y,z:w.z};
    const n=until(h,()=>{const s=dist(w,last);maxStep=Math.max(maxStep,s);last={x:w.x,y:w.y,z:w.z};return Math.hypot(w.x-11.5,w.z-.5)<=FOLLOW_STOP+.5&&w.moveX===0;},200);
    expect(n).toBeLessThan(200);
    // Walked (no teleport): at most ~0.5 blocks a tick.
    expect(maxStep).toBeLessThan(.6);
    const at=w.x;h.run(40);
    expect(Math.abs(w.x-at)).toBeLessThan(.6);
  });
  it('teleports next to an owner 12+ blocks away onto a safe cell',()=>{
    const h=createHarness(),w=tamedWolf(h,.5,.5);
    player(h).x=40.5;player(h).z=.5;
    const n=until(h,()=>dist(w,player(h))<6,15);
    expect(n).toBeLessThan(15);
    const dx=Math.floor(w.x)-40,dz=Math.floor(w.z);
    expect(Math.max(Math.abs(dx),Math.abs(dz))).toBeGreaterThanOrEqual(2);
    expect(Math.max(Math.abs(dx),Math.abs(dz))).toBeLessThanOrEqual(3);
    expect(w.y).toBe(60);
  });
  it('never teleports onto leaves, into water or lava, or inside blocks',()=>{
    const h=createHarness(),g=h.game,leaves=blockId('oak_leaves');
    expect(canTeleportTo(g,5,60,5,.6,.85)).toBe(true);
    g.world.set(5,59,5,leaves);expect(canTeleportTo(g,5,60,5,.6,.85)).toBe(false);
    g.world.set(6,59,5,B.lava);expect(canTeleportTo(g,6,60,5,.6,.85)).toBe(false);
    g.world.set(7,60,5,B.water);expect(canTeleportTo(g,7,60,5,.6,.85)).toBe(false);
    g.world.set(8,61,5,B.stone);expect(canTeleportTo(g,8,60,5,.6,.85)).toBe(false);
    expect(canTeleportTo(g,9,61,5,.6,.85)).toBe(false);// no floor (air below)
    // Owner on an island of leaves: no spot found, the wolf stays.
    fill(h,20,59,-5,30,59,5,leaves);
    player(h).x=25.5;player(h).z=.5;player(h).y=60;
    const w=tamedWolf(h,.5,.5);
    expect(teleportToOwner(w,g)).toBe(false);
    expect(w.x).toBe(.5);
  });
});

describe('owner defence',()=>{
  it('attacks what hurts its owner',()=>{
    const h=createHarness(),w=tamedWolf(h,1.5,.5),zombie=h.spawn('zombie',6.5,60,.5);
    h.game.survival.damage(3,{kind:'mob',attacker:zombie});
    until(h,()=>h.hits.some(x=>x.entity===zombie),100);
    const bite=h.hits.find(x=>x.entity===zombie)!;
    expect(bite.amount).toBe(WOLF_DAMAGE);
    expect(bite.source).toMatchObject({kind:'mob',attacker:w,byPlayer:true});
  });
  it('attacks what its owner hits, melee or with arrows',()=>{
    const h=createHarness(),w=tamedWolf(h,1.5,.5),cow=h.spawn('cow',7.5,60,.5),zombie=h.spawn('zombie',.5,60,8.5);
    h.game.entities.damage(cow,1,{kind:'player',byPlayer:true});
    until(h,()=>h.hits.some(x=>x.entity===cow&&x.source.attacker===w),100);
    expect(h.hits.some(x=>x.entity===cow&&x.source.attacker===w)).toBe(true);
    const w2=tamedWolf(h,-1.5,.5);
    h.game.entities.damage(zombie,2,{kind:'projectile',byPlayer:true});
    until(h,()=>h.hits.some(x=>x.entity===zombie&&x.source.attacker===w2),100);
    expect(h.hits.some(x=>x.entity===zombie&&x.source.attacker===w2)).toBe(true);
  });
  it('never goes for creepers, the owner, or its pack mates, and not while sitting',()=>{
    const h=createHarness(),w=tamedWolf(h,1.5,.5),creeper=h.spawn('creeper',5.5,60,.5),zombie=h.spawn('zombie',-5.5,60,.5);
    const mate=tamedWolf(h,1.5,3.5);
    h.game.survival.damage(3,{kind:'explosion',attacker:creeper});
    h.game.entities.damage(creeper,1,{kind:'player',byPlayer:true});
    h.game.entities.damage(mate,1,{kind:'player',byPlayer:true});
    h.game.entities.damage(w,1,{kind:'player',byPlayer:true});
    h.run(60);
    expect(h.hits.filter(x=>x.source.attacker===w||x.source.attacker===mate)).toEqual([]);
    expect(h.hurt.filter(x=>x.source.attacker===w||x.source.attacker===mate)).toEqual([]);
    expect(wolfBrain(w).target).toBe(null);
    // Sitting wolves stay out of it.
    h.use(w);h.use(mate);
    expect(isSitting(w)&&isSitting(mate)).toBe(true);
    h.game.survival.damage(3,{kind:'mob',attacker:zombie});
    h.run(60);
    expect(h.hits.filter(x=>x.entity===zombie)).toEqual([]);
  });
});

describe('wild wolves',()=>{
  it('a hit turns the whole pack on the player: red eyes, raised tails, bites',()=>{
    const h=createHarness(),pack=[h.spawn('wolf',4.5,60,.5),h.spawn('wolf',6.5,60,2.5),h.spawn('wolf',5.5,60,-2.5),h.spawn('wolf',8.5,60,.5)];
    const far=h.spawn('wolf',.5,60,30.5);
    h.game.entities.damage(pack[0],1,{kind:'player',byPlayer:true});
    for(const w of pack){
      expect(angerOf(w)).toBeGreaterThanOrEqual(400);expect(w.data.angerAt).toBe('player');
      const look=newWolfLook();lookOfWolf(w,1,look);
      expect(look.angry).toBe(true);expect(look.tail).toBeCloseTo(1.5393804);
    }
    expect(angerOf(far)).toBe(0);
    until(h,()=>h.hurt.length>0,100);
    expect(h.hurt[0]).toMatchObject({amount:WOLF_DAMAGE,source:{kind:'mob'}});
    expect(pack).toContain(h.hurt[0].source.attacker);
    expect(h.hurt[0].source.byPlayer).toBeUndefined();
  });
  it('stays calm with creative players',()=>{
    const h=createHarness({mode:'creative'}),w=h.spawn('wolf',4.5,60,.5);
    h.game.entities.damage(w,1,{kind:'player',byPlayer:true});
    expect(angerOf(w)).toBe(0);
  });
  it('anger at the player wears off after 20-39 seconds out of reach',()=>{
    const h=createHarness(),w=h.spawn('wolf',4.5,60,.5);
    h.game.entities.damage(w,1,{kind:'player',byPlayer:true});
    player(h).x=-25.5;
    h.run(800);
    expect(angerOf(w)).toBe(0);expect(w.data.angerAt).toBeUndefined();
  });
  it('hunts sheep, rabbits and skeletons, never creepers; tamed wolves only skeletons',()=>{
    const h=createHarness(),w=h.spawn('wolf',.5,60,.5),sheep=h.spawn('sheep',6.5,60,.5),creeper=h.spawn('creeper',-4.5,60,.5);
    player(h).x=-20.5;
    until(h,()=>h.hits.some(x=>x.entity===sheep),400);
    expect(h.hits.some(x=>x.entity===sheep&&x.source.attacker===w)).toBe(true);
    expect(angerOf(w)).toBeGreaterThan(0);
    expect(h.hits.some(x=>x.entity===creeper)).toBe(false);
    const t=createHarness(),dog=tamedWolf(t,.5,.5),lamb=t.spawn('sheep',4.5,60,.5),skeleton=t.spawn('skeleton',.5,60,6.5);
    until(t,()=>t.hits.some(x=>x.entity===skeleton),400);
    expect(t.hits.some(x=>x.entity===skeleton&&x.source.attacker===dog)).toBe(true);
    expect(t.hits.some(x=>x.entity===lamb)).toBe(false);
  });
  it('a killed target ends the anger at once',()=>{
    const h=createHarness(),w=h.spawn('wolf',.5,60,.5),rabbit=h.spawn('rabbit',3.5,60,.5);
    rabbit.health=1;player(h).x=-20.5;
    until(h,()=>rabbit.deathTime>0,400);
    expect(rabbit.deathTime).toBeGreaterThan(0);
    h.run(1);
    expect(angerOf(w)).toBe(0);
  });
});

describe('feeding and breeding',()=>{
  it('meat heals a hurt tamed wolf by twice its food value',()=>{
    const h=createHarness(),w=tamedWolf(h,2.5,.5);
    w.health=20;h.hold('beef',3);
    expect(h.use(w)).toBe(true);
    expect(w.health).toBe(26);expect(h.consumed).toBe(1);
    expect(h.sounds()).toContain('eat');
  });
  it('two tamed wolves fed at full health breed a tamed puppy',()=>{
    const h=createHarness(),a=tamedWolf(h,1.5,.5),b=tamedWolf(h,4.5,.5),bred:string[]=[];
    a.data.collar='blue';b.data.collar='blue';
    h.game.events.on('animalBred',({kind})=>bred.push(kind));
    h.hold('cooked_beef',2);
    expect(h.use(a)).toBe(true);expect(h.use(b)).toBe(true);
    expect(a.data.love).toBe(LOVE_TICKS);expect(isSitting(a)).toBe(false);
    const before=h.spawned.length;
    until(h,()=>h.spawned.length>before,300);
    const pup=h.spawned[h.spawned.length-1];
    expect(pup.reason).toBe('breed');
    expect(pup.entity.baby).toBe(true);
    expect(pup.entity.data).toMatchObject({owner:'player',collar:'blue',growth:-BABY_TICKS+0,sitting:false});
    expect(pup.entity.maxHealth).toBe(TAME_HEALTH);
    expect(bred).toEqual(['wolf']);
    expect(a.data.growth).toBeGreaterThan(BREED_COOLDOWN-10);expect(a.data.love).toBe(0);expect(b.data.love).toBe(0);
    expect(h.xp.length).toBe(1);expect(h.xp[0]).toBeGreaterThanOrEqual(1);expect(h.xp[0]).toBeLessThanOrEqual(7);
  });
  it('wild wolves fall in love but cannot mate; puppies grow 10% faster when fed',()=>{
    const h=createHarness(),a=h.spawn('wolf',1.5,60,.5),b=h.spawn('wolf',3.5,60,.5);
    player(h).x=-20.5;
    h.hold('beef',4);h.use(a);h.use(b);
    expect(a.data.love).toBe(LOVE_TICKS);
    const before=h.spawned.length;h.run(200);
    expect(h.spawned.length).toBe(before);
    const pup=h.spawn('wolf',6.5,60,.5,{baby:true});
    h.use(pup);
    expect(pup.data.growth).toBe(-BABY_TICKS+Math.floor(Math.floor(BABY_TICKS/20)*.1)*20);
  });
  it('a spawn egg on a tamed wolf gives a tamed puppy',()=>{
    const h=createHarness(),w=tamedWolf(h,1.5,.5);
    h.hold('wolf_spawn_egg',1);
    expect(h.use(w)).toBe(true);
    const pup=h.spawned[h.spawned.length-1].entity;
    expect(pup.baby).toBe(true);expect(isTame(pup)).toBe(true);
    expect(h.consumed).toBe(1);
  });
});

describe('looks and sounds',()=>{
  it('wears a red collar that dyes recolour, and its tail shows its health',()=>{
    const h=createHarness(),w=tamedWolf(h,2.5,.5),model=h.game.entities.kind('wolf')!.model!;
    expect(model.appearance!(w).tint).toBe(DYE_COLOURS.red);
    h.hold('red_dye',2);expect(h.use(w)).toBe(false);
    h.hold('blue_dye',2);expect(h.use(w)).toBe(true);
    expect(model.appearance!(w).tint).toBe(DYE_COLOURS.blue);expect(h.consumed).toBe(1);
    expect(tailAngle(w)).toBeCloseTo(.55*Math.PI);
    w.health=20;expect(tailAngle(w)).toBeCloseTo(.35*Math.PI);
    w.health=0;expect(tailAngle(w)).toBeCloseTo(.15*Math.PI);
    const wild=h.spawn('wolf',6.5,60,.5);
    expect(tailAngle(wild)).toBeCloseTo(Math.PI/5);
    expect(model.appearance!(wild).tint).toBeUndefined();
  });
  it('growls when angry, whines when a tamed wolf is badly hurt, barks or pants otherwise',()=>{
    const ambient=(setup:(w:Entity,h:Harness)=>void,rolls:number[])=>{
      const h=createHarness({random:sequence(rolls,.99)}),w=h.spawn('wolf',.5,60,.5);
      setup(w,h);
      const b=wolfBrain(w);b.ambient=5000;h.game.sounds.played.length=0;
      h.run(1);
      return h.sounds().find(s=>s.startsWith('mob:wolf'));
    };
    expect(ambient(w=>{w.data.anger=300;},[])).toBe('mob:wolf_growl:ambient');
    // Rolls: the ambient timer, then the one-in-three pant (or whine) roll.
    expect(ambient((w,h)=>{tame(w,h.game);w.data.sitting=false;w.health=10;},[0,.1])).toBe('mob:wolf_whine:ambient');
    expect(ambient(()=>{},[0,.1])).toBe('mob:wolf_pant:ambient');
    expect(ambient(()=>{},[0,.9])).toBe('mob:wolf:ambient');
  });
  it('shakes itself dry on land with splashes',()=>{
    const h=createHarness(),w=tamedWolf(h,.5,.5,true);
    h.game.world.set(0,60,0,B.water);
    h.run(2);
    expect(wolfBrain(w).wet).toBe(true);
    h.game.world.set(0,60,0,0);
    expect(until(h,()=>wolfBrain(w).shaking,20)).toBeLessThan(20);
    expect(h.sounds()).toContain('mob:wolf_shake:ambient');
    h.run(45);
    expect(wolfBrain(w).shaking).toBe(false);expect(wolfBrain(w).wet).toBe(false);
    expect(h.particles.some(p=>p.kind==='splash')).toBe(true);
  });
  it('panics on fire and runs off',()=>{
    const h=createHarness(),w=h.spawn('wolf',.5,60,.5);
    player(h).x=-20.5;
    h.game.entities.damage(w,1,{kind:'fire'});
    const start={x:w.x,y:w.y,z:w.z};h.run(20);
    expect(dist(w,start)).toBeGreaterThan(3);
  });
});

describe('persistence',()=>{
  it('keeps valid wolf data and drops the rest',()=>{
    expect(restoreWolfData({variant:'golden',owner:'bob',sitting:true,collar:'red',growth:1.5,love:-3,anger:99999,angerAt:'zombie'})).toEqual({variant:'pale'});
    expect(restoreWolfData({variant:'ashen',owner:'player',sitting:true,collar:'lime',growth:-100,love:20,anger:300,angerAt:'player'}))
      .toEqual({variant:'ashen',owner:'player',sitting:true,collar:'lime',growth:-100,love:20,anger:300,angerAt:'player'});
    expect(restoreWolfData({variant:'woods',owner:'player',collar:'mauve'})).toEqual({variant:'woods',owner:'player',sitting:false,collar:'red'});
  });
  it('a restored tamed wolf keeps its health and owner and a restored angry wolf remembers the player',()=>{
    const h=createHarness(),w=h.spawn('wolf',3.5,60,.5,{data:restoreWolfData({variant:'woods',owner:'player',sitting:true}),reason:'restore'});
    expect(w.maxHealth).toBe(TAME_HEALTH);
    const angry=h.spawn('wolf',5.5,60,.5,{data:restoreWolfData({anger:300,angerAt:'player'}),reason:'restore'});
    until(h,()=>h.hurt.length>0,200);
    expect(h.hurt[0]?.source.attacker).toBe(angry);
    expect(isSitting(w)).toBe(true);
  });
});
