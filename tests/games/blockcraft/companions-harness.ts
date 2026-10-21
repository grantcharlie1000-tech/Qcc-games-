// Test harness for the companion mobs: the fake game with a small deterministic entity service that follows the entity
// framework's rules (entity/entities.ts and entities-physics.ts): living motion after vanilla LivingEntity.travel (intent =
// steady ground speed, ground acceleration s², friction 0.546, air 0.02 s, water 0.8 drag, aquatic mobs swimming freely
// with 0.9 drag and the kind's gravity), the kind's hurt hook before damage lands, invulnerability frames (only a bigger hit
// lands, for the difference), knockback, deaths with loot and experience, `entityDamaged` / `entityDied` events. Steering
// is straight-line (no path-finding). Particles, sounds, player damage, loot and experience are recorded. Not a test file
// itself (vitest only runs *.test.ts).
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {boxCollides,moveBody,raycast} from '../../../src/games/blockcraft/engine/physics';
import {AIR,SOLID,isLava,isWater} from '../../../src/games/blockcraft/data/blocks';
import {registerCompanionMobs} from '../../../src/games/blockcraft/entity/companions';
import type {DamageSource,Entity,EntityAI,EntityKind,EntityService,ItemStack,ParticleKind,ParticleOptions,SpawnReason,Vec3} from '../../../src/games/blockcraft/engine/contracts';

export interface Harness{
  game:FakeGame;
  spawned:{entity:Entity;reason:SpawnReason}[];
  /** survival.damage calls that landed on the player. */
  hurt:{amount:number;source:DamageSource}[];
  particles:{kind:ParticleKind;x:number;y:number;z:number;options?:ParticleOptions}[];
  /** Entity hits that landed. */
  hits:{entity:Entity;amount:number;source:DamageSource}[];
  drops:ItemStack[];xp:number[];
  /** Items consumed from the held stack. */
  consumed:number;
  spawn(kind:string,x:number,y:number,z:number,options?:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}):Entity;
  /** Loads a saved entity as entities.ts restoreOne does: the kind's restoreData on the saved data, the saved health set
   *  before init (reason 'restore'), then health clamped to maxHealth. */
  restore(kind:string,x:number,y:number,z:number,saved:{data?:Record<string,unknown>;health?:number;baby?:boolean}):Entity;
  /** Puts a stack in the selected hotbar slot (null empties the hand). */
  hold(id:string|null,count?:number):void;
  /** Right click on an entity with the held stack, as the interaction service does. */
  use(e:Entity):boolean;
  sounds():string[];
  run(ticks:number):void;
}

