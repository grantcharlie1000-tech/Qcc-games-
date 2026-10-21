// Player movement physics on the DOM-free fake game: vanilla speeds, jumping, sneaking edges, step-up,
// ladders, liquids, ice, flight, effects, fall tracking, sounds, exhaustion and persistence.
import {describe,expect,test} from 'vitest';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {createPlayer,createPlayerState,HALF_WIDTH,HEIGHT} from '../../../src/games/blockcraft/player/player';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {bodyCollides,flowAt} from '../../../src/games/blockcraft/engine/physics';
import {FLY_SPEED,FLY_VERTICAL_SPEED,JUMP_VELOCITY,SNEAK_SPEED,SPRINT_SPEED,WALK_SPEED,effectSpeedFactor,jumpPeak,liquidFlow,vanillaJumpPeak}
  from '../../../src/games/blockcraft/player/controls-physics';
import type {InputAction,PlayerService,StatusEffect} from '../../../src/games/blockcraft/engine/contracts';

const STEP=1/60;
/** Yaw that makes "forward" walk along a world axis (yaw 0 looks north, -z). */
const YAW={north:0,south:Math.PI,east:-Math.PI/2,west:Math.PI/2};

interface Rig{game:FakeGame;player:PlayerService;lands:number[];exhaustion:{total:number};fov:number[];particles:string[]}
function rig(options:{mode?:'survival'|'creative';height?:number;radius?:number;effects?:StatusEffect[];food?:number}={}):Rig{
  const game=createFakeGame({mode:options.mode});game.flat(options.height??60,B.stone,options.radius??3);
  const lands:number[]=[],exhaustion={total:0},fov:number[]=[],particles:string[]=[];
  game.survival.land=d=>{lands.push(d);};
  game.survival.addExhaustion=a=>{exhaustion.total+=a;};
  const effects=options.effects??[];
  game.survival.effects=()=>effects;game.survival.hasEffect=n=>effects.some(e=>e.name===n);
  if(options.food!==undefined)(game.survival as {food:number}).food=options.food;
  game.render.setFovScale=s=>{fov.push(s);};
  game.render.spawnParticles=kind=>{particles.push(kind);};
  const player=createPlayer(game);game.player=player;player.init?.();
  player.teleport(.5,options.height??60,.5);
  return{game,player,lands,exhaustion,fov,particles};
}
/** Simulates `seconds` of frames at 60 fps. */
function run(r:Rig,seconds:number){for(let i=0,n=Math.round(seconds*60);i<n;i++)r.player.frame!(STEP);}
function hold(r:Rig,...actions:InputAction[]){for(const a of actions)r.game.held.add(a);}
function release(r:Rig,...actions:InputAction[]){for(const a of actions)r.game.held.delete(a);}
function tap(r:Rig,action:InputAction){r.game.queued.add(action);}
/** Horizontal speed (blocks/second) measured over `seconds` after `warmup` seconds. */
function speed(r:Rig,warmup:number,seconds:number){
  run(r,warmup);const p=r.player.state,x=p.x,z=p.z;run(r,seconds);return Math.hypot(p.x-x,p.z-z)/seconds;
}
function fill(r:Rig,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)r.game.world.set(x,y,z,id);
}

describe('exports',()=>{
  test('hitbox constants and a fresh state',()=>{
    expect(HALF_WIDTH).toBe(.3);expect(HEIGHT).toBe(1.8);
    const s=createPlayerState(1,2,3);
    expect(s).toMatchObject({x:1,y:2,z:3,vx:0,vy:0,vz:0,flying:false,swimming:false,fallDistance:0,bedSpawn:null,spawn:{x:1,y:2,z:3}});
  });
});

