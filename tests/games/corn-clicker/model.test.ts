import {describe,expect,test} from 'vitest';
import {Big,format} from '../../../src/games/corn-clicker/big';
import {CornGame} from '../../../src/games/corn-clicker/model';
import {freshState,serialize,deserialize,exportString,importString,SaveError,SAVE_VERSION} from '../../../src/games/corn-clicker/state';
import {UPGRADES,ACHIEVEMENTS,PERMS,PRODUCERS,VARIETIES,PRESTIGE,GOLDEN} from '../../../src/games/corn-clicker/data';

const T0=Date.parse('2026-10-22T09:00:00Z');
const game=(setup?:(g:CornGame)=>void)=>{const g=new CornGame(freshState(T0,12345),T0);setup?.(g);g.touch();return g;};
const rich=(g:CornGame,amount:number|Big)=>{g.s.kernels=Big.of(amount);};

describe('big numbers',()=>{
  test('arithmetic, comparison and serialization beyond double range',()=>{
    const a=Big.fromLog10(400),b=Big.fromLog10(399);
    expect(a.add(b).log10()).toBeCloseTo(Math.log10(1.1)+400,10);
    expect(a.sub(b).log10()).toBeCloseTo(Math.log10(0.9)+400,10);
    expect(a.mul(a).log10()).toBeCloseTo(800,10);
    expect(a.div(b).toNumber()).toBeCloseTo(10,10);
    expect(a.gt(b)&&b.lt(a)&&a.gte(a)&&!a.eq(b)).toBe(true);
    expect(Big.parse(a.toString())!.eq(a)).toBe(true);
    expect(Big.parse(Big.of(123456).toString())!.toNumber()).toBe(123456);
    expect(a.toNumber()).toBe(Infinity);
    expect(Big.of(5).sub(7).clampZero().isZero()).toBe(true);
    for(const bad of ['-5','NaN','Infinity','1e','abc',null,{},-3,Number.NaN])expect(Big.parse(bad)).toBeUndefined();
  });
  test('formatting stays readable at every scale',()=>{
    expect(format(0)).toBe('0');expect(format(1234)).toBe('1,234');expect(format(0.5,'short',true)).toBe('0.50');
    expect(format(1.5e6)).toBe('1.500 M');expect(format(2.25e9,'long')).toBe('2.250 billion');
    expect(format(Big.fromLog10(500))).toBe('1.000e500');expect(format(4.2e12,'scientific')).toBe('4.200e12');
  });
});

