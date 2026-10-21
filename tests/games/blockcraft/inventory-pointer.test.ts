import {describe,expect,test} from 'vitest';
import {createFakeGame} from './helpers/fake-game';
import {createInventory} from '../../../src/games/blockcraft/items/inventory';
import {SlotMenu} from '../../../src/games/blockcraft/ui/slots';
import {SlotPointer,type SlotHit} from '../../../src/games/blockcraft/ui/slots-input';
import {menuHost} from '../../../src/games/blockcraft/ui/screen-common';
import {buildInventory} from '../../../src/games/blockcraft/ui/screen-inventory';
import {buildCreative} from '../../../src/games/blockcraft/ui/screen-creative';
import type {ItemStack} from '../../../src/games/blockcraft/engine/contracts';

const st=(id:string,count=1):ItemStack=>({id,count});
const LEFT=0,MIDDLE=1,RIGHT=2;
function setup(mode:'survival'|'creative'='survival'){
  const game=createFakeGame({mode});
  const drops:ItemStack[]=[];
  game.entities.dropItem=stack=>{drops.push({...stack});};
  game.inventory=createInventory(game);
  const menu=new SlotMenu(menuHost(game));
  buildInventory(game,menu);
  const pointer=new SlotPointer(menu);
  const at=(i:number):SlotHit=>({slot:menu.slots.findIndex(s=>s.label===(i<9?`Hotbar slot ${i+1}`:`Inventory slot ${i-8}`)),outside:false});
  const outside:SlotHit={slot:null,outside:true},panel:SlotHit={slot:null,outside:false};
  /** A mouse click (press and release on the same spot). */
  const click=(hit:SlotHit,t:number,button=LEFT,shift=false)=>{pointer.down(hit,button,shift,'mouse',t);pointer.up(hit,button,shift,t+20);};
  const tap=(hit:SlotHit,t:number)=>{pointer.down(hit,LEFT,false,'touch',t);pointer.up(hit,LEFT,false,t+40);};
  return{game,inv:game.inventory,menu,pointer,at,outside,panel,click,tap,drops};
}

describe('mouse clicks',()=>{
  test('a press on a stack picks it up at once and its release does nothing more',()=>{
    const {inv,menu,pointer,at}=setup();inv.setSlot(9,st('dirt',10));
    pointer.down(at(9),LEFT,false,'mouse',0);
    expect(menu.cursor).toEqual(st('dirt',10));expect(inv.slots[9]).toBeNull();
    pointer.up(at(9),LEFT,false,40);
    expect(menu.cursor).toEqual(st('dirt',10));expect(inv.slots[9]).toBeNull();
  });
  test('with a carried stack the click happens on release: left places all, right places one',()=>{
    const {inv,menu,pointer,at,click}=setup();menu.cursor=st('dirt',5);
    pointer.down(at(10),LEFT,false,'mouse',0);expect(inv.slots[10]).toBeNull();
    pointer.up(at(10),LEFT,false,30);expect(inv.slots[10]).toEqual(st('dirt',5));expect(menu.cursor).toBeNull();
    menu.cursor=st('stone',3);click(at(11),1000,RIGHT);
    expect(inv.slots[11]).toEqual(st('stone',1));expect(menu.cursor).toEqual(st('stone',2));
  });
  test('right press on a stack picks up half',()=>{
    const {inv,menu,at,click}=setup();inv.setSlot(9,st('torch',9));
    click(at(9),0,RIGHT);expect(menu.cursor).toEqual(st('torch',5));expect(inv.slots[9]).toEqual(st('torch',4));
  });
  test('a double click collects matching stacks; a slower second click places instead',()=>{
    const {inv,menu,at,click}=setup();inv.setSlot(9,st('dirt',10));inv.setSlot(20,st('dirt',7));inv.setSlot(3,st('dirt',2));
    click(at(9),0);click(at(9),150);
    expect(menu.cursor).toEqual(st('dirt',19));expect(inv.count('dirt')).toBe(0);
    const b=setup();b.inv.setSlot(9,st('dirt',10));b.inv.setSlot(20,st('dirt',7));
    b.click(b.at(9),0);b.click(b.at(9),400);
    expect(b.inv.slots[9]).toEqual(st('dirt',10));expect(b.menu.cursor).toBeNull();expect(b.inv.slots[20]).toEqual(st('dirt',7));
  });
  test('the double click must be on the same slot with the same button',()=>{
    const {inv,menu,at,click}=setup();inv.setSlot(9,st('dirt',10));inv.setSlot(20,st('dirt',7));
    click(at(9),0);click(at(12),100);
    expect(inv.slots[12]).toEqual(st('dirt',10));expect(inv.slots[20]).toEqual(st('dirt',7));expect(menu.cursor).toBeNull();
  });
  test('shift-click quick-moves on press; shift double-click moves every matching stack of that section',()=>{
    const {inv,at,click}=setup();
    inv.setSlot(9,st('cobblestone',64));inv.setSlot(10,st('cobblestone',30));inv.setSlot(11,st('dirt',5));
    click(at(9),0,LEFT,true);expect(inv.slots[0]).toEqual(st('cobblestone',64));expect(inv.slots[9]).toBeNull();
    click(at(9),100,LEFT,true);
    expect(inv.slots[1]).toEqual(st('cobblestone',30));expect(inv.slots[10]).toBeNull();expect(inv.slots[11]).toEqual(st('dirt',5));
  });
  test('shift-clicking a slot while carrying quick-moves that slot and keeps the cursor',()=>{
    const {inv,menu,at,click}=setup();inv.setSlot(9,st('dirt',4));menu.cursor=st('stone',2);
    click(at(9),0,LEFT,true);expect(inv.slots[0]).toEqual(st('dirt',4));expect(menu.cursor).toEqual(st('stone',2));
  });
});

