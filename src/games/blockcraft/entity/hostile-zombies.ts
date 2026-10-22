// Zombie, husk and drowned (Java 1.20 Zombie, Husk, Drowned).
//  - Zombie: 20 health, movement 0.23 (babies × 1.5, 0.3 × 0.975 box, 12 xp; 5% of spawns), follow range 35, 3 damage
//    per hit (survival scales it by difficulty) with a 30% × regional difficulty chance to set the target alight while
//    burning. Hurting one alerts every zombie-kin within 35 blocks. Arms are held out, higher while chasing. With its eyes
//    under water for 30 s it starts shivering and becomes a drowned 15 s later ('convert' spawn reason).
//  - Husk: desert zombie that does not burn; its hits add Hunger for 7 s per difficulty level; it converts to a zombie.
//  - Drowned: spawns in rivers and oceans; swims freely (aquatic) after targets in water; by day it only hunts swimmers
//    and heads for water, at night it swims up and climbs ashore to hunt anything.
//  - Undead (EntityKind.undead): they breathe under water, so the entity service never drowns them.
//  - Natural spawns follow the vanilla placement rules in spawn.check (the framework's dark-spawn light test is replaced,
//    so each check starts with monster darkness): husks need open sky; drowned need water below the feet, then pass 1 time
//    in 15 in rivers, else 1 in 40 below sea level − 5. At a bank a drowned that wants land climbs out through the entity
//    framework's ledge rule for aquatic land mobs.
// Drops: 0–2 rotten flesh; player kills add a 2.5% iron ingot / carrot / potato (zombie, husk) or 11% copper (drowned).
import {SOLID,isWater} from '../data/blocks';
import {biomeDef} from '../data/biomes';
import {stack} from '../data/items';
import {SEA_LEVEL} from '../engine/constants';
import type {Entity,EntityKind,Game,ItemStack} from '../engine/contracts';
import {alertOthers,targetView,avoidHazards,brain,chase,cleanData,darkUnderOpenSky,difficultyId,forget,idle,ignite,isDay,localDifficulty,mobSpeed,
  newTarget,peacefulRemove,pickSpot,retaliate,setAggressive,tickTimers,tryMelee,updateTarget,walkToSpot,type Brain,
  type TargetPos} from './hostile-ai';
import {zombieModels} from './hostile-models';
import {playersOf} from '../engine/players';
import {isDarkEnoughToSpawn} from './spawning';

export type ZombieKind='zombie'|'husk'|'drowned';
export const ZOMBIE_FAMILY:ReadonlySet<string>=new Set<ZombieKind>(['zombie','husk','drowned']);
export const ZOMBIE_FOLLOW=35,ZOMBIE_DAMAGE=3,ZOMBIE_MOVEMENT=.23;
/** Ticks with the eyes under water before converting starts, and ticks of shivering before the conversion. */
export const CONVERT_AFTER=600,CONVERT_TIME=300;
export const BABY_CHANCE=.05;
/** Vanilla rare drop chance (zombie, husk) and copper chance (drowned) for player kills. */
export const RARE_DROP=.025,COPPER_DROP=.11;
/** Drowned.checkDrownedSpawnRules chances: rivers (vanilla #more_frequent_drowned_spawns) and everywhere else. */
export const DROWNED_RIVER_CHANCE=1/15,DROWNED_OCEAN_CHANCE=1/40;
const RIVERS:ReadonlySet<string>=new Set(['river','frozen_river']);
const BABY_REASONS=new Set(['natural','chunk','spawner','egg']);

interface Variant{kind:ZombieKind;convertsTo?:ZombieKind;hunger?:boolean}
const VARIANTS:Record<ZombieKind,Variant>={
  zombie:{kind:'zombie',convertsTo:'drowned'},
  husk:{kind:'husk',convertsTo:'zombie',hunger:true},
  drowned:{kind:'drowned'}
};
/** Steady ground speed of a zombie (babies 50% faster). */
export const zombieSpeed=(e:Entity)=>mobSpeed(ZOMBIE_MOVEMENT*(e.baby?1.5:1));
const T:TargetPos=newTarget();
const isZombieKin=(o:Entity)=>ZOMBIE_FAMILY.has(o.kind);

