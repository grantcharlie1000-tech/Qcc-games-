import {describe,expect,test} from 'vitest';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import {fill,harness,walker} from './entities-helpers';

const SLAB=blockId('stone_slab'),WATER=B.water;

describe('entity physics',()=>{
  test('falls with vanilla gravity and drag, then lands flush on the ground',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,66,.5)!;
    h.tick();
    // First tick: v = (0 - 0.08) × 0.98 blocks/tick.
    expect(e.vy).toBeCloseTo(-.08*.98*20,4);
    h.tick(60);
    expect(e.y).toBeCloseTo(60,5);expect(e.onGround).toBe(true);expect(e.vy).toBeCloseTo(-.08*.98*20,4);
  });
  test('accelerates toward the movement intent and settles at that ground speed',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;
    h.tick(2);e.moveX=2.33;
    h.tick(1);const first=e.x-.5;
    h.tick(40);
    const x0=e.x;h.tick(1);
    expect((e.x-x0)*20).toBeCloseTo(2.33,2);
    expect(first).toBeLessThan(.06);// vanilla acceleration, not instant
    expect(e.yaw).toBeCloseTo(-Math.PI/2,3);// body turns toward the intent
    e.moveX=0;h.tick(10);
    const x1=e.x;h.tick(1);expect(Math.abs(e.x-x1)).toBeLessThan(.01);
  });
  test('steps up a slab without jumping but is blocked by a full block (collidedH)',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;
    fill(h.game,2,60,-2,3,60,2,SLAB);fill(h.game,6,60,-2,6,61,2,B.stone);
    h.tick(2);e.moveX=2;
    h.tick(30);
    expect(e.y).toBeCloseTo(60.5,3);
    h.tick(60);
    expect(e.x).toBeLessThan(6-.3+1e-3);expect(e.collidedH).toBe(true);
  });
  test('a jump clears one block (0.42 blocks/tick)',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',.5,60,.5)!;
    h.tick(2);e.jump=true;h.tick();
    expect(e.y).toBeCloseTo(60.42,4);expect(e.jump).toBe(false);
    let top=0;for(let i=0;i<12;i++){h.tick();top=Math.max(top,e.y);}
    expect(top).toBeGreaterThan(61.2);
  });
  test('ice keeps entities sliding far longer than stone',()=>{
    const slide=(block:number)=>{
      const h=harness({kinds:[walker()],block}),e=h.game.entities.spawn('walker',.5,60,.5)!;
      h.tick(2);e.moveX=3;h.tick(30);e.moveX=0;const x=e.x;h.tick(40);return e.x-x;
    };
    expect(slide(B.ice)).toBeGreaterThan(slide(B.stone)*3);
  });
  test('land mobs sink slowly in water and swim up when jumping; aquatic kinds with no gravity float in place',()=>{
    const h=harness({kinds:[walker(),walker({kind:'fish',category:'water',aquatic:true,width:.8,height:.8,physics:{gravity:0}})]});
    fill(h.game,-8,50,-8,8,59,8,WATER);
    const e=h.game.entities.spawn('walker',.5,55,.5)!,fish=h.game.entities.spawn('fish',4.5,54,4.5)!;
    h.tick(20);
    expect(e.inWater).toBe(true);expect(e.vy).toBeLessThan(0);expect(e.vy).toBeGreaterThan(-1.5);
    expect(Math.abs(fish.y-54)).toBeLessThan(.01);
    for(let i=0;i<60;i++){e.jump=true;h.tick();}
    expect(e.y).toBeGreaterThan(57);
  });
  test('flowing water pushes entities along its flow',()=>{
    const h=harness({kinds:[walker()]});
    // A channel at y 60 whose levels fall toward +x.
    for(let x=0;x<7;x++)fill(h.game,x,60,-1,x,60,1,blockId(`water_${x+1}`));
    const e=h.game.entities.spawn('walker',1.5,60,.5)!;
    h.tick(30);
    expect(e.x).toBeGreaterThan(2);
  });
  test('the entity box collides: a wide mob cannot pass a one-block gap a narrow one walks through',()=>{
    const h=harness({kinds:[walker(),walker({kind:'wide',width:1.4,height:.9})]});
    fill(h.game,-3,60,4,-1,61,4,B.stone);fill(h.game,1,60,4,3,61,4,B.stone);// gap at x = 0
    const narrow=h.game.entities.spawn('walker',.5,60,1.5)!,wide=h.game.entities.spawn('wide',.5,60,1.5)!;
    h.tick(2);narrow.moveZ=3;wide.moveZ=3;
    // Keep them apart so pushing does not interfere.
    wide.x=.5;narrow.x=.5;wide.z=0;narrow.z=2;
    h.tick(40);
    expect(narrow.z).toBeGreaterThan(5);expect(wide.z).toBeLessThan(4-.7+1e-3);
  });
  test('lava sets mobs on fire for 15 s and hurts them; fire immune kinds ignore it',()=>{
    const h=harness({kinds:[walker(),walker({kind:'blaze',fireImmune:true})]});
    fill(h.game,-1,60,-1,1,60,1,B.lava);fill(h.game,4,60,-1,6,60,1,B.lava);
    const e=h.game.entities.spawn('walker',.5,60,.5)!,f=h.game.entities.spawn('blaze',5.5,60,.5)!;
    h.tick();
    expect(e.health).toBe(16);expect(e.fire).toBeGreaterThanOrEqual(299);
    expect(f.health).toBe(20);expect(f.fire).toBe(0);
  });
  test('fall damage is ceil(distance - 3); none with noFallDamage or into water',()=>{
    const h=harness({kinds:[walker(),walker({kind:'chick',noFallDamage:true})]});
    fill(h.game,8,58,-1,10,59,1,WATER);
    const e=h.game.entities.spawn('walker',.5,70,.5)!,c=h.game.entities.spawn('chick',4.5,70,.5)!,s=h.game.entities.spawn('walker',9.5,70,.5)!;
    h.tick(60);
    expect(e.y).toBeCloseTo(60,3);expect(e.health).toBe(20-7);
    expect(c.health).toBe(20);expect(s.health).toBe(20);
  });
  test('entities in unloaded chunks are frozen',()=>{
    const h=harness({kinds:[walker()]}),e=h.game.entities.spawn('walker',200.5,70,.5)!;
    h.tick(20);
    expect(e.y).toBe(70);expect(e.age).toBe(0);
  });
  test('mobs push each other apart and push the player',()=>{
    const h=harness({kinds:[walker()]});
    const a=h.game.entities.spawn('walker',4.45,60,4.5)!,b=h.game.entities.spawn('walker',4.55,60,4.5)!;
    h.tick(20);
    expect(b.x-a.x).toBeGreaterThan(.3);
    const p=h.game.player.state;p.x=.5;p.y=60;p.z=.5;
    const c=h.game.entities.spawn('walker',.7,60,.5)!;
    h.tick(1);
    expect(c.vx).toBeGreaterThan(0);
    expect(h.pushes.some(([x])=>x<0)).toBe(true);
  });
  test('non-finite intents, velocities and positions are reset instead of hanging the tick',()=>{
    const h=harness({kinds:[walker(),walker({kind:'lost',tick:(e,game)=>{game.entities.ai.moveToward(e,NaN,60,NaN,2);}})]});
    const e=h.game.entities.spawn('walker',.5,60,.5)!,lost=h.game.entities.spawn('lost',4.5,60,.5)!;
    h.game.entities.dropItem(stack('stick'),8.5,61,.5);
    const item=h.game.entities.all().find(o=>o.kind==='item')!;
    h.tick(2);
    e.moveX=NaN;e.moveZ=Infinity;h.tick();
    e.vx=NaN;e.vy=Infinity;e.vz=-Infinity;item.vx=NaN;item.vy=-Infinity;h.tick();
    e.vx=1e308;item.vz=1e300;h.tick();
    e.x=NaN;e.yaw=NaN;e.headYaw=Infinity;e.pitch=NaN;h.tick(3);
    for(const o of [e,lost,item])for(const v of [o.x,o.y,o.z,o.vx,o.vy,o.vz,o.moveX,o.moveZ,o.yaw,o.headYaw,o.pitch])expect(Number.isFinite(v)).toBe(true);
    // Clamped to MAX_SPEED (5 blocks a tick) the mob and the item slide a few blocks, staying in the loaded area.
    expect(Math.abs(e.x)).toBeLessThan(32);expect(e.y).toBeGreaterThanOrEqual(60-1e-3);
    expect(Math.abs(item.z)).toBeLessThan(32);
  });
});
