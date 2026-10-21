// Container menu slot engine (inventory & screens area), DOM-free. It reproduces the vanilla Java
// AbstractContainerMenu click semantics: left/right pick up, place, swap and merge; shift-click
// quick-move (per-screen rules); double-click collect; left/right/middle drag distribution;
// number-key and offhand swaps; Q throws; clicks outside drop the cursor; crafting results that
// craft when taken; creative item picker and delete slots. ui/screens.ts maps pointer and key
// input onto these calls and draws the result.
import {itemDef,maxStack,sameItem,type ArmorSlot,type ItemStack} from '../data/items';
import type {InventoryService} from '../engine/contracts';
import {withCount} from '../items/inventory';

/** What a slot belongs to: drives quick-move rules, double-click groups and labels. */
export type Section='hotbar'|'main'|'armor'|'offhand'|'grid'|'result'|'container'|'input'|'fuel'|'output'|'catalog'|'destroy';
export interface MenuSlot{
  readonly section:Section;
  /** Accessible name of the slot position ("Hotbar slot 3", "Helmet slot"). */
  readonly label:string;
  /** Armour slot type for 'armor' sections. */
  readonly armor?:ArmorSlot;
  get():ItemStack|null;
  set(stack:ItemStack|null):void;
  /** Whether the slot accepts this stack (default yes). Results, catalog and delete slots never accept. */
  mayPlace?(stack:ItemStack):boolean;
  /** Most items of this stack the slot holds (default 64, capped by the item's own max stack). */
  limit?(stack:ItemStack):number;
  /** Crafting result: taking it removes the whole result and crafts once (consumes the grid). */
  take?():ItemStack|null;
  /** Called with the items the player took out (the furnace output pays its stored experience). */
  onTake?(taken:ItemStack):void;
}
export interface MenuHost{
  readonly inventory:InventoryService;
  /** Creative mode: middle-click clone and middle drag. */
  readonly creative:boolean;
  /** Throws a stack from the player (Q, clicks outside the panel, overflow). */
  drop(stack:ItemStack):void;
  /** A crafting result was taken by a click (sound hook). */
  crafted?():void;
}
/** Quick-move (shift-click) of the stack in slot `index`; returns true when anything moved. */
export type QuickMoveRule=(menu:SlotMenu,index:number)=>boolean;
/** Drag distribution types: 0 left (split evenly), 1 right (one each), 2 middle (creative: full stacks). */
export type DragType=0|1|2;

const PLAYER_SECTIONS:readonly Section[]=['hotbar','main','armor','offhand'];
const FURNACE_SECTIONS:readonly Section[]=['input','fuel','output'];
/** Slots sharing one backing container (vanilla `slot.container`): shift+double-click moves within it. */
export function containerGroup(section:Section):string{
  return PLAYER_SECTIONS.includes(section)?'player':FURNACE_SECTIONS.includes(section)?'furnace':section;
}
export function mayPlace(slot:MenuSlot,stack:ItemStack):boolean{
  return !slot.take&&slot.section!=='catalog'&&slot.section!=='destroy'&&(slot.mayPlace?.(stack)??true);
}
export function limitOf(slot:MenuSlot,stack:ItemStack):number{return Math.min(slot.limit?.(stack)??64,maxStack(stack.id));}
/** Vanilla canItemQuickReplace: empty, or the same item with no more than a full stack. */
export function canQuickReplace(slot:MenuSlot,stack:ItemStack):boolean{
  const cur=slot.get();return !cur||(sameItem(cur,stack)&&cur.count<=maxStack(stack.id));
}
/** Slots double-click may collect from (not results, the item picker or the delete slot). */
export function canPickAll(slot:MenuSlot):boolean{return !slot.take&&slot.section!=='catalog'&&slot.section!=='destroy';}
export function canDragTo(slot:MenuSlot,stack:ItemStack):boolean{return mayPlace(slot,stack)&&canQuickReplace(slot,stack);}

export class SlotMenu{
  /** The stack carried by the pointer. */
  cursor:ItemStack|null=null;
  slots:MenuSlot[]=[];
  rule:QuickMoveRule=()=>false;
  constructor(readonly host:MenuHost){}
  setup(slots:MenuSlot[],rule:QuickMoveRule){this.slots=slots;this.rule=rule;}
  /** Indexes of the slots in these sections, in menu order. */
  indexes(...sections:Section[]):number[]{
    const out:number[]=[];this.slots.forEach((s,i)=>{if(sections.includes(s.section))out.push(i);});return out;
  }
  /** The player's inventory in vanilla menu order: main (9-35) then hotbar (0-8). */
  get inventoryRange():number[]{return[...this.indexes('main'),...this.indexes('hotbar')];}

