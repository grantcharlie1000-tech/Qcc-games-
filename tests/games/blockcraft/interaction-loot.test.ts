import {describe,expect,it} from 'vitest';
import {BLOCKS,blockId} from '../../../src/games/blockcraft/data/blocks';
import {ITEMS,stack,type ItemStack} from '../../../src/games/blockcraft/data/items';
import {lootDrops,blockXp,canHarvest} from '../../../src/games/blockcraft/interact/loot';
import type {ChangeCause} from '../../../src/games/blockcraft/engine/contracts';
import {createHarness,seeded} from './interaction-harness';

const tool=(id:string)=>stack(id);
const total=(drops:ItemStack[],id:string)=>drops.filter(s=>s.id===id).reduce((n,s)=>n+s.count,0);
/** Drops of `block` mined `n` times with a seeded random: counts per item id. */
function sample(block:string,held:ItemStack|null,n:number,seed=7){
  const random=seeded(seed),counts=new Map<string,number>(),hits=new Map<string,number>();
  for(let i=0;i<n;i++)for(const s of lootDrops(blockId(block),held,random)){counts.set(s.id,(counts.get(s.id)??0)+s.count);hits.set(s.id,(hits.get(s.id)??0)+1);}
  return{counts,hits};
}

describe('loot tables',()=>{
  it('stone drops cobblestone only with a pickaxe, deepslate drops cobbled deepslate',()=>{
    expect(lootDrops(blockId('stone'),tool('wooden_pickaxe'),Math.random)).toEqual([stack('cobblestone')]);
    expect(lootDrops(blockId('stone'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('stone'),tool('diamond_axe'),Math.random)).toEqual([]);
    expect(lootDrops(blockId('deepslate'),tool('stone_pickaxe'),Math.random)).toEqual([stack('cobbled_deepslate')]);
    expect(lootDrops(blockId('granite'),tool('golden_pickaxe'),Math.random)).toEqual([stack('granite')]);
  });
  it('ores need their tier and drop raw materials and gems, deepslate ores the same',()=>{
    for(const prefix of ['','deepslate_']){
      const ore=(name:string)=>blockId(`${prefix}${name}_ore`);
      expect(lootDrops(ore('coal'),tool('wooden_pickaxe'),Math.random)).toEqual([stack('coal')]);
      expect(lootDrops(ore('iron'),tool('wooden_pickaxe'),Math.random)).toEqual([]);
      expect(lootDrops(ore('iron'),tool('stone_pickaxe'),Math.random)).toEqual([stack('raw_iron')]);
      expect(lootDrops(ore('gold'),tool('stone_pickaxe'),Math.random)).toEqual([]);
      expect(lootDrops(ore('gold'),tool('iron_pickaxe'),Math.random)).toEqual([stack('raw_gold')]);
      expect(lootDrops(ore('diamond'),tool('iron_pickaxe'),Math.random)).toEqual([stack('diamond')]);
      expect(lootDrops(ore('diamond'),tool('golden_pickaxe'),Math.random)).toEqual([]);
      for(let i=0;i<40;i++){
        const r=total(lootDrops(ore('redstone'),tool('iron_pickaxe'),Math.random),'redstone');expect(r).toBeGreaterThanOrEqual(4);expect(r).toBeLessThanOrEqual(5);
        const l=total(lootDrops(ore('lapis'),tool('stone_pickaxe'),Math.random),'lapis_lazuli');expect(l).toBeGreaterThanOrEqual(4);expect(l).toBeLessThanOrEqual(9);
        const c=total(lootDrops(ore('copper'),tool('stone_pickaxe'),Math.random),'raw_copper');expect(c).toBeGreaterThanOrEqual(2);expect(c).toBeLessThanOrEqual(5);
      }
    }
    expect(lootDrops(blockId('emerald_ore'),tool('diamond_pickaxe'),Math.random)).toEqual([stack('emerald')]);
    expect(lootDrops(blockId('obsidian'),tool('iron_pickaxe'),Math.random)).toEqual([]);
    expect(lootDrops(blockId('obsidian'),tool('diamond_pickaxe'),Math.random)).toEqual([stack('obsidian')]);
  });
  it('lapis and redstone cover their whole vanilla ranges',()=>{
    const lapis=new Set<number>(),red=new Set<number>(),random=seeded(3);
    for(let i=0;i<400;i++){lapis.add(total(lootDrops(blockId('lapis_ore'),tool('stone_pickaxe'),random),'lapis_lazuli'));red.add(total(lootDrops(blockId('redstone_ore'),tool('iron_pickaxe'),random),'redstone'));}
    expect([...lapis].sort((a,b)=>a-b)).toEqual([4,5,6,7,8,9]);expect([...red].sort()).toEqual([4,5]);
  });
  it('grass, podzol and mycelium drop dirt; farmland drops dirt',()=>{
    for(const b of ['grass_block','podzol','mycelium','farmland','farmland_wet'])expect(lootDrops(blockId(b),null,Math.random)).toEqual([stack('dirt')]);
  });
  it('gravel drops flint 10% of the time, otherwise gravel',()=>{
    const {counts}=sample('gravel',null,20000);
    expect((counts.get('flint')??0)/20000).toBeCloseTo(.1,1);
    expect((counts.get('flint')??0)+(counts.get('gravel')??0)).toBe(20000);
  });
  it('leaves drop saplings 5%, sticks 2% (1-2) and apples 0.5% only from oak and dark oak; shears keep the leaves',()=>{
    const n=40000,{counts,hits}=sample('oak_leaves',null,n);
    expect((hits.get('oak_sapling')??0)/n).toBeCloseTo(.05,2);
    expect((hits.get('stick')??0)/n).toBeCloseTo(.02,2);
    expect((counts.get('stick')??0)/(hits.get('stick')??1)).toBeGreaterThan(1.3);
    expect((hits.get('apple')??0)/n).toBeGreaterThan(.003);expect((hits.get('apple')??0)/n).toBeLessThan(.008);
    expect(sample('birch_leaves',null,n).hits.get('apple')).toBeUndefined();
    expect((sample('dark_oak_leaves',null,n).hits.get('apple')??0)/n).toBeGreaterThan(.003);
    expect((sample('jungle_leaves',null,n).hits.get('jungle_sapling')??0)/n).toBeCloseTo(.025,2);
    expect(lootDrops(blockId('spruce_leaves'),tool('shears'),Math.random)).toEqual([stack('spruce_leaves')]);
    expect(lootDrops(blockId('oak_leaves_persistent'),tool('shears'),Math.random)).toEqual([stack('oak_leaves')]);
  });
  it('short grass and ferns drop wheat seeds 12.5% of the time, or themselves with shears',()=>{
    const {hits}=sample('short_grass',null,20000);
    expect((hits.get('wheat_seeds')??0)/20000).toBeCloseTo(.125,2);
    expect(lootDrops(blockId('short_grass'),tool('shears'),Math.random)).toEqual([stack('short_grass')]);
    expect(lootDrops(blockId('fern'),tool('shears'),Math.random)).toEqual([stack('fern')]);
    const dead=sample('dead_bush',null,2000).counts.get('stick')??0;expect(dead/2000).toBeCloseTo(1,0);
    expect(lootDrops(blockId('dead_bush'),tool('shears'),Math.random)).toEqual([stack('dead_bush')]);
  });
  it('fixed and ranged drops: glass, bookshelf, glowstone, melon, clay, snow',()=>{
    expect(lootDrops(blockId('glass'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('ice'),tool('diamond_pickaxe'),Math.random)).toEqual([]);
    expect(lootDrops(blockId('packed_ice'),tool('diamond_pickaxe'),Math.random)).toEqual([]);
    expect(lootDrops(blockId('bookshelf'),null,Math.random)).toEqual([stack('book',3)]);
    expect(lootDrops(blockId('clay'),null,Math.random)).toEqual([stack('clay_ball',4)]);
    const glow=new Set<number>(),melon=new Set<number>(),random=seeded(11);
    for(let i=0;i<400;i++){glow.add(total(lootDrops(blockId('glowstone'),null,random),'glowstone_dust'));melon.add(total(lootDrops(blockId('melon'),null,random),'melon_slice'));}
    expect([...glow].sort()).toEqual([2,3,4]);expect([...melon].sort()).toEqual([3,4,5,6,7]);
    expect(lootDrops(blockId('snow'),tool('wooden_shovel'),Math.random)).toEqual([stack('snowball')]);
    expect(lootDrops(blockId('snow'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('snow_block'),tool('stone_shovel'),Math.random)).toEqual([stack('snowball',4)]);
    expect(lootDrops(blockId('snow_block'),null,Math.random)).toEqual([]);
  });
  it('crops: mature wheat drops wheat and 1-4 seeds, young crops only seeds',()=>{
    expect(lootDrops(blockId('wheat_3'),null,Math.random)).toEqual([stack('wheat_seeds')]);
    const seeds=new Set<number>(),random=seeded(5);
    for(let i=0;i<300;i++){const d=lootDrops(blockId('wheat_7'),null,random);expect(total(d,'wheat')).toBe(1);seeds.add(total(d,'wheat_seeds'));}
    expect([...seeds].sort()).toEqual([1,2,3,4]);
    expect(lootDrops(blockId('carrots_1'),null,Math.random)).toEqual([stack('carrot')]);
    expect(lootDrops(blockId('potatoes_0'),null,Math.random)).toEqual([stack('potato')]);
    // Vanilla carrots and potatoes: one item, plus 1 + B(3, 4/7) more when mature (2-5 in all).
    const carrots=new Set<number>(),potatoes=new Set<number>();
    for(let i=0;i<300;i++){
      carrots.add(total(lootDrops(blockId('carrots_3'),null,random),'carrot'));
      potatoes.add(total(lootDrops(blockId('potatoes_3'),null,random),'potato'));
    }
    expect([...carrots].sort()).toEqual([2,3,4,5]);expect([...potatoes].sort()).toEqual([2,3,4,5]);
  });
  it('doors drop from the lower half, beds from the foot, double slabs two slabs',()=>{
    expect(lootDrops(blockId('oak_door_lower_closed_north'),null,Math.random)).toEqual([stack('oak_door')]);
    expect(lootDrops(blockId('oak_door_upper_open_east'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('bed_foot_south'),null,Math.random)).toEqual([stack('red_bed')]);
    expect(lootDrops(blockId('bed_head_south'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('stone_slab_double'),tool('wooden_pickaxe'),Math.random)).toEqual([stack('stone_slab',2)]);
    expect(lootDrops(blockId('stone_slab_top'),tool('wooden_pickaxe'),Math.random)).toEqual([stack('stone_slab')]);
    expect(lootDrops(blockId('stone_slab'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('oak_slab_double'),null,Math.random)).toEqual([stack('oak_slab',2)]);
  });
  it('states drop their family item: lit furnaces, wall torches, stairs, ladders',()=>{
    expect(lootDrops(blockId('furnace_lit_east'),tool('wooden_pickaxe'),Math.random)).toEqual([stack('furnace')]);
    expect(lootDrops(blockId('furnace_north'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('wall_torch_west'),null,Math.random)).toEqual([stack('torch')]);
    expect(lootDrops(blockId('oak_stairs_east'),null,Math.random)).toEqual([stack('oak_stairs')]);
    expect(lootDrops(blockId('cobblestone_stairs_east'),tool('stone_pickaxe'),Math.random)).toEqual([stack('cobblestone_stairs')]);
    expect(lootDrops(blockId('ladder_north'),null,Math.random)).toEqual([stack('ladder')]);
    expect(lootDrops(blockId('chest_south'),null,Math.random)).toEqual([stack('chest')]);
    expect(lootDrops(blockId('lantern'),null,Math.random)).toEqual([]);
    expect(lootDrops(blockId('lantern'),tool('wooden_pickaxe'),Math.random)).toEqual([stack('lantern')]);
    for(const b of ['air','water','lava_3','fire','bedrock'])expect(lootDrops(blockId(b),tool('diamond_pickaxe'),Math.random)).toEqual([]);
  });
  it('explosions drop tool-gated blocks as vanilla does when asked to',()=>{
    expect(lootDrops(blockId('stone'),null,Math.random,'explosion')).toEqual([stack('cobblestone')]);
    expect(lootDrops(blockId('iron_ore'),null,Math.random,'explosion')).toEqual([stack('raw_iron')]);
  });
  it('snow layers drop only when an entity breaks them: a player with a shovel or an explosion, not melting, pop-offs or water',()=>{
    const snow=blockId('snow');
    expect(lootDrops(snow,tool('wooden_shovel'),Math.random)).toEqual([stack('snowball')]);
    expect(lootDrops(snow,null,Math.random)).toEqual([]);
    expect(lootDrops(snow,null,Math.random,'explosion')).toEqual([stack('snowball')]);
    for(const cause of ['tick','fluid','growth','entity'] as const)expect(lootDrops(snow,null,Math.random,cause)).toEqual([]);
    // Other world loot is unaffected.
    expect(lootDrops(blockId('torch'),null,Math.random,'fluid')).toEqual([stack('torch')]);
  });
  it('blockDrops: no cause keeps the contract (requiresTool applies); a non-player cause drops like vanilla world loot',()=>{
    const {interaction}=createHarness(),drops=interaction.blockDrops as (id:number,tool:ItemStack|null,cause?:ChangeCause)=>ItemStack[];
    expect(drops(blockId('stone'),null)).toEqual([]);
    expect(drops(blockId('stone'),null,'player')).toEqual([]);
    expect(drops(blockId('stone'),null,'explosion')).toEqual([stack('cobblestone')]);
    expect(drops(blockId('deepslate_diamond_ore'),null,'explosion')).toEqual([stack('diamond')]);
    expect(drops(blockId('lantern'),null,'tick')).toEqual([stack('lantern')]);
    expect(drops(blockId('lantern'),tool('wooden_pickaxe'))).toEqual([stack('lantern')]);
    expect(drops(blockId('glass'),null,'explosion')).toEqual([]);
  });
  it('every block state drops only registered items and never throws',()=>{
    const random=seeded(9);
    for(const def of BLOCKS)for(const held of [null,tool('diamond_pickaxe'),tool('shears'),tool('iron_shovel'),tool('diamond_axe')])
      for(const s of lootDrops(def.id,held,random)){expect(ITEMS.has(s.id),`${def.name} drops ${s.id}`).toBe(true);expect(s.count).toBeGreaterThan(0);}
  });
  it('harvest rules follow requiresTool and tiers',()=>{
    expect(canHarvest(blockId('dirt'),null)).toBe(true);
    expect(canHarvest(blockId('cobblestone'),null)).toBe(false);
    expect(canHarvest(blockId('cobblestone'),tool('wooden_pickaxe'))).toBe(true);
    expect(canHarvest(blockId('diamond_ore'),tool('stone_pickaxe'))).toBe(false);
    expect(canHarvest(blockId('diamond_ore'),tool('iron_pickaxe'))).toBe(true);
    expect(canHarvest(blockId('snow'),tool('golden_shovel'))).toBe(true);
  });
  it('ore experience: coal 0-2, diamond and emerald 3-7, lapis 2-5, redstone 1-5, others none',()=>{
    const range=(b:string)=>{const s=new Set<number>(),random=seeded(13);for(let i=0;i<600;i++)s.add(blockXp(blockId(b),random));return [Math.min(...s),Math.max(...s)];};
    expect(range('coal_ore')).toEqual([0,2]);expect(range('deepslate_coal_ore')).toEqual([0,2]);
    expect(range('diamond_ore')).toEqual([3,7]);expect(range('emerald_ore')).toEqual([3,7]);
    expect(range('lapis_ore')).toEqual([2,5]);expect(range('deepslate_redstone_ore')).toEqual([1,5]);
    expect(range('iron_ore')).toEqual([0,0]);expect(range('stone')).toEqual([0,0]);
  });
});
