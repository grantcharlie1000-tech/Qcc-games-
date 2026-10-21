// Test harness for the hostile mobs and projectiles: the fake game with a small, deterministic entity service that
// follows the entity framework's rules (entity/entities.ts): living motion after vanilla LivingEntity.travel (intent =
// steady ground speed, ground acceleration s², friction 0.546, air 0.02 s, water 0.8 drag and slow sinking, aquatic
// mobs swimming freely with 0.9 drag, jumps 0.42 blocks/tick, gravity after the move), 'none' physics kinds moving
// themselves, damage with invulnerability frames (only a bigger hit lands, for the difference), zero-damage hits
// refused, the kind's hurt hook, knockback and loot. Steering is straight-line (no path-finding). Survival, explosions,
// particles, effects and held-item wear are recorded. Not a test file itself (vitest only runs *.test.ts).
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {boxCollides,moveBody,raycast} from '../../../src/games/blockcraft/engine/physics';
import {AIR,SOLID,isLava,isWater} from '../../../src/games/blockcraft/data/blocks';
import {registerHostileMobs} from '../../../src/games/blockcraft/entity/hostile';
import type {DamageSource,EffectName,Entity,EntityAI,EntityKind,EntityService,ItemStack,ParticleKind,ParticleOptions,
  SpawnReason,Vec3} from '../../../src/games/blockcraft/engine/contracts';

export interface Harness{
  game:FakeGame;
  spawned:{entity:Entity;reason:SpawnReason}[];
  /** survival.damage calls (the fake player takes every hit; creative players none but void). */
  hurt:{amount:number;source:DamageSource}[];
  effects:{name:EffectName;seconds:number;level?:number}[];
  ignited:number[];
  explosions:{x:number;y:number;z:number;power:number;source?:Entity|null;byPlayer?:boolean;fire?:boolean}[];
  particles:{kind:ParticleKind;x:number;y:number;z:number;options?:ParticleOptions}[];
  /** Entity hits that landed. */
  hits:{entity:Entity;amount:number;source:DamageSource}[];
  drops:ItemStack[];
  wear:number[];
  teleports:Vec3[];
  /** Spawns a registered kind at a feet position. */
  spawn(kind:string,x:number,y:number,z:number,options?:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}):Entity;
  setUsing(item:string|null):void;
  sounds():string[];
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
function stepLiving(game:FakeGame,e:Entity,aquatic:boolean){
  let ux=e.vx*TICK,uy=e.vy*TICK,uz=e.vz*TICK;
  const g=.08;
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

export function createTestEntities(game:FakeGame,record:Pick<Harness,'spawned'|'hits'|'drops'>):EntityService{
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[],lastHurt=new WeakMap<Entity,number>();
  let nextId=1;
  const ai:EntityAI={
    wander(){},
    lookAt(e,x,y,z){const dx=x-e.x,dz=z-e.z;e.headYaw=Math.atan2(-dx,-dz);e.pitch=Math.atan2(y-(e.y+e.height*.85),Math.hypot(dx,dz));},
    moveToward(e,x,_y,z,speed){
      const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
      if(d<.5){ai.stop(e);return true;}
      e.moveX=dx/d*speed;e.moveZ=dz/d*speed;e.yaw=e.headYaw=Math.atan2(-dx,-dz);
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
  function spawn(kind:string,x:number,y:number,z:number,options:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}={}):Entity|null{
    const k=kinds.get(kind);if(!k)return null;
    const reason=options.reason??'event',yaw=options.yaw??0;
    const e:Entity={id:nextId++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw,pitch:0,headYaw:yaw,moveX:0,moveZ:0,jump:false,width:k.width,height:k.height,
      onGround:false,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,age:0,hurtTime:0,deathTime:0,
      removed:false,fire:0,baby:!!options.baby,data:options.data??{}};
    k.init?.(e,game,reason);
    if(e.removed)return null;
    list.push(e);record.spawned.push({entity:e,reason});
    game.events.emit('entitySpawned',{entity:e,reason});
    return e;
  }
  const service:EntityService={
    ai,register(k){kinds.set(k.kind,k);},kinds:()=>[...kinds.values()],kind:n=>kinds.get(n),spawn,
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
      if(e.health<=0){e.deathTime=1;for(const s of k?.drops?.(e,game,!!source.byPlayer)??[])record.drops.push(s);}
      return true;
    },
    dropItem(s){record.drops.push(s);},dropXp(){},
    count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){
      for(const e of [...list]){
        if(e.removed)continue;
        const k=kinds.get(e.kind);
        e.age++;if(e.hurtTime>0)e.hurtTime--;
        if(e.deathTime>0){if(++e.deathTime>20)e.removed=true;continue;}
        fluids(game,e);
        if(living(k)&&e.fire>0)e.fire=e.inWater?0:e.fire-1;
        k?.tick?.(e,game);
        if(e.removed||k?.physics==='none')continue;
        if(living(k))stepLiving(game,e,!!k?.aquatic);
      }
      for(let i=list.length-1;i>=0;i--)if(list[i].removed)list.splice(i,1);
    }
  };
  return service;
}

