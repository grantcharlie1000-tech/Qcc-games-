import {describe,expect,it,vi} from 'vitest';
import {createFakeGame} from './helpers/fake-game';
import {createSurvival,type SurvivalSystem} from '../../../src/games/blockcraft/player/survival';
import {totalXpForLevel} from '../../../src/games/blockcraft/player/survival-rules';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {requireItem} from '../../../src/games/blockcraft/data/items';
import type {Difficulty,Entity,GameMode,InteractionService,ItemStack} from '../../../src/games/blockcraft/engine/contracts';

interface Options{difficulty?:Difficulty;mode?:GameMode;random?:()=>number;state?:Record<string,unknown>}

function setup({difficulty='normal',mode='survival',random,state}:Options={}){
  const game=createFakeGame({random,mode});
  game.settings.difficulty=difficulty;
  game.flat(60);
  const p=game.player.state;p.x=.5;p.y=60;p.z=.5;p.onGround=true;
  const s:SurvivalSystem=createSurvival(game);
  game.survival=s;s.init();
  if(state)s.restore({...(s.serialize() as Record<string,unknown>),...state});
  const dropAll=vi.fn(),dropXp=vi.fn(),damageArmor=vi.fn(),damageHeld=vi.fn(),setOffhand=vi.fn(),overlay=vi.fn();
  game.inventory.dropAll=dropAll;game.entities.dropXp=dropXp;game.inventory.damageArmor=damageArmor;game.inventory.damageHeld=damageHeld;
  game.inventory.setOffhand=setOffhand;game.render.setOverlay=overlay;
  const damaged:{amount:number;kind:string}[]=[],died:string[]=[];
  game.events.on('playerDamaged',e=>damaged.push({amount:e.amount,kind:e.source.kind}));
  game.events.on('playerDied',e=>died.push(e.message));
  const tick=(n=1)=>game.runTicks(n,[s]);
  const sounds=()=>game.sounds.played.map(x=>x.name);
  return {game,s,p,tick,sounds,damaged,died,dropAll,dropXp,damageArmor,damageHeld,setOffhand,overlay};
}
/** A survival with no natural regeneration in the way (food 17, no saturation). */
const calm=(o:Options={})=>setup({...o,state:{food:17,saturation:0,...o.state}});
const entity=(kind:string,x:number,y:number,z:number,category='hostile')=>
  ({id:1,kind,category,x,y,z,vx:0,vy:0,vz:0,onGround:true,health:20,maxHealth:20,deathTime:0,removed:false,data:{}} as unknown as Entity);
const wear=(armor:readonly (ItemStack|null)[],ids:string[])=>ids.forEach((id,i)=>{(armor as (ItemStack|null)[])[i]={id,count:1};});

