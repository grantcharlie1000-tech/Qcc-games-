// Crafting grids (2×2 inventory, 3×3 crafting table) and their result slot, DOM-free.
// The result is game.crafting.match(grid); taking it consumes one item from every filled cell,
// leaves the recipe remainders (vanilla ResultSlot.onTake) and emits `itemCrafted`.
import {itemDef,maxStack,sameItem,type ItemStack} from '../data/items';
import type {CraftingStation,Game,RecipeMatch} from '../engine/contracts';
import {cleanStack,withCount} from '../items/inventory';
import type {MenuSlot} from './slots';

export class CraftingGrid{
  readonly cells:(ItemStack|null)[];
  private cached:RecipeMatch|null|undefined;
  constructor(private game:Game,readonly width:number,readonly height:number,readonly station:CraftingStation,
    /** Puts a remainder that cannot stay in its cell into the inventory (or drops it). */
    private give:(stack:ItemStack)=>void){
    this.cells=new Array(width*height).fill(null);
  }
  invalidate(){this.cached=undefined;}
  match():RecipeMatch|null{
    if(this.cached===undefined){
      let m:RecipeMatch|null=null;
      if(this.cells.some(Boolean)){try{m=this.game.crafting.match(this.cells,this.width,this.height);}catch{m=null;}}
      const result=m&&cleanStack(m.result);
      this.cached=m&&result?{result,remainders:m.remainders}:null;
    }
    return this.cached;
  }
  /** The result of one craft, or null. */
  result():ItemStack|null{return this.match()?.result??null;}
  /** Crafts once: consumes the grid, applies remainders, emits itemCrafted and returns the result. */
  craft():ItemStack|null{
    const m=this.match();if(!m)return null;
    const result=m.result,remainders=m.remainders?.length===this.cells.length?m.remainders:null;
    for(let i=0;i<this.cells.length;i++){
      const cur=this.cells[i];if(!cur)continue;
      const fallback=itemDef(cur.id)?.remainder;
      const rem=remainders?cleanStack(remainders[i]):fallback?withCount({id:fallback,count:1},1):null;
      let next:ItemStack|null=cur.count>1?{id:cur.id,count:cur.count-1,...(cur.damage?{damage:cur.damage}:{})}:null;
      if(rem){
        if(!next)next={...rem};
        else if(sameItem(next,rem)&&next.count+rem.count<=maxStack(rem.id))next={...next,count:next.count+rem.count};
        else this.give(rem);
      }
      this.cells[i]=next;
    }
    this.invalidate();
    this.game.events.emit('itemCrafted',{stack:{...result},station:this.station});
    return result;
  }
  /** Removes and returns every item left in the grid (closing the screen). */
  clear():ItemStack[]{
    const out=this.cells.filter((s):s is ItemStack=>!!s).map(s=>({...s}));
    this.cells.fill(null);this.invalidate();return out;
  }
  cellSlots():MenuSlot[]{
    return this.cells.map((_,i)=>({section:'grid' as const,label:`Crafting grid row ${Math.floor(i/this.width)+1} column ${i%this.width+1}`,
      get:()=>this.cells[i],set:(s:ItemStack|null)=>{this.cells[i]=s?{...s}:null;this.invalidate();}}));
  }
  resultSlot():MenuSlot{
    return{section:'result',label:'Crafting result',get:()=>this.result(),set:()=>{},mayPlace:()=>false,take:()=>this.craft()};
  }
}
