// Player inventory (inventory & screens area): 36 slots (0-8 hotbar, 9-35 main), four armour
// slots, an offhand and the selected hotbar index, with vanilla Java stacking rules. The cursor
// stack and crafting grids belong to the open screen (ui/screens.ts), which returns them on close.
//
// Stacks stored here are immutable: every change replaces the stack object, and the public views
// (`slots`, `armor`, `offhand`, `held()`) are frozen snapshots rebuilt only after a change, so
// readers never allocate per frame and can never edit the inventory behind its back.
import {ITEMS,itemDef,maxStack,parseStack,sameItem,type ItemStack} from '../data/items';
import type {ArmorSlot,Game,GameMode,InventoryService,Vec3} from '../engine/contracts';

export const HOTBAR_SIZE=9,INVENTORY_SIZE=36;
export const ARMOR_SLOTS:readonly ArmorSlot[]=['head','chest','legs','feet'];
/** Ticks before the player can pick up an item they dropped (vanilla Player.drop). */
export const DROP_PICKUP_DELAY=40;
/** Hotbar given when an empty inventory switches from survival to creative, so building can start without the menu.
 *  Not on the modeChanged a restore emits: a creative world reloads exactly as it was saved. */
export const CREATIVE_STARTER=['grass_block','dirt','stone','cobblestone','oak_planks','oak_log','glass','torch','crafting_table'];

const freeze=(s:ItemStack|null):ItemStack|null=>s&&Object.freeze(s);
/** A fresh immutable stack of `count` items like `s` (keeps damage). */
export function withCount(s:ItemStack,count:number):ItemStack{
  return Object.freeze(s.damage?{id:s.id,count,damage:s.damage}:{id:s.id,count});
}
/** Validates and normalises a stack from another service: a known id, an integer count clamped to
 *  1..maxStack and damage kept (clamped below the durability) only for items that wear. Null when unusable. */
export function cleanStack(value:unknown):ItemStack|null{
  if(!value||typeof value!=='object')return null;
  const v=value as Partial<ItemStack>,def=typeof v.id==='string'?ITEMS.get(v.id):undefined;
  if(!def||typeof v.count!=='number'||!Number.isFinite(v.count))return null;
  const count=Math.min(def.maxStack,Math.floor(v.count));if(count<1)return null;
  const durability=def.durability??0;
  const damage=durability&&typeof v.damage==='number'&&Number.isFinite(v.damage)?Math.max(0,Math.min(durability-1,Math.floor(v.damage))):0;
  return Object.freeze(damage?{id:def.id,count,damage}:{id:def.id,count});
}

/** Velocity (blocks/second) of an item the player throws (Q, or out of a screen): vanilla Player.drop gives
 *  0.3 blocks/tick along the look, 0.1 lift and a little random spread. */
export function throwVelocity(look:Vec3,random:()=>number):Vec3{
  const angle=random()*Math.PI*2,spread=.02*random();
  const lift=.1+(random()-random())*.1;
  return{x:(look.x*.3+Math.cos(angle)*spread)*20,y:(look.y*.3+lift)*20,z:(look.z*.3+Math.sin(angle)*spread)*20};
}
/** Velocity of an item scattered around the player on death (vanilla dropAround: up to 0.5 blocks/tick, 0.2 up). */
export function scatterVelocity(random:()=>number):Vec3{
  const speed=random()*.5,angle=random()*Math.PI*2;
  return{x:-Math.sin(angle)*speed*20,y:.2*20,z:Math.cos(angle)*speed*20};
}
/** Drops a stack from 0.3 below the player's eye: thrown along the look, or scattered (death). */
export function dropFromPlayer(game:Game,stack:ItemStack,scatter=false){
  const eye=game.player.eye(),p=game.player.state;
  const random=()=>game.random();
  const velocity=scatter?scatterVelocity(random):throwVelocity(game.player.look(),random);
  game.entities.dropItem({...stack},p.x,eye.y-.3,p.z,velocity,DROP_PICKUP_DELAY);
}

