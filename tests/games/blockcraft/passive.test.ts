// Passive mobs (entity/passive*.ts): kinds, AI decisions, breeding, shearing and regrowth, milking, eggs, rabbits,
// drops and model sanity. The kinds run against the DOM-free fake game with a minimal entity service (spawn, near,
// drop recording) and a recording AI, so the tests exercise the kinds' own logic, not the entity framework.
import {describe,expect,test} from 'vitest';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {B,SOLID,blockId,blockDef,isLava,isWater,stateFor,WOOL_COLOURS} from '../../../src/games/blockcraft/data/blocks';
import {moveBody} from '../../../src/games/blockcraft/engine/physics';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {stack} from '../../../src/games/blockcraft/data/items';
import {registerPassiveMobs,PASSIVE_SPEEDS,randomWoolColour,mixWoolColours,rabbitVariantFor,RABBIT_VARIANTS} from '../../../src/games/blockcraft/entity/passive';
import {dangerAhead,dangerMoving,standable,brainOf} from '../../../src/games/blockcraft/entity/passive-ai';
import {faceRect,FACES,restTransforms} from '../../../src/games/blockcraft/entity/passive-model';
import {QuadWriter,compileModel,identity,mat,writeModel} from '../../../src/games/blockcraft/entity/model';
import {CUTOUT_PARTS} from '../../../src/games/blockcraft/entity/passive-art';
import type {AnimationState,DamageSource,Entity,EntityAI,EntityKind,EntityModel,GameEvents,ItemStack,ModelPart,PartPose,SpawnReason} from '../../../src/games/blockcraft/engine/contracts';

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
  test('falls and drowning do not cause panic',()=>{
    const h=setup(),cow=h.spawn('cow');
    hurt(h,cow,{kind:'fall'});hurt(h,cow,{kind:'drown'});tick(h,1);
    expect(navigations(h,cow).some(c=>c.speed===PASSIVE_SPEEDS.cow.panic)).toBe(false);
  });
  test('rabbits flee monsters within 4 blocks and wolves within 10',()=>{
    const h=setup({mode:'creative'}),rabbit=h.spawn('rabbit',.5,60,.5);
    const other=(kind:string,category:Entity['category'],x:number):Entity=>{
      const e={...rabbit,id:100+h.list.length,kind,category,x,z:.5,data:{}};h.list.push(e);return e;
    };
    const zombie=other('zombie','hostile',5.5);
    tick(h,5);expect(h.calls.some(c=>c.fn==='flee'&&c.id===rabbit.id)).toBe(false);
    zombie.x=3.5;h.calls.length=0;tick(h,5);
    const flee=h.calls.find(c=>c.fn==='flee'&&c.id===rabbit.id);
    expect(flee?.x).toBeCloseTo(3.5);expect(flee?.speed).toBeCloseTo(PASSIVE_SPEEDS.rabbit.panic);
    zombie.removed=true;other('wolf','passive',9.5);h.calls.length=0;tick(h,6);
    expect(h.calls.filter(c=>c.fn==='flee'&&c.id===rabbit.id).at(-1)?.x).toBeCloseTo(9.5);
  });
  test('animals in love show hearts every half second',()=>{
    const h=setup(),pig=h.spawn('pig');h.hold(stack('potato'));h.kind('pig').interact!(pig,h.game,h.game.inventory.held());
    h.particles.length=0;tick(h,100);
    expect(h.particles.filter(p=>p.kind==='heart').length).toBe(10);
    tick(h,500);expect(pig.data.love).toBe(0);
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
  test('walking diagonally into a wall counts the slide along it: a hole beside the wall is dangerous',()=>{
    const h=setup(),w=h.game.world;
    for(let x=-1;x<=3;x++){w.set(x,60,-6,B.stone);w.set(x,61,-6,B.stone);}// a wall north of row z=-5
    for(let y=50;y<60;y++)w.set(1,y,-5,0);// a deep hole east, beside the wall
    expect(dangerAhead(w,.5,60,-4.5,1,-1,.3)).toBe(false);
    expect(dangerMoving(w,.5,60,-4.5,1,-1,.3)).toBe(true);
    expect(dangerMoving(w,.5,60,-4.5,-1,-1,.3)).toBe(false);
  });
  test('animals walking into a cliff stop instead of falling',()=>{
    const h=setup(),cow=h.spawn('cow',1.3,60,.5);
    for(let y=40;y<60;y++)for(let z=-1;z<=1;z++)w(h).set(2,y,z,0);
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};// drives east
    hurt(h,cow);tick(h,1);
    expect(cow.moveX).toBe(0);
  });
  test('an animal standing in shallow lava is not held in it by the hazard guard',()=>{
    const h=setup(),world=w(h);
    for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)world.set(x,60,z,B.lava);
    const cow=h.spawn('cow',.5,60,.5);cow.inLava=true;cow.onGround=true;cow.fire=100;
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};
    tick(h,1);
    expect(cow.moveX).toBeGreaterThan(0);
  });
  test('babies follow an adult of their kind',()=>{
    const h=setup(),mother=h.spawn('sheep',6.5,60,.5),lamb=h.spawn('sheep',.5,60,.5,{baby:true,reason:'breed'});
    tick(h,20);
    const nav=navigations(h,lamb).filter(c=>c.speed===PASSIVE_SPEEDS.sheep.follow);
    expect(nav.length).toBeGreaterThan(0);expect(nav.at(-1)!.x).toBeCloseTo(mother.x);
  });
});
const w=(h:Harness)=>h.game.world;

