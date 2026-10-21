import {describe,expect,test} from 'vitest';
import {AIR,B,blockId,isLiquid,SOLID} from '../../../src/games/blockcraft/data/blocks';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {collidesAt} from '../../../src/games/blockcraft/engine/physics';
import {ENDERMAN_HEAD,findTeleportTarget,isHoldable,isStaredAt,stareDistance,teleportRandomly,tryPlaceBlock,tryTakeBlock}
  from '../../../src/games/blockcraft/entity/monsters-enderman';
import type {Entity,PartPose} from '../../../src/games/blockcraft/engine/contracts';
import {createHarness,lookAt,type MonsterHarness} from './monsters-fixture';

const GRASS=B.grass,FLOWER=blockId('poppy'),CACTUS=blockId('cactus');
function enderman(h:MonsterHarness,x=.5,y=60,z=-9.5,data?:Record<string,unknown>):Entity{
  const e=h.entities.spawn('enderman',x,y,z,{reason:'event',data});
  if(!e)throw new Error('enderman not registered');
  return e;
}
const headCentre=(e:Entity)=>({x:e.x,y:e.y+(ENDERMAN_HEAD.bottom+ENDERMAN_HEAD.top)/2,z:e.z});
/** Fills a box of cells with a block. */
function fill(h:MonsterHarness,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)h.game.world.set(x,y,z,id,'player');
}

describe('enderman registration',()=>{
  test('enderman kind: 2.9 tall hostile, 40 health, 7 damage stats, 5 xp, rare dark spawning outside mushroom fields',()=>{
    const h=createHarness(),k=h.entities.kind('enderman')!;
    expect(k).toBeDefined();
    expect(k.category).toBe('hostile');expect(k.height).toBeCloseTo(2.9);expect(k.width).toBeCloseTo(.6);expect(k.maxHealth).toBe(40);
    expect(k.xp).toBe(5);expect(k.despawns).toBe(true);
    expect(k.spawn?.light).toBe('dark');expect(k.spawn?.weight).toBe(10);expect(k.spawn?.group).toEqual([1,4]);
    const names=k.spawn!.biomes!.map(([n])=>n);
    expect(names).toContain('plains');expect(names).toContain('desert');expect(names).not.toContain('mushroom_fields');
    expect(k.sounds?.name).toBe('enderman');
    expect(k.model?.parts.some(p=>p.emissive)).toBe(true);
  });
});

describe('stare detection geometry',()=>{
  test('the look ray must hit the head box',()=>{
    const h=createHarness(),e=enderman(h),c=headCentre(e);
    lookAt(h.game,c.x,c.y,c.z);
    expect(stareDistance(h.game.world,h.game.player.eye(),h.game.player.look(),e)).toBeGreaterThan(9);
    expect(isStaredAt(h.game,e)).toBe(true);
    // At the body, the feet, or just beside the head: not a stare.
    for(const [x,y] of [[e.x,e.y+1.4],[e.x,e.y+.1],[e.x+.45,c.y],[e.x,e.y+e.height+.2]]){
      lookAt(h.game,x,y,e.z);expect(isStaredAt(h.game,e)).toBe(false);
    }
  });
  test('blocks between the eyes and the head stop the stare; plants and water do not',()=>{
    const h=createHarness(),e=enderman(h),c=headCentre(e);
    lookAt(h.game,c.x,c.y,c.z);
    const eye=h.game.player.eye(),look=h.game.player.look(),t=5,bx=Math.floor(eye.x+look.x*t),by=Math.floor(eye.y+look.y*t),bz=Math.floor(eye.z+look.z*t);
    h.game.world.set(bx,by,bz,B.glass,'player');expect(isStaredAt(h.game,e)).toBe(false);
    h.game.world.set(bx,by,bz,B.stone,'player');expect(isStaredAt(h.game,e)).toBe(false);
    h.game.world.set(bx,by,bz,B.water,'player');expect(isStaredAt(h.game,e)).toBe(true);
    h.game.world.set(bx,by,bz,AIR,'player');expect(isStaredAt(h.game,e)).toBe(true);
  });
  test('only within 64 blocks',()=>{
    const h=createHarness();
    const near=enderman(h,.5,60,-30.5);let c=headCentre(near);lookAt(h.game,c.x,c.y,c.z);expect(isStaredAt(h.game,near)).toBe(true);
    // The fake world spans chunks -2..2 (80 blocks): load more ground for a far enderman.
    h.game.flat(60,B.stone,5);
    const far=enderman(h,.5,60,-66.5);c=headCentre(far);lookAt(h.game,c.x,c.y,c.z);
    expect(stareDistance(h.game.world,h.game.player.eye(),h.game.player.look(),far)).toBe(-1);
  });
});

