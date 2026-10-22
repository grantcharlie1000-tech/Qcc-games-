import {describe,expect,test} from 'vitest';
import {createFakeGame} from './helpers/fake-game';
import {createInventory} from '../../../src/games/blockcraft/items/inventory';
import {ScreenController,type ScreenView} from '../../../src/games/blockcraft/ui/screen-controller';
import type {ScreenBuild} from '../../../src/games/blockcraft/ui/screen-common';
import {stateFor} from '../../../src/games/blockcraft/data/blocks';
import {durabilityBar,slotLabel,tooltipLines} from '../../../src/games/blockcraft/ui/screen-tooltip';
import type {BlockEntity,CraftingService,FurnaceEntity,ItemStack,RecipeView} from '../../../src/games/blockcraft/engine/contracts';

const st=(id:string,count=1):ItemStack=>({id,count});
const planks:RecipeView={kind:'shapeless',station:'inventory',width:1,height:1,grid:[['oak_log']],result:st('oak_planks',4)};
const table:RecipeView={kind:'shaped',station:'inventory',width:2,height:2,grid:[['oak_planks'],['oak_planks'],['oak_planks'],['oak_planks']],result:st('crafting_table')};
const furnaceRecipe:RecipeView={kind:'shaped',station:'crafting_table',width:3,height:3,
  grid:[['cobblestone'],['cobblestone'],['cobblestone'],['cobblestone'],null,['cobblestone'],['cobblestone'],['cobblestone'],['cobblestone']],result:st('furnace')};

function setup(mode:'survival'|'creative'='survival'){
  const game=createFakeGame({mode});
  const drops:{stack:ItemStack;y:number}[]=[];
  game.entities.dropItem=(stack,_x,_y,_z,velocity)=>{drops.push({stack:{...stack},y:velocity?.y??0});};
  game.inventory=createInventory(game);game.inventory.init?.();
  const changes:boolean[]=[];
  game.screenChanged=open=>{
    changes.push(open);
    if(open&&game.state==='playing')game.setState('screen');
    else if(!open&&game.state==='screen')game.setState('playing');
  };
  let played=0;game.play=()=>{played++;if(game.state==='paused'||game.state==='ready')game.setState('playing');};
  game.crafting={...game.crafting,
    match:(grid:readonly (ItemStack|null)[])=>{
      const filled=grid.filter(Boolean) as ItemStack[];
      if(filled.length===1&&filled[0].id==='oak_log')return{result:st('oak_planks',4),remainders:grid.map(()=>null)};
      if(filled.length===4&&filled.every(s=>s.id==='oak_planks'))return{result:st('crafting_table'),remainders:grid.map(()=>null)};
      return null;
    },
    allRecipes:()=>[planks,table,furnaceRecipe],recipesFor:id=>[planks,table,furnaceRecipe].filter(r=>r.result.id===id),
    smelt:id=>id==='raw_iron'?{result:st('iron_ingot'),xp:.7}:null,fuelSeconds:id=>id==='coal'?80:0} as CraftingService;
  const view={shown:[] as ScreenBuild[],hidden:0,draws:0,toasts:[] as string[],disposed:false,
    show(b:ScreenBuild){this.shown.push(b);},hide(){this.hidden++;},draw(){this.draws++;},toast(m:string){this.toasts.push(m);},dispose(){this.disposed=true;}};
  const ui=new ScreenController(game,view as ScreenView);ui.init();
  game.ui=ui;
  return{game,inv:game.inventory,ui,view,changes,drops,played:()=>played};
}
/** Menu index of player inventory slot `i` (0-8 hotbar, 9-35 main). */
const invIndex=(ui:ScreenController,i:number)=>ui.menu.slots.findIndex(s=>(s.section==='hotbar'||s.section==='main')&&s.label===(i<9?`Hotbar slot ${i+1}`:`Inventory slot ${i-8}`));