/** Simple entity physics for simulations: accelerate toward the move intent, jump, gravity, voxel collision with step-up.
 *  `jump` is the jump speed in blocks/second (10 clears a 1-block step, as the contract's step jumps must). */
function physics(h:Harness,jump=8.4){
  const world=h.game.world;
  for(const e of h.list){
    if(e.removed)continue;
    const id=world.get(Math.floor(e.x),Math.floor(e.y+.1),Math.floor(e.z));
    e.inWater=isWater(id);e.inLava=isLava(id);
    if(e.moveX||e.moveZ){e.vx+=(e.moveX-e.vx)*.5;e.vz+=(e.moveZ-e.vz)*.5;}
    if(e.jump&&(e.onGround||e.inWater))e.vy=jump;
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
  const inLava=(h:Harness,e:Entity)=>isLava(w(h).get(Math.floor(e.x),Math.floor(e.y+.1),Math.floor(e.z)));
  test.each(['cow','pig','sheep','chicken','rabbit'])('a %s driven at a 1-block lip with lava or a pit right behind it never jumps over into it',kind=>{
    for(const hazard of ['lava','pit'] as const)for(const panic of [true,false]){
      const h=setup({mode:'creative'}),world=w(h);
      for(let z=-3;z<=3;z++){
        world.set(2,60,z,B.stone);// the lip
        for(let x=3;x<=8;x++)if(hazard==='lava')world.set(x,60,z,B.lava);else for(let y=48;y<60;y++)world.set(x,y,z,0);
      }
      contractSteering(h,()=>[20,.5]);// every goal lies east, across the lip
      const k=h.kind(kind),e=h.spawn(kind,2-k.width/2-.01,60,.5);
      for(let t=0;t<400;t++){
        if(panic&&t%100===0)hurt(h,e);
        h.game.time.tick++;e.age++;k.tick!(e,h.game);physics(h,10);
        const where=`${kind} ${hazard} ${panic?'panicking':'strolling'} at tick ${t} (${e.x.toFixed(2)}, ${e.y.toFixed(2)})`;
        expect(inLava(h,e),`in lava: ${where}`).toBe(false);expect(e.y,`fell: ${where}`).toBeGreaterThan(59.5);
      }
    }
  });
  test.each(['cow','pig','sheep','chicken','rabbit'])('a panicking %s in a pen with a lava moat behind a 1-block lip stays out of the lava',kind=>{
    // Seeds 5 (chicken) and 11 (rabbit) slide along the south wall over the lip when only the diagonal is checked.
    for(const seed of [1,5,11]){
      const h=setup({mode:'creative',seed}),world=w(h);
      // 2-high walls west, north and south; on the east a 1-high lip with a lava moat (x 3..5) and grass beyond.
      for(let z=-3;z<=3;z++)for(let x=-3;x<=2;x++){
        if(x===-3||z===-3||z===3){world.set(x,60,z,B.stone);world.set(x,61,z,B.stone);}else if(x===2)world.set(x,60,z,B.stone);
      }
      for(let z=-3;z<=3;z++)for(let x=3;x<=5;x++){world.set(x,59,z,B.lava);world.set(x,60,z,B.lava);}
      contractSteering(h);
      const k=h.kind(kind),e=h.spawn(kind,.5,60,.5);
      for(let t=0;t<1000;t++){
        if(t%100===0)hurt(h,e);
        h.game.time.tick++;e.age++;k.tick!(e,h.game);physics(h,10);
        expect(inLava(h,e),`${kind} seed ${seed} in lava at tick ${t} (${e.x.toFixed(2)}, ${e.y.toFixed(2)})`).toBe(false);
      }
    }
  });
});
/** Contract-style steering for simulations, like entity/ai.ts: straight lines toward the goal (or `goal(e)` instead) that
 *  jump 1-block steps when blocked or when one is right ahead. */
