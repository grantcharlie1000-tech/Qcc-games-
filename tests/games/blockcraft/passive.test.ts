// Passive mobs (entity/passive*.ts): kinds, AI decisions, breeding, shearing and regrowth, milking, eggs, rabbits,
// drops and model sanity. The kinds run against the DOM-free fake game with a minimal entity service (spawn, near,
// drop recording) and a recording AI, so the tests exercise the kinds' own logic, not the entity framework.
import {describe,expect,test} from 'vitest';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {B,blockId,blockDef,isLava,isWater,stateFor,WOOL_COLOURS} from '../../../src/games/blockcraft/data/blocks';
import {moveBody} from '../../../src/games/blockcraft/engine/physics';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {stack} from '../../../src/games/blockcraft/data/items';
import {registerPassiveMobs,PASSIVE_SPEEDS,randomWoolColour,mixWoolColours,rabbitVariantFor,RABBIT_VARIANTS} from '../../../src/games/blockcraft/entity/passive';
import {dangerAhead,standable,brainOf} from '../../../src/games/blockcraft/entity/passive-ai';
import {faceRect,FACES} from '../../../src/games/blockcraft/entity/passive-model';
import type {AnimationState,DamageSource,Entity,EntityAI,EntityKind,EntityModel,GameEvents,ItemStack,PartPose,SpawnReason} from '../../../src/games/blockcraft/engine/contracts';

type Call={fn:string;id:number;x:number;y:number;z:number;speed?:number};
interface Harness{
  game:FakeGame;kinds:Map<string,EntityKind>;list:Entity[];drops:{stack:ItemStack;x:number;y:number;z:number}[];xp:number[];calls:Call[];
  particles:{kind:string;x:number;y:number;z:number}[];bred:GameEvents['animalBred'][];
  spawn(kind:string,x?:number,y?:number,z?:number,options?:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason}):Entity;
  hold(item:ItemStack|null):void;
  kind(name:string):EntityKind;
}

function setup(options:{biome?:string;random?:()=>number;mode?:'survival'|'creative';seed?:number}={}):Harness{
  const game=createFakeGame({seed:options.seed??11,random:options.random,mode:options.mode});
  game.flat(60,B.grass,1);
  if(options.biome)for(const chunk of game.world.chunks.values())chunk.biomes.fill(biomeId(options.biome));
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[],drops:Harness['drops']=[],xp:number[]=[],calls:Call[]=[],particles:Harness['particles']=[];
  const bred:GameEvents['animalBred'][]=[];
  game.events.on('animalBred',e=>bred.push(e));
  let nextId=1;
  const ai:EntityAI={
    wander(e,speed){calls.push({fn:'wander',id:e.id,x:e.x,y:e.y,z:e.z,speed});},
    lookAt(e,x,y,z){calls.push({fn:'lookAt',id:e.id,x,y,z});e.headYaw=Math.atan2(-(x-e.x),-(z-e.z));},
    moveToward(e,x,y,z,speed){calls.push({fn:'moveToward',id:e.id,x,y,z,speed});const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
      if(d<.5){e.moveX=e.moveZ=0;return true;}e.moveX=dx/d*speed;e.moveZ=dz/d*speed;return false;},
    navigate(e,x,y,z,speed){calls.push({fn:'navigate',id:e.id,x,y,z,speed});const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz)||1;e.moveX=dx/d*speed;e.moveZ=dz/d*speed;return true;},
    flee(e,fx,fz,speed){calls.push({fn:'flee',id:e.id,x:fx,y:e.y,z:fz,speed});const dx=e.x-fx,dz=e.z-fz,d=Math.hypot(dx,dz)||1;e.moveX=dx/d*speed;e.moveZ=dz/d*speed;},
    canSee:()=>true,isSafe:()=>true,stop(e){e.moveX=e.moveZ=0;}
  };
  game.render.spawnParticles=(kind,x,y,z)=>{particles.push({kind,x,y,z});};
  game.entities={...game.entities,ai,
    register:k=>{kinds.set(k.kind,k);},kinds:()=>[...kinds.values()],kind:n=>kinds.get(n),
    spawn(kind,x,y,z,o={}){
      const k=kinds.get(kind);if(!k)return null;const reason=o.reason??'event';
      const e:Entity={id:nextId++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw:o.yaw??0,pitch:0,headYaw:o.yaw??0,moveX:0,moveZ:0,jump:false,
        width:k.width,height:k.height,onGround:true,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,
        age:0,hurtTime:0,deathTime:0,removed:false,fire:0,baby:!!o.baby,data:o.data??{}};
      k.init?.(e,game,reason);list.push(e);game.events.emit('entitySpawned',{entity:e,reason});return e;
    },
    remove(e){e.removed=true;},byId:id=>list.find(e=>e.id===id&&!e.removed),all:()=>list,
    near(x,y,z,r,f,out=[]){out.length=0;for(const e of list)if(!e.removed&&Math.hypot(e.x-x,e.y-y,e.z-z)<=r&&(!f||f(e)))out.push(e);return out;},
    dropItem(s,x,y,z){drops.push({stack:{...s},x,y,z});},dropXp(points){xp.push(points);},
    count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){for(const e of list)if(!e.removed&&e.deathTime===0){e.age++;kinds.get(e.kind)?.tick?.(e,game);}}
  };
  registerPassiveMobs(game);
  const h:Harness={game,kinds,list,drops,xp,calls,particles,bred,
    spawn:(kind,x=.5,y=60,z=.5,o)=>{const e=game.entities.spawn(kind,x,y,z,o);if(!e)throw new Error(`no kind ${kind}`);return e;},
    hold(item){game.inventory.setSlot(0,item);},
    kind(name){const k=kinds.get(name);if(!k)throw new Error(`no kind ${name}`);return k;}};
  // The fake inventory does not consume: make consumeHeld/damageHeld behave like the real one so the tests can see it.
  let damaged=0;
  game.inventory.consumeHeld=(n=1)=>{if(game.settings.mode==='creative')return;const s=game.inventory.slots[0];if(!s)return;game.inventory.setSlot(0,s.count>n?{...s,count:s.count-n}:null);};
  game.inventory.damageHeld=(n=1)=>{damaged+=n;};
  Object.defineProperty(h,'damaged',{get:()=>damaged});
  return h;
}
const tick=(h:Harness,n=1)=>h.game.runTicks(n,[h.game.entities]);
const navigations=(h:Harness,e:Entity)=>h.calls.filter(c=>c.id===e.id&&(c.fn==='navigate'||c.fn==='moveToward'));
const hurt=(h:Harness,e:Entity,source:DamageSource={kind:'player',byPlayer:true})=>h.kind(e.kind).hurt?.(e,h.game,source,1);
/** Sequence random: replays the given values (then 0.5). */
const sequence=(...values:number[])=>{let i=0;return()=>i<values.length?values[i++]:.5;};