describe('anger',()=>{
  test('staring for a quarter second angers it (jaw open, scream); looking away first calms the pending stare',()=>{
    const h=createHarness(),e=enderman(h),c=headCentre(e);
    lookAt(h.game,c.x,c.y,c.z);
    h.entities.tick();h.entities.tick();
    expect(e.data.angry).toBeFalsy();
    h.game.player.state.yaw+=Math.PI/2;// look away during the pending stare
    for(let i=0;i<10;i++)h.entities.tick();
    expect(e.data.angry).toBeFalsy();
    lookAt(h.game,c.x,c.y,c.z);
    for(let i=0;i<6;i++)h.entities.tick();
    expect(e.data.angry).toBe(true);
    expect(h.sounds('mob:enderman:ambient')).toBeGreaterThan(0);
  });
  test('creative players never anger it',()=>{
    const h=createHarness({mode:'creative'}),e=enderman(h),c=headCentre(e);
    lookAt(h.game,c.x,c.y,c.z);
    for(let i=0;i<20;i++)h.entities.tick();
    expect(e.data.angry).toBeFalsy();
  });
  test('a player hit angers it; projectiles are dodged with a teleport and deal no damage',()=>{
    const h=createHarness(),e=enderman(h);
    expect(h.entities.damage(e,4,{kind:'player',byPlayer:true})).toBe(true);
    expect(e.data.angry).toBe(true);expect(e.health).toBe(36);
    const other=enderman(h,10.5,60,10.5),before={x:other.x,z:other.z};
    expect(h.entities.damage(other,9,{kind:'projectile',byPlayer:true})).toBe(false);
    expect(other.health).toBe(40);
    expect(Math.hypot(other.x-before.x,other.z-before.z)).toBeGreaterThan(0);
    expect(h.sounds('teleport')).toBeGreaterThan(0);
    expect(other.data.angry).toBeFalsy();
  });
  test('angry: chases, then hits the player for 7 with a one-second cooldown',()=>{
    const h=createHarness(),e=enderman(h,.5,60,-6.5);
    h.game.player.teleport(.5,60,.5);
    h.entities.damage(e,1,{kind:'player',byPlayer:true});
    h.game.player.state.yaw=Math.PI;// look away (south) so it does not freeze
    h.entities.tick();
    expect(h.navigations.length).toBeGreaterThan(0);
    expect(e.moveZ).toBeGreaterThan(5);// fast (vanilla angry speed about 8.7 blocks/second) toward +z
    e.x=.5;e.z=-.6;
    for(let i=0;i<25;i++)h.entities.tick();
    expect(h.playerHits.length).toBe(2);
    expect(h.playerHits[0].amount).toBe(7);expect(h.playerHits[0].source.kind).toBe('mob');expect(h.playerHits[0].source.attacker).toBe(e);
  });
  test('angry and stared at: freezes within 16 blocks and teleports away within 4',()=>{
    const h=createHarness(),e=enderman(h,.5,60,-8.5);
    h.game.player.teleport(.5,60,.5);
    h.entities.damage(e,1,{kind:'player',byPlayer:true});
    let c=headCentre(e);lookAt(h.game,c.x,c.y,c.z);
    h.entities.tick();
    expect(e.moveX).toBe(0);expect(e.moveZ).toBe(0);
    expect(e.x).toBe(.5);expect(e.z).toBe(-8.5);
    e.z=-2.5;c=headCentre(e);lookAt(h.game,c.x,c.y,c.z);
    // One teleport attempt per tick (vanilla), so allow a few ticks.
    for(let i=0;i<12&&e.z===-2.5;i++)h.entities.tick();
    expect(Math.hypot(e.x-.5,e.z+2.5)).toBeGreaterThan(1);
  });
  test('persistent anger runs out once the player is out of reach',()=>{
    const h=createHarness(),e=enderman(h);
    h.entities.damage(e,1,{kind:'player',byPlayer:true});
    h.game.setMode('creative');
    h.entities.tick();
    expect(e.data.angry).toBe(false);
    for(let i=0;i<800;i++)h.entities.tick();
    expect(e.data.anger).toBe(0);
  });
});

