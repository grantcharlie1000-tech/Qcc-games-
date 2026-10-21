import {describe,expect,test} from 'vitest';
import {createFakeGame} from './helpers/fake-game';
import {createInventory} from '../../../src/games/blockcraft/items/inventory';
import {SlotMenu} from '../../../src/games/blockcraft/ui/slots';
import {menuHost,giveBack} from '../../../src/games/blockcraft/ui/screen-common';
import {buildInventory} from '../../../src/games/blockcraft/ui/screen-inventory';
import {buildCraftingTable} from '../../../src/games/blockcraft/ui/screen-crafting';
import {buildFurnace} from '../../../src/games/blockcraft/ui/screen-furnace';
import {buildChest,chestBlocked,chestPositions} from '../../../src/games/blockcraft/ui/screen-chest';
import {buildCreative} from '../../../src/games/blockcraft/ui/screen-creative';
import {blockId,stateFor} from '../../../src/games/blockcraft/data/blocks';
import type {BlockEntity,CraftingService,FurnaceEntity,GameEvents,ItemStack,RecipeMatch,Vec3} from '../../../src/games/blockcraft/engine/contracts';

const st=(id:string,count=1,damage?:number):ItemStack=>damage?{id,count,damage}:{id,count};
const plain=(s:ItemStack|null)=>s&&{...s};
/** Oak log → 4 planks (any cell); 2×2 planks → crafting table; milk bucket + wheat (shapeless) → bread, leaving the bucket. */
function fakeMatch(grid:readonly (ItemStack|null)[],width:number):RecipeMatch|null{
  const filled=grid.map((s,i)=>s?i:-1).filter(i=>i>=0);
  const none=grid.map(()=>null);
  if(filled.length===1&&grid[filled[0]]!.id==='oak_log')return{result:st('oak_planks',4),remainders:none};
  if(filled.length===4&&filled.every(i=>grid[i]!.id==='oak_planks')){
    const xs=filled.map(i=>i%width),ys=filled.map(i=>Math.floor(i/width));
    if(Math.max(...xs)-Math.min(...xs)===1&&Math.max(...ys)-Math.min(...ys)===1)return{result:st('crafting_table'),remainders:none};
  }
  const ids=filled.map(i=>grid[i]!.id).sort();
  if(ids.join()==='milk_bucket,wheat')return{result:st('bread'),remainders:grid.map(s=>s?.id==='milk_bucket'?st('bucket'):null)};
  return null;
}
function setup(mode:'survival'|'creative'='survival'){
  const game=createFakeGame({mode});
  const drops:{stack:ItemStack;scatter:boolean}[]=[];
  game.entities.dropItem=(stack,_x,_y,_z,velocity)=>{drops.push({stack:{...stack},scatter:Math.abs((velocity?.y??0)-4)<1e-9});};
  game.inventory=createInventory(game);game.inventory.init?.();
  const xp:number[]=[];game.survival.addXp=n=>{xp.push(n);};
  const crafted:GameEvents['itemCrafted'][]=[];game.events.on('itemCrafted',e=>crafted.push(e));
  game.crafting={...game.crafting,match:(grid,w)=>fakeMatch(grid,w),
    smelt:id=>['raw_iron','oak_log','beef'].includes(id)?{result:st(id==='raw_iron'?'iron_ingot':id==='beef'?'cooked_beef':'charcoal'),xp:.7}:null,
    fuelSeconds:id=>({coal:80,oak_planks:15,oak_log:15,lava_bucket:1000} as Record<string,number>)[id]??0} as CraftingService;
  const menu=new SlotMenu(menuHost(game));
  return{game,inv:game.inventory,menu,drops,xp,crafted};
}
/** Menu index of player inventory slot `i` (0-8 hotbar, 9-35 main). */
const invIndex=(menu:SlotMenu,i:number)=>menu.slots.findIndex(s=>(s.section==='hotbar'||s.section==='main')&&s.label===(i<9?`Hotbar slot ${i+1}`:`Inventory slot ${i-8}`));
function chestGame(positions:Vec3[],facing:'north'|'south'|'east'|'west'='south'){
  const ctx=setup();ctx.game.flat(60);
  const entities=new Map<string,BlockEntity>();
  for(const p of positions){ctx.game.world.set(p.x,p.y,p.z,stateFor('chest',{facing})!.id);entities.set(`${p.x},${p.y},${p.z}`,{kind:'chest',items:new Array(27).fill(null)});}
  ctx.game.blockEntities={get:(x,y,z)=>entities.get(`${x},${y},${z}`)};
  return{...ctx,entities};
}