describe('mouse drags',()=>{
  test('left drag splits the cursor evenly over the slots passed, right drag places one each',()=>{
    const {inv,menu,pointer,at}=setup();menu.cursor=st('dirt',10);
    pointer.down(at(9),LEFT,false,'mouse',0);for(const i of [9,10,11,10])pointer.move(at(i));
    expect(pointer.dragging).toEqual({type:0,slots:[at(9).slot,at(10).slot,at(11).slot]});
    pointer.up(at(10),LEFT,false,200);
    expect([9,10,11].map(i=>inv.slots[i])).toEqual([st('dirt',3),st('dirt',3),st('dirt',3)]);expect(menu.cursor).toEqual(st('dirt',1));
    expect(pointer.dragging).toBeNull();
    menu.cursor=st('torch',5);pointer.down(at(20),RIGHT,false,'mouse',1000);for(const i of [20,21,22])pointer.move(at(i));pointer.up(at(22),RIGHT,false,1100);
    expect([20,21,22].map(i=>inv.slots[i])).toEqual([st('torch',1),st('torch',1),st('torch',1)]);expect(menu.cursor).toEqual(st('torch',2));
  });
  test('a drag never takes more slots than carried items and skips slots that refuse the stack',()=>{
    const {inv,menu,pointer,at}=setup();inv.setSlot(10,st('stone',1));menu.cursor=st('dirt',2);
    const head={slot:menu.slots.findIndex(s=>s.armor==='head'),outside:false};
    pointer.down(at(9),LEFT,false,'mouse',0);for(const h of [at(9),head,at(10),at(11),at(12)])pointer.move(h);
    expect(pointer.dragging!.slots).toEqual([at(9).slot,at(11).slot]);
    pointer.up(at(12),LEFT,false,100);
    expect(inv.slots[9]).toEqual(st('dirt',1));expect(inv.slots[11]).toEqual(st('dirt',1));expect(inv.slots[12]).toBeNull();expect(menu.cursor).toBeNull();
  });
  test('pressing the other button cancels a drag and its release is ignored',()=>{
    const {inv,menu,pointer,at}=setup();menu.cursor=st('dirt',6);
    pointer.down(at(9),LEFT,false,'mouse',0);pointer.move(at(9));pointer.move(at(10));
    // The browser reports the second button's press too: it must not start a drag of its own.
    pointer.down(at(10),RIGHT,false,'mouse',40);
    expect(pointer.dragging!.slots).toEqual([at(9).slot,at(10).slot]);
    pointer.up(at(10),RIGHT,false,50);
    expect(pointer.dragging).toBeNull();expect(inv.slots[9]).toBeNull();expect(inv.slots[10]).toBeNull();
    pointer.up(at(10),LEFT,false,60);
    expect(inv.slots[10]).toBeNull();expect(menu.cursor).toEqual(st('dirt',6));
    // A middle press during a right drag cancels it the same way.
    pointer.down(at(11),RIGHT,false,'mouse',1000);pointer.move(at(11));pointer.move(at(12));
    pointer.down(at(12),MIDDLE,false,'mouse',1040);pointer.up(at(12),MIDDLE,false,1050);pointer.up(at(12),RIGHT,false,1060);
    expect(inv.slots[11]).toBeNull();expect(inv.slots[12]).toBeNull();expect(menu.cursor).toEqual(st('dirt',6));
    // The next plain click works again.
    pointer.down(at(13),LEFT,false,'mouse',2000);pointer.up(at(13),LEFT,false,2020);
    expect(inv.slots[13]).toEqual(st('dirt',6));expect(menu.cursor).toBeNull();
  });
  test('a one-slot drag is a plain click',()=>{
    const {inv,menu,pointer,at}=setup();menu.cursor=st('dirt',6);
    pointer.down(at(9),RIGHT,false,'mouse',0);pointer.move(at(9));pointer.up(at(9),RIGHT,false,50);
    expect(inv.slots[9]).toEqual(st('dirt',1));expect(menu.cursor).toEqual(st('dirt',5));
    // A press on a different item with a wobble still swaps like a click.
    inv.setSlot(12,st('stone',2));
    pointer.down(at(12),LEFT,false,'mouse',500);pointer.move(at(12));pointer.up(at(12),LEFT,false,560);
    expect(inv.slots[12]).toEqual(st('dirt',5));expect(menu.cursor).toEqual(st('stone',2));
  });
  test('the pressed slot joins the drag even when the first move report is already over another slot',()=>{
    const {inv,menu,pointer,at}=setup();menu.cursor=st('dirt',8);
    pointer.down(at(9),LEFT,false,'mouse',0);pointer.move(at(11));
    expect(pointer.dragging!.slots).toEqual([at(9).slot,at(11).slot]);
    pointer.up(at(11),LEFT,false,90);
    expect(inv.slots[9]).toEqual(st('dirt',4));expect(inv.slots[11]).toEqual(st('dirt',4));expect(menu.cursor).toBeNull();
  });
  test('creative middle click clones a full stack and a middle drag fills each slot with a full stack',()=>{
    const {game,inv,menu,pointer,at}=setup('creative');buildInventory(game,menu);
    inv.setSlot(9,st('dirt',3));
    pointer.down(at(9),MIDDLE,false,'mouse',0);pointer.up(at(9),MIDDLE,false,20);
    expect(menu.cursor).toEqual(st('dirt',64));expect(inv.slots[9]).toEqual(st('dirt',3));
    pointer.down(at(10),MIDDLE,false,'mouse',500);for(const i of [10,11])pointer.move(at(i));pointer.up(at(11),MIDDLE,false,600);
    expect(inv.slots[10]).toEqual(st('dirt',64));expect(inv.slots[11]).toEqual(st('dirt',64));expect(menu.cursor).toEqual(st('dirt',64));
  });
  test('middle click does nothing in survival',()=>{
    const {inv,menu,pointer,at}=setup();inv.setSlot(9,st('dirt',3));
    pointer.down(at(9),MIDDLE,false,'mouse',0);pointer.up(at(9),MIDDLE,false,20);
    expect(menu.cursor).toBeNull();expect(inv.slots[9]).toEqual(st('dirt',3));
  });
});