describe('producers and bulk purchases',()=>{
  test('bulk cost equals the sum of individual prices, and Max buys exactly what is affordable',()=>{
    const g=game();
    let sum=Big.ZERO;for(let i=0;i<10;i++)sum=sum.add(g.unitPrice('field',i));
    expect(g.bulkCost('field',10).eq(sum)).toBe(true);
    rich(g,sum);
    expect(g.maxAffordable('field')).toBe(10);
    expect(g.buyProducer('field','max')).toBe(10);
    expect(g.s.kernels.isZero()).toBe(true);expect(g.s.producers.field).toBe(10);
    // One kernel short of the next ten buys nine.
    rich(g,g.bulkCost('field',10).sub(1));
    expect(g.maxAffordable('field')).toBe(9);
  });
  test('large bulk orders use the geometric series and agree with summing',()=>{
    const g=game(),exact=(()=>{let t=Big.ZERO;for(let i=0;i<400;i++)t=t.add(g.unitPrice('tractor',i));return t;})();
    expect(g.bulkCost('tractor',400).div(exact).toNumber()).toBeCloseTo(1,6);
    rich(g,Big.fromLog10(80));
    const k=g.maxAffordable('tractor');
    expect(g.bulkCost('tractor',k).lte(g.s.kernels)).toBe(true);
    expect(g.bulkCost('tractor',k+1).gt(g.s.kernels)).toBe(true);
  });
  test('purchases never leave a negative balance and fail atomically',()=>{
    const g=game();rich(g,14);
    expect(g.buyProducer('farmhand',1)).toBe(0);
    expect(g.s.kernels.toNumber()).toBe(14);expect(g.s.producers.farmhand).toBe(0);
    expect(g.buyProducer('farmhand',100)).toBe(0);
    rich(g,15);expect(g.buyProducer('farmhand',1)).toBe(1);expect(g.s.kernels.isZero()).toBe(true);
    expect(g.spend(Big.of(1))).toBe(false);expect(g.s.kernels.isNegative()).toBe(false);
  });
  test('the displayed gain matches the real production change, including Many Hands and synergies',()=>{
    const g=game(x=>{x.s.producers.farmhand=30;x.s.producers.patch=20;x.s.producers.tractor=20;['hands-1','syn-patch-tractor','tractor-10'].forEach(u=>x.s.upgrades.add(u));});
    const before=g.baseCps(),gain=g.gainFor('tractor',10);
    rich(g,g.bulkCost('tractor',10));g.buyProducer('tractor',10);
    expect(g.baseCps().sub(before).div(gain).toNumber()).toBeCloseTo(1,9);
  });
  test('every producer has art-ready data, increasing prices and rates',()=>{
    expect(PRODUCERS).toHaveLength(20);
    for(let i=1;i<PRODUCERS.length;i++){expect(PRODUCERS[i].baseCost).toBeGreaterThan(PRODUCERS[i-1].baseCost);expect(PRODUCERS[i].baseRate).toBeGreaterThan(PRODUCERS[i-1].baseRate);}
  });
  test('later producers are revealed progressively',()=>{
    const g=game();
    expect(g.revealed('farmhand')).toBe(true);expect(g.revealed('patch')).toBe(false);
    g.s.run.earned=Big.of(40);expect(g.revealed('patch')).toBe(true);expect(g.revealed('field')).toBe(false);
  });
});

describe('upgrades',()=>{
  test('there are 100+ upgrades with unique ids and milestone tiers for every producer',()=>{
    expect(UPGRADES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(UPGRADES.map(u=>u.id)).size).toBe(UPGRADES.length);
    for(const p of PRODUCERS)for(const n of [10,25,50,100,200])expect(UPGRADES.some(u=>u.id===`${p.id}-${n}`&&u.req.type==='owned'&&u.req.count===n)).toBe(true);
  });
  test('upgrades unlock at their requirement and apply their effect',()=>{
    const g=game(x=>{x.s.producers.patch=9;});
    expect(g.availableUpgrades().some(u=>u.id==='patch-10')).toBe(false);
    g.s.producers.patch=10;g.touch();
    expect(g.availableUpgrades().some(u=>u.id==='patch-10')).toBe(true);
    const before=g.producerOutput('patch');
    rich(g,6000);expect(g.buyUpgrade('patch-10')).toBe(true);
    expect(g.producerOutput('patch').div(before).toNumber()).toBeCloseTo(2,9);
    expect(g.buyUpgrade('patch-10')).toBe(false);
  });
  test('click upgrades keep clicking relevant late by adding a share of production',()=>{
    const g=game(x=>{x.s.producers.combine=100;});
    const base=g.clickValue();
    g.s.upgrades.add('cps-1');g.s.upgrades.add('cps-2');g.touch();
    expect(g.clickValue().sub(base).div(g.cps()).toNumber()).toBeCloseTo(0.02,9);
  });
});