/** Zombie.tick conversion: eyes under water for CONVERT_AFTER ticks start it; once started it always completes. */
function tickConversion(game:Game,e:Entity,b:Brain,v:Variant):boolean{
  const c=e.data.converting;
  if(typeof c==='number'){
    if(c-1<0){convert(game,e,v.convertsTo??'drowned');return true;}
    e.data.converting=c-1;return false;
  }
  if(!v.convertsTo)return false;
  const eye=game.world.get(Math.floor(e.x),Math.floor(e.y+e.height*.85),Math.floor(e.z));
  if(eye>0&&isWater(eye)){if(++b.wet>=CONVERT_AFTER)e.data.converting=CONVERT_TIME;}
  else b.wet=-1;
  return false;
}
function convert(game:Game,e:Entity,to:ZombieKind){
  const n=game.entities.spawn(to,e.x,e.y,e.z,{reason:'convert',baby:e.baby,yaw:e.yaw});
  if(n){n.headYaw=e.headYaw;n.vx=e.vx;n.vy=e.vy;n.vz=e.vz;}
  game.entities.remove(e);
}

/** Drowned.okTarget: by day only targets in water. */
const drownedOk=(game:Game,inWater:boolean)=>!isDay(game)||inWater;
const drownedSeesPrey=(game:Game)=>playersOf(game).some(p=>drownedOk(game,p.inWater));
/** DrownedMoveControl while swimming after a target: vertical push 0.1 × movement speed along the direction to it,
 *  plus 0.002 blocks/tick² up when it is above (velocities here in blocks/second). */
function swimToward(e:Entity,x:number,y:number,z:number){
  const dy=y-e.y,d=Math.hypot(x-e.x,dy,z-e.z)||1,attribute=ZOMBIE_MOVEMENT*(e.baby?1.5:1);
  e.vy+=(dy/d*attribute*.1+(dy>0?.002:0))*20;
}
const waterCell=(game:Game,_e:Entity,x:number,y:number,z:number)=>{const id=game.world.get(x,y,z);return id>0&&isWater(id);};
const standableLand=(game:Game,_e:Entity,x:number,y:number,z:number)=>{
  const w=game.world,below=w.get(x,y-1,z),feet=w.get(x,y,z),head=w.get(x,y+1,z);
  return below>0&&SOLID[below]===1&&!isWater(below)&&feet>=0&&!SOLID[feet]&&!isWater(feet)&&head>=0&&!SOLID[head]&&!isWater(head);
};
/** Drowned without a target: by day back to water (DrownedGoToWaterGoal), at night up and ashore (SwimUp, GoToBeach). */
function drownedIdle(game:Game,e:Entity,b:Brain,speed:number){
  if(walkToSpot(game,e,b,speed)){
    if(e.inWater&&b.goY>e.y)swimToward(e,b.goX,b.goY,b.goZ);
    return;
  }
  const day=isDay(game);
  if(day&&!e.inWater&&pickSpot(game,e,b,10,3,10,waterCell))return;
  if(!day&&e.inWater){
    if(pickSpot(game,e,b,8,3,10,standableLand))return;
    if(e.y<SEA_LEVEL-2)swimToward(e,e.x,SEA_LEVEL,e.z);
  }
  idle(game,e,b,speed);
}

