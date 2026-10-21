import {describe,expect,test} from 'vitest';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {MAX_NODES,findPath,standableCell} from '../../../src/games/blockcraft/entity/ai-path';
import {NODES_PER_TICK} from '../../../src/games/blockcraft/entity/ai';
import type {EntityDebug} from '../../../src/games/blockcraft/entity/entities';
import type {Entity,EntityKind} from '../../../src/games/blockcraft/engine/contracts';
import {fill,harness,walker} from './entities-helpers';

const path=new Int32Array(64*3);
const cells=(n:number)=>Array.from({length:n},(_,i)=>[path[i*3],path[i*3+1],path[i*3+2]]);
const size={width:.6,height:1.8};
/** Unique cells a node's neighbourhood adds, generously (each cell is read from the world once per search). */
const READS_PER_NODE=20;
/** World reads per mob per tick allowed when 60 mobs chase an unreachable goal (physics and steering included). */
const READS_PER_MOB_TICK=150;

describe('bounded A*',()=>{
  test('finds a way around a wall and only uses standable cells',()=>{
    const h=harness();fill(h.game,3,60,-3,3,62,3,B.stone);
    const r=findPath(h.game.world,0,60,0,6,60,0,size,path);
    expect(r.complete).toBe(true);
    const list=cells(r.length);
    expect(list[list.length-1]).toEqual([6,60,0]);
    for(const [x,y,z] of list){expect(standableCell(h.game.world,x,y,z)).toBe(true);expect(x===3&&Math.abs(z)<=3).toBe(false);}
    expect(r.expanded).toBeLessThanOrEqual(MAX_NODES);
  });
  test('gives up within 200 nodes when the goal is sealed off',()=>{
    const h=harness({r:3});
    fill(h.game,8,60,-2,12,62,2,B.stone);fill(h.game,9,60,-1,11,61,1,0);// a hollow box with no door
    const r=findPath(h.game.world,0,60,0,10,60,0,size,path);
    expect(r.complete).toBe(false);expect(r.expanded).toBeLessThanOrEqual(MAX_NODES);
  });
  test('never steps on lava or into fire, and keeps away from cacti',()=>{
    const h=harness();
    fill(h.game,2,59,-1,4,59,1,B.lava);
    const r=findPath(h.game.world,0,60,0,6,60,0,size,path);
    expect(r.complete).toBe(true);
    for(const [x,y,z] of cells(r.length)){
      expect(h.game.world.get(x,y-1,z)).not.toBe(B.lava);expect(h.game.world.get(x,y,z)).not.toBe(B.lava);
    }
    expect(Math.max(...cells(r.length).map(c=>Math.abs(c[2])))).toBeGreaterThanOrEqual(2);
  });
  test('takes drops of up to 3 blocks but not deeper cliffs; climbs 1-block steps',()=>{
    const ledge=(height:number)=>{
      const h=harness();fill(h.game,-3,60,-3,2,59+height,3,B.stone);// a plateau `height` above the ground
      return findPath(h.game.world,0,60+height,0,6,60,0,size,path).complete;
    };
    expect(ledge(3)).toBe(true);expect(ledge(4)).toBe(false);
    const h=harness();h.game.world.set(3,60,0,B.stone);fill(h.game,3,60,-3,3,60,3,B.stone);fill(h.game,4,60,-3,8,60,3,B.stone);
    const up=findPath(h.game.world,0,60,0,6,61,0,size,path);
    expect(up.complete).toBe(true);expect(cells(up.length).some(c=>c[1]===61)).toBe(true);
  });
  test('wide mobs need wide gaps',()=>{
    const h=harness();fill(h.game,-32,60,3,47,62,3,B.stone);fill(h.game,0,60,3,0,62,3,0);// a wall across the world with a 1-wide gap
    expect(findPath(h.game.world,0,60,0,0,60,6,size,path).complete).toBe(true);
    expect(findPath(h.game.world,-1,60,0,-1,60,6,{width:1.4,height:.9},path).complete).toBe(false);
  });
  test('a failed 200-node search reads each world cell about once (memoised per search)',()=>{
    const h=harness({r:3});
    fill(h.game,8,60,-2,12,62,2,B.stone);fill(h.game,9,60,-1,11,61,1,0);// a hollow box with no door
    for(const [width,height] of [[.6,1.8],[1.4,.9]]){
      let reads=0;const counted={get:(x:number,y:number,z:number)=>{reads++;return h.game.world.get(x,y,z);}};
      const r=findPath(counted,0,60,0,10,60,0,{width,height},path);
      expect(r.complete).toBe(false);expect(r.expanded).toBe(MAX_NODES);
      expect(reads).toBeLessThan(MAX_NODES*READS_PER_NODE);
    }
    // The memo never outlives a search: a changed world is seen by the next one.
    const before=findPath(h.game.world,0,60,0,4,60,0,size,path).complete;
    fill(h.game,2,60,-40,2,62,40,B.stone);
    expect(before).toBe(true);expect(findPath(h.game.world,0,60,0,4,60,0,size,path).complete).toBe(false);
  });
});