describe('golden cobs and stacking',()=>{
  const spawn=(g:CornGame,kind:'lucky'|'bumper'|'storm')=>{g.spawnGolden();g.s.golden.onScreen!.kind=kind;};
  test('collecting the same effect again refreshes rather than stacks; different effects multiply',()=>{
    const g=game(x=>{x.s.producers.field=10;});
    const cps=g.cps(),click=g.clickValue();
    spawn(g,'bumper');g.collectGolden();
    expect(g.cps().div(cps).toNumber()).toBeCloseTo(7,9);
    g.advance(30);
    spawn(g,'bumper');g.collectGolden();
    expect(g.cps().div(cps).toNumber()).toBeCloseTo(7,9);
    expect(g.s.golden.effects.bumper!.remaining).toBeCloseTo(GOLDEN.effects.bumper.duration,6);
    spawn(g,'storm');g.collectGolden();
    expect(g.clickValue().div(click).toNumber()).toBeCloseTo(777,6);
  });
  test('Lucky pays the smaller of 15% of the bank and 15 minutes of production, plus 13',()=>{
    const g=game(x=>{x.s.producers.field=10;});
    rich(g,1e9);const cps=g.cps();
    spawn(g,'lucky');const e=g.collectGolden();
    expect(e?.type==='golden'&&e.amount!.toNumber()).toBeCloseTo(cps.toNumber()*900+13,6);
    const h=game(x=>{x.s.producers.field=10;});rich(h,1000);
    spawn(h,'lucky');const f=h.collectGolden();
    expect(f?.type==='golden'&&f.amount!.toNumber()).toBeCloseTo(1000*0.15+13,6);
  });
  test('boosts expire on time, golden cobs disappear and new ones are scheduled',()=>{
    const g=game(x=>{x.s.producers.field=10;});
    spawn(g,'bumper');g.collectGolden();
    g.advance(GOLDEN.effects.bumper.duration-0.5);expect(g.s.golden.effects.bumper).toBeDefined();
    g.advance(1);expect(g.s.golden.effects.bumper).toBeUndefined();
    g.spawnGolden();g.advance(GOLDEN.lifetime+0.5);
    expect(g.s.golden.onScreen).toBeNull();expect(g.s.golden.next).toBeGreaterThan(0);
    expect(g.events.some(e=>e.type==='golden-expired')).toBe(true);
  });
});

describe('time, offline earnings and clock guards',()=>{
  test('active time produces at full rate independently of tick size',()=>{
    const a=game(x=>{x.s.producers.patch=10;}),b=game(x=>{x.s.producers.patch=10;});
    for(let i=1;i<=600;i++)a.tick(T0+i*100);
    b.tick(T0+60_000);
    expect(a.s.kernels.toNumber()).toBeCloseTo(600,6);
    expect(b.s.kernels.toNumber()).toBeCloseTo(600,6);
  });
  test('time away pays 50% of base production up to 8 hours, without temporary boosts, and boosts expire',()=>{
    const g=game(x=>{x.s.producers.patch=10;});
    g.spawnGolden();g.s.golden.onScreen!.kind='bumper';g.collectGolden();
    g.tick(T0+3*3600_000);
    expect(g.s.kernels.toNumber()).toBeCloseTo(10*3*3600*0.5,4);
    expect(g.s.golden.effects.bumper).toBeUndefined();
    expect(g.s.lastOffline).toMatchObject({seconds:10800,capped:false});
    const h=game(x=>{x.s.producers.patch=10;});
    h.tick(T0+20*3600_000);
    expect(h.s.kernels.toNumber()).toBeCloseTo(10*8*3600*0.5,4);
    expect(h.s.lastOffline!.capped).toBe(true);
  });
  test('permanent upgrades extend the allowance and the rate',()=>{
    const g=game(x=>{x.s.producers.patch=10;['long-lunch','night-shift'].forEach(p=>x.s.perms.add(p));});
    g.tick(T0+20*3600_000);
    expect(g.s.kernels.toNumber()).toBeCloseTo(10*12*3600*0.75,4);
  });
  test('reloading or re-ticking never repeats an offline reward',()=>{
    const g=game(x=>{x.s.producers.patch=10;});
    const later=T0+5*3600_000;
    g.tick(later);const once=g.s.kernels;
    g.tick(later);expect(g.s.kernels.eq(once)).toBe(true);
    const restored=new CornGame(deserialize(JSON.parse(JSON.stringify(serialize(g.s))),later),later);
    restored.tick(later+500);
    expect(restored.s.kernels.toNumber()).toBeCloseTo(once.toNumber()+5,4);
    expect(restored.events.some(e=>e.type==='offline')).toBe(false);
  });
  test('moving the clock forward, back and forward again never pays the same hours twice',()=>{
    const g=game(x=>{x.s.producers.patch=10;});
    g.tick(T0+8*3600_000);const once=g.s.kernels;
    expect(once.toNumber()).toBeCloseTo(10*8*3600*0.5,4);
    g.tick(T0);g.tick(T0+8*3600_000);
    expect(g.s.kernels.toNumber()).toBeCloseTo(once.toNumber(),4);
    g.tick(T0+11*3600_000);
    expect(g.s.kernels.sub(once).toNumber()).toBeCloseTo(10*3*3600*0.5,4);
  });
  test('a clock moved backwards credits nothing and cannot extend boosts',()=>{
    const g=game(x=>{x.s.producers.patch=10;});
    g.spawnGolden();g.s.golden.onScreen!.kind='bumper';g.collectGolden();
    const remaining=g.s.golden.effects.bumper!.remaining;
    expect(g.tick(T0-3600_000)).toBe(0);
    expect(g.s.kernels.isZero()).toBe(true);
    expect(g.s.golden.effects.bumper!.remaining).toBe(remaining);
    expect(g.events.some(e=>e.type==='clock')).toBe(true);
    g.tick(T0-3600_000+1000);expect(g.s.kernels.toNumber()).toBeCloseTo(70,6);
  });
});

