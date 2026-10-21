// Survival inventory screen (vanilla InventoryMenu): 2×2 crafting with its result, four typed armour
// slots, the offhand, the 27 main slots and the hotbar, plus a small figure wearing the armour.
import {itemDef,type ItemStack} from '../data/items';
import type {Game} from '../engine/contracts';
import {CraftingGrid} from './slots-craft';
import {SlotMenu,armorSlots,equipRule,offhandSlot,playerSlots,screenRule} from './slots';
import {arrowHtml,playerInventoryHtml,slotGrid,slotHtml,type ScreenBuild} from './screen-common';

const MATERIAL_COLOUR:Record<string,string>={leather:'#8d5a34',golden:'#f4c638',iron:'#d8d8d8',diamond:'#47d6cf'};
/** An original blocky figure (16×32 units) with worn armour drawn over it by material colour. */
export function figureSvg(armor:readonly (ItemStack|null)[]):string{
  const colour=(i:number)=>{const m=armor[i]&&itemDef(armor[i]!.id)?.armor?.material;return m?MATERIAL_COLOUR[m]:null;};
  const r=(x:number,y:number,w:number,h:number,fill:string)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  let body=r(4,0,8,8,'#c98e66')+r(4,0,8,2,'#5b3a24')+r(4,2,1,2,'#5b3a24')+r(11,2,1,2,'#5b3a24')+r(6,4,1,1,'#2f2a4a')+r(9,4,1,1,'#2f2a4a')+r(7,6,2,1,'#9a6247')
    +r(4,8,8,12,'#3f8f62')+r(0,8,4,12,'#3f8f62')+r(12,8,4,12,'#3f8f62')+r(0,16,4,4,'#c98e66')+r(12,16,4,4,'#c98e66')
    +r(4,20,4,12,'#5a4636')+r(8,20,4,12,'#4d3c2f')+r(4,30,8,2,'#3a3a3a');
  const head=colour(0),chest=colour(1),legs=colour(2),feet=colour(3);
  if(head)body+=r(3.5,-.5,9,3,head)+r(3.5,2.5,1.2,4,head)+r(11.3,2.5,1.2,4,head);
  if(chest)body+=r(3.5,7.5,9,10,chest)+r(-.5,7.5,4.5,5,chest)+r(12,7.5,4.5,5,chest);
  if(legs)body+=r(3.5,17.5,9,3.5,legs)+r(3.5,21,4.3,7,legs)+r(8.2,21,4.3,7,legs);
  if(feet)body+=r(3.5,28.5,4.3,4,feet)+r(8.2,28.5,4.3,4,feet);
  return`<svg viewBox="-1 -1 18 34" aria-hidden="true" focusable="false" shape-rendering="crispEdges">${body}</svg>`;
}

export function buildInventory(game:Game,menu:SlotMenu):ScreenBuild{
  const inv=game.inventory;
  const grid=new CraftingGrid(game,2,2,'inventory',s=>menu.give(s));
  menu.setup([grid.resultSlot(),...grid.cellSlots(),...armorSlots(inv),...playerSlots(inv),offhandSlot(inv)],screenRule(equipRule));
  const armor=menu.indexes('armor'),[result]=menu.indexes('result'),[offhand]=menu.indexes('offhand');
  const html=`<div class="bc-inv-top">
    ${slotGrid(menu,armor,1,'bc-armor-slots','Armor')}
    <div class="bc-figure" data-figure>${figureSvg(inv.armor)}</div>
    <div class="bc-offhand-slot">${slotHtml(menu,offhand)}</div>
    <div class="bc-craft"><h3 class="bc-label">Crafting</h3><div class="bc-craft-row">${slotGrid(menu,menu.indexes('grid'),2,'bc-craft-grid','Crafting grid')}${arrowHtml()}${slotHtml(menu,result,'bc-s-big')}</div></div>
  </div>${playerInventoryHtml(menu)}`;
  return{id:'inventory',title:'Inventory',kind:'inventory',html,grid,leftovers:()=>grid.clear()};
}
