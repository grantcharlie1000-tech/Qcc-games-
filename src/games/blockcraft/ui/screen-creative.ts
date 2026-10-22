// Creative inventory (vanilla CreativeModeInventoryScreen): item tabs with an infinite item picker and
// the hotbar below, a Search tab, and the Survival Inventory tab (armour, offhand, 36 slots and the
// delete slot). Shift-click on a hotbar slot in an item tab deletes it; shift-click on the delete
// slot clears the whole inventory.
import type {ItemStack} from '../data/items';
import type {Game} from '../engine/contracts';
import {SlotMenu,armorSlots,equipRule,hotbarSlots,offhandSlot,playerSlots,screenRule,type MenuSlot} from './slots';
import {CREATIVE_TABS,searchItems,tabItems,type CreativeTabId} from './screen-catalog';
import {esc,slotGrid,slotHtml,type ScreenBuild} from './screen-common';
import {figureSvg} from './screen-inventory';

export interface CreativeState{tab:CreativeTabId;query:string}
const catalogStack=(id:string):ItemStack=>Object.freeze({id,count:1});
export function catalogSlot(id:string):MenuSlot{
  const s=catalogStack(id);
  return{section:'catalog',label:'Item picker',get:()=>s,set:()=>{},mayPlace:()=>false};
}
export const destroySlot=():MenuSlot=>({section:'destroy',label:'Destroy item slot',get:()=>null,set:()=>{},mayPlace:()=>false});
export function creativeItems(state:CreativeState):readonly string[]{
  return state.tab==='search'?searchItems(state.query):tabItems(state.tab);
}
function tabsHtml(state:CreativeState,top:boolean):string{
  return`<div class="bc-tabs bc-tabs-${top?'top':'bottom'}" role="tablist" aria-label="Item groups">${CREATIVE_TABS.filter(t=>t.top===top).map(t=>
    `<button type="button" class="bc-tab" role="tab" data-tab="${t.id}" aria-selected="${t.id===state.tab}" aria-label="${esc(t.title)}" title="${esc(t.title)}"><img alt="" data-icon="${t.icon}" draggable="false"></button>`).join('')}</div>`;
}
export function buildCreative(game:Game,menu:SlotMenu,state:CreativeState):ScreenBuild{
  const inv=game.inventory,tab=CREATIVE_TABS.find(t=>t.id===state.tab)??CREATIVE_TABS[0];
  let body:string;
  if(tab.id==='inventory'){
    menu.setup([...armorSlots(inv),...playerSlots(inv),offhandSlot(inv),destroySlot()],screenRule(equipRule));
    const [offhand]=menu.indexes('offhand'),[destroy]=menu.indexes('destroy');
    body=`<div class="bc-inv-top bc-creative-inv">${slotGrid(menu,menu.indexes('armor'),1,'bc-armor-slots','Armor')}<div class="bc-figure" data-figure>${figureSvg(inv.armor)}</div>`+
      `<div class="bc-offhand-slot">${slotHtml(menu,offhand)}</div></div>`+
      `${slotGrid(menu,menu.indexes('main'),9,'bc-main','Inventory')}<div class="bc-hotbar-wrap">${slotGrid(menu,menu.indexes('hotbar'),9,'bc-hotbar-row','Hotbar')}${slotHtml(menu,destroy,'bc-s-destroy')}</div>`;
  }else{
    const items=creativeItems(state);
    menu.setup([...items.map(catalogSlot),...hotbarSlots(inv)],(m,i)=>{
      // Vanilla ItemPickerMenu: shift-clicking a hotbar slot deletes its stack.
      if(m.slots[i]?.section==='hotbar')m.slots[i].set(null);
      return false;
    });
    const search=tab.id==='search'?`<label class="bc-search"><span class="bc-sr">Search items</span><input type="search" class="bc-search-input" autocomplete="off" spellcheck="false" placeholder="Search…" value="${esc(state.query)}"></label>`:'';
    const empty=items.length?'':'<p class="bc-empty">No items match.</p>';
    body=`${search}<div class="bc-catalog" role="group" aria-label="${esc(tab.title)}">${slotGrid(menu,menu.indexes('catalog'),9,'bc-catalog-grid')}${empty}</div>`+
      `${slotGrid(menu,menu.indexes('hotbar'),9,'bc-hotbar-row','Hotbar')}`;
  }
  return{id:'creative',title:tab.title,kind:`creative bc-creative-${tab.id}`,
    html:`${tabsHtml(state,true)}<div class="bc-creative-body">${body}</div>${tabsHtml(state,false)}`};
}
