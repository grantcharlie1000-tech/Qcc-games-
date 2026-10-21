// Enderman (Java 1.20 behaviour): a neutral 2.9-block-tall monster that
//  - turns hostile when the player stares at its head (a look ray against the head box, within 64 blocks, not through blocks)
//    for a quarter second, or when the player hurts it; angry, it opens its jaw, shakes, chases at about 8.7 blocks/second
//    and hits for 7; while stared at within 16 blocks it freezes, within 4 it teleports away, and beyond 16 it teleports toward
//    a player who looks away;
//  - teleports at random in bright daylight under the open sky, when hurt by the environment (water and rain hurt it) and
//    always dodges projectiles (its hurt hook cancels them), only onto safe dry ground (findTeleportTarget);
//  - strolls calmly to dry spots only (vanilla WaterAvoidingRandomStrollGoal) and looks at players within 8 blocks;
//  - picks up and puts down earth, sand, gravel, clay, plants, cacti, pumpkins, melons and TNT (data.carried holds the BlockId);
//  - drops 0–1 ender pearl (and its carried block) and gives 5 xp.
import {AIR,B,COLLISION_BOXES,FULL_CUBE,LIQUID,SOLID,blockId,type BlockId} from '../data/blocks';
import {BIOMES} from '../data/biomes';
import {itemForBlock,stack,type ItemStack} from '../data/items';
import {CH} from '../engine/constants';
import {boxCollides,rayBox,raycast} from '../engine/physics';
import {canSurvive} from '../engine/support';
import type {BlockSource,DamageSource,Entity,EntityKind,Game,ParticleOptions,Vec3} from '../engine/contracts';
import {gameRandom,meleeSource,noise,playerDistanceSq,playerTargetable,randInt,uniformCount} from './monsters-common';
import {ENDERMAN_HEAD_PX,createEndermanModel} from './monsters-models';

export const ENDERMAN_WIDTH=.6,ENDERMAN_HEIGHT=2.9,ENDERMAN_HEALTH=40,ENDERMAN_DAMAGE=7,ENDERMAN_XP=5;
/** Eye height (vanilla 2.55). */
export const ENDERMAN_EYE=2.55;
/** Head box in blocks above the feet (horizontal half size `half`), matching the model's head cube. */
export const ENDERMAN_HEAD={bottom:ENDERMAN_HEAD_PX.bottom/16,top:ENDERMAN_HEAD_PX.top/16,half:.25} as const;
/** Movement: vanilla speed attribute 0.3 calm and 0.45 angry, about 3.9 and 8.7 blocks/second on the ground. */
export const WALK_SPEED=3.9,ANGRY_SPEED=8.7;
export const STARE_RANGE=64;
/** Ticks of continuous staring before it turns angry (vanilla aggro delay). */
export const STARE_DELAY=5;
const ATTACK_REACH_SQ=2.04,ATTACK_COOLDOWN=20,FREEZE_RANGE_SQ=256,CLOSE_STARE_SQ=16,TELEPORT_TOWARD_DELAY=30;
/** Persistent anger: 20–39 seconds once the player is out of reach. */
const ANGER_MIN=400,ANGER_SPREAD=380;
const DAY_TELEPORT_AFTER=600,TAKE_CHANCE=1/20,PLACE_CHANCE=1/2000,PARTICLE_RANGE_SQ=32*32,LOOK_RANGE_SQ=64;

/** Vanilla `enderman_holdable` blocks that exist in this game. */
export const HOLDABLE_BLOCKS=['grass_block','dirt','coarse_dirt','podzol','mycelium','moss_block','sand','red_sand','gravel','clay',
  'brown_mushroom','red_mushroom','cactus','pumpkin','melon','tnt','dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy'] as const;
const HOLDABLE=new Uint8Array(256);
for(const name of HOLDABLE_BLOCKS)HOLDABLE[blockId(name)]=1;
export const isHoldable=(id:unknown):id is BlockId=>typeof id==='number'&&Number.isInteger(id)&&id>0&&id<256&&HOLDABLE[id]===1;
const FIRE=blockId('fire'),CACTUS=blockId('cactus');