describe('teleport target safety',()=>{
  const W=.6,H=2.9;
  test('lands on top of the ground below the chosen point',()=>{
    const h=createHarness();
    expect(findTeleportTarget(h.game,5.5,75.3,5.5,W,H)).toEqual({x:5.5,y:60,z:5.5});
    fill(h,5,60,5,5,60,5,blockId('stone_slab'));
    expect(findTeleportTarget(h.game,5.5,70,5.5,W,H)?.y).toBeCloseTo(60.5);
  });
  test('rejects water, lava, cacti, missing headroom, unloaded chunks and the void',()=>{
    const h=createHarness();
    fill(h,4,60,4,6,60,6,B.water);expect(findTeleportTarget(h.game,5.5,70,5.5,W,H)).toBeNull();
    fill(h,4,60,4,6,60,6,B.lava);expect(findTeleportTarget(h.game,5.5,70,5.5,W,H)).toBeNull();
    fill(h,4,60,4,6,60,6,AIR);
    h.game.world.set(5,60,5,CACTUS,'player');expect(findTeleportTarget(h.game,5.5,70,5.5,W,H)).toBeNull();
    h.game.world.set(5,60,5,AIR,'player');
    fill(h,4,62,4,6,62,6,B.stone);// two blocks of headroom only
    expect(findTeleportTarget(h.game,5.5,61,5.5,W,H)).toBeNull();
    expect(findTeleportTarget(h.game,500.5,70,5.5,W,H)).toBeNull();
    expect(findTeleportTarget(h.game,5.5,-3,5.5,W,H)).toBeNull();
  });
  test('a body that would overlap a wall beside the column is rejected',()=>{
    const h=createHarness();
    fill(h,6,60,5,6,63,5,B.stone);
    expect(findTeleportTarget(h.game,5.9,70,5.5,W,H)).toBeNull();
    expect(findTeleportTarget(h.game,5.5,70,5.5,W,H)).not.toBeNull();
  });
  test('avoids open sky while it rains on the target, accepts shelter',()=>{
    const h=createHarness();
    h.game.weather={...h.game.weather,state:'rain',isRainingOn:(x,y,z)=>y>h.game.world.topY(x,z)};
    expect(findTeleportTarget(h.game,5.5,70,5.5,W,H)).toBeNull();
    fill(h,4,64,4,6,64,6,B.oakPlanks);
    expect(findTeleportTarget(h.game,5.5,63,5.5,W,H)).toEqual({x:5.5,y:60,z:5.5});
  });
  test('random teleports only ever end on safe, dry ground',()=>{
    const h=createHarness({seed:99});
    // Ponds, lava pools and low caves scattered over the ground.
    for(let i=0;i<60;i++){
      const x=Math.floor(h.game.random()*70)-35,z=Math.floor(h.game.random()*70)-35,kind=i%3;
      if(kind===0)fill(h,x,59,z,x+3,59,z+3,B.water);
      else if(kind===1)fill(h,x,59,z,x+2,59,z+2,B.lava);
      else fill(h,x,62,z,x+3,62,z+3,B.stone);
    }
    const e=enderman(h,.5,60,.5);let moved=0;
    for(let i=0;i<300;i++){
      const before=`${e.x},${e.y},${e.z}`;
      if(teleportRandomly(h.game,e)){
        moved++;expect(`${e.x},${e.y},${e.z}`).not.toBe(before);
        expect(collidesAt(h.game.world,e.x,e.y,e.z,.3,2.9)).toBe(false);
        const below=h.game.world.get(Math.floor(e.x),Math.ceil(e.y)-1,Math.floor(e.z));
        expect(SOLID[below]).toBe(1);
        for(let y=Math.floor(e.y);y<=Math.floor(e.y+2.9);y++)for(const [dx,dz] of [[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3]])
          expect(isLiquid(Math.max(0,h.game.world.get(Math.floor(e.x+dx),y,Math.floor(e.z+dz))))).toBe(false);
      }
    }
    expect(moved).toBeGreaterThan(20);
  });
});