describe('passive kinds',()=>{
  test('register cow, pig, sheep, chicken and rabbit with vanilla sizes, health, sounds and spawn settings',()=>{
    const h=setup();
    const expected:Record<string,[number,number,number]>={cow:[.9,1.4,10],pig:[.9,.9,10],sheep:[.9,1.3,8],chicken:[.4,.7,4],rabbit:[.4,.5,3]};
    for(const [name,[w,ht,hp]] of Object.entries(expected)){
      const k=h.kind(name);
      expect([k.width,k.height,k.maxHealth]).toEqual([w,ht,hp]);
      expect(k.category).toBe('passive');expect(k.model).toBeDefined();
      expect(k.sounds?.name).toBe(name);expect(k.sounds?.ambient).toBe(true);
      expect(k.spawn?.light).toBe('grass');
      const [min,max]=k.spawn!.group;expect(min).toBeGreaterThanOrEqual(1);expect(max).toBeGreaterThanOrEqual(min);
    }
    expect(h.kind('chicken').noFallDamage).toBe(true);
    expect(h.kind('rabbit').spawn?.group).toEqual([2,3]);
  });
  test('babies have half-size hitboxes and grow up after 20 minutes',()=>{
    const h=setup(),calf=h.spawn('cow',.5,60,.5,{baby:true,reason:'breed'});
    expect(calf.baby).toBe(true);expect(calf.width).toBeCloseTo(.45);expect(calf.height).toBeCloseTo(.7);
    tick(h,23999);expect(calf.baby).toBe(true);
    tick(h,1);expect(calf.baby).toBe(false);expect(calf.width).toBeCloseTo(.9);expect(calf.height).toBeCloseTo(1.4);
  });
  test('restoreData keeps valid fields and drops invalid ones',()=>{
    const h=setup();
    const sheep=h.kind('sheep').restoreData!({color:'pink',sheared:true,growth:-100,love:20,junk:{a:1}})!;
    expect(sheep).toMatchObject({color:'pink',sheared:true,growth:-100,love:20});expect(sheep.junk).toBeUndefined();
    const bad=h.kind('sheep').restoreData!({color:'plaid',sheared:'yes',growth:1e9,love:-5})!;
    expect(bad.color).toBeUndefined();expect(bad.sheared).toBeUndefined();expect(bad.growth).toBeUndefined();expect(bad.love).toBeUndefined();
    expect(h.kind('cow').restoreData!({variant:'mooshroom'})!.variant).toBe('mooshroom');
    expect(h.kind('cow').restoreData!({variant:'unicorn'})!.variant).toBeUndefined();
    expect(h.kind('rabbit').restoreData!({variant:'gold',carrotTicks:12})).toMatchObject({variant:'gold',carrotTicks:12});
    expect(h.kind('chicken').restoreData!({eggTime:300})!.eggTime).toBe(300);
    expect(h.kind('chicken').restoreData!({eggTime:-3})!.eggTime).toBeUndefined();
    // A restored entity keeps its data through init.
    const e=h.spawn('sheep',.5,60,.5,{data:{color:'black',sheared:true,growth:0,love:0},reason:'restore'});
    expect(e.data.color).toBe('black');expect(e.data.sheared).toBe(true);
  });
});