describe('prestige: Replant',()=>{
  test('seeds follow the cube root of lifetime harvest and only unclaimed seeds are awarded',()=>{
    expect(CornGame.seedsFor(Big.of(PRESTIGE.seedUnit-1))).toBe(0);
    expect(CornGame.seedsFor(Big.of(PRESTIGE.seedUnit))).toBe(1);
    expect(CornGame.seedsFor(Big.of(8*PRESTIGE.seedUnit))).toBe(2);
    expect(CornGame.seedsFor(Big.of(1000*PRESTIGE.seedUnit))).toBe(10);
    const g=game();
    g.s.run.earned=g.s.life.earned=Big.of(27*PRESTIGE.seedUnit);
    expect(g.seedsAvailable()).toBe(3);
    expect(g.replant()).toBe(3);
    expect(g.seedsAvailable()).toBe(0);expect(g.replant()).toBe(0);
    g.s.life.earned=Big.of(64*PRESTIGE.seedUnit);
    expect(g.seedsAvailable()).toBe(1);
  });
  test('spending kernels does not reduce eligibility; spending seeds does not reduce the seed bonus',()=>{
    const g=game();
    g.s.run.earned=g.s.life.earned=Big.of(8*PRESTIGE.seedUnit);rich(g,8*PRESTIGE.seedUnit);
    g.buyProducer('combine','max');
    expect(g.seedsAvailable()).toBe(2);
    g.replant();
    g.s.producers.patch=10;g.touch();
    const before=g.cps();
    expect(g.buyPerm('green-thumbs')).toBe(true);expect(g.s.seeds).toBe(1);
    expect(g.cps().eq(before)).toBe(true);
    expect(g.permanentMult()).toBeCloseTo(1+2*PRESTIGE.bonusPerSeed,9);
  });
  test('replanting resets the run but keeps achievements, discoveries, skins and permanent upgrades',()=>{
    const g=game(x=>{x.s.producers.farmhand=50;x.s.upgrades.add('farmhand-10');x.s.upgrades.add('feature-garden');x.s.garden.plots[0]={v:'sweet',age:5,paid:Big.of(50)};x.s.garden.discovered.add('popcorn');x.s.achievements.add('click-1');x.s.perms.add('seedling-start');x.s.skin='butter';});
    g.s.run.earned=g.s.life.earned=Big.of(PRESTIGE.seedUnit);rich(g,1e6);
    g.spawnGolden();g.s.golden.onScreen!.kind='bumper';g.collectGolden();
    g.replant();
    expect(g.s.kernels.isZero()).toBe(true);expect(g.s.upgrades.size).toBe(0);
    expect(g.s.producers).toMatchObject({farmhand:10,patch:5,field:0});
    expect(g.s.golden.effects).toEqual({});expect(g.s.garden.plots.every(p=>p===null)).toBe(true);
    expect(g.s.garden.discovered.has('popcorn')).toBe(true);expect(g.s.achievements.has('click-1')).toBe(true);
    expect(g.s.perms.has('seedling-start')).toBe(true);expect(g.s.skin).toBe('butter');
    expect(g.s.life.earned.gte(PRESTIGE.seedUnit)).toBe(true);expect(g.s.run.earned.isZero()).toBe(true);
  });
  test('about twenty permanent upgrades cover active, idle and golden play',()=>{
    expect(PERMS.length).toBeGreaterThanOrEqual(20);
    for(const path of ['active','idle','golden'])expect(PERMS.filter(p=>p.path===path).length).toBeGreaterThanOrEqual(4);
    const g=game();g.s.seeds=1000;
    expect(g.buyPerm('callused-palms')).toBe(false); // requires Green Thumbs
    expect(g.buyPerm('green-thumbs')&&g.buyPerm('callused-palms')).toBe(true);
  });
});

