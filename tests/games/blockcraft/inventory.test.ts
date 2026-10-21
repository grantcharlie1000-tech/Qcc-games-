import {describe,expect,test} from 'vitest';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {createInventory,cleanStack,throwVelocity,CREATIVE_STARTER} from '../../../src/games/blockcraft/items/inventory';
import type {ItemStack,Vec3} from '../../../src/games/blockcraft/engine/contracts';

interface Drop{stack:ItemStack;x:number;y:number;z:number;velocity?:Vec3;pickupDelay?:number}
function setup(mode:'survival'|'creative'='survival'){
  const game=createFakeGame({mode});
  const drops:Drop[]=[];
  game.entities.dropItem=(stack,x,y,z,velocity,pickupDelay)=>{drops.push({stack:{...stack},x,y,z,velocity,pickupDelay});};
  game.inventory=createInventory(game);game.inventory.init?.();
  return{game,inv:game.inventory,drops};
}
const st=(id:string,count=1,damage?:number):ItemStack=>damage?{id,count,damage}:{id,count};
const fill=(game:FakeGame,id='dirt')=>{for(let i=0;i<36;i++)game.inventory.setSlot(i,st(id,64));};

describe('inventory model',()=>{
  test('starts empty in survival with 36 slots, 4 armour and an offhand',()=>{
    const {inv}=setup();
    expect(inv.slots).toHaveLength(36);expect(inv.slots.every(s=>s===null)).toBe(true);
    expect(inv.armor).toEqual([null,null,null,null]);expect(inv.offhand).toBeNull();expect(inv.selected).toBe(0);
  });
  test('views are read-only snapshots that change only through the service',()=>{
    const {inv}=setup();
    inv.setSlot(3,st('stone',5));
    const view=inv.slots;
    expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view[3])).toBe(true);
    expect(()=>{(view as (ItemStack|null)[])[3]=null;}).toThrow();
    expect(()=>{(view[3] as ItemStack).count=9;}).toThrow();
    expect(inv.slots[3]).toEqual(st('stone',5));
    // The same view is reused until something changes (no per-frame allocation).
    expect(inv.slots).toBe(view);inv.setSlot(4,st('dirt'));expect(inv.slots).not.toBe(view);
    expect(Object.isFrozen(inv.armor)).toBe(true);
  });
  test('add merges into the selected slot, the offhand, then hotbar-first stacks, then fills empty slots',()=>{
    const {inv}=setup();
    inv.setSlot(5,st('cobblestone',60));inv.setSlot(20,st('cobblestone',10));inv.select(5);
    expect(inv.add(st('cobblestone',10))).toBe(0);
    expect(inv.slots[5]?.count).toBe(64);expect(inv.slots[20]?.count).toBe(16);
    inv.setOffhand(st('torch',60));
    expect(inv.add(st('torch',8))).toBe(0);
    expect(inv.offhand?.count).toBe(64);expect(inv.slots[0]).toEqual(st('torch',4));
    expect(inv.add(st('oak_planks',130))).toBe(0);
    expect(inv.slots[1]).toEqual(st('oak_planks',64));expect(inv.slots[2]).toEqual(st('oak_planks',64));expect(inv.slots[3]).toEqual(st('oak_planks',2));
  });
  test('tools and armour stack to 1, ender pearls to 16, and only equal damage merges',()=>{
    const {inv}=setup();
    expect(inv.add(st('iron_pickaxe',2))).toBe(0);
    expect(inv.slots[0]).toEqual(st('iron_pickaxe'));expect(inv.slots[1]).toEqual(st('iron_pickaxe'));
    inv.add(st('ender_pearl',20));expect(inv.slots[2]?.count).toBe(16);expect(inv.slots[3]?.count).toBe(4);
    inv.clear();
    inv.setSlot(0,st('bucket',3));inv.add(st('bucket',1));expect(inv.slots[0]?.count).toBe(4);
    inv.setSlot(1,st('diamond_sword',1,10));inv.add(st('diamond_sword',1,10));expect(inv.slots[2]).toEqual(st('diamond_sword',1,10));
  });
  test('add returns the overflow when full, and rejects unknown items',()=>{
    const {game,inv}=setup();fill(game);
    expect(inv.add(st('stone',5))).toBe(5);expect(inv.add(st('dirt',3))).toBe(3);
    expect(inv.add(st('not_an_item',4))).toBe(4);
    const {inv:inv2}=setup('creative');
    expect(inv2.add(st('stone',3))).toBe(0);expect(inv2.slots[0]).toEqual(st('stone',3));
  });
  test('select wraps, notifies listeners and only on change',()=>{
    const {inv}=setup();let calls=0;const off=inv.onChange(()=>calls++);
    inv.select(10);expect(inv.selected).toBe(1);inv.select(-1);expect(inv.selected).toBe(8);
    expect(calls).toBe(2);inv.select(8);expect(calls).toBe(2);
    off();inv.select(0);expect(calls).toBe(2);
    inv.select(Number.NaN);expect(inv.selected).toBe(0);
  });
  test('consumeHeld removes items and leaves a remainder; it is a no-op in creative',()=>{
    const {inv}=setup();
    inv.setSlot(0,st('bread',3));inv.consumeHeld();expect(inv.held()).toEqual(st('bread',2));
    inv.consumeHeld(5);expect(inv.held()).toBeNull();
    inv.setSlot(0,st('mushroom_stew'));inv.consumeHeld();expect(inv.held()).toEqual(st('bowl'));
    inv.setSlot(0,st('milk_bucket'));inv.consumeHeld();expect(inv.held()).toEqual(st('bucket'));
    const {game,inv:c}=setup('creative');c.setSlot(0,st('bread',3));c.consumeHeld();expect(c.held()).toEqual(st('bread',3));
    expect(game.sounds.played).toHaveLength(0);
  });
  test('damageHeld wears the held tool and breaks it with a sound',()=>{
    const {game,inv}=setup();
    inv.setSlot(0,st('wooden_pickaxe'));inv.damageHeld();expect(inv.held()).toEqual(st('wooden_pickaxe',1,1));
    inv.damageHeld(57);expect(inv.held()?.damage).toBe(58);
    inv.damageHeld();expect(inv.held()).toBeNull();
    expect(game.sounds.played.map(s=>s.name)).toEqual(['tool_break']);
    inv.setSlot(0,st('dirt',4));inv.damageHeld(3);expect(inv.held()).toEqual(st('dirt',4));
    const {inv:c}=setup('creative');c.setSlot(0,st('wooden_pickaxe'));c.damageHeld(100);expect(c.held()).toEqual(st('wooden_pickaxe'));
  });
  test('damageHeld wears the item in use from the offhand (a raised shield), else the main hand',()=>{
    const {game,inv}=setup();
    inv.setOffhand(st('shield'));(game.interaction as {using:unknown}).using={item:'shield',progress:1};
    inv.damageHeld(3);expect(inv.offhand).toEqual(st('shield',1,3));
    inv.setSlot(0,st('iron_sword'));inv.damageHeld(2);
    expect(inv.offhand).toEqual(st('shield',1,5));expect(inv.held()).toEqual(st('iron_sword'));
    (game.interaction as {using:unknown}).using=null;
    inv.damageHeld(2);expect(inv.held()).toEqual(st('iron_sword',1,2));expect(inv.offhand).toEqual(st('shield',1,5));
  });
  test('damageArmor wears each piece by max(1, floor(amount/4)) and breaks worn-out pieces',()=>{
    const {game,inv}=setup();
    expect(inv.setArmor('head',st('leather_helmet'))).toBe(true);
    expect(inv.setArmor('feet',st('iron_boots',1,190))).toBe(true);
    game.sounds.played.length=0;
    inv.damageArmor(3);expect(inv.armorIn('head')?.damage).toBe(1);expect(inv.armorIn('feet')?.damage).toBe(191);
    inv.damageArmor(9);expect(inv.armorIn('head')?.damage).toBe(3);expect(inv.armorIn('feet')?.damage).toBe(193);
    inv.damageArmor(0);expect(inv.armorIn('head')?.damage).toBe(3);
    inv.damageArmor(4*(195-193));expect(inv.armorIn('feet')).toBeNull();
    expect(game.sounds.played.map(s=>s.name)).toEqual(['tool_break']);
  });
  test('setArmor accepts only matching armour, plays equip, and null removes',()=>{
    const {game,inv}=setup();
    expect(inv.setArmor('head',st('iron_chestplate'))).toBe(false);expect(inv.setArmor('head',st('dirt'))).toBe(false);
    expect(inv.setArmor('chest',st('iron_chestplate'))).toBe(true);
    expect(inv.armor[1]).toEqual(st('iron_chestplate'));expect(inv.armorIn('chest')).toEqual(st('iron_chestplate'));
    expect(game.sounds.played.map(s=>s.name)).toEqual(['equip']);
    expect(inv.setArmor('chest',null)).toBe(true);expect(inv.armorIn('chest')).toBeNull();
  });
  test('setOffhand and swapHands exchange the held stack and the offhand',()=>{
    const {inv}=setup();
    inv.setSlot(0,st('torch',12));inv.setOffhand(st('shield'));
    inv.swapHands();expect(inv.held()).toEqual(st('shield'));expect(inv.offhand).toEqual(st('torch',12));
    inv.setOffhand(null);inv.swapHands();expect(inv.held()).toBeNull();expect(inv.offhand).toEqual(st('shield'));
  });
  test('count and remove cover the offhand, the main slots and armour',()=>{
    const {inv}=setup();
    inv.setSlot(4,st('arrow',10));inv.setSlot(30,st('arrow',5));inv.setOffhand(st('arrow',2));
    expect(inv.count('arrow')).toBe(17);
    expect(inv.remove('arrow',3)).toBe(3);expect(inv.offhand).toBeNull();expect(inv.slots[4]?.count).toBe(9);
    expect(inv.remove('arrow',100)).toBe(14);expect(inv.count('arrow')).toBe(0);
    expect(inv.remove('arrow',0)).toBe(0);
  });
  test('setSlot validates indexes and stacks',()=>{
    const {inv}=setup();
    inv.setSlot(-1,st('dirt'));inv.setSlot(36,st('dirt'));inv.setSlot(1.5,st('dirt'));
    expect(inv.slots.every(s=>s===null)).toBe(true);
    inv.setSlot(2,st('dirt',99));expect(inv.slots[2]).toEqual(st('dirt',64));
    inv.setSlot(3,st('nope',1));expect(inv.slots[3]).toBeNull();
    inv.setSlot(2,null);expect(inv.slots[2]).toBeNull();
    expect(cleanStack({id:'iron_pickaxe',count:1,damage:5000})).toEqual(st('iron_pickaxe',1,249));
    expect(cleanStack({id:'dirt',count:3,damage:4})).toEqual(st('dirt',3));
    expect(cleanStack({id:'dirt',count:0})).toBeNull();expect(cleanStack('dirt')).toBeNull();
  });
  test('dropHeld throws one or the whole stack forward from the eye with a 40 tick pickup delay',()=>{
    const {game,inv,drops}=setup();
    game.player.state.yaw=0;game.player.state.pitch=0;
    inv.setSlot(0,st('cobblestone',5));inv.dropHeld(false);
    expect(inv.held()).toEqual(st('cobblestone',4));
    expect(drops).toHaveLength(1);
    const d=drops[0];expect(d.stack).toEqual(st('cobblestone'));expect(d.pickupDelay).toBe(40);
    expect(d.y).toBeCloseTo(game.player.eye().y-.3);expect(d.velocity!.z).toBeLessThan(-5);
    inv.dropHeld(true);expect(inv.held()).toBeNull();expect(drops[1].stack).toEqual(st('cobblestone',4));
    inv.dropHeld(true);expect(drops).toHaveLength(2);
  });
  test('throwVelocity matches the vanilla 0.3 blocks/tick throw plus lift',()=>{
    const v=throwVelocity({x:0,y:0,z:-1},()=>.5);
    expect(v.z).toBeCloseTo(-6);expect(v.x).toBeCloseTo(0,0);expect(v.y).toBeCloseTo(2);
  });
  test('dropAll scatters every slot, armour piece and the offhand, then clears them',()=>{
    const {inv,drops}=setup();
    inv.setSlot(0,st('dirt',3));inv.setSlot(35,st('stone',64));inv.setArmor('legs',st('diamond_leggings'));inv.setOffhand(st('torch',4));
    inv.dropAll();
    expect(drops.map(d=>d.stack.id).sort()).toEqual(['diamond_leggings','dirt','stone','torch']);
    expect(drops.every(d=>d.pickupDelay===40&&Math.abs(d.velocity!.y-4)<1e-9&&Math.hypot(d.velocity!.x,d.velocity!.z)<=10)).toBe(true);
    expect(inv.slots.every(s=>!s)).toBe(true);expect(inv.armor.every(s=>!s)).toBe(true);expect(inv.offhand).toBeNull();
  });
  test('onChange fires for every mutation and unsubscribes',()=>{
    const {inv}=setup();let n=0;const off=inv.onChange(()=>n++);
    inv.add(st('dirt'));inv.setSlot(1,st('stone'));inv.remove('dirt',1);inv.setOffhand(st('torch'));inv.swapHands();inv.clear();
    expect(n).toBe(6);off();inv.add(st('dirt'));expect(n).toBe(6);
  });
  test('serialize and restore round-trip and ignore invalid data',()=>{
    const {inv}=setup();
    inv.setSlot(0,st('dirt',3));inv.setSlot(9,st('iron_pickaxe',1,12));inv.setArmor('head',st('iron_helmet'));inv.setOffhand(st('shield'));inv.select(4);
    const data=JSON.parse(JSON.stringify(inv.serialize!()));
    const {inv:copy}=setup();copy.restore?.(data);
    expect(copy.slots).toEqual(inv.slots);expect(copy.armor).toEqual(inv.armor);expect(copy.offhand).toEqual(inv.offhand);expect(copy.selected).toBe(4);
    const {inv:bad}=setup();
    for(const value of [null,7,'x',{slots:'no'},{slots:[1,2]},{slots:new Array(36).fill({id:'dirt',count:999})}])expect(()=>bad.restore?.(value)).not.toThrow();
    expect(bad.slots.every(s=>!s)).toBe(true);
    bad.restore?.({slots:new Array(36).fill(null),armor:[st('iron_boots'),null,null,{id:'x',count:1}],offhand:{id:'dirt',count:-2},selected:12});
    expect(bad.armor).toEqual([null,null,null,null]);expect(bad.offhand).toBeNull();expect(bad.selected).toBe(0);
  });
  test('reset clears everything; switching an empty inventory to creative stocks a starter hotbar',()=>{
    const {game,inv}=setup();
    inv.setSlot(3,st('dirt'));inv.select(3);inv.reset?.();
    expect(inv.slots.every(s=>!s)).toBe(true);expect(inv.selected).toBe(0);
    game.setMode('creative');
    expect(inv.slots.slice(0,9).map(s=>s?.id)).toEqual(CREATIVE_STARTER);
    game.setMode('survival');inv.setSlot(0,null);inv.setSlot(1,st('stone'));
    const before=inv.slots;game.setMode('creative');expect(inv.slots).toBe(before);
    inv.dispose?.();
  });
  test('the starter hotbar comes only with a switch from survival, never with the modeChanged a restore emits',()=>{
    // A creative world whose player emptied the inventory, reloaded: Engine.restore applies the saved settings, restores
    // every system, then emits modeChanged. A fresh engine may have started in either mode.
    for(const start of ['survival','creative'] as const){
      const {game,inv}=setup(start);
      game.settings.mode='creative';
      inv.restore!({slots:new Array(36).fill(null),armor:[null,null,null,null],offhand:null,selected:0});
      game.events.emit('modeChanged',{mode:'creative'});
      expect(inv.slots.every(s=>!s),start).toBe(true);
      // A repeated creative modeChanged without a switch does not stock it either.
      game.events.emit('modeChanged',{mode:'creative'});expect(inv.slots.every(s=>!s)).toBe(true);
      game.setMode('survival');game.setMode('creative');
      expect(inv.slots.slice(0,9).map(s=>s?.id)).toEqual(CREATIVE_STARTER);
    }
  });
});