  // ---- Primitive moves ------------------------------------------------------------------------
  /** Vanilla Slot.tryRemove: up to `count`, at most `room`; a slot that refuses its own item (outputs) only gives everything. */
  removeFrom(slot:MenuSlot,count:number,room:number):ItemStack|null{
    const s=slot.get();if(!s)return null;
    if(!mayPlace(slot,s)&&room<s.count)return null;
    const n=Math.min(count,room,s.count);if(n<=0)return null;
    slot.set(n===s.count?null:withCount(s,s.count-n));
    return withCount(s,n);
  }
  /** Vanilla Slot.safeInsert: puts up to `increment` of `stack` in the slot; returns what is left of it. */
  insertInto(slot:MenuSlot,stack:ItemStack,increment:number):ItemStack|null{
    if(!mayPlace(slot,stack))return stack;
    const cur=slot.get();
    const n=Math.min(increment,stack.count,limitOf(slot,stack)-(cur?.count??0));
    if(n<=0)return stack;
    if(!cur)slot.set(withCount(stack,n));else if(sameItem(cur,stack))slot.set(withCount(cur,cur.count+n));else return stack;
    return stack.count>n?withCount(stack,stack.count-n):null;
  }
  /** Vanilla moveItemStackTo: merge into matching stacks, then into the first empty accepting slot. */
  insertMany(stack:ItemStack,targets:readonly number[],reverse=false):{left:ItemStack|null;moved:boolean}{
    let s:ItemStack|null=stack,moved=false;
    const order=reverse?[...targets].reverse():targets;
    if(maxStack(stack.id)>1)for(const t of order){
      if(!s)break;
      const slot=this.slots[t],cur=slot?.get();
      if(!slot||!cur||!sameItem(cur,s)||!mayPlace(slot,s))continue;
      const lim=limitOf(slot,s),total=cur.count+s.count;
      if(total<=lim){slot.set(withCount(cur,total));s=null;moved=true;}
      else if(cur.count<lim){slot.set(withCount(cur,lim));s=withCount(s,total-lim);moved=true;}
    }
    if(s)for(const t of order){
      const slot=this.slots[t];
      if(!slot||slot.get()||!mayPlace(slot,s))continue;
      const lim=limitOf(slot,s);
      if(s.count>lim){slot.set(withCount(s,lim));s=withCount(s,s.count-lim);}else{slot.set(s);s=null;}
      moved=true;break;
    }
    return{left:s,moved};
  }
  /** Quick-move helper for rules: moves slot `index` into `targets`, keeping what does not fit. */
  moveSlot(index:number,targets:readonly number[],reverse=false):boolean{
    const slot=this.slots[index],s=slot?.get();if(!slot||!s)return false;
    const {left,moved}=this.insertMany(s,targets,reverse);if(!moved)return false;
    slot.set(left);
    slot.onTake?.(left?withCount(s,s.count-left.count):s);
    return true;
  }
  /** Adds to the inventory and throws what does not fit. */
  give(stack:ItemStack){const left=this.host.inventory.add(stack);if(left>0)this.host.drop(withCount(stack,left));}