describe('damage',()=>{
  it('removes health, plays the hurt sound, emits playerDamaged and adds 0.1 exhaustion',()=>{
    const {s,damaged,sounds}=calm();
    expect(s.damage(4,{kind:'mob'})).toBe(4);
    expect(s.health).toBe(16);expect(damaged).toEqual([{amount:4,kind:'mob'}]);expect(sounds()).toEqual(['hurt']);
    expect(s.exhaustion).toBeCloseTo(.1);
    expect(s.damage(Number.NaN,{kind:'mob'})).toBe(0);expect(s.damage(-3,{kind:'mob'})).toBe(0);expect(s.health).toBe(16);
    expect(()=>s.damage(1,null as never)).not.toThrow();
    expect(s.damage(6,{kind:'bogus'} as never)).toBe(2);// unknown kinds act as generic magic damage (bigger hit replaces)
  });
  it('creative is immune to everything but the void',()=>{
    const {s,game}=calm({mode:'creative'});
    expect(s.damage(5,{kind:'mob'})).toBe(0);expect(s.damage(5,{kind:'lava'})).toBe(0);
    expect(s.damage(4,{kind:'void'})).toBe(4);
    game.settings.mode='survival';
  });
  it('has 10 invulnerability ticks where only a bigger hit lands, for the difference and silently',()=>{
    const {s,tick,damaged,sounds}=calm();
    expect(s.damage(4,{kind:'mob'})).toBe(4);
    expect(s.damage(3,{kind:'mob'})).toBe(0);
    expect(s.damage(6,{kind:'mob'})).toBe(2);
    expect(s.health).toBe(14);expect(damaged.map(d=>d.amount)).toEqual([4,2]);expect(sounds()).toEqual(['hurt']);
    tick(9);expect(s.damage(3,{kind:'mob'})).toBe(0);
    tick(1);expect(s.damage(3,{kind:'mob'})).toBe(3);expect(s.health).toBe(11);
  });
  it('scales mob and mob projectile damage by difficulty, not environmental or player damage',()=>{
    const skeleton=entity('skeleton',0,60,-5);
    expect(calm({difficulty:'easy'}).s.damage(6,{kind:'mob'})).toBe(4);
    expect(calm({difficulty:'hard'}).s.damage(6,{kind:'mob'})).toBe(9);
    expect(calm({difficulty:'hard'}).s.damage(4,{kind:'projectile',attacker:skeleton})).toBe(6);
    expect(calm({difficulty:'hard'}).s.damage(4,{kind:'projectile',byPlayer:true})).toBe(4);
    expect(calm({difficulty:'hard'}).s.damage(4,{kind:'cactus'})).toBe(4);
    expect(calm({difficulty:'hard'}).s.damage(10,{kind:'explosion',attacker:entity('creeper',0,60,2)})).toBe(15);// the creeper's own blast
    expect(calm({difficulty:'easy'}).s.damage(10,{kind:'explosion',attacker:entity('primed_tnt',0,60,2,'misc')})).toBe(10);// TNT does not scale
    expect(calm({difficulty:'hard'}).s.damage(4,{kind:'mob',attacker:entity('wolf',0,60,1,'passive'),byPlayer:true})).toBe(4);
    const peaceful=calm({difficulty:'peaceful'});
    expect(peaceful.s.damage(6,{kind:'mob',knockback:{x:1,z:0,strength:8}})).toBe(0);
    expect(peaceful.damaged).toEqual([]);expect(peaceful.p.vx).toBe(0);
    const hard=calm({difficulty:'hard'});hard.s.land(8);expect(hard.s.health).toBe(15);
  });
  it('reduces damage with worn armour and toughness, wears the armour, and skips armour for bypassing types',()=>{
    const {s,game,damageArmor,tick}=calm();
    wear(game.inventory.armor,['iron_helmet','iron_chestplate','iron_leggings','iron_boots']);
    expect(s.armorPoints()).toBe(15);
    expect(s.damage(5,{kind:'mob'})).toBeCloseTo(2.5);expect(damageArmor).toHaveBeenCalledWith(5);
    tick(10);damageArmor.mockClear();
    expect(s.damage(5,{kind:'fall'})).toBe(5);expect(damageArmor).not.toHaveBeenCalled();
    tick(10);
    wear(game.inventory.armor,['diamond_helmet','diamond_chestplate','diamond_leggings','diamond_boots']);
    expect(s.armorPoints()).toBe(20);
    expect(s.damage(10,{kind:'explosion'})).toBeCloseTo(3);
  });
  it('knocks the player back through player.push, only for fresh hits and not in creative',()=>{
    const {s,p,tick}=calm();
    s.damage(2,{kind:'mob',knockback:{x:2,z:0,strength:8}});
    expect(p.vx).toBeCloseTo(8);expect(p.vy).toBeCloseTo(8);expect(p.vz).toBeCloseTo(0);
    p.vx=p.vy=0;s.damage(5,{kind:'mob',knockback:{x:1,z:0,strength:8}});expect(p.vx).toBe(0);
    tick(10);p.onGround=false;p.vy=-3;
    s.damage(1,{kind:'mob',knockback:{x:0,z:-1,strength:4}});expect(p.vz).toBeCloseTo(-4);expect(p.vy).toBe(-3);
    const creative=calm({mode:'creative'});creative.s.damage(2,{kind:'mob',knockback:{x:1,z:0,strength:8}});expect(creative.p.vx).toBe(0);
  });
  it('ignores a zero-damage hit (snowball) entirely, like Player.hurt: no knockback, sound or cooldown',()=>{
    const {s,p,sounds,damaged}=calm();
    expect(s.damage(0,{kind:'projectile',projectile:entity('snowball',0,61,-3,'projectile'),knockback:{x:0,z:1,strength:4}})).toBe(0);
    expect(p.vz).toBe(0);expect(sounds()).toEqual([]);expect(damaged).toEqual([]);expect(s.health).toBe(20);
    expect(s.invulnerableTicks).toBe(0);expect(s.damage(2,{kind:'mob'})).toBe(2);
  });
  it('a mob that gives no knockback pushes 0.4 blocks/tick (8 blocks/s) away from itself',()=>{
    const {s,p}=calm();
    s.damage(2,{kind:'mob',attacker:entity('enderman',.5,60,-1.5)});
    expect(p.vz).toBeCloseTo(8);expect(p.vx).toBeCloseTo(0);expect(p.vy).toBeCloseTo(8);
    const shot=calm();shot.s.damage(2,{kind:'projectile',attacker:entity('skeleton',8.5,60,.5),projectile:entity('arrow',1,61,.5,'projectile')});
    expect(shot.p.vx).toBeCloseTo(-8);
    const env=calm();env.s.damage(2,{kind:'cactus'});env.s.damage(9,{kind:'explosion',attacker:entity('creeper',.5,60,-1)});
    expect([env.p.vx,env.p.vy,env.p.vz]).toEqual([0,0,0]);// explosions push through the explosion itself
    const stacked=calm();stacked.s.damage(2,{kind:'mob',attacker:entity('slime',.5,60,.5)});
    expect(Math.hypot(stacked.p.vx,stacked.p.vz)).toBeCloseTo(8);
  });
  it('absorption hearts take damage first',()=>{
    const {s}=calm();
    s.addEffect('absorption',120,1);expect(s.absorption).toBe(4);
    expect(s.damage(6,{kind:'mob'})).toBe(6);expect(s.absorption).toBe(0);expect(s.health).toBe(18);
  });
  it('the absorption effect ends once its hearts are used up (1.20.2+), not while some remain',()=>{
    const {s,tick}=calm();
    s.addEffect('absorption',120,2);s.damage(3,{kind:'mob'});tick();
    expect(s.absorption).toBe(5);expect(s.hasEffect('absorption')).toBe(true);
    tick(10);s.damage(9,{kind:'mob'});expect(s.absorption).toBe(0);expect(s.health).toBe(16);
    tick();expect(s.hasEffect('absorption')).toBe(false);
    // Another golden apple refills the hearts of a running effect (onEffectStarted on every application).
    s.addEffect('absorption',120,1);tick(10);s.damage(.5,{kind:'magic'});expect(s.absorption).toBe(3.5);
    s.addEffect('absorption',60,1);expect(s.absorption).toBe(4);
  });
  it('an infinite hit kills (/kill style) without throwing; NaN and negative hits do nothing',()=>{
    const {s,died}=calm();
    expect(s.damage(Number.NEGATIVE_INFINITY,{kind:'void'})).toBe(0);
    expect(s.damage(Number.POSITIVE_INFINITY,{kind:'void'})).toBe(20);
    expect(s.dead).toBe(true);expect(died).toEqual(['You fell out of the world']);
  });
  it('fire resistance prevents lava and fire damage',()=>{
    const {s}=calm();s.addEffect('fire_resistance',60);
    expect(s.damage(4,{kind:'lava'})).toBe(0);expect(s.damage(1,{kind:'fire'})).toBe(0);expect(s.damage(2,{kind:'mob'})).toBe(2);
  });
});