describe('walking speeds (vanilla 4.317 / 5.612 / 1.295 m/s)',()=>{
  test('walks at 4.317 m/s north (yaw 0 looks toward -z)',()=>{
    const r=rig();hold(r,'forward');
    expect(speed(r,1,2)).toBeCloseTo(4.317,1);
    expect(r.player.state.z).toBeLessThan(-5);expect(Math.abs(r.player.state.x-.5)).toBeLessThan(1e-6);
    expect(r.player.state.onGround).toBe(true);expect(r.player.state.y).toBeCloseTo(60,5);
  });
  test('sprints at 5.612 m/s and widens the field of view by 1.15',()=>{
    const r=rig();hold(r,'forward','sprint');
    expect(speed(r,1,2)).toBeCloseTo(5.612,1);
    expect(r.player.state.sprinting).toBe(true);expect(r.fov.at(-1)).toBeCloseTo(1.15,2);
  });
  test('sneaks at 1.295 m/s with a 1.5 high hitbox and 1.27 eye height',()=>{
    const r=rig();hold(r,'forward','sneak');
    expect(speed(r,1,2)).toBeCloseTo(1.295,1);
    expect(r.player.state.sneaking).toBe(true);expect(r.player.height).toBe(1.5);expect(r.player.eyeHeight()).toBeCloseTo(1.27,5);
    release(r,'sneak');run(r,.1);expect(r.player.height).toBe(1.8);expect(r.player.eyeHeight()).toBeCloseTo(1.62,5);
  });
  test('cannot sprint while sneaking, when hungry, or without moving forward',()=>{
    const a=rig();hold(a,'forward','sprint','sneak');run(a,1);expect(a.player.state.sprinting).toBe(false);
    const b=rig({food:6});hold(b,'forward','sprint');run(b,1);expect(b.player.state.sprinting).toBe(false);
    const c=rig();hold(c,'back','sprint');run(c,1);expect(c.player.state.sprinting).toBe(false);
    const d=rig();hold(d,'forward','sprint');run(d,.5);expect(d.player.state.sprinting).toBe(true);release(d,'forward');run(d,.1);expect(d.player.state.sprinting).toBe(false);
  });
  test('walking into a wall stops sprinting',()=>{
    const r=rig();fill(r,-2,60,-8,2,62,-8,B.stone);hold(r,'forward','sprint');run(r,.4);expect(r.player.state.sprinting).toBe(true);
    release(r,'sprint');run(r,2);expect(r.player.state.sprinting).toBe(false);expect(r.player.state.z).toBeGreaterThan(-7+HALF_WIDTH-.01);
  });
  test('diagonal input is normalised to length 1 (vanilla: 4.317/0.98 = 4.405 m/s), strafing works and look() follows yaw and pitch',()=>{
    const r=rig();hold(r,'forward','right');expect(speed(r,1,2)).toBeCloseTo(4.405,1);
    const s=rig();hold(s,'left');expect(speed(s,1,1)).toBeCloseTo(4.317,1);expect(s.player.state.x).toBeLessThan(-3);
    const p=r.player.state;p.yaw=YAW.east;p.pitch=0;const l=r.player.look();expect(l.x).toBeCloseTo(1,5);expect(l.z).toBeCloseTo(0,5);
    p.pitch=Math.PI/2;expect(r.player.look().y).toBeCloseTo(1,5);
  });
  test('Speed I is 20% faster and Slowness I 15% slower',()=>{
    const fast=rig({effects:[{name:'speed',level:1,ticks:600}]});hold(fast,'forward');expect(speed(fast,1,2)).toBeCloseTo(4.317*1.2,1);
    const slow=rig({effects:[{name:'slowness',level:1,ticks:600}]});hold(slow,'forward');expect(speed(slow,1,2)).toBeCloseTo(4.317*.85,1);
    const fov=fast.fov.at(-1)!;expect(fov).toBeGreaterThan(1.05);
  });
});