describe('opening and closing',()=>{
  test('the inventory action opens the survival inventory while playing and closes any screen',()=>{
    const {game,ui,view,changes}=setup();
    game.queued.add('inventory');ui.frame(.016);
    expect(ui.screen).toBe('inventory');expect(game.state).toBe('screen');expect(changes).toEqual([true]);expect(view.shown).toHaveLength(1);
    expect(view.shown[0].title).toBe('Inventory');
    ui.frame(.016);expect(ui.screen).toBe('inventory');expect(view.draws).toBe(2);
    game.queued.add('inventory');ui.frame(.016);
    expect(ui.screen).toBeNull();expect(game.state).toBe('playing');expect(changes).toEqual([true,false]);expect(view.hidden).toBe(1);
  });
  test('creative mode opens the creative inventory; a mode switch swaps an open inventory screen',()=>{
    const {game,ui}=setup('creative');
    game.queued.add('inventory');ui.frame(.016);expect(ui.screen).toBe('creative');
    game.setMode('survival');expect(ui.screen).toBe('inventory');expect(game.state).toBe('screen');
    game.setMode('creative');expect(ui.screen).toBe('creative');
  });
  test('the edge is consumed but nothing opens while paused or dead',()=>{
    const {game,ui}=setup();
    for(const state of ['dead','loading'] as const){
      game.setState(state);game.queued.add('inventory');game.queued.add('advancements');ui.frame(.016);
      expect(ui.screen).toBeNull();expect(game.queued.size).toBe(0);
    }
  });
  test('the advancements action opens and closes the advancements screen, but not over another screen',()=>{
    const {game,ui,view}=setup();
    game.queued.add('advancements');ui.frame(.016);expect(ui.screen).toBe('advancements');expect(view.shown[0].mount).toBeTypeOf('function');
    game.queued.add('advancements');ui.frame(.016);expect(ui.screen).toBeNull();
    ui.open('inventory');game.queued.add('advancements');ui.frame(.016);expect(ui.screen).toBe('inventory');
  });
  test('opening from the pause menu resumes play first (the Advancements button)',()=>{
    const {game,ui,played}=setup();game.setState('paused');
    ui.open('advancements');expect(played()).toBe(1);expect(ui.screen).toBe('advancements');expect(game.state).toBe('screen');
  });
  test('container screens need their block and block entity',()=>{
    const {game,ui,changes}=setup();
    ui.open('chest');ui.open('furnace',{x:0,y:0,z:0});ui.open('nothing' as never);
    expect(ui.screen).toBeNull();expect(changes).toEqual([]);
    const f:FurnaceEntity={kind:'furnace',input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0};
    game.blockEntities={get:()=>f};
    ui.open('furnace',{x:.4,y:2.9,z:-1.2});expect(ui.screen).toBe('furnace');expect(ui.at).toEqual({x:0,y:2,z:-2});
  });
  test('opening another screen replaces the open one and returns its items without leaving screen state',()=>{
    const {game,inv,ui,changes}=setup();
    ui.open('inventory');
    const grid=ui.layout!.grid!;grid.cells[0]=st('stone',3);grid.invalidate();ui.menu.cursor=st('dirt',2);
    ui.open('crafting_table');
    expect(ui.screen).toBe('crafting_table');expect(changes).toEqual([true]);expect(game.state).toBe('screen');
    expect(inv.count('stone')).toBe(3);expect(inv.count('dirt')).toBe(2);expect(ui.menu.cursor).toBeNull();
  });
  test('close returns the cursor and grid to the inventory and throws what does not fit',()=>{
    const {inv,ui,drops}=setup();
    for(let i=0;i<36;i++)inv.setSlot(i,st('dirt',64));inv.setSlot(4,st('stone',63));
    ui.open('crafting_table');
    const grid=ui.layout!.grid!;grid.cells[4]=st('stone',2);grid.invalidate();ui.menu.cursor=st('torch',5);
    ui.close();
    expect(inv.slots[4]).toEqual(st('stone',64));
    expect(drops.map(d=>d.stack)).toEqual([st('torch',5),st('stone',1)]);
    expect(grid.cells.every(c=>!c)).toBe(true);
  });
  test('dying closes the screen and scatters the carried items',()=>{
    const {game,inv,ui,drops}=setup();
    ui.open('inventory');ui.menu.cursor=st('diamond',2);
    game.setState('dead');ui.close();
    expect(inv.count('diamond')).toBe(0);expect(drops).toEqual([{stack:st('diamond',2),y:4}]);
  });
  test('a container screen closes itself when its block is broken or the player walks away',()=>{
    const {game,inv,ui}=setup();game.flat(60);
    game.world.set(0,61,0,stateFor('chest',{facing:'south'})!.id);
    const chest:BlockEntity={kind:'chest',items:new Array(27).fill(null)};
    game.blockEntities={get:(x,y,z)=>x===0&&y===61&&z===0?chest:undefined};
    game.player.teleport(.5,61,2.5);
    ui.open('chest',{x:0,y:61,z:0});expect(ui.layout!.title).toBe('Chest');
    expect(game.sounds.played.map(s=>s.name)).toEqual(['chest_open']);
    inv.setSlot(0,st('diamond',3));ui.menu.shiftClick(invIndex(ui,0));expect(chest.items[0]).toEqual(st('diamond',3));
    ui.frame(.016);expect(ui.screen).toBe('chest');
    game.player.teleport(.5,61,12);ui.frame(.016);expect(ui.screen).toBeNull();
    expect(game.sounds.played.map(s=>s.name)).toEqual(['chest_open','chest_close']);
    game.player.teleport(.5,61,2.5);ui.open('chest',{x:0,y:61,z:0});
    game.world.set(0,61,0,0);ui.frame(.016);expect(ui.screen).toBeNull();
  });
  test('a save made with a screen open keeps the cursor and grid items, and restoring puts them in the inventory',()=>{
    const {inv,ui}=setup();
    expect(ui.serialize()).toBeUndefined();
    inv.setSlot(0,st('diamond',5));inv.setSlot(1,st('oak_log',3));
    ui.open('inventory');expect(ui.serialize()).toBeUndefined();
    const cell=ui.menu.indexes('grid')[0];
    ui.menu.click(invIndex(ui,1),0);ui.menu.click(cell,0);ui.menu.click(invIndex(ui,0),0);
    expect(ui.menu.cursor).toEqual(st('diamond',5));expect(inv.count('diamond')+inv.count('oak_log')).toBe(0);
    // The shell saves and then disposes the game without closing the screen first (leaving, or an autosave before the tab dies).
    const saved=JSON.parse(JSON.stringify({inventory:inv.serialize!(),ui:ui.serialize()}));
    ui.dispose();
    const next=setup();next.inv.restore!(saved.inventory);next.ui.restore(saved.ui);
    expect(next.inv.count('diamond')).toBe(5);expect(next.inv.count('oak_log')).toBe(3);expect(next.ui.screen).toBeNull();
  });
  test('restoring returned items validates them, takes at most a cursor and a 3×3 grid, and throws what does not fit',()=>{
    const {inv,ui,drops}=setup();
    for(const v of [null,7,'x',[],{stacks:'no'},{stacks:[1,null,{id:'nope',count:1},{id:'dirt',count:-1},{id:'dirt',count:NaN}]}])expect(()=>ui.restore(v)).not.toThrow();
    expect(inv.slots.every(s=>!s)).toBe(true);
    ui.restore({stacks:new Array(20).fill({id:'dirt',count:1})});expect(inv.count('dirt')).toBe(10);
    for(let i=0;i<36;i++)inv.setSlot(i,st('stone',64));
    ui.restore({stacks:[{id:'torch',count:999},{id:'iron_pickaxe',count:1,damage:12}]});
    expect(drops.map(d=>d.stack)).toEqual([st('torch',64),{id:'iron_pickaxe',count:1,damage:12}]);
  });
  test('reset discards an open screen and dispose frees the view',()=>{
    const {inv,ui,view}=setup();
    ui.open('inventory');ui.menu.cursor=st('dirt',4);ui.reset();
    expect(ui.screen).toBeNull();expect(inv.count('dirt')).toBe(0);
    ui.dispose();expect(view.disposed).toBe(true);
  });
  test('toast forwards the action-bar message',()=>{
    const {ui,view}=setup();ui.toast('You can sleep only at night');expect(view.toasts).toEqual(['You can sleep only at night']);
  });
});

