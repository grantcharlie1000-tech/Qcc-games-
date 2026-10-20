// STUB survival (owned by the survival agent: hunger, saturation, exhaustion, regeneration,
// starvation, fall/lava/fire/drowning damage, armour, XP, effects, death and respawn).
// This version: health and death only; creative ignores damage.
import type {DamageSource,EffectName,FoodStats,Game,StatusEffect,SurvivalService} from '../engine/contracts';

export function createSurvival(game:Game):SurvivalService{
  let health=20,dead=false,invulnerable=0;
  const s:SurvivalService={
    get health(){return health;},maxHealth:20,food:20,saturation:5,air:300,maxAir:300,absorption:0,xpLevel:0,xpProgress:0,xpTotal:0,
    get dead(){return dead;},burning:0,
    armorPoints:()=>0,
    damage(amount:number,source:DamageSource){
      if(dead||game.settings.mode==='creative'&&source.kind!=='void'||invulnerable>0||amount<=0)return 0;
      health=Math.max(0,health-amount);invulnerable=10;
      game.events.emit('playerDamaged',{amount,source});
      if(health<=0)s.kill(`You died (${source.kind})`);
      return amount;
    },
    heal(n){if(!dead)health=Math.min(20,health+n);},
    addExhaustion(){},eat(_f:FoodStats){},canEat:()=>false,addXp(){},addEffect(){},removeEffect(_n:EffectName){},clearEffects(){},
    effects:():StatusEffect[]=>[],hasEffect:()=>false,ignite(){},extinguish(){},
    land(distance){if(distance>3.5)s.damage(Math.floor(distance-3),{kind:'fall'});},
    respawn(){dead=false;health=20;invulnerable=0;},
    kill(message){if(dead)return;dead=true;health=0;game.events.emit('playerDied',{message});},
    tick(){if(invulnerable>0)invulnerable--;},
    reset(){dead=false;health=20;invulnerable=0;},
    serialize:()=>({health,dead}),
    restore(v){const d=v as {health?:unknown;dead?:unknown};if(typeof d?.health==='number'&&d.health>0&&d.health<=20)health=d.health;}
  };
  return s;
}
