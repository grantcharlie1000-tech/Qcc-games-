// Explosions after vanilla Java 1.20 Explosion.explode / finalizeExplosion:
//  - 1352 rays from the centre toward the surface of a 16×16×16 cube. Each starts with power × (0.7..1.3) and steps 0.3
//    blocks, losing 0.225 per step plus (resistance + 0.3) × 0.3 in every non-air block; a block is blown while power is left.
//    Liquids resist 100, so an explosion in water breaks nothing.
//  - Entities and the player within 2 × power: impact = (1 - distance / (2 × power)) × exposure (the share of rays from
//    points on their box to the centre that no solid block stops); damage floor((impact² + impact) / 2 × 7 × 2 × power + 1)
//    and a push of impact along the direction from the centre (to the eyes; to the feet for TNT).
//  - Blown blocks drop their no-tool loot: all of them for primed TNT (gamerule tntExplosionDropDecay is false since 1.19.3),
//    with chance 1 / power for other sources (creepers, no source); TNT is primed with a 10-29 tick fuse; with `fire`, one in
//    three cleared cells over an opaque block catches fire.
import {AIR,BLOCKS,OPAQUE,SOLID,LIQUID} from '../data/blocks';
import {CH} from '../engine/constants';
import {raycast} from '../engine/physics';
import type {BlockSource,DamageSource,Entity} from '../engine/contracts';
import {keyX,keyY,keyZ,posKey,type Sim} from './ticks-core';
import {TNT} from './fire';

const RESISTANCE=new Float32Array(256);
for(const d of BLOCKS)RESISTANCE[d.id]=Math.max(0,d.blastResistance);
/** Unit directions toward the 16×16×16 cube surface (Float32 like vanilla's float arithmetic). */
const RAYS=(()=>{
  const out:number[]=[];
  for(let i=0;i<16;i++)for(let j=0;j<16;j++)for(let k=0;k<16;k++){
    if(i&&i<15&&j&&j<15&&k&&k<15)continue;
    let x=i/15*2-1,y=j/15*2-1,z=k/15*2-1;const len=Math.sqrt(x*x+y*y+z*z);x/=len;y/=len;z/=len;
    out.push(x,y,z);
  }
  return new Float64Array(out);
})();
export const RAY_COUNT=RAYS.length/3;
const STEP=.3,DECAY=.22500001;
const passSolid=(id:number)=>!SOLID[id];

/** Share (0..1) of the sample points on a box that see (x,y,z) without a solid block in between (vanilla getSeenPercent). */
export function exposure(world:BlockSource,x:number,y:number,z:number,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):number{
  const sx=1/((maxX-minX)*2+1),sy=1/((maxY-minY)*2+1),sz=1/((maxZ-minZ)*2+1);
  if(!(sx>0&&sy>0&&sz>0))return 0;
  const ox=(1-Math.floor(1/sx)*sx)/2,oz=(1-Math.floor(1/sz)*sz)/2;
  let seen=0,total=0;
  for(let a=0;a<=1;a+=sx)for(let b=0;b<=1;b+=sy)for(let c=0;c<=1;c+=sz){
    const px=minX+(maxX-minX)*a+ox,py=minY+(maxY-minY)*b,pz=minZ+(maxZ-minZ)*c+oz;
    const dx=x-px,dy=y-py,dz=z-pz,len=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(len<1e-6||!raycast(world,px,py,pz,dx/len,dy/len,dz/len,len-1e-3,passSolid))seen++;
    total++;
  }
  return total?seen/total:0;
}