  // ---- Clicks -----------------------------------------------------------------------------------
  /** Left (0) or right (1) click on a slot. */
  click(index:number,button:0|1){
    const slot=this.slots[index];if(!slot)return;
    if(slot.section==='catalog'){this.catalogClick(slot,button,false);return;}
    if(slot.section==='destroy'){this.cursor=null;return;}
    if(slot.take){this.clickResult(slot);return;}
    const s=slot.get(),c=this.cursor;
    if(!s){if(c)this.cursor=this.insertInto(slot,c,button===0?c.count:1);return;}
    if(!c){
      const taken=this.removeFrom(slot,button===0?s.count:Math.ceil(s.count/2),Infinity);
      if(taken){this.cursor=taken;slot.onTake?.(taken);}
      return;
    }
    if(mayPlace(slot,c)){
      if(sameItem(s,c))this.cursor=this.insertInto(slot,c,button===0?c.count:1);
      else if(c.count<=limitOf(slot,c)){this.cursor=s;slot.set(c);}
    }else if(sameItem(s,c)){
      const taken=this.removeFrom(slot,s.count,maxStack(c.id)-c.count);
      if(taken){this.cursor=withCount(c,c.count+taken.count);slot.onTake?.(taken);}
    }
  }
  private clickResult(slot:MenuSlot){
    const r=slot.get(),c=this.cursor;if(!r)return;
    if(c&&!(sameItem(c,r)&&c.count+r.count<=maxStack(c.id)))return;
    const taken=slot.take!();if(!taken)return;
    this.cursor=c?withCount(c,c.count+taken.count):taken;
    this.host.crafted?.();
  }
  /** Creative item picker (vanilla CreativeModeInventoryScreen): items are copied, never used up. */
  private catalogClick(slot:MenuSlot,button:0|1,shift:boolean){
    const item=slot.get();if(!item)return;
    const c=this.cursor,max=maxStack(item.id);
    if(c&&sameItem(c,item)){
      if(button===0)this.cursor=shift?withCount(c,max):c.count<max?withCount(c,c.count+1):c;
      else this.cursor=c.count>1?withCount(c,c.count-1):null;
    }else if(!c)this.cursor=withCount(item,shift?max:item.count);
    else if(button===0)this.cursor=null;
    else this.cursor=c.count>1?withCount(c,c.count-1):null;
  }
  /** Shift-click: quick-move by the screen's rule, repeated while the slot keeps the same item. */
  shiftClick(index:number){
    const slot=this.slots[index];if(!slot)return;
    if(slot.section==='catalog'){this.catalogClick(slot,0,true);return;}
    if(slot.section==='destroy'){if(this.host.creative)this.host.inventory.clear();return;}
    if(slot.take){this.quickCraft(slot);return;}
    const first=slot.get();if(!first)return;
    const group=containerGroup(slot.section),before=this.groupCount(group,first);
    for(let guard=0;guard<64;guard++){
      const prev=slot.get();if(!prev)break;
      if(!this.rule(this,index))break;
      const after=slot.get();if(!after||after.id!==prev.id)break;
    }
    if(slot.get()!==first)this.quickMoveLeftGroup=this.groupCount(group,first)<before;
  }
  /** Whether the last quick-move that moved anything took the items out of their container (into a chest, a grid or a
   *  furnace) rather than between its own sections (main ⇄ hotbar). Shift+double-click uses it. */
  quickMoveLeftGroup=false;
  /** Items like `like` held by the slots of one container group. */
  groupCount(group:string,like:ItemStack):number{
    let n=0;
    for(const t of this.slots){const s=t.get();if(s&&containerGroup(t.section)===group&&canPickAll(t)&&sameItem(s,like))n+=s.count;}
    return n;
  }
  /** Shift-click on a result: crafts as many times as the results fit in the inventory (vanilla drops a partial last one). */
  private quickCraft(slot:MenuSlot){
    let crafted=0;
    for(let guard=0;guard<4096;guard++){
      const r=slot.get();if(!r)break;
      const {left,moved}=this.insertMany(r,this.inventoryRange,true);if(!moved)break;
      const taken=slot.take!();if(!taken)break;
      crafted++;
      if(left)this.host.drop(left);
      const next=slot.get();if(!next||next.id!==r.id)break;
    }
    if(crafted)this.host.crafted?.();
  }
  /** Middle click (creative): a full stack copy of the slot's item on an empty cursor. */
  middle(index:number){
    const s=this.slots[index]?.get();
    if(!this.host.creative||this.cursor||!s)return;
    this.cursor=withCount(s,maxStack(s.id));
  }
  /** Number key 1-9 (hotbar 0-8) or the offhand key (40) while hovering a slot: swap them. */
  hotkey(index:number,hotbar:number){
    const slot=this.slots[index];if(!slot||!(hotbar===40||(Number.isInteger(hotbar)&&hotbar>=0&&hotbar<9)))return;
    const inv=this.host.inventory;
    const getH=()=>hotbar===40?inv.offhand:inv.slots[hotbar];
    const setH=(v:ItemStack|null)=>{if(hotbar===40)inv.setOffhand(v);else inv.setSlot(hotbar,v);};
    const hs=getH(),s=slot.get();
    if(slot.section==='catalog'){if(s)setH(withCount(s,maxStack(s.id)));return;}
    if(slot.section==='destroy'||(!hs&&!s))return;
    if(!hs){
      if(slot.take){const taken=slot.take();if(taken){setH(taken);this.host.crafted?.();}return;}
      setH(s);slot.set(null);slot.onTake?.(s!);
    }else if(!s){
      if(!mayPlace(slot,hs))return;
      const lim=limitOf(slot,hs);
      if(hs.count>lim){slot.set(withCount(hs,lim));setH(withCount(hs,hs.count-lim));}else{setH(null);slot.set(hs);}
    }else if(mayPlace(slot,hs)){
      const lim=limitOf(slot,hs);
      if(hs.count>lim){slot.set(withCount(hs,lim));setH(withCount(hs,hs.count-lim));slot.onTake?.(s);this.give(s);}
      else{setH(s);slot.set(hs);slot.onTake?.(s);}
    }
  }
  /** Q (one) or Ctrl+Q (all) while hovering a slot with an empty cursor: throw it. */
  throwSlot(index:number,all:boolean){
    const slot=this.slots[index],s=slot?.get();if(this.cursor||!slot||!s)return;
    if(slot.section==='catalog'){this.host.drop(withCount(s,all?maxStack(s.id):1));return;}
    if(slot.section==='destroy')return;
    if(slot.take){
      for(let guard=0;guard<4096;guard++){
        const r=slot.get();if(!r)break;
        const taken=slot.take();if(!taken)break;
        this.host.drop(taken);this.host.crafted?.();
        const next=slot.get();if(!all||!next||next.id!==r.id)break;
      }
      return;
    }
    const taken=this.removeFrom(slot,all?s.count:1,Infinity);
    if(taken){slot.onTake?.(taken);this.host.drop(taken);}
  }
  /** Click outside the panel: left throws the cursor stack, right throws one. */
  outside(button:0|1){
    const c=this.cursor;if(!c)return;
    if(button===0){this.cursor=null;this.host.drop(c);}
    else{this.cursor=c.count>1?withCount(c,c.count-1):null;this.host.drop(withCount(c,1));}
  }
  /** Double-click: gathers matching items onto the cursor (part stacks first, then full ones). */
  collect(index:number){
    const slot=this.slots[index],c=this.cursor;
    if(!slot||!c||slot.get()||!canPickAll(slot))return;
    let cur=c;const max=maxStack(c.id);
    for(let pass=0;pass<2;pass++)for(let j=0;j<this.slots.length&&cur.count<max;j++){
      const t=this.slots[j],s=t.get();
      if(!s||!sameItem(s,cur)||!canPickAll(t)||(pass===0&&s.count===maxStack(s.id)))continue;
      const taken=this.removeFrom(t,s.count,max-cur.count);
      if(taken){cur=withCount(cur,cur.count+taken.count);t.onTake?.(taken);}
    }
    this.cursor=cur;
  }
  /** Shift + double-click (vanilla AbstractContainerScreen): quick-moves every stack like `like` from the clicked slot's
   *  container. The slots are chosen before anything moves, so stacks never bounce back; when quick-moves stay inside
   *  the container (main ⇄ hotbar in the inventory screen) only the clicked section moves. */
  shiftCollect(index:number,like:ItemStack){
    const slot=this.slots[index];if(!slot||!canPickAll(slot))return;
    const group=containerGroup(slot.section),cross=this.quickMoveLeftGroup;
    const sources:number[]=[];
    this.slots.forEach((t,j)=>{
      const s=t.get();
      if(s&&containerGroup(t.section)===group&&(cross||t.section===slot.section)&&canPickAll(t)&&sameItem(s,like))sources.push(j);
    });
    for(const j of sources){const s=this.slots[j].get();if(s&&sameItem(s,like))this.shiftClick(j);}
  }
  /** Which of `indexes` a drag of the cursor would fill (vanilla adds a slot only while the cursor has items for it). */
  dragTargets(indexes:readonly number[],type:DragType):number[]{
    const c=this.cursor;if(!c)return[];
    const out:number[]=[];
    for(const i of indexes){
      const slot=this.slots[i];
      if(!slot||out.includes(i)||!canDragTo(slot,c)||(type===2&&!this.host.creative))continue;
      if(type!==2&&out.length>=c.count)break;
      out.push(i);
    }
    return out;
  }
  /** Counts each dragged slot would end with, and what stays on the cursor (preview and apply). */
  dragPlan(indexes:readonly number[],type:DragType):{slots:number[];counts:number[];left:number}{
    const c=this.cursor,slots=this.dragTargets(indexes,type);
    if(!c||!slots.length)return{slots:[],counts:[],left:c?.count??0};
    const per=type===0?Math.floor(c.count/slots.length):type===1?1:maxStack(c.id);
    let left=c.count;const counts:number[]=[];
    for(const i of slots){
      const slot=this.slots[i],have=slot.get()?.count??0,n=Math.max(have,Math.min(per+have,limitOf(slot,c)));
      counts.push(n);left-=n-have;
    }
    return{slots,counts,left:type===2?c.count:left};
  }
  /** Releases a drag over `indexes`. One slot is a plain click. */
  drag(indexes:readonly number[],type:DragType){
    const c=this.cursor,plan=this.dragPlan(indexes,type);if(!c||!plan.slots.length)return;
    if(plan.slots.length===1){if(type!==2)this.click(plan.slots[0],type);return;}
    plan.slots.forEach((i,k)=>{const slot=this.slots[i];if(plan.counts[k]!==(slot.get()?.count??0))slot.set(withCount(c,plan.counts[k]));});
    this.cursor=plan.left>0?withCount(c,plan.left):null;
  }
}