const TICK=1/20;
const living=(k:EntityKind|undefined)=>k?.category==='passive'||k?.category==='hostile'||k?.category==='water';
function fluids(game:FakeGame,e:Entity){
  const hw=e.width/2;let water=false,lava=false;
  for(let y=Math.floor(e.y+.001);y<=Math.floor(e.y+e.height-.001);y++)for(let z=Math.floor(e.z-hw+.001);z<=Math.floor(e.z+hw-.001);z++)
    for(let x=Math.floor(e.x-hw+.001);x<=Math.floor(e.x+hw-.001);x++){const id=game.world.get(x,y,z);if(id>0&&isWater(id))water=true;else if(id>0&&isLava(id))lava=true;}
  e.inWater=water;e.inLava=lava;
}
/** One tick of a living body (entity/entities-physics stepLiving, without flowing water and ladders). */
function stepLiving(game:FakeGame,e:Entity,k:EntityKind){
  const aquatic=!!k.aquatic,opts=k.physics&&k.physics!=='none'?k.physics:{};
  const g=(typeof opts.gravity==='number'?opts.gravity:32)/400;
  let ux=e.vx*TICK,uy=e.vy*TICK,uz=e.vz*TICK;
  if(e.jump){if(e.inWater||e.inLava)uy+=.04;else if(e.onGround)uy=.42;e.jump=false;}
  const target=Math.hypot(e.moveX,e.moveZ)*TICK,dirX=target>1e-9?e.moveX*TICK/target:0,dirZ=target>1e-9?e.moveZ*TICK/target:0;
  const s=Math.sqrt(target*(1-.6*.91)),wasGround=e.onGround;
  const move=()=>{e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;const hit=moveBody(game.world,e,e.width/2,e.height,TICK,undefined,.6);
    e.collidedH=hit.hitX||hit.hitZ;e.collidedV=hit.hitY;ux=e.vx*TICK;uy=e.vy*TICK;uz=e.vz*TICK;};
  if(e.inWater&&aquatic){ux+=dirX*target*.1;uz+=dirZ*target*.1;move();ux*=.9;uz*=.9;uy=(uy-g/16)*.9;}
  else if(e.inWater||e.inLava){
    const y0=e.y;ux+=dirX*.02*s;uz+=dirZ*.02*s;move();
    if(e.inWater){ux*=.8;uy*=.8;uz*=.8;uy-=g/16;}else{ux*=.5;uy*=.5;uz*=.5;uy-=g/4;}
    if(e.collidedH){const hw=e.width/2,ny=e.y+uy+.6-(e.y-y0);if(!boxCollides(game.world,e.x+ux-hw,ny,e.z+uz-hw,e.x+ux+hw,ny+e.height,e.z+uz+hw))uy=.3;}
  }else{
    const a=wasGround?s*s:.02*s;ux+=dirX*a;uz+=dirZ*a;move();
    const f=wasGround?.6*.91:.91;uy=(uy-g)*.98;ux*=f;uz*=f;
  }
  e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;
}

