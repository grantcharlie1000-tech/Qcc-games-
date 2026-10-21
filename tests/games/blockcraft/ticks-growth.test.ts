import {describe,expect,test} from 'vitest';
import {createTickGame,idOf} from './ticks-helpers';
import {blockDef} from '../../../src/games/blockcraft/data/blocks';
import {cropGrowthSpeed,nextCopper} from '../../../src/games/blockcraft/world/growth';

const Y=60;
/** Calls the random-tick handler of one block n times. */
const randomTicks=(g:ReturnType<typeof createTickGame>,x:number,y:number,z:number,n:number)=>{for(let i=0;i<n;i++)g.ticks.randomTickAt(x,y,z);};

describe('crops',()=>{
  test('growth speed follows the vanilla farmland rule (wet beds and rows)',()=>{
    const g=createTickGame();
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)g.set(x,Y-1,z,'farmland_wet');
    g.set(0,Y,0,'wheat_0');
    expect(cropGrowthSpeed(g.world,idOf('wheat_0'),0,Y,0)).toBeCloseTo(10);
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)g.set(x,Y-1,z,'farmland');
    expect(cropGrowthSpeed(g.world,idOf('wheat_0'),0,Y,0)).toBeCloseTo(4);
    // The same crop on both sides of a row halves the speed.
    g.set(-1,Y,0,'wheat_0');g.set(1,Y,0,'wheat_0');g.set(0,Y,1,'wheat_0');
    expect(cropGrowthSpeed(g.world,idOf('wheat_0'),0,Y,0)).toBeCloseTo(2);
  });

  test('crops grow at light 9 or more, faster on wet farmland, and stop at full age',()=>{
    const g=createTickGame();g.light(15);
    const plant=(x:number,wet:boolean)=>{g.set(x,Y-1,0,wet?'farmland_wet':'farmland');g.set(x,Y,0,'wheat_0');};
    let wet=0,dry=0;
    for(let trial=0;trial<40;trial++){
      plant(-4,true);plant(4,false);
      for(let i=0;i<20;i++){g.ticks.randomTickAt(-4,Y,0);g.ticks.randomTickAt(4,Y,0);}
      wet+=blockDef(g.world.get(-4,Y,0)).age!;dry+=blockDef(g.world.get(4,Y,0)).age!;
    }
    expect(wet).toBeGreaterThan(dry*1.5);
    plant(0,true);randomTicks(g,0,Y,0,400);
    expect(g.get(0,Y,0)).toBe('wheat_7');
    g.set(2,Y-1,0,'farmland_wet');g.set(2,Y,0,'carrots_0');randomTicks(g,2,Y,0,400);
    expect(g.get(2,Y,0)).toBe('carrots_3');
  });

  test('crops do not grow in darkness',()=>{
    const g=createTickGame();g.light(0,8);
    g.set(0,Y-1,0,'farmland_wet');g.set(0,Y,0,'wheat_0');
    randomTicks(g,0,Y,0,300);
    expect(g.get(0,Y,0)).toBe('wheat_0');
  });

  test('natural random ticks reach crops in loaded chunks near the player',()=>{
    const g=createTickGame({randomTickSpeed:300});g.light(15);
    for(let x=0;x<8;x++){g.set(x,Y-1,0,'farmland_wet');g.set(x,Y,0,'wheat_0');}
    g.run(400);
    let grown=0;for(let x=0;x<8;x++)grown+=blockDef(g.world.get(x,Y,0)).age!;
    expect(grown).toBeGreaterThan(8);
  });
});

describe('saplings',()=>{
  test('grow into trees through terrain.growTree when lit',()=>{
    const g=createTickGame();g.light(15);
    g.set(0,Y-1,0,'grass_block');g.set(0,Y,0,'birch_sapling');
    randomTicks(g,0,Y,0,200);
    expect(g.trees).toContainEqual({x:0,y:Y,z:0,kind:'birch'});
    const dark=createTickGame();dark.light(0,4);
    dark.set(0,Y-1,0,'grass_block');dark.set(0,Y,0,'oak_sapling');
    randomTicks(dark,0,Y,0,200);
    expect(dark.trees).toHaveLength(0);
  });
});