describe('saves',()=>{
  test('round trip preserves everything, including huge numbers and the random sequence',()=>{
    const g=game(x=>{x.s.producers.corniverse=500;x.s.upgrades.add('corniverse-10');x.s.achievements.add('click-1');x.s.garden.plots[3]={v:'ember',age:12,paid:Big.of(1e6)};x.s.garden.discovered.add('ember');x.s.scarecrow.bonuses=['guard'];});
    g.advance(10);rich(g,Big.fromLog10(450));g.s.life.earned=Big.fromLog10(460);
    const json=JSON.parse(JSON.stringify(serialize(g.s)));
    const back=deserialize(json,T0);
    expect(serialize(back)).toEqual(serialize(g.s));
    const a=new CornGame(back),b=g;
    expect(a.random()).toBe(b.random());
  });
  test('invalid and incompatible saves are rejected or repaired',()=>{
    for(const bad of [null,'x',42,[],{},{kernels:'abc'},{kernels:'-5'},{v:SAVE_VERSION+1,kernels:'5'}])expect(()=>deserialize(bad,T0)).toThrow(SaveError);
    const repaired=deserialize({v:2,kernels:'10',producers:{farmhand:-4,patch:2.7,unknown:9},upgrades:['patch-10','not-real'],perms:['nope'],seeds:-2,achievements:['click-1','fake'],skin:'neon',garden:{plots:[{v:'weed',age:3},{v:'sweet',age:-1}]}},T0);
    expect(repaired.producers.farmhand).toBe(0);expect(repaired.producers.patch).toBe(2);
    expect([...repaired.upgrades]).toEqual(['patch-10']);expect(repaired.perms.size).toBe(0);
    expect(repaired.seeds).toBe(0);expect([...repaired.achievements]).toEqual(['click-1']);expect(repaired.skin).toBe('classic');
    expect(repaired.garden.plots[0]).toBeNull();expect(repaired.garden.plots[1]).toMatchObject({v:'sweet',age:0});
  });
  test('older saves migrate forward',()=>{
    const legacy=deserialize({kernels:500,buildings:{farmhand:3,patch:1},clicks:20,totalEarned:900,lastTick:T0},T0);
    expect(legacy.kernels.toNumber()).toBe(500);expect(legacy.producers.farmhand).toBe(3);
    expect(legacy.run.clicks).toBe(20);expect(legacy.life.earned.toNumber()).toBe(900);
  });
  test('export codes round trip and reject tampering',()=>{
    const g=game(x=>{x.s.producers.field=7;});
    const code=exportString(serialize(g.s));
    expect(deserialize(importString(code),T0).producers.field).toBe(7);
    const parts=code.split('.');
    expect(()=>importString(`${parts[0]}.${parts[1].slice(0,-4)}AAAA.${parts[2]}`)).toThrow(SaveError);
    expect(()=>importString('hello')).toThrow(SaveError);
  });
});