describe('shield blocking',()=>{
  const raise=(game:ReturnType<typeof setup>['game'])=>{game.interaction={...game.interaction,using:{item:'shield',progress:0}} as InteractionService;};
  it('fully blocks melee from within 90° of the look direction, reduces knockback and pushes the attacker away',()=>{
    const {s,game,p,damageHeld,damaged}=calm();raise(game);
    game.inventory.setSlot(0,{id:'shield',count:1});
    const front=entity('zombie',.5,60,-1.5);// yaw 0 looks north (-z)
    expect(s.damage(5,{kind:'mob',attacker:front,knockback:{x:0,z:1,strength:8}})).toBe(0);
    expect(s.health).toBe(20);expect(damaged).toEqual([]);
    expect(damageHeld).toHaveBeenCalledWith(6);// 1 + floor(damage) when damage ≥ 3
    expect(p.vz).toBeCloseTo(4);expect(front.vz).toBeLessThan(0);
  });
  it('does not block attacks from behind or without the shield raised',()=>{
    const {s,game,tick}=calm();raise(game);
    expect(s.damage(5,{kind:'mob',attacker:entity('zombie',.5,60,3)})).toBe(5);
    tick(10);game.interaction={...game.interaction,using:null} as InteractionService;
    expect(s.damage(5,{kind:'mob',attacker:entity('zombie',.5,60,-2)})).toBe(5);
  });
  it('blocks projectiles by the projectile position and wears an offhand shield',()=>{
    const {s,game,setOffhand,damageHeld}=calm();raise(game);
    (game.inventory as {offhand:ItemStack|null}).offhand={id:'shield',count:1,damage:10};
    const arrow=entity('arrow',.5,61,-1,'projectile'),shooter=entity('skeleton',.5,60,8);
    expect(s.damage(4,{kind:'projectile',attacker:shooter,projectile:arrow})).toBe(0);
    expect(damageHeld).not.toHaveBeenCalled();expect(setOffhand).toHaveBeenCalledWith({id:'shield',count:1,damage:10+1+4});
  });
  it('small hits do not wear the shield; a worn-out offhand shield breaks',()=>{
    const {s,game,setOffhand,tick}=calm();raise(game);
    const max=requireItem('shield').durability!;
    (game.inventory as {offhand:ItemStack|null}).offhand={id:'shield',count:1,damage:max-2};
    expect(s.damage(2,{kind:'mob',attacker:entity('zombie',.5,60,-2)})).toBe(0);expect(setOffhand).not.toHaveBeenCalled();
    tick(10);
    expect(s.damage(8,{kind:'mob',attacker:entity('zombie',.5,60,-2)})).toBe(0);expect(setOffhand).toHaveBeenCalledWith(null);
  });
});

