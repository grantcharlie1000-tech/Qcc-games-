// Test harness for the hostile mobs and projectiles: the fake game with a small, deterministic entity
// service (spawn, near, damage with the kind hooks, simple walking physics) and recording survival,
// explosion, particle and inventory calls. Not a test file itself (vitest only runs *.test.ts).
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {moveBody,raycast} from '../../../src/games/blockcraft/engine/physics';
import {AIR,SOLID,isLava,isWater} from '../../../src/games/blockcraft/data/blocks';
import {registerHostileMobs} from '../../../src/games/blockcraft/entity/hostile';
import type {DamageSource,EffectName,Entity,EntityAI,EntityKind,EntityService,ItemStack,ParticleKind,ParticleOptions,
  SpawnReason,Vec3} from '../../../src/games/blockcraft/engine/contracts';

export interface Harness{
  game:FakeGame;
  spawned:{entity:Entity;reason:SpawnReason}[];
  /** survival.damage calls (the fake player takes every hit). */
  hurt:{amount:number;source:DamageSource}[];
  effects:{name:EffectName;seconds:number;level?:number}[];
  explosions:{x:number;y:number;z:number;power:number;source?:Entity|null;byPlayer?:boolean;fire?:boolean}[];
  particles:{kind:ParticleKind;x:number;y:number;z:number;options?:ParticleOptions}[];
  hits:{entity:Entity;amount:number;source:DamageSource}[];
  drops:ItemStack[];
  wear:number[];
  teleports:Vec3[];
  /** Spawns a registered kind at a feet position. */
  spawn(kind:string,x:number,y:number,z:number,options?:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}):Entity;
  setUsing(item:string|null):void;
  sounds():string[];
}

export function createTestEntities(game:FakeGame,record:Pick<Harness,'spawned'|'hits'|'drops'>):EntityService{
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[];
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
    list.push(e);record.spawned.push({entity:e,reason});
    game.events.emit('entitySpawned',{entity:e,reason});
    return e;
  }
  const service:EntityService={
    ai,register(k){kinds.set(k.kind,k);},kinds:()=>[...kinds.values()],kind:n=>kinds.get(n),spawn,
    remove(e){e.removed=true;},all:()=>list,byId:id=>list.find(e=>e.id===id&&!e.removed),
    near(x,y,z,r,filter,out=[]){
      out.length=0;
      for(const e of list)if(!e.removed&&Math.hypot(e.x-x,e.y+e.height/2-y,e.z-z)<=r+e.width&&(!filter||filter(e)))out.push(e);
      return out;
    },
    raycast:()=>null,
    damage(e,amount,source){
      if(e.removed||e.hurtTime>0||e.deathTime>0)return false;
      const k=kinds.get(e.kind);
      if(k?.hurt?.(e,game,source,amount)===false)return false;
      e.health-=amount;e.hurtTime=10;record.hits.push({entity:e,amount,source});
      if(source.knockback){const kb=source.knockback,len=Math.hypot(kb.x,kb.z)||1;e.vx+=kb.x/len*kb.strength;e.vz+=kb.z/len*kb.strength;}
      if(e.health<=0){e.deathTime=1;for(const s of k?.drops?.(e,game,!!source.byPlayer)??[])record.drops.push(s);}
      return true;
    },
    dropItem(s){record.drops.push(s);},dropXp(){},
    count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){
      for(const e of [...list]){
        if(e.removed)continue;
        e.age++;if(e.hurtTime>0)e.hurtTime--;if(e.fire>0)e.fire--;
        if(e.deathTime>0){if(++e.deathTime>20)e.removed=true;continue;}
        const k=kinds.get(e.kind);
        k?.tick?.(e,game);
        if(e.removed||k?.physics==='none')continue;
        const w=game.world,feet=w.get(Math.floor(e.x),Math.floor(e.y+.1),Math.floor(e.z));
        e.inWater=feet>0&&isWater(feet);e.inLava=feet>0&&isLava(feet);
        const control=e.onGround||e.inWater?.5:.1;
        e.vx+=(e.moveX-e.vx)*control;e.vz+=(e.moveZ-e.vz)*control;
        if(e.jump&&(e.onGround||e.inWater))e.vy=e.inWater?3:8.4;e.jump=false;
        if(!(k?.aquatic&&e.inWater))e.vy-=1.6;
        if(e.inWater)e.vy*=.8;
        const hit=moveBody(w,e,e.width/2,e.height,1/20,undefined,.6);
        e.collidedH=hit.hitX||hit.hitZ;e.collidedV=hit.hitY;
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
  const h:Harness={game,spawned:[],hurt:[],effects:[],explosions:[],particles:[],hits:[],drops:[],wear:[],teleports:[],
    spawn(kind,x,y,z,o){const e=game.entities.spawn(kind,x,y,z,o);if(!e)throw new Error(`cannot spawn ${kind}`);return e;},
    setUsing(item){(game.interaction as {using:unknown}).using=item?{item,progress:0}:null;},
    sounds:()=>game.sounds.played.map(s=>s.name)};
  game.entities=createTestEntities(game,h);
  game.survival.damage=(amount,source)=>{
    if(game.settings.mode==='creative'&&source.kind!=='void')return 0;
    h.hurt.push({amount,source});return amount;
  };
  game.survival.addEffect=(name,seconds,level)=>{h.effects.push({name,seconds,level});};
  game.ticks.explode=(x,y,z,power,source,byPlayer,fire)=>{h.explosions.push({x,y,z,power,source,byPlayer,fire});};
  game.render.spawnParticles=(kind,x,y,z,options)=>{h.particles.push({kind,x,y,z,options});};
  game.inventory.damageHeld=(amount=1)=>{h.wear.push(amount);};
  const teleport=game.player.teleport;
  game.player.teleport=(x,y,z)=>{h.teleports.push({x,y,z});teleport(x,y,z);};
  game.entities.register({kind:'chicken',category:'passive',width:.4,height:.7,maxHealth:4});
  registerHostileMobs(game);
  return h;
}

/** Midnight with the daylight cycle frozen (monsters active, no sun). */
export function night(game:FakeGame){game.settings.daylightCycle=false;game.time.dayTime=18000;game.runTicks(1,[]);}
/** Noon with the daylight cycle frozen. */
export function noon(game:FakeGame){game.settings.daylightCycle=false;game.time.dayTime=6000;game.runTicks(1,[]);}
/** A random source returning the given values in order, then `rest`. */
export function sequence(values:number[],rest=.5):()=>number{let i=0;return()=>i<values.length?values[i++]:rest;}