type SpawnOptions={data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number};
export interface TestEntities extends EntityService{
  /** spawn() with a preset health applied before init, as entities.ts create() does for restored entities. */
  create(kind:string,x:number,y:number,z:number,options?:SpawnOptions,preset?:{health:number}):Entity|null;
}
export function createTestEntities(game:FakeGame,record:Pick<Harness,'spawned'|'hits'|'drops'|'xp'>):TestEntities{
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[],lastHurt=new WeakMap<Entity,number>();
  let nextId=1;
  const ai:EntityAI={
    wander(){},
    lookAt(e,x,y,z){const dx=x-e.x,dz=z-e.z;if(Math.hypot(dx,dz)>1e-6)e.headYaw=Math.atan2(-dx,-dz);e.pitch=Math.atan2(y-(e.y+e.height*.85),Math.hypot(dx,dz));},
    moveToward(e,x,_y,z,speed){
      const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
      if(d<.5){ai.stop(e);return true;}
      e.moveX=dx/d*speed;e.moveZ=dz/d*speed;e.yaw=Math.atan2(-dx,-dz);
      if(e.collidedH&&e.onGround)e.jump=true;
      return false;
    },
    navigate(e,x,y,z,speed){ai.moveToward(e,x,y,z,speed);return true;},
    flee(e,fx,fz,speed){const dx=e.x-fx,dz=e.z-fz,d=Math.hypot(dx,dz)||1;ai.moveToward(e,e.x+dx/d*8,e.y,e.z+dz/d*8,speed);},
    canSee(e,x,y,z){
      const ox=e.x,oy=e.y+e.height*.85,oz=e.z,dx=x-ox,dy=y-oy,dz=z-oz,d=Math.hypot(dx,dy,dz);
      if(d<1e-6)return true;
      return !raycast(game.world,ox,oy,oz,dx/d,dy/d,dz/d,d,id=>id===AIR||!SOLID[id]);
    },
    isSafe(x,y,z){
      const fx=Math.floor(x),fy=Math.floor(y),fz=Math.floor(z),below=game.world.get(fx,fy-1,fz);
      return below>0&&SOLID[below]===1&&!isLava(below)&&!SOLID[Math.max(0,game.world.get(fx,fy,fz))];
    },
    stop(e){e.moveX=0;e.moveZ=0;}
  };
  function spawn(kind:string,x:number,y:number,z:number,options:SpawnOptions={},preset?:{health:number}):Entity|null{
    const k=kinds.get(kind);if(!k)return null;
    const reason=options.reason??'event',yaw=options.yaw??0;
    const e:Entity={id:nextId++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw,pitch:0,headYaw:yaw,moveX:0,moveZ:0,jump:false,width:k.width,height:k.height,
      onGround:false,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,age:0,hurtTime:0,deathTime:0,
      removed:false,fire:0,baby:!!options.baby,data:{...(options.data??{})}};
    if(preset)e.health=preset.health;
    k.init?.(e,game,reason);
    if(e.removed)return null;
    if(!Number.isFinite(e.health)||e.health<=0)e.health=e.maxHealth;
    if(e.health>e.maxHealth)e.health=e.maxHealth;
    list.push(e);record.spawned.push({entity:e,reason});
    game.events.emit('entitySpawned',{entity:e,reason});
    return e;
  }
  const service:TestEntities={
    ai,register(k){kinds.set(k.kind,k);},kinds:()=>[...kinds.values()],kind:n=>kinds.get(n),spawn:(kind,x,y,z,o)=>spawn(kind,x,y,z,o),create:spawn,
    remove(e){e.removed=true;},all:()=>list,byId:id=>list.find(e=>e.id===id&&!e.removed),
    near(x,y,z,r,filter,out=[]){
      out.length=0;
      for(const e of list){
        if(e.removed||e.deathTime>0)continue;
        const hw=e.width/2,dx=Math.max(0,Math.abs(x-e.x)-hw),dz=Math.max(0,Math.abs(z-e.z)-hw),dy=y<e.y?e.y-y:y>e.y+e.height?y-e.y-e.height:0;
        if(dx*dx+dy*dy+dz*dz<=r*r&&(!filter||filter(e)))out.push(e);
      }
      return out;
    },
    raycast:()=>null,
    damage(e,amount,source){
      const k=kinds.get(e.kind);
      if(e.removed||e.deathTime>0||!(amount>0))return false;
      if(!living(k))return k?.hurt?.(e,game,source,amount)!==false&&!!k?.hurt;
      let dealt=amount;const fresh=e.hurtTime===0;
      if(!fresh){const last=lastHurt.get(e)??0;if(amount<=last)return false;dealt=amount-last;}
      if(k?.hurt?.(e,game,source,amount)===false)return false;
      lastHurt.set(e,amount);e.health-=dealt;record.hits.push({entity:e,amount:dealt,source});
      if(fresh){
        e.hurtTime=10;
        const kb=source.knockback;
        if(kb){const len=Math.hypot(kb.x,kb.z);if(len>1e-6){e.vx=e.vx/2+kb.x/len*kb.strength;e.vz=e.vz/2+kb.z/len*kb.strength;if(e.onGround)e.vy=Math.min(8,e.vy/2+kb.strength);}}
      }
      game.events.emit('entityDamaged',{entity:e,amount:dealt,source});
      if(e.health<=0){
        e.deathTime=1;
        for(const s of k?.drops?.(e,game,!!source.byPlayer)??[])record.drops.push(s);
        const xp=typeof k?.xp==='function'?k.xp(e):k?.xp;
        if(source.byPlayer&&xp)record.xp.push(xp);
        game.events.emit('entityDied',{entity:e,source});
      }
      return true;
    },
    dropItem(s){record.drops.push(s);},dropXp(points){record.xp.push(points);},
    count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){
      for(const e of [...list]){
        if(e.removed)continue;
        const k=kinds.get(e.kind);
        e.age++;if(e.hurtTime>0)e.hurtTime--;
        if(e.deathTime>0){if(++e.deathTime>20)e.removed=true;continue;}
        fluids(game,e);
        k?.tick?.(e,game);
        if(e.removed||!k||k.physics==='none')continue;
        if(living(k))stepLiving(game,e,k);
      }
      for(let i=list.length-1;i>=0;i--)if(list[i].removed)list.splice(i,1);
    }
  };
  return service;
}

