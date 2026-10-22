// Crafting table screen (vanilla CraftingMenu): 3×3 grid and result above the player inventory.
// Shift-click from the inventory fills the grid first, then moves between main and hotbar.
// Laid out like the vanilla 176×166 crafting table: the grid, the arrow and the large result slot.
import type {Game,Vec3} from '../engine/contracts';
import {CraftingGrid} from './slots-craft';
import {SlotMenu,mainHotbarRule,playerSlots,screenRule} from './slots';
import {arrowHtml,blockScreenValid,playerInventoryHtml,slotGrid,slotHtml,type ScreenBuild} from './screen-common';

/** Vanilla CraftingScreen geometry (GUI px; slot frames, the result's 26×26 frame). */
export const CRAFTING_LAYOUT={size:{width:176,height:166},title:{x:29,y:6},grid:{x:29,y:16},arrow:{x:90,y:35},result:{x:119,y:30},
  book:{x:5,y:34},main:83,label:72} as const;

export function buildCraftingTable(game:Game,menu:SlotMenu,at?:Vec3):ScreenBuild{
  const L=CRAFTING_LAYOUT;
  const grid=new CraftingGrid(game,3,3,'crafting_table',s=>menu.give(s));
  menu.setup([grid.resultSlot(),...grid.cellSlots(),...playerSlots(game.inventory)],
    screenRule((m,i)=>m.moveSlot(i,m.indexes('grid'))||mainHotbarRule(m,i)));
  const [result]=menu.indexes('result');
  const html=slotGrid(menu,menu.indexes('grid'),3,'bc-craft-grid','Crafting grid',L.grid)+arrowHtml(false,false,L.arrow)+
    slotHtml(menu,result,'bc-s-big',L.result)+playerInventoryHtml(menu,L.main,L.label);
  return{id:'crafting_table',title:'Crafting',kind:'crafting',gui:L.size,titleAt:L.title,book:L.book,html,grid,leftovers:()=>grid.clear(),
    valid:blockScreenValid(game,at,['crafting_table'])};
}
