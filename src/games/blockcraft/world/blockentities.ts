// Block entities: chest and barrel storage (27 slots) and furnaces that smelt at 20 TPS.
// Lifecycle follows `blockChanged`: a block whose def has `blockEntity` gets an empty entity when placed, keeps it across
// state changes of the same family (furnace ⇄ furnace_lit, facings) and while its chunk is unloaded, and drops its
// contents (vanilla scatter, stacks split into 10-30) plus a furnace's stored experience when replaced by another family
// (broken, exploded, overwritten). Furnaces follow vanilla AbstractFurnaceBlockEntity.serverTick: 200 ticks per item,
// fuel is consumed only when the input can be smelted into the output slot, unlit progress falls back 2 ticks per tick,
// and the block swaps between lit and unlit states keeping its facing. Only furnaces in loaded chunks tick.
// Entities persist by position; empty ones are not saved (get() recreates them on demand).
import {CH,CS,chunkKey} from '../engine/constants';
import {FACING_VECTOR,blockDef,stateFor} from '../data/blocks';
import {itemDef,maxStack,parseStack,type ItemStack} from '../data/items';
import type {BlockEntity,BlockEntityService,ChestEntity,FurnaceEntity,Game,SmeltResult} from '../engine/contracts';

export const CHEST_SLOTS=27;
/** Ticks to smelt one item (10 s). */
export const COOK_TICKS=200;
const SAVE_VERSION=1;
/** Lit furnaces within this distance of the player crackle and smoke now and then. */
const AMBIENT_RANGE=16;
/** Vanilla scatter for container drops: item entity width 0.25, triangle(0.2, 0.11485) blocks/tick upward. */
const DROP_SPREAD=.11485*20,DROP_LIFT=.2*20;
const MAX_COORD=30_000_000;
/** Longest burn accepted from a save, seconds (a lava bucket burns 1000). */
const MAX_BURN=100_000;

interface Holder{readonly x:number;readonly y:number;readonly z:number;readonly key:string;readonly chunk:number;entity:BlockEntity;
  /** Furnace input id seen at the end of the previous tick: a different item resets cooking (vanilla setItem). */
  lastInput:string|null}

const posKey=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const emptyChest=():ChestEntity=>({kind:'chest',items:new Array(CHEST_SLOTS).fill(null)});
const emptyFurnace=():FurnaceEntity=>({kind:'furnace',input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0});
const emptyEntity=(kind:BlockEntity['kind']):BlockEntity=>kind==='chest'?emptyChest():emptyFurnace();
const ticksOf=(seconds:number)=>Number.isFinite(seconds)&&seconds>0?Math.round(seconds*20):0;
const copy=(s:ItemStack|null)=>s&&{...s};

function isEmpty(e:BlockEntity){
  return e.kind==='chest'?e.items.every(s=>!s):!e.input&&!e.fuel&&!e.output&&!e.burn&&!e.cook&&!e.xp;
}
function contents(e:BlockEntity):(ItemStack|null)[]{return e.kind==='chest'?e.items:[e.input,e.fuel,e.output];}
/** A finite number in [0, max], else 0. */
function seconds(value:unknown,max:number){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?value:0;}
const parseSlot=(value:unknown)=>value===null||value===undefined?null:parseStack(value);
/** Validates one saved entity; invalid stacks become empty, invalid numbers 0. */
function parseEntity(value:unknown):BlockEntity|null{
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(v.kind==='chest'){
    if(!Array.isArray(v.items))return null;
    const chest=emptyChest();for(let i=0;i<CHEST_SLOTS;i++)chest.items[i]=parseSlot(v.items[i]);
    return chest;
  }
  if(v.kind==='furnace'){
    return{kind:'furnace',input:parseSlot(v.input),fuel:parseSlot(v.fuel),output:parseSlot(v.output),burn:seconds(v.burn,MAX_BURN),
      burnTotal:seconds(v.burnTotal,MAX_BURN),cook:seconds(v.cook,COOK_TICKS/20),xp:seconds(v.xp,1_000_000)};
  }
  return null;
}
/** Vanilla AbstractFurnaceBlockEntity.canBurn: the result fits the output slot. */
function canBurn(f:FurnaceEntity,recipe:SmeltResult|null){
  if(!f.input||!recipe)return false;
  const out=f.output,result=recipe.result;
  if(!out)return true;
  if(out.id!==result.id||(out.damage??0)!==(result.damage??0))return false;
  return out.count+result.count<=Math.min(64,maxStack(out.id));
}

