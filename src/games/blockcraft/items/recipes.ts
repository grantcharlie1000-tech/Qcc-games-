// Crafting recipes (vanilla Java 1.20/1.21) for every craftable item in data/items.ts.
// Shaped recipes are written like the vanilla JSON: rows of key characters, ' ' for an empty slot. Every shaped recipe
// also matches mirrored left-to-right and anywhere in the grid (see items/crafting.ts). Ingredients name an item id,
// a group `#name` (GROUPS, standing for vanilla item tags such as #planks) or an explicit list of alternatives.
import {WOOD_TYPES,WOOL_COLOURS} from '../data/blocks';
import {ITEMS,WOOD_LOGS,WOOD_PLANKS,type ItemId,type ItemStack} from '../data/items';
import type {Ingredient} from '../engine/contracts';

/** Item groups standing for vanilla item tags (only the members that exist in this game). */
export const GROUPS={
  planks:WOOD_PLANKS,
  logs:WOOD_LOGS,
  wool:WOOL_COLOURS.map(c=>`${c}_wool`),
  /** #stone_tool_materials and #stone_crafting_materials: cobblestone, cobbled deepslate (and blackstone, absent here). */
  stone_tool_materials:['cobblestone','cobbled_deepslate'],
  stone_crafting_materials:['cobblestone','cobbled_deepslate'],
  /** #coals: torches. */
  coals:['coal','charcoal'],
  /** TNT and glass accept either sand. */
  sand:['sand','red_sand'],
  /** #wooden_slabs: barrels. */
  wooden_slabs:['oak_slab']
} as const satisfies Record<string,readonly ItemId[]>;
export type GroupName=keyof typeof GROUPS;
/** An item id, a group (`#planks`) or a list of alternatives. */
export type IngredientSpec=ItemId|`#${GroupName}`|readonly ItemId[];

export interface ShapedRecipe{readonly kind:'shaped';readonly width:number;readonly height:number;
  /** Row-major, width×height; null = must stay empty. */
  readonly grid:readonly Ingredient[];readonly result:ItemStack}
export interface ShapelessRecipe{readonly kind:'shapeless';readonly ingredients:readonly (readonly ItemId[])[];readonly result:ItemStack}
export type CraftingRecipe=ShapedRecipe|ShapelessRecipe;

/** Resolves an ingredient to its frozen list of item ids; throws on unknown groups or items (static data must be right). */
export function ingredient(spec:IngredientSpec):readonly ItemId[]{
  const list:readonly ItemId[]=typeof spec!=='string'?spec:spec.startsWith('#')?GROUPS[spec.slice(1) as GroupName]:[spec];
  if(!list?.length)throw new Error(`Unknown ingredient ${String(spec)}`);
  for(const id of list)if(!ITEMS.has(id))throw new Error(`Unknown ingredient item ${id}`);
  return Object.freeze([...list]);
}
const frozenStack=(s:ItemStack):ItemStack=>{
  if(!ITEMS.has(s.id)||!Number.isInteger(s.count)||s.count<1)throw new Error(`Bad recipe result ${s.id}`);
  return Object.freeze({id:s.id,count:s.count});
};
/** A shaped recipe from vanilla-style rows (' ' = empty) and a key. Rows must be 1..3 equal-length strings. */
export function shaped(result:ItemStack,rows:readonly string[],key:Readonly<Record<string,IngredientSpec>>):ShapedRecipe{
  const height=rows.length,width=rows[0]?.length??0;
  if(height<1||height>3||width<1||width>3||rows.some(r=>r.length!==width))throw new Error(`Bad pattern for ${result.id}`);
  const resolved=new Map(Object.entries(key).map(([k,spec])=>[k,ingredient(spec)]));
  const grid=rows.join('').split('').map(c=>{
    if(c===' ')return null;
    const list=resolved.get(c);if(!list)throw new Error(`Unknown key '${c}' in ${result.id}`);
    return list;
  });
  if(grid.every(c=>c===null))throw new Error(`Empty pattern for ${result.id}`);
  return Object.freeze({kind:'shaped',width,height,grid:Object.freeze(grid),result:frozenStack(result)});
}
/** A shapeless recipe: one grid slot per ingredient, in any order and position. */
export function shapeless(result:ItemStack,ingredients:readonly IngredientSpec[]):ShapelessRecipe{
  if(ingredients.length<1||ingredients.length>9)throw new Error(`Bad ingredient count for ${result.id}`);
  return Object.freeze({kind:'shapeless',ingredients:Object.freeze(ingredients.map(ingredient)),result:frozenStack(result)});
}