describe('block carrying',()=>{
  test('holdable set follows vanilla: earth, sand, gravel, clay, plants, pumpkins and melons; not stone or logs',()=>{
    for(const n of ['grass_block','dirt','sand','red_sand','gravel','clay','poppy','dandelion','brown_mushroom','red_mushroom','cactus','pumpkin','melon','mycelium','podzol'])
      expect(isHoldable(blockId(n))).toBe(true);
    for(const n of ['stone','oak_log','oak_planks','bedrock','water','air','glass','obsidian'])expect(isHoldable(blockId(n))).toBe(false);
  });
  test('picks up a holdable block it can see within reach',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5);
    h.game.world.set(1,60,0,GRASS,'player');
    // Random offsets choose cell floor(x-2+r*4)=1, floor(y+r*3)=60, floor(z-2+r*4)=0.
    expect(tryTakeBlock(h.game,e,queue(.7,.1,.4))).toBe(true);
    expect(e.data.carried).toBe(GRASS);expect(h.game.world.get(1,60,0)).toBe(AIR);
    expect(tryTakeBlock(h.game,e,queue(.7,.1,.4))).toBe(false);// already carrying
  });
  test('cannot take unholdable blocks or blocks behind others',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5);
    h.game.world.set(1,60,0,B.oakPlanks,'player');
    expect(tryTakeBlock(h.game,e,queue(.7,.1,.4))).toBe(false);
    h.game.world.set(2,60,0,B.dirt,'player');// hidden behind the planks from the enderman's column
    expect(tryTakeBlock(h.game,e,queue(.95,.1,.4))).toBe(false);
    expect(h.game.world.get(2,60,0)).toBe(B.dirt);expect(e.data.carried).toBeUndefined();
  });
  test('places the carried block on a full block where it can survive and nothing stands',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5,{carried:FLOWER});
    // Cell floor(x-1+r*2)=1, floor(y+r*2)=60, floor(z-1+r*2)=1: stone below, a flower cannot stay on stone.
    expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(false);
    h.game.world.set(1,59,1,GRASS,'player');
    expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(true);
    expect(h.game.world.get(1,60,1)).toBe(FLOWER);expect(e.data.carried).toBeUndefined();
  });
  test('never places into an occupied cell, onto bedrock, onto air or over the player',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5,{carried:B.dirt});
    h.game.world.set(1,60,1,B.dirt,'player');expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(false);
    h.game.world.set(1,60,1,AIR,'player');h.game.world.set(1,59,1,B.bedrock,'player');
    expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(false);
    h.game.world.set(1,59,1,AIR,'player');expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(false);
    h.game.world.set(1,59,1,B.stone,'player');
    h.game.player.teleport(1.5,60,1.5);expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(false);
    h.game.player.teleport(20.5,60,20.5);expect(tryPlaceBlock(h.game,e,queue(.9,.2,.9))).toBe(true);
  });
  test('its own cells are not a place target',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5,{carried:B.dirt});
    expect(tryPlaceBlock(h.game,e,queue(.6,.2,.6))).toBe(false);
    expect(h.game.world.get(0,60,0)).toBe(AIR);
  });
  test('the model shows the carried block between its hands; death drops it and up to one ender pearl',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5,{carried:B.sand}),k=h.entities.kind('enderman')!;
    const pose:Record<string,PartPose>={};
    k.model!.animate!(e,pose,{time:0,partial:0,limbSwing:0,limbAmount:0,headYaw:0,headPitch:0,attack:0,reducedMotion:false});
    expect(pose.carried_sand.visible).toBe(true);expect(pose.carried_dirt.visible).toBe(false);
    h.entities.damage(e,100,{kind:'player',byPlayer:true});
    const ids=h.dropped.map(s=>s.id);
    expect(ids).toContain('sand');
    expect(h.dropped.filter(s=>s.id==='ender_pearl').reduce((n,s)=>n+s.count,0)).toBeLessThanOrEqual(1);
    expect(h.xp).toEqual([5]);
  });
  test('ender pearl drops are 0 or 1, about half the time',()=>{
    const h=createHarness({seed:3});let pearls=0;
    for(let i=0;i<400;i++){
      const e=enderman(h,(i%20)-9.5,60,Math.floor(i/20)-9.5);h.dropped.length=0;
      h.entities.damage(e,100,{kind:'player',byPlayer:true});
      const n=h.dropped.filter(s=>s.id==='ender_pearl').reduce((a,s)=>a+s.count,0);
      expect(n).toBeLessThanOrEqual(1);pearls+=n;
    }
    expect(pearls).toBeGreaterThan(150);expect(pearls).toBeLessThan(250);
  });
  test('restoreData keeps a valid carried block and drops invalid values',()=>{
    const h=createHarness(),k=h.entities.kind('enderman')!;
    expect(k.restoreData!({carried:B.sand,angry:true,anger:200})).toMatchObject({carried:B.sand});
    expect(k.restoreData!({carried:B.stone})?.carried).toBeUndefined();
    expect(k.restoreData!({carried:'sand',anger:-5,since:'x'})).toEqual(expect.not.objectContaining({carried:expect.anything()}));
  });
});