export interface EndermanData{
  /** The block held between its hands. */
  carried?:BlockId;
  /** Hostile toward the player right now (open jaw, shaking). */
  angry:boolean;
  /** Persistent anger ticks left once the player is out of reach. */
  anger:number;
  /** Ticks left of a pending stare before anger (0 = none). */
  stare:number;
  /** Ticks since it last acquired a target (or its age when it has none). */
  since:number;
  /** Ticks the player has been far and looking away (teleport toward after 30). */
  tp:number;
  cooldown:number;
  /** Arm swing animation ticks after an attack. */
  swing:number;
  /** Ticks left looking at a nearby player while calm. */
  look:number;
}
const data=(e:Entity)=>e.data as unknown as EndermanData;
const count=(v:unknown,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max?v:0;

// ---- Stare detection ----------------------------------------------------------------------------
/** Passes the look ray through everything without collision (air, liquids, plants, torches); glass and leaves block it. */
const seeThrough=(id:number)=>SOLID[id]!==1;
/** Distance along the look ray at which it enters the enderman's head box, with a clear line of sight and within 64 blocks; -1 otherwise. */
export function stareDistance(world:BlockSource,eye:Vec3,look:Vec3,e:Entity):number{
  const hw=ENDERMAN_HEAD.half,minY=e.y+ENDERMAN_HEAD.bottom,maxY=e.y+ENDERMAN_HEAD.top;
  const cx=e.x-eye.x,cy=(minY+maxY)/2-eye.y,cz=e.z-eye.z;
  if(cx*cx+cy*cy+cz*cz>STARE_RANGE*STARE_RANGE)return -1;
  const t=rayBox(eye.x,eye.y,eye.z,look.x,look.y,look.z,e.x-hw,minY,e.z-hw,e.x+hw,maxY,e.z+hw);
  if(t<0||t>STARE_RANGE)return -1;
  return raycast(world,eye.x,eye.y,eye.z,look.x,look.y,look.z,t,seeThrough)?-1:t;
}
/** Is the player looking at this enderman's head right now? A cheap view-cone test runs before the exact ray. */
export function isStaredAt(game:Game,e:Entity):boolean{
  const p=game.player.state,cp=Math.cos(p.pitch),lx=-Math.sin(p.yaw)*cp,ly=Math.sin(p.pitch),lz=-Math.cos(p.yaw)*cp;
  const dx=e.x-p.x,dy=e.y+(ENDERMAN_HEAD.bottom+ENDERMAN_HEAD.top)/2-p.y-game.player.eyeHeight(),dz=e.z-p.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(d>STARE_RANGE+1)return false;
  if(d>2&&dx*lx+dy*ly+dz*lz<d*.8)return false;
  return stareDistance(game.world,game.player.eye(),game.player.look(),e)>=0;
}

// ---- Teleporting --------------------------------------------------------------------------------
/** Feet position for a teleport aimed at (x, y, z), or null. Vanilla rules: drop straight down to the first block with
 *  collision, stand on its top; the chunk must be loaded and the body must fit without touching any liquid. Also refused
 *  here: cacti and fire, and (while it rains) spots where rain falls on the feet or head. */
export function findTeleportTarget(game:Game,x:number,y:number,z:number,width:number,height:number):Vec3|null{
  const w=game.world;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z)||!w.isLoaded(x,z))return null;
  const bx=Math.floor(x),bz=Math.floor(z);
  let fy=Math.min(CH-1,Math.floor(y));
  if(fy<1)return null;
  while(fy>1&&SOLID[Math.max(0,w.get(bx,fy-1,bz))]!==1)fy--;
  const ground=w.get(bx,fy-1,bz);
  if(ground<=0||SOLID[ground]!==1||ground===CACTUS)return null;
  const boxes=COLLISION_BOXES[ground];let top=0;
  for(let i=4;i<boxes.length;i+=6)if(boxes[i]>top)top=boxes[i];
  const feet=fy-1+top,hw=width/2;
  if(boxCollides(w,x-hw,feet,z-hw,x+hw,feet+height,z+hw))return null;
  const x1=Math.floor(x+hw-1e-4),y1=Math.floor(feet+height-1e-4),z1=Math.floor(z+hw-1e-4);
  for(let cy=Math.floor(feet);cy<=y1;cy++)for(let cz=Math.floor(z-hw);cz<=z1;cz++)for(let cx=Math.floor(x-hw);cx<=x1;cx++){
    const id=w.get(cx,cy,cz);
    if(id<0||LIQUID[id]||id===FIRE)return null;
  }
  if(game.weather.state!=='clear'&&(game.weather.isRainingOn(bx,Math.floor(feet),bz)||game.weather.isRainingOn(bx,Math.floor(feet+height),bz)))return null;
  return{x,y:feet,z};
}
const TELEPORT_PARTICLES:ParticleOptions=Object.freeze({count:32,spread:.6,velocity:Object.freeze({x:0,y:-.5,z:0})});
function teleportEffects(game:Game,x:number,y:number,z:number,h:number){
  game.render.spawnParticles('portal',x,y+h/2,z,TELEPORT_PARTICLES);
  game.sounds.play('teleport',{x,y:y+h/2,z});
}
/** Teleports to the safe spot below (x, y, z) with portal particles and sound at both ends; false (and no move) when unsafe. */
export function teleportTo(game:Game,e:Entity,x:number,y:number,z:number):boolean{
  const t=findTeleportTarget(game,x,y,z,e.width,e.height);
  if(!t)return false;
  teleportEffects(game,e.x,e.y,e.z,e.height);
  e.x=t.x;e.y=t.y;e.z=t.z;e.vx=e.vy=e.vz=0;e.onGround=true;
  game.entities.ai.stop(e);STROLLS.delete(e);
  teleportEffects(game,e.x,e.y,e.z,e.height);
  return true;
}
/** One vanilla random teleport attempt: up to 32 blocks away horizontally and vertically. */
export function teleportRandomly(game:Game,e:Entity):boolean{
  const r=gameRandom(game);
  return teleportTo(game,e,e.x+(r()-.5)*64,e.y+randInt(r,64)-32,e.z+(r()-.5)*64);
}
/** One vanilla attempt to teleport about 16 blocks toward a point (the player's eyes). */
export function teleportTowards(game:Game,e:Entity,x:number,y:number,z:number):boolean{
  const r=gameRandom(game);
  let vx=e.x-x,vy=e.y+e.height/2-y,vz=e.z-z;const l=Math.sqrt(vx*vx+vy*vy+vz*vz)||1;vx/=l;vy/=l;vz/=l;
  return teleportTo(game,e,e.x+(r()-.5)*8-vx*16,e.y+randInt(r,16)-8-vy*16,e.z+(r()-.5)*8-vz*16);
}