describe('keys while a screen is open',()=>{
  test('number keys and F swap the hovered slot with the hotbar or offhand only with an empty cursor; Q throws',()=>{
    const {inv,ui,drops}=setup();ui.open('inventory');
    inv.setSlot(20,st('stone',5));
    expect(ui.key('Digit3',false)).toBe(true);expect(inv.slots[2]).toBeNull();// nothing hovered
    ui.hovered=invIndex(ui,20);
    ui.key('Digit3',false);expect(inv.slots[2]).toEqual(st('stone',5));expect(inv.slots[20]).toBeNull();
    ui.key('Digit3',false);expect(inv.slots[20]).toEqual(st('stone',5));
    ui.key('KeyF',false);expect(inv.offhand).toEqual(st('stone',5));
    ui.key('KeyF',false);
    ui.menu.cursor=st('dirt');ui.key('Digit1',false);expect(inv.slots[0]).toBeNull();ui.menu.cursor=null;
    ui.key('KeyQ',false);expect(inv.slots[20]).toEqual(st('stone',4));
    ui.key('KeyQ',true);expect(inv.slots[20]).toBeNull();
    expect(drops.map(d=>d.stack)).toEqual([st('stone',1),st('stone',4)]);
    expect(ui.key('KeyW',false)).toBe(false);
  });
  test('keyboard activation: Enter clicks, Shift+Enter quick-moves, Ctrl+Enter right-clicks',()=>{
    const {inv,ui}=setup();ui.open('inventory');
    inv.setSlot(9,st('torch',8));const a=invIndex(ui,9);
    ui.activate(a,false,true);expect(ui.menu.cursor).toEqual(st('torch',4));
    ui.activate(a,false,false);expect(inv.slots[9]).toEqual(st('torch',8));expect(ui.menu.cursor).toBeNull();
    ui.activate(a,true,false);expect(inv.slots[0]).toEqual(st('torch',8));
  });
});