function contractSteering(h:Harness,goal?:(e:Entity)=>[number,number]){
  const ai=h.game.entities.ai,world=w(h);
  const steer=(e:Entity,x:number,z:number,speed:number)=>{
    const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
    if(d<.5){e.moveX=e.moveZ=0;return true;}
    e.moveX=dx/d*speed;e.moveZ=dz/d*speed;
    const r=e.width/2+.25,ahead=world.get(Math.floor(e.x+dx/d*r),Math.floor(e.y+.01),Math.floor(e.z+dz/d*r));
    if(e.onGround&&(e.collidedH||ahead>0&&SOLID[ahead]===1))e.jump=true;
    return false;
  };
  ai.moveToward=(e,x,_y,z,speed)=>steer(e,x,z,speed);
  ai.navigate=(e,x,_y,z,speed)=>{const g=goal?.(e);steer(e,g?g[0]:x,g?g[1]:z,speed);return false;};
  ai.flee=(e,fx,fz,speed)=>{const dx=e.x-fx,dz=e.z-fz,d=Math.hypot(dx,dz)||1;steer(e,e.x+dx/d*8,e.z+dz/d*8,speed);};
}

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
  test('a restored baby keeps its growth, size and remaining time',()=>{
    const h=setup(),k=h.kind('pig'),data=k.restoreData!({growth:-50,love:0})!;
    const piglet=h.spawn('pig',.5,60,.5,{data,reason:'restore'});
    expect(piglet.baby).toBe(true);expect(piglet.height).toBeCloseTo(.45);
    tick(h,50);expect(piglet.baby).toBe(false);expect(piglet.height).toBeCloseTo(.9);
  });
  test('a baby grown up by someone else stays grown up',()=>{
    const h=setup(),calf=h.spawn('cow',.5,60,.5,{baby:true,reason:'breed'});
    calf.baby=false;tick(h,1);
    expect(calf.data.growth).toBe(0);expect(calf.width).toBeCloseTo(.9);
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
    // The munch sounds like the grass block breaking (vanilla level event 2001).
    expect(h.game.sounds.played.filter(s=>s.name==='break:grass')).toHaveLength(1);
  });
  test('a sheep standing in short grass eats the grass plant instead',()=>{
    const h=setup({random:()=>0});w(h).set(0,60,0,B.shortGrass);
    const sheep=h.spawn('sheep',.5,60,.5,{data:{color:'white',sheared:true}});
    tick(h,41);
    expect(w(h).get(0,60,0)).toBe(0);expect(w(h).get(0,59,0)).toBe(B.grass);expect(sheep.data.sheared).toBe(false);
    expect(h.game.sounds.played.some(s=>s.name==='break:plant')).toBe(true);
  });
  test('a grazing lamb grows up a minute sooner',()=>{
    const h=setup({random:()=>0}),lamb=h.spawn('sheep',.5,60,.5,{baby:true,reason:'breed',data:{color:'white'}});
    // Lambs follow adults first; with none around it grazes.
    tick(h,41);
    expect(w(h).get(0,59,0)).toBe(B.dirt);
    expect(lamb.data.growth).toBe(-24000+41+1200);
  });
  test('sheep do not graze on dirt or stone',()=>{
    const h=setup({random:()=>0});w(h).set(0,59,0,B.dirt);
    const sheep=h.spawn('sheep',.5,60,.5,{data:{color:'white',sheared:true}});
    tick(h,50);expect(brainOf(sheep).eat).toBe(0);expect(sheep.data.sheared).toBe(true);
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
  test('creative players keep the bowl and get a stew every time (vanilla does not deduplicate stew)',()=>{
    const h=setup({mode:'creative'}),m=h.spawn('cow',.5,60,.5,{data:{variant:'mooshroom'}});h.hold(stack('bowl'));
    for(let i=0;i<2;i++)expect(h.kind('cow').interact!(m,h.game,h.game.inventory.held())).toBe(true);
    expect(h.game.inventory.held()).toEqual(stack('bowl'));expect(h.game.inventory.count('mushroom_stew')).toBe(2);
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
    const visible=(e:Entity)=>shownParts(model,animate(model,e));
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
  test('strolling rabbits hop low (vanilla 0.2 blocks/tick), faster ones at 0.3',()=>{
    const h=setup({mode:'creative'}),stroller=h.spawn('rabbit',.5,60,.5),runner=h.spawn('rabbit',.5,60,4.5);
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};
    const b=brainOf(stroller);b.mode='stroll';b.hasTarget=true;b.tx=20;b.ty=60;b.tz=0;
    hurt(h,runner);tick(h,1);
    expect(stroller.vy).toBe(4);expect(stroller.vx).toBeCloseTo(PASSIVE_SPEEDS.rabbit.walk);
    expect(runner.vy).toBe(6);expect(runner.vx).toBeCloseTo(PASSIVE_SPEEDS.rabbit.panic);
  });
  test('rabbits climb a 1-block step with a climbing hop even when steering never asks them to jump',()=>{
    const h=setup({mode:'creative'}),world=w(h),r=h.spawn('rabbit',1.5,60,.5),k=h.kind('rabbit');
    for(let x=2;x<=9;x++)for(let z=-3;z<=3;z++)world.set(x,60,z,B.stone);// a plateau one block up, east
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;return true;};
    for(const panic of [true,false]){
      r.x=1.5;r.y=60;r.vx=r.vy=r.vz=0;r.onGround=true;
      const b=brainOf(r);
      if(panic)hurt(h,r);else{b.panic=0;b.mode='stroll';b.hasTarget=true;b.tx=8;b.ty=61;b.tz=0;}
      let top=0;
      for(let t=0;t<80;t++){h.game.time.tick++;r.age++;k.tick!(r,h.game);physics(h);top=Math.max(top,r.y);}
      expect(top,panic?'panicking':'strolling').toBeGreaterThanOrEqual(61);
    }
  });
  test('rabbits on the ground only leave it through their own hop: a steering jump request is dropped',()=>{
    const h=setup({mode:'creative'}),r=h.spawn('rabbit');
    h.game.entities.ai.navigate=(e,_x,_y,_z,speed)=>{e.moveX=speed;e.moveZ=0;e.jump=true;return true;};
    hurt(h,r);
    let air=0,hops=0;
    for(let t=0;t<40;t++){
      r.onGround=air===0;tick(h,1);
      expect(r.jump,`tick ${t}`).toBe(false);
      if(r.onGround&&r.vy>0){air=5;hops++;}else if(!r.onGround)air--;
      r.vy=0;
    }
    expect(hops).toBeGreaterThan(3);
  });
  test('garden searches are cheap and spread out: rabbits spawned together do not all search on their first tick',()=>{
    const h=setup({mode:'creative'}),world=w(h),rabbits=Array.from({length:20},(_,i)=>h.spawn('rabbit',-9.5+i,60,(i%5)-2,{reason:'chunk'}));
    expect(new Set(rabbits.map(r=>brainOf(r).raid)).size).toBeGreaterThan(10);
    // All 20 forced to search (31×31 columns on 3 levels each) in one tick: the scan reads chunk arrays, not ~2,900 single cells.
    const get=world.get.bind(world);let reads=0;world.get=(x,y,z)=>{reads++;return get(x,y,z);};
    for(const r of rabbits){const b=brainOf(r);b.raid=0;b.hasCrop=false;}
    tick(h,1);
    expect(reads).toBeLessThan(20*300);
    // Still finds the nearest ripe carrot on farmland at the feet level.
    const ripe=stateFor('carrots',{age:3})!.id;
    for(const [x,z] of [[6,0],[3,1]]){world.set(x,59,z,B.farmland);world.set(x,60,z,ripe);}
    world.set(0,60,-1,B.farmland);world.set(0,61,-1,ripe);// one level up and nearer, but the feet level comes first
    const r=rabbits[10],b=brainOf(r);b.raid=0;b.hasCrop=false;r.data.carrotTicks=0;// at (0.5, 60, -2)
    h.kind('rabbit').tick!(r,h.game);
    expect([b.hasCrop,b.cropX,b.cropY,b.cropZ]).toEqual([true,3,60,1]);
    for(const [x,z] of [[6,0],[3,1]])world.set(x,60,z,0);
    b.raid=0;b.hasCrop=false;h.kind('rabbit').tick!(r,h.game);
    expect([b.hasCrop,b.cropX,b.cropY,b.cropZ]).toEqual([true,0,61,-1]);
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
    expect(h.game.sounds.played.some(s=>s.name==='break:plant')).toBe(true);
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
/** Every part with its children, depth first. */
function allParts(parts:readonly ModelPart[],out:ModelPart[]=[]):ModelPart[]{for(const p of parts){out.push(p);if(p.children)allParts(p.children,out);}return out;}
/** Variant models (cow, rabbit) hold one box-less group part per variant at the top level. */
const grouped=(model:EntityModel)=>model.parts.length>1&&model.parts.every(p=>!p.boxes.length&&!!p.children?.length);
/** The parts drawn for a pose (hidden parts and their children skipped), named `<variant>.<part>` in variant models. */
function shownParts(model:EntityModel,pose:Record<string,PartPose>):string[]{
  const out:string[]=[],groups=grouped(model);
  const walk=(parts:readonly ModelPart[],prefix:string,top:boolean)=>{for(const p of parts){
    if(pose[p.name]?.visible===false)continue;
    if(top&&groups){walk(p.children!,`${p.name}.`,false);continue;}
    out.push(prefix+p.name);
    if(p.children)walk(p.children,prefix,false);
  }};
  walk(model.parts,'',true);
  return out;
}
/** A part's name without the baby_ marker. */
const baseName=(name:string)=>name.replace(/^baby_/,'');
const painted=(model:EntityModel)=>{const px=new Uint8ClampedArray(model.textureWidth*model.textureHeight*4);model.paint(px,model.textureWidth,model.textureHeight);return px;};
/** Mean colour of the opaque texels of a texture rectangle [x, y, w, h]. */
function meanOf(model:EntityModel,px:Uint8ClampedArray,[x,y,w,h]:[number,number,number,number]):[number,number,number]{
  let r=0,g=0,b=0,n=0;
  for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){const o=(j*model.textureWidth+i)*4;if(px[o+3]){r+=px[o];g+=px[o+1];b+=px[o+2];n++;}}
  return[r/n,g/n,b/n];
}
const lum=(c:readonly number[])=>.3*c[0]+.59*c[1]+.11*c[2];
/** A part by name; `<variant>.<part>` looks inside that variant's group. */
const partOf=(model:EntityModel,name:string)=>{
  const dot=name.indexOf('.'),group=dot<0?null:model.parts.find(x=>x.name===name.slice(0,dot));
  if(dot>=0&&!group)throw new Error(`no variant ${name}`);
  const p=allParts(group?group.children!:model.parts).find(x=>x.name===(dot<0?name:name.slice(dot+1)));if(!p)throw new Error(`no part ${name}`);return p;
};
/** Rest-pose bounds (entity space, pixels) of the visible parts, through every rest rotation. */
function restBounds(model:EntityModel,pose:Record<string,PartPose>){
  const m=restTransforms(model.parts);let minY=Infinity,maxY=-Infinity;
  const walk=(parts:readonly ModelPart[])=>{for(const part of parts){
    if(pose[part.name]?.visible===false)continue;
    const t=m.get(part.name)!;
    for(const b of part.boxes)for(let k=0;k<8;k++){
      const x=b.from[0]+(k&1?b.size[0]:0),y=b.from[1]+(k&2?b.size[1]:0),z=b.from[2]+(k&4?b.size[2]:0);
      const wy=t[4]*x+t[5]*y+t[6]*z+t[7];minY=Math.min(minY,wy);maxY=Math.max(maxY,wy);
    }
    if(part.children)walk(part.children);
  }};
  walk(model.parts);
  return{minY,maxY};
}

describe('models',()=>{
  const h=setup(),names=['cow','pig','sheep','chicken','rabbit'];
  test.each(names)('%s: every box unwraps inside the texture onto painted pixels (cut-outs only where intended)',name=>{
    const model=h.kind(name).model!,px=painted(model);
    for(const part of allParts(model.parts))for(const box of part.boxes){
      const cutout=CUTOUT_PARTS.has(baseName(part.name)),zero=box.size.filter(s=>s===0).length;
      for(const s of box.size)expect(Number.isInteger(s)&&s>=0,`${name}.${part.name} size`).toBe(true);
      // Only the crossed mushroom planes are flat (one zero dimension).
      expect(zero,`${name}.${part.name} flat`).toBe(cutout&&part.name.includes('mushroom')?1:0);
      let opaque=0;
      for(const face of FACES){
        const [x,y,fw,fh]=faceRect(box.uv,box.size,face);
        if(fw===0||fh===0)continue;
        expect(x>=0&&y>=0&&x+fw<=model.textureWidth&&y+fh<=model.textureHeight,`${name}.${part.name} ${face} in texture`).toBe(true);
        for(let j=y;j<y+fh;j++)for(let i=x;i<x+fw;i++){
          const a=px[(j*model.textureWidth+i)*4+3];
          if(a===255)opaque++;else if(!cutout)expect(a,`${name}.${part.name} ${face} painted at ${i},${j}`).toBe(255);
        }
      }
      expect(opaque,`${name}.${part.name} painted`).toBeGreaterThan(0);
    }
  });
  test.each(names)('%s: unique part names, feet on the ground and a pose for every part',name=>{
    const k=h.kind(name),model=k.model!,e=h.spawn(name);
    // Names are unique within the model, or within each variant group (the groups share part names).
    const scopes=grouped(model)?model.parts.map(g=>allParts(g.children!)):[allParts(model.parts)];
    for(const all of scopes)expect(new Set(all.map(p=>p.name)).size).toBe(all.length);
    if(grouped(model))expect(new Set(model.parts.map(g=>g.name)).size).toBe(model.parts.length);
    const scale=model.scale??1;
    const pose=animate(model,e);
    const posed=grouped(model)?[...model.parts,...model.parts.find(g=>pose[g.name].visible)!.children!]:model.parts;
    for(const part of posed)expect(pose[part.name],`${name}.${part.name} posed`).toBeDefined();
    const {minY,maxY}=restBounds(model,pose);
    // The feet stand on the ground (rabbit front paws dip 0.07 px, as vanilla's do).
    expect(Math.abs(minY)).toBeLessThan(.1);
    // The visible model is roughly as tall as the hitbox (heads, horns and ears may poke above it).
    expect(maxY*scale/16).toBeGreaterThan(k.height*.8);expect(maxY*scale/16).toBeLessThan(k.height*1.6);
    // Poses are reused objects (no per-frame allocation).
    const again:Record<string,PartPose>={...pose};model.animate!(e,again,{time:2,partial:0,limbSwing:2,limbAmount:1,headYaw:0,headPitch:0,attack:0,reducedMotion:false});
    for(const part of posed)expect(again[part.name]).toBe(pose[part.name]);
  });
  test.each(['cow','pig','sheep','chicken','rabbit'])('%s: babies show the big baby head instead of the adult one',name=>{
    const model=h.kind(name).model!,adult=h.spawn(name),baby=h.spawn(name,.5,60,.5,{baby:true,reason:'breed'});
    const shown=(e:Entity)=>shownParts(model,animate(model,e));
    expect(shown(adult).some(n=>n.includes('baby'))).toBe(false);
    expect(shown(baby).some(n=>n.includes('baby'))).toBe(true);
    expect(shown(baby).some(n=>/(^|\.)head$/.test(n))).toBe(false);
  });
  test('the Java geometry and texture offsets of every mob (vanilla UV layouts)',()=>{
    const box=(kind:string,part:string,i=0)=>{const b=partOf(h.kind(kind).model!,part).boxes[i];return{size:b.size,uv:b.uv};};
    // Cow: head 8×8×6 with 1×3×1 horns, body 12×18×10 with the udder, legs 4×12×4 (64×32 layout).
    expect(box('cow','cow.head')).toEqual({size:[8,8,6],uv:[0,0]});
    expect(box('cow','cow.head',1)).toEqual({size:[1,3,1],uv:[22,0]});
    expect(box('cow','cow.body')).toEqual({size:[12,18,10],uv:[18,4]});
    expect(box('cow','cow.body',1)).toEqual({size:[4,6,1],uv:[52,0]});
    for(const leg of ['leg_rh','leg_lh','leg_rf','leg_lf'])expect(box('cow',`cow.${leg}`)).toEqual({size:[4,12,4],uv:[0,16]});
    // Pig: head 8×8×8 with the 4×3×1 snout, body 10×16×8, legs 4×6×4.
    expect(box('pig','head')).toEqual({size:[8,8,8],uv:[0,0]});expect(box('pig','head',1)).toEqual({size:[4,3,1],uv:[16,16]});
    expect(box('pig','body')).toEqual({size:[10,16,8],uv:[28,8]});expect(box('pig','leg_rf')).toEqual({size:[4,6,4],uv:[0,16]});
    // Sheep: skin model on top, the fur model (same offsets) 32 rows below it.
    expect(box('sheep','head')).toEqual({size:[6,6,8],uv:[0,0]});expect(box('sheep','body')).toEqual({size:[8,16,6],uv:[28,8]});
    expect(box('sheep','wool_head')).toEqual({size:[6,6,6],uv:[0,32]});expect(box('sheep','wool_body')).toEqual({size:[8,16,6],uv:[28,40]});
    expect(box('sheep','wool_leg_rh')).toEqual({size:[4,6,4],uv:[0,48]});
    expect(partOf(h.kind('sheep').model!,'wool_body').boxes[0].inflate).toBe(1.75);
    // Chicken: head, beak and wattle, the 6×8×6 body, 3×5×3 legs and 1×4×6 wings.
    expect([box('chicken','head'),box('chicken','head',1),box('chicken','head',2)]).toEqual([{size:[4,6,3],uv:[0,0]},{size:[4,2,2],uv:[14,0]},{size:[2,2,2],uv:[14,4]}]);
    expect(box('chicken','body')).toEqual({size:[6,8,6],uv:[0,9]});expect(box('chicken','leg_r')).toEqual({size:[3,5,3],uv:[26,0]});
    expect(box('chicken','wing_l')).toEqual({size:[1,4,6],uv:[24,13]});
    // Rabbit (per coat, 64×32): body 6×5×10, head 5×4×5, ears, haunches, feet, front legs, tail and nose.
    expect(box('rabbit','brown.body')).toEqual({size:[6,5,10],uv:[0,0]});expect(box('rabbit','brown.head')).toEqual({size:[5,4,5],uv:[32,0]});
    expect(box('rabbit','brown.ear_l')).toEqual({size:[2,5,1],uv:[58,0]});expect(box('rabbit','brown.haunch_r')).toEqual({size:[2,4,5],uv:[16,15]});
    expect(box('rabbit','brown.foot_l')).toEqual({size:[2,1,7],uv:[26,24]});expect(box('rabbit','brown.leg_rf')).toEqual({size:[2,7,2],uv:[0,15]});
    expect(box('rabbit','white.tail').uv).toEqual([52,6+box('rabbit','white.body').uv[1]]);
  });
  test('quadruped bodies keep the vanilla 90° rest rotation and sit where vanilla puts them',()=>{
    const cow=h.kind('cow').model!,body=partOf(cow,'cow.body');
    expect(body.rotation?.[0]).toBeCloseTo(-Math.PI/2);
    // Rest transform of the body box corners: 12 wide, from y 12 to 22 and z -8 to 10 (head end at -z).
    const t=restTransforms([partOf(cow,'cow')]).get('body')!,b=body.boxes[0],ys:number[]=[],zs:number[]=[];
    for(let k=0;k<8;k++){
      const x=b.from[0]+(k&1?b.size[0]:0),y=b.from[1]+(k&2?b.size[1]:0),z=b.from[2]+(k&4?b.size[2]:0);
      ys.push(t[4]*x+t[5]*y+t[6]*z+t[7]);zs.push(t[8]*x+t[9]*y+t[10]*z+t[11]);
    }
    expect([Math.min(...ys),Math.max(...ys)].map(v=>Math.round(v))).toEqual([12,22]);
    expect([Math.min(...zs),Math.max(...zs)].map(v=>Math.round(v))).toEqual([-8,10]);
    // The pig's snout sticks out of the front of its head; the sheep's face sticks out of its wool.
    const pig=partOf(h.kind('pig').model!,'head');
    expect(pig.boxes[1].from[2]).toBeLessThan(pig.boxes[0].from[2]);
    const sheep=h.kind('sheep').model!;
    expect(partOf(sheep,'head').boxes[0].from[2]).toBeLessThan(partOf(sheep,'wool_head').boxes[0].from[2]-1);
  });
  test('skins use the vanilla palettes: black-and-white cow, red mooshroom, pink pig, white sheep and chicken',()=>{
    const cow=h.kind('cow').model!,cowPx=painted(cow);
    // The cow's body side (the 10×18 face at 18,14) holds both near-black coat and white patches.
    let dark=0,white=0;
    for(let j=14;j<32;j++)for(let i=18;i<28;i++){const o=(j*cow.textureWidth+i)*4,l=lum([cowPx[o],cowPx[o+1],cowPx[o+2]]);if(l<70)dark++;if(l>200)white++;}
    expect(dark).toBeGreaterThan(40);expect(white).toBeGreaterThan(10);
    // Pink udder, grey horns.
    const udder=meanOf(cow,cowPx,faceRect([52,0],[4,6,1],'bottom'));expect(udder[0]).toBeGreaterThan(udder[1]+50);
    const horn=meanOf(cow,cowPx,faceRect([22,0],[1,3,1],'front'));expect(Math.max(...horn)-Math.min(...horn)).toBeLessThan(20);expect(horn[0]).toBeGreaterThan(120);
    // The mooshroom block (second variant) is red.
    const block=cow.textureHeight/2,moo=meanOf(cow,cowPx,[18,14+block,44,18]);expect(moo[0]).toBeGreaterThan(moo[1]+60);
    const pig=h.kind('pig').model!,pigPx=painted(pig),pink=meanOf(pig,pigPx,faceRect([0,0],[8,8,8],'front'));
    expect(pink[0]).toBeGreaterThan(200);expect(pink[0]).toBeGreaterThan(pink[1]+50);
    // The snout is darker than the face.
    const snout=meanOf(pig,pigPx,faceRect([16,16],[4,3,1],'front'));expect(lum(snout)).toBeLessThan(lum(pink));
    const sheep=h.kind('sheep').model!,sheepPx=painted(sheep),wool=meanOf(sheep,sheepPx,faceRect([28,40],[8,16,6],'back'));
    expect(lum(wool)).toBeGreaterThan(200);expect(Math.max(...wool)-Math.min(...wool)).toBeLessThan(6);// greyscale: the dye tint shows true
    const face=meanOf(sheep,sheepPx,faceRect([0,0],[6,6,8],'front'));expect(lum(face)).toBeLessThan(lum(wool)-20);
    const hen=h.kind('chicken').model!,henPx=painted(hen),feathers=meanOf(hen,henPx,faceRect([0,9],[6,8,6],'west'));
    expect(lum(feathers)).toBeGreaterThan(215);
    const beak=meanOf(hen,henPx,faceRect([14,0],[4,2,2],'top'));expect(beak[0]).toBeGreaterThan(200);expect(beak[2]).toBeLessThan(110);
    const wattle=meanOf(hen,henPx,faceRect([14,4],[2,2,2],'front'));expect(wattle[0]).toBeGreaterThan(wattle[1]+100);
  });
  test('chicken legs are cut out: a shank and toes, nothing on top',()=>{
    const hen=h.kind('chicken').model!,px=painted(hen),alpha=(i:number,j:number)=>px[(j*hen.textureWidth+i)*4+3];
    const face=(f:typeof FACES[number])=>{const [x,y,w,hh]=faceRect([26,0],[3,5,3],f),rows:string[]=[];
      for(let j=0;j<hh;j++){let r='';for(let i=0;i<w;i++)r+=alpha(x+i,y+j)?'#':'.';rows.push(r);}return rows;};
    expect(face('top')).toEqual(['...','...','...']);
    // Front and back: the middle column is the shank; three toes show on the front's bottom row, one on the back's.
    expect(face('front')).toEqual(['.#.','.#.','.#.','.#.','###']);
    expect(face('back')).toEqual(['.#.','.#.','.#.','.#.','.#.']);
    // Sides: the shank, and the front toe running forward from it.
    const west=face('west'),east=face('east');
    expect(west.slice(0,4)).toEqual(['.#.','.#.','.#.','.#.']);expect(east.slice(0,4)).toEqual(['.#.','.#.','.#.','.#.']);
    expect([west[4],east[4]].sort()).toEqual(['##.','.##']);
    // Underneath: the toes fan out from the shank.
    expect(face('bottom').join('').split('').filter(c=>c==='#').length).toBe(5);
  });
  test('mooshroom mushrooms are crossed planes of a red mushroom sprite; the head one rides on the head',()=>{
    const model=h.kind('cow').model!,px=painted(model),m=h.spawn('cow',.5,60,.5,{data:{variant:'mooshroom'}});
    const planes=partOf(model,'mooshroom.mushroom_1').boxes;
    expect(planes.map(b=>b.size.filter(s=>s===0).length)).toEqual([1,1]);
    // The sprite: a red cap over a pale stem, transparent around it.
    const [x,y]=planes[0].uv;let red=0,clear=0;
    for(let j=y;j<y+16;j++)for(let i=x;i<x+16;i++){const o=(j*model.textureWidth+i)*4;if(!px[o+3])clear++;else if(px[o]>180&&px[o+1]<80)red++;}
    expect(red).toBeGreaterThan(10);expect(clear).toBeGreaterThan(200);
    const pose=animate(model,m,{headYaw:.5,headPitch:.3});
    expect(pose.mooshroom.visible).toBe(true);expect(pose.cow.visible).toBe(false);
    expect(pose.head_mushroom).toMatchObject({x:pose.head.x,y:pose.head.y,visible:true});
    expect(partOf(model,'mooshroom.head_mushroom').pivot).toEqual(partOf(model,'mooshroom.head').pivot);
    // The planes stand on the back and on top of the head.
    const rest=restTransforms([partOf(model,'mooshroom')]);
    expect(rest.get('mushroom_1')![7]).toBeCloseTo(21.6,1);expect(rest.get('head_mushroom_planes')![7]).toBeCloseTo(23.2,1);
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
  test('rabbit coats are separate painted variants; ears turn with the head',()=>{
    const model=h.kind('rabbit').model!,r=h.spawn('rabbit',.5,60,.5,{data:{variant:'gold'}});
    const p=animate(model,r,{headYaw:.4,headPitch:.2});
    const shown=shownParts(model,p);
    expect(shown.length).toBeGreaterThan(5);expect(shown.every(n=>n.startsWith('gold.'))).toBe(true);
    expect(p.ear_r).toMatchObject({x:p.head.x,y:p.head.y});
    // The ears keep their vanilla 15° splay on top of the head's turn.
    expect(partOf(model,'gold.ear_r').rotation?.[1]).toBeCloseTo(.2617994);expect(partOf(model,'gold.ear_l').rotation?.[1]).toBeCloseTo(-.2617994);
    // Each coat has its own colours (white is light, black is dark): the body's side row of each coat block.
    const px=painted(model),block=model.textureHeight/RABBIT_VARIANTS.length;
    const lumOf=(v:string)=>lum(meanOf(model,px,[0,RABBIT_VARIANTS.indexOf(v as never)*block+10,32,5]));
    expect(lumOf('white')).toBeGreaterThan(200);expect(lumOf('black')).toBeLessThan(70);
  });
  test.each([['rabbit',RABBIT_VARIANTS,20],['cow',['cow','mooshroom'],12]] as const)(
    '%s: only the shown variant is posed and drawn (one pose entry per variant group plus one per part name)',(name,variants,cap)=>{
    const model=h.kind(name).model!,compiled=compileModel(model,{x:0,y:0,w:model.textureWidth,h:model.textureHeight},model.textureWidth,model.textureHeight);
    expect(model.parts.map(g=>g.name)).toEqual([...variants]);
    // One pose record shared by every entity of the kind, reset before each draw as the entity renderer does.
    const pose:Record<string,PartPose>={},writer=new QuadWriter(64),base=identity(mat());
    for(const variant of variants)for(const baby of [false,true]){
      const e=h.spawn(name,.5,60,.5,{baby,data:{variant},reason:baby?'breed':undefined});
      for(const key in pose){const p=pose[key];p.x=p.y=p.z=0;p.px=p.py=p.pz=0;p.visible=true;}
      model.animate!(e,pose,{time:1,partial:.5,limbSwing:1,limbAmount:.5,headYaw:.3,headPitch:-.2,attack:0,reducedMotion:false});
      expect(variants.filter(v=>pose[v].visible),`${variant} baby ${baby}`).toEqual([variant]);
      // The writer draws the shown group's visible boxes and nothing of the hidden ones.
      const group=compiled.parts.find(g=>g.name===variant)!;let faces=0;
      const count=(parts:typeof compiled.parts)=>{for(const p of parts){if(pose[p.name]?.visible===false)continue;
        for(const b of p.boxes)for(let f=0;f<6;f++)if(b.faces&1<<f)faces++;count(p.children);}};
      count(group.children);
      writer.begin(0,0,0);expect(writeModel(writer,compiled,base,pose,{tint:-1})).toBe(faces);
    }
    expect(Object.keys(pose).length).toBeLessThanOrEqual(cap);
  });
  test('a hopping rabbit kicks its hind legs back and reaches with the front legs',()=>{
    const hh=setup(),model=hh.kind('rabbit').model!,r=hh.spawn('rabbit',.5,60,.5,{data:{variant:'brown'}});
    const rest=animate(model,r);
    brainOf(r).hop=6;
    const hop=animate(model,r,{partial:0});
    expect(hop.foot_r.x).toBeLessThan(rest.foot_r.x-.5);
    expect(hop.haunch_l.x).toBeLessThan(rest.haunch_l.x-.5);
    expect(hop.leg_rf.x).toBeGreaterThan(rest.leg_rf.x+.4);
  });
  test('chicken wings flap up and out while airborne',()=>{
    const hh=setup(),model=hh.kind('chicken').model!,hen=hh.spawn('chicken');
    hen.onGround=false;tick(hh,6);
    const p=animate(model,hen);
    // The right wing (at +x) turns with a positive z angle, which lifts its tip outward; the left wing mirrors it.
    expect(partOf(model,'wing_r').pivot[0]).toBeGreaterThan(0);
    expect(p.wing_r.z).toBeGreaterThan(.05);expect(p.wing_l.z).toBeCloseTo(-p.wing_r.z);
  });
});