describe('AI decisions',()=>{
  test('an idle animal strolls to a standable spot at walking speed',()=>{
    const h=setup(),cow=h.spawn('cow',.5,60,.5);
    tick(h,600);
    const nav=navigations(h,cow);
    expect(nav.length).toBeGreaterThan(0);
    expect(nav[0].speed).toBeCloseTo(PASSIVE_SPEEDS.cow.walk);
    const t=nav[0];expect(standable(h.game.world,Math.floor(t.x),Math.floor(t.y),Math.floor(t.z),1.4)).toBe(true);
    expect(Math.hypot(t.x-.5,t.z-.5)).toBeLessThanOrEqual(15);
  });
  test('hurt animals panic at their panic speed for about 5 seconds, then calm down',()=>{
    const h=setup(),pig=h.spawn('pig',.5,60,.5);
    hurt(h,pig);tick(h,1);
    expect(navigations(h,pig).at(-1)?.speed).toBeCloseTo(PASSIVE_SPEEDS.pig.panic);
    tick(h,98);expect(navigations(h,pig).at(-1)?.speed).toBeCloseTo(PASSIVE_SPEEDS.pig.panic);
    h.calls.length=0;tick(h,40);
    expect(navigations(h,pig).every(c=>c.speed!==PASSIVE_SPEEDS.pig.panic)).toBe(true);
    expect(PASSIVE_SPEEDS.cow.panic).toBeGreaterThan(PASSIVE_SPEEDS.cow.walk*3);
  });
  test('burning animals panic too',()=>{
    const h=setup(),sheep=h.spawn('sheep',.5,60,.5);sheep.fire=60;tick(h,1);
    expect(navigations(h,sheep).at(-1)?.speed).toBeCloseTo(PASSIVE_SPEEDS.sheep.panic);
  });
  test('animals follow a player within 10 blocks holding their food and stop close by',()=>{
    for(const [kind,food] of [['cow','wheat'],['sheep','wheat'],['pig','carrot'],['pig','potato'],['chicken','wheat_seeds'],['rabbit','dandelion']] as const){
      const h=setup(),e=h.spawn(kind,6.5,60,.5),p=h.game.player.state;p.x=.5;p.y=60;p.z=.5;
      h.hold(stack(food));tick(h,1);
      const last=navigations(h,e).at(-1);
      expect(last,`${kind} follows ${food}`).toBeDefined();
      expect(last!.speed).toBeCloseTo(PASSIVE_SPEEDS[kind].tempt);expect(last!.x).toBeCloseTo(p.x);expect(last!.z).toBeCloseTo(p.z);
      expect(h.calls.some(c=>c.fn==='lookAt'&&c.id===e.id)).toBe(true);
      // Within 2.5 blocks it stands and watches.
      e.x=2.2;h.calls.length=0;tick(h,1);expect(e.moveX).toBe(0);expect(e.moveZ).toBe(0);
    }
  });
  test('animals ignore the player without food, far away or holding something else',()=>{
    const h=setup(),cow=h.spawn('cow',6.5,60,.5),p=h.game.player.state;p.x=.5;p.y=60;p.z=.5;
    h.hold(stack('carrot'));tick(h,1);
    expect(navigations(h,cow).some(c=>c.speed===PASSIVE_SPEEDS.cow.tempt)).toBe(false);
    h.hold(stack('wheat'));p.x=30;tick(h,1);
    expect(navigations(h,cow).some(c=>c.speed===PASSIVE_SPEEDS.cow.tempt)).toBe(false);
  });
  test('rabbits flee survival players within 8 blocks, not creative ones, and follow carrots instead',()=>{
    const h=setup(),rabbit=h.spawn('rabbit',4.5,60,.5),p=h.game.player.state;p.x=.5;p.y=60;p.z=.5;
    tick(h,1);expect(h.calls.some(c=>c.fn==='flee'&&c.id===rabbit.id)).toBe(true);
    const c=setup({mode:'creative'}),r2=c.spawn('rabbit',4.5,60,.5);c.game.player.state.x=.5;
    tick(c,1);expect(c.calls.some(x=>x.fn==='flee'&&x.id===r2.id)).toBe(false);
    h.calls.length=0;h.hold(stack('carrot'));tick(h,1);
    expect(h.calls.some(x=>x.fn==='flee')).toBe(false);
    expect(navigations(h,rabbit).at(-1)?.speed).toBeCloseTo(PASSIVE_SPEEDS.rabbit.tempt);
  });
  test('animals swim: they jump while in water',()=>{
    const h=setup(),cow=h.spawn('cow');cow.inWater=true;cow.onGround=false;
    let jumps=0;for(let i=0;i<50;i++){cow.jump=false;tick(h,1);if(cow.jump)jumps++;}
    expect(jumps).toBeGreaterThan(25);
  });
  test('cliffs, lava and cacti ahead are dangerous; a short step down is not',()=>{
    const h=setup(),w=h.game.world;
    expect(dangerAhead(w,.5,60,.5,1,0,.45)).toBe(false);
    for(let y=50;y<60;y++)w.set(2,y,0,0);// a 10-deep hole east of the mob
    expect(dangerAhead(w,1.5,60,.5,1,0,.45)).toBe(true);
    w.set(0,59,3,0);w.set(0,58,3,0);// a 2-block step down south
    expect(dangerAhead(w,.5,60,2.5,0,1,.45)).toBe(false);
    w.set(-2,59,0,B.lava);expect(dangerAhead(w,-1.5,60,.5,-1,0,.45)).toBe(true);
    w.set(0,60,-2,blockId('cactus'));expect(dangerAhead(w,.5,60,-1.5,0,-1,.45)).toBe(true);
  });
  test('animals walking into a cliff stop instead of falling',()=>{
    const h=setup(),cow=h.spawn('cow',1.3,60,.5);
    for(let y=40;y<60;y++)for(let z=-1;z<=1;z++)w(h).set(2,y,z,0);
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};// drives east
    hurt(h,cow);tick(h,1);
    expect(cow.moveX).toBe(0);
  });
  test('babies follow an adult of their kind',()=>{
    const h=setup(),mother=h.spawn('sheep',6.5,60,.5),lamb=h.spawn('sheep',.5,60,.5,{baby:true,reason:'breed'});
    tick(h,20);
    const nav=navigations(h,lamb).filter(c=>c.speed===PASSIVE_SPEEDS.sheep.follow);
    expect(nav.length).toBeGreaterThan(0);expect(nav.at(-1)!.x).toBeCloseTo(mother.x);
  });
});
const w=(h:Harness)=>h.game.world;