describe('hunger, saturation and exhaustion',()=>{
  it('every 4 exhaustion removes one saturation, then one food',()=>{
    const {s,tick}=setup();
    s.addExhaustion(4.5);tick();expect(s.saturation).toBe(4);expect(s.food).toBe(20);expect(s.exhaustion).toBeCloseTo(.5);
    const hungry=setup({state:{saturation:0}});
    hungry.s.addExhaustion(4.5);hungry.tick();expect(hungry.s.food).toBe(19);
    hungry.s.addExhaustion(100);expect(hungry.s.exhaustion).toBe(40);
  });
  it('ignores exhaustion in creative and peaceful',()=>{
    const creative=setup({mode:'creative'});creative.s.addExhaustion(5);expect(creative.s.exhaustion).toBe(0);
    const peaceful=setup({difficulty:'peaceful'});peaceful.s.addExhaustion(5);expect(peaceful.s.exhaustion).toBe(0);
  });
  it('food ≥ 18 heals 1 every 80 ticks for 6 exhaustion',()=>{
    const {s,tick}=setup({state:{health:10,food:18,saturation:0}});
    tick(79);expect(s.health).toBe(10);
    tick(1);expect(s.health).toBe(11);expect(s.exhaustion).toBeCloseTo(6);
    tick(1);expect(s.food).toBe(17);expect(s.exhaustion).toBeCloseTo(2);
    tick(200);expect(s.health).toBe(11);
  });
  it('at food 20 saturation heals every 10 ticks (min(saturation, 6) / 6)',()=>{
    const {s,tick}=setup({state:{health:10,food:20,saturation:5}});
    tick(9);expect(s.health).toBe(10);
    tick(1);expect(s.health).toBeCloseTo(10+5/6);expect(s.exhaustion).toBeCloseTo(5);
    const rich=setup({state:{health:10,food:20,saturation:20}});
    rich.tick(30);expect(rich.s.health).toBeCloseTo(13);
  });
  it('peaceful heals 1 every 20 ticks and restores food every 10 ticks',()=>{
    const {s,tick}=setup({difficulty:'peaceful',state:{health:10,food:10,saturation:0}});
    tick(20);expect(s.health).toBe(11);expect(s.food).toBe(12);
  });
  it('peaceful restores saturation by 1 every 20 ticks up to the food level',()=>{
    const {s,tick}=setup({difficulty:'peaceful',state:{food:20,saturation:0}});
    tick(19);expect(s.saturation).toBe(0);tick(1);expect(s.saturation).toBe(1);tick(40);expect(s.saturation).toBe(3);
    tick(20*40);expect(s.saturation).toBe(20);
    const starving=setup({difficulty:'peaceful',state:{food:0,saturation:0}});
    starving.tick(20);expect(starving.s.food).toBe(2);expect(starving.s.saturation).toBe(1);
    const normal=setup({state:{saturation:0}});normal.tick(40);expect(normal.s.saturation).toBe(0);
  });
  it('starvation hurts every 80 ticks down to 10 on easy, 1 on normal, and kills on hard',()=>{
    const normal=setup({state:{health:5,food:0,saturation:0}});
    normal.tick(80);expect(normal.s.health).toBe(4);normal.tick(80*5);expect(normal.s.health).toBe(1);expect(normal.s.dead).toBe(false);
    const easy=setup({difficulty:'easy',state:{health:12,food:0,saturation:0}});
    easy.tick(80*5);expect(easy.s.health).toBe(10);
    const hard=setup({difficulty:'hard',state:{health:2,food:0,saturation:0}});
    hard.tick(160);expect(hard.s.dead).toBe(true);expect(hard.died).toEqual(['You starved to death']);
  });
});