describe('jumping',()=>{
  test('a jump peaks at about 1.25 blocks and costs 0.05 exhaustion',()=>{
    const r=rig();run(r,.1);hold(r,'jump');let peak=0;
    for(let i=0;i<40;i++){run(r,STEP);if(i===2)release(r,'jump');peak=Math.max(peak,r.player.state.y-60);}
    expect(peak).toBeGreaterThan(1.2);expect(peak).toBeLessThan(1.3);
    expect(r.exhaustion.total).toBeCloseTo(.05,5);
  });
  test('holding jump hops repeatedly; sprint-jumping is faster than sprinting and costs 0.2 per jump',()=>{
    const r=rig({radius:4});hold(r,'forward','sprint','jump');run(r,1);
    const before=r.exhaustion.total;const v=speed(r,0,3);
    // Vanilla sprint-jumping averages 7.13 m/s on flat ground.
    expect(v).toBeGreaterThan(6.95);expect(v).toBeLessThan(7.3);
    const jumps=r.lands.length;expect(jumps).toBeGreaterThan(3);
    // Sprint exhaustion is per metre on the ground only; jumps add 0.2 each.
    expect(r.exhaustion.total-before).toBeGreaterThan(.2*4);
  });
  test('air control is weak but present',()=>{
    const r=rig();run(r,.1);hold(r,'jump');run(r,STEP*3);release(r,'jump');hold(r,'forward');
    const z=r.player.state.z;run(r,.25);expect(r.player.state.onGround).toBe(false);
    const moved=z-r.player.state.z;expect(moved).toBeGreaterThan(.05);expect(moved).toBeLessThan(.8);
  });
  test('cannot jump in mid-air',()=>{
    const r=rig();r.player.teleport(.5,70,.5);hold(r,'jump');run(r,.2);expect(r.player.state.vy).toBeLessThan(0);
  });
});

describe('ground friction',()=>{
  test('ice is slippery: sliding after release is far longer than on stone',()=>{
    const slide=(ice:boolean)=>{
      const r=rig();if(ice)fill(r,-3,59,-40,3,59,3,B.ice);hold(r,'forward');run(r,2);release(r,'forward');
      const z=r.player.state.z;run(r,3);return z-r.player.state.z;
    };
    const stone=slide(false),ice=slide(true);
    expect(stone).toBeLessThan(.5);expect(ice).toBeGreaterThan(stone*5);
  });
});

describe('sneaking edges and step-up',()=>{
  function ledge(){const r=rig({height:50});fill(r,-8,50,-8,1,59,8,B.stone);r.player.teleport(.5,60,.5);r.player.state.yaw=YAW.east;return r;}
  test('sneaking never walks off an edge',()=>{
    const r=ledge();hold(r,'forward','sneak');run(r,4);
    expect(r.player.state.y).toBeCloseTo(60,5);expect(r.player.state.x).toBeLessThanOrEqual(2+HALF_WIDTH+1e-3);expect(r.player.state.x).toBeGreaterThan(1.9);
  });
  test('sneaking backwards and sideways off an edge is blocked too',()=>{
    const r=ledge();r.player.state.yaw=YAW.west;hold(r,'back','sneak');run(r,4);expect(r.player.state.y).toBeCloseTo(60,5);
    const s=ledge();s.player.state.yaw=YAW.north;hold(s,'right','sneak');run(s,4);expect(s.player.state.y).toBeCloseTo(60,5);
  });
  test('without sneaking the player walks off and falls',()=>{
    const r=ledge();hold(r,'forward');run(r,2);expect(r.player.state.y).toBeLessThan(55);
  });
  test('sneaking still steps down onto a slab below (drop under 0.6)',()=>{
    const r=ledge();fill(r,2,50,-8,6,58,8,B.stone);fill(r,2,59,-8,6,59,8,blockId('stone_slab'));hold(r,'forward','sneak');run(r,4);
    expect(r.player.state.x).toBeGreaterThan(3);expect(r.player.state.y).toBeCloseTo(59.5,3);
  });
  test('steps up a slab automatically but not a full block',()=>{
    const r=rig();fill(r,-1,60,-20,1,60,-3,blockId('stone_slab'));hold(r,'forward');run(r,1.5);
    expect(r.player.state.z).toBeLessThan(-3);expect(r.player.state.y).toBeCloseTo(60.5,3);
    const w=rig();fill(w,-1,60,-3,1,60,-3,B.stone);hold(w,'forward');run(w,1.5);
    expect(w.player.state.z).toBeCloseTo(-2+HALF_WIDTH,2);expect(w.player.state.y).toBeCloseTo(60,3);
  });
  test('stays crouched under a 1.5 high ceiling and crawls under a 1 high one',()=>{
    const r=rig();fill(r,-2,61,-2,2,61,2,blockId('stone_slab_top'));r.player.teleport(.5,60,.5);
    hold(r,'sneak');run(r,.2);release(r,'sneak');run(r,.2);
    expect(r.player.height).toBe(1.5);expect(r.player.state.sneaking).toBe(false);
    const c=rig();fill(c,-2,61,-2,2,61,2,B.stone);c.player.teleport(.5,60,.5);run(c,.2);
    expect(c.player.state.swimming).toBe(true);expect(c.player.height).toBeCloseTo(.6,5);expect(c.player.eyeHeight()).toBeCloseTo(.4,5);
    expect(bodyCollides(c.game.world,c.player.state,HALF_WIDTH,c.player.height)).toBe(false);
    hold(c,'forward');run(c,3);expect(c.player.state.z).toBeLessThan(-2.5);expect(c.player.height).toBe(1.8);
  });
});

