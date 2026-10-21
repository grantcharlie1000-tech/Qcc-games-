import {describe,expect,test} from 'vitest';
import {createTickGame,type TickGame} from './ticks-helpers';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {LAYER,CHUNK_VOLUME,chunkKey} from '../../../src/games/blockcraft/engine/constants';
import {posKey,keyPos} from '../../../src/games/blockcraft/world/ticks-core';
import type {VoxelWorld} from '../../../src/games/blockcraft/world/world';

const Y=60;
const snapshot=(g:TickGame)=>[...g.world.chunks.values()].map(c=>Array.from(c.blocks).join(',')).join('|');

describe('scheduling',()=>{
  test('position keys round-trip over the whole world range',()=>{
    for(const [x,y,z] of [[0,0,0],[-1,5,-1],[524287,127,-524288],[-524288,64,524287],[123,1,-456]]){
      expect(keyPos(posKey(x,y,z))).toEqual({x,y,z});
    }
  });

  test('schedule() runs an update after the delay; duplicates keep the first',()=>{
    const g=createTickGame();
    g.world.chunk(0,0)!.blocks[(Y+3)*LAYER]=B.sand;// floating sand placed without an event: nothing knows yet
    g.run(5);
    expect(g.get(0,Y+3,0)).toBe('sand');
    g.ticks.schedule(0,Y+3,0,10);g.ticks.schedule(0,Y+3,0,3);
    expect(g.ticks.pending()).toBe(1);
    g.run(9);
    expect(g.get(0,Y+3,0)).toBe('sand');
    g.run(1);
    expect(g.get(0,Y+3,0)).toBe('air');
  });

  test('a kind at its cap does not hold back the other kinds',()=>{
    /** Ticks until sand starts falling after its support goes, and until a lone source makes its first flow. */
    const measure=(busy:'flood'|'canopy'|null)=>{
      const g=createTickGame();
      g.set(30,Y+3,30,'stone');g.set(30,Y+4,30,'sand');
      // A flood (far more than the fluid cap) or a felled 9×9×5 canopy (far more than the leaf check cap).
      if(busy==='flood')for(let x=-24;x<=20;x+=4)for(let z=-24;z<=20;z+=4)g.set(x,Y,z,'water');
      if(busy==='canopy'){
        for(let y=Y;y<Y+9;y++)for(const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]])g.set(dx,y,dz,'oak_log');
        for(let y=Y+4;y<Y+9;y++)for(let dx=-4;dx<=5;dx++)for(let dz=-4;dz<=5;dz++)if(g.get(dx,y,dz)==='air')g.set(dx,y,dz,'oak_leaves');
      }
      g.run(20);
      if(busy==='canopy')for(let y=Y;y<Y+9;y++)for(const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]])g.set(dx,y,dz,'air');
      g.set(30,Y+3,30,'air');g.set(38,Y,-20,'water');
      let fell=-1,flowed=-1,capped=false;
      for(let t=1;t<=40&&(fell<0||flowed<0);t++){
        g.run(1);
        const s=g.ticks.stats();
        capped||=busy==='flood'?s.fluidUpdates>=g.ticks.limits.fluidUpdates:s.leafChecks>=g.ticks.limits.leafChecks;
        if(fell<0&&g.get(30,Y+4,30)!=='sand')fell=t;
        if(flowed<0&&g.get(39,Y,-20)!=='air')flowed=t;
      }
      return{fell,flowed,capped};
    };
    const alone=measure(null),flood=measure('flood'),canopy=measure('canopy');
    expect(alone.fell).toBeGreaterThan(0);expect(alone.flowed).toBeGreaterThan(0);
    expect(flood.capped).toBe(true);
    expect(flood.fell).toBe(alone.fell);
    expect(canopy.capped).toBe(true);
    expect(canopy.fell).toBe(alone.fell);
    expect(canopy.flowed).toBe(alone.flowed);
  });

  test('blockChanged schedules neighbour updates (support, gravity, fluids)',()=>{
    const g=createTickGame();
    g.set(0,Y+2,0,'sand');g.set(2,Y,0,'water');
    g.set(4,Y,0,'dirt');g.set(4,Y+1,0,'poppy');
    g.run(1);
    expect(g.ticks.pending()).toBe(2);
    g.set(4,Y,0,'air');
    g.run(1);
    expect(g.get(4,Y+1,0)).toBe('air');
  });
});

describe('unloaded chunks',()=>{
  const insert=(g:TickGame,cx:number,cz:number)=>{
    const blocks=new Uint8Array(CHUNK_VOLUME);blocks.fill(B.stone,0,Y*LAYER);
    (g.world as VoxelWorld).insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER)});
  };
  test('ticks next to unloaded chunks wait until the neighbourhood is loaded',()=>{
    const g=createTickGame();
    g.set(-30,Y,0,'water');
    g.run(60);
    expect(g.get(-29,Y,0)).toBe('air');
    expect(g.ticks.pending()).toBeGreaterThan(0);
    insert(g,-3,-1);insert(g,-3,0);
    g.run(60);
    expect(g.get(-29,Y,0)).toBe('water_1');
    expect(g.get(-33,Y,0)).toBe('water_3');
  });

  test('ticks pending in a chunk that unloads resume when it comes back',()=>{
    const g=createTickGame(),w=g.world as VoxelWorld;
    g.set(0,Y,0,'water');
    g.run(1);
    const pending=g.ticks.pending();
    expect(pending).toBeGreaterThan(0);
    w.remove(chunkKey(0,0));
    g.run(20);
    expect(g.ticks.pending()).toBe(pending);
    insert(g,0,0);// edits are replayed: the water is back
    g.run(40);
    expect(g.get(1,Y,0)).toBe('water_1');
  });
});