describe('grass and mycelium',()=>{
  test('grass spreads to nearby dirt when lit and uncovered',()=>{
    const g=createTickGame();g.light(15);
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)g.set(x,Y-1,z,'dirt');
    g.set(0,Y-1,0,'grass_block');
    g.set(1,Y,1,'stone');// covers one dirt block
    randomTicks(g,0,Y-1,0,300);
    expect(g.get(1,Y-1,0)).toBe('grass_block');
    expect(g.get(-1,Y-1,-1)).toBe('grass_block');
    expect(g.get(1,Y-1,1)).toBe('dirt');
  });

  test('grass dies under an opaque block but not under glass',()=>{
    const g=createTickGame();g.light(15);
    g.set(0,Y-1,0,'grass_block');g.set(0,Y,0,'stone');
    g.set(2,Y-1,0,'grass_block');g.set(2,Y,0,'glass');
    g.ticks.randomTickAt(0,Y-1,0);g.ticks.randomTickAt(2,Y-1,0);
    expect(g.get(0,Y-1,0)).toBe('dirt');
    expect(g.get(2,Y-1,0)).toBe('grass_block');
  });

  test('mycelium spreads to dirt too',()=>{
    const g=createTickGame();g.light(15);
    g.set(0,Y-1,0,'mycelium');g.set(1,Y-1,0,'dirt');
    randomTicks(g,0,Y-1,0,300);
    expect(g.get(1,Y-1,0)).toBe('mycelium');
  });
});

describe('farmland',()=>{
  test('hydrates within 4 blocks of water, dries and reverts to dirt when empty',()=>{
    const g=createTickGame();
    g.set(0,Y-1,0,'farmland');g.set(4,Y-1,0,'water');
    g.ticks.randomTickAt(0,Y-1,0);
    expect(g.get(0,Y-1,0)).toBe('farmland_wet');
    g.set(4,Y-1,0,'stone');
    randomTicks(g,0,Y-1,0,200);
    expect(g.get(0,Y-1,0)).toBe('dirt');
  });

  test('farmland under a crop stays farmland, and a solid block above turns it to dirt',()=>{
    const g=createTickGame();
    g.set(0,Y-1,0,'farmland');g.set(0,Y,0,'wheat_3');
    randomTicks(g,0,Y-1,0,100);
    expect(g.get(0,Y-1,0)).toBe('farmland');
    g.set(2,Y-1,0,'farmland_wet');g.set(2,Y,0,'stone');
    g.run(3);
    expect(g.get(2,Y-1,0)).toBe('dirt');
  });

  test('rain keeps farmland moist',()=>{
    const g=createTickGame();
    g.weather={...g.weather,state:'rain',isRainingOn:()=>true};
    g.set(0,Y-1,0,'farmland');
    g.ticks.randomTickAt(0,Y-1,0);
    expect(g.get(0,Y-1,0)).toBe('farmland_wet');
  });
});

describe('sugar cane and cactus',()=>{
  test('grow up to three blocks tall',()=>{
    const g=createTickGame();
    g.set(0,Y-1,0,'sand');g.set(1,Y-1,0,'water');g.set(0,Y,0,'sugar_cane');
    for(let i=0;i<500;i++)for(let y=Y;y<Y+4;y++)if(g.get(0,y,0)==='sugar_cane')g.ticks.randomTickAt(0,y,0);
    expect([g.get(0,Y,0),g.get(0,Y+1,0),g.get(0,Y+2,0),g.get(0,Y+3,0)]).toEqual(['sugar_cane','sugar_cane','sugar_cane','air']);
    g.set(4,Y-1,4,'sand');g.set(4,Y,4,'cactus');
    for(let i=0;i<500;i++)for(let y=Y;y<Y+4;y++)if(g.get(4,y,4)==='cactus')g.ticks.randomTickAt(4,y,4);
    expect([g.get(4,Y+2,4),g.get(4,Y+3,4)]).toEqual(['cactus','air']);
  });

  test('cactus growing beside a solid block breaks off',()=>{
    const g=createTickGame();
    g.set(0,Y-1,0,'sand');g.set(0,Y,0,'cactus');g.set(1,Y+1,0,'stone');
    for(let i=0;i<200&&g.dropCalls.length===0;i++){g.ticks.randomTickAt(0,Y,0);g.run(2);}
    expect(g.get(0,Y+1,0)).toBe('air');
    expect(g.dropCalls.some(c=>c.id===idOf('cactus'))).toBe(true);
  });
});

