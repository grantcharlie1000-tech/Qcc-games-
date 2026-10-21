// Crafting table screen (vanilla CraftingMenu): 3×3 grid and result above the player inventory.
// Shift-click from the inventory fills the grid first, then moves between main and hotbar.
import type {Game,Vec3} from '../engine/contracts';
import {CraftingGrid} from './slots-craft';
import {SlotMenu,mainHotbarRule,playerSlots,screenRule} from './slots';
import {arrowHtml,blockScreenValid,playerInventoryHtml,slotGrid,slotHtml,type ScreenBuild} from './screen-common';

export function buildCraftingTable(game:Game,menu:SlotMenu,at?:Vec3):ScreenBuild{
  const grid=new CraftingGrid(game,3,3,'crafting_table',s=>menu.give(s));
  menu.setup([grid.resultSlot(),...grid.cellSlots(),...playerSlots(game.inventory)],
    screenRule((m,i)=>m.moveSlot(i,m.indexes('grid'))||mainHotbarRule(m,i)));
  const [result]=menu.indexes('result');
  const html=`<div class="bc-table"><h3 class="bc-label">Crafting</h3><div class="bc-craft-row">${slotGrid(menu,menu.indexes('grid'),3,'bc-craft-grid','Crafting grid')}${arrowHtml()}${slotHtml(menu,result,'bc-s-big')}</div></div>${playerInventoryHtml(menu)}`;
  return{id:'crafting_table',title:'Crafting',kind:'crafting',html,grid,leftovers:()=>grid.clear(),valid:blockScreenValid(game,at,['crafting_table'])};
}