describe('left and right clicks',()=>{
  test('left click picks up, places, merges with overflow and swaps',()=>{
    const ctx=setup();const m=ctx.menu;buildInventory(ctx.game,m);
    ctx.inv.setSlot(9,st('dirt',10));ctx.inv.setSlot(10,st('dirt',60));ctx.inv.setSlot(11,st('stone',5));
    const a=invIndex(m,9),b=invIndex(m,10),c=invIndex(m,11),e=invIndex(m,12);
    m.click(a,0);expect(m.cursor).toEqual(st('dirt',10));expect(ctx.inv.slots[9]).toBeNull();
    m.click(b,0);expect(ctx.inv.slots[10]).toEqual(st('dirt',64));expect(m.cursor).toEqual(st('dirt',6));
    m.click(c,0);expect(ctx.inv.slots[11]).toEqual(st('dirt',6));expect(m.cursor).toEqual(st('stone',5));
    m.click(e,0);expect(ctx.inv.slots[12]).toEqual(st('stone',5));expect(m.cursor).toBeNull();
  });
  test('right click takes half (rounded up) and places one at a time',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    inv.setSlot(9,st('torch',7));inv.setSlot(13,st('stone',2));
    const a=invIndex(menu,9),b=invIndex(menu,10),c=invIndex(menu,13);
    menu.click(a,1);expect(menu.cursor).toEqual(st('torch',4));expect(inv.slots[9]).toEqual(st('torch',3));
    menu.click(b,1);menu.click(b,1);expect(inv.slots[10]).toEqual(st('torch',2));expect(menu.cursor).toEqual(st('torch',2));
    menu.click(a,1);expect(inv.slots[9]).toEqual(st('torch',4));expect(menu.cursor).toEqual(st('torch',1));
    menu.click(c,1);expect(inv.slots[13]).toEqual(st('torch',1));expect(menu.cursor).toEqual(st('stone',2));
  });
  test('armour slots take only their armour, one at a time, and play equip',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    const head=menu.slots.findIndex(s=>s.armor==='head'),chest=menu.slots.findIndex(s=>s.armor==='chest');
    menu.cursor=st('dirt',3);menu.click(head,0);expect(inv.armorIn('head')).toBeNull();expect(menu.cursor).toEqual(st('dirt',3));
    menu.cursor=st('iron_helmet');menu.click(chest,0);expect(inv.armorIn('chest')).toBeNull();
    menu.click(head,0);expect(inv.armorIn('head')).toEqual(st('iron_helmet'));expect(menu.cursor).toBeNull();
    expect(game.sounds.played.map(s=>s.name)).toContain('equip');
    menu.click(head,0);expect(menu.cursor).toEqual(st('iron_helmet'));expect(inv.armorIn('head')).toBeNull();
  });
});