/** Simple entity physics for simulations: accelerate toward the move intent, jump, gravity, voxel collision with step-up. */
function physics(h:Harness){
  const world=h.game.world;
  for(const e of h.list){
    if(e.removed)continue;
    const id=world.get(Math.floor(e.x),Math.floor(e.y+.1),Math.floor(e.z));
    e.inWater=isWater(id);e.inLava=isLava(id);
    if(e.moveX||e.moveZ){e.vx+=(e.moveX-e.vx)*.5;e.vz+=(e.moveZ-e.vz)*.5;}
    if(e.jump&&(e.onGround||e.inWater))e.vy=8.4;
    e.jump=false;e.vy=Math.max(-40,e.vy-1.6);
    const r=moveBody(world,e,e.width/2,e.height,1/20,undefined,.6);
    e.collidedH=r.hitX||r.hitZ;e.collidedV=r.hitY;
    if(e.onGround&&!e.moveX&&!e.moveZ){e.vx*=.6;e.vz*=.6;}
  }
}
describe('simulation',()=>{
  // Seed 19 once let a rabbit swerve mid-hop into the lava.
  test.each([11,19])('a herd on a plateau ringed by a 10-deep pit, with a lava pool, never falls or walks into lava, within the AI budget (seed %i)',seed=>{
    const h=setup({seed}),world=w(h),cheb=(x:number,z:number)=>Math.max(Math.abs(x-8),Math.abs(z-8));
    // Plateau of grass at y 60 within 6 of (8, 8); a pit ring (air from y 50) from 7 to 12; grass again beyond.
    for(let x=-4;x<=20;x++)for(let z=-4;z<=20;z++)if(cheb(x,z)>=7)for(let y=50;y<60;y++)world.set(x,y,z,0);
    for(const [x,z] of [[5,10],[6,10],[5,11],[6,11]])world.set(x,59,z,B.lava);
    const kinds=['cow','cow','cow','pig','pig','pig','sheep','sheep','sheep','chicken','chicken','chicken','rabbit','rabbit'];
    const herd=kinds.map((k,i)=>h.spawn(k,3.5+(i%5)*2.4,60,3.5+[0,3,10][Math.floor(i/5)]));
    for(const e of herd)expect(world.get(Math.floor(e.x),59,Math.floor(e.z))).toBe(B.grass);
    const kindOf=new Map(herd.map(e=>[e,h.kind(e.kind)]));
    let aiTime=0,aiTicks=0,moved=0;
    const start=new Map(herd.map(e=>[e,[e.x,e.z]]));
    for(let t=0;t<3000;t++){
      if(t%300===0)for(const e of herd)hurt(h,e);
      h.game.time.tick++;
      const t0=performance.now();
      for(const e of h.list)if(!e.removed&&e.deathTime===0){e.age++;kindOf.get(e)?.tick?.(e,h.game);aiTicks++;}
      aiTime+=performance.now()-t0;
      physics(h);
      for(const e of herd){
        expect(e.y,`${e.kind} ${e.id} fell at tick ${t}`).toBeGreaterThan(59.5);
        expect(isLava(world.get(Math.floor(e.x),Math.floor(e.y+.1),Math.floor(e.z))),`${e.kind} ${e.id} in lava at tick ${t}`).toBe(false);
      }
    }
    for(const e of herd){const [x,z]=start.get(e)!;if(Math.hypot(e.x-x,e.z-z)>1)moved++;}
    expect(moved).toBeGreaterThan(herd.length/2);
    // Budget: 0.05 ms per mob per tick (generous here: this includes the test harness' entity queries).
    expect(aiTime/aiTicks).toBeLessThan(.05);
  });
});

describe('breeding',()=>{
  test('feeding enters love mode with hearts; two lovers breed a baby, then cool down for 5 minutes',()=>{
    const h=setup(),a=h.spawn('cow',.5,60,.5),b=h.spawn('cow',2,60,.5),cow=h.kind('cow');
    h.hold(stack('wheat',3));
    expect(cow.interact!(a,h.game,h.game.inventory.held())).toBe(true);
    expect(h.game.inventory.held()?.count).toBe(2);
    expect(a.data.love).toBe(600);expect(h.particles.some(p=>p.kind==='heart')).toBe(true);
    // Already in love: no second wheat is used.
    expect(cow.interact!(a,h.game,h.game.inventory.held())).toBe(false);
    expect(cow.interact!(b,h.game,h.game.inventory.held())).toBe(true);
    tick(h,59);expect(h.bred).toHaveLength(0);
    // Three seconds (60 ticks) of courting next to each other, then the calf.
    tick(h,1);
    expect(h.bred).toHaveLength(1);expect(h.bred[0].kind).toBe('cow');
    const babies=h.list.filter(e=>e.baby);expect(babies).toHaveLength(1);
    expect(babies[0].data.growth).toBeGreaterThanOrEqual(-24000);expect(babies[0].data.growth).toBeLessThanOrEqual(-23999);
    for(const parent of [a,b]){expect(parent.data.growth).toBeGreaterThanOrEqual(5999);expect(parent.data.growth).toBeLessThanOrEqual(6000);}expect(a.data.love).toBe(0);expect(b.data.love).toBe(0);
    expect(h.xp).toHaveLength(1);expect(h.xp[0]).toBeGreaterThanOrEqual(1);expect(h.xp[0]).toBeLessThanOrEqual(7);
    // Cooldown: food is refused (and not consumed).
    h.hold(stack('wheat'));expect(cow.interact!(a,h.game,h.game.inventory.held())).toBe(false);expect(h.game.inventory.held()?.count).toBe(1);
    tick(h,6000);expect(a.data.growth).toBe(0);expect(cow.interact!(a,h.game,h.game.inventory.held())).toBe(true);
  });
  test('lovers too far apart do not breed',()=>{
    const h=setup(),a=h.spawn('pig',.5,60,.5),b=h.spawn('pig',15,60,.5),pig=h.kind('pig');
    h.hold(stack('carrot',2));pig.interact!(a,h.game,h.game.inventory.held());pig.interact!(b,h.game,h.game.inventory.held());
    tick(h,200);expect(h.bred).toHaveLength(0);
  });
  test('feeding a baby speeds up its growth by 10% of the remaining time',()=>{
    const h=setup(),chick=h.spawn('chicken',.5,60,.5,{baby:true,reason:'egg'});
    expect(chick.data.growth).toBe(-24000);
    h.hold(stack('wheat_seeds'));
    expect(h.kind('chicken').interact!(chick,h.game,h.game.inventory.held())).toBe(true);
    expect(chick.data.growth).toBe(-24000+2400);expect(h.game.inventory.held()).toBeNull();
    expect(h.particles.some(p=>p.kind==='happy')).toBe(true);
  });
  test('mooshrooms breed only with mooshrooms and their calves are mooshrooms',()=>{
    const h=setup(),m=h.spawn('cow',.5,60,.5,{data:{variant:'mooshroom'}}),c=h.spawn('cow',2,60,.5,{data:{variant:'cow'}}),cow=h.kind('cow');
    h.hold(stack('wheat',4));cow.interact!(m,h.game,h.game.inventory.held());cow.interact!(c,h.game,h.game.inventory.held());
    tick(h,100);expect(h.bred).toHaveLength(0);
    const m2=h.spawn('cow',1,60,1.5,{data:{variant:'mooshroom'}});cow.interact!(m2,h.game,h.game.inventory.held());
    tick(h,100);expect(h.bred).toHaveLength(1);
    expect(h.list.find(e=>e.baby)!.data.variant).toBe('mooshroom');
  });
  test('rabbits breed with carrots, golden carrots or dandelions',()=>{
    const h=setup(),r=h.kind('rabbit'),e=h.spawn('rabbit');
    for(const food of ['carrot','golden_carrot','dandelion']){e.data.love=0;h.hold(stack(food));expect(r.interact!(e,h.game,h.game.inventory.held())).toBe(true);}
    e.data.love=0;h.hold(stack('wheat'));expect(r.interact!(e,h.game,h.game.inventory.held())).toBe(false);
  });
  test('lambs mix their parents\' wool colours like dyes',()=>{
    expect(mixWoolColours('white','black',()=>.5)).toBe('gray');
    expect(mixWoolColours('red','yellow',()=>.5)).toBe('orange');
    expect(mixWoolColours('blue','white',()=>.5)).toBe('light_blue');
    expect(['brown','green']).toContain(mixWoolColours('brown','green',Math.random));
    expect(mixWoolColours('pink','pink',()=>.1)).toBe('pink');
  });
  test('a spawn egg used on an adult spawns a baby of its kind',()=>{
    const h=setup(),sheep=h.spawn('sheep',.5,60,.5,{data:{color:'black'}});
    h.hold(stack('sheep_spawn_egg'));expect(h.kind('sheep').interact!(sheep,h.game,h.game.inventory.held())).toBe(true);
    const lamb=h.list.find(e=>e.baby)!;expect(lamb.kind).toBe('sheep');
    h.hold(stack('cow_spawn_egg'));expect(h.kind('sheep').interact!(sheep,h.game,h.game.inventory.held())).toBe(false);
  });
});