const recipes:CraftingRecipe[]=[];
const S=(id:ItemId,count:number,rows:string[],key:Record<string,IngredientSpec>)=>{recipes.push(shaped({id,count},rows,key));};
const L=(id:ItemId,count:number,ingredients:IngredientSpec[])=>{recipes.push(shapeless({id,count},ingredients));};
const STAIRS=['#  ','## ','###'],SLAB=['###'],SQUARE=['##','##'],FULL=['###','###','###'],RING=['###','# #','###'];

// ---- Wood --------------------------------------------------------------------------------------
for(const wood of WOOD_TYPES)L(`${wood}_planks`,4,[`${wood}_log`]);
S('stick',4,['#','#'],{'#':'#planks'});
S('crafting_table',1,SQUARE,{'#':'#planks'});
S('chest',1,RING,{'#':'#planks'});
S('barrel',1,['PSP','P P','PSP'],{P:'#planks',S:'#wooden_slabs'});
S('bookshelf',1,['###','XXX','###'],{'#':'#planks',X:'book'});
S('ladder',3,['# #','###','# #'],{'#':'stick'});
S('bowl',4,['# #',' # '],{'#':'#planks'});
// Oak slabs, stairs and doors need oak planks (other woods have their own, absent here).
S('oak_slab',6,SLAB,{'#':'oak_planks'});
S('oak_stairs',4,STAIRS,{'#':'oak_planks'});
S('oak_door',3,['##','##','##'],{'#':'oak_planks'});
// The one bed in this game stands for every colour, so any wool makes it.
S('red_bed',1,['###','XXX'],{'#':'#wool',X:'#planks'});
S('shield',1,['WoW','WWW',' W '],{W:'#planks',o:'iron_ingot'});

// ---- Stone, earth and building blocks -----------------------------------------------------------
S('furnace',1,RING,{'#':'#stone_crafting_materials'});
S('stone_bricks',4,SQUARE,{'#':'stone'});
S('bricks',1,SQUARE,{'#':'brick'});
S('sandstone',1,SQUARE,{'#':'sand'});
S('red_sandstone',1,SQUARE,{'#':'red_sand'});
S('stone_slab',6,SLAB,{'#':'stone'});
S('cobblestone_slab',6,SLAB,{'#':'cobblestone'});
S('sandstone_slab',6,SLAB,{'#':'sandstone'});
S('cobblestone_stairs',4,STAIRS,{'#':'cobblestone'});
S('stone_brick_stairs',4,STAIRS,{'#':'stone_bricks'});
S('sandstone_stairs',4,STAIRS,{'#':'sandstone'});
S('brick_stairs',4,STAIRS,{'#':'bricks'});
L('mossy_cobblestone',1,['cobblestone','moss_block']);
L('mossy_stone_bricks',1,['stone_bricks','moss_block']);
L('andesite',2,['diorite','cobblestone']);
S('coarse_dirt',4,['DG','GD'],{D:'dirt',G:'gravel'});
S('packed_ice',1,FULL,{'#':'ice'});
S('snow_block',1,SQUARE,{'#':'snowball'});
S('snow',6,SLAB,{'#':'snow_block'});
S('clay',1,SQUARE,{'#':'clay_ball'});
S('glowstone',1,SQUARE,{'#':'glowstone_dust'});
S('tnt',1,['X#X','#X#','X#X'],{X:'gunpowder','#':'#sand'});
S('melon',1,FULL,{'#':'melon_slice'});
S('torch',4,['X','#'],{X:'#coals','#':'stick'});
S('lantern',1,['XXX','X#X','XXX'],{X:'iron_nugget','#':'torch'});

// ---- Storage blocks and nuggets -------------------------------------------------------------------
for(const [block,item] of [['iron_block','iron_ingot'],['gold_block','gold_ingot'],['diamond_block','diamond'],['emerald_block','emerald'],
  ['lapis_block','lapis_lazuli'],['coal_block','coal'],['redstone_block','redstone'],['copper_block','copper_ingot']] as const){
  S(block,1,FULL,{'#':item});L(item,9,[block]);
}
for(const [ingot,nugget] of [['iron_ingot','iron_nugget'],['gold_ingot','gold_nugget']] as const){S(ingot,1,FULL,{'#':nugget});L(nugget,9,[ingot]);}

