import {describe,expect,test} from 'vitest';
import {createTickGame,idOf} from './ticks-helpers';
import {blockDef} from '../../../src/games/blockcraft/data/blocks';

// Flat stone world: the floor's top is y = 59, fluids sit at y = 60.
const Y=60;
const liquidAt=(g:ReturnType<typeof createTickGame>,x:number,y:number,z:number)=>blockDef(Math.max(0,g.world.get(x,y,z))).liquid;

describe('water',()=>{
  test('a source spreads every 5 ticks into a diamond of levels 1..7 on flat ground',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'water');
    g.run(8);
    // Scheduled 5 ticks after placement: the first ring exists, the second not yet.
    expect(g.get(1,Y,0)).toBe('water_1');
    expect(g.get(2,Y,0)).toBe('air');
    g.run(200);
    for(let d=1;d<=7;d++){
      expect(g.get(d,Y,0)).toBe(`water_${d}`);
      expect(g.get(0,Y,-d)).toBe(`water_${d}`);
    }
    expect(g.get(8,Y,0)).toBe('air');
    expect(g.get(3,Y,4)).toBe('water_7');
    expect(g.get(4,Y,4)).toBe('air');
    expect(g.get(0,Y,0)).toBe('water');
  });

  test('flow heads only toward the nearest drop within reach',()=>{
    const g=createTickGame();
    g.set(3,Y-1,0,'air');// a hole three blocks east
    g.set(0,Y,0,'water');
    g.run(200);
    expect(g.get(1,Y,0)).toBe('water_1');
    expect(g.get(2,Y,0)).toBe('water_2');
    expect(liquidAt(g,3,Y-1,0)?.kind).toBe('water');
    expect(g.get(-1,Y,0)).toBe('air');
    expect(g.get(0,Y,1)).toBe('air');
    expect(g.get(0,Y,-1)).toBe('air');
  });

  test('falling water fills a shaft and spreads out at the bottom',()=>{
    const g=createTickGame();
    for(let y=55;y<Y;y++)g.set(0,y,0,'air');
    for(let x=1;x<=3;x++)g.set(x,55,0,'air');// a side tunnel at the bottom
    g.set(0,Y,0,'water');
    g.run(300);
    for(let y=55;y<Y;y++)expect(g.get(0,y,0)).toBe('water_falling');
    expect(g.get(1,55,0)).toBe('water_1');
    expect(g.get(3,55,0)).toBe('water_3');
  });

  test('two adjacent sources over solid ground make an infinite source',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'water');g.set(2,Y,0,'water');
    g.run(100);
    expect(g.get(1,Y,0)).toBe('water');
    g.set(0,Y,0,'stone');
    g.run(100);
    expect(g.get(1,Y,0)).toBe('water');
  });

  test('removing the source drains the flow',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'water');
    g.run(200);
    expect(g.get(5,Y,0)).toBe('water_5');
    g.set(0,Y,0,'air');
    g.run(300);
    for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)expect(liquidAt(g,x,Y,z)).toBeUndefined();
  });

  test('water washes away plants and pops their drops',()=>{
    const g=createTickGame();
    g.set(2,Y-1,0,'grass_block');g.set(2,Y,0,'poppy');
    g.set(0,Y,0,'water');
    g.run(100);
    expect(g.get(2,Y,0)).toBe('water_2');
    expect(g.dropCalls.some(c=>c.id===idOf('poppy')&&c.tool===null&&c.cause==='fluid')).toBe(true);
    expect(g.drops.some(d=>d.stack.id==='poppy')).toBe(true);
  });
});

describe('lava',()=>{
  test('spreads every 30 ticks with a level step of 2, three blocks on flat ground',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'lava');
    g.run(25);
    expect(g.get(1,Y,0)).toBe('air');
    g.run(10);
    expect(g.get(1,Y,0)).toBe('lava_2');
    g.run(600);
    expect(g.get(1,Y,0)).toBe('lava_2');
    expect(g.get(2,Y,0)).toBe('lava_4');
    expect(g.get(3,Y,0)).toBe('lava_6');
    expect(g.get(4,Y,0)).toBe('air');
    expect(g.get(1,Y,1)).toBe('lava_4');
  });

  test('a lava source touching water becomes obsidian',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'lava');
    g.set(0,Y+1,0,'water');
    g.run(2);
    expect(g.get(0,Y,0)).toBe('obsidian');
    expect(g.sounds.played.some(s=>s.name==='fizz')).toBe(true);
  });

  test('flowing lava touching water becomes cobblestone',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'lava');
    g.run(40);
    expect(g.get(1,Y,0)).toBe('lava_2');
    g.set(2,Y,0,'water');
    g.run(2);
    expect(g.get(1,Y,0)).toBe('cobblestone');
  });

  test('lava flowing down onto water turns it to stone',()=>{
    const g=createTickGame();
    g.set(0,Y-1,0,'water');// a one-block pool in the floor
    g.set(0,Y+1,0,'lava');
    g.run(120);
    expect(g.get(0,Y-1,0)).toBe('stone');
  });

  test('fluid updates per tick are capped and the rest run on later ticks',()=>{
    const g=createTickGame();
    for(let x=-15;x<=15;x+=2)for(let z=-15;z<=15;z+=2)g.set(x,Y,z,'water');
    g.run(6);
    const limit=g.ticks.limits.fluidUpdates;
    expect(limit).toBeLessThan(256);
    expect(g.ticks.stats().fluidUpdates).toBe(limit);
    g.run(1);
    expect(g.ticks.stats().fluidUpdates).toBeGreaterThan(0);
    g.run(400);
    expect(g.get(16,Y,16)).toMatch(/^water/);
  });
});