describe('eating',()=>{
  const food=(id:string)=>requireItem(id).food!;
  it('adds hunger and saturation (capped by food), and burps',()=>{
    const {s,sounds}=setup({state:{food:10,saturation:0}});
    s.eat(food('bread'));expect(s.food).toBe(15);expect(s.saturation).toBeCloseTo(6);
    s.eat(food('cooked_beef'));expect(s.food).toBe(20);expect(s.saturation).toBeCloseTo(18.8);
    expect(sounds()).toEqual(['burp','burp']);
  });
  it('can eat only when hungry unless the food is always edible or in creative',()=>{
    const {s}=setup();
    expect(s.canEat(food('bread'))).toBe(false);expect(s.canEat(food('golden_apple'))).toBe(true);expect(s.canEat(food('milk_bucket'))).toBe(true);
    expect(setup({state:{food:19}}).s.canEat(food('bread'))).toBe(true);
    expect(setup({mode:'creative'}).s.canEat(food('bread'))).toBe(true);
  });
  it('applies food effects by chance',()=>{
    let r=.5;const lucky=setup({random:()=>r,state:{food:10}});
    lucky.s.eat(food('rotten_flesh'));expect(lucky.s.effects()).toEqual([{name:'hunger',level:1,ticks:600}]);
    r=.9;const unlucky=setup({random:()=>r,state:{food:10}});
    unlucky.s.eat(food('rotten_flesh'));expect(unlucky.s.effects()).toEqual([]);
    const apple=setup();apple.s.eat(food('golden_apple'));
    expect(apple.s.effects()).toEqual([{name:'regeneration',level:2,ticks:100},{name:'absorption',level:1,ticks:2400}]);expect(apple.s.absorption).toBe(4);
  });
  it('milk clears every effect and plays the drink sound',()=>{
    const {s,sounds}=setup();s.addEffect('poison',10);s.addEffect('speed',10,2);
    s.eat(food('milk_bucket'));expect(s.effects()).toEqual([]);expect(sounds()).toEqual(['drink']);expect(s.food).toBe(20);
  });
});

describe('status effects in play',()=>{
  it('regeneration I heals 1 every 50 ticks',()=>{
    const {s,tick}=calm({state:{health:10}});s.addEffect('regeneration',10,1);
    tick();expect(s.health).toBe(11);tick(199);expect(s.health).toBe(14);expect(s.hasEffect('regeneration')).toBe(false);
  });
  it('poison hurts every 25 ticks, ignores armour and never kills',()=>{
    const {s,game,tick}=calm({state:{health:3}});
    wear(game.inventory.armor,['diamond_helmet','diamond_chestplate','diamond_leggings','diamond_boots']);
    s.addEffect('poison',10,1);tick();expect(s.health).toBe(2);tick(25);expect(s.health).toBe(1);tick(200);expect(s.health).toBe(1);expect(s.dead).toBe(false);
  });
  it('hunger adds 0.005 exhaustion per level per tick; saturation feeds every tick',()=>{
    const {s,tick}=calm();s.addEffect('hunger',1,2);tick(20);expect(s.exhaustion).toBeCloseTo(.2);
    const fed=setup({state:{food:10,saturation:0}});fed.s.addEffect('saturation',.05,1);fed.tick();
    expect(fed.s.food).toBe(11);expect(fed.s.saturation).toBeCloseTo(2);expect(fed.s.hasEffect('saturation')).toBe(false);
  });
  it('validates addEffect and removes absorption hearts with the effect',()=>{
    const {s}=calm();
    s.addEffect('absorption',30,2);expect(s.absorption).toBe(8);s.removeEffect('absorption');expect(s.absorption).toBe(0);
    s.addEffect('speed',-1);s.addEffect('speed',Number.NaN);s.addEffect('nausea' as never,10);s.addEffect('speed',10,0);
    expect(s.effects()).toEqual([]);
    s.addEffect('speed',10,2.6);expect(s.effects()).toEqual([{name:'speed',level:3,ticks:200}]);
  });
});