const blown:number[]=[],blownSet=new Set<number>(),nearby:Entity[]=[];
/** Runs one explosion; returns the number of blocks destroyed. */
export function explode(sim:Sim,x:number,y:number,z:number,power:number,source:Entity|null,byPlayer:boolean,fire:boolean):number{
  if(!(power>0)||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return 0;
  power=Math.min(power,32);
  const w=sim.blocks,game=sim.game;
  blown.length=0;blownSet.clear();
  for(let r=0;r<RAYS.length;r+=3){
    const dx=RAYS[r]*STEP,dy=RAYS[r+1]*STEP,dz=RAYS[r+2]*STEP;
    let f=power*(.7+sim.rand()*.6),px=x,py=y,pz=z;
    while(f>0){
      const bx=Math.floor(px),by=Math.floor(py),bz=Math.floor(pz);
      if(by<0||by>=CH)break;
      const id=w.get(bx,by,bz);
      if(id<0)break;
      if(id!==AIR){
        f-=(RESISTANCE[id]+.3)*.3;
        if(f>0){const key=posKey(bx,by,bz);if(!blownSet.has(key)){blownSet.add(key);blown.push(key);}}
      }
      px+=dx;py+=dy;pz+=dz;f-=DECAY;
    }
  }
  // Copy first: hooks run while hurting entities may start another explosion.
  const keys=blown.slice();
  hurtAround(sim,x,y,z,power,source,byPlayer);
  // Vanilla 1.20 gamerules: tntExplosionDropDecay false (TNT drops all it breaks), mob and block explosions decay.
  let destroyed=0;const chance=source?.kind==='primed_tnt'?1:1/power;
  for(const key of keys){
    const bx=keyX(key),by=keyY(key),bz=keyZ(key),id=w.get(bx,by,bz);
    if(id<=0)continue;
    if(id===TNT){
      if(sim.set(bx,by,bz,AIR,'explosion')){destroyed++;sim.primeTnt(bx,by,bz,10+sim.randInt(20),byPlayer,source);}
      continue;
    }
    const drop=!LIQUID[id]&&(chance>=1||sim.rand()<chance);
    if(!sim.set(bx,by,bz,AIR,'explosion'))continue;
    destroyed++;
    if(drop)sim.dropLoot(id,bx,by,bz,'explosion');
  }
  if(fire)for(const key of keys){
    const bx=keyX(key),by=keyY(key),bz=keyZ(key);
    if(sim.randInt(3)===0&&w.get(bx,by,bz)===AIR&&OPAQUE[Math.max(0,w.get(bx,by-1,bz))]===1)sim.placeFire(bx,by,bz,0);
  }
  const c=sim.cosmetic;
  game.render.spawnParticles('explosion',x,y,z,{count:power>=2?12:4,spread:power>=2?Math.min(2,power/2):.3});
  // Vanilla Explosion plays GENERIC_EXPLODE at volume 4: heard 64 blocks away.
  game.sounds.play('explode',{x,y,z},{volume:4,pitch:(1+(c()-c())*.2)*.7});
  return destroyed;
}

function hurtAround(sim:Sim,x:number,y:number,z:number,power:number,source:Entity|null,byPlayer:boolean){
  const game=sim.game,w=sim.blocks,reach=power*2;
  const damageSource:DamageSource={kind:'explosion',attacker:source,byPlayer};
  const list=game.entities.near(x,y,z,reach+2,undefined,nearby).slice();
  for(const e of list){
    if(e===source||e.removed||e.deathTime>0)continue;
    const dist=Math.hypot(e.x-x,e.y-y,e.z-z)/reach;
    if(dist>1)continue;
    let dx=e.x-x,dy=(e.kind==='primed_tnt'?e.y:e.y+e.height*.85)-y,dz=e.z-z;
    const len=Math.hypot(dx,dy,dz);if(len===0)continue;
    dx/=len;dy/=len;dz/=len;
    const hw=e.width/2,impact=(1-dist)*exposure(w,x,y,z,e.x-hw,e.y,e.z-hw,e.x+hw,e.y+e.height,e.z+hw);
    // Primed TNT and falling blocks ignore damage (vanilla Entity.hurt) but are still thrown.
    if(e.kind!=='primed_tnt'&&e.kind!=='falling_block')game.entities.damage(e,Math.floor((impact*impact+impact)/2*7*reach+1),damageSource);
    if(!e.removed){e.vx+=dx*impact*20;e.vy+=dy*impact*20;e.vz+=dz*impact*20;}
  }
  if(game.survival.dead)return;
  const p=game.player.state,dist=Math.hypot(p.x-x,p.y-y,p.z-z)/reach;
  if(dist>1)return;
  let dx=p.x-x,dy=game.player.eye().y-y,dz=p.z-z;
  const len=Math.hypot(dx,dy,dz);if(len===0)return;
  dx/=len;dy/=len;dz/=len;
  const hw=game.player.width/2,h=game.player.height;
  const impact=(1-dist)*exposure(w,x,y,z,p.x-hw,p.y,p.z-hw,p.x+hw,p.y+h,p.z+hw);
  game.survival.damage(Math.floor((impact*impact+impact)/2*7*reach+1),damageSource);
  game.player.push(dx*impact*20,dy*impact*20,dz*impact*20);
}