describe('ladders',()=>{
  function ladder(){
    const r=rig();fill(r,0,60,-3,0,70,-3,B.stone);fill(r,0,60,-2,0,68,-2,blockId('ladder_south'));
    r.player.teleport(.5,60,-1.5);return r;
  }
  test('walking into a ladder climbs at about 2.35 m/s and keeps onLadder current',()=>{
    const r=ladder();hold(r,'forward');run(r,.5);expect(r.player.state.onLadder).toBe(true);
    const y=r.player.state.y;run(r,1);expect(r.player.state.y-y).toBeCloseTo(2.35,1);
  });
  test('jump also climbs, sneaking holds position and releasing slides down at most 3 m/s',()=>{
    const r=ladder();hold(r,'jump');run(r,1.5);expect(r.player.state.y).toBeGreaterThan(62.5);
    // Sneaking catches the climb within a few steps (the upward speed decays first), then holds still.
    release(r,'jump');hold(r,'sneak');run(r,.25);const y=r.player.state.y;run(r,1);expect(r.player.state.y).toBeCloseTo(y,3);
    release(r,'sneak');const y2=r.player.state.y;run(r,.5);expect(y2-r.player.state.y).toBeGreaterThan(.5);expect(y2-r.player.state.y).toBeLessThanOrEqual(1.55);
    expect(r.player.state.fallDistance).toBe(0);
  });
});