describe('creative tabs and search',()=>{
  test('switching tabs and searching rebuild the picker and keep the cursor',()=>{
    const {game,ui,view}=setup('creative');
    game.queued.add('inventory');ui.frame(.016);
    ui.menu.cursor=st('stone',3);
    ui.setTab('food');expect(view.shown.at(-1)!.title).toBe('Food & Drinks');expect(ui.menu.cursor).toEqual(st('stone',3));
    expect(ui.menu.slots.some(s=>s.section==='catalog'&&s.get()?.id==='bread')).toBe(true);
    ui.setTab('search');ui.setQuery('cooked');
    expect(ui.menu.indexes('catalog').map(i=>ui.menu.slots[i].get()!.id)).toEqual(['cooked_beef','cooked_porkchop','cooked_chicken','cooked_mutton','cooked_rabbit']);
    ui.setQuery('x'.repeat(80));expect(ui.creative.query).toHaveLength(50);
    ui.setTab('inventory');expect(ui.menu.indexes('destroy')).toHaveLength(1);
    ui.close();game.queued.add('inventory');ui.frame(.016);expect(ui.creative.tab).toBe('inventory');
  });
  test('every item, including every spawn egg, is listed in a tab besides Search',()=>{
    const {game,ui}=setup('creative');ui.open('creative');
    const seen=new Set<string>();
    for(const tab of ['building','colored','natural','functional','redstone','tools','combat','food','ingredients','spawn_eggs'] as const){
      ui.setTab(tab);for(const i of ui.menu.indexes('catalog'))seen.add(ui.menu.slots[i].get()!.id);
    }
    ui.setTab('search');ui.setQuery('');
    const all=ui.menu.indexes('catalog').map(i=>ui.menu.slots[i].get()!.id);
    expect(all.length).toBeGreaterThan(250);expect(all.filter(id=>!seen.has(id))).toEqual([]);
    expect(all.filter(id=>id.endsWith('_spawn_egg'))).toHaveLength(16);
    void game;
  });
});

describe('tooltips, labels and durability bars',()=>{
  test('tooltips name the item and show attack, armour, food and durability',()=>{
    expect(tooltipLines({id:'diamond_sword',count:1,damage:61})).toEqual(['Diamond Sword','When in Main Hand:',' 7 Attack Damage',' 1.6 Attack Speed','Durability: 1500 / 1561']);
    expect(tooltipLines(st('diamond_chestplate'))).toEqual(['Diamond Chestplate','When on Body:',' +8 Armor',' +2 Armor Toughness','Durability: 528 / 528']);
    expect(tooltipLines(st('golden_apple'))).toEqual(['Golden Apple','Restores 4 hunger (2 shanks)','Saturation 9.6','Regeneration II (0:05)','Absorption (2:00)']);
    expect(tooltipLines(st('rotten_flesh'))).toContain('Hunger (0:30), 80% chance');
    expect(tooltipLines(st('cow_spawn_egg'))).toEqual(['Cow Spawn Egg','Spawns a Cow']);
    // Shears have no attribute modifiers in vanilla, so no attack lines.
    expect(tooltipLines(st('shears'))).toEqual(['Shears','Durability: 238 / 238']);
    expect(tooltipLines(st('stone_hoe'))[1]).toBe('When in Main Hand:');
  });
  test('slot labels read the position and contents; the bar follows vanilla width and colour',()=>{
    expect(slotLabel('Hotbar slot 1',st('oak_planks',64))).toBe('Hotbar slot 1: Oak Planks, 64');
    expect(slotLabel('Helmet slot',null)).toBe('Helmet slot: empty');
    expect(slotLabel('Hotbar slot 2',{id:'iron_pickaxe',count:1,damage:125})).toBe('Hotbar slot 2: Iron Pickaxe, durability 125 of 250');
    expect(durabilityBar(st('iron_pickaxe'))).toBeNull();expect(durabilityBar(st('dirt',5))).toBeNull();
    expect(durabilityBar({id:'iron_pickaxe',count:1,damage:125})).toEqual({width:7/13,color:'#ffff00'});
    expect(durabilityBar({id:'iron_pickaxe',count:1,damage:249})).toEqual({width:0,color:'#ff0200'});
    expect(durabilityBar({id:'iron_pickaxe',count:1,damage:1})!.color).toBe('#02ff00');
  });
});

