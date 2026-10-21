import {describe,expect,test} from 'vitest';
import {createTickGame,idOf} from './ticks-helpers';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {FIRE_ODDS,LAVA_IGNITES} from '../../../src/games/blockcraft/world/fire';

const Y=60;

describe('falling blocks',()=>{
  test('unsupported sand becomes a falling_block entity and lands as a block',()=>{
    const g=createTickGame();
    g.set(0,Y+5,0,'sand');
    g.run(3);
    expect(g.get(0,Y+5,0)).toBe('air');
    const e=g.entities.all().find(e=>e.kind==='falling_block');
    expect(e).toBeDefined();
    expect(e!.data.block).toBe(B.sand);
    expect(e!.x).toBeCloseTo(.5);expect(e!.z).toBeCloseTo(.5);
    g.run(60);
    expect(g.get(0,Y,0)).toBe('sand');
    expect(g.entities.all().some(e=>e.kind==='falling_block')).toBe(false);
  });

  test('gravel sinks through water and replaces plants it lands in',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'water');g.set(0,Y+1,0,'water');
    g.set(2,Y,0,'snow');
    g.set(0,Y+4,0,'gravel');g.set(2,Y+4,0,'gravel');
    g.run(120);
    expect(g.get(0,Y,0)).toBe('gravel');
    expect(g.get(2,Y,0)).toBe('gravel');
  });

  test('a falling block landing in a torch cell breaks into its item',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'torch');
    g.set(0,Y+3,0,'sand');
    g.run(80);
    expect(g.get(0,Y,0)).toBe('torch');
    expect(g.drops.some(d=>d.stack.id==='sand')).toBe(true);
    expect(g.entities.all()).toHaveLength(0);
  });

  test('without an entity service slot the block lands at once',()=>{
    const g=createTickGame();
    g.entities.spawn=()=>null;
    g.set(0,Y+5,0,'gravel');
    g.run(3);
    expect(g.get(0,Y+5,0)).toBe('air');
    expect(g.get(0,Y,0)).toBe('gravel');
  });

  test('a column of sand falls as a column',()=>{
    const g=createTickGame();
    g.set(0,Y+2,0,'air');
    for(let y=Y+2;y<Y+6;y++)g.set(0,y,0,'sand');
    g.set(0,Y+1,0,'air');
    g.run(120);
    for(let y=Y;y<Y+4;y++)expect(g.get(0,y,0)).toBe('sand');
    expect(g.get(0,Y+4,0)).toBe('air');
  });
});

describe('support',()=>{
  test('a flower pops off with its drops when its soil is removed',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'dirt');g.set(0,Y+1,0,'poppy');
    g.run(2);
    expect(g.get(0,Y+1,0)).toBe('poppy');
    g.set(0,Y,0,'air');
    g.run(3);
    expect(g.get(0,Y+1,0)).toBe('air');
    expect(g.dropCalls).toContainEqual({id:idOf('poppy'),tool:null});
    expect(g.drops.some(d=>d.stack.id==='poppy')).toBe(true);
  });

  test('a wall torch pops when its wall goes; crops pop when farmland turns to dirt',()=>{
    const g=createTickGame();
    g.set(1,Y,0,'stone');g.set(2,Y,0,'wall_torch_east');
    g.set(4,Y-1,0,'farmland');g.set(4,Y,0,'wheat_5');
    g.run(2);
    g.set(1,Y,0,'air');
    g.set(4,Y-1,0,'dirt');
    g.run(3);
    expect(g.get(2,Y,0)).toBe('air');
    expect(g.get(4,Y,0)).toBe('air');
    expect(g.dropCalls.map(c=>c.id)).toEqual(expect.arrayContaining([idOf('wall_torch_east'),idOf('wheat_5')]));
  });

  test('a door half without its partner pops; only blockDrops decides the items',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'oak_door_lower_closed_north');g.set(0,Y+1,0,'oak_door_upper_closed_north');
    g.run(3);
    expect(g.get(0,Y,0)).toBe('oak_door_lower_closed_north');
    g.set(0,Y+1,0,'air');
    g.run(3);
    expect(g.get(0,Y,0)).toBe('air');
    expect(g.dropCalls.map(c=>c.id)).toContain(idOf('oak_door_lower_closed_north'));
  });
});

