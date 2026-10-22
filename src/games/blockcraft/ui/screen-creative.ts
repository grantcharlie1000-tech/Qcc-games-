// Creative inventory (vanilla CreativeModeInventoryScreen): item tabs with an infinite item picker and
// the hotbar below, a Search tab, and the Survival Inventory tab (armour, offhand, 36 slots and the
// delete slot). Shift-click on a hotbar slot in an item tab deletes it; shift-click on the delete
// slot clears the whole inventory.
// Laid out like the vanilla 195×136 creative screen: tabs with item icons along the top and bottom (Search and
// Survival Inventory in the right-hand column), the 9×5 picker with its scrollbar, and the hotbar.
import type {ItemStack} from '../data/items';
import type {Game} from '../engine/contracts';
import {SlotMenu,armorSlots,equipRule,hotbarSlots,offhandSlot,playerSlots,screenRule,type MenuSlot} from './slots';
import {CREATIVE_TABS,searchItems,tabItems,type CreativeTab,type CreativeTabId} from './screen-catalog';
import {esc,figureHtml,placeStyle,slotHtml,slotGrid,type GuiPos,type ScreenBuild} from './screen-common';
import {TAB_HEIGHT,TAB_OVERLAP,TAB_WIDTH,pixelTextHtml} from './screen-art';
import {hasGlyphs,textWidth} from './hud-art';

export interface CreativeState{tab:CreativeTabId;query:string}
/** Vanilla creative geometry (GUI px; slot frames). The scroll track's inner area is 12×112 from (175, 18). */
export const CREATIVE_LAYOUT={size:{width:195,height:136,above:TAB_HEIGHT-TAB_OVERLAP,below:TAB_HEIGHT-TAB_OVERLAP},title:{x:8,y:6},
  catalog:{x:8,y:17},rows:5,hotbar:{x:8,y:111},scroll:{x:174,y:17,travel:112-15},search:{x:80,y:4},
  armor:[{x:53,y:5},{x:53,y:32},{x:107,y:5},{x:107,y:32}],offhand:{x:34,y:19},preview:{x:72,y:5,width:34,height:45,figure:40},
  main:{x:8,y:53},destroy:{x:172,y:111},tabPitch:27} as const;
const catalogStack=(id:string):ItemStack=>Object.freeze({id,count:1});
export function catalogSlot(id:string):MenuSlot{
  const s=catalogStack(id);
  return{section:'catalog',label:'Item picker',get:()=>s,set:()=>{},mayPlace:()=>false};
}
export const destroySlot=():MenuSlot=>({section:'destroy',label:'Destroy item slot',get:()=>null,set:()=>{},mayPlace:()=>false});
export function creativeItems(state:CreativeState):readonly string[]{
  return state.tab==='search'?searchItems(state.query):tabItems(state.tab);
}
/** Where a tab sits (GUI px from the panel): its column in its row 27 px apart, Search and Survival Inventory in the
 *  right-hand column; top tabs 28 px above the panel, bottom tabs over its last 4 px. */