describe('steering helpers',()=>{
  const navigator=(goal:()=>[number,number,number],speed=2.3):EntityKind=>walker({kind:'nav',tick:(e,game)=>{const [x,y,z]=goal();game.entities.ai.navigate(e,x,y,z,speed);}});
  test('navigate walks around a wall to the goal',()=>{
    const h=harness({kinds:[navigator(()=>[6.5,60,.5])]});fill(h.game,3,60,-3,3,62,3,B.stone);
    const e=h.game.entities.spawn('nav',.5,60,.5)!;
    h.tick(200);
    expect(Math.hypot(e.x-6.5,e.z-.5)).toBeLessThan(1);
  });
  test('navigate jumps up a step and over a ledge to reach a raised goal',()=>{
    const h=harness({kinds:[navigator(()=>[5.5,61,.5])]});fill(h.game,3,60,-3,8,60,3,B.stone);
    const e=h.game.entities.spawn('nav',.5,60,.5)!;
    h.tick(160);
    expect(e.y).toBeCloseTo(61,2);expect(Math.hypot(e.x-5.5,e.z-.5)).toBeLessThan(1);
  });
  test('navigate re-plans when the goal moves more than 2 blocks',()=>{
    let goal:[number,number,number]=[6.5,60,.5];
    const h=harness({kinds:[navigator(()=>goal)]});const e=h.game.entities.spawn('nav',.5,60,.5)!;
    h.tick(80);expect(Math.hypot(e.x-6.5,e.z-.5)).toBeLessThan(1);
    goal=[.5,60,8.5];h.tick(120);
    expect(Math.hypot(e.x-.5,e.z-8.5)).toBeLessThan(1);
  });
  test('moveToward returns true within half a block and refuses to walk off a cliff',()=>{
    const h=harness({kinds:[walker()]});const e=h.game.entities.spawn('walker',.5,60,.5)!;h.tick(2);
    expect(h.game.entities.ai.moveToward(e,.7,60,.6,2)).toBe(true);expect(e.moveX).toBe(0);
    fill(h.game,3,50,-5,12,59,5,0);// a 10-deep pit beyond x = 3
    for(let i=0;i<80;i++){h.game.entities.ai.moveToward(e,8.5,60,.5,2);h.tick();}
    expect(e.y).toBeCloseTo(60,3);expect(e.x).toBeLessThan(3.2);
  });
  test('moveToward jumps a 1-block step',()=>{
    const h=harness({kinds:[walker({kind:'go',tick:(e,game)=>{game.entities.ai.moveToward(e,9.5,61,.5,2.3);}})]});
    fill(h.game,3,60,-3,12,60,3,B.stone);
    const e=h.game.entities.spawn('go',.5,60,.5)!;
    h.tick(120);
    expect(e.y).toBeCloseTo(61,3);expect(e.x).toBeGreaterThan(8.9);
  });
  test('flee runs away from the threat',()=>{
    const h=harness({kinds:[walker({kind:'prey',tick:(e,game)=>game.entities.ai.flee(e,.5,.5,3)})],r:3});
    const e=h.game.entities.spawn('prey',2.5,60,.5)!;
    h.tick(80);
    expect(Math.hypot(e.x-.5,e.z-.5)).toBeGreaterThan(7);
  });
  test('wander picks a standable spot and walks there',()=>{
    const h=harness({kinds:[walker({kind:'idle',tick:(e,game)=>game.entities.ai.wander(e,1.5,1)})]});
    const e=h.game.entities.spawn('idle',.5,60,.5)!;
    h.tick(60);
    expect(Math.hypot(e.x-.5,e.z-.5)).toBeGreaterThan(1);expect(e.y).toBeCloseTo(60,3);
  });
  test('lookAt turns the head up to 30° a tick; the body follows past 75°',()=>{
    const h=harness({kinds:[walker()]});const e=h.game.entities.spawn('walker',.5,60,.5)!;
    for(let i=0;i<8;i++)h.game.entities.ai.lookAt(e,.5,61.5,10.5);// straight behind (+z)
    expect(Math.abs(Math.abs(e.headYaw)-Math.PI)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(e.headYaw-e.yaw)-75*Math.PI/180)).toBeLessThan(1e-6);
    h.game.entities.ai.lookAt(e,.5,70,.5+1e-3);expect(e.pitch).toBeGreaterThan(0);
  });
  test('canSee is blocked by stone, glass and leaves but not by grass or water',()=>{
    const h=harness({kinds:[walker()]});const e:Entity=h.game.entities.spawn('walker',.5,60,.5)!;
    const see=(id:number)=>{fill(h.game,-1,60,3,1,62,3,id);return h.game.entities.ai.canSee(e,.5,61.5,6.5);};
    expect(see(0)).toBe(true);expect(see(B.shortGrass)).toBe(true);expect(see(B.water)).toBe(true);
    expect(see(B.glass)).toBe(false);expect(see(B.oakLeaves)).toBe(false);expect(see(B.stone)).toBe(false);
  });
  test('isSafe needs a floor, room for the body and no hazard',()=>{
    const h=harness();const ai=h.game.entities.ai;
    h.game.world.set(3,59,0,B.lava);h.game.world.set(5,61,0,B.stone);h.game.world.set(7,59,0,0);h.game.world.set(7,58,0,0);
    h.game.world.set(9,60,0,blockId('fire'));
    expect(ai.isSafe(.5,60,.5)).toBe(true);
    expect(ai.isSafe(3.5,60,.5)).toBe(false);expect(ai.isSafe(5.5,60,.5)).toBe(false);expect(ai.isSafe(5.5,60,.5,.6,.9)).toBe(true);
    expect(ai.isSafe(7.5,60,.5)).toBe(false);expect(ai.isSafe(9.5,60,.5)).toBe(false);
  });
  test('stays within the per-mob AI budget',()=>{
    const goal:[number,number,number]=[20.5,60,20.5];
    const h=harness({kinds:[navigator(()=>goal)],r:3});
    fill(h.game,10,60,-20,10,62,15,B.stone);
    for(let i=0;i<40;i++)h.game.entities.spawn('nav',-10.5+i%10,60,-10.5+Math.floor(i/10)*3);
    h.tick(20);
    const t0=performance.now();h.tick(100);const ms=(performance.now()-t0)/100/40;
    // Generous bound for a shared CI machine: the whole entity tick (physics included) per mob.
    expect(ms).toBeLessThan(.2);
  });
  test('unreachable goals stay within the node budget per tick, read few cells and keep the AI time budget',()=>{
    const goal:[number,number,number]=[10.5,60,.5];
    const h=harness({kinds:[navigator(()=>goal),walker({kind:'wide',width:1.4,height:.9,tick:(e,game)=>{game.entities.ai.navigate(e,goal[0],goal[1],goal[2],2.3);}})],r:3});
    fill(h.game,8,60,-2,12,62,2,B.stone);fill(h.game,9,60,-1,11,61,1,0);// a sealed hut around the goal
    for(let i=0;i<60;i++)h.game.entities.spawn(i%4===3?'wide':'nav',-30.5+(i%12)*2.5,60,-15.5+Math.floor(i/12)*6);
    h.tick(20);
    const world=h.game.world as {get(x:number,y:number,z:number):number},get=world.get.bind(world);let reads=0;
    world.get=(x,y,z)=>{reads++;return get(x,y,z);};
    const debug=()=>(h.game.entities as unknown as {debug:EntityDebug}).debug;
    const ticks=200,n0=debug().nodes;let worst=0;
    const t0=performance.now();
    for(let i=0;i<ticks;i++){const before=debug().nodes;h.tick();worst=Math.max(worst,debug().nodes-before);}
    const ms=(performance.now()-t0)/ticks/60;
    expect((debug().nodes-n0)/ticks).toBeLessThanOrEqual(NODES_PER_TICK);
    expect(worst).toBeLessThan(NODES_PER_TICK+MAX_NODES);
    // Deterministic cost measure: world reads per mob per tick, physics and steering included.
    expect(reads/ticks/60).toBeLessThan(READS_PER_MOB_TICK);
    // Generous bound for a shared machine (the budget is 0.05 ms per mob).
    expect(ms).toBeLessThan(.1);
  });
  test('navigate reports success when the mob already stands at the goal',()=>{
    const h=harness({kinds:[walker()]});const e=h.game.entities.spawn('walker',.5,60,.5)!;h.tick(2);
    expect(h.game.entities.ai.navigate(e,.5,60,.5,2)).toBe(true);
    expect(h.game.entities.ai.navigate(e,.7,60,.7,2)).toBe(true);
  });
  test('non-finite goals and speeds are ignored by every helper',()=>{
    const h=harness({kinds:[walker()]}),ai=h.game.entities.ai,e=h.game.entities.spawn('walker',.5,60,.5)!;h.tick(2);
    const finite=()=>[e.moveX,e.moveZ,e.yaw,e.headYaw,e.pitch].every(Number.isFinite);
    const searches=(h.game.entities as unknown as {debug:EntityDebug}).debug.searches;
    expect(ai.navigate(e,NaN,60,NaN,2)).toBe(false);expect(finite()).toBe(true);
    expect((h.game.entities as unknown as {debug:EntityDebug}).debug.searches).toBe(searches);
    expect(ai.moveToward(e,NaN,60,4,2)).toBe(false);expect(finite()).toBe(true);
    ai.moveToward(e,6.5,60,.5,NaN);expect(finite()).toBe(true);
    ai.navigate(e,6.5,60,.5,Infinity);expect(finite()).toBe(true);
    ai.flee(e,NaN,0,2);expect(finite()).toBe(true);
    ai.lookAt(e,NaN,61,Infinity);expect(finite()).toBe(true);
    ai.wander(e,NaN,1);expect(finite()).toBe(true);
    expect(ai.canSee(e,NaN,61,0)).toBe(false);expect(ai.isSafe(NaN,60,0)).toBe(false);
    h.tick(5);expect(finite()).toBe(true);
  });
});