describe('fire',()=>{
  test('flammability tables follow vanilla odds',()=>{
    expect([FIRE_ODDS.ignite[idOf('oak_planks')],FIRE_ODDS.burn[idOf('oak_planks')]]).toEqual([5,20]);
    expect([FIRE_ODDS.ignite[idOf('oak_log')],FIRE_ODDS.burn[idOf('oak_log')]]).toEqual([5,5]);
    expect([FIRE_ODDS.ignite[idOf('oak_leaves')],FIRE_ODDS.burn[idOf('oak_leaves')]]).toEqual([30,60]);
    expect([FIRE_ODDS.ignite[idOf('tnt')],FIRE_ODDS.burn[idOf('tnt')]]).toEqual([15,100]);
    expect([FIRE_ODDS.ignite[idOf('short_grass')],FIRE_ODDS.burn[idOf('short_grass')]]).toEqual([60,100]);
    expect(FIRE_ODDS.ignite[B.stone]).toBe(0);
    expect(LAVA_IGNITES[idOf('crafting_table')]).toBe(1);
    expect(LAVA_IGNITES[B.stone]).toBe(0);
  });

  test('fire on bare stone burns out',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'fire');
    g.run(3000);
    expect(g.get(0,Y,0)).toBe('air');
  });

  test('fire spreads to and destroys flammable blocks',()=>{
    const g=createTickGame();
    for(let x=-3;x<=3;x++)for(let z=1;z<=3;z++)g.set(x,Y,z,'oak_planks');
    g.set(0,Y,0,'fire');
    let spread=0;
    g.events.on('blockChanged',e=>{if(e.from===0&&e.to===idOf('fire'))spread++;});
    g.run(4000);
    expect(spread).toBeGreaterThan(0);
    let planks=0;for(let x=-3;x<=3;x++)for(let z=1;z<=3;z++)if(g.get(x,Y,z)==='oak_planks')planks++;
    expect(planks).toBeLessThan(21);
    expect(g.drops).toHaveLength(0);
  });

  test('rain puts fire out and stops it spreading',()=>{
    const g=createTickGame();
    g.weather={...g.weather,state:'rain',isRainingOn:()=>true};
    for(let x=-2;x<=2;x++)for(let z=1;z<=2;z++)g.set(x,Y,z,'oak_planks');
    g.set(0,Y,0,'fire');
    g.run(800);
    let fires=0;
    for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(let y=Y;y<Y+4;y++)if(g.get(x,y,z)==='fire')fires++;
    expect(fires).toBe(0);
  });

  test('fire next to a flammable wall survives in the air beside it',()=>{
    const g=createTickGame();
    for(let y=Y;y<Y+3;y++)g.set(1,y,0,'oak_log');
    g.set(0,Y+2,0,'fire');
    g.run(2);
    expect(g.get(0,Y+2,0)).toBe('fire');
    g.set(2,Y+5,0,'fire');
    g.run(2);
    expect(g.get(2,Y+5,0)).toBe('air');
  });

  test('fire primes TNT it burns',()=>{
    const g=createTickGame();
    g.set(1,Y,0,'tnt');g.set(-1,Y,0,'tnt');g.set(0,Y,1,'tnt');g.set(0,Y,-1,'tnt');g.set(0,Y+1,0,'tnt');
    g.set(0,Y+2,0,'fire');
    for(let i=0;i<200&&!g.entities.all().some(e=>e.kind==='primed_tnt');i++)g.run(20);
    const tnt=g.entities.all().find(e=>e.kind==='primed_tnt');
    expect(tnt).toBeDefined();
    expect(tnt!.data.byPlayer).toBe(false);
  });

  test('lava ignites flammable blocks near the air above it',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'lava');
    for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]])g.set(x,Y,z,'stone');
    for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]])g.set(x,Y+1,z,'oak_planks');
    for(let i=0;i<400&&g.get(0,Y+1,0)!=='fire';i++)g.ticks.randomTickAt(0,Y,0);
    expect(g.get(0,Y+1,0)).toBe('fire');
  });
});
