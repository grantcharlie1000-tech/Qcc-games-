// Survival inventory screen (vanilla InventoryMenu): 2×2 crafting with its result, four typed armour
// slots, the offhand, the 27 main slots and the hotbar, plus the player preview wearing the armour.
// Laid out like the vanilla 176×166 inventory: armour column, black preview window, offhand at its corner,
// "Crafting" above the 2×2 grid, the small arrow, the result and the recipe book button under the grid.
import type {Game} from '../engine/contracts';
import {CraftingGrid} from './slots-craft';
import {SlotMenu,armorSlots,equipRule,offhandSlot,playerSlots,screenRule} from './slots';
import {arrowHtml,figureHtml,labelHtml,playerInventoryHtml,slotGrid,slotHtml,type ScreenBuild} from './screen-common';

export {figureSvg} from './screen-art';
/** Vanilla InventoryScreen geometry (GUI px; slot frames). */
export const INVENTORY_LAYOUT={size:{width:176,height:166},armor:{x:7,y:7},preview:{x:25,y:7,width:51,height:72,figure:60},
  offhand:{x:76,y:61},label:{x:97,y:8},grid:{x:97,y:17},arrow:{x:135,y:29},result:{x:153,y:27},book:{x:104,y:61},main:83} as const;

export function buildInventory(game:Game,menu:SlotMenu):ScreenBuild{
  const inv=game.inventory,L=INVENTORY_LAYOUT;
  const grid=new CraftingGrid(game,2,2,'inventory',s=>menu.give(s));
  menu.setup([grid.resultSlot(),...grid.cellSlots(),...armorSlots(inv),...playerSlots(inv),offhandSlot(inv)],screenRule(equipRule));
  const armor=menu.indexes('armor'),[result]=menu.indexes('result'),[offhand]=menu.indexes('offhand');
  const html=slotGrid(menu,armor,1,'bc-armor-slots','Armor',L.armor)+
    figureHtml(inv.armor,L.preview,L.preview.width,L.preview.height,L.preview.figure)+
    slotHtml(menu,offhand,'',L.offhand)+
    labelHtml('Crafting',L.label)+
    slotGrid(menu,menu.indexes('grid'),2,'bc-craft-grid','Crafting grid',L.grid)+
    arrowHtml(false,true,L.arrow)+
    slotHtml(menu,result,'bc-s-result',L.result)+
    playerInventoryHtml(menu,L.main,null);
  return{id:'inventory',title:'Inventory',kind:'inventory',gui:L.size,titleAt:'hidden',book:L.book,html,grid,leftovers:()=>grid.clear()};
}
