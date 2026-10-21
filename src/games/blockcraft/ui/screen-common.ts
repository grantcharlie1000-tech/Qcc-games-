// Shared pieces of the inventory-like screens: the build description each screen module returns,
// the menu host, block checks and the HTML of slot grids. DOM-free (HTML is built as strings).
import {blockDef} from '../data/blocks';
import type {ItemStack} from '../data/items';
import type {Game,ScreenId,Vec3} from '../engine/contracts';
import {dropFromPlayer,withCount} from '../items/inventory';
import type {CraftingGrid} from './slots-craft';
import type {MenuHost,SlotMenu} from './slots';

export interface ScreenBuild{
  id:ScreenId;
  /** Heading and accessible name of the panel. */
  title:string;
  /** Panel layout class suffix (bc-panel-<kind>). */
  kind:string;
  /** Body HTML; slot buttons carry data-slot="<menu index>". */
  html:string;
  /** Items left in crafting grids, removed when the screen closes. */
  leftovers?():ItemStack[];
  /** False once the block is gone or the player is more than 8 blocks away (vanilla stillValid). */
  valid?():boolean;
  /** Furnace flame (fuel left) and arrow (cooking) 0..1. */
  progress?():{flame:number;arrow:number};
  /** Grid the recipe book fills. */
  grid?:CraftingGrid;
  opened?():void;closed?():void;
  /** Non-slot content (the advancements tree); returns the unmount function. */
  mount?(body:HTMLElement):()=>void;
}

export function menuHost(game:Game):MenuHost{
  return{
    get inventory(){return game.inventory;},
    get creative(){return game.settings.mode==='creative';},
    drop:stack=>dropFromPlayer(game,stack),
    crafted:()=>game.sounds.play('craft',null,{volume:.5})
  };
}
/** Returns items from a closing screen: into the inventory (thrown when full), or scattered on death. */
export function giveBack(game:Game,stacks:readonly ItemStack[]){
  const dead=game.state==='dead'||game.survival.dead;
  for(const s of stacks){
    if(dead&&!game.settings.keepInventory){dropFromPlayer(game,s,true);continue;}
    const left=game.inventory.add(s);
    if(left>0)dropFromPlayer(game,withCount(s,left));
  }
}
export const blockFamilyAt=(game:Game,at:Vec3)=>{const id=game.world.get(at.x,at.y,at.z);return id<0?null:blockDef(id).family;};
/** Vanilla container reach: the player's feet within 8 blocks of the block centre. */
export function withinReach(game:Game,at:Vec3):boolean{
  const p=game.player.state,dx=p.x-(at.x+.5),dy=p.y-(at.y+.5),dz=p.z-(at.z+.5);
  return dx*dx+dy*dy+dz*dz<=64;
}
/** Validity check for a screen opened on a block of one of these families. */
export function blockScreenValid(game:Game,at:Vec3|undefined,families:readonly string[]):()=>boolean{
  return()=>{
    if(!at)return true;
    const f=blockFamilyAt(game,at);
    // An unloaded chunk (null) keeps the screen; a replaced block or a walk away closes it.
    return(f===null||families.includes(f))&&withinReach(game,at);
  };
}

const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
export {esc};
/** One slot button. Contents, label and durability are filled in by ui/screens.ts. */
export function slotHtml(menu:SlotMenu,index:number,extra=''):string{
  const slot=menu.slots[index];
  const placeholder=slot.section==='armor'?` data-empty="${slot.armor}"`:slot.section==='offhand'?' data-empty="offhand"':'';
  return`<button type="button" class="bc-s bc-s-${slot.section}${extra?' '+extra:''}" data-slot="${index}"${placeholder} aria-label="${esc(slot.label)}">`+
    '<img class="bc-i" alt="" draggable="false" hidden><span class="bc-n"></span><span class="bc-d" hidden><i></i></span></button>';
}
export function slotGrid(menu:SlotMenu,indexes:readonly number[],columns:number,cls='',label=''):string{
  return`<div class="bc-grid ${cls}" style="--cols:${columns}"${label?` role="group" aria-label="${esc(label)}"`:''}>${indexes.map(i=>slotHtml(menu,i)).join('')}</div>`;
}
/** "Inventory" label, the 27 main slots and the separate hotbar row shown under every screen. */
export function playerInventoryHtml(menu:SlotMenu):string{
  return`<h3 class="bc-label">Inventory</h3>${slotGrid(menu,menu.indexes('main'),9,'bc-main','Inventory')}${slotGrid(menu,menu.indexes('hotbar'),9,'bc-hotbar-row','Hotbar')}`;
}
/** The crafting arrow (also the furnace progress arrow when `id` is given). */
export const arrowHtml=(progress=false)=>`<span class="bc-arrow${progress?' bc-progress':''}" aria-hidden="true"><i></i></span>`;