// ---- Block carrying -----------------------------------------------------------------------------
/** Vanilla take-block goal: one random cell up to 2 blocks around and 0–2 above the feet; takes it when holdable and the first
 *  block on a straight line from its own column at that height. */
export function tryTakeBlock(game:Game,e:Entity,random:()=>number=gameRandom(game)):boolean{
  const d=data(e);
  if(d.carried!==undefined)return false;
  const x=Math.floor(e.x-2+random()*4),y=Math.floor(e.y+random()*3),z=Math.floor(e.z-2+random()*4);
  const w=game.world,id=w.get(x,y,z);
  if(!isHoldable(id))return false;
  const ox=Math.floor(e.x)+.5,oy=y+.5,oz=Math.floor(e.z)+.5,dx=x+.5-ox,dz=z+.5-oz,dist=Math.sqrt(dx*dx+dz*dz);
  if(dist>1e-6){
    const hit=raycast(w,ox,oy,oz,dx/dist,0,dz/dist,dist);
    if(!hit||hit.x!==x||hit.y!==y||hit.z!==z)return false;
  }
  if(!w.set(x,y,z,AIR,'entity'))return false;
  d.carried=id;
  return true;
}
const OCCUPANTS:Entity[]=[];
/** Does any entity (itself included) or the player overlap the unit cell? */
function cellOccupied(game:Game,x:number,y:number,z:number):boolean{
  const p=game.player.state,pw=game.player.width/2;
  if(p.x+pw>x&&p.x-pw<x+1&&p.z+pw>z&&p.z-pw<z+1&&p.y+game.player.height>y&&p.y<y+1)return true;
  for(const o of game.entities.near(x+.5,y+.5,z+.5,2,undefined,OCCUPANTS)){
    const hw=o.width/2;
    if(!o.removed&&o.x+hw>x&&o.x-hw<x+1&&o.z+hw>z&&o.z-hw<z+1&&o.y+o.height>y&&o.y<y+1){OCCUPANTS.length=0;return true;}
  }
  OCCUPANTS.length=0;
  return false;
}
/** Vanilla leave-block goal: one random cell within a block around and 0–1 above the feet; places the carried block into air on
 *  top of a full block (not bedrock) when the block can survive there and no entity or player is in the way. */