describe('garden, pests, achievements',()=>{
  test('plant, grow, harvest and discover a mutation',()=>{
    const g=game(x=>{x.s.producers.patch=10;});
    expect(g.plant(0,'sweet')).toBe(false); // garden not unlocked
    g.s.upgrades.add('feature-garden');g.touch();rich(g,1e6);
    expect(g.plant(0,'sweet')&&g.plant(2,'sweet')).toBe(true);
    expect(g.plant(1,'popcorn')).toBe(false); // undiscovered
    expect(g.mature(0)).toBe(false);
    g.advance(VARIETIES[0].growSeconds);
    expect(g.mature(0)).toBe(true);
    const before=g.s.kernels;
    expect(g.harvest(0)!.gt(0)).toBe(true);expect(g.s.kernels.gt(before)).toBe(true);
    g.plant(0,'sweet');g.advance(VARIETIES[0].growSeconds);
    for(let i=0;i<200&&!g.s.garden.discovered.has('popcorn');i++)g.advance(10);
    expect(g.s.garden.discovered.has('popcorn')).toBe(true);
    expect(g.events.some(e=>e.type==='mutation'&&e.discovered)).toBe(true);
  });
  test('a harvest returns a fixed multiple of what was paid, not of production at harvest time',()=>{
    const g=game(x=>{x.s.producers.patch=1000;x.s.upgrades.add('feature-garden');});rich(g,1e9);
    const cost=g.plantCost('sweet');g.plant(0,'sweet');g.advance(VARIETIES[0].growSeconds);
    g.s.producers.corniverse=5;g.touch();
    expect(g.harvestValue(0).toNumber()).toBeCloseTo(Math.floor(cost.toNumber()*VARIETIES[0].harvestMult),0);
  });
  test('pests siphon production and return it with interest',()=>{
    const g=game(x=>{x.s.producers.field=10;x.s.upgrades.add('feature-cornpocalypse');x.s.pests.list=[{id:1,stolen:Big.ZERO,angle:0},{id:2,stolen:Big.ZERO,angle:90}];});
    const cps=g.cps();
    expect(g.effectiveCps().div(cps).toNumber()).toBeCloseTo(0.9,9);
    g.advance(100);
    const stolen=g.s.pests.list[0].stolen;
    expect(stolen.toNumber()).toBeCloseTo(cps.toNumber()*100*0.05,6);
    const before=g.s.kernels;
    expect(g.popPest(1)!.toNumber()).toBeCloseTo(stolen.toNumber()*1.25,6);
    expect(g.s.kernels.sub(before).toNumber()).toBeCloseTo(stolen.toNumber()*1.25,6);
  });
  test('around sixty achievements feed the Butter Bonus and skins',()=>{
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(ACHIEVEMENTS.map(a=>a.id)).size).toBe(ACHIEVEMENTS.length);
    const g=game();g.click(T0);
    expect(g.checkAchievements()).toContain('click-1');
    expect(g.butterPct()).toBe(1);
    expect(g.skinUnlocked('butter')).toBe(false);
    for(const a of ACHIEVEMENTS.slice(0,5))g.s.achievements.add(a.id);
    expect(g.skinUnlocked('butter')).toBe(true);
  });
});
