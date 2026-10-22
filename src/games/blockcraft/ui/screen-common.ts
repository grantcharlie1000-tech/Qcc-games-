// Shared pieces of the inventory-like screens: the build description each screen module returns,
// the menu host, block checks and the HTML of slot grids. DOM-free (HTML is built as strings).
// Layout is in GUI pixels at the vanilla positions (x, y of each slot's 18×18 frame from the panel's top-left);
// screens.css scales one GUI pixel to --bc-u.
import {blockDef} from '../data/blocks';
import type {ItemStack} from '../data/items';
import type {Game,ScreenId,Vec3} from '../engine/contracts';
import {dropFromPlayer,withCount} from '../items/inventory';
import type {CraftingGrid} from './slots-craft';
import type {MenuHost,SlotMenu} from './slots';
import {GUI_COLOURS,figureSvg,pixelTextHtml} from './screen-art';

/** Panel size in GUI pixels, plus what sticks out above and below it (the creative tabs). */
export interface GuiSize{width:number;height:number;above?:number;below?:number}
/** A position in GUI pixels from the panel's top-left corner. */
export interface GuiPos{x:number;y:number}

export interface ScreenBuild{
  id:ScreenId;
  /** Heading and accessible name of the panel. */
  title:string;
  /** Panel layout class suffix (bc-panel-<kind>). */
  kind:string;
  /** Fixed vanilla GUI geometry (absent: the panel flows around its content, like the advancements screen). */
  gui?:GuiSize;
  /** Where the title is drawn: a GUI position, centred on the panel, or only for assistive technology. */
  titleAt?:GuiPos|'center'|'hidden';
  /** Position of the recipe book button (screens with a crafting grid). */
  book?:GuiPos;
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
/** Inline style placing an element at a GUI position (with the .bc-at class). */
export const placeStyle=(at:GuiPos)=>`--x:${at.x};--y:${at.y}`;
/** One slot button. Contents, label and durability are filled in by ui/screens.ts. */
export function slotHtml(menu:SlotMenu,index:number,extra='',at?:GuiPos):string{
  const slot=menu.slots[index];
  const placeholder=slot.section==='armor'?` data-empty="${slot.armor}"`:slot.section==='offhand'?' data-empty="offhand"':'';
  return`<button type="button" class="bc-s bc-s-${slot.section}${extra?' '+extra:''}${at?' bc-at':''}" data-slot="${index}"${placeholder}`+
    `${at?` style="${placeStyle(at)}"`:''} aria-label="${esc(slot.label)}">`+
    '<img class="bc-i" alt="" draggable="false" hidden><span class="bc-n"></span><span class="bc-d" hidden><i></i></span></button>';
}
export function slotGrid(menu:SlotMenu,indexes:readonly number[],columns:number,cls='',label='',at?:GuiPos):string{
  return`<div class="bc-grid ${cls}${at?' bc-at':''}" style="--cols:${columns}${at?`;${placeStyle(at)}`:''}"${label?` role="group" aria-label="${esc(label)}"`:''}>`+
    `${indexes.map(i=>slotHtml(menu,i)).join('')}</div>`;
}
/** A dark grey label in the pixel font (vanilla draws container labels without a shadow). */
export function labelHtml(text:string,at:GuiPos):string{
  return`<h3 class="bc-label bc-at" style="${placeStyle(at)}">${pixelTextHtml(text,GUI_COLOURS.title)}</h3>`;
}
/** Vanilla player inventory rows: the 27 main slots with their frames' top at `mainY`, the hotbar 4 px below them, and
 *  the "Inventory" label at `labelY` (none in the survival inventory). */
export function playerInventoryHtml(menu:SlotMenu,mainY=83,labelY:number|null=72):string{
  return`${labelY===null?'':labelHtml('Inventory',{x:8,y:labelY})}${slotGrid(menu,menu.indexes('main'),9,'bc-main','Inventory',{x:7,y:mainY})}`+
    slotGrid(menu,menu.indexes('hotbar'),9,'bc-hotbar-row','Hotbar',{x:7,y:mainY+58});
}
/** The crafting arrow (22×15, or the inventory's 16×13 when `small`); with `progress` the furnace arrow that fills white. */
export const arrowHtml=(progress:boolean,small:boolean,at:GuiPos)=>
  `<span class="bc-arrow${small?' bc-arrow-small':''}${progress?' bc-progress':''} bc-at" style="${placeStyle(at)}" aria-hidden="true"><i></i></span>`;
/** The black player preview window (`width`×`height` GUI px with its sunken edge) holding the figure, `figure` GUI px
 *  tall, wearing the armour. */
export function figureHtml(armor:readonly (ItemStack|null)[],at:GuiPos,width:number,height:number,figure:number):string{
  return`<div class="bc-figure bc-at" data-figure style="${placeStyle(at)};--w:${width};--h:${height};--fh:${figure}">${figureSvg(armor)}</div>`;
}