describe('liquids',()=>{
  function pool(depth=5){const r=rig();fill(r,-6,60-depth,-6,6,59,6,B.water);r.player.teleport(.5,60-depth+1,.5);return r;}
  test('in water: inWater and headInWater, slow sinking, jump swims up to the surface',()=>{
    const r=pool();run(r,.5);const p=r.player.state;
    expect(p.inWater).toBe(true);expect(p.headInWater).toBe(true);
    const y=p.y;run(r,1);expect(y-p.y).toBeGreaterThan(.2);expect(y-p.y).toBeLessThan(.8);
    hold(r,'jump');run(r,4);expect(p.y).toBeGreaterThan(58.5);expect(p.headInWater).toBe(false);
  });
  test('walking in water is slow (about 2 m/s) and wades out onto a ledge',()=>{
    const r=pool(2);hold(r,'forward');const v=speed(r,1,1);expect(v).toBeGreaterThan(1.5);expect(v).toBeLessThan(2.4);
    hold(r,'jump');run(r,6);expect(r.player.state.y).toBeGreaterThanOrEqual(60);expect(r.player.state.z).toBeLessThan(-6.5);
  });
  test('sprinting underwater swims in the 0.6 high swimming pose and follows the look direction',()=>{
    const r=pool(9);r.player.teleport(.5,57.5,.5);run(r,.3);hold(r,'forward','sprint');r.player.state.pitch=-.5;run(r,.8);
    const p=r.player.state;expect(p.swimming).toBe(true);expect(p.sprinting).toBe(true);
    expect(r.player.height).toBeCloseTo(.6,5);expect(r.player.eyeHeight()).toBeCloseTo(.4,5);
    // Diving at pitch -0.5: about 3 m/s down while swimming forward at up to 3.9 m/s (0.9 kept per tick).
    const y=p.y;const v=speed(r,0,.5);expect(v).toBeGreaterThan(3.1);expect(v).toBeLessThan(4);
    expect(y-p.y).toBeGreaterThan(1);expect(y-p.y).toBeLessThan(2);
    // Looking up near the surface swims up; letting go of sprint stands up again.
    p.pitch=.6;run(r,1.5);expect(p.y).toBeGreaterThan(y);
    release(r,'sprint','forward');run(r,.3);expect(p.swimming).toBe(false);expect(r.player.height).toBe(1.8);
  });
  test('flowing water pushes the player along the flow',()=>{
    const r=rig();for(let i=0;i<7;i++)fill(r,i-3,60,-1,i-3,60,1,blockId(`water_${i+1}`));
    r.player.teleport(.5,60,.5);run(r,1.5);expect(r.player.state.inWater).toBe(true);expect(r.player.state.x).toBeGreaterThan(1);
  });
  test('lava slows movement to a crawl and sets inLava',()=>{
    const r=rig();fill(r,-3,60,-20,3,60,3,B.lava);r.player.teleport(.5,60,.5);hold(r,'forward');
    const v=speed(r,1,2);expect(r.player.state.inLava).toBe(true);expect(v).toBeLessThan(1.2);expect(v).toBeGreaterThan(.3);
  });
  test('entering water plays a splash and swimming strokes play swim sounds',()=>{
    const r=pool();r.player.teleport(.5,64,.5);run(r,1.5);
    expect(r.game.sounds.played.some(s=>s.name==='splash')).toBe(true);expect(r.particles).toContain('splash');
    hold(r,'forward');run(r,3);expect(r.game.sounds.played.some(s=>s.name==='swim')).toBe(true);
  });
  test('swimming costs 0.01 exhaustion per metre',()=>{
    const r=pool();run(r,.5);hold(r,'forward');const ex=r.exhaustion.total,z=r.player.state.z,y=r.player.state.y;run(r,2);
    const d=Math.hypot(r.player.state.z-z,r.player.state.y-y);expect(r.exhaustion.total-ex).toBeCloseTo(.01*d,2);
  });
});

describe('creative flight',()=>{
  function flyer(){const r=rig({mode:'creative',radius:8});run(r,.1);tap(r,'jump');hold(r,'jump');run(r,3*STEP);release(r,'jump');run(r,3*STEP);tap(r,'jump');run(r,STEP);return r;}
  test('double-tapping jump toggles flight; survival players cannot fly',()=>{
    const r=flyer();expect(r.player.state.flying).toBe(true);
    const y=r.player.state.y;run(r,1);expect(r.player.state.y).toBeGreaterThan(60.5);expect(Math.abs(r.player.state.y-y)).toBeLessThan(1.2);
    const hover=r.player.state.y;run(r,1);expect(r.player.state.y).toBeCloseTo(hover,2);
    const s=rig();run(s,.1);tap(s,'jump');run(s,3*STEP);tap(s,'jump');run(s,STEP);expect(s.player.state.flying).toBe(false);
  });
  test('flies at 10.9 m/s, sprint-flies twice as fast and rises at 7.5 m/s',()=>{
    // Flight accelerates slowly (0.91 kept per tick), like vanilla.
    const r=flyer();hold(r,'forward');expect(speed(r,3,1)).toBeCloseTo(10.89,0);
    hold(r,'sprint');expect(speed(r,3,.5)).toBeCloseTo(21.78,0);expect(r.fov.at(-1)).toBeCloseTo(1.1*1.15,2);
    release(r,'forward','sprint');hold(r,'jump');run(r,1);const y=r.player.state.y;run(r,1);expect(r.player.state.y-y).toBeCloseTo(7.5,0);
  });
  test('sneak descends and touching the ground ends flight; flight resets fall distance',()=>{
    const r=flyer();hold(r,'jump');run(r,1);release(r,'jump');expect(r.player.state.fallDistance).toBe(0);
    hold(r,'sneak');run(r,2);expect(r.player.state.onGround).toBe(true);expect(r.player.state.flying).toBe(false);
    expect(r.lands.every(d=>d<.5)).toBe(true);
  });
  test('push() is ignored while flying',()=>{
    const r=flyer();r.player.push(10,10,0);run(r,STEP);expect(Math.abs(r.player.state.vx)).toBeLessThan(.1);
  });
});