describe('environment',()=>{
  it('drowns: 300 air ticks, then 2 damage per second; air refills 4 per tick',()=>{
    const {s,p,tick}=calm();p.headInWater=true;
    tick(300);expect(s.air).toBe(0);expect(s.health).toBe(20);
    tick(19);expect(s.health).toBe(20);tick(1);expect(s.health).toBe(18);tick(20);expect(s.health).toBe(16);
    p.headInWater=false;tick(1);expect(s.air).toBe(4);tick(74);expect(s.air).toBe(300);
    const creative=calm({mode:'creative'});creative.p.headInWater=true;creative.tick(400);expect(creative.s.air).toBe(300);
  });
  it('suffocates when the eyes are inside an opaque block',()=>{
    const {s,game,tick}=calm();
    game.world.set(0,61,0,B.stone);
    tick();expect(s.health).toBe(19);tick(9);expect(s.health).toBe(19);tick();expect(s.health).toBe(18);
    game.world.set(0,61,0,B.glass);tick(20);expect(s.health).toBe(18);
  });
  it('lava: 4 damage every 10 ticks and 15 s of fire',()=>{
    const {s,p,tick}=calm();p.inLava=true;
    tick();expect(s.health).toBe(16);expect(s.burning).toBe(300);
    tick(9);expect(s.health).toBe(16);tick();expect(s.health).toBe(12);
    p.inLava=false;expect(s.burning).toBeGreaterThan(280);
  });
  it('burning deals 1 damage per second and is put out by water or rain',()=>{
    const {s,p,tick}=calm();
    s.ignite(2);expect(s.burning).toBe(40);tick(40);expect(s.health).toBe(18);expect(s.burning).toBe(0);
    s.ignite(5);p.inWater=true;tick();expect(s.burning).toBe(0);p.inWater=false;
    const rain=calm();rain.game.weather.isRainingOn=()=>true;rain.s.ignite(5);rain.tick();expect(rain.s.burning).toBe(0);
    s.ignite(5);s.extinguish();expect(s.burning).toBe(0);
  });
  it('standing in a fire block hurts 1 per 10 ticks and sets the player alight after a second',()=>{
    const {s,game,tick}=calm();
    game.world.set(0,60,0,blockId('fire'));
    tick();expect(s.health).toBe(19);
    tick(18);expect(s.health).toBe(18);expect(s.burning).toBe(0);
    tick();expect(s.burning).toBe(160);
  });
  it('cactus pricks on contact, including standing on top of one alone',()=>{
    const side=calm();side.game.world.set(1,60,0,blockId('cactus'));
    side.tick();expect(side.s.health).toBe(20);
    side.p.x=.75;side.tick();expect(side.s.health).toBe(19);
    const top=calm();top.game.world.set(5,59,5,blockId('cactus'));
    top.p.x=4.85;top.p.z=5.5;top.tick();expect(top.s.health).toBe(20);// also standing on stone
    top.p.x=5.5;top.tick();expect(top.s.health).toBe(19);
  });
  it('the void hurts 4 per hit even in creative',()=>{
    const {s,p,tick}=calm({mode:'creative'});p.y=-70;tick();expect(s.health).toBe(16);
  });
  it('fall damage is ceil(distance − 3): none into water, in creative, halved on beds',()=>{
    const {s,p,tick}=calm();
    s.land(3);expect(s.health).toBe(20);
    s.land(8);expect(s.health).toBe(15);
    tick(10);p.inWater=true;s.land(20);expect(s.health).toBe(15);p.inWater=false;
    const creative=calm({mode:'creative'});creative.s.land(30);expect(creative.s.health).toBe(20);
    const bed=calm();bed.game.world.set(0,59,0,blockId('bed_foot_north'));bed.p.y=59.5625;bed.s.land(10);expect(bed.s.health).toBe(18);
  });
});

describe('experience',()=>{
  it('levels with the vanilla formula and plays orb and level-up sounds',()=>{
    const {s,sounds}=setup();
    s.addXp(7);expect(s.xpLevel).toBe(1);expect(s.xpProgress).toBe(0);expect(s.xpTotal).toBe(7);
    s.addXp(3);expect(s.xpProgress).toBeCloseTo(3/9);
    s.addXp(totalXpForLevel(30)-10);expect(s.xpLevel).toBe(30);expect(s.xpProgress).toBeCloseTo(0);expect(s.xpTotal).toBe(1395);
    expect(sounds().filter(n=>n==='orb').length).toBe(3);
    expect(sounds().filter(n=>n==='levelup').length).toBe(1);// once per 5 levels, at most every 100 ticks
  });
  it('turns fractional points into whole points by chance',()=>{
    let r=.3;const {s}=setup({random:()=>r});
    s.addXp(.5);expect(s.xpTotal).toBe(1);r=.7;s.addXp(.5);expect(s.xpTotal).toBe(1);s.addXp(2.25);expect(s.xpTotal).toBe(3);
  });
});