export function tabPosition(tab:CreativeTab):GuiPos&{edge:'left'|'right'|null}{
  const L=CREATIVE_LAYOUT,row=CREATIVE_TABS.filter(t=>t.top===tab.top);
  const right=tab.id==='search'||tab.id==='inventory';
  const x=right?L.size.width-TAB_WIDTH:row.filter(t=>t.id!=='search'&&t.id!=='inventory').indexOf(tab)*L.tabPitch;
  return{x,y:tab.top?-(TAB_HEIGHT-TAB_OVERLAP):L.size.height-TAB_OVERLAP,edge:x===0?'left':right?'right':null};
}
function tabsHtml(state:CreativeState,top:boolean):string{
  return`<div class="bc-tabs bc-tabs-${top?'top':'bottom'}" role="tablist" aria-label="Item groups">${CREATIVE_TABS.filter(t=>t.top===top).map(t=>{
    const p=tabPosition(t);
    return`<button type="button" class="bc-tab bc-at" role="tab" data-tab="${t.id}" data-row="${top?'top':'bottom'}"${p.edge?` data-edge="${p.edge}"`:''} `+
      `style="${placeStyle(p)}" aria-selected="${t.id===state.tab}" aria-label="${esc(t.title)}" title="${esc(t.title)}"><img alt="" data-icon="${t.icon}" draggable="false"></button>`;
  }).join('')}</div>`;
}
export function buildCreative(game:Game,menu:SlotMenu,state:CreativeState):ScreenBuild{
  const inv=game.inventory,tab=CREATIVE_TABS.find(t=>t.id===state.tab)??CREATIVE_TABS[0],L=CREATIVE_LAYOUT;
  let body:string;
  if(tab.id==='inventory'){
    menu.setup([...armorSlots(inv),...playerSlots(inv),offhandSlot(inv),destroySlot()],screenRule(equipRule));
    const [offhand]=menu.indexes('offhand'),[destroy]=menu.indexes('destroy');
    body=`<div class="bc-armor-slots" role="group" aria-label="Armor">${menu.indexes('armor').map((i,k)=>slotHtml(menu,i,'',L.armor[k])).join('')}</div>`+
      figureHtml(inv.armor,L.preview,L.preview.width,L.preview.height,L.preview.figure)+slotHtml(menu,offhand,'',L.offhand)+
      slotGrid(menu,menu.indexes('main'),9,'bc-main','Inventory',L.main)+slotGrid(menu,menu.indexes('hotbar'),9,'bc-hotbar-row','Hotbar',L.hotbar)+
      slotHtml(menu,destroy,'bc-s-destroy',L.destroy);
  }else{
    const items=creativeItems(state);
    menu.setup([...items.map(catalogSlot),...hotbarSlots(inv)],(m,i)=>{
      // Vanilla ItemPickerMenu: shift-clicking a hotbar slot deletes its stack.
      if(m.slots[i]?.section==='hotbar')m.slots[i].set(null);
      return false;
    });
    // The field edits natively; its text is drawn in the pixel font by the view (.bc-search-view, see searchFieldHtml).
    const search=tab.id==='search'?`<label class="bc-search bc-at" style="${placeStyle(L.search)}"><span class="bc-sr">Search items</span>`+
      `<input type="search" class="bc-search-input" autocomplete="off" spellcheck="false" value="${esc(state.query)}">`+
      '<span class="bc-search-view" aria-hidden="true"></span></label>':'';
    // Vanilla shows an empty search as empty slots; the message is only for assistive technology.
    const empty=items.length?'':'<p class="bc-empty bc-sr">No items match.</p>';
    body=`${search}<div class="bc-catalog bc-at" style="${placeStyle(L.catalog)}" role="group" aria-label="${esc(tab.title)}">${slotGrid(menu,menu.indexes('catalog'),9,'bc-catalog-grid')}${empty}</div>`+
      `<div class="bc-scroll bc-at" style="${placeStyle(L.scroll)}" data-scroll aria-hidden="true"><i class="bc-knob"></i></div>`+
      slotGrid(menu,menu.indexes('hotbar'),9,'bc-hotbar-row','Hotbar',L.hotbar);
  }
  return{id:'creative',title:tab.title,kind:`creative bc-creative-${tab.id}`,gui:L.size,titleAt:tab.id==='inventory'?'hidden':L.title,
    html:`${tabsHtml(state,true)}<div class="bc-creative-body">${body}</div>${tabsHtml(state,false)}`};
}

// ---- Search field ------------------------------------------------------------------------------------------------
// Vanilla draws the query in the GUI font (white with its shadow) from (82, 6), 80 GUI px wide, scrolled so the cursor
// stays in view; the cursor is an underscore at the end of the text and a thin bar inside it, and a selection shows
// as a white box with blue text. The input keeps editing, the caret index and the accessible name.
/** Width of the search field's text window in GUI px. */
export const SEARCH_WIDTH=80;
/** True when the pixel font can draw the query (otherwise the field shows its native text). */
export const searchDrawable=(value:string)=>hasGlyphs(value);
/** The text window's first GUI px for a cursor at `caret`, starting from the previous `scroll`: the least movement that
 *  keeps the cursor (6 px for the underscore at the end, 1 px for the bar) inside the window. */
export function searchScroll(value:string,caret:number,scroll:number):number{
  const cx=textWidth(value.slice(0,caret)),cw=caret>=value.length?6:1;
  const s=Math.min(Math.max(scroll,cx+cw-SEARCH_WIDTH),cx);
  return Math.max(0,Math.min(s,Math.max(0,textWidth(value)+6-SEARCH_WIDTH)));
}
/** Character index nearest to `x` GUI px from the start of the text (a click in the field). */
export function searchIndexAt(value:string,x:number):number{
  let w=0,i=0;
  for(const ch of value){
    const a=textWidth(ch);
    if(x<w+a/2)return i;
    w+=a;i+=ch.length;
  }
  return value.length;
}
/** The field's pixel-font view: the query scrolled by `scroll` GUI px, the selection [start, end) highlighted, and the
 *  blinking cursor at `caret` while the field has focus. */
export function searchFieldHtml(value:string,start:number,end:number,caret:number,focused:boolean,scroll:number):string{
  const part=(text:string)=>text?pixelTextHtml(text,'#ffffff',true):'';
  const sel=value.slice(start,end);
  let html=`<span class="bc-search-text" style="--sx:${-scroll}">${part(value.slice(0,start))}`+
    `${sel?`<span class="bc-search-sel">${pixelTextHtml(sel,'#0000ff')}</span>`:''}${part(value.slice(end))}</span>`;
  if(focused){
    const x=textWidth(value.slice(0,caret))-scroll;
    html+=`<i class="bc-search-caret${caret>=value.length?' is-end':''}" style="--cx:${x}"></i>`;
  }
  return html;
}