describe('melting',()=>{
  test('ice melts to water and snow layers vanish at block light 12',()=>{
    const g=createTickGame();g.light(0,12);
    g.set(0,Y,0,'ice');g.set(2,Y,0,'snow');g.set(4,Y,0,'packed_ice');
    g.ticks.randomTickAt(0,Y,0);g.ticks.randomTickAt(2,Y,0);g.ticks.randomTickAt(4,Y,0);
    expect(g.get(0,Y,0)).toBe('water');
    expect(g.get(2,Y,0)).toBe('air');
    expect(g.get(4,Y,0)).toBe('packed_ice');
    const dim=createTickGame();dim.light(15,11);
    dim.set(0,Y,0,'ice');dim.ticks.randomTickAt(0,Y,0);
    expect(dim.get(0,Y,0)).toBe('ice');
  });
});

describe('leaf decay',()=>{
  function tree(g:ReturnType<typeof createTickGame>,x:number,z:number){
    for(let y=Y;y<Y+4;y++)g.set(x,y,z,'oak_log');
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let y=Y+2;y<Y+6;y++)if(g.get(x+dx,y,z+dz)==='air')g.set(x+dx,y,z+dz,'oak_leaves');
  }
  test('leaves without a log within 6 steps decay on random ticks, persistent leaves stay',()=>{
    const g=createTickGame();
    tree(g,0,0);g.set(2,Y+5,2,'oak_leaves_persistent');
    g.run(5);
    randomTicks(g,2,Y+3,2,5);
    expect(g.get(2,Y+3,2)).toBe('oak_leaves');
    for(let y=Y;y<Y+4;y++)g.set(0,y,0,'air');
    g.run(40);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let y=Y+2;y<Y+6;y++)g.ticks.randomTickAt(dx,y,dz);
    expect(g.get(2,Y+3,2)).toBe('air');
    expect(g.get(0,Y+5,0)).toBe('air');
    expect(g.get(2,Y+5,2)).toBe('oak_leaves_persistent');
    expect(g.dropCalls.filter(c=>c.id===idOf('oak_leaves')).length).toBeGreaterThan(50);
  });

  test('leaves connected to another log within 6 steps survive',()=>{
    const g=createTickGame();
    tree(g,0,0);tree(g,4,0);
    for(let y=Y;y<Y+4;y++)g.set(0,y,0,'air');
    g.run(40);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let y=Y+2;y<Y+6;y++)g.ticks.randomTickAt(dx,y,dz);
    // (1, Y+3, 0) is two steps from the second trunk; (-2, Y+5, -2) is 6+ steps away from it.
    expect(g.get(1,Y+3,0)).toBe('oak_leaves');
    expect(g.get(-2,Y+5,-2)).toBe('air');
  });
});

describe('copper',()=>{
  test('oxidises one stage at a time, never past oxidized',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'copper_block');
    const seen:string[]=[];
    for(let i=0;i<4000;i++){g.ticks.randomTickAt(0,Y,0);const n=g.get(0,Y,0);if(seen[seen.length-1]!==n)seen.push(n);}
    expect(seen).toEqual(['copper_block','exposed_copper','weathered_copper','oxidized_copper']);
  });

  test('a less oxidised neighbour within 4 blocks holds back the change',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'weathered_copper');g.set(2,Y,0,'copper_block');
    expect(nextCopper(g.world,idOf('weathered_copper'),0,Y,0,()=>0)).toBe(-1);
    g.set(2,Y,0,'oxidized_copper');
    expect(nextCopper(g.world,idOf('weathered_copper'),0,Y,0,()=>0)).toBe(idOf('oxidized_copper'));
    expect(nextCopper(g.world,idOf('oxidized_copper'),2,Y,0,()=>0)).toBe(-1);
  });
});