describe('recipe book',()=>{
  test('lists recipes that fit the grid, craftable first, and fills the grid from the inventory',()=>{
    const {inv,ui}=setup();ui.open('inventory');
    expect(ui.hasBook).toBe(true);ui.toggleBook(true);
    inv.setSlot(12,st('oak_planks',9));
    // The 3×3 furnace recipe does not fit the 2×2 grid.
    expect(ui.bookList().map(e=>[e.result.id,e.craftable])).toEqual([['crafting_table',true],['oak_planks',false]]);
    expect(ui.chooseRecipe(0,false)).toBe(true);
    expect(ui.layout!.grid!.cells).toEqual([st('oak_planks'),st('oak_planks'),st('oak_planks'),st('oak_planks')]);
    expect(inv.count('oak_planks')).toBe(5);
    expect(ui.menu.slots[ui.menu.indexes('result')[0]].get()).toEqual(st('crafting_table'));
    ui.toggleCraftable(true);expect(ui.bookList().map(e=>e.result.id)).toEqual(['crafting_table']);
  });
  test('shift fills as many crafts as the inventory allows; a missing recipe becomes a ghost',()=>{
    const {inv,ui}=setup();ui.open('crafting_table');ui.toggleBook(true);
    inv.setSlot(3,st('oak_planks',10));
    const entries=ui.bookList();const t=entries.findIndex(e=>e.result.id==='crafting_table');
    expect(ui.chooseRecipe(t,true)).toBe(true);
    const cells=ui.layout!.grid!.cells;
    expect(cells.filter(Boolean)).toEqual([st('oak_planks',2),st('oak_planks',2),st('oak_planks',2),st('oak_planks',2)]);
    expect(inv.count('oak_planks')).toBe(2);
    const f=ui.bookList().findIndex(e=>e.result.id==='furnace');
    expect(ui.chooseRecipe(f,false)).toBe(false);
    expect(inv.count('oak_planks')).toBe(10);// the grid went back first
    expect(ui.ghost?.result).toEqual(st('furnace'));expect(ui.ghost?.cells.filter(Boolean)).toHaveLength(8);
    ui.layout!.grid!.cells[0]=st('dirt');ui.afterChange();expect(ui.ghost).toBeNull();
  });
  test('items already in the grid count as available (vanilla StackedContents), and the list follows the grid',()=>{
    const {inv,ui}=setup();ui.open('inventory');ui.toggleBook(true);ui.toggleCraftable(true);
    inv.setSlot(0,st('oak_planks',4));
    expect(ui.bookList().map(e=>e.result.id)).toEqual(['crafting_table']);
    const grid=ui.menu.indexes('grid'),[result]=ui.menu.indexes('result');
    ui.menu.click(invIndex(ui,0),0);for(const cell of grid)ui.menu.click(cell,1);
    expect(inv.count('oak_planks')).toBe(0);expect(ui.menu.slots[result].get()).toEqual(st('crafting_table'));
    expect(ui.bookList().map(e=>[e.result.id,e.craftable])).toEqual([['crafting_table',true]]);
    // Choosing it takes the grid back first, then fills it again.
    expect(ui.chooseRecipe(0,false)).toBe(true);expect(ui.layout!.grid!.cells).toEqual([st('oak_planks'),st('oak_planks'),st('oak_planks'),st('oak_planks')]);
    expect(ui.bookList().map(e=>e.result.id)).toEqual(['crafting_table']);
    // Taking the result changes only the grid (the inventory is untouched): the cached list must not go stale.
    ui.menu.click(result,0);expect(ui.menu.cursor).toEqual(st('crafting_table'));
    expect(ui.bookList()).toEqual([]);
  });
  test('screens without a grid have no recipe book',()=>{
    const {game,ui}=setup();
    const f:FurnaceEntity={kind:'furnace',input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0};
    game.blockEntities={get:()=>f};ui.open('furnace',{x:0,y:0,z:0});
    ui.toggleBook(true);expect(ui.book.open).toBe(false);expect(ui.bookList()).toEqual([]);
  });
});