export function tryPlaceBlock(game:Game,e:Entity,random:()=>number=gameRandom(game)):boolean{
  const d=data(e),id=d.carried;
  if(!isHoldable(id))return false;
  const x=Math.floor(e.x-1+random()*2),y=Math.floor(e.y+random()*2),z=Math.floor(e.z-1+random()*2);
  const w=game.world,at=w.get(x,y,z),below=w.get(x,y-1,z);
  if(at!==AIR||below<=0||below===B.bedrock||FULL_CUBE[below]!==1||!canSurvive(w,id,x,y,z))return false;
  if(cellOccupied(game,x,y,z)||!w.set(x,y,z,id,'entity'))return false;
  delete d.carried;
  return true;
}

// ---- Water-avoiding stroll ----------------------------------------------------------------------
/** Can its body stand with the feet in cell (x, y, z): a solid dry floor (not a cactus), no liquid around the body, room for
 *  the whole height, and no hazard (the shared AI's safety test)? */
function dryStandable(game:Game,e:Entity,x:number,y:number,z:number):boolean{
  const w=game.world,below=w.get(x,y-1,z);
  if(below<=0||SOLID[below]!==1||LIQUID[below]||below===CACTUS)return false;
  const top=Math.ceil(e.height)-1;
  for(let dy=0;dy<=top;dy++){const id=w.get(x,y+dy,z);if(id<0||LIQUID[id])return false;}
  const hw=e.width/2;
  if(boxCollides(w,x+.5-hw,y,z+.5-hw,x+.5+hw,y+e.height,z+.5+hw))return false;
  return game.entities.ai.isSafe(x+.5,y,z+.5,e.width,e.height);
}
const STROLL_CHANCE=1/120,STROLL_TIMEOUT=400;
/** Vanilla WaterAvoidingRandomStrollGoal target: the darkest of ten random dry standable spots within 10 blocks
 *  horizontally and 7 vertically (monsters prefer darkness), each column searched 3 blocks up and down; null if none. */
export function strollTarget(game:Game,e:Entity,random:()=>number=gameRandom(game)):Vec3|null{
  const fx=Math.floor(e.x),fy=Math.floor(e.y+.01),fz=Math.floor(e.z);
  let best=-Infinity,bx=0,by=0,bz=0;
  for(let i=0;i<10;i++){
    const x=fx+randInt(random,21)-10,z=fz+randInt(random,21)-10,y0=fy+randInt(random,15)-7;
    for(let k=0;k<=6;k++){
      const y=y0+(k&1?-(k+1)/2:k/2);
      if(y<1||y>=CH-3||!dryStandable(game,e,x,y,z))continue;
      const v=.5-game.world.brightnessAt(x,y,z)/15;
      if(v>best){best=v;bx=x;by=y;bz=z;}
      break;
    }
  }
  return best===-Infinity?null:{x:bx+.5,y:by,z:bz+.5};
}
interface Stroll{x:number;y:number;z:number;ticks:number}
const STROLLS=new WeakMap<Entity,Stroll>();
/** Calm wandering: now and then walks (path-finding) to a dry stroll target; gives up after 20 s or on reaching it. */
function stroll(e:Entity,game:Game,random:()=>number){
  const ai=game.entities.ai,s=STROLLS.get(e);
  if(s){
    const arrived=Math.hypot(s.x-e.x,s.z-e.z)<.9&&Math.abs(s.y-e.y)<1.5;
    if(arrived||++s.ticks>STROLL_TIMEOUT){STROLLS.delete(e);ai.stop(e);}
    else ai.navigate(e,s.x,s.y,s.z,WALK_SPEED);
    return;
  }
  if(random()>=STROLL_CHANCE)return;
  const t=strollTarget(game,e,random);
  if(!t)return;
  STROLLS.set(e,{x:t.x,y:t.y,z:t.z,ticks:0});
  ai.navigate(e,t.x,t.y,t.z,WALK_SPEED);
}