describe('shift-click quick move',()=>{
  test('inventory screen: armour equips, a shield goes to the offhand, main ⇄ hotbar',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    inv.setSlot(9,st('iron_helmet'));inv.setSlot(10,st('shield'));inv.setSlot(11,st('dirt',5));inv.setSlot(0,st('stone',3));
    menu.shiftClick(invIndex(menu,9));expect(inv.armorIn('head')).toEqual(st('iron_helmet'));expect(inv.slots[9]).toBeNull();
    menu.shiftClick(invIndex(menu,10));expect(inv.offhand).toEqual(st('shield'));
    menu.shiftClick(invIndex(menu,11));expect(inv.slots[1]).toEqual(st('dirt',5));
    menu.shiftClick(invIndex(menu,0));expect(inv.slots[9]).toEqual(st('stone',3));expect(inv.slots[0]).toBeNull();
    // A second helmet finds the slot taken and moves to the hotbar instead.
    inv.setSlot(12,st('leather_helmet'));menu.shiftClick(invIndex(menu,12));expect(inv.slots[0]).toEqual(st('leather_helmet'));
    // Armour comes back out to the main inventory.
    menu.shiftClick(menu.slots.findIndex(s=>s.armor==='head'));expect(inv.slots[10]).toEqual(st('iron_helmet'));
  });
  test('chest: container stacks go to the hotbar end first and merge; inventory goes into the chest',()=>{
    const {game,inv,menu,entities}=chestGame([{x:0,y:61,z:0}]);
    buildChest(game,menu,{x:0,y:61,z:0});
    const chest=entities.get('0,61,0') as {items:(ItemStack|null)[]};
    chest.items[0]=st('cobblestone',40);chest.items[1]=st('torch',8);inv.setSlot(20,st('torch',60));
    menu.shiftClick(0);expect(inv.slots[8]).toEqual(st('cobblestone',40));expect(chest.items[0]).toBeNull();
    menu.shiftClick(1);expect(inv.slots[20]).toEqual(st('torch',64));expect(inv.slots[7]).toEqual(st('torch',4));
    menu.shiftClick(invIndex(menu,8));expect(plain(chest.items[0])).toEqual(st('cobblestone',40));
    expect(Object.isFrozen(chest.items[0])).toBe(false);
  });
  test('crafting table: shift-click from the inventory fills the grid first',()=>{
    const {game,inv,menu}=setup();const b=buildCraftingTable(game,menu);
    inv.setSlot(9,st('oak_planks',64));inv.setSlot(10,st('oak_planks',64));
    menu.shiftClick(invIndex(menu,9));menu.shiftClick(invIndex(menu,10));
    expect(b.grid!.cells.slice(0,2)).toEqual([st('oak_planks',64),st('oak_planks',64)]);
  });
  test('furnace: smeltable items to the input, fuel to the fuel slot, others between main and hotbar',()=>{
    const {game,inv,menu}=setup();
    const f:FurnaceEntity={kind:'furnace',input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0};
    game.blockEntities={get:()=>f};
    buildFurnace(game,menu,{x:0,y:0,z:0});
    inv.setSlot(9,st('raw_iron',5));inv.setSlot(10,st('coal',3));inv.setSlot(11,st('dirt',2));inv.setSlot(12,st('bucket',4));
    menu.shiftClick(invIndex(menu,9));expect(f.input).toEqual(st('raw_iron',5));
    menu.shiftClick(invIndex(menu,10));expect(f.fuel).toEqual(st('coal',3));
    menu.shiftClick(invIndex(menu,11));expect(inv.slots[0]).toEqual(st('dirt',2));
    menu.shiftClick(invIndex(menu,12));expect(inv.slots[1]).toEqual(st('bucket',4));
    // Logs both smelt and burn: they go to the input like vanilla.
    f.input=null;inv.setSlot(13,st('oak_log',2));menu.shiftClick(invIndex(menu,13));expect(f.input).toEqual(st('oak_log',2));
  });
});

