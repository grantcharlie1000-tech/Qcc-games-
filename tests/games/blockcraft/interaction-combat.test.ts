import {describe,expect,it} from 'vitest';
import {stack} from '../../../src/games/blockcraft/data/items';
import {attackStrength,cooldownTicks,scaledDamage,weaponStats,isCritical} from '../../../src/games/blockcraft/interact/combat';
import {createHarness} from './interaction-harness';

describe('attack cooldown math',()=>{
  it('reads damage and attack speed from the held tool, 1 damage at speed 4 otherwise',()=>{
    expect(weaponStats(null)).toEqual({damage:1,attackSpeed:4});
    expect(weaponStats(stack('dirt'))).toEqual({damage:1,attackSpeed:4});
    expect(weaponStats(stack('diamond_sword'))).toEqual({damage:7,attackSpeed:1.6});
    expect(weaponStats(stack('iron_axe'))).toEqual({damage:9,attackSpeed:.9});
  });
  it('charges over 20 / attackSpeed ticks',()=>{
    expect(cooldownTicks(1.6)).toBeCloseTo(12.5);expect(cooldownTicks(4)).toBe(5);
    expect(attackStrength(0,1.6)).toBe(0);
    expect(attackStrength(6.25,1.6)).toBeCloseTo(.5);
    expect(attackStrength(12.5,1.6)).toBe(1);expect(attackStrength(40,1.6)).toBe(1);
  });
  it('scales damage by 0.2 + charge² × 0.8',()=>{
    expect(scaledDamage(7,1)).toBeCloseTo(7);
    expect(scaledDamage(7,0)).toBeCloseTo(1.4);
    expect(scaledDamage(10,.5)).toBeCloseTo(10*(.2+.25*.8));
  });
  it('crits only when charged above 0.9, falling, airborne, not climbing, swimming or sprinting',()=>{
    const air={fallDistance:.5,onGround:false,onLadder:false,inWater:false,sprinting:false};
    expect(isCritical(1,air)).toBe(true);
    expect(isCritical(.85,air)).toBe(false);
    expect(isCritical(1,{...air,onGround:true})).toBe(false);
    expect(isCritical(1,{...air,fallDistance:0})).toBe(false);
    expect(isCritical(1,{...air,onLadder:true})).toBe(false);
    expect(isCritical(1,{...air,inWater:true})).toBe(false);
    expect(isCritical(1,{...air,sprinting:true})).toBe(false);
  });
});

describe('melee through the interaction service',()=>{
  function arena(held:string|null){
    const h=createHarness();h.hold(held);
    const mob=h.ents.add('zombie',.5,60,-1.5);
    h.lookAt(.5,60.9,-1.5);h.step();
    return{h,mob};
  }
  it('targets a mob within 3 blocks and exposes it as entityTarget',()=>{
    const {h,mob}=arena(null);
    expect(h.interaction.entityTarget).toBe(mob);
    mob.z=-4.5;h.lookAt(.5,60.9,-4.5);h.step();
    expect(h.interaction.entityTarget).toBeNull();
  });
  it('a fully charged sword hit deals its damage with knockback, wear, exhaustion and the strong sound',()=>{
    const {h,mob}=arena('diamond_sword');h.step(15);
    expect(h.interaction.attackCharge).toBe(1);
    h.click('attack');
    expect(h.ents.hits).toHaveLength(1);
    const hit=h.ents.hits[0];
    expect(hit.entity).toBe(mob);expect(hit.amount).toBeCloseTo(7);
    expect(hit.source).toMatchObject({kind:'player',byPlayer:true});
    expect(hit.source.knockback!.strength).toBeGreaterThan(0);expect(hit.source.knockback!.z).toBeLessThan(0);
    expect(h.inv.damaged).toBe(1);expect(h.surv.exhaustion).toBeCloseTo(.1);
    // Standing still with a charged sword is a sweep (its sound replaces the strong-hit sound).
    expect(h.sounds()).toContain('sweep');expect(h.log.swings).toBeGreaterThan(0);
    expect(h.interaction.attackCharge).toBeLessThan(.2);
  });
  it('an uncharged hit is weak: damage × 0.2 and the weak sound',()=>{
    const {h}=arena('diamond_sword');h.click('attack');
    expect(h.ents.hits[0].amount).toBeLessThan(7*.3);expect(h.sounds()).toContain('attack_weak');
  });
  it('tools that are not weapons wear by 2 per hit',()=>{
    const {h}=arena('iron_pickaxe');h.step(20);h.click('attack');
    expect(h.ents.hits[0].amount).toBeCloseTo(4);expect(h.inv.damaged).toBe(2);expect(h.sounds()).toEqual(['attack_strong']);
  });
  it('a falling charged hit is critical: ×1.5, crit particles and sound',()=>{
    const {h}=arena('iron_sword');h.step(15);
    const p=h.game.player.state;p.onGround=false;p.fallDistance=.6;p.vy=-3;
    h.click('attack');
    expect(h.ents.hits[0].amount).toBeCloseTo(9);
    expect(h.log.particles.some(q=>q.kind==='crit')).toBe(true);expect(h.sounds()).toContain('crit');
  });
  it('a sprinting charged hit adds knockback and ends the sprint',()=>{
    const {h}=arena('wooden_sword');h.step(15);
    h.click('attack');const normal=h.ents.hits[0].source.knockback!.strength;
    const {h:h2}=arena('wooden_sword');h2.step(15);h2.game.player.state.sprinting=true;h2.click('attack');
    expect(h2.ents.hits[0].source.knockback!.strength).toBeGreaterThan(normal);
    expect(h2.game.player.state.sprinting).toBe(false);
  });
  it('a charged sword hit on the ground sweeps nearby mobs for 1 damage',()=>{
    const {h,mob}=arena('stone_sword');const other=h.ents.add('pig',1.4,60,-1.6);h.step(15);
    h.click('attack');
    expect(h.ents.hits.map(x=>x.entity)).toEqual([mob,other]);
    expect(h.ents.hits[1].amount).toBe(1);expect(h.sounds()).toContain('sweep');
  });
  it('swinging at air resets the cooldown; switching items resets it too',()=>{
    const h=createHarness();h.hold('diamond_sword');h.lookAt(.5,70,-20);h.step(15);
    expect(h.interaction.attackCharge).toBe(1);
    h.click('attack');expect(h.interaction.attackCharge).toBeLessThan(.2);
    h.step(15);expect(h.interaction.attackCharge).toBe(1);
    h.inv.slots[1]=stack('stone_axe');h.inv.select(1);h.step();
    expect(h.interaction.attackCharge).toBeLessThan(.2);
  });
  it('holding attack does not repeat hits on a mob (Java click-to-attack)',()=>{
    const {h}=arena('diamond_sword');h.step(15);
    h.press('attack');h.down('attack');h.step(40);
    expect(h.ents.hits).toHaveLength(1);
  });
  it('right click on a mob calls its interact hook with the held stack',()=>{
    const {h,mob}=arena('shears');let got:unknown=null;
    h.ents.register({...h.ents.kind('zombie')!,interact:(e,_g,held)=>{got=[e,held];return true;}});
    h.click('use');
    expect(got).toEqual([mob,h.inv.slots[0]]);expect(h.log.swings).toBe(1);
  });
});