describe('sheep',()=>{
  test('wool colours follow the vanilla odds',()=>{
    let s=12345;const random=()=>{s=(Math.imul(s^s>>>15,0x2c1b3c6d)+0x6d2b79f5)>>>0;return s/0x100000000;};
    const counts=new Map<string,number>();const n=40000;
    for(let i=0;i<n;i++){const c=randomWoolColour(random);counts.set(c,(counts.get(c)??0)+1);}
    const share=(c:string)=>(counts.get(c)??0)/n;
    expect(share('white')).toBeGreaterThan(.79);expect(share('white')).toBeLessThan(.85);
    for(const c of ['black','gray','light_gray'])expect(Math.abs(share(c)-.05)).toBeLessThan(.008);
    expect(Math.abs(share('brown')-.03)).toBeLessThan(.006);
    expect(share('pink')).toBeGreaterThan(0);expect(share('pink')).toBeLessThan(.005);
    expect([...counts.keys()].every(c=>(WOOL_COLOURS as readonly string[]).includes(c))).toBe(true);
  });
  test('shears give 1-3 wool of the sheep\'s colour once, with the shear sound and tool wear',()=>{
    const h=setup(),sheep=h.spawn('sheep',.5,60,.5,{data:{color:'brown'}}),k=h.kind('sheep');
    h.hold(stack('shears'));
    expect(k.interact!(sheep,h.game,h.game.inventory.held())).toBe(true);
    expect(sheep.data.sheared).toBe(true);
    const wool=h.drops.filter(d=>d.stack.id==='brown_wool').reduce((n,d)=>n+d.stack.count,0);
    expect(wool).toBeGreaterThanOrEqual(1);expect(wool).toBeLessThanOrEqual(3);
    expect(h.game.sounds.played.some(s=>s.name==='shear')).toBe(true);
    expect((h as unknown as {damaged:number}).damaged).toBe(1);
    expect(k.interact!(sheep,h.game,h.game.inventory.held())).toBe(false);
    const lamb=h.spawn('sheep',.5,60,.5,{baby:true,reason:'breed'});expect(k.interact!(lamb,h.game,h.game.inventory.held())).toBe(false);
  });
  test('shearing over many sheep averages two wool',()=>{
    const h=setup();h.hold(stack('shears'));let total=0;
    for(let i=0;i<300;i++){const s=h.spawn('sheep',.5,60,.5,{data:{color:'white'}});h.drops.length=0;h.kind('sheep').interact!(s,h.game,h.game.inventory.held());total+=h.drops.reduce((n,d)=>n+d.stack.count,0);}
    expect(total/300).toBeGreaterThan(1.8);expect(total/300).toBeLessThan(2.2);
  });
  test('a sheared sheep regrows its wool by eating grass, turning the grass block to dirt',()=>{
    const h=setup({random:()=>0}),sheep=h.spawn('sheep',.5,60,.5,{data:{color:'white',sheared:true}});
    tick(h,1);
    expect(brainOf(sheep).eat).toBeGreaterThan(0);
    tick(h,40);
    expect(w(h).get(0,59,0)).toBe(B.dirt);expect(sheep.data.sheared).toBe(false);
  });
  test('a sheep standing in short grass eats the grass plant instead',()=>{
    const h=setup({random:()=>0});w(h).set(0,60,0,B.shortGrass);
    const sheep=h.spawn('sheep',.5,60,.5,{data:{color:'white',sheared:true}});
    tick(h,41);
    expect(w(h).get(0,60,0)).toBe(0);expect(w(h).get(0,59,0)).toBe(B.grass);expect(sheep.data.sheared).toBe(false);
  });
  test('dye recolours an unsheared sheep',()=>{
    const h=setup(),sheep=h.spawn('sheep',.5,60,.5,{data:{color:'white'}});
    h.hold(stack('blue_dye',2));expect(h.kind('sheep').interact!(sheep,h.game,h.game.inventory.held())).toBe(true);
    expect(sheep.data.color).toBe('blue');expect(h.game.inventory.held()?.count).toBe(1);
    expect(h.kind('sheep').interact!(sheep,h.game,h.game.inventory.held())).toBe(false);
  });
  test('model tints the wool and hides it when sheared',()=>{
    const h=setup(),sheep=h.spawn('sheep',.5,60,.5,{data:{color:'black'}}),model=h.kind('sheep').model!;
    const white=h.spawn('sheep',.5,60,.5,{data:{color:'white'}});
    expect(model.appearance!(sheep).tint).not.toBe(model.appearance!(white).tint);
    const pose=animate(model,sheep);
    const wool=model.parts.filter(p=>p.tinted);expect(wool.length).toBeGreaterThan(0);
    expect(wool.some(p=>pose[p.name].visible!==false)).toBe(true);
    sheep.data.sheared=true;const shorn=animate(model,sheep);
    expect(wool.every(p=>shorn[p.name].visible===false)).toBe(true);
  });
});