describe('collect, drag, keys and drops',()=>{
  test('double-click gathers part stacks first, then full ones, up to a stack',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    inv.setSlot(9,st('dirt',10));inv.setSlot(10,st('dirt',5));inv.setSlot(11,st('dirt',64));inv.setSlot(0,st('dirt',20));
    const a=invIndex(menu,9);menu.click(a,0);menu.collect(a);
    expect(menu.cursor).toEqual(st('dirt',64));
    expect(inv.slots[10]).toBeNull();expect(inv.slots[0]).toBeNull();expect(inv.slots[11]).toEqual(st('dirt',35));
  });
  test('left drag splits evenly, right drag places one each, and a drag never uses more slots than items',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    const s=[9,10,11,12].map(i=>invIndex(menu,i));
    inv.setSlot(12,st('stone',1));
    menu.cursor=st('dirt',10);menu.drag(s,0);
    expect([9,10,11].map(i=>inv.slots[i])).toEqual([st('dirt',3),st('dirt',3),st('dirt',3)]);expect(inv.slots[12]).toEqual(st('stone',1));
    expect(menu.cursor).toEqual(st('dirt',1));
    inv.clear();menu.cursor=st('torch',10);menu.drag(s,1);
    expect(inv.slots[9]).toEqual(st('torch',1));expect(menu.cursor).toEqual(st('torch',6));
    inv.clear();menu.cursor=st('torch',2);menu.drag(s,0);
    expect(inv.slots[9]).toEqual(st('torch',1));expect(inv.slots[10]).toEqual(st('torch',1));expect(inv.slots[11]).toBeNull();expect(menu.cursor).toBeNull();
    // A one-slot drag is a plain click.
    menu.cursor=st('torch',5);menu.drag([s[2]],0);expect(inv.slots[11]).toEqual(st('torch',5));
    expect(menu.dragPlan(s,0)).toEqual({slots:[],counts:[],left:0});
  });
  test('number keys swap with the hotbar and F with the offhand; a full hotbar stack splits into an armour slot',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    inv.setSlot(20,st('stone',5));inv.setSlot(2,st('dirt',7));
    const a=invIndex(menu,20);
    menu.hotkey(a,2);expect(inv.slots[2]).toEqual(st('stone',5));expect(inv.slots[20]).toEqual(st('dirt',7));
    menu.hotkey(a,4);expect(inv.slots[4]).toEqual(st('dirt',7));expect(inv.slots[20]).toBeNull();
    menu.hotkey(a,2);expect(inv.slots[20]).toEqual(st('stone',5));expect(inv.slots[2]).toBeNull();
    menu.hotkey(a,40);expect(inv.offhand).toEqual(st('stone',5));
    const head=menu.slots.findIndex(s=>s.armor==='head');
    menu.hotkey(head,4);expect(inv.armorIn('head')).toBeNull();
    inv.setSlot(4,st('iron_helmet'));menu.hotkey(head,4);expect(inv.armorIn('head')).toEqual(st('iron_helmet'));expect(inv.slots[4]).toBeNull();
  });
  test('Q throws one, Ctrl+Q the stack, only with an empty cursor; clicks outside drop the cursor',()=>{
    const {game,inv,menu,drops}=setup();buildInventory(game,menu);
    inv.setSlot(9,st('dirt',5));const a=invIndex(menu,9);
    menu.throwSlot(a,false);expect(inv.slots[9]).toEqual(st('dirt',4));
    menu.throwSlot(a,true);expect(inv.slots[9]).toBeNull();
    expect(drops.map(d=>d.stack)).toEqual([st('dirt',1),st('dirt',4)]);
    menu.cursor=st('stone',3);inv.setSlot(9,st('dirt',2));menu.throwSlot(a,true);expect(inv.slots[9]).toEqual(st('dirt',2));
    menu.outside(1);expect(menu.cursor).toEqual(st('stone',2));menu.outside(0);expect(menu.cursor).toBeNull();
    expect(drops.slice(2).map(d=>d.stack)).toEqual([st('stone',1),st('stone',2)]);
  });
});