describe('persistence',()=>{
  test('pending scheduled ticks survive serialize / restore',()=>{
    const a=createTickGame();
    a.set(0,Y,0,'water');a.run(4);
    a.set(5,Y+6,5,'sand');a.run(2);
    const saved=JSON.parse(JSON.stringify(a.ticks.serialize()));
    const edits=(a.world as VoxelWorld).serializeEdits();
    const b=createTickGame(),bw=b.world as VoxelWorld;
    bw.clear();bw.restoreEdits(edits);b.flat(60,B.stone,2);
    b.time.tick=a.time.tick;
    b.ticks.reset!();b.ticks.restore!(saved);
    expect(b.ticks.pending()).toBe(a.ticks.pending());
    a.run(200);b.run(200);
    expect(b.get(5,Y,5)).toBe('sand');
    for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)expect(b.get(x,Y,z)).toBe(a.get(x,Y,z));
  });

  test('restore ignores invalid data and never throws',()=>{
    const g=createTickGame();
    for(const bad of [null,1,'x',[],{v:1,ticks:'no'},{v:1,ticks:[1,2]},{v:1,ticks:[-1,5,0,1e9,NaN,0,3,posKey(0,Y,0),9]},{v:1,orphans:[{}],fire:['a',1]},{v:99}])
      expect(()=>g.ticks.restore!(bad)).not.toThrow();
    expect(g.ticks.pending()).toBe(0);
    g.ticks.restore!({v:1,ticks:[4,posKey(0,Y,0),0,4,-5,0,4,2**50,0]});
    expect(g.ticks.pending()).toBe(1);
  });

  test('reset clears all pending work',()=>{
    const g=createTickGame();
    g.set(0,Y,0,'water');g.run(1);
    expect(g.ticks.pending()).toBeGreaterThan(0);
    g.ticks.reset!();
    expect(g.ticks.pending()).toBe(0);
  });
});

describe('determinism and budget',()=>{
  function busyWorld(seed:number,r=2,randomTickSpeed=3){
    const g=createTickGame({seed,r,randomTickSpeed});g.light(15);
    // Grass over dirt, crops, saplings, a tree, a pool and a fire.
    for(let x=-12;x<12;x++)for(let z=-12;z<12;z++){g.set(x,Y-1,z,x%3===0?'dirt':'grass_block');}
    for(let x=0;x<6;x++){g.set(x,Y-1,6,'farmland_wet');g.set(x,Y,6,'wheat_0');}
    for(let y=Y;y<Y+4;y++)g.set(-6,y,-6,'oak_log');
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let y=Y+2;y<Y+5;y++)if(g.get(-6+dx,y,-6+dz)==='air')g.set(-6+dx,y,-6+dz,'oak_leaves');
    g.set(8,Y,8,'water');g.set(-8,Y,8,'lava');
    for(let x=4;x<9;x++)g.set(x,Y,-6,'oak_planks');g.set(4,Y,-5,'fire');
    g.set(0,Y+8,0,'sand');
    return g;
  }
  test('the same seed gives the same world',()=>{
    const a=busyWorld(11,2,60),b=busyWorld(11,2,60);
    a.run(600);b.run(600);
    expect(snapshot(a)).toBe(snapshot(b));
    const c=busyWorld(12,2,60);c.run(600);
    expect(snapshot(c)).not.toBe(snapshot(a));
  });

  test('block ticks stay within 1 ms per tick on average in a large busy world',()=>{
    const g=busyWorld(5,8);
    // A forest canopy and grass everywhere within random tick range.
    for(const c of g.world.chunks.values()){
      const b=c.blocks;
      for(let i=0;i<LAYER;i++){b[i+(Y-1)*LAYER]=B.grass;if(i%7===0)for(let y=Y+3;y<Y+6;y++)b[i+y*LAYER]=B.oakLeaves;}
      c.heightmap.fill(Y+5);c.light=new Uint8Array(CHUNK_VOLUME).fill(0xf0);
    }
    g.run(60);// warm up: section scans, the first fluid and fire updates
    let best=Infinity;
    for(let round=0;round<3;round++){
      let total=0;
      for(let i=0;i<100;i++){g.run(1);total+=g.ticks.stats().ms;}
      best=Math.min(best,total/100);
    }
    console.log(`block ticks: ${best.toFixed(3)} ms per tick, ${g.ticks.stats().randomTicks} random ticks per tick`);
    expect(best).toBeLessThan(1);
    expect(g.ticks.stats().randomTicks).toBeGreaterThan(1000);
  });
});