describe('cows and mooshrooms',()=>{
  test('a bucket milks an adult cow into a milk bucket',()=>{
    const h=setup(),cow=h.spawn('cow'),k=h.kind('cow');
    h.hold(stack('bucket'));expect(k.interact!(cow,h.game,h.game.inventory.held())).toBe(true);
    expect(h.game.inventory.held()).toEqual(stack('milk_bucket'));
    expect(h.game.sounds.played.some(s=>s.name==='milk')).toBe(true);
    h.hold(stack('bucket',5));k.interact!(cow,h.game,h.game.inventory.held());
    expect(h.game.inventory.held()).toEqual(stack('bucket',4));expect(h.game.inventory.count('milk_bucket')).toBe(1);
    const calf=h.spawn('cow',.5,60,.5,{baby:true,reason:'breed'});h.hold(stack('bucket'));
    expect(k.interact!(calf,h.game,h.game.inventory.held())).toBe(false);
  });
  test('creative milking keeps the bucket',()=>{
    const h=setup({mode:'creative'}),cow=h.spawn('cow');h.hold(stack('bucket'));
    expect(h.kind('cow').interact!(cow,h.game,h.game.inventory.held())).toBe(true);
    expect(h.game.inventory.held()).toEqual(stack('bucket'));expect(h.game.inventory.count('milk_bucket')).toBe(1);
  });
  test('cows spawning naturally in mushroom fields are mooshrooms',()=>{
    const h=setup({biome:'mushroom_fields'});
    expect(h.spawn('cow',.5,60,.5,{reason:'chunk'}).data.variant).toBe('mooshroom');
    expect(h.spawn('cow',.5,60,.5,{reason:'egg'}).data.variant).toBe('cow');
    expect(setup({biome:'plains'}).spawn('cow',.5,60,.5,{reason:'chunk'}).data.variant).toBe('cow');
  });
  test('a bowl gets mushroom stew from a mooshroom',()=>{
    const h=setup(),m=h.spawn('cow',.5,60,.5,{data:{variant:'mooshroom'}});h.hold(stack('bowl'));
    expect(h.kind('cow').interact!(m,h.game,h.game.inventory.held())).toBe(true);
    expect(h.game.inventory.held()).toEqual(stack('mushroom_stew'));
    const c=h.spawn('cow',.5,60,.5,{data:{variant:'cow'}});h.hold(stack('bowl'));
    expect(h.kind('cow').interact!(c,h.game,h.game.inventory.held())).toBe(false);
  });
  test('shearing a mooshroom turns it into a cow and drops 5 red mushrooms',()=>{
    const h=setup(),m=h.spawn('cow',.5,60,.5,{data:{variant:'mooshroom'}});h.hold(stack('shears'));
    expect(h.kind('cow').interact!(m,h.game,h.game.inventory.held())).toBe(true);
    expect(m.data.variant).toBe('cow');
    expect(h.drops.filter(d=>d.stack.id==='red_mushroom').reduce((n,d)=>n+d.stack.count,0)).toBe(5);
    expect(h.game.sounds.played.some(s=>s.name==='shear')).toBe(true);
    expect(h.kind('cow').interact!(m,h.game,h.game.inventory.held())).toBe(false);
  });
  test('the model shows the variant\'s parts only, with mushrooms on adult mooshrooms',()=>{
    const h=setup(),model=h.kind('cow').model!;
    const m=h.spawn('cow',.5,60,.5,{data:{variant:'mooshroom'}}),c=h.spawn('cow',.5,60,.5,{data:{variant:'cow'}});
    const visible=(e:Entity)=>{const p=animate(model,e);return model.parts.filter(x=>p[x.name].visible!==false).map(x=>x.name);};
    expect(visible(m).some(n=>n.includes('mushroom'))).toBe(true);
    expect(visible(c).some(n=>n.includes('mushroom'))).toBe(false);
    expect(visible(m).filter(n=>visible(c).includes(n))).toEqual([]);
    const calf=h.spawn('cow',.5,60,.5,{baby:true,data:{variant:'mooshroom'},reason:'breed'});
    expect(visible(calf).some(n=>n.includes('mushroom'))).toBe(false);
  });
});

describe('chickens',()=>{
  test('lay an egg every 5-10 minutes; chicks do not',()=>{
    const h=setup(),hen=h.spawn('chicken'),chick=h.spawn('chicken',3,60,3,{baby:true,reason:'egg'});
    const t=hen.data.eggTime as number;expect(t).toBeGreaterThanOrEqual(6000);expect(t).toBeLessThan(12000);
    tick(h,t-1);expect(h.drops.filter(d=>d.stack.id==='egg')).toHaveLength(0);
    tick(h,1);expect(h.drops.filter(d=>d.stack.id==='egg')).toHaveLength(1);
    expect(h.drops[0].x).toBeCloseTo(hen.x);
    const next=hen.data.eggTime as number;expect(next).toBeGreaterThanOrEqual(6000);expect(next).toBeLessThan(12000);
    expect(chick.data.eggTime).toBeDefined();
  });
  test('fall slowly',()=>{
    const h=setup(),hen=h.spawn('chicken',.5,70,.5);hen.onGround=false;hen.vy=-10;tick(h,1);
    expect(hen.vy).toBeCloseTo(-6);
    hen.onGround=true;hen.vy=-10;tick(h,1);expect(hen.vy).toBe(-10);
  });
});