describe('water and rain',()=>{
  test('water hurts it and makes it teleport away',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5);
    e.inWater=true;
    for(let i=0;i<20&&e.x===.5&&e.z===.5;i++)h.entities.tick();
    expect(e.health).toBeLessThan(40);
    expect(Math.hypot(e.x-.5,e.z-.5)).toBeGreaterThan(0);
  });
  test('rain hurts it only when the rain falls on it',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5);
    h.game.weather={...h.game.weather,state:'rain',isRainingOn:()=>false};
    h.entities.tick();expect(e.health).toBe(40);
    h.game.weather={...h.game.weather,state:'rain',isRainingOn:()=>true};
    h.entities.tick();expect(e.health).toBeLessThan(40);
  });
  test('portal particles drift around it near the player',()=>{
    const h=createHarness(),e=enderman(h,.5,60,-3.5);
    h.entities.tick();
    expect(h.particles.some(p=>p.kind==='portal'&&Math.abs(p.x-e.x)<1)).toBe(true);
  });
  test('teleporting plays the sound and portal particles at both ends',()=>{
    const h=createHarness(),e=enderman(h,.5,60,.5);
    let ok=false;for(let i=0;i<50&&!ok;i++)ok=teleportRandomly(h.game,e);
    expect(ok).toBe(true);
    expect(h.sounds('teleport')).toBe(2);
    expect(h.particles.filter(p=>p.kind==='portal'&&(p.count??0)>=16).length).toBe(2);
  });
});

describe('swamp biomes do not matter for endermen',()=>{
  test('spawn biomes include swamps and oceans',()=>{
    const h=createHarness(),k=h.entities.kind('enderman')!;
    const names=k.spawn!.biomes!.map(([n])=>n);
    expect(names).toContain('swamp');expect(names).toContain('ocean');
    expect(biomeId('swamp')).toBeGreaterThan(0);
  });
});

function queue(...values:number[]){return()=>values.length?values.shift()!:.5;}