export function createBlockEntities(game:Game):BlockEntityService{
  const holders=new Map<string,Holder>();
  const byChunk=new Map<number,Set<Holder>>();
  const furnaces=new Set<Holder>();
  let unsubscribe:(()=>void)[]=[];

  function add(x:number,y:number,z:number,entity:BlockEntity):Holder{
    const key=posKey(x,y,z),old=holders.get(key);if(old)discard(old);
    const holder:Holder={x,y,z,key,chunk:chunkKey(Math.floor(x/CS),Math.floor(z/CS)),entity,
      lastInput:entity.kind==='furnace'?entity.input?.id??null:null};
    holders.set(key,holder);
    let set=byChunk.get(holder.chunk);if(!set){set=new Set();byChunk.set(holder.chunk,set);}set.add(holder);
    if(entity.kind==='furnace')furnaces.add(holder);
    return holder;
  }
  /** Forgets an entity without dropping anything. */
  function discard(h:Holder){
    if(holders.get(h.key)===h)holders.delete(h.key);
    furnaces.delete(h);
    const set=byChunk.get(h.chunk);if(set){set.delete(h);if(!set.size)byChunk.delete(h.chunk);}
  }
  function clear(){holders.clear();byChunk.clear();furnaces.clear();}
  /** Vanilla Containers.dropContents: random spot inside the block, stacks split into 10..30, small upward toss. */
  function dropContents(h:Holder){
    const r=()=>game.random(),e=h.entity;
    for(const slot of contents(e)){
      if(!slot)continue;
      let left=slot.count;
      while(left>0){
        const n=Math.min(left,10+Math.floor(r()*21));left-=n;
        game.entities.dropItem({...slot,count:n},h.x+.125+r()*.75,h.y+r()*.75,h.z+.125+r()*.75,
          {x:DROP_SPREAD*(r()-r()),y:DROP_LIFT+DROP_SPREAD*(r()-r()),z:DROP_SPREAD*(r()-r())});
      }
    }
    if(e.kind==='furnace'&&e.xp>0){
      let points=Math.floor(e.xp);if(r()<e.xp-points)points++;
      if(points>0)game.entities.dropXp(points,h.x+.5,h.y+.5,h.z+.5);
    }
  }
  /** The entity stored at a loaded position must match the block there; a mismatch is stale data and is forgotten. */
  function validate(h:Holder):boolean{
    const id=game.world.get(h.x,h.y,h.z);
    if(id<0)return true;
    if(blockDef(id).blockEntity===h.entity.kind)return true;
    discard(h);return false;
  }

  function onBlockChanged({x,y,z,from,to,cause}:{x:number;y:number;z:number;from:number;to:number;cause:string}){
    const fromDef=blockDef(from),toDef=blockDef(to);
    if(fromDef.family===toDef.family&&fromDef.blockEntity===toDef.blockEntity)return;// furnace ⇄ furnace_lit, facings
    const old=holders.get(posKey(x,y,z));
    if(old){discard(old);if(fromDef.blockEntity===old.entity.kind&&cause!=='restore')dropContents(old);}
    if(toDef.blockEntity)add(x,y,z,emptyEntity(toDef.blockEntity));
  }
  function onChunkLoaded({cx,cz}:{cx:number;cz:number}){
    const set=byChunk.get(chunkKey(cx,cz));if(!set)return;
    for(const h of [...set])validate(h);
  }

  // ---- Furnaces ---------------------------------------------------------------------------------
  function tickFurnace(h:Holder,f:FurnaceEntity){
    const crafting=game.crafting;
    let burn=ticksOf(f.burn),burnTotal=ticksOf(f.burnTotal),cook=Math.min(COOK_TICKS,ticksOf(f.cook));
    const inputId=f.input?.id??null;
    if(inputId!==h.lastInput)cook=0;
    if(burn>0)burn--;
    const hasInput=!!f.input,fuel=f.fuel;
    if(burn>0||fuel&&hasInput){
      const recipe=f.input?crafting.smelt(f.input.id):null;
      if(burn<=0&&fuel&&canBurn(f,recipe)){
        burn=ticksOf(crafting.fuelSeconds(fuel.id));burnTotal=burn;
        if(burn>0){
          if(fuel.count>1)f.fuel={...fuel,count:fuel.count-1};
          else{const rest=itemDef(fuel.id)?.remainder;f.fuel=rest?{id:rest,count:1}:null;}
        }
      }
      if(burn>0&&recipe&&canBurn(f,recipe)){
        if(++cook>=COOK_TICKS){
          cook=0;
          const input=f.input!;
          f.output=f.output?{...f.output,count:f.output.count+recipe.result.count}:{...recipe.result};
          f.input=input.count>1?{...input,count:input.count-1}:null;
          f.xp=Math.round((f.xp+recipe.xp)*1e6)/1e6;
        }
      }else cook=0;
    }else if(cook>0)cook=Math.max(0,cook-2);
    f.burn=burn/20;f.burnTotal=burnTotal/20;f.cook=cook/20;
    h.lastInput=f.input?.id??null;
    syncLit(h,burn>0);
  }
  /** Swaps furnace ⇄ furnace_lit (same facing) when the block does not show the burning state. */
  function syncLit(h:Holder,lit:boolean){
    const id=game.world.get(h.x,h.y,h.z);if(id<0)return;
    const def=blockDef(id);
    if(def.family!=='furnace'||!!def.lit===lit)return;
    const next=stateFor('furnace',{facing:def.facing,lit});
    if(next)game.world.set(h.x,h.y,h.z,next.id,'tick');
  }
  /** Client-side vanilla animateTick for lit furnaces near the player: smoke and flame at the front, crackle sometimes. */
  function ambient(h:Holder){
    const p=game.player.state,dx=h.x+.5-p.x,dy=h.y+.5-p.y,dz=h.z+.5-p.z;
    if(dx*dx+dy*dy+dz*dz>AMBIENT_RANGE*AMBIENT_RANGE||game.random()>=.1)return;
    const def=blockDef(game.world.get(h.x,h.y,h.z));if(!def.lit||!def.facing)return;
    const [fx,fz]=FACING_VECTOR[def.facing],side=game.random()*.6-.3;
    const x=h.x+.5+fx*.52+(fx?0:side),y=h.y+game.random()*6/16,z=h.z+.5+fz*.52+(fz?0:side);
    game.render.spawnParticles('smoke',x,y,z,{count:1,spread:.02});
    game.render.spawnParticles('flame',x,y,z,{count:1,spread:.02});
    if(game.random()<.1)game.sounds.play('furnace',{x:h.x+.5,y:h.y+.5,z:h.z+.5},{volume:1,pitch:1});
  }

  return{
    init(){
      unsubscribe.push(game.events.on('blockChanged',onBlockChanged),game.events.on('chunkLoaded',onChunkLoaded));
    },
    get(x,y,z){
      if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z))return undefined;
      const h=holders.get(posKey(x,y,z));
      if(h&&validate(h))return h.entity;
      const id=game.world.get(x,y,z),kind=id>=0?blockDef(id).blockEntity:undefined;
      return kind?add(x,y,z,emptyEntity(kind)).entity:undefined;
    },
    tick(){
      for(const h of furnaces){
        const id=game.world.get(h.x,h.y,h.z);
        if(id<0)continue;// chunk not loaded
        if(!validate(h))continue;
        tickFurnace(h,h.entity as FurnaceEntity);
        if((h.entity as FurnaceEntity).burn>0)ambient(h);
      }
    },
    reset(){clear();},
    serialize(){
      const entities:unknown[]=[];
      for(const h of holders.values()){
        if(isEmpty(h.entity))continue;
        const e=h.entity;
        entities.push([h.x,h.y,h.z,e.kind==='chest'?{kind:'chest',items:e.items.map(copy)}:
          {kind:'furnace',input:copy(e.input),fuel:copy(e.fuel),output:copy(e.output),burn:e.burn,burnTotal:e.burnTotal,cook:e.cook,xp:e.xp}]);
      }
      return{v:SAVE_VERSION,entities};
    },
    restore(data){
      if(!data||typeof data!=='object')return;
      const d=data as {v?:unknown;entities?:unknown};
      if(d.v!==SAVE_VERSION||!Array.isArray(d.entities)||d.entities.length>200_000)return;
      clear();
      for(const entry of d.entities){
        if(!Array.isArray(entry)||entry.length!==4)continue;
        const [x,y,z,value]=entry;
        if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||y<0||y>=CH||Math.abs(x)>MAX_COORD||Math.abs(z)>MAX_COORD)continue;
        const entity=parseEntity(value);if(!entity)continue;
        const h=add(x,y,z,entity);
        validate(h);
      }
    },
    dispose(){for(const off of unsubscribe)off();unsubscribe=[];clear();}
  };
}