// ---- Shared quick-move rules ------------------------------------------------------------------
/** Main inventory → hotbar, hotbar → main inventory. */
export function mainHotbarRule(menu:SlotMenu,index:number):boolean{
  const section=menu.slots[index]?.section;
  if(section==='main')return menu.moveSlot(index,menu.indexes('hotbar'));
  if(section==='hotbar')return menu.moveSlot(index,menu.indexes('main'));
  return false;
}
/** Vanilla InventoryMenu: armour to its empty armour slot, a shield to an empty offhand, else main ⇄ hotbar. */
export function equipRule(menu:SlotMenu,index:number):boolean{
  const s=menu.slots[index]?.get();if(!s)return false;
  const def=itemDef(s.id),armor=def?.armor?.slot;
  if(armor){const a=menu.slots.findIndex(x=>x.section==='armor'&&x.armor===armor);if(a>=0&&!menu.slots[a].get())return menu.moveSlot(index,[a]);}
  if(def?.use==='shield'){const o=menu.indexes('offhand')[0];if(o!==undefined&&!menu.slots[o].get())return menu.moveSlot(index,[o]);}
  return mainHotbarRule(menu,index);
}
/** A screen's quick-move: `fromInventory` for hotbar/main slots; outputs and containers go to the inventory
 *  from the hotbar end (vanilla reverse), grids, armour, offhand, input and fuel from the main inventory start. */
