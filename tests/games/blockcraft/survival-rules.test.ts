import {describe,expect,it} from 'vitest';
import {damageAfterArmor,damageTypeOf,deathMessage,deathXp,entityName,fallDamage,scaleForDifficulty,totalXpForLevel,xpToNextLevel,
  DAMAGE_TYPES} from '../../../src/games/blockcraft/player/survival-rules';
import type {Entity} from '../../../src/games/blockcraft/engine/contracts';

const mob=(kind:string,data:Record<string,unknown>={})=>({kind,category:'hostile',data} as unknown as Entity);

describe('difficulty scaling (vanilla Player.hurt)',()=>{
  it('peaceful removes mob damage, easy halves plus one, hard multiplies by 1.5',()=>{
    expect(scaleForDifficulty(6,'peaceful')).toBe(0);
    expect(scaleForDifficulty(6,'easy')).toBe(4);
    expect(scaleForDifficulty(1,'easy')).toBe(1);// min(amount/2+1, amount)
    expect(scaleForDifficulty(2,'easy')).toBe(2);
    expect(scaleForDifficulty(6,'normal')).toBe(6);
    expect(scaleForDifficulty(6,'hard')).toBe(9);
    expect(scaleForDifficulty(2.5,'hard')).toBeCloseTo(3.75);
  });
});

describe('armour (CombatRules.getDamageAfterAbsorb)',()=>{
  it('applies damage × (1 − min(20, max(defense/5, defense − damage/(2 + toughness/4)))/25)',()=>{
    expect(damageAfterArmor(10,0,0)).toBe(10);
    // full iron: 15 points, no toughness. 15 - 5/2 = 12.5 → 50 %.
    expect(damageAfterArmor(5,15,0)).toBeCloseTo(2.5);
    // full diamond: 20 points, 8 toughness. 20 - 10/4 = 17.5 → 70 %.
    expect(damageAfterArmor(10,20,8)).toBeCloseTo(3);
    // a huge hit only gets the defense/5 floor.
    expect(damageAfterArmor(100,20,0)).toBeCloseTo(84);
    // the reduction is capped at 80 %.
    expect(damageAfterArmor(1,30,0)).toBeCloseTo(.2);
  });
});

describe('experience (vanilla level formula)',()=>{
  it('points needed for the next level follow the three bands',()=>{
    expect(xpToNextLevel(0)).toBe(7);
    expect(xpToNextLevel(14)).toBe(35);
    expect(xpToNextLevel(15)).toBe(37);
    expect(xpToNextLevel(29)).toBe(107);
    expect(xpToNextLevel(30)).toBe(112);
    expect(xpToNextLevel(31)).toBe(121);
  });
  it('total points to reach a level match the closed forms and the running sum',()=>{
    expect(totalXpForLevel(0)).toBe(0);
    expect(totalXpForLevel(16)).toBe(352);
    expect(totalXpForLevel(30)).toBe(1395);
    expect(totalXpForLevel(31)).toBe(1507);
    expect(totalXpForLevel(32)).toBe(1628);
    let sum=0;
    for(let level=0;level<60;level++){expect(totalXpForLevel(level)).toBe(sum);sum+=xpToNextLevel(level);}
  });
  it('death drops 7 points per level, at most 100',()=>{
    expect(deathXp(0)).toBe(0);expect(deathXp(5)).toBe(35);expect(deathXp(14)).toBe(98);expect(deathXp(15)).toBe(100);expect(deathXp(40)).toBe(100);
  });
});

describe('fall damage',()=>{
  it('is ceil(distance − 3) and ignores floating point noise',()=>{
    expect(fallDamage(1.25)).toBe(0);expect(fallDamage(3)).toBe(0);expect(fallDamage(3.4)).toBe(1);expect(fallDamage(4)).toBe(1);
    expect(fallDamage(4+1e-9)).toBe(1);expect(fallDamage(5.5)).toBe(3);expect(fallDamage(23)).toBe(20);expect(fallDamage(Number.NaN)).toBe(0);
  });
});

