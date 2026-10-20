// Test fixture for the monsters area: a fake game with a small, contract-faithful entity service
// (spawn → init → entitySpawned, damage → hurt hook → death → drops, xp and entityDied) so enderman
// and slime kinds can be exercised without the real entity framework, DOM or WebGL.
import {AIR,SOLID} from '../../../src/games/blockcraft/data/blocks';
import {raycast} from '../../../src/games/blockcraft/engine/physics';
import {registerMonsters} from '../../../src/games/blockcraft/entity/monsters';
import type {DamageSource,Entity,EntityKind,EntityService,ItemStack,SoundName,SpawnReason,Vec3} from '../../../src/games/blockcraft/engine/contracts';
import {createFakeGame,type FakeGame} from './helpers/fake-game';

export interface MonsterHarness{
  game:FakeGame;entities:EntityService&{tick():void};
  dropped:ItemStack[];xp:number[];
  particles:{kind:string;x:number;y:number;z:number;count?:number}[];
  playerHits:{amount:number;source:DamageSource}[];
  navigations:Vec3[];
  /** Replace game.random with a queue of values (falls back to the original generator when empty). */
  queueRandom(...values:number[]):void;
  sounds(name:SoundName):number;
}

export function createHarness(options:{seed?:number;mode?:'survival'|'creative';flat?:number}={}):MonsterHarness{
  const queue:number[]=[];
  let state=options.seed??7;
  const base=()=>{state=(Math.imul(state^state>>>15,0x2c1b3c6d)+0x6d2b79f5)>>>0;return state/0x100000000;};
  const game=createFakeGame({mode:options.mode,random:()=>queue.length?queue.shift()!:base()});
  game.flat(options.flat??60);
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[],dropped:ItemStack[]=[],xp:number[]=[];
  const particles:MonsterHarness['particles']=[],playerHits:MonsterHarness['playerHits']=[],navigations:Vec3[]=[];
  let nextId=1;
  const steer=(e:Entity,x:number,z:number,speed:number)=>{
    const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
    if(d<.5){e.moveX=e.moveZ=0;return true;}
    e.moveX=dx/d*speed;e.moveZ=dz/d*speed;e.yaw=e.headYaw=Math.atan2(-dx,-dz);return false;
  };
  const entities:EntityService&{tick():void}={
    ai:{
      wander(){},
      lookAt(e,x,_y,z){e.headYaw=Math.atan2(-(x-e.x),-(z-e.z));},
      moveToward:(e,x,_y,z,speed)=>steer(e,x,z,speed),
      navigate(e,x,y,z,speed){navigations.push({x,y,z});steer(e,x,z,speed);return true;},
      flee(e,fx,fz,speed){steer(e,e.x*2-fx,e.z*2-fz,speed);},
      canSee(e,x,y,z){
        const ox=e.x,oy=e.y+e.height*.85,oz=e.z,dx=x-ox,dy=y-oy,dz=z-oz,d=Math.hypot(dx,dy,dz);
        return d<1e-6||!raycast(game.world,ox,oy,oz,dx/d,dy/d,dz/d,d,id=>id===AIR||!SOLID[id]);
      },
      isSafe:()=>true,
      stop(e){e.moveX=e.moveZ=0;}
    },
    register(k){kinds.set(k.kind,k);},
    kinds:()=>[...kinds.values()],kind:name=>kinds.get(name),
    spawn(kind,x,y,z,o:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}={}){
      const k=kinds.get(kind);if(!k)return null;
      const reason=o.reason??'event',yaw=o.yaw??0;
      const e:Entity={id:nextId++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw,pitch:0,headYaw:yaw,moveX:0,moveZ:0,jump:false,
        width:k.width,height:k.height,onGround:true,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,
        age:0,hurtTime:0,deathTime:0,removed:false,fire:0,baby:!!o.baby,data:o.data??{}};
      k.init?.(e,game,reason);
      list.push(e);game.events.emit('entitySpawned',{entity:e,reason});
      return e;
    },
    remove(e){e.removed=true;},
    byId:id=>list.find(e=>e.id===id&&!e.removed),
    all:()=>list,
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
      e.health-=amount;e.hurtTime=10;
      game.events.emit('entityDamaged',{entity:e,amount,source});
      if(e.health<=0){
        e.deathTime=1;
        for(const s of k?.drops?.(e,game,!!source.byPlayer)??[])dropped.push(s);
        const points=typeof k?.xp==='function'?k.xp(e):k?.xp;
        if(source.byPlayer&&points)xp.push(points);
        game.events.emit('entityDied',{entity:e,source});
      }
      return true;
    },
    dropItem(s){dropped.push(s);},
    dropXp(points){xp.push(points);},
    count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){
      for(const e of list){
        if(e.removed)continue;e.age++;if(e.hurtTime>0)e.hurtTime--;
        if(e.deathTime>0){if(++e.deathTime>20)e.removed=true;continue;}
        kinds.get(e.kind)?.tick?.(e,game);
      }
    }
  };
  game.entities=entities;
  game.render={...game.render,spawnParticles(kind:string,x:number,y:number,z:number,o?:{count?:number}){particles.push({kind,x,y,z,count:o?.count});}} as typeof game.render;
  game.survival={...game.survival,damage(amount:number,source:DamageSource){playerHits.push({amount,source});return amount;}};
  registerMonsters(game);
  return{
    game,entities,dropped,xp,particles,playerHits,navigations,
    queueRandom(...values){queue.push(...values);},
    sounds:name=>game.sounds.played.filter(s=>s.name===name).length
  };
}

/** Points the player's view from its eye at a world point. */
export function lookAt(game:FakeGame,x:number,y:number,z:number){
  const p=game.player.state,eye=game.player.eye(),dx=x-eye.x,dy=y-eye.y,dz=z-eye.z;
  p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.atan2(dy,Math.hypot(dx,dz));
}