export function createInventory(game:Game):InventoryService{
  const slots:(ItemStack|null)[]=new Array(INVENTORY_SIZE).fill(null);
  const armor:(ItemStack|null)[]=[null,null,null,null];
  let offhand:ItemStack|null=null,selected=0;
  let version=0,viewVersion=-1;
  /** Mode the inventory last saw, so only a real switch to creative stocks the starter hotbar. */
  let lastMode:GameMode='survival';
  let slotView:readonly (ItemStack|null)[]=[],armorView:readonly (ItemStack|null)[]=[];
  const listeners=new Set<()=>void>();
  const unsubscribe:(()=>void)[]=[];
  const creative=()=>game.settings.mode==='creative';
  function changed(){version++;for(const l of [...listeners])l();}
  function views(){
    if(viewVersion===version)return;
    slotView=Object.freeze(slots.slice());armorView=Object.freeze(armor.slice());viewVersion=version;
  }
  /** Adds what fits into the inventory and drops the rest in front of the player (remainders). */
  function give(stack:ItemStack){const left=inv.add(stack);if(left>0)dropFromPlayer(game,withCount(stack,left));}
  function breakSound(stack:ItemStack){
    game.sounds.play('tool_break');
    const eye=game.player.eye(),look=game.player.look();
    game.render.spawnParticles('item',eye.x+look.x*.6,eye.y+look.y*.6-.2,eye.z+look.z*.6,{item:stack.id,count:8,spread:.1});
  }
  /** Wears one stack; returns the new stack, or null when it broke. */
  function wear(s:ItemStack,amount:number):ItemStack|null{
    const durability=itemDef(s.id)?.durability??0;if(!durability)return s;
    const damage=(s.damage??0)+amount;
    if(damage<durability)return Object.freeze({id:s.id,count:s.count,damage});
    breakSound(s);
    return s.count>1?withCount({id:s.id,count:s.count},s.count-1):null;
  }
  function stockCreativeHotbar(){
    if(slots.some(Boolean)||offhand)return;
    CREATIVE_STARTER.forEach((id,i)=>{if(ITEMS.has(id))slots[i]=withCount({id,count:1},maxStack(id));});
    changed();
  }
  function clearAll(){slots.fill(null);armor.fill(null);offhand=null;}

  const inv:InventoryService={
    get slots(){views();return slotView;},
    get armor(){views();return armorView;},
    get offhand(){return offhand;},
    get selected(){return selected;},
    held:()=>slots[selected],
    select(index){
      if(typeof index!=='number'||!Number.isFinite(index))return;
      const i=((Math.trunc(index)%HOTBAR_SIZE)+HOTBAR_SIZE)%HOTBAR_SIZE;
      if(i===selected)return;selected=i;changed();
    },
    add(input){
      const s=cleanStack(input);
      if(!s)return input&&typeof input.count==='number'&&input.count>0?Math.floor(input.count):0;
      // Vanilla Inventory.add: merge into the selected slot, the offhand, then slots 0-35 with room; then the first empty slots.
      let left=Math.max(s.count,Math.floor(input.count));const max=maxStack(s.id);const start=left;
      if(max>1){
        const merge=(cur:ItemStack|null,put:(v:ItemStack)=>void)=>{
          if(!left||!cur||!sameItem(cur,s)||cur.count>=max)return;
          const n=Math.min(left,max-cur.count);put(withCount(cur,cur.count+n));left-=n;
        };
        merge(slots[selected],v=>{slots[selected]=v;});
        merge(offhand,v=>{offhand=v;});
        for(let i=0;i<INVENTORY_SIZE&&left;i++)merge(slots[i],v=>{slots[i]=v;});
      }
      for(let i=0;i<INVENTORY_SIZE&&left;i++)if(!slots[i]){const n=Math.min(left,max);slots[i]=withCount(s,n);left-=n;}
      if(left!==start)changed();
      return left;
    },
    consumeHeld(count=1){
      if(creative())return;
      const h=slots[selected],n=Math.floor(count);if(!h||!(n>0))return;
      const used=Math.min(n,h.count),rest=h.count-used,remainder=itemDef(h.id)?.remainder;
      // The container left behind (bowl, bucket) takes the emptied slot; any more go to the inventory.
      const inSlot=remainder&&rest===0?Math.min(used,maxStack(remainder)):0;
      slots[selected]=rest>0?withCount(h,rest):inSlot?withCount({id:remainder!,count:1},inSlot):null;
      changed();
      if(remainder&&used>inSlot)give(withCount({id:remainder,count:1},used-inSlot));
    },
    damageHeld(amount=1){
      const n=Math.floor(amount);if(creative()||!(n>0))return;
      const h=slots[selected],using=game.interaction?.using?.item;
      // The item in use wears (a shield raised or a bow drawn from the offhand); the main hand wins when both match.
      if(using&&h?.id!==using&&offhand?.id===using&&itemDef(offhand.id)?.durability){offhand=wear(offhand,n);changed();return;}
      if(h&&itemDef(h.id)?.durability){slots[selected]=wear(h,n);changed();}
    },
    damageArmor(amount){
      if(creative()||!(amount>0))return;
      const w=Math.max(1,Math.floor(amount/4));let any=false;
      for(let i=0;i<4;i++){const a=armor[i];if(a&&itemDef(a.id)?.durability){armor[i]=wear(a,w);any=true;}}
      if(any)changed();
    },
    armorIn(slot){const i=ARMOR_SLOTS.indexOf(slot);return i<0?null:armor[i];},
    setArmor(slot,stack){
      const i=ARMOR_SLOTS.indexOf(slot);if(i<0)return false;
      if(stack===null){if(armor[i]){armor[i]=null;changed();}return true;}
      const s=cleanStack(stack);if(!s||itemDef(s.id)?.armor?.slot!==slot)return false;
      const before=armor[i];armor[i]=s;
      if(!sameItem(before,s))game.sounds.play('equip');
      changed();return true;
    },
    setOffhand(stack){const s=stack===null?null:cleanStack(stack);if(stack!==null&&!s)return;offhand=s;changed();},
    swapHands(){const h=slots[selected];if(!h&&!offhand)return;slots[selected]=offhand;offhand=h;changed();},
    count(id){
      let n=0;for(const s of slots)if(s?.id===id)n+=s.count;
      for(const s of armor)if(s?.id===id)n+=s.count;
      if(offhand?.id===id)n+=offhand.count;
      return n;
    },
    remove(id,count){
      let left=Math.floor(count);if(!(left>0))return 0;const start=left;
      const take=(s:ItemStack|null,put:(v:ItemStack|null)=>void)=>{
        if(!left||s?.id!==id)return;const n=Math.min(left,s.count);left-=n;put(n===s.count?null:withCount(s,s.count-n));
      };
      // Same order as vanilla projectile search: offhand, held slot, then the rest of the inventory, armour last.
      take(offhand,v=>{offhand=v;});
      take(slots[selected],v=>{slots[selected]=v;});
      for(let i=0;i<INVENTORY_SIZE&&left;i++)take(slots[i],v=>{slots[i]=v;});
      for(let i=0;i<4&&left;i++)take(armor[i],v=>{armor[i]=v;});
      if(left!==start)changed();
      return start-left;
    },
    setSlot(index,stack){
      if(!Number.isInteger(index)||index<0||index>=INVENTORY_SIZE)return;
      const s=stack===null?null:cleanStack(stack);
      if(stack!==null&&!s)return;
      slots[index]=s;changed();
    },
    dropHeld(all){
      const h=slots[selected];if(!h)return;
      const n=all?h.count:1;
      slots[selected]=n>=h.count?null:withCount(h,h.count-n);changed();
      dropFromPlayer(game,withCount(h,n));
    },
    dropAll(){
      const all=[...slots,...armor,offhand].filter((s):s is ItemStack=>!!s);
      clearAll();changed();
      for(const s of all)dropFromPlayer(game,s,true);
    },
    clear(){clearAll();changed();},
    onChange(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    init(){
      lastMode=game.settings.mode;
      unsubscribe.push(game.events.on('modeChanged',({mode})=>{
        const was=lastMode;lastMode=mode;
        if(mode==='creative'&&was!=='creative')stockCreativeHotbar();
      }));
    },
    reset(){clearAll();selected=0;changed();},
    serialize(){views();return{slots:slotView,armor:armorView,offhand,selected};},
    restore(value){
      // Engine.restore applies the saved settings before restoring systems, then emits modeChanged for them.
      lastMode=game.settings.mode;
      if(!value||typeof value!=='object')return;
      const d=value as {slots?:unknown;armor?:unknown;offhand?:unknown;selected?:unknown};
      if(Array.isArray(d.slots)&&d.slots.length===INVENTORY_SIZE)d.slots.forEach((s,i)=>{slots[i]=freeze(parseStack(s));});
      if(Array.isArray(d.armor)&&d.armor.length===4)d.armor.forEach((s,i)=>{
        const a=parseStack(s);armor[i]=a&&itemDef(a.id)?.armor?.slot===ARMOR_SLOTS[i]?freeze(a):null;
      });
      offhand=freeze(parseStack(d.offhand));
      if(Number.isInteger(d.selected)&&(d.selected as number)>=0&&(d.selected as number)<HOTBAR_SIZE)selected=d.selected as number;
      changed();
    },
    dispose(){for(const u of unsubscribe.splice(0))u();listeners.clear();}
  };
  return inv;
}