// ---- Behaviour ----------------------------------------------------------------------------------
const WET:DamageSource=Object.freeze({kind:'drown'}) as DamageSource;
const AMBIENT_PORTAL:ParticleOptions=Object.freeze({count:2,spread:.35,velocity:Object.freeze({x:0,y:-.6,z:0})});
/** Vanilla light-dependent brightness 0..1 from a 0..15 light level. */
const magic=(light:number)=>{const v=light/15;return v/(4-3*v);};

function rainedOn(game:Game,e:Entity):boolean{
  if(game.weather.state==='clear')return false;
  const x=Math.floor(e.x),z=Math.floor(e.z);
  return game.weather.isRainingOn(x,Math.floor(e.y),z)||game.weather.isRainingOn(x,Math.floor(e.y+e.height),z);
}
function setAngry(e:Entity,on:boolean){
  const d=data(e);
  if(on===d.angry)return;
  d.angry=on;d.since=on?0:e.age;d.tp=0;
  if(!on)d.stare=0;
}
/** Turns it hostile toward the player (scream on the first provocation) with fresh persistent anger. */
export function provoke(e:Entity,game:Game){
  const d=data(e),fresh=!d.angry;
  setAngry(e,true);
  d.anger=ANGER_MIN+randInt(gameRandom(game),ANGER_SPREAD);d.stare=0;
  if(fresh)game.sounds.play('mob:enderman:ambient',{x:e.x,y:e.y+ENDERMAN_EYE,z:e.z},{volume:2,pitch:1.4});
}
function chase(e:Entity,game:Game,distSq:number){
  const d=data(e),p=game.player.state,ai=game.entities.ai;
  ai.navigate(e,p.x,p.y,p.z,ANGRY_SPEED);
  if(distSq<=ATTACK_REACH_SQ&&d.cooldown===0&&ai.canSee(e,p.x,p.y+game.player.eyeHeight(),p.z)){
    d.cooldown=ATTACK_COOLDOWN;d.swing=10;
    game.survival.damage(ENDERMAN_DAMAGE,meleeSource(e,game));
  }
}

export function tickEnderman(e:Entity,game:Game){
  const d=data(e),r=gameRandom(game),p=game.player.state,ai=game.entities.ai;
  const distSq=playerDistanceSq(e,game);
  if(distSq<PARTICLE_RANGE_SQ)game.render.spawnParticles('portal',e.x,e.y+noise(e.id,e.age,3)*e.height-.25,e.z,AMBIENT_PORTAL);
  // Water and rain hurt it; every attempt (even while invulnerable) may teleport it away, as in vanilla.
  if(e.inWater||rainedOn(game,e)){
    if(!game.entities.damage(e,1,WET)&&r()<.9)teleportRandomly(game,e);
    if(e.removed||e.deathTime>0)return;
  }
  d.since=Math.min(d.since+1,1e6);
  if(d.cooldown>0)d.cooldown--;
  if(d.swing>0)d.swing--;
  if(game.survival.dead){d.anger=0;setAngry(e,false);}
  const targetable=playerTargetable(game)&&distSq<=STARE_RANGE*STARE_RANGE;
  if(d.angry&&!targetable)setAngry(e,false);
  else if(!d.angry&&d.anger>0){d.anger--;if(targetable&&r()<.1)setAngry(e,true);}
  const stared=targetable&&isStaredAt(game,e);
  const eyeY=p.y+game.player.eyeHeight();
  if(!d.angry){
    if(stared){
      if(!d.stare)d.stare=STARE_DELAY;
      else if(--d.stare===0)provoke(e,game);
      ai.stop(e);ai.lookAt(e,p.x,eyeY,p.z);
    }else d.stare=0;
  }
  if(d.angry||d.stare)STROLLS.delete(e);
  if(d.angry){
    ai.lookAt(e,p.x,eyeY,p.z);
    if(stared){
      d.tp=0;
      if(distSq<CLOSE_STARE_SQ)teleportRandomly(game,e);
      if(playerDistanceSq(e,game)<=FREEZE_RANGE_SQ)ai.stop(e);
      else chase(e,game,playerDistanceSq(e,game));
    }else{
      if(distSq>FREEZE_RANGE_SQ&&++d.tp>=TELEPORT_TOWARD_DELAY&&teleportTowards(game,e,p.x,eyeY,p.z))d.tp=0;
      chase(e,game,playerDistanceSq(e,game));
    }
  }else if(!d.stare){
    stroll(e,game,r);
    if(d.look>0){d.look--;ai.lookAt(e,p.x,eyeY,p.z);}
    else if(distSq<LOOK_RANGE_SQ&&r()<.02)d.look=40+randInt(r,40);
  }
  if(d.carried===undefined){if(r()<TAKE_CHANCE)tryTakeBlock(game,e,r);}
  else if(r()<PLACE_CHANCE)tryPlaceBlock(game,e,r);
  // Bright daylight under the open sky: now and then it gives up its target and teleports.
  if(game.time.skyDarkening<4&&d.since>=DAY_TELEPORT_AFTER){
    const bx=Math.floor(e.x),bz=Math.floor(e.z),f=magic(game.world.brightnessAt(bx,Math.floor(e.y+ENDERMAN_EYE),bz));
    if(f>.5&&game.world.lightAt(bx,Math.floor(e.y),bz)>>4===15&&r()*30<(f-.4)*2){setAngry(e,false);teleportRandomly(game,e);}
  }
}

