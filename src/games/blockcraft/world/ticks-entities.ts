// The world simulation's entity kinds (registered by registerWorldEntities, before init()):
//  - 'primed_tnt' (vanilla PrimedTnt): data {fuse, byPlayer}; 0.98 box, gravity 0.04 blocks/tick², drag 0.98, bounces
//    on the ground; drawn as the TNT block (the entity renderer flashes it white from data.fuse); explodes with power 4
//    at 1/16 of its height when the fuse runs out, attributed to the player when they lit it.
//  - 'falling_block' (vanilla FallingBlockEntity): data {block, time}; same physics; on landing it becomes the block when
//    the cell is replaceable, the block below is not free and the block may stay there, else it drops its item. After 600
//    ticks in the air (or 100 outside the world) it drops its item.
import {AIR,BLOCK_COUNT,LIQUID,REPLACEABLE,blockDef} from '../data/blocks';
import {itemDef,stack} from '../data/items';
import {CH} from '../engine/constants';
import {canSurvive} from '../engine/support';
import type {Entity,EntityKind,Game} from '../engine/contracts';
import {FIRE,TNT} from './fire';

export const TNT_FUSE=80;
const PHYSICS={gravity:16,drag:.98,stepHeight:0};

/** Per-game hooks set by the tick service: how many explosions primed TNT may still start this tick. */
export const EXPLOSION_BUDGET=new WeakMap<Game,{take():boolean}>();

/** Space a falling block may fall into (FallingBlock.isFree): air, fire, liquids and replaceable plants. */
export const isFree=(id:number)=>id===AIR||id===FIRE||id>0&&(LIQUID[id]!==0||REPLACEABLE[id]===1);
const validBlock=(id:unknown):id is number=>typeof id==='number'&&Number.isInteger(id)&&id>0&&id<BLOCK_COUNT&&!LIQUID[id];

/** Drops the item of a block (not its loot: sand stays sand) at a point. */
export function dropBlockItem(game:Game,id:number,x:number,y:number,z:number){
  const item=blockDef(id).item;
  if(item&&itemDef(item))game.entities.dropItem(stack(item),x,y,z);
}

/** Puts a falling block down where the entity is, or breaks it into its item. */
export function landFallingBlock(game:Game,id:number,x:number,y:number,z:number):boolean{
  const w=game.world,bx=Math.floor(x),by=Math.floor(y+.01),bz=Math.floor(z);
  const cell=w.get(bx,by,bz);
  if(by>=0&&by<CH&&cell>=0&&(cell===AIR||REPLACEABLE[cell]===1)&&!isFree(w.get(bx,by-1,bz))&&canSurvive(w,id,bx,by,bz)&&w.set(bx,by,bz,id,'tick'))return true;
  dropBlockItem(game,id,x,y+.5,z);
  return false;
}

function tntTick(e:Entity,game:Game){
  const raw=e.data.fuse,fuse=(typeof raw==='number'&&Number.isFinite(raw)?Math.floor(raw):TNT_FUSE)-1;
  if(fuse>0){
    e.data.fuse=fuse;
    game.render.spawnParticles('smoke',e.x,e.y+e.height+.1,e.z,{count:1,spread:.05});
    return;
  }
  e.data.fuse=0;
  // Chain reactions spread their explosions over several ticks instead of freezing one.
  const budget=EXPLOSION_BUDGET.get(game);
  if(budget&&!budget.take())return;
  game.entities.remove(e);
  game.ticks.explode(e.x,e.y+e.height*.0625,e.z,4,e,e.data.byPlayer===true);
}

function fallingTick(e:Entity,game:Game){
  const id=e.data.block;
  if(!validBlock(id)){game.entities.remove(e);return;}
  const raw=e.data.time,time=(typeof raw==='number'&&Number.isInteger(raw)?raw:0)+1;
  e.data.time=time;
  if(!e.onGround){
    if(time>100&&(e.y<-64||e.y>=CH+64)||time>600){dropBlockItem(game,id,e.x,e.y+.5,e.z);game.entities.remove(e);}
    return;
  }
  landFallingBlock(game,id,e.x,e.y,e.z);
  game.entities.remove(e);
}

export const PRIMED_TNT_KIND:EntityKind={
  kind:'primed_tnt',category:'misc',width:.98,height:.98,maxHealth:1,render:'block',block:()=>TNT,physics:PHYSICS,pickable:false,
  init(e){
    const f=e.data.fuse;
    if(typeof f!=='number'||!Number.isFinite(f)||f<0)e.data.fuse=TNT_FUSE;
    e.data.byPlayer=e.data.byPlayer===true;
  },
  tick:tntTick,
  restoreData(d){
    const fuse=d.fuse;
    if(typeof fuse!=='number'||!Number.isInteger(fuse)||fuse<0||fuse>32767)return null;
    return{fuse,byPlayer:d.byPlayer===true};
  }
};
export const FALLING_BLOCK_KIND:EntityKind={
  kind:'falling_block',category:'misc',width:.98,height:.98,maxHealth:1,render:'block',
  block:e=>validBlock(e.data.block)?e.data.block:AIR,physics:PHYSICS,pickable:false,
  init(e){if(typeof e.data.time!=='number')e.data.time=0;},
  tick:fallingTick,
  restoreData(d){
    if(!validBlock(d.block))return null;
    const t=d.time;
    return{block:d.block,time:typeof t==='number'&&Number.isInteger(t)&&t>=0&&t<=600?t:0};
  }
};

/** Registers 'primed_tnt' and 'falling_block' (engine/game.ts calls this before init()). */
export function registerWorldEntities(game:Game):void{
  game.entities.register(PRIMED_TNT_KIND);
  game.entities.register(FALLING_BLOCK_KIND);
}