function tickZombie(e:Entity,game:Game,v:Variant){
  if(peacefulRemove(game,e))return;
  const b=brain(e);
  tickTimers(e,b);
  if(tickConversion(game,e,b,v))return;
  const drowned=v.kind==='drowned',speed=zombieSpeed(e);
  let has=updateTarget(game,e,b,ZOMBIE_FOLLOW,T,drowned?drownedSeesPrey:undefined);
  if(has&&drowned&&!drownedOk(game,T.inWater)){forget(b);has=false;}
  setAggressive(e,has);
  if(has){
    b.goTime=0;
    chase(game,e,b,T,speed);
    if(drowned&&e.inWater&&(T.inWater||T.y>e.y))swimToward(e,T.x,T.y,T.z);
    if(tryMelee(game,e,b,T,ZOMBIE_DAMAGE))onHit(game,e,b,v);
  }else if(drowned)drownedIdle(game,e,b,speed);
  else idle(game,e,b,speed);
  avoidHazards(game,e);
}
/** Zombie.doHurtTarget extras after a landed hit: fire from a burning zombie, Hunger from a husk. */
function onHit(game:Game,e:Entity,b:Brain,v:Variant){
  const f=localDifficulty(game);
  const burn=e.fire>0&&game.random()<f*.3?2*Math.floor(f):0;
  if(b.targetPlayer){
    const p=targetView(game,b);
    if(v.hunger)p.addEffect('hunger',7*difficultyId(game),1);
    if(burn>0)p.ignite(burn);
  }else if(b.target&&burn>0)ignite(b.target,burn*20);
}

/** Drowned.checkDrownedSpawnRules at a feet cell (the framework already put the feet in water): water below the feet and
 *  monster darkness, then 1 time in 15 in rivers, else 1 in 40 below sea level − 5. */
export function drownedSpawnOk(game:Game,x:number,y:number,z:number):boolean{
  const below=game.world.get(x,y-1,z);
  if(!(below>0&&isWater(below))||!isDarkEnoughToSpawn(game,x,y,z))return false;
  if(RIVERS.has(biomeDef(game.world.biomeAt(x,z)).name))return game.random()<DROWNED_RIVER_CHANCE;
  return game.random()<DROWNED_OCEAN_CHANCE&&y<SEA_LEVEL-5;
}
function zombieDrops(e:Entity,game:Game,byPlayer:boolean,v:Variant):ItemStack[]{
  const out:ItemStack[]=[];
  const flesh=Math.floor(game.random()*3);
  if(flesh>0)out.push(stack('rotten_flesh',flesh));
  if(byPlayer){
    if(v.kind==='drowned'){if(game.random()<COPPER_DROP)out.push(stack('copper_ingot',1));}
    else if(game.random()<RARE_DROP){const r=Math.floor(game.random()*3);out.push(stack(r===0?'iron_ingot':r===1?'carrot':'potato',1));}
  }
  return out;
}

function zombieKind(kind:ZombieKind):EntityKind{
  const v=VARIANTS[kind];
  return{
    kind,category:'hostile',width:.6,height:1.95,maxHealth:20,model:zombieModels[kind](),
    sounds:{name:kind},despawns:true,undead:true,burnsInDaylight:kind!=='husk',aquatic:kind==='drowned',
    spawn:kind==='zombie'?{light:'dark',group:[4,4],weight:95}
      :kind==='husk'?{light:'dark',group:[4,4],biomes:[['desert',80]],replaces:'zombie',check:darkUnderOpenSky}
      :{light:'dark',group:[1,1],biomes:[['river',100],['frozen_river',1],['ocean',5],['deep_ocean',5]],check:drownedSpawnOk},
    xp:e=>e.baby?12:5,
    init(e,game,reason){
      if(!e.baby&&BABY_REASONS.has(reason)&&game.random()<BABY_CHANCE)e.baby=true;
      if(e.baby){e.width=.3;e.height=.975;}
      if(reason==='restore'){const d=cleanData(e.data,{converting:[0,CONVERT_TIME]});for(const k of Object.keys(e.data))delete e.data[k];Object.assign(e.data,d);}
      if(typeof e.data.converting!=='number')brain(e).wet=0;
    },
    tick:(e,game)=>tickZombie(e,game,v),
    hurt(e,game,source){
      if(retaliate(e,game,source))alertOthers(game,e,ZOMBIE_FOLLOW,isZombieKin);
    },
    drops:(e,game,byPlayer)=>zombieDrops(e,game,byPlayer,v),
    restoreData:data=>cleanData(data,{converting:[0,CONVERT_TIME]})
  };
}
export function zombieKinds():EntityKind[]{return[zombieKind('zombie'),zombieKind('husk'),zombieKind('drowned')];}
