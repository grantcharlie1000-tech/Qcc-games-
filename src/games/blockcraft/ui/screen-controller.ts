// Screen controller (inventory & screens area): the DOM-free half of the UI service. It owns which screen is
// open, the slot menu behind it, the cursor stack, the creative tab and search, the recipe book, the hovered
// slot for number keys / Q / F, and the open/close flow (screenChanged, items returned on close, chest sounds,
// closing when the block goes away, saving the cursor and grid items of an open screen). ui/screens.ts draws it and feeds it pointer and key input through a
// ScreenView; unit tests drive it with a fake view.
import type {ItemId,ItemStack} from '../data/items';
import type {Game,ScreenId,UIService,Vec3} from '../engine/contracts';
import {cleanStack} from '../items/inventory';
import {SlotMenu} from './slots';
import {SlotPointer} from './slots-input';
import {giveBack,menuHost,type ScreenBuild} from './screen-common';
import {buildInventory} from './screen-inventory';
import {buildCraftingTable} from './screen-crafting';
import {buildFurnace} from './screen-furnace';
import {buildChest} from './screen-chest';
import {buildCreative,type CreativeState} from './screen-creative';
import {buildAdvancements} from './screen-advancements';
import {CREATIVE_TABS,type CreativeTabId} from './screen-catalog';
import {availableItems,bookEntries,fillFromBook,fitsGrid,planRecipe,type BookEntry} from './screen-recipes';

export const SCREEN_IDS:readonly ScreenId[]=['inventory','creative','crafting_table','furnace','chest','advancements'];
/** Longest creative search query kept (vanilla's search box holds 50 characters). */
export const MAX_QUERY=50;
/** Most stacks a save hands back: the cursor and a 3×3 grid. */
export const MAX_SAVED_STACKS=10;
const plainStack=(s:ItemStack):ItemStack=>s.damage?{id:s.id,count:s.count,damage:s.damage}:{id:s.id,count:s.count};

/** What the controller needs from its renderer. */
export interface ScreenView{
  /** Draws a freshly built screen, replacing whatever was shown (also after a creative tab, search or book change). */
  show(build:ScreenBuild):void;
  /** Removes the screen (and unmounts mounted content). */
  hide():void;
  /** Every frame while a screen is open: redraw the slots, cursor and progress that changed. */
  draw(dt:number):void;
  /** Action-bar message above the hotbar. */
  toast(message:string):void;
  dispose():void;
}
/** Grid cells the recipe book suggests but the inventory cannot fill (vanilla ghost recipe), row-major. */
export interface GhostRecipe{result:ItemStack;cells:readonly (ItemId|null)[]}

const posOf=(at:Vec3|undefined):Vec3|undefined=>at&&Number.isFinite(at.x)&&Number.isFinite(at.y)&&Number.isFinite(at.z)
  ?{x:Math.floor(at.x),y:Math.floor(at.y),z:Math.floor(at.z)}:undefined;

export class ScreenController implements UIService{
  readonly menu:SlotMenu;
  readonly pointer:SlotPointer;
  /** Creative tab and search query, kept between openings like vanilla. */
  readonly creative:CreativeState={tab:'building',query:''};
  /** Recipe book panel (inventory and crafting table) and its craftable-only filter. */
  readonly book={open:false,craftableOnly:false};
  /** Slot under the mouse or with keyboard focus (number keys, F and Q act on it). */
  hovered:number|null=null;
  /** Recipe shown in the empty grid cells after choosing an uncraftable recipe. */
  ghost:GhostRecipe|null=null;
  private current:ScreenId|null=null;
  private build:ScreenBuild|null=null;
  private position:Vec3|null=null;
  private entries:BookEntry[]|null=null;private entriesGrid=-1;
  private unsubscribe:(()=>void)[]=[];

  constructor(readonly game:Game,private view:ScreenView){
    this.menu=new SlotMenu(menuHost(game));
    this.pointer=new SlotPointer(this.menu);
  }

  get screen():ScreenId|null{return this.current;}
  /** The open screen's build (layout, progress, grid), or null. */
  get layout():ScreenBuild|null{return this.build;}
  /** The block the open container screen belongs to. */
  get at():Vec3|null{return this.position;}