describe('crafting results',()=>{
  test('taking a result consumes the grid and emits itemCrafted; it only merges onto a cursor when the whole result fits',()=>{
    const {game,menu,crafted}=setup();const b=buildInventory(game,menu);
    const [result]=menu.indexes('result'),grid=menu.indexes('grid');
    menu.cursor=st('oak_log',2);menu.click(grid[3],0);expect(menu.cursor).toBeNull();
    expect(menu.slots[result].get()).toEqual(st('oak_planks',4));
    menu.cursor=st('oak_planks',62);menu.click(result,0);expect(menu.cursor).toEqual(st('oak_planks',62));
    menu.cursor=st('oak_planks',60);menu.click(result,0);expect(menu.cursor).toEqual(st('oak_planks',64));
    expect(b.grid!.cells[3]).toEqual(st('oak_log',1));
    menu.cursor=null;menu.click(result,1);expect(menu.cursor).toEqual(st('oak_planks',4));expect(b.grid!.cells[3]).toBeNull();
    expect(menu.slots[result].get()).toBeNull();
    expect(crafted).toEqual([{stack:st('oak_planks',4),station:'inventory'},{stack:st('oak_planks',4),station:'inventory'}]);
  });
  test('shift-click on a result crafts as many as fit, into the hotbar end first',()=>{
    const {game,inv,menu,crafted}=setup();const b=buildCraftingTable(game,menu);
    b.grid!.cells[4]=st('oak_log',3);b.grid!.invalidate();
    menu.shiftClick(menu.indexes('result')[0]);
    expect(inv.slots[8]).toEqual(st('oak_planks',12));expect(b.grid!.cells[4]).toBeNull();
    expect(crafted).toHaveLength(3);expect(crafted[0].station).toBe('crafting_table');
  });
  test('shift-crafting into a nearly full inventory drops the part that does not fit, then stops',()=>{
    const {game,inv,menu,drops}=setup();const b=buildCraftingTable(game,menu);
    for(let i=0;i<36;i++)inv.setSlot(i,st('dirt',64));inv.setSlot(0,st('oak_planks',62));
    b.grid!.cells[0]=st('oak_log',5);b.grid!.invalidate();
    menu.shiftClick(menu.indexes('result')[0]);
    expect(inv.slots[0]).toEqual(st('oak_planks',64));expect(drops.map(d=>d.stack)).toEqual([st('oak_planks',2)]);
    expect(b.grid!.cells[0]).toEqual(st('oak_log',4));
  });
  test('recipe remainders stay in the grid; a 2×2 crafting table needs a square of planks',()=>{
    const {game,menu}=setup();const b=buildCraftingTable(game,menu);
    b.grid!.cells[0]=st('milk_bucket');b.grid!.cells[5]=st('wheat',3);b.grid!.invalidate();
    menu.click(menu.indexes('result')[0],0);
    expect(menu.cursor).toEqual(st('bread'));expect(b.grid!.cells[0]).toEqual(st('bucket'));expect(b.grid!.cells[5]).toEqual(st('wheat',2));
    const ctx=setup();const inv2=buildInventory(ctx.game,ctx.menu);
    inv2.grid!.cells.splice(0,4,st('oak_planks'),st('oak_planks'),st('oak_planks'),st('oak_planks'));inv2.grid!.invalidate();
    expect(ctx.menu.slots[ctx.menu.indexes('result')[0]].get()).toEqual(st('crafting_table'));
  });
  test('number key and Q on a result craft once into the hotbar or onto the ground',()=>{
    const {game,inv,menu,drops}=setup();const b=buildInventory(game,menu);
    b.grid!.cells[0]=st('oak_log',3);b.grid!.invalidate();
    const [result]=menu.indexes('result');
    menu.hotkey(result,5);expect(inv.slots[5]).toEqual(st('oak_planks',4));
    menu.hotkey(result,5);expect(inv.slots[5]).toEqual(st('oak_planks',4));expect(b.grid!.cells[0]).toEqual(st('oak_log',2));
    menu.throwSlot(result,false);expect(drops.map(d=>d.stack)).toEqual([st('oak_planks',4)]);expect(b.grid!.cells[0]).toEqual(st('oak_log',1));
  });
  test('closing returns grid and cursor items, or scatters them when the player died',()=>{
    const {game,inv,menu,drops}=setup();const b=buildInventory(game,menu);
    b.grid!.cells[1]=st('stone',3);menu.cursor=st('dirt',2);
    giveBack(game,[menu.cursor,...b.leftovers!()]);
    expect(inv.count('stone')).toBe(3);expect(inv.count('dirt')).toBe(2);expect(b.grid!.cells.every(c=>!c)).toBe(true);
    game.setState('dead');giveBack(game,[st('torch',4)]);
    expect(drops).toEqual([{stack:st('torch',4),scatter:true}]);expect(inv.count('torch')).toBe(0);
    game.settings.keepInventory=true;giveBack(game,[st('torch',4)]);expect(inv.count('torch')).toBe(4);
  });
});