/** A flat stone world (top at y=60), the player at (0.5, 60, 0.5) and the companion kinds registered on a test entity
 *  service, plus inert stand-ins for the kinds wolves hunt or avoid (sheep, rabbit, cow, skeleton, zombie, creeper). */
export function createHarness(options:{random?:()=>number;mode?:'survival'|'creative'}={}):Harness{
  const game=createFakeGame({random:options.random,mode:options.mode});
  game.flat(60);
  const p=game.player.state;p.x=.5;p.y=60;p.z=.5;
  let entities!:TestEntities;
  const h:Harness={game,spawned:[],hurt:[],particles:[],hits:[],drops:[],xp:[],consumed:0,
    spawn(kind,x,y,z,o){const e=game.entities.spawn(kind,x,y,z,o);if(!e)throw new Error(`cannot spawn ${kind}`);return e;},
    restore(kind,x,y,z,saved){
      const k=entities.kind(kind);if(!k)throw new Error(`cannot restore ${kind}`);
      const data=k.restoreData?k.restoreData(saved.data??{}):{...(saved.data??{})};
      if(!data)throw new Error(`${kind} refused its saved data`);
      const e=entities.create(kind,x,y,z,{data,baby:saved.baby,reason:'restore'},{health:saved.health??k.maxHealth});
      if(!e)throw new Error(`cannot restore ${kind}`);
      return e;
    },
    hold(id,count=1){game.inventory.setSlot(0,id?{id,count}:null);},
    use(e){return !!game.entities.kind(e.kind)?.interact?.(e,game,game.inventory.held());},
    sounds:()=>game.sounds.played.map(s=>s.name),
    run(ticks){game.runTicks(ticks);}};
  entities=createTestEntities(game,h);game.entities=entities;
  game.survival.damage=(amount,source)=>{
    if(game.settings.mode==='creative'&&source.kind!=='void')return 0;
    if(!(amount>0))return 0;
    h.hurt.push({amount,source});game.events.emit('playerDamaged',{amount,source});return amount;
  };
  // Options are copied: callers may reuse one options object (the renderer reads it at once).
  game.render.spawnParticles=(kind,x,y,z,o)=>{h.particles.push({kind,x,y,z,options:o&&{...o,velocity:o.velocity&&{...o.velocity}}});};
  game.inventory.consumeHeld=(count=1)=>{
    if(game.settings.mode==='creative')return;
    const s=game.inventory.slots[0];if(!s)return;
    h.consumed+=count;game.inventory.setSlot(0,s.count>count?{...s,count:s.count-count}:null);
  };
  for(const [kind,category,w,ht] of [['sheep','passive',.9,1.3],['rabbit','passive',.4,.5],['cow','passive',.9,1.4],['skeleton','hostile',.6,1.99],
    ['stray','hostile',.6,1.99],['zombie','hostile',.6,1.95],['creeper','hostile',.6,1.7]] as const)
    game.entities.register({kind,category,width:w,height:ht,maxHealth:20});
  registerCompanionMobs(game);
  return h;
}

/** A random source returning the given values in order, then `rest`. */
export function sequence(values:number[],rest=.5):()=>number{let i=0;return()=>i<values.length?values[i++]:rest;}
/** Fills a box of cells with a block. */
export function fill(h:Harness,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)h.game.world.set(x,y,z,id);
}
/** Runs single ticks until `done` holds (or `max` ticks pass); returns the ticks run. */
export function until(h:Harness,done:()=>boolean,max:number){let n=0;while(n<max&&!done()){h.game.runTicks(1);n++;}return n;}
export const dist=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