describe('falling, landing and safety',()=>{
  test('reports fall distance and calls survival.land on landing',()=>{
    const r=rig();r.player.teleport(.5,70,.5);run(r,.5);expect(r.player.state.fallDistance).toBeGreaterThan(2);
    run(r,2);expect(r.player.state.onGround).toBe(true);expect(r.lands.length).toBe(1);expect(r.lands[0]).toBeCloseTo(10,1);
    expect(r.player.state.fallDistance).toBe(0);
    expect(r.game.sounds.played.some(s=>s.name==='fall:stone')).toBe(true);
  });
  test('landing in water negates fall damage',()=>{
    const r=rig();fill(r,-3,57,-3,3,59,3,B.water);r.player.teleport(.5,80,.5);run(r,4);
    expect(r.player.state.inWater).toBe(true);expect(Math.max(0,...r.lands)).toBeLessThan(1);
  });
  test('teleport zeroes velocity and fall distance; push adds an impulse',()=>{
    const r=rig();r.player.teleport(.5,80,.5);run(r,.5);r.player.teleport(3.5,61,2.5);
    const p=r.player.state;expect([p.x,p.y,p.z,p.vx,p.vy,p.vz,p.fallDistance]).toEqual([3.5,61,2.5,0,0,0,0]);
    expect(r.player.eye()).toEqual({x:3.5,y:61+1.62,z:2.5});
    r.player.teleport(.5,60,.5);run(r,.1);r.player.push(8,4,0);run(r,STEP);expect(p.vx).toBeGreaterThan(4);expect(p.vy).toBeGreaterThan(0);
  });
  test('never falls into or walks into unloaded chunks',()=>{
    const r=rig({radius:1});r.player.teleport(40.5,70,.5);run(r,1);expect(r.player.state.y).toBe(70);
    r.player.teleport(30.5,60,.5);r.player.state.yaw=YAW.east;hold(r,'forward');run(r,2);
    expect(r.player.state.x).toBeLessThanOrEqual(32-HALF_WIDTH+1e-3);expect(r.player.state.y).toBeCloseTo(60,5);
  });
  test('a player stuck inside blocks is pushed out to free space',()=>{
    const r=rig();run(r,.1);fill(r,0,60,0,0,61,0,B.stone);run(r,2);
    expect(bodyCollides(r.game.world,r.player.state,HALF_WIDTH,r.player.height)).toBe(false);
  });
  test('falling into the void below y -64 deals void damage each tick',()=>{
    const r=rig();const hits:string[]=[];r.game.survival.damage=(a,s)=>{hits.push(`${s.kind}:${a}`);return a;};
    r.player.teleport(.5,-70,.5);r.player.tick!();expect(hits).toEqual(['void:4']);
  });
});

describe('sounds and exhaustion',()=>{
  test('footsteps every ~1.7 blocks walked (sneaking too, at its slower pace); none while standing still',()=>{
    const r=rig();hold(r,'forward');run(r,3);
    const steps=r.game.sounds.played.filter(s=>s.name==='step:stone').length;
    const walked=4.317*3;expect(steps).toBeGreaterThanOrEqual(Math.floor(walked/1.667)-1);expect(steps).toBeLessThanOrEqual(Math.ceil(walked/1.667)+1);
    const s=rig();hold(s,'forward','sneak');run(s,6);
    const sneakSteps=s.game.sounds.played.filter(x=>x.name==='step:stone').length;
    expect(sneakSteps).toBeGreaterThanOrEqual(Math.floor(1.295*6/1.667)-1);expect(sneakSteps).toBeLessThanOrEqual(Math.ceil(1.295*6/1.667)+1);
    const still=rig();run(still,3);expect(still.game.sounds.played.length).toBe(0);
  });
  test('footsteps use the sound of the block underfoot',()=>{
    const r=rig();fill(r,-3,59,-30,3,59,3,B.grass);hold(r,'forward');run(r,2);
    expect(r.game.sounds.played.some(s=>s.name==='step:grass')).toBe(true);
  });
  test('sprinting costs 0.1 exhaustion per metre; walking costs nothing',()=>{
    const r=rig();hold(r,'forward');run(r,2);expect(r.exhaustion.total).toBe(0);
    hold(r,'sprint');run(r,.5);const ex=r.exhaustion.total,z=r.player.state.z;run(r,2);
    expect(r.exhaustion.total-ex).toBeCloseTo(.1*(z-r.player.state.z),2);
  });
});