  // ---- UIService ------------------------------------------------------------------------------
  open(id:ScreenId,at?:Vec3){
    if(!SCREEN_IDS.includes(id))return;
    const g=this.game;
    // From the pause or start menu (its Advancements button): resume first, the click is the gesture.
    if((g.state==='paused'||g.state==='ready')&&!g.spawning)g.play();
    if(g.state!=='playing'&&g.state!=='screen')return;
    const pos=posOf(at);
    if((id==='furnace'||id==='chest')&&!pos)return;
    const wasOpen=this.current!==null;
    if(wasOpen)this.teardown(true);
    const build=this.make(id,pos);
    if(!build){if(wasOpen)g.screenChanged(false);return;}
    this.current=id;this.build=build;this.position=pos??null;
    this.view.show(build);
    build.opened?.();
    if(!wasOpen)g.screenChanged(true);
  }
  close(){
    if(!this.current)return;
    this.teardown(true);
    this.game.screenChanged(false);
  }
  toast(message:string){this.view.toast(String(message??''));}

  // ---- System ---------------------------------------------------------------------------------
  init(){
    const g=this.game;
    this.unsubscribe.push(
      g.inventory.onChange(()=>{this.entries=null;}),
      g.events.on('modeChanged',({mode})=>{
        // The inventory key opens the creative screen in creative mode: switch an open one over.
        if(this.current==='inventory'&&mode==='creative')this.open('creative');
        else if(this.current==='creative'&&mode==='survival')this.open('inventory');
      })
    );
  }
  frame(dt:number){
    const g=this.game;
    // Each edge is read every frame so a press never waits for a later state.
    const inventory=g.input.pressed('inventory'),advancements=g.input.pressed('advancements');
    if(inventory){
      if(this.current)this.close();
      else if(g.state==='playing')this.open(g.settings.mode==='creative'?'creative':'inventory');
    }else if(advancements){
      if(this.current==='advancements')this.close();
      else if(!this.current&&g.state==='playing')this.open('advancements');
    }
    if(!this.current)return;
    if(this.build?.valid&&!this.build.valid()){this.close();return;}
    this.view.draw(dt);
  }
  /** While a screen is open the cursor and crafting grid items live only here. The shell saves and then disposes
   *  without closing the screen (leaving the game), and the 5 s autosave may be the last one before a tab dies, so a
   *  save carries them; undefined when there are none. */
  serialize():{stacks:ItemStack[]}|undefined{
    if(!this.current)return undefined;
    const stacks:ItemStack[]=[];
    const c=this.menu.cursor;if(c)stacks.push(plainStack(c));
    for(const s of this.build?.grid?.cells??[])if(s)stacks.push(plainStack(s));
    return stacks.length?{stacks}:undefined;
  }
  /** Saved cursor and grid items go into the restored inventory (thrown when it is full), as closing would have done.
   *  The engine restores the inventory before the ui (creation order). */
  restore(data:unknown){
    const list=data&&typeof data==='object'?(data as {stacks?:unknown}).stacks:undefined;
    if(!Array.isArray(list))return;
    const stacks=list.slice(0,MAX_SAVED_STACKS).map(s=>cleanStack(s)).filter((s):s is ItemStack=>!!s);
    if(stacks.length)giveBack(this.game,stacks);
  }
  reset(){
    // A new world: nothing is handed back (the inventory was cleared too).
    if(this.current){this.pointer.cancel();this.menu.cursor=null;this.build?.leftovers?.();this.teardown(false);}
    this.creative.tab='building';this.creative.query='';this.book.open=false;
  }
  dispose(){
    for(const off of this.unsubscribe.splice(0))off();
    if(this.current){this.pointer.cancel();this.menu.cursor=null;this.build?.leftovers?.();this.teardown(false);}
    this.view.dispose();
  }

  // ---- Screens ----------------------------------------------------------------------------------
  private make(id:ScreenId,at:Vec3|undefined):ScreenBuild|null{
    const g=this.game,menu=this.menu;
    switch(id){
      case 'inventory':return buildInventory(g,menu);
      case 'crafting_table':return buildCraftingTable(g,menu,at);
      case 'furnace':return buildFurnace(g,menu,at);
      case 'chest':return buildChest(g,menu,at);
      case 'creative':return buildCreative(g,menu,this.creative);
      case 'advancements':menu.setup([],()=>false);return buildAdvancements(g);
    }
    return null;
  }
  /** Ends the open screen: cursor and grid items go back (`giveItems`), sounds, view removed. Leaves state alone. */
  private teardown(giveItems:boolean){
    const b=this.build,back:ItemStack[]=[];
    this.pointer.cancel();
    if(this.menu.cursor){back.push(this.menu.cursor);this.menu.cursor=null;}
    if(b?.leftovers)back.push(...b.leftovers());
    this.view.hide();
    b?.closed?.();
    this.current=null;this.build=null;this.position=null;this.hovered=null;this.ghost=null;this.entries=null;
    this.menu.setup([],()=>false);
    if(giveItems&&back.length)giveBack(this.game,back);
  }
  /** Rebuilds the open screen in place (creative tab or search, recipe book), keeping the cursor. */
  private rebuild(){
    const id=this.current;if(!id)return;
    this.pointer.cancel();this.hovered=null;
    const build=id==='creative'?buildCreative(this.game,this.menu,this.creative):this.build;
    if(!build)return;
    this.build=build;
    this.view.show(build);
  }

