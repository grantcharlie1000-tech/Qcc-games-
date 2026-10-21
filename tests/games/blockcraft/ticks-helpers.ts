// Test harness for the world simulation (world/ticks*.ts): the fake game with a flat world, a small
// physics-capable entity service, recorded drops / damage, and the real block tick service.
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {moveBody} from '../../../src/games/blockcraft/engine/physics';
import {BLOCKS,blockDef,B} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import {CHUNK_VOLUME} from '../../../src/games/blockcraft/engine/constants';
import {createBlockTicks,registerWorldEntities,type BlockTicks} from '../../../src/games/blockcraft/world/ticks';
import type {ChangeCause,DamageSource,Entity,EntityKind,EntityService,ItemStack,Vec3} from '../../../src/games/blockcraft/engine/contracts';

export interface Drop{stack:ItemStack;x:number;y:number;z:number}
export interface TickGame extends FakeGame{
  ticks:BlockTicks;
  /** Items passed to entities.dropItem. */
  drops:Drop[];
  /** Calls to interaction.blockDrops (id, tool, cause). */
  dropCalls:{id:number;tool:ItemStack|null;cause?:ChangeCause}[];
  /** Calls to survival.damage. */
  playerHits:{amount:number;source:DamageSource}[];
  /** Calls to player.push. */
  pushes:Vec3[];
  /** Calls to entities.damage. */
  entityHits:{entity:Entity;amount:number;source:DamageSource}[];
  /** Calls to terrain.growTree. */
  trees:{x:number;y:number;z:number;kind:string}[];
  /** Sets every loaded chunk's light to sky<<4|block. */
  light(sky?:number,block?:number):void;
  /** Runs the entities and the block ticks (in the engine's order) n times. */
  run(n:number):void;
  get(x:number,y:number,z:number):string;
  set(x:number,y:number,z:number,name:string|number):void;
}

/** A DOM-free entity service with simple vanilla-like physics, enough for falling blocks, primed TNT and targets. */
export function createTestEntities(game:FakeGame,hits:{entity:Entity;amount:number;source:DamageSource}[],drops:Drop[]):EntityService{
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[];let next=1;
  const service:EntityService={
    ai:game.entities.ai,
    register(k){kinds.set(k.kind,k);},kinds:()=>[...kinds.values()],kind:n=>kinds.get(n),
    spawn(kind,x,y,z,o={}){
      const k=kinds.get(kind);if(!k)return null;
      const e:Entity={id:next++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw:o.yaw??0,pitch:0,headYaw:0,moveX:0,moveZ:0,jump:false,width:k.width,height:k.height,
        onGround:false,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,age:0,hurtTime:0,deathTime:0,removed:false,fire:0,
        baby:!!o.baby,data:o.data??{}};
      k.init?.(e,game,o.reason??'event');list.push(e);return e;
    },
    remove(e){e.removed=true;},byId:id=>list.find(e=>e.id===id&&!e.removed),all:()=>list.filter(e=>!e.removed),
    near(x,y,z,r,filter,out=[]){
      out.length=0;
      for(const e of list)if(!e.removed&&Math.hypot(e.x-x,e.y+e.height/2-y,e.z-z)<=r+e.width&&(!filter||filter(e)))out.push(e);
      return out;
    },
    raycast:()=>null,
    damage(e,amount,source){hits.push({entity:e,amount,source});if(e.removed)return false;e.health-=amount;if(e.health<=0)e.removed=true;return true;},
    dropItem(s,x,y,z){drops.push({stack:{...s},x,y,z});},
    dropXp(){},count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){
      for(const e of [...list]){
        if(e.removed)continue;e.age++;
        const k=kinds.get(e.kind)!;k.tick?.(e,game);
        if(e.removed||k.physics==='none')continue;
        const p=k.physics??{},g=p.gravity??32,drag=p.drag??.98;
        e.vy-=g/20;moveBody(game.world,e,e.width/2,e.height,1/20);
        e.vx*=drag;e.vy*=drag;e.vz*=drag;
        if(e.onGround){e.vx*=.7;e.vz*=.7;if(e.vy<0)e.vy*=-.5;}
      }
      for(let i=list.length-1;i>=0;i--)if(list[i].removed)list.splice(i,1);
    },
    reset(){list.length=0;}
  };
  return service;
}

/** Flat world of `height` blocks (stone by default) over (2r+1)² chunks (r = 2: chunks -1..1 tick), the real tick service and test doubles. */
export function createTickGame(o:{height?:number;block?:number;r?:number;seed?:number;randomTickSpeed?:number;drops?:(id:number)=>ItemStack[]}={}):TickGame{
  const game=createFakeGame({seed:o.seed??7}) as TickGame;
  game.flat(o.height??60,o.block??B.stone,o.r??2);
  game.drops=[];game.dropCalls=[];game.playerHits=[];game.pushes=[];game.entityHits=[];game.trees=[];
  const dropFn=o.drops??((id:number)=>{const item=blockDef(id).item;return item?[stack(item)]:[];});
  game.interaction={...game.interaction,blockDrops(id,tool,cause){game.dropCalls.push({id,tool,cause});return dropFn(id);}};
  game.survival={...game.survival,damage(amount,source){game.playerHits.push({amount,source});return amount;}};
  const push=game.player.push;game.player={...game.player,push(vx,vy,vz){game.pushes.push({x:vx,y:vy,z:vz});push(vx,vy,vz);}};
  game.terrain={...game.terrain,growTree(_w,x,y,z,kind){game.trees.push({x,y,z,kind});return true;}};
  game.entities=createTestEntities(game,game.entityHits,game.drops);
  game.ticks=createBlockTicks(game,{randomTickSpeed:o.randomTickSpeed});
  registerWorldEntities(game);
  game.ticks.init?.();
  game.light=(sky=15,block=0)=>{for(const c of game.world.chunks.values())c.light=new Uint8Array(CHUNK_VOLUME).fill(sky<<4|block);};
  game.run=n=>game.runTicks(n,[game.entities,game.ticks]);
  game.get=(x,y,z)=>{const id=game.world.get(x,y,z);return id<0?'unloaded':blockDef(id).name;};
  game.set=(x,y,z,name)=>{game.world.set(x,y,z,typeof name==='number'?name:idOf(name),'player');};
  return game;
}
const BLOCK_NAMES=new Map(BLOCKS.map(b=>[b.name,b.id]));
export const idOf=(name:string)=>{const d=BLOCK_NAMES.get(name);if(d===undefined)throw new Error(`Unknown block ${name}`);return d;};