describe('persistence',()=>{
  test('round-trips position, look, flight and spawn points',()=>{
    const r=rig({mode:'creative'});const p=r.player.state;
    r.player.teleport(4.5,61,-3.5);p.yaw=1.2;p.pitch=-.4;p.flying=true;p.spawn={x:1,y:62,z:2};p.bedSpawn={x:5,y:60,z:6};
    const data=JSON.parse(JSON.stringify(r.player.serialize!()));
    const q=rig({mode:'creative'});q.player.reset!();q.player.restore!(data);
    expect(q.player.state).toMatchObject({x:4.5,y:61,z:-3.5,yaw:1.2,pitch:-.4,flying:true,spawn:{x:1,y:62,z:2},bedSpawn:{x:5,y:60,z:6}});
  });
  test('ignores invalid data without throwing',()=>{
    const r=rig();const before={...r.player.state};
    for(const bad of [null,7,'x',[],{x:'a',y:1,z:2},{x:NaN,y:1,z:1},{x:1e9,y:60,z:0},{pitch:99,yaw:Infinity,spawn:{x:'1'},bedSpawn:5}]){
      expect(()=>r.player.restore!(bad)).not.toThrow();
    }
    expect(r.player.state.x).toBe(before.x);expect(Math.abs(r.player.state.pitch)).toBeLessThanOrEqual(1.55);
    expect(Number.isFinite(r.player.state.yaw)).toBe(true);expect(r.player.state.spawn).toEqual(before.spawn);
  });
  test('rotate clamps pitch and reset restores a fresh state',()=>{
    const r=rig();r.player.rotate(.5,5);expect(r.player.state.pitch).toBe(1.55);r.player.rotate(0,-10);expect(r.player.state.pitch).toBe(-1.55);
    r.player.reset!();expect(r.player.state.vx).toBe(0);expect(r.player.state.flying).toBe(false);
  });
});