describe('furnace slots',()=>{
  function furnace(){
    const ctx=setup();
    const f:FurnaceEntity={kind:'furnace',input:null,fuel:null,output:st('iron_ingot',5),burn:40,burnTotal:80,cook:2.5,xp:3.5};
    ctx.game.blockEntities={get:()=>f};
    const b=buildFurnace(ctx.game,ctx.menu,{x:0,y:0,z:0})!;
    return{...ctx,f,b};
  }
  test('the fuel slot takes fuel and one empty bucket; the output takes nothing',()=>{
    const {menu,f}=furnace();
    const fuel=menu.indexes('fuel')[0],out=menu.indexes('output')[0];
    menu.cursor=st('dirt',4);menu.click(fuel,0);expect(f.fuel).toBeNull();
    menu.cursor=st('bucket',3);menu.click(fuel,0);expect(f.fuel).toEqual(st('bucket'));expect(menu.cursor).toEqual(st('bucket',2));
    // Output only joins a carried stack when all of it fits.
    menu.cursor=st('iron_ingot',62);menu.click(out,0);expect(f.output).toEqual(st('iron_ingot',5));expect(menu.cursor).toEqual(st('iron_ingot',62));
    menu.cursor=st('iron_ingot',1);menu.click(out,0);expect(f.output).toBeNull();expect(menu.cursor).toEqual(st('iron_ingot',6));
    menu.cursor=st('coal',2);menu.click(out,0);expect(f.output).toBeNull();expect(menu.cursor).toEqual(st('coal',2));
  });
  test('taking output pays the stored xp once and emits itemCrafted; right click takes half',()=>{
    const {menu,f,xp,crafted,game}=furnace();game.random=()=>0;
    const out=menu.indexes('output')[0];
    menu.click(out,1);expect(menu.cursor).toEqual(st('iron_ingot',3));expect(f.output).toEqual(st('iron_ingot',2));
    expect(xp).toEqual([4]);expect(f.xp).toBe(0);
    expect(crafted).toEqual([{stack:st('iron_ingot',3),station:'furnace'}]);
    menu.cursor=null;menu.shiftClick(out);expect(f.output).toBeNull();expect(xp).toEqual([4]);expect(crafted).toHaveLength(2);
  });
  test('progress follows the block entity',()=>{
    const {b,f}=furnace();expect(b.progress!()).toEqual({flame:.5,arrow:.25});
    f.burnTotal=0;f.cook=20;expect(b.progress!()).toEqual({flame:0,arrow:1});
  });
  test('no screen without a furnace block entity',()=>{
    const ctx=setup();expect(buildFurnace(ctx.game,ctx.menu,{x:0,y:0,z:0})).toBeNull();expect(buildFurnace(ctx.game,ctx.menu)).toBeNull();
  });
});

