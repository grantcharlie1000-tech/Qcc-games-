// Melee combat in the modern (1.9+) Java style: attack cooldown from the weapon's attack speed, damage scaled by the
// charge, critical hits while falling, sprint knockback and sword sweeps.
import {itemDef,type ItemStack} from '../data/items';
import type {Entity,Game} from '../engine/contracts';

/** The bare hand (and any non-tool item): 1 damage, 4 attacks per second. */
export const HAND={damage:1,attackSpeed:4} as const;
/** Knockback in blocks/second: every hit (vanilla 0.4 blocks/tick) and a charged sprinting hit (0.4/2 + 0.5 blocks/tick). */
export const BASE_KNOCKBACK=8,SPRINT_KNOCKBACK=14;
/** Exhaustion added by a successful hit. */
export const ATTACK_EXHAUSTION=.1;

export function weaponStats(held:ItemStack|null):{damage:number;attackSpeed:number}{
  const tool=held?itemDef(held.id)?.tool:undefined;
  return tool?{damage:tool.damage,attackSpeed:tool.attackSpeed}:{damage:HAND.damage,attackSpeed:HAND.attackSpeed};
}
/** Ticks for a full charge: 20 / attackSpeed. */
export const cooldownTicks=(attackSpeed:number)=>20/attackSpeed;
/** Charge 0..1 after `ticks` since the last attack (plus a partial tick). */
export function attackStrength(ticks:number,attackSpeed:number,partial=0):number{
  return Math.max(0,Math.min(1,(ticks+partial)/cooldownTicks(attackSpeed)));
}
/** Vanilla damage scaling: damage × (0.2 + charge² × 0.8). */
export const scaledDamage=(damage:number,strength:number)=>damage*(.2+strength*strength*.8);
export interface CritState{fallDistance:number;onGround:boolean;onLadder:boolean;inWater:boolean;sprinting:boolean}
/** Critical hit: charged above 0.9 while falling, airborne, not climbing, swimming or sprinting. */
export const isCritical=(strength:number,p:CritState)=>strength>.9&&p.fallDistance>0&&!p.onGround&&!p.onLadder&&!p.inWater&&!p.sprinting;
/** Durability lost by the held item for one hit: swords 1, other tools 2 (shears and items none). */
export function hitWear(held:ItemStack|null):number{
  const kind=held?itemDef(held.id)?.tool?.kind:undefined;
  return kind==='sword'?1:kind&&kind!=='shears'?2:0;
}
/** Sweeps need a sword, a charged hit and the player standing or walking on the ground (not sprinting). */
const SWEEP_MAX_SPEED=4.5;

export interface Combat{
  /** Ticks since the last attack (vanilla attackStrengthTicker). */
  readonly ticks:number;
  /** Current charge 0..1 with `partial` ticks of interpolation. */
  charge(partial?:number):number;
  tick():void;
  /** Restart the cooldown (missed swing, new item in hand). */
  reset():void;
  /** Melee attack on an entity with the held item. */
  attack(target:Entity):void;
}
export function createCombat(game:Game):Combat{
  let ticks=0;
  const near:Entity[]=[];
  const combat:Combat={
    get ticks(){return ticks;},
    charge(partial=0){return attackStrength(ticks,weaponStats(game.inventory.held()).attackSpeed,partial);},
    tick(){ticks++;},
    reset(){ticks=0;},
    attack(target){
      const held=game.inventory.held(),stats=weaponStats(held),strength=attackStrength(ticks,stats.attackSpeed,.5);
      ticks=0;game.render.swing();
      const p=game.player.state,charged=strength>.9,at={x:p.x,y:p.y,z:p.z};
      let damage=scaledDamage(stats.damage,strength);
      const sprintHit=p.sprinting&&charged,crit=isCritical(strength,p);
      if(crit)damage*=1.5;
      const sword=itemDef(held?.id??'')?.tool?.kind==='sword';
      const sweep=charged&&!crit&&!sprintHit&&p.onGround&&Math.hypot(p.vx,p.vz)<SWEEP_MAX_SPEED&&sword;
      // Knockback pushes along the look direction (vanilla sin/cos of the yaw).
      const kx=-Math.sin(p.yaw),kz=-Math.cos(p.yaw);
      const hit=game.entities.damage(target,damage,{kind:'player',byPlayer:true,knockback:{x:kx,z:kz,strength:sprintHit?SPRINT_KNOCKBACK:BASE_KNOCKBACK}});
      if(!hit){game.sounds.play('attack_weak',at,{volume:.5});return;}
      if(sprintHit){game.player.push(-p.vx*.4,0,-p.vz*.4);p.sprinting=false;}
      if(sweep){
        const box={minX:target.x-target.width/2-1,maxX:target.x+target.width/2+1,minY:target.y-.25,maxY:target.y+target.height+.25,minZ:target.z-target.width/2-1,maxZ:target.z+target.width/2+1};
        game.entities.near(target.x,target.y+target.height/2,target.z,3+target.width,e=>{
          if(e===target||e.removed||e.deathTime>0||(e.category!=='passive'&&e.category!=='hostile'&&e.category!=='water'))return false;
          const hw=e.width/2;
          if(e.x+hw<box.minX||e.x-hw>box.maxX||e.z+hw<box.minZ||e.z-hw>box.maxZ||e.y+e.height<box.minY||e.y>box.maxY)return false;
          return (e.x-p.x)**2+(e.y-p.y)**2+(e.z-p.z)**2<9;
        },near);
        for(const e of near)game.entities.damage(e,1,{kind:'player',byPlayer:true,knockback:{x:kx,z:kz,strength:BASE_KNOCKBACK}});
        near.length=0;
        game.sounds.play('sweep',at);
        const eye=game.player.eye();game.render.spawnParticles('sweep',eye.x+kx,p.y+game.player.height*.5,eye.z+kz,{count:1});
      }
      if(crit){
        game.sounds.play('crit',at);
        game.render.spawnParticles('crit',target.x,target.y+target.height*.5,target.z,{count:24,spread:Math.max(.25,target.width/2)});
      }
      if(sprintHit||!crit&&!sweep)game.sounds.play(charged?'attack_strong':'attack_weak',at);
      if(damage>2)game.render.spawnParticles('damage',target.x,target.y+target.height*.5,target.z,{count:Math.floor(damage*.5),spread:.1});
      const wear=hitWear(held);if(wear)game.inventory.damageHeld(wear);
      game.survival.addExhaustion(ATTACK_EXHAUSTION);
    }
  };
  return combat;
}