describe('rabbits',()=>{
  test('coats follow the biome: gold in deserts, white in snow, brown, salt or black elsewhere',()=>{
    for(let i=0;i<20;i++)expect(rabbitVariantFor('desert',()=>i/20)).toBe('gold');
    const snowy=new Set(Array.from({length:20},(_,i)=>rabbitVariantFor('snowy_plains',()=>i/20)));expect([...snowy].sort()).toEqual(['white','white_splotched']);
    const plains=new Set(Array.from({length:20},(_,i)=>rabbitVariantFor('plains',()=>i/20)));expect([...plains].sort()).toEqual(['black','brown','salt']);
    expect(setup({biome:'desert'}).spawn('rabbit',.5,60,.5,{reason:'chunk'}).data.variant).toBe('gold');
    expect(RABBIT_VARIANTS).toContain('salt');
  });
  test('hop: they only move in jumps, pausing on landing (10 ticks walking, 1 in a panic)',()=>{
    const h=setup({mode:'creative'}),r=h.spawn('rabbit');
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};
    /** Simulated physics: a hop keeps the rabbit airborne for 7 ticks. Returns the ticks on which it hopped. */
    const run=(ticks:number)=>{
      const hops:number[]=[];let air=0;
      for(let i=0;i<ticks;i++){
        r.onGround=air===0;tick(h,1);
        if(r.onGround){
          if(r.vy>0){hops.push(i);expect(r.vx).toBeCloseTo(r.moveX);air=7;}
          else expect([r.moveX,r.moveZ]).toEqual([0,0]);
        }else air--;
        r.vy=0;
      }
      return hops;
    };
    hurt(h,r);
    const panic=run(60);
    expect(panic.length).toBeGreaterThan(5);
    expect(panic[1]-panic[0]).toBe(9);// 7 ticks in the air, the landing tick, then 1 tick of delay
    expect(r.vy).toBe(0);
    expect(brainOf(r).hop).toBeGreaterThanOrEqual(0);
    // After the panic (5 s) it strolls with the long landing delay.
    const calm=run(200).filter(t=>t>60);
    for(let i=1;i<calm.length;i++)expect(calm[i]-calm[i-1]).toBeGreaterThanOrEqual(18);
  });
  test('a rabbit blocked by a wall hops higher to climb it',()=>{
    const h=setup({mode:'creative'}),r=h.spawn('rabbit');
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};
    hurt(h,r);r.collidedH=true;tick(h,1);
    expect(r.vy).toBe(10);
  });
  test('raid mature carrots, nibbling them down one stage',()=>{
    const h=setup({mode:'creative'}),carrots3=stateFor('carrots',{age:3})!.id;
    w(h).set(4,59,0,B.farmland);w(h).set(4,60,0,carrots3);
    const r=h.spawn('rabbit',.5,60,.5);
    let reached=false;
    h.game.entities.ai.navigate=(e,x,_y,z)=>{if(Math.floor(x)===4&&Math.floor(z)===0){e.x=x;e.z=z;reached=true;}return true;};
    tick(h,700);
    expect(reached).toBe(true);
    expect(blockDef(w(h).get(4,60,0)).family).toBe('carrots');expect(blockDef(w(h).get(4,60,0)).age).toBe(2);
    expect(r.data.carrotTicks).toBeGreaterThanOrEqual(0);
  });
});

describe('drops and experience',()=>{
  const total=(drops:ItemStack[],id:string)=>drops.filter(s=>s.id===id).reduce((n,s)=>n+s.count,0);
  function range(kind:string,id:string,data:Record<string,unknown>={},fire=0,byPlayer=true){
    const h=setup();let min=Infinity,max=-Infinity;
    for(let i=0;i<300;i++){const e=h.spawn(kind,.5,60,.5,{data:{...data}});e.fire=fire;const n=total(h.kind(kind).drops!(e,h.game,byPlayer),id);min=Math.min(min,n);max=Math.max(max,n);}
    return [min,max];
  }
  test('vanilla loot ranges',()=>{
    expect(range('cow','leather')).toEqual([0,2]);expect(range('cow','beef')).toEqual([1,3]);
    expect(range('cow','beef',{variant:'mooshroom'})).toEqual([1,3]);
    expect(range('pig','porkchop')).toEqual([1,3]);
    expect(range('sheep','white_wool',{color:'white'})).toEqual([1,1]);expect(range('sheep','mutton')).toEqual([1,2]);
    expect(range('sheep','white_wool',{color:'white',sheared:true})).toEqual([0,0]);
    expect(range('chicken','feather')).toEqual([0,2]);expect(range('chicken','chicken')).toEqual([1,1]);
    expect(range('rabbit','rabbit_hide')).toEqual([0,1]);expect(range('rabbit','rabbit')).toEqual([0,1]);
    expect(range('rabbit','rabbit_foot')).toEqual([0,1]);expect(range('rabbit','rabbit_foot',{},0,false)).toEqual([0,0]);
  });
  test('meat is cooked when the animal died burning',()=>{
    expect(range('cow','cooked_beef',{},40)).toEqual([1,3]);expect(range('cow','beef',{},40)).toEqual([0,0]);
    expect(range('pig','cooked_porkchop',{},40)).toEqual([1,3]);expect(range('sheep','cooked_mutton',{},40)).toEqual([1,2]);
    expect(range('chicken','cooked_chicken',{},40)).toEqual([1,1]);expect(range('rabbit','cooked_rabbit',{},40)).toEqual([0,1]);
  });
  test('rabbit feet drop about 10% of the time',()=>{
    const h=setup();let feet=0;
    for(let i=0;i<2000;i++){const e=h.spawn('rabbit');feet+=total(h.kind('rabbit').drops!(e,h.game,true),'rabbit_foot');}
    expect(feet/2000).toBeGreaterThan(.07);expect(feet/2000).toBeLessThan(.13);
  });
  test('adults give 1-3 xp, babies drop nothing',()=>{
    const h=setup();
    for(const kind of ['cow','pig','sheep','chicken','rabbit']){
      const k=h.kind(kind),e=h.spawn(kind),seen=new Set<number>();
      for(let i=0;i<100;i++)seen.add(typeof k.xp==='function'?k.xp(e):k.xp!);
      expect([...seen].sort()).toEqual([1,2,3]);
      const baby=h.spawn(kind,.5,60,.5,{baby:true,reason:'breed'});
      expect(typeof k.xp==='function'?k.xp(baby):0).toBe(0);expect(k.drops!(baby,h.game,true)).toEqual([]);
    }
  });
  test('hurting an animal cancels love mode',()=>{
    const h=setup(),cow=h.spawn('cow');h.hold(stack('wheat'));h.kind('cow').interact!(cow,h.game,h.game.inventory.held());
    expect(cow.data.love).toBe(600);hurt(h,cow);expect(cow.data.love).toBe(0);
  });
});

