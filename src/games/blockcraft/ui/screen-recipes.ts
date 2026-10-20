// Recipe book (inventory and crafting table): lists the crafting recipes that fit the grid from
// game.crafting.allRecipes()/recipesFor(), craftable ones first, and fills the grid from the
// inventory when one is chosen (shift: as many crafts as the ingredients allow, up to a stack).
import {maxStack,type ItemId,type ItemStack} from '../data/items';
import type {CraftingService,Ingredient,InventoryService,RecipeView} from '../engine/contracts';
import type {CraftingGrid} from './slots-craft';

export interface BookEntry{result:ItemStack;recipes:RecipeView[];craftable:boolean}
const cellsOf=(r:RecipeView):Ingredient[]=>[...r.grid];
/** Can this crafting recipe be made in a width×height grid? */
export function fitsGrid(r:RecipeView,width:number,height:number):boolean{
  if(r.kind==='smelting')return false;
  if(r.kind==='shapeless')return cellsOf(r).filter(Boolean).length<=width*height;
  return r.width<=width&&r.height<=height;
}
/** Items available to the recipe book: the 36 inventory slots. */
export function availableItems(inv:InventoryService):Map<ItemId,number>{
  const out=new Map<ItemId,number>();
  for(const s of inv.slots)if(s&&!s.damage)out.set(s.id,(out.get(s.id)??0)+s.count);
  return out;
}
/** Item per grid cell (row-major width×height) for `times` crafts, or null when the items are missing.
 *  Shaped recipes sit at the top-left; shapeless ingredients fill the cells in order. */
export function planRecipe(r:RecipeView,width:number,height:number,available:ReadonlyMap<ItemId,number>,times=1):(ItemId|null)[]|null{
  if(!fitsGrid(r,width,height)||!(times>=1))return null;
  const left=new Map(available),out:(ItemId|null)[]=new Array(width*height).fill(null);
  const pick=(alternatives:readonly ItemId[])=>{
    const id=alternatives.find(a=>(left.get(a)??0)>=times&&maxStack(a)>=times);
    if(id)left.set(id,left.get(id)!-times);
    return id??null;
  };
  const cells=cellsOf(r);
  if(r.kind==='shapeless'){
    let k=0;
    for(const ing of cells){if(!ing)continue;const id=pick(ing);if(!id)return null;out[k++]=id;}
    return out;
  }
  for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
    const ing=cells[y*r.width+x];if(!ing)continue;
    const id=pick(ing);if(!id)return null;out[y*width+x]=id;
  }
  return out;
}
/** Most crafts (1..64) the inventory allows for one recipe; 0 when none. */
export function maxCrafts(r:RecipeView,width:number,height:number,available:ReadonlyMap<ItemId,number>):number{
  let lo=0,hi=64;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(planRecipe(r,width,height,available,mid))lo=mid;else hi=mid-1;}
  return lo;
}
/** One entry per result item, craftable ones first (otherwise in recipe order). */
export function bookEntries(crafting:CraftingService,width:number,height:number,available:ReadonlyMap<ItemId,number>):BookEntry[]{
  let all:readonly RecipeView[]=[];try{all=crafting.allRecipes();}catch{all=[];}
  const byResult=new Map<ItemId,BookEntry>();
  for(const r of all){
    if(!fitsGrid(r,width,height))continue;
    const e=byResult.get(r.result.id)??{result:r.result,recipes:[],craftable:false};
    e.recipes.push(r);e.craftable||=!!planRecipe(r,width,height,available);
    byResult.set(r.result.id,e);
  }
  const list=[...byResult.values()];
  return[...list.filter(e=>e.craftable),...list.filter(e=>!e.craftable)];
}
/** Removes `count` of an item from the inventory, main slots before the hotbar; returns how many were taken. */
export function takeItems(inv:InventoryService,id:ItemId,count:number):number{
  let left=count;
  for(const i of [...Array.from({length:27},(_,k)=>k+9),...Array.from({length:9},(_,k)=>k)]){
    const s=inv.slots[i];if(!left)break;if(!s||s.id!==id||s.damage)continue;
    const n=Math.min(left,s.count);inv.setSlot(i,n===s.count?null:{id,count:s.count-n});left-=n;
  }
  return count-left;
}
/** Fills the grid for the first craftable variant of `entry` (all crafts when `all`). Returns false when nothing fits. */
export function fillFromBook(crafting:CraftingService,inv:InventoryService,grid:CraftingGrid,entry:BookEntry,all:boolean,give:(s:ItemStack)=>void):boolean{
  for(const s of grid.clear())give(s);
  let variants:readonly RecipeView[]=entry.recipes;
  try{const more=crafting.recipesFor(entry.result.id).filter(r=>fitsGrid(r,grid.width,grid.height));if(more.length)variants=more;}catch{/* keep the listed ones */}
  const available=availableItems(inv);
  for(const r of variants){
    const times=all?maxCrafts(r,grid.width,grid.height,available):1;
    const plan=times?planRecipe(r,grid.width,grid.height,available,times):null;
    if(!plan)continue;
    plan.forEach((id,i)=>{if(id){const n=takeItems(inv,id,times);grid.cells[i]=n?{id,count:n}:null;}});
    grid.invalidate();
    return true;
  }
  return false;
}