// ---- Wool and dyes ----------------------------------------------------------------------------------
S('white_wool',1,SQUARE,{'#':'string'});
// 1.19.3+: any other colour of wool takes a dye.
for(const colour of WOOL_COLOURS)L(`${colour}_wool`,1,[`${colour}_dye`,GROUPS.wool.filter(w=>w!==`${colour}_wool`)]);
for(const [source,dye] of [['dandelion','yellow'],['poppy','red'],['blue_orchid','light_blue'],['allium','magenta'],['cornflower','blue'],
  ['oxeye_daisy','light_gray'],['bone_meal','white'],['ink_sac','black'],['cocoa_beans','brown'],['lapis_lazuli','blue']] as const)
  L(`${dye}_dye`,1,[source]);
const MIXES:[string,number,string[]][]=[
  ['orange',2,['red','yellow']],['lime',2,['green','white']],['pink',2,['red','white']],['gray',2,['black','white']],
  ['light_gray',2,['gray','white']],['light_gray',3,['black','white','white']],['cyan',2,['blue','green']],['purple',2,['blue','red']],
  ['light_blue',2,['blue','white']],['magenta',2,['purple','pink']],['magenta',3,['blue','red','pink']],['magenta',4,['blue','red','red','white']]];
for(const [dye,count,parts] of MIXES)L(`${dye}_dye`,count,parts.map(p=>`${p}_dye`));

// ---- Materials ------------------------------------------------------------------------------------
L('bone_meal',3,['bone']);
S('paper',3,SLAB,{'#':'sugar_cane'});
L('sugar',1,['sugar_cane']);
L('book',1,['paper','paper','paper','leather']);
S('leather',1,SQUARE,{'#':'rabbit_hide'});
S('arrow',4,['X','#','Y'],{X:'flint','#':'stick',Y:'feather'});

// ---- Tools, weapons and utilities ------------------------------------------------------------------
const TOOL_MATERIALS:[string,IngredientSpec][]=[['wooden','#planks'],['stone','#stone_tool_materials'],['iron','iron_ingot'],['golden','gold_ingot'],['diamond','diamond']];
for(const [tier,material] of TOOL_MATERIALS){
  const key={X:material,'#':'stick'};
  S(`${tier}_pickaxe`,1,['XXX',' # ',' # '],key);
  S(`${tier}_axe`,1,['XX','X#',' #'],key);
  S(`${tier}_shovel`,1,['X','#','#'],key);
  S(`${tier}_hoe`,1,['XX',' #',' #'],key);
  S(`${tier}_sword`,1,['X','X','#'],key);
}
S('shears',1,[' #','# '],{'#':'iron_ingot'});
L('flint_and_steel',1,['iron_ingot','flint']);
S('bucket',1,['# #',' # '],{'#':'iron_ingot'});
S('bow',1,[' #X','# X',' #X'],{'#':'stick',X:'string'});
S('compass',1,[' # ','#X#',' # '],{'#':'iron_ingot',X:'redstone'});
S('clock',1,[' # ','#X#',' # '],{'#':'gold_ingot',X:'redstone'});

// ---- Armour ---------------------------------------------------------------------------------------
for(const [material,item] of [['leather','leather'],['iron','iron_ingot'],['golden','gold_ingot'],['diamond','diamond']] as const){
  const key={X:item};
  S(`${material}_helmet`,1,['XXX','X X'],key);
  S(`${material}_chestplate`,1,['X X','XXX','XXX'],key);
  S(`${material}_leggings`,1,['XXX','X X','X X'],key);
  S(`${material}_boots`,1,['X X','X X'],key);
}

// ---- Food -----------------------------------------------------------------------------------------
S('bread',1,SLAB,{'#':'wheat'});
S('cookie',8,['#X#'],{'#':'wheat',X:'cocoa_beans'});
L('pumpkin_pie',1,['pumpkin','sugar','egg']);
L('mushroom_stew',1,['brown_mushroom','red_mushroom','bowl']);
S('golden_apple',1,['###','#X#','###'],{'#':'gold_ingot',X:'apple'});
S('golden_carrot',1,['###','#X#','###'],{'#':'gold_nugget',X:'carrot'});

/** Every crafting recipe (2×2 inventory grid and 3×3 crafting table). */
export const CRAFTING_RECIPES:readonly CraftingRecipe[]=Object.freeze(recipes);