describe('vanilla details',()=>{
  function pool(depth=9){const r=rig();fill(r,-6,60-depth,-6,6,59,6,B.water);r.player.teleport(.5,57,.5);return r;}
  test('sneaking in water dives (an extra 0.04 per tick) instead of sinking slowly',()=>{
    const sink=pool();run(sink,1);const y=sink.player.state.y;run(sink,1);const slow=y-sink.player.state.y;
    const dive=pool();run(dive,1);hold(dive,'sneak');const y2=dive.player.state.y;run(dive,1);const fast=y2-dive.player.state.y;
    expect(slow).toBeLessThan(.6);expect(fast).toBeGreaterThan(slow*3);
  });
  test('using an item (eating, drawing a bow) slows walking to a fifth and stops sprinting',()=>{
    const r=rig();hold(r,'forward','sprint');run(r,1);expect(r.player.state.sprinting).toBe(true);
    (r.game.interaction as {using:unknown}).using={item:'bread',progress:.3};
    expect(speed(r,1,2)).toBeCloseTo(4.317*.2,1);expect(r.player.state.sprinting).toBe(false);
  });
  test('drawing a bow narrows the field of view; reduced motion keeps it at 1',()=>{
    const r=rig();(r.game.interaction as {using:unknown}).using={item:'bow',progress:1};run(r,.1);expect(r.fov.at(-1)).toBeCloseTo(.85,5);
    const m=rig();(m.game as {reducedMotion:boolean}).reducedMotion=true;hold(m,'forward','sprint');run(m,1);
    expect(m.player.state.sprinting).toBe(true);expect(m.fov.at(-1)).toBe(1);
  });
  test('a second jump press later than 7 ticks does not toggle flight',()=>{
    const r=rig({mode:'creative'});run(r,.1);tap(r,'jump');run(r,STEP);run(r,.5);tap(r,'jump');run(r,STEP);
    expect(r.player.state.flying).toBe(false);
  });
  test('small falls are silent; creative falls make no fall sound',()=>{
    const r=rig();r.player.teleport(.5,62.5,.5);run(r,1.5);expect(r.lands.length).toBe(1);expect(r.lands[0]).toBeCloseTo(2.5,2);
    expect(r.game.sounds.played.some(s=>s.name.startsWith('fall:'))).toBe(false);
    const c=rig({mode:'creative'});c.player.teleport(.5,70,.5);run(c,2);expect(c.game.sounds.played.some(s=>s.name.startsWith('fall:'))).toBe(false);
    const big=rig();big.player.teleport(.5,66,.5);run(big,2);expect(big.particles).toContain('block');
  });
  test('climbing a ladder plays its wood steps and walking through snow plays snow',()=>{
    const r=rig();fill(r,0,60,-3,0,70,-3,B.stone);fill(r,0,60,-2,0,68,-2,blockId('ladder_south'));r.player.teleport(.5,60,-1.5);
    hold(r,'forward');run(r,3);expect(r.game.sounds.played.some(s=>s.name==='step:wood')).toBe(true);
    const s=rig();fill(s,-2,60,-20,2,60,2,B.snow);hold(s,'forward');run(s,2);expect(s.game.sounds.played.some(x=>x.name==='step:snow')).toBe(true);
  });
  test('the camera eye is interpolated between physics steps and eases into the crouch',()=>{
    const r=rig();hold(r,'forward');run(r,1);const p=r.player.state;
    r.player.frame!(STEP/2);const e=r.player.eye();expect(e.z).toBeGreaterThan(p.z);expect(e.z-p.z).toBeLessThan(.08);
    hold(r,'sneak');run(r,STEP);expect(r.player.eyeHeight()).toBeCloseTo(1.27,5);
    expect(r.player.eye().y-p.y).toBeGreaterThan(1.27);run(r,.5);expect(r.player.eye().y-p.y).toBeCloseTo(1.27,2);
  });
  test('nothing moves while the engine is not running (dead, paused); the world keeps running behind screens',()=>{
    const r=rig();r.player.teleport(.5,70,.5);r.game.setState('dead');run(r,1);expect(r.player.state.y).toBe(70);
    r.game.setState('screen');run(r,1);expect(r.player.state.y).toBeLessThan(70);
  });
  test('the allocation-free liquid flow matches the engine rule',()=>{
    const r=rig();for(let i=0;i<7;i++)fill(r,i-3,60,-1,i-3,60,1,blockId(`water_${i+1}`));fill(r,4,59,0,4,59,0,0);
    for(let x=-3;x<=4;x++)for(const z of [-1,0,1]){
      const a=liquidFlow(r.game.world,x,60,z,{x:0,y:0,z:0}),b=flowAt(r.game.world,x,60,z);
      expect(a.x).toBeCloseTo(b.x,9);expect(a.z).toBeCloseTo(b.z,9);
    }
  });
  test('vanilla constants: walking 4.317, sprinting 5.612, sneaking 1.295, flying 10.89 and 7.5 up, jumps 1.2522 high',()=>{
    expect(WALK_SPEED).toBeCloseTo(4.317,3);expect(SPRINT_SPEED).toBeCloseTo(5.612,3);expect(SNEAK_SPEED).toBeCloseTo(1.295,3);
    expect(FLY_SPEED).toBeCloseTo(10.889,3);expect(FLY_VERTICAL_SPEED).toBeCloseTo(7.5,9);expect(jumpPeak(JUMP_VELOCITY)).toBeCloseTo(vanillaJumpPeak(),6);
    expect(vanillaJumpPeak()).toBeCloseTo(1.2522,4);expect(effectSpeedFactor(2,1)).toBeCloseTo(1.4*.85,9);
  });
});