describe('clicks outside the panel',()=>{
  test('releasing outside throws the cursor: left all, right one; an empty cursor throws nothing',()=>{
    const {menu,outside,panel,click,drops}=setup();
    click(outside,0);expect(drops).toEqual([]);
    menu.cursor=st('dirt',5);click(outside,100,RIGHT);expect(drops).toEqual([st('dirt',1)]);expect(menu.cursor).toEqual(st('dirt',4));
    click(panel,1000);expect(menu.cursor).toEqual(st('dirt',4));
    click(outside,2000);expect(drops).toEqual([st('dirt',1),st('dirt',4)]);expect(menu.cursor).toBeNull();
  });
});

describe('touch',()=>{
  test('a tap picks up and a second tap elsewhere places, both on release',()=>{
    const {inv,menu,pointer,at,tap}=setup();inv.setSlot(9,st('dirt',10));inv.setSlot(10,st('stone',2));
    pointer.down(at(9),LEFT,false,'touch',0);expect(menu.cursor).toBeNull();
    pointer.up(at(9),LEFT,false,60);expect(menu.cursor).toEqual(st('dirt',10));
    tap(at(10),1000);expect(inv.slots[10]).toEqual(st('dirt',10));expect(menu.cursor).toEqual(st('stone',2));
  });
  test('a long press takes half, or places one from the cursor',()=>{
    const {inv,menu,pointer,at}=setup();inv.setSlot(9,st('torch',8));
    pointer.down(at(9),LEFT,false,'touch',0);pointer.longPress();
    expect(menu.cursor).toEqual(st('torch',4));expect(inv.slots[9]).toEqual(st('torch',4));
    pointer.up(at(9),LEFT,false,700);expect(menu.cursor).toEqual(st('torch',4));
    pointer.down(at(12),LEFT,false,'touch',2000);pointer.longPress();pointer.up(at(12),LEFT,false,2700);
    expect(inv.slots[12]).toEqual(st('torch',1));expect(menu.cursor).toEqual(st('torch',3));
  });
  test('a double tap collects matching stacks onto the cursor',()=>{
    const {inv,menu,at,tap}=setup();inv.setSlot(9,st('dirt',10));inv.setSlot(20,st('dirt',7));
    tap(at(9),0);tap(at(9),200);
    expect(menu.cursor).toEqual(st('dirt',17));expect(inv.count('dirt')).toBe(0);
  });
  test('dragging a finger with a cursor spreads it over the slots it crosses',()=>{
    const {inv,menu,pointer,at}=setup();menu.cursor=st('dirt',9);
    pointer.down(at(9),LEFT,false,'touch',0);pointer.move(at(9),true);pointer.move(at(10),true);pointer.move(at(11),true);
    pointer.up(at(11),LEFT,false,300);
    expect([9,10,11].map(i=>inv.slots[i])).toEqual([st('dirt',3),st('dirt',3),st('dirt',3)]);expect(menu.cursor).toBeNull();
  });
  test('dragging a stack with an empty cursor moves it, swaps with another item, snaps back from a refusing slot',()=>{
    const {inv,menu,pointer,at}=setup();inv.setSlot(9,st('dirt',10));inv.setSlot(11,st('stone',4));
    const drag=(from:SlotHit,to:SlotHit,t:number)=>{pointer.down(from,LEFT,false,'touch',t);pointer.move(from,true);pointer.move(to,true);
      expect(pointer.carrying).toBe(from.slot);pointer.up(to,LEFT,false,t+300);};
    drag(at(9),at(10),0);expect(inv.slots[9]).toBeNull();expect(inv.slots[10]).toEqual(st('dirt',10));expect(menu.cursor).toBeNull();
    drag(at(10),at(11),1000);expect(inv.slots[10]).toEqual(st('stone',4));expect(inv.slots[11]).toEqual(st('dirt',10));
    const head={slot:menu.slots.findIndex(s=>s.armor==='head'),outside:false};
    drag(at(11),head,2000);expect(inv.slots[11]).toEqual(st('dirt',10));expect(inv.armorIn('head')).toBeNull();expect(menu.cursor).toBeNull();
  });
  test('dragging a stack out of the panel throws it',()=>{
    const {inv,menu,pointer,at,outside,drops}=setup();inv.setSlot(9,st('dirt',10));
    pointer.down(at(9),LEFT,false,'touch',0);pointer.move(at(9),true);pointer.move(outside,true);pointer.up(outside,LEFT,false,300);
    expect(inv.slots[9]).toBeNull();expect(drops).toEqual([st('dirt',10)]);expect(menu.cursor).toBeNull();
  });
  test('the quick-move toggle turns taps into shift-clicks',()=>{
    const {inv,pointer,at,tap}=setup();inv.setSlot(9,st('dirt',10));pointer.quickMove=true;
    tap(at(9),0);expect(inv.slots[0]).toEqual(st('dirt',10));
  });
  test('a tap on the backdrop throws the cursor; a cancelled press does nothing',()=>{
    const {inv,menu,pointer,at,outside,tap,drops}=setup();inv.setSlot(9,st('dirt',10));
    pointer.down(at(9),LEFT,false,'touch',0);pointer.cancel();pointer.up(at(9),LEFT,false,50);
    expect(menu.cursor).toBeNull();expect(inv.slots[9]).toEqual(st('dirt',10));
    menu.cursor=st('stone',2);tap(outside,1000);expect(drops).toEqual([st('stone',2)]);
  });
  test('the creative picker hands out a full stack when dragged onto the hotbar',()=>{
    const {game,inv,menu,pointer}=setup('creative');
    buildCreative(game,menu,{tab:'building',query:''});
    const stone=menu.slots.findIndex(s=>s.section==='catalog'&&s.get()?.id==='stone');
    const hot=menu.indexes('hotbar')[2];
    pointer.down({slot:stone,outside:false},LEFT,false,'touch',0);pointer.move({slot:stone,outside:false},true);
    pointer.move({slot:hot,outside:false},true);pointer.up({slot:hot,outside:false},LEFT,false,300);
    expect(inv.slots[2]).toEqual(st('stone',64));expect(menu.cursor).toBeNull();
  });
});
