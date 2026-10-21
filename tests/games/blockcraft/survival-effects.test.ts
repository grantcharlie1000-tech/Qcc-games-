import {describe,expect,it} from 'vitest';
import {EFFECT_INFO,EFFECT_NAMES,StatusEffects,effectFires,movementMultiplier} from '../../../src/games/blockcraft/player/effects';

const step=(fx:StatusEffects,n:number,fired:string[]=[])=>{for(let i=0;i<n;i++)fx.tick(e=>fired.push(`${e.name}${e.level}`));return fired;};

describe('status effect list',()=>{
  it('lists every EffectName with display data',()=>{
    expect([...EFFECT_NAMES].sort()).toEqual(['absorption','fire_resistance','hunger','night_vision','poison','regeneration','saturation','slowness','speed']);
    for(const name of EFFECT_NAMES)expect(EFFECT_INFO[name].displayName.length).toBeGreaterThan(0);
  });
  it('adds, lists, finds and removes effects with 1-based levels',()=>{
    const fx=new StatusEffects();
    expect(fx.add('speed',200,2)).toBe(true);
    expect(fx.list).toEqual([{name:'speed',level:2,ticks:200}]);
    expect(fx.has('speed')).toBe(true);expect(fx.level('speed')).toBe(2);expect(fx.level('poison')).toBe(0);
    expect(fx.remove('speed')).toBe(true);expect(fx.remove('speed')).toBe(false);expect(fx.list).toEqual([]);
    fx.add('poison',20,1);fx.add('hunger',20,1);fx.clear();expect(fx.list.length).toBe(0);
  });
  it('counts down and removes expired effects',()=>{
    const fx=new StatusEffects(),removed:string[]=[];
    fx.add('night_vision',3,1);
    for(let i=0;i<2;i++)fx.tick(()=>{},undefined,n=>removed.push(n));
    expect(fx.get('night_vision')?.ticks).toBe(1);
    fx.tick(()=>{},undefined,n=>removed.push(n));
    expect(fx.has('night_vision')).toBe(false);expect(removed).toEqual(['night_vision']);
  });
});

describe('vanilla MobEffectInstance.update rules',()=>{
  it('a stronger effect replaces a weaker one; a longer equal one extends; a shorter equal one is ignored',()=>{
    const fx=new StatusEffects();
    fx.add('speed',100,1);
    expect(fx.add('speed',50,1)).toBe(false);expect(fx.get('speed')).toMatchObject({level:1,ticks:100});
    expect(fx.add('speed',300,1)).toBe(true);expect(fx.get('speed')).toMatchObject({level:1,ticks:300});
    expect(fx.add('speed',40,2)).toBe(true);expect(fx.get('speed')).toMatchObject({level:2,ticks:40});
  });
  it('the weaker longer effect is hidden and resumes when the stronger one ends',()=>{
    const fx=new StatusEffects();
    fx.add('regeneration',100,1);
    fx.add('regeneration',20,2);
    step(fx,20);
    // the hidden effect kept counting down underneath
    expect(fx.get('regeneration')).toMatchObject({level:1,ticks:80});
    step(fx,80);
    expect(fx.has('regeneration')).toBe(false);
  });
  it('a weaker but longer effect added later waits underneath the stronger one',()=>{
    const fx=new StatusEffects(),changed:string[]=[];
    fx.add('speed',20,3);
    expect(fx.add('speed',200,1)).toBe(false);
    expect(fx.get('speed')).toMatchObject({level:3,ticks:20});
    for(let i=0;i<20;i++)fx.tick(()=>{},e=>changed.push(`${e.name}${e.level}`));
    expect(fx.get('speed')).toMatchObject({level:1,ticks:180});expect(changed).toEqual(['speed1']);
  });
});

describe('effect timing (isDurationEffectTick)',()=>{
  it('regeneration fires every 50 >> amplifier ticks and poison every 25 >> amplifier',()=>{
    expect(effectFires('regeneration',1,100)).toBe(true);expect(effectFires('regeneration',1,99)).toBe(false);expect(effectFires('regeneration',1,50)).toBe(true);
    expect(effectFires('regeneration',2,75)).toBe(true);expect(effectFires('regeneration',3,12)).toBe(true);expect(effectFires('regeneration',3,13)).toBe(false);
    expect(effectFires('regeneration',7,5)).toBe(true);// 50 >> 6 = 0: every tick
    expect(effectFires('poison',1,25)).toBe(true);expect(effectFires('poison',1,24)).toBe(false);expect(effectFires('poison',2,12)).toBe(true);
    expect(effectFires('hunger',1,17)).toBe(true);expect(effectFires('saturation',1,3)).toBe(true);
    expect(effectFires('speed',1,40)).toBe(false);expect(effectFires('fire_resistance',1,20)).toBe(false);
    expect(effectFires('absorption',1,7)).toBe(true);// checks every tick whether its hearts are gone
  });
  it('a golden apple regeneration II (5 s) fires 4 times',()=>{
    const fx=new StatusEffects();fx.add('regeneration',100,2);
    expect(step(fx,100)).toEqual(['regeneration2','regeneration2','regeneration2','regeneration2']);
  });
});

describe('persistence',()=>{
  it('round-trips effects with hidden ones and drops invalid entries',()=>{
    const fx=new StatusEffects();fx.add('speed',300,1);fx.add('speed',40,2);fx.add('poison',60,1);
    const copy=new StatusEffects();copy.restore(JSON.parse(JSON.stringify(fx.serialize())));
    expect(copy.list).toEqual(fx.list);
    step(copy,40);expect(copy.get('speed')).toMatchObject({level:1,ticks:260});
    const bad=new StatusEffects();
    bad.restore([['speed',2,100],['nausea',1,100],['poison',0,100],['hunger',1,-5],['speed',1,50],'junk',null,['regeneration',1.5,10],['saturation',300,10]]);
    expect(bad.list).toEqual([{name:'speed',level:2,ticks:100}]);
    bad.restore({not:'a list'});expect(bad.list).toEqual([]);
  });
});

describe('movement multiplier for the player controller',()=>{
  it('multiplies speed (+20 % per level) and slowness (−15 % per level), never below zero',()=>{
    expect(movementMultiplier([])).toBe(1);
    expect(movementMultiplier([{name:'speed',level:2,ticks:10}])).toBeCloseTo(1.4);
    expect(movementMultiplier([{name:'slowness',level:1,ticks:10}])).toBeCloseTo(.85);
    expect(movementMultiplier([{name:'speed',level:1,ticks:10},{name:'slowness',level:2,ticks:10}])).toBeCloseTo(1.2*.7);
    expect(movementMultiplier([{name:'slowness',level:7,ticks:10}])).toBe(0);
  });
});