describe('death and respawn',()=>{
  it('dies with a vanilla message, drops the inventory and 7 xp per level, and plays the death sound',()=>{
    const {s,died,dropAll,dropXp,sounds}=calm();
    s.addXp(totalXpForLevel(3));
    const zombie=entity('zombie',.5,60,-1);
    expect(s.damage(25,{kind:'mob',attacker:zombie})).toBe(20);
    expect(s.dead).toBe(true);expect(s.health).toBe(0);expect(died).toEqual(['You were slain by Zombie']);
    expect(dropAll).toHaveBeenCalledTimes(1);expect(dropXp).toHaveBeenCalledWith(21,expect.any(Number),expect.any(Number),expect.any(Number));
    expect(sounds()).toContain('death');expect(sounds()).not.toContain('hurt');
    s.kill('again');expect(died.length).toBe(1);expect(s.damage(5,{kind:'mob'})).toBe(0);
  });
  it('keeps the inventory and xp with keepInventory',()=>{
    const {s,game,dropAll,dropXp}=calm();game.settings.keepInventory=true;
    s.addXp(50);const level=s.xpLevel;s.kill('You died');
    expect(dropAll).not.toHaveBeenCalled();expect(dropXp).not.toHaveBeenCalled();
    s.respawn();expect(s.xpLevel).toBe(level);
  });
  it('names the killer for explosions, arrows, lava, drowning and falls',()=>{
    const creeper=calm();creeper.s.damage(30,{kind:'explosion',attacker:entity('creeper',0,60,2)});expect(creeper.died).toEqual(['You were blown up by Creeper']);
    const arrow=calm();arrow.s.damage(30,{kind:'projectile',attacker:entity('skeleton',0,60,9),projectile:entity('arrow',0,61,1,'projectile')});
    expect(arrow.died).toEqual(['You were shot by Skeleton']);
    const lava=calm({state:{health:3}});lava.p.inLava=true;lava.tick();expect(lava.died).toEqual(['You tried to swim in lava']);
    const fall=calm();fall.s.land(30);expect(fall.died).toEqual(['You fell from a high place']);
    const assisted=calm();assisted.s.damage(2,{kind:'mob',attacker:entity('spider',0,60,1)});assisted.tick(10);assisted.s.land(40);
    expect(assisted.died).toEqual(['You were doomed to fall by Spider']);
    const drown=calm({state:{health:2,air:-19}});drown.s.damage(1,{kind:'mob',attacker:entity('drowned',0,60,1)});
    drown.p.headInWater=true;drown.tick(10);drown.tick();expect(drown.died).toEqual(['You drowned whilst trying to escape Drowned']);
    const ladder=calm();ladder.p.onLadder=true;ladder.p.onGround=false;ladder.tick();ladder.p.onLadder=false;ladder.tick(3);ladder.s.land(25);
    expect(ladder.died).toEqual(['You fell off a ladder']);
    const walked=calm();walked.p.onLadder=true;walked.tick();walked.p.onLadder=false;walked.p.onGround=true;walked.tick();walked.s.land(25);
    expect(walked.died).toEqual(['You fell from a high place']);
  });
  it('credits the last mob for an environmental death only while it lives and for 100 ticks',()=>{
    const fresh=calm({state:{health:3}});const zombie=entity('zombie',0,60,1);
    fresh.s.damage(1,{kind:'mob',attacker:zombie});fresh.tick(10);fresh.s.damage(4,{kind:'cactus'});
    expect(fresh.died).toEqual(['You walked into a cactus whilst trying to escape Zombie']);
    const late=calm({state:{health:3}});late.s.damage(1,{kind:'mob',attacker:entity('zombie',0,60,1)});late.tick(101);late.s.damage(4,{kind:'cactus'});
    expect(late.died).toEqual(['You were pricked to death']);
    const gone=calm({state:{health:3}});const spider=entity('spider',0,60,1);gone.s.damage(1,{kind:'mob',attacker:spider});gone.tick(10);
    (spider as {removed:boolean}).removed=true;gone.s.damage(4,{kind:'starve'});expect(gone.died).toEqual(['You starved to death']);
  });
  it('respawn resets health, food, air, fire, effects and xp, then protects for 3 seconds (not from the void)',()=>{
    const {s,p,tick}=calm({state:{health:5,air:-5}});
    s.addXp(100);s.addEffect('speed',30);s.ignite(5);s.kill('You died');
    s.respawn();
    expect([s.dead,s.health,s.food,s.saturation,s.air,s.burning,s.absorption,s.xpLevel,s.xpTotal,s.xpProgress]).toEqual([false,20,20,5,300,0,0,0,0,0]);
    expect(s.effects()).toEqual([]);expect(s.exhaustion).toBe(0);
    expect(s.damage(5,{kind:'mob'})).toBe(0);expect(s.damage(4,{kind:'void'})).toBe(4);
    tick(60);expect(s.damage(5,{kind:'mob'})).toBe(5);
    p.y=60;
  });
});