describe('chests',()=>{
  test('two chests side by side open as one large chest with the left half on top',()=>{
    const {game,menu}=chestGame([{x:0,y:61,z:0},{x:1,y:61,z:0}]);
    expect(chestPositions(game.world,{x:1,y:61,z:0})).toEqual([{x:0,y:61,z:0},{x:1,y:61,z:0}]);
    expect(chestPositions(game.world,{x:0,y:61,z:0})).toEqual([{x:0,y:61,z:0},{x:1,y:61,z:0}]);
    const b=buildChest(game,menu,{x:1,y:61,z:0})!;
    expect(b.title).toBe('Large Chest');expect(menu.indexes('container')).toHaveLength(54);
  });
  test('rows pair from their start; different facings and front-to-back chests stay single',()=>{
    const row=chestGame([{x:0,y:61,z:0},{x:1,y:61,z:0},{x:2,y:61,z:0}]);
    expect(chestPositions(row.game.world,{x:0,y:61,z:0})).toEqual([{x:0,y:61,z:0}]);
    expect(chestPositions(row.game.world,{x:1,y:61,z:0})).toEqual([{x:1,y:61,z:0},{x:2,y:61,z:0}]);
    const deep=chestGame([{x:0,y:61,z:0},{x:0,y:61,z:1}]);
    expect(chestPositions(deep.game.world,{x:0,y:61,z:0})).toEqual([{x:0,y:61,z:0}]);
    const mixed=chestGame([{x:0,y:61,z:0}]);mixed.game.world.set(1,61,0,stateFor('chest',{facing:'north'})!.id);
    expect(chestPositions(mixed.game.world,{x:0,y:61,z:0})).toEqual([{x:0,y:61,z:0}]);
    const east=chestGame([{x:0,y:61,z:0},{x:0,y:61,z:1}],'east');
    // Facing east the viewer looks west; their left is south (+z), the top half.
    expect(chestPositions(east.game.world,{x:0,y:61,z:0})).toEqual([{x:0,y:61,z:1},{x:0,y:61,z:0}]);
  });
  test('a chest round-trip keeps items, plays chest sounds and closes when the chest is broken or far away',()=>{
    const {game,inv,menu,entities}=chestGame([{x:0,y:61,z:0}]);
    game.player.teleport(.5,61,2.5);
    const b=buildChest(game,menu,{x:0,y:61,z:0})!;b.opened!();
    inv.setSlot(0,st('diamond',3));menu.shiftClick(invIndex(menu,0));
    expect(plain((entities.get('0,61,0') as {items:(ItemStack|null)[]}).items[0])).toEqual(st('diamond',3));
    menu.shiftClick(0);expect(inv.slots[8]).toEqual(st('diamond',3));
    b.closed!();expect(game.sounds.played.map(s=>s.name)).toEqual(['chest_open','chest_close']);
    expect(b.valid!()).toBe(true);game.player.teleport(.5,61,12);expect(b.valid!()).toBe(false);
    game.player.teleport(.5,61,2.5);game.world.set(0,61,0,0);expect(b.valid!()).toBe(false);
  });
  test('a solid block on either half keeps the chest shut; glass does not, and barrels always open',()=>{
    const {game,menu}=chestGame([{x:0,y:61,z:0},{x:1,y:61,z:0}]);
    game.world.set(1,62,0,blockId('glass'));expect(buildChest(game,menu,{x:0,y:61,z:0})?.title).toBe('Large Chest');
    game.world.set(1,62,0,blockId('stone'));expect(buildChest(game,menu,{x:0,y:61,z:0})).toBeNull();
    game.world.set(5,61,0,blockId('barrel'));game.world.set(5,62,0,blockId('stone'));
    const barrel:BlockEntity={kind:'chest',items:new Array(27).fill(null)};
    const get=game.blockEntities.get;game.blockEntities={get:(x,y,z)=>x===5?barrel:get(x,y,z)};
    expect(buildChest(game,menu,{x:5,y:61,z:0})?.title).toBe('Barrel');
  });
  test('stacked chests open one by one; only redstone conductors hold a lid shut (vanilla isRedstoneConductor)',()=>{
    const {game,menu}=chestGame([{x:0,y:61,z:0},{x:0,y:62,z:0}]);
    expect(chestBlocked(game.world,{x:0,y:61,z:0})).toBe(false);
    expect(buildChest(game,menu,{x:0,y:61,z:0})?.title).toBe('Chest');
    expect(buildChest(game,menu,{x:0,y:62,z:0})?.title).toBe('Chest');
    for(const name of ['glowstone','redstone_block','glass']){
      game.world.set(0,63,0,blockId(name));expect(buildChest(game,menu,{x:0,y:62,z:0})?.title,name).toBe('Chest');
    }
    for(const name of ['oak_planks','crafting_table','barrel','stone']){
      game.world.set(0,63,0,blockId(name));expect(buildChest(game,menu,{x:0,y:62,z:0}),name).toBeNull();
    }
    game.world.set(0,63,0,stateFor('furnace',{facing:'south',lit:false})!.id);expect(buildChest(game,menu,{x:0,y:62,z:0})).toBeNull();
  });
});