  // ---- Creative ---------------------------------------------------------------------------------
  setTab(tab:CreativeTabId){
    if(this.current!=='creative'||!CREATIVE_TABS.some(t=>t.id===tab)||this.creative.tab===tab)return;
    this.creative.tab=tab;this.rebuild();
  }
  setQuery(query:string){
    const q=String(query??'').slice(0,MAX_QUERY);
    if(this.creative.query===q)return;
    this.creative.query=q;
    if(this.current==='creative'&&this.creative.tab==='search')this.rebuild();
  }

  // ---- Recipe book --------------------------------------------------------------------------------
  /** The recipe book exists on screens with a crafting grid. */
  get hasBook():boolean{return !!this.build?.grid;}
  toggleBook(open=!this.book.open){
    if(!this.hasBook)return;
    this.book.open=open;this.entries=null;
    this.rebuild();
  }
  toggleCraftable(on=!this.book.craftableOnly){this.book.craftableOnly=on;this.entries=null;}
  /** Entries for the open grid, craftable first (only craftable ones with the filter on). Items in the grid count as
   *  available. Cached until the inventory or the grid changes. */
  bookList():readonly BookEntry[]{
    const grid=this.build?.grid;if(!grid||!this.book.open)return[];
    if(!this.entries||this.entriesGrid!==grid.version){
      const all=bookEntries(this.game.crafting,grid.width,grid.height,availableItems(this.game.inventory,grid.cells));
      this.entries=this.book.craftableOnly?all.filter(e=>e.craftable):all;
      this.entriesGrid=grid.version;
    }
    return this.entries;
  }
  /** Chooses a recipe book entry: fills the grid from the inventory (`all`: as many crafts as possible), or shows it as a
   *  ghost in the grid when the ingredients are missing. Returns true when the grid was filled. */
  chooseRecipe(index:number,all:boolean):boolean{
    const grid=this.build?.grid,entry=this.bookList()[index];if(!grid||!entry)return false;
    const g=this.game;
    // Items already in the grid go back first so they can be used.
    const filled=fillFromBook(g.crafting,g.inventory,grid,entry,all,s=>this.menu.give(s));
    this.entries=null;
    if(filled){this.ghost=null;return true;}
    const recipe=entry.recipes.find(r=>fitsGrid(r,grid.width,grid.height));
    // Any alternative per cell, as if the inventory held everything.
    const plan=recipe?planRecipe(recipe,grid.width,grid.height,new Map(recipe.grid.flatMap(c=>c?c.map(id=>[id,64] as [ItemId,number]):[]))):null;
    this.ghost=plan?{result:entry.result,cells:plan}:null;
    return false;
  }

  // ---- Keys ------------------------------------------------------------------------------------
  /** A key pressed while a screen is open (not in a text field). Returns true when the screen used it. */
  key(code:string,ctrl:boolean):boolean{
    if(!this.current||this.current==='advancements')return false;
    const m=this.menu,h=this.hovered,digit=/^Digit([1-9])$/.exec(code);
    if(digit||code==='KeyF'){
      // Vanilla: number keys and the offhand key swap with the hovered slot while the cursor is empty.
      if(h!==null&&!m.cursor&&!this.pointer.active){m.hotkey(h,digit?Number(digit[1])-1:40);this.afterChange();}
      return true;
    }
    if(code==='KeyQ'){
      if(h!==null&&!this.pointer.active){m.throwSlot(h,ctrl);this.afterChange();}
      return true;
    }
    return false;
  }
  /** Keyboard activation of a slot: Enter/Space left click, with Shift a quick move, with Ctrl (or the menu key) a right click. */
  activate(index:number,shift:boolean,right:boolean){
    if(!this.current||!this.menu.slots[index]||this.pointer.active)return;
    if(shift)this.menu.shiftClick(index);else this.menu.click(index,right?1:0);
    this.afterChange();
  }
  /** Clears the ghost recipe once the grid holds anything. */
  afterChange(){
    const grid=this.build?.grid;
    if(this.ghost&&grid?.cells.some(Boolean))this.ghost=null;
  }
}