export function screenRule(fromInventory:QuickMoveRule):QuickMoveRule{
  return(menu,index)=>{
    const section=menu.slots[index]?.section;
    if(section==='main'||section==='hotbar')return fromInventory(menu,index);
    if(section==='output'||section==='container')return menu.moveSlot(index,menu.inventoryRange,true);
    return menu.moveSlot(index,menu.inventoryRange);
  };
}

// ---- Inventory-backed slots -------------------------------------------------------------------
const ARMOR_LABEL:Record<ArmorSlot,string>={head:'Helmet slot',chest:'Chestplate slot',legs:'Leggings slot',feet:'Boots slot'};
export function inventorySlot(inv:InventoryService,index:number):MenuSlot{
  const hotbar=index<9;
  return{section:hotbar?'hotbar':'main',label:hotbar?`Hotbar slot ${index+1}`:`Inventory slot ${index-8}`,
    get:()=>inv.slots[index],set:s=>inv.setSlot(index,s)};
}
/** Main inventory (27) then hotbar (9), the vanilla order below every screen. */
export function playerSlots(inv:InventoryService):MenuSlot[]{
  const out:MenuSlot[]=[];
  for(let i=9;i<36;i++)out.push(inventorySlot(inv,i));
  for(let i=0;i<9;i++)out.push(inventorySlot(inv,i));
  return out;
}
export function hotbarSlots(inv:InventoryService):MenuSlot[]{return Array.from({length:9},(_,i)=>inventorySlot(inv,i));}
export function armorSlot(inv:InventoryService,armor:ArmorSlot):MenuSlot{
  return{section:'armor',armor,label:ARMOR_LABEL[armor],get:()=>inv.armorIn(armor),set:s=>{inv.setArmor(armor,s);},
    mayPlace:s=>itemDef(s.id)?.armor?.slot===armor,limit:()=>1};
}
export const armorSlots=(inv:InventoryService)=>(['head','chest','legs','feet'] as const).map(a=>armorSlot(inv,a));
export function offhandSlot(inv:InventoryService):MenuSlot{
  return{section:'offhand',label:'Offhand slot',get:()=>inv.offhand,set:s=>inv.setOffhand(s)};
}
/** A slot stored in a plain array (chest block entity items, crafting grids). Stores fresh, unfrozen copies
 *  because other services may update those arrays in place. */
export function arraySlot(items:(ItemStack|null)[],index:number,section:Section,label:string):MenuSlot{
  return{section,label,get:()=>items[index]??null,set:s=>{items[index]=s?{...s}:null;}};
}