describe('creative inventory',()=>{
  test('the item picker copies items: click one, shift a stack, add or remove one, delete with a different item',()=>{
    const {game,menu}=setup('creative');
    buildCreative(game,menu,{tab:'building',query:''});
    const stone=menu.slots.findIndex(s=>s.section==='catalog'&&s.get()?.id==='stone');
    const bricks=menu.slots.findIndex(s=>s.section==='catalog'&&s.get()?.id==='bricks');
    expect(stone).toBeGreaterThanOrEqual(0);
    menu.click(stone,0);expect(menu.cursor).toEqual(st('stone',1));
    menu.click(stone,0);expect(menu.cursor).toEqual(st('stone',2));
    menu.click(stone,1);expect(menu.cursor).toEqual(st('stone',1));
    menu.shiftClick(stone);expect(menu.cursor).toEqual(st('stone',64));
    menu.click(bricks,0);expect(menu.cursor).toBeNull();
    menu.shiftClick(bricks);expect(menu.cursor).toEqual(st('bricks',64));
    expect(menu.slots[stone].get()).toEqual(st('stone'));
  });
  test('hotbar row: number keys give full stacks, shift-click deletes, middle click clones',()=>{
    const {game,inv,menu}=setup('creative');
    buildCreative(game,menu,{tab:'combat',query:''});
    const sword=menu.slots.findIndex(s=>s.get()?.id==='diamond_sword');
    const torch=(()=>{buildCreative(game,menu,{tab:'functional',query:''});return menu.slots.findIndex(s=>s.get()?.id==='torch');})();
    menu.hotkey(torch,3);expect(inv.slots[3]).toEqual(st('torch',64));
    const hot=menu.indexes('hotbar');
    menu.middle(hot[3]);expect(menu.cursor).toEqual(st('torch',64));menu.cursor=null;
    menu.shiftClick(hot[3]);expect(inv.slots[3]).toBeNull();
    expect(sword).toBeGreaterThanOrEqual(0);
  });
  test('survival inventory tab: the delete slot deletes the cursor; shift-click on it clears everything',()=>{
    const {game,inv,menu}=setup('creative');
    buildCreative(game,menu,{tab:'inventory',query:''});
    const destroy=menu.indexes('destroy')[0];
    expect(menu.indexes('armor')).toHaveLength(4);expect(menu.indexes('offhand')).toHaveLength(1);expect(menu.inventoryRange).toHaveLength(36);
    menu.cursor=st('dirt',64);menu.click(destroy,0);expect(menu.cursor).toBeNull();
    inv.setSlot(5,st('stone',3));inv.setArmor('feet',st('iron_boots'));
    menu.shiftClick(destroy);expect(inv.count('stone')).toBe(0);expect(inv.armorIn('feet')).toBeNull();
  });
  test('middle click clones only in creative',()=>{
    const {game,inv,menu}=setup();buildInventory(game,menu);
    inv.setSlot(9,st('dirt',2));menu.middle(invIndex(menu,9));expect(menu.cursor).toBeNull();
  });
  test('search filters every item by name',()=>{
    const {game,menu}=setup('creative');
    buildCreative(game,menu,{tab:'search',query:'planks'});
    expect(menu.indexes('catalog').map(i=>menu.slots[i].get()!.id)).toEqual(['oak_planks','birch_planks','spruce_planks','jungle_planks','acacia_planks','dark_oak_planks','cherry_planks']);
    buildCreative(game,menu,{tab:'search',query:'spawn egg'});expect(menu.indexes('catalog')).toHaveLength(16);
  });
});