/** A flat stone world (top at y=60), the hostile kinds registered on a test entity service, and a stub chicken kind. */
export function createHarness(options:{random?:()=>number;mode?:'survival'|'creative'}={}):Harness{
  const game=createFakeGame({random:options.random,mode:options.mode});
  game.flat(60);
  const h:Harness={game,spawned:[],hurt:[],effects:[],ignited:[],explosions:[],particles:[],hits:[],drops:[],wear:[],teleports:[],
    spawn(kind,x,y,z,o){const e=game.entities.spawn(kind,x,y,z,o);if(!e)throw new Error(`cannot spawn ${kind}`);return e;},
    setUsing(item){(game.interaction as {using:unknown}).using=item?{item,progress:0}:null;},
    sounds:()=>game.sounds.played.map(s=>s.name)};
  game.entities=createTestEntities(game,h);
  game.survival.damage=(amount,source)=>{
    if(game.settings.mode==='creative'&&source.kind!=='void')return 0;
    if(!(amount>0))return 0;
    h.hurt.push({amount,source});return amount;
  };
  game.survival.addEffect=(name,seconds,level)=>{h.effects.push({name,seconds,level});};
  game.survival.ignite=seconds=>{h.ignited.push(seconds);};
  game.ticks.explode=(x,y,z,power,source,byPlayer,fire)=>{h.explosions.push({x,y,z,power,source,byPlayer,fire});};
  game.render.spawnParticles=(kind,x,y,z,options)=>{h.particles.push({kind,x,y,z,options});};
  game.inventory.damageHeld=(amount=1)=>{h.wear.push(amount);};
  const teleport=game.player.teleport;
  game.player.teleport=(x,y,z)=>{h.teleports.push({x,y,z});teleport(x,y,z);};
  game.entities.register({kind:'chicken',category:'passive',width:.4,height:.7,maxHealth:4});
  game.entities.register({kind:'wolf',category:'passive',width:.6,height:.85,maxHealth:8});
  registerHostileMobs(game);
  return h;
}

/** Midnight with the daylight cycle frozen (monsters active, no sun). */
export function night(game:FakeGame){game.settings.daylightCycle=false;game.time.dayTime=18000;game.runTicks(1,[]);}
/** Noon with the daylight cycle frozen. */
export function noon(game:FakeGame){game.settings.daylightCycle=false;game.time.dayTime=6000;game.runTicks(1,[]);}
/** A random source returning the given values in order, then `rest`. */
export function sequence(values:number[],rest=.5):()=>number{let i=0;return()=>i<values.length?values[i++]:rest;}
/** Fills a box of cells with a block. */
export function fill(h:Harness,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,id:number){
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)h.game.world.set(x,y,z,id);
}
/** Runs single ticks until `done` holds (or `max` ticks pass); returns the ticks run. */
export function until(h:Harness,done:()=>boolean,max:number){let n=0;while(n<max&&!done()){h.game.runTicks(1);n++;}return n;}