describe('damage types',()=>{
  it('maps sources to vanilla damage types with armour, exhaustion and fire properties',()=>{
    expect(damageTypeOf({kind:'projectile'})).toBe('arrow');
    expect(damageTypeOf({kind:'projectile',projectile:mob('snowball')})).toBe('thrown');
    expect(damageTypeOf({kind:'fire'})).toBe('on_fire');
    expect(damageTypeOf({kind:'mob'})).toBe('mob');
    expect(DAMAGE_TYPES.fall.bypassArmor).toBe(true);
    expect(DAMAGE_TYPES.drown.bypassArmor).toBe(true);
    expect(DAMAGE_TYPES.lava.bypassArmor).toBe(false);
    expect(DAMAGE_TYPES.in_fire.bypassArmor).toBe(false);
    expect(DAMAGE_TYPES.on_fire.bypassArmor).toBe(true);
    expect(DAMAGE_TYPES.mob.exhaustion).toBe(.1);
    expect(DAMAGE_TYPES.starve.exhaustion).toBe(0);
    expect(DAMAGE_TYPES.lava.fire&&DAMAGE_TYPES.in_fire.fire&&DAMAGE_TYPES.on_fire.fire).toBe(true);
    expect(DAMAGE_TYPES.lightning.fire).toBe(false);
    expect(DAMAGE_TYPES.void.bypassCreative).toBe(true);
    expect(DAMAGE_TYPES.mob.bypassCreative).toBe(false);
  });
});

describe('death messages (vanilla en_us)',()=>{
  it('names the cause in the second person',()=>{
    expect(deathMessage({type:'fall',fallDistance:12})).toBe('You fell from a high place');
    expect(deathMessage({type:'fall',fallDistance:4})).toBe('You hit the ground too hard');
    expect(deathMessage({type:'drown'})).toBe('You drowned');
    expect(deathMessage({type:'lava'})).toBe('You tried to swim in lava');
    expect(deathMessage({type:'in_fire'})).toBe('You went up in flames');
    expect(deathMessage({type:'on_fire'})).toBe('You burned to death');
    expect(deathMessage({type:'starve'})).toBe('You starved to death');
    expect(deathMessage({type:'void'})).toBe('You fell out of the world');
    expect(deathMessage({type:'cactus'})).toBe('You were pricked to death');
    expect(deathMessage({type:'suffocate'})).toBe('You suffocated in a wall');
    expect(deathMessage({type:'magic'})).toBe('You were killed by magic');
    expect(deathMessage({type:'lightning'})).toBe('You were struck by lightning');
    expect(deathMessage({type:'explosion'})).toBe('You blew up');
  });
  it('names the attacker',()=>{
    expect(deathMessage({type:'mob',attacker:'Zombie'})).toBe('You were slain by Zombie');
    expect(deathMessage({type:'explosion',attacker:'Creeper'})).toBe('You were blown up by Creeper');
    expect(deathMessage({type:'arrow',attacker:'Skeleton'})).toBe('You were shot by Skeleton');
    expect(deathMessage({type:'arrow',projectile:'Arrow'})).toBe('You were shot by Arrow');
    expect(deathMessage({type:'thrown',attacker:'Stray'})).toBe('You were pelted by Stray');
    expect(deathMessage({type:'magic',attacker:'Husk'})).toBe('You were killed by Husk using magic');
  });
  it('credits a recent attacker for environmental deaths',()=>{
    expect(deathMessage({type:'drown',credit:'Drowned'})).toBe('You drowned whilst trying to escape Drowned');
    expect(deathMessage({type:'lava',credit:'Zombie'})).toBe('You tried to swim in lava to escape Zombie');
    expect(deathMessage({type:'void',credit:'Enderman'})).toBe("You didn't want to live in the same world as Enderman");
    expect(deathMessage({type:'fall',fallDistance:3.5,credit:'Spider'})).toBe('You hit the ground too hard whilst trying to escape Spider');
  });
  it('uses the assisted-fall messages after a hit',()=>{
    expect(deathMessage({type:'fall',fallDistance:9,fallAssist:{attacker:'Skeleton'}})).toBe('You were doomed to fall by Skeleton');
    expect(deathMessage({type:'fall',fallDistance:9,fallAssist:{attacker:null}})).toBe('You were doomed to fall');
  });
  it('supports a third-person subject',()=>{
    expect(deathMessage({type:'mob',attacker:'Zombie'},'Steve')).toBe('Steve was slain by Zombie');
    expect(deathMessage({type:'drown'},'Steve')).toBe('Steve drowned');
  });
  it('derives entity display names',()=>{
    expect(entityName(mob('zombie'))).toBe('Zombie');
    expect(entityName(mob('ender_pearl'))).toBe('Ender Pearl');
    expect(entityName(mob('cow',{variant:'mooshroom'}))).toBe('Mooshroom');
  });
});