describe('screen overlay',()=>{
  it('sets the overlay every frame: lava at the eyes, hurt flash, fire, then water',()=>{
    const {s,game,p,overlay,tick}=calm();
    s.frame(1/60);expect(overlay).toHaveBeenLastCalledWith(null,0);
    p.headInWater=true;s.frame(1/60);expect(overlay).toHaveBeenLastCalledWith('water',1);p.headInWater=false;
    s.damage(1,{kind:'mob'});s.frame(.1);expect(overlay.mock.lastCall?.[0]).toBe('hurt');expect(overlay.mock.lastCall?.[1]).toBeGreaterThan(.5);
    s.frame(.5);expect(overlay).toHaveBeenLastCalledWith(null,0);
    tick(10);s.ignite(3);s.frame(1/60);expect(overlay).toHaveBeenLastCalledWith('fire',1);s.extinguish();
    game.world.set(0,61,0,B.lava);s.frame(1/60);expect(overlay).toHaveBeenLastCalledWith('lava',1);
    expect(overlay).toHaveBeenCalledTimes(6);
  });
  it('shows the portal shimmer after an ender pearl teleport',()=>{
    const {s,overlay}=calm();
    s.damage(5,{kind:'fall',projectile:entity('ender_pearl',0,61,0,'projectile')});
    s.frame(1/60);expect(overlay.mock.lastCall?.[0]).toBe('portal');
  });
});

describe('persistence',()=>{
  it('round-trips the survival state',()=>{
    const a=calm();
    a.s.damage(5,{kind:'mob'});a.s.addXp(30);a.s.addEffect('speed',30,2);a.s.addEffect('absorption',60,1);a.s.ignite(4);a.s.addExhaustion(1.5);
    const saved=JSON.parse(JSON.stringify(a.s.serialize()));
    const b=setup();b.s.restore(saved);
    for(const k of ['health','food','saturation','air','absorption','xpLevel','xpProgress','xpTotal','burning','exhaustion'] as const)expect(b.s[k]).toBeCloseTo(a.s[k]);
    expect(b.s.effects()).toEqual(a.s.effects());
  });
  it('ignores invalid data and never throws',()=>{
    const {s}=setup();
    for(const bad of [null,undefined,42,'junk',[],{health:-5,food:99,saturation:'x',xpLevel:-1,xpPoints:1e9,air:5000,fire:Number.NaN,effects:'bad',exhaustion:-1}])
      expect(()=>s.restore(bad)).not.toThrow();
    expect([s.health,s.food,s.saturation,s.xpLevel,s.xpTotal,s.air,s.burning,s.exhaustion]).toEqual([20,20,5,0,0,300,0,0]);
    s.restore({food:12,saturation:30});expect(s.food).toBe(12);expect(s.saturation).toBe(5);
    s.restore({food:3,saturation:10});expect(s.food).toBe(3);expect(s.saturation).toBe(3);
  });
  it('a world saved while dead shows the death screen again after loading, without dropping twice',()=>{
    const a=calm();a.s.kill('You drowned');
    const b=setup();b.s.restore(JSON.parse(JSON.stringify(a.s.serialize())));
    expect(b.s.dead).toBe(true);
    b.game.events.emit('restored',{});
    expect(b.died).toEqual(['You drowned']);expect(b.dropAll).not.toHaveBeenCalled();
  });
  it('reset starts a fresh world',()=>{
    const {s}=calm();s.addXp(100);s.damage(4,{kind:'mob'});s.reset();
    expect([s.health,s.food,s.xpLevel,s.dead]).toEqual([20,20,0,false]);expect(s.damage(3,{kind:'mob'})).toBe(3);
  });
});