/** Projectiles never hurt it (it teleports away, trying up to 64 spots); a player's attack angers it; environmental damage
 *  (water, rain, fire, lava, cactus, falls) makes it teleport nine times in ten. */
export function hurtEnderman(e:Entity,game:Game,source:DamageSource):boolean{
  if(source.kind==='projectile'||source.projectile){
    for(let i=0;i<64;i++)if(teleportRandomly(game,e))break;
    return false;
  }
  if(source.byPlayer||source.kind==='player'){if(playerTargetable(game))provoke(e,game);}
  else if(!source.attacker&&game.random()<.9)teleportRandomly(game,e);
  return true;
}

export function createEndermanKind():EntityKind{
  return{
    kind:'enderman',category:'hostile',width:ENDERMAN_WIDTH,height:ENDERMAN_HEIGHT,maxHealth:ENDERMAN_HEALTH,
    model:createEndermanModel(),
    // Endermen step up a full block (vanilla maxUpStep 1).
    physics:{stepHeight:1},
    xp:ENDERMAN_XP,despawns:true,
    sounds:{name:'enderman',ambient:true,step:true},
    // Vanilla monster spawn entry: weight 10, groups of 1–4, in every biome with monsters (not mushroom fields).
    spawn:{light:'dark',group:[1,4],weight:10,biomes:BIOMES.filter(b=>b.name!=='mushroom_fields').map(b=>[b.name,10] as const)},
    init(e){
      const d=e.data;
      if(d.carried!==undefined&&!isHoldable(d.carried))delete d.carried;
      d.angry=d.angry===true;
      d.anger=count(d.anger,ANGER_MIN+ANGER_SPREAD);d.stare=count(d.stare,STARE_DELAY);d.since=count(d.since,1e6);
      d.tp=count(d.tp,TELEPORT_TOWARD_DELAY);d.cooldown=count(d.cooldown,ATTACK_COOLDOWN);d.swing=count(d.swing,10);d.look=count(d.look,80);
    },
    tick:tickEnderman,
    hurt:(e,game,source)=>hurtEnderman(e,game,source),
    drops(e,game){
      const out:ItemStack[]=[],pearls=uniformCount(gameRandom(game),0,1);
      if(pearls>0)out.push(stack('ender_pearl',pearls));
      const carried=data(e).carried;
      if(isHoldable(carried)){const item=itemForBlock(carried);if(item)out.push(stack(item.id));}
      return out;
    },
    restoreData(raw){
      const out:Record<string,unknown>={};
      if(isHoldable(raw.carried))out.carried=raw.carried;
      const anger=count(raw.anger,ANGER_MIN+ANGER_SPREAD);if(anger)out.anger=anger;
      return out;
    }
  };
}
