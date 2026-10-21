// Creeper (Java 1.20 Creeper with SwellGoal). 20 health, movement 0.25, follow range 16, silent (no ambient sound).
// It stalks its target and, once within 3 blocks, stops, hisses (`fuse`) and swells for 30 ticks (1.5 s), then explodes
// with power 3 through game.ticks.explode (6 when charged by lightning: data.charged). The swell runs back down when
// the target gets beyond 7 blocks or out of sight. Flint and steel ignites it whatever the distance. A fall adds 1.5
// swell ticks per block (at most 25). Does not burn in daylight. Drops 0–2 gunpowder; 5 xp.
import {stack} from '../data/items';
import type {Entity,EntityKind,Game,ItemStack} from '../engine/contracts';
import {avoidHazards,brain,chase,cleanData,floatInLiquid,idle,mobSpeed,newTarget,peacefulRemove,retaliate,tickTimers,updateTarget,
  type Brain,type TargetPos} from './hostile-ai';
import {creeperModel} from './hostile-models';

/** Ticks of swelling before the explosion (Creeper.maxSwell). */
export const CREEPER_FUSE=30;
export const EXPLOSION_RADIUS=3,CREEPER_FOLLOW=16,CREEPER_MOVEMENT=.25;
/** SwellGoal starts within 3 blocks and keeps swelling within 7. */
export const SWELL_START=3,SWELL_KEEP=7;
const T:TargetPos=newTarget();
const chaseSpeed=mobSpeed(CREEPER_MOVEMENT),strollSpeed=mobSpeed(CREEPER_MOVEMENT,.8);

/** The swell direction (+1 swelling, −1 relaxing) from SwellGoal: it runs while already swelling or when the target is
 *  within 3 blocks, and swells only while the target is visible within 7 blocks. Ignition always swells. */
export function creeperSwellDir(hasTarget:boolean,distance:number,canSee:boolean,swelling:boolean,ignited:boolean):1|-1{
  if(ignited)return 1;
  if(!swelling&&!(hasTarget&&distance<SWELL_START))return -1;
  return hasTarget&&distance<=SWELL_KEEP&&canSee?1:-1;
}
/** Explosion power: 3, doubled when charged. */
export const explosionPower=(e:Entity)=>EXPLOSION_RADIUS*(e.data.charged===true?2:1);
function explode(game:Game,e:Entity){
  // The creeper is gone before the blast (vanilla sets it dead first), so it takes no part in it.
  game.entities.remove(e);
  game.ticks.explode(e.x,e.y,e.z,explosionPower(e),e,false,false);
}
/** Tracks the fall in progress; returns the distance fallen when the creeper lands (else 0). */
function landed(e:Entity,b:Brain):number{
  let fell=0;
  if(e.inWater||e.inLava)b.fall=0;
  else if(e.onGround){fell=b.fall;b.fall=0;}
  else if(e.y<b.prevY)b.fall+=b.prevY-e.y;
  b.prevY=e.y;
  return fell;
}
function tickCreeper(e:Entity,game:Game){
  if(peacefulRemove(game,e))return;
  const b=brain(e);
  tickTimers(e,b);
  const has=updateTarget(game,e,b,CREEPER_FOLLOW,T);
  const dist=has?Math.hypot(T.x-e.x,T.y-e.y,T.z-e.z):Infinity,ignited=e.data.ignited===true;
  const swelling=b.swellDir>0;
  const active=ignited||swelling||has&&dist<SWELL_START;
  const dir=creeperSwellDir(has,dist,has&&b.sight,swelling,ignited);
  b.swellDir=dir;
  if(active){
    game.entities.ai.stop(e);
    if(has)game.entities.ai.lookAt(e,T.x,T.y+T.eye,T.z);
  }else if(has)chase(game,e,b,T,chaseSpeed);
  else idle(game,e,b,strollSpeed);
  floatInLiquid(game,e);
  avoidHazards(game,e);
  // Creeper.tick: apply the swell.
  let swell=typeof e.data.swell==='number'?e.data.swell:0;
  // Creeper.causeFallDamage: a landing adds 1.5 swell ticks per block fallen, capped 5 short of the fuse.
  const fell=landed(e,b);
  if(fell>0){swell+=Math.floor(fell*1.5);if(swell>CREEPER_FUSE-5)swell=CREEPER_FUSE-5;}
  if(dir>0&&swell===0)game.sounds.play('fuse',{x:e.x,y:e.y+1,z:e.z},{pitch:.5});
  swell=Math.max(0,swell+dir);
  if(swell>=CREEPER_FUSE){e.data.swell=CREEPER_FUSE;explode(game,e);return;}
  e.data.swell=swell;
}
function creeperDrops(game:Game):ItemStack[]{
  const n=Math.floor(game.random()*3);
  return n>0?[stack('gunpowder',n)]:[];
}
const DATA={charged:'bool',ignited:'bool',swell:[0,CREEPER_FUSE]} as const;
export function creeperKind():EntityKind{
  return{
    kind:'creeper',category:'hostile',width:.6,height:1.7,maxHealth:20,model:creeperModel(),
    sounds:{name:'creeper',ambient:false},despawns:true,xp:5,
    spawn:{light:'dark',group:[4,4],weight:100},
    init(e,_game,reason){
      if(reason==='restore'){const d=cleanData(e.data,DATA);for(const k of Object.keys(e.data))delete e.data[k];Object.assign(e.data,d);}
      brain(e).swellDir=-1;
    },
    tick:tickCreeper,
    hurt(e,game,source){retaliate(e,game,source);},
    interact(e,game,held){
      if(held?.id!=='flint_and_steel'||e.deathTime>0)return false;
      game.sounds.play('ignite',{x:e.x,y:e.y+1,z:e.z},{pitch:game.random()*.4+.8});
      e.data.ignited=true;
      game.inventory.damageHeld(1);
      return true;
    },
    drops:(_e,game)=>creeperDrops(game),
    restoreData:data=>cleanData(data,DATA)
  };
}
