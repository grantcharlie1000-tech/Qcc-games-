import {describe,expect,it} from 'vitest';
import {AIR,B,blockDef,blockId} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import {CH} from '../../../src/games/blockcraft/engine/constants';
import {lookOrder} from '../../../src/games/blockcraft/interact/placement';
import {createHarness,type Harness} from './interaction-harness';

const name=(h:Harness,x:number,y:number,z:number)=>{const id=h.game.world.get(x,y,z);return id<0?'unloaded':blockDef(id).name;};
/** Holds `item`, aims at a face of (x,y,z) and right-clicks once. */
function placeAt(h:Harness,item:string|null,x:number,y:number,z:number,n:[number,number,number],f?:{u?:number;v?:number}){
  if(item!==undefined)h.hold(item,item?16:0);
  h.aimFace(x,y,z,n[0],n[1],n[2],f);h.step();h.click('use');h.step(4);
}
const TOP:[number,number,number]=[0,1,0],SOUTH:[number,number,number]=[0,0,1];

describe('placement',()=>{
  it('places against the clicked face, plays the place sound, counts and uses one item',()=>{
    const h=createHarness(),placed:unknown[]=[];h.game.events.on('blockPlaced',e=>placed.push(e));
    placeAt(h,'dirt',0,59,-2,TOP);
    expect(name(h,0,60,-2)).toBe('dirt');expect(h.inv.slots[0]).toEqual(stack('dirt',15));
    expect(placed).toEqual([{x:0,y:60,z:-2,id:B.dirt}]);expect(h.game.stats.placed).toBe(1);
    expect(h.sounds()).toContain('place:gravel');expect(h.log.swings).toBe(1);
  });
  it('holding use repeats every 4 ticks',()=>{
    const h=createHarness();h.hold('cobblestone',64);h.aimFace(0,59,-2,0,1,0);h.step();
    h.press('use');h.down('use');h.step(9);h.down('use',false);
    // Click at tick 1, repeats at 5 and 9: a column grows toward the player's view.
    expect(64-h.inv.slots[0]!.count).toBe(3);
  });
  it('never places a solid block inside the player or a mob, but plants and torches may overlap mobs',()=>{
    const h=createHarness();
    placeAt(h,'dirt',0,59,0,TOP);expect(name(h,0,60,0)).toBe('air');
    h.game.world.set(0,60,-3,B.stone);h.ents.add('zombie',1,60,-1.5);
    placeAt(h,'dirt',0,60,-3,SOUTH);expect(name(h,0,60,-2)).toBe('air');
    placeAt(h,'torch',0,60,-3,SOUTH);expect(name(h,0,60,-2)).toBe('wall_torch_south');
  });
  it('replaces short grass, snow and fire in the clicked cell',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.shortGrass);
    placeAt(h,'cobblestone',0,60,-2,TOP);expect(name(h,0,60,-2)).toBe('cobblestone');
    h.game.world.set(1,60,-2,B.snow);placeAt(h,'oak_planks',1,60,-2,TOP);expect(name(h,1,60,-2)).toBe('oak_planks');
  });
  it('slabs: bottom on a top face, double when clicked on its top half',()=>{
    const h=createHarness();
    placeAt(h,'stone_slab',0,59,-2,TOP);expect(name(h,0,60,-2)).toBe('stone_slab');
    placeAt(h,'stone_slab',0,60,-2,TOP);expect(name(h,0,60,-2)).toBe('stone_slab_double');
    expect(h.inv.slots[0]!.count).toBe(15);
  });
  it('slabs: top on the upper half of a side, bottom on the lower half',()=>{
    const h=createHarness(),w=h.game.world;
    w.set(0,61,-3,B.stone);placeAt(h,'stone_slab',0,61,-3,SOUTH,{v:.8});expect(name(h,0,61,-2)).toBe('stone_slab_top');
    w.set(1,61,-3,B.stone);placeAt(h,'stone_slab',1,61,-3,SOUTH,{v:.2});expect(name(h,1,61,-2)).toBe('stone_slab');
  });
  it('slabs merge into a matching slab in the target cell, never with another kind',()=>{
    const h=createHarness(),w=h.game.world;
    w.set(0,61,-3,B.stone);w.set(0,61,-2,blockId('stone_slab_top'));
    placeAt(h,'stone_slab',0,61,-3,SOUTH,{v:.2});expect(name(h,0,61,-2)).toBe('stone_slab_double');
    w.set(1,60,-2,blockId('stone_slab'));
    placeAt(h,'oak_slab',1,60,-2,TOP);expect(name(h,1,60,-2)).toBe('stone_slab');expect(name(h,1,61,-2)).toBe('oak_slab');
  });
  it('stairs, chests, furnaces face the player; logs stand; leaves are persistent',()=>{
    const h=createHarness();// looking north, so the facing toward the player is south
    placeAt(h,'oak_stairs',0,59,-2,TOP);expect(name(h,0,60,-2)).toBe('oak_stairs_south');
    placeAt(h,'chest',1,59,-2,TOP);expect(name(h,1,60,-2)).toBe('chest_south');
    placeAt(h,'furnace',-1,59,-2,TOP);expect(name(h,-1,60,-2)).toBe('furnace_south');
    placeAt(h,'oak_log',3,59,-2,TOP);expect(name(h,3,60,-2)).toBe('oak_log');
    placeAt(h,'oak_leaves',-3,59,-2,TOP);expect(name(h,-3,60,-2)).toBe('oak_leaves_persistent');
    h.game.player.state.x=4.5;h.game.player.state.z=-1.5;// east of the log, looking west
    h.hold('cobblestone_stairs',4);h.aimFace(3,60,-2,0,1,0);h.click('use');
    expect(name(h,3,61,-2)).toBe('cobblestone_stairs_east');
    const h2=createHarness();placeAt(h2,'barrel',0,59,-2,TOP);expect(name(h2,0,60,-2)).toBe('barrel');
  });
  it('doors place both halves with the facing, and need room above',()=>{
    const h=createHarness();
    placeAt(h,'oak_door',0,59,-2,TOP);
    expect(name(h,0,60,-2)).toBe('oak_door_lower_closed_south');expect(name(h,0,61,-2)).toBe('oak_door_upper_closed_south');
    expect(h.inv.slots[0]!.count).toBe(15);
    h.game.world.set(1,61,-2,B.stone);placeAt(h,'oak_door',1,59,-2,TOP);expect(name(h,1,60,-2)).toBe('air');
  });
  it('beds place the foot at the click and the head away from the player',()=>{
    const h=createHarness();
    placeAt(h,'red_bed',0,59,-2,TOP);
    expect(name(h,0,60,-2)).toBe('bed_foot_south');expect(name(h,0,60,-3)).toBe('bed_head_south');
    h.game.world.set(1,60,-3,B.stone);placeAt(h,'red_bed',1,59,-2,TOP);expect(name(h,1,60,-2)).toBe('air');
  });
  it('torches stand on top faces, hang on opaque walls and fall back to standing beside glass',()=>{
    const h=createHarness(),w=h.game.world;
    placeAt(h,'torch',0,59,-2,TOP);expect(name(h,0,60,-2)).toBe('torch');
    w.set(1,60,-3,B.stone);placeAt(h,'torch',1,60,-3,SOUTH);expect(name(h,1,60,-2)).toBe('wall_torch_south');
    w.set(-1,60,-3,B.glass);placeAt(h,'torch',-1,60,-3,SOUTH);expect(name(h,-1,60,-2)).toBe('torch');
    // Floating wall of glass: nothing to hold the torch.
    w.set(2,62,-3,B.glass);placeAt(h,'torch',2,62,-3,SOUTH);expect(name(h,2,62,-2)).toBe('air');
  });
  it('ladders go on opaque walls only; lanterns only on top of blocks',()=>{
    const h=createHarness(),w=h.game.world;
    w.set(0,60,-3,B.stone);placeAt(h,'ladder',0,60,-3,SOUTH);expect(name(h,0,60,-2)).toBe('ladder_south');
    w.set(1,60,-3,B.glass);placeAt(h,'ladder',1,60,-3,SOUTH);expect(name(h,1,60,-2)).toBe('air');
    placeAt(h,'lantern',2,59,-2,TOP);expect(name(h,2,60,-2)).toBe('lantern');
    w.set(-1,62,-3,B.stone);placeAt(h,'lantern',-1,62,-3,SOUTH);expect(name(h,-1,62,-2)).toBe('air');
  });
  it('plants need soil, crops farmland, sugar cane water beside it, cactus free sides',()=>{
    const h=createHarness(),w=h.game.world;
    placeAt(h,'oak_sapling',0,59,-2,TOP);expect(name(h,0,60,-2)).toBe('air');
    w.set(0,59,-2,B.dirt);placeAt(h,'oak_sapling',0,59,-2,TOP);expect(name(h,0,60,-2)).toBe('oak_sapling');
    w.set(1,59,-2,B.dirt);placeAt(h,'wheat_seeds',1,59,-2,TOP);expect(name(h,1,60,-2)).toBe('air');
    w.set(1,59,-2,B.farmland);placeAt(h,'wheat_seeds',1,59,-2,TOP);expect(name(h,1,60,-2)).toBe('wheat_0');
    w.set(-1,59,-2,B.farmland);placeAt(h,'carrot',-1,59,-2,TOP);expect(name(h,-1,60,-2)).toBe('carrots_0');
    w.set(2,59,-3,B.sand);placeAt(h,'sugar_cane',2,59,-3,TOP);expect(name(h,2,60,-3)).toBe('air');
    w.set(3,59,-3,B.water);placeAt(h,'sugar_cane',2,59,-3,TOP);expect(name(h,2,60,-3)).toBe('sugar_cane');
    w.set(-2,59,-3,B.sand);w.set(-3,60,-3,B.stone);placeAt(h,'cactus',-2,59,-3,TOP);expect(name(h,-2,60,-3)).toBe('air');
    w.set(-3,60,-3,AIR);placeAt(h,'cactus',-2,59,-3,TOP);expect(name(h,-2,60,-3)).toBe('cactus');
  });
  it('lily pads go on top of a water source',()=>{
    const h=createHarness(),w=h.game.world;w.set(0,59,-2,B.water);
    placeAt(h,'lily_pad',0,59,-2,TOP);
    expect(name(h,0,60,-2)).toBe('lily_pad');expect(name(h,0,59,-2)).toBe('water');expect(h.inv.slots[0]!.count).toBe(15);
  });
  it('creative keeps the stack',()=>{
    const h=createHarness({mode:'creative'});placeAt(h,'stone',0,59,-2,TOP);
    expect(name(h,0,60,-2)).toBe('stone');expect(h.inv.slots[0]).toEqual(stack('stone',16));
  });
  it('the offhand places when the main hand passes; a main-hand placement failure stops it',()=>{
    const h=createHarness();h.inv.offhand=stack('torch',4);
    placeAt(h,'iron_pickaxe',0,59,-2,TOP);
    expect(name(h,0,60,-2)).toBe('torch');expect(h.inv.offhand).toEqual(stack('torch',3));
    placeAt(h,'dirt',0,59,0,TOP);expect(name(h,0,60,0)).toBe('air');expect(h.inv.offhand).toEqual(stack('torch',3));
  });
  it('sneaking with an item places against a crafting table instead of opening it',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.craftingTable);
    placeAt(h,'dirt',0,60,-2,SOUTH);expect(h.opened.map(o=>o.id)).toEqual(['crafting_table']);expect(name(h,0,60,-1)).toBe('air');
    h.game.player.state.sneaking=true;placeAt(h,'dirt',0,60,-2,TOP);
    expect(name(h,0,61,-2)).toBe('dirt');expect(h.opened).toHaveLength(1);
  });
  it('refuses to build above the height limit with a message',()=>{
    const h=createHarness();h.game.world.set(0,CH-1,-2,B.stone);h.stand(.5,CH-1,.5);
    placeAt(h,'stone',0,CH-1,-2,TOP);
    expect(h.game.toasts).toContain(`Height limit for building is ${CH}`);
  });
  it('orders look directions like vanilla',()=>{
    expect(lookOrder({x:0,y:-.2,z:-.98},0)[0]).toEqual([0,0,-1]);
    expect(lookOrder({x:0,y:-.99,z:-.1},0)[0]).toEqual([0,-1,0]);
    expect(lookOrder({x:.9,y:.1,z:.2},-1.35)[0]).toEqual([1,0,0]);
    expect(lookOrder({x:.9,y:.1,z:.2},-1.35)).toHaveLength(6);
  });
});