/** Runs a model's animate with a neutral walking state; returns the pose record. */
function animate(model:EntityModel,e:Entity,state:Partial<AnimationState>={}):Record<string,PartPose>{
  const pose:Record<string,PartPose>={};
  model.animate?.(e,pose,{time:1,partial:.5,limbSwing:1,limbAmount:.5,headYaw:.3,headPitch:-.2,attack:0,reducedMotion:false,...state});
  return pose;
}

describe('models',()=>{
  const h=setup(),names=['cow','pig','sheep','chicken','rabbit'];
  test.each(names)('%s: every box unwraps inside the texture onto opaque painted pixels',name=>{
    const model=h.kind(name).model!,px=new Uint8ClampedArray(model.textureWidth*model.textureHeight*4);
    model.paint(px,model.textureWidth,model.textureHeight);
    for(const part of model.parts)for(const box of part.boxes){
      for(const s of box.size)expect(Number.isInteger(s)&&s>0,`${name}.${part.name} size`).toBe(true);
      for(const face of FACES){
        const [x,y,fw,fh]=faceRect(box.uv,box.size,face);
        expect(x>=0&&y>=0&&x+fw<=model.textureWidth&&y+fh<=model.textureHeight,`${name}.${part.name} ${face} in texture`).toBe(true);
        for(let j=y;j<y+fh;j++)for(let i=x;i<x+fw;i++)expect(px[(j*model.textureWidth+i)*4+3],`${name}.${part.name} ${face} painted at ${i},${j}`).toBe(255);
      }
    }
  });
  test.each(names)('%s: unique part names, feet on the ground and a pose for every part',name=>{
    const k=h.kind(name),model=k.model!,e=h.spawn(name);
    expect(new Set(model.parts.map(p=>p.name)).size).toBe(model.parts.length);
    const scale=model.scale??1;
    const pose=animate(model,e);
    let minY=Infinity,maxY=-Infinity;
    for(const part of model.parts){
      expect(pose[part.name],`${name}.${part.name} posed`).toBeDefined();
      if(pose[part.name].visible===false)continue;
      for(const b of part.boxes){minY=Math.min(minY,part.pivot[1]+b.from[1]);maxY=Math.max(maxY,part.pivot[1]+b.from[1]+b.size[1]);}
    }
    expect(minY).toBe(0);
    // The visible model is roughly as tall as the hitbox (heads and ears may poke above it).
    expect(maxY*scale/16).toBeGreaterThan(k.height*.8);expect(maxY*scale/16).toBeLessThan(k.height*1.6);
    // Poses are reused objects (no per-frame allocation).
    const again:Record<string,PartPose>={...pose};model.animate!(e,again,{time:2,partial:0,limbSwing:2,limbAmount:1,headYaw:0,headPitch:0,attack:0,reducedMotion:false});
    for(const part of model.parts)expect(again[part.name]).toBe(pose[part.name]);
  });
  test.each(['cow','pig','sheep','chicken'])('%s: babies show the big baby head instead of the adult one',name=>{
    const model=h.kind(name).model!,adult=h.spawn(name),baby=h.spawn(name,.5,60,.5,{baby:true,reason:'breed'});
    const shown=(e:Entity)=>{const p=animate(model,e);return model.parts.filter(x=>p[x.name].visible!==false).map(x=>x.name);};
    expect(shown(adult).some(n=>n.includes('baby'))).toBe(false);
    expect(shown(baby).some(n=>n.includes('baby'))).toBe(true);
    expect(shown(baby).some(n=>/(^|\.)head$/.test(n))).toBe(false);
  });
  test('legs swing in opposite phase with walking speed; heads follow the look',()=>{
    const model=h.kind('pig').model!,pig=h.spawn('pig');
    const p=animate(model,pig,{limbSwing:0,limbAmount:1,headYaw:.4,headPitch:.2});
    const legs=model.parts.filter(x=>x.name.includes('leg')).map(x=>p[x.name].x);
    expect(Math.max(...legs)).toBeCloseTo(1.4);expect(Math.min(...legs)).toBeCloseTo(-1.4);
    expect(p.head.y).toBeCloseTo(.4);expect(p.head.x).toBeCloseTo(.2);
    const still=animate(model,pig,{limbAmount:0});
    for(const x of model.parts.filter(x=>x.name.includes('leg')))expect(still[x.name].x).toBeCloseTo(0);
  });
  test('rabbit coats are separate painted variants',()=>{
    const model=h.kind('rabbit').model!,r=h.spawn('rabbit',.5,60,.5,{data:{variant:'gold'}});
    const p=animate(model,r);
    const shown=model.parts.filter(x=>p[x.name].visible!==false).map(x=>x.name);
    expect(shown.length).toBeGreaterThan(5);expect(shown.every(n=>n.startsWith('gold.'))).toBe(true);
  });
  test('chicken wings flap while airborne',()=>{
    const hh=setup(),model=hh.kind('chicken').model!,hen=hh.spawn('chicken');
    hen.onGround=false;tick(hh,6);
    const p=animate(model,hen);const wings=model.parts.filter(x=>x.name.includes('wing'));
    expect(wings.some(x=>Math.abs(p[x.name].z)>.05)).toBe(true);
  });
});
