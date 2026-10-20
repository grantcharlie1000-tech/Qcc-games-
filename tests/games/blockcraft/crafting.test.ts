import {describe,expect,test} from 'vitest';
import {ITEMS,WOOD_LOGS,WOOD_PLANKS,itemDef,type ItemStack} from '../../../src/games/blockcraft/data/items';
import {WOOL_COLOURS} from '../../../src/games/blockcraft/data/blocks';
import {createCrafting,matchRecipes} from '../../../src/games/blockcraft/items/crafting';
import {CRAFTING_RECIPES,shaped,shapeless} from '../../../src/games/blockcraft/items/recipes';
import {SMELTING_RECIPES} from '../../../src/games/blockcraft/items/recipes-smelting';
import {createFakeGame} from './helpers/fake-game';
import type {RecipeView} from '../../../src/games/blockcraft/engine/contracts';

const crafting=createCrafting(createFakeGame());
/** Grid from item ids ('' = empty slot), row-major. */
const grid=(...ids:string[]):(ItemStack|null)[]=>ids.map(id=>id?{id,count:1}:null);
const m3=(...ids:string[])=>crafting.match(grid(...ids),3,3);
const m2=(...ids:string[])=>crafting.match(grid(...ids),2,2);
const result=(match:ReturnType<typeof m3>)=>match&&`${match.result.count} ${match.result.id}`;

// Every item in data/items.ts is classified: obtainable by crafting or smelting in vanilla 1.20 with this item set, or not.
const CRAFTABLE=[
  // building blocks
  ...WOOD_PLANKS,'stone','andesite','mossy_cobblestone','coarse_dirt','sandstone','red_sandstone','glass','snow_block','snow','packed_ice','clay',
  'deepslate','copper_block','crafting_table','furnace','chest','torch','bricks','stone_bricks','mossy_stone_bricks','bookshelf',
  ...WOOL_COLOURS.map(c=>`${c}_wool`),'tnt','glowstone','lantern','barrel','iron_block','gold_block','diamond_block','emerald_block','lapis_block',
  'coal_block','redstone_block','ladder','stone_slab','cobblestone_slab','oak_slab','sandstone_slab','oak_stairs','cobblestone_stairs',
  'stone_brick_stairs','sandstone_stairs','brick_stairs','oak_door','red_bed','melon',
  // materials
  'stick','coal','charcoal','iron_ingot','gold_ingot','copper_ingot','diamond','emerald','redstone','lapis_lazuli','leather','sugar','paper',
  'book','brick','bowl','arrow','iron_nugget','gold_nugget','bone_meal',...WOOL_COLOURS.map(c=>`${c}_dye`),
  // tools, weapons, utilities, armour
  ...['wooden','stone','iron','golden','diamond'].flatMap(t=>['sword','axe','pickaxe','shovel','hoe'].map(k=>`${t}_${k}`)),
  'shears','flint_and_steel','bow','bucket','shield','compass','clock',
  ...['leather','golden','iron','diamond'].flatMap(m=>['helmet','chestplate','leggings','boots'].map(p=>`${m}_${p}`)),
  // food
  'bread','cooked_beef','cooked_porkchop','cooked_chicken','cooked_mutton','cooked_rabbit','baked_potato','mushroom_stew','pumpkin_pie','cookie',
  'golden_apple','golden_carrot'];
const NOT_CRAFTABLE=['granite','diorite','cobblestone','bedrock','dirt','grass_block','podzol','mycelium','sand','red_sand','gravel','ice','obsidian',
  'coal_ore','iron_ore','copper_ore','gold_ore','redstone_ore','lapis_ore','diamond_ore','emerald_ore','cobbled_deepslate','deepslate_coal_ore',
  'deepslate_iron_ore','deepslate_copper_ore','deepslate_gold_ore','deepslate_redstone_ore','deepslate_lapis_ore','deepslate_diamond_ore','tuff',
  'exposed_copper','weathered_copper','oxidized_copper',...WOOD_LOGS,...WOOD_PLANKS.map(p=>p.replace('_planks','_leaves')),
  ...WOOD_PLANKS.map(p=>p.replace('_planks','_sapling')),'short_grass','fern','dead_bush','dandelion','poppy','blue_orchid','allium','cornflower',
  'oxeye_daisy','brown_mushroom','red_mushroom','sugar_cane','cactus','pumpkin','lily_pad','moss_block','raw_iron','raw_gold','raw_copper',
  'flint','feather','string','gunpowder','bone','wheat','clay_ball','glowstone_dust','ink_sac','cocoa_beans','rabbit_hide','rabbit_foot',
  'slime_ball','ender_pearl','wheat_seeds','egg','snowball','water_bucket','lava_bucket','milk_bucket','apple','beef','porkchop','chicken','mutton',
  'carrot','potato','rotten_flesh','melon_slice','rabbit','spider_eye',...[...ITEMS.keys()].filter(id=>id.endsWith('_spawn_egg'))];

describe('recipe coverage',()=>{
  test('every item is classified as craftable or not',()=>{
    const classified=new Set([...CRAFTABLE,...NOT_CRAFTABLE]);
    expect([...ITEMS.keys()].filter(id=>!classified.has(id))).toEqual([]);
    expect(CRAFTABLE.filter(id=>NOT_CRAFTABLE.includes(id))).toEqual([]);
  });
  test('every item that should be craftable has a recipe',()=>{
    expect(CRAFTABLE.filter(id=>crafting.recipesFor(id).length===0)).toEqual([]);
  });
  test('no recipe produces an item vanilla cannot craft or smelt',()=>{
    expect(NOT_CRAFTABLE.filter(id=>crafting.recipesFor(id).length>0)).toEqual([]);
  });
  test('every ingredient and result is a real item with a valid count',()=>{
    for(const view of crafting.allRecipes()){
      expect(ITEMS.has(view.result.id),view.result.id).toBe(true);
      expect(view.result.count).toBeGreaterThanOrEqual(1);
      expect(view.result.count).toBeLessThanOrEqual(itemDef(view.result.id)!.maxStack);
      expect(view.grid).toHaveLength(view.width*view.height);
      for(const cell of view.grid)for(const id of cell??[])expect(ITEMS.has(id),`${id} in ${view.result.id}`).toBe(true);
    }
  });
  test('every listed recipe matches its own view, so the recipe book never shows an impossible recipe',()=>{
    for(const view of crafting.allRecipes()){
      if(view.kind==='smelting'){for(const id of view.grid[0]!)expect(crafting.smelt(id)?.result).toEqual(view.result);continue;}
      const size=view.station==='inventory'?2:3,cells:(ItemStack|null)[]=new Array(size*size).fill(null);
      view.grid.forEach((cell,i)=>{if(cell)cells[(i/view.width|0)*size+i%view.width]={id:cell[cell.length-1],count:1};});
      expect(crafting.match(cells,size,size)?.result,`${view.kind} ${view.result.id}`).toEqual(view.result);
    }
  });
});

describe('shaped recipes',()=>{
  test('planks from each log, including cherry',()=>{
    for(const log of WOOD_LOGS)expect(result(m2(log,'','',''))).toBe(`4 ${log.replace('_log','_planks')}`);
    expect(result(m3('','','','','','','','','cherry_log'))).toBe('4 cherry_planks');
  });
  test('a 2×2 recipe matches anywhere in a 3×3 grid and in the 2×2 inventory grid',()=>{
    for(const [r,c] of [[0,0],[0,1],[1,0],[1,1]]){
      const ids=new Array(9).fill('');for(const [dr,dc] of [[0,0],[0,1],[1,0],[1,1]])ids[(r+dr)*3+c+dc]='oak_planks';
      expect(result(m3(...ids))).toBe('1 crafting_table');
    }
    expect(result(m2('oak_planks','oak_planks','oak_planks','oak_planks'))).toBe('1 crafting_table');
    expect(result(m2('','birch_planks','','birch_planks'))).toBe('4 stick');
    expect(result(m3('','','','','','oak_planks','','','oak_planks'))).toBe('4 stick');
  });
  test('3×3-only recipes do not fit the 2×2 grid; extra items break a match',()=>{
    expect(m2('cobblestone','cobblestone','cobblestone','cobblestone')).toBeNull();
    expect(result(m3('cobblestone','cobblestone','cobblestone','cobblestone','','cobblestone','cobblestone','cobblestone','cobblestone'))).toBe('1 furnace');
    expect(m3('cobblestone','cobblestone','cobblestone','cobblestone','dirt','cobblestone','cobblestone','cobblestone','cobblestone')).toBeNull();
    expect(m3('oak_planks','oak_planks','','oak_planks','oak_planks','','','','stick')).toBeNull();
    expect(m3('','','','','','','','','')).toBeNull();
    expect(crafting.match(grid('oak_log'),3,3)).toBeNull();
  });
  test('shaped recipes match mirrored horizontally',()=>{
    expect(result(m3('iron_ingot','iron_ingot','','iron_ingot','stick','','','stick',''))).toBe('1 iron_axe');
    expect(result(m3('','iron_ingot','iron_ingot','','stick','iron_ingot','','stick',''))).toBe('1 iron_axe');
    expect(result(m3('','stick','string','stick','','string','','stick','string'))).toBe('1 bow');
    expect(result(m3('string','stick','','string','','stick','string','stick',''))).toBe('1 bow');
    expect(result(m3('oak_planks','','','oak_planks','oak_planks','','oak_planks','oak_planks','oak_planks'))).toBe('4 oak_stairs');
    expect(result(m3('','','oak_planks','','oak_planks','oak_planks','oak_planks','oak_planks','oak_planks'))).toBe('4 oak_stairs');
    expect(result(m2('','iron_ingot','iron_ingot',''))).toBe('1 shears');
    expect(result(m2('iron_ingot','','','iron_ingot'))).toBe('1 shears');
    // Mirroring is horizontal only: an upside-down stairs pattern is not a recipe.
    expect(m3('oak_planks','oak_planks','oak_planks','oak_planks','oak_planks','','oak_planks','','')).toBeNull();
  });
  test('ingredient groups: any planks, mixed in one recipe',()=>{
    expect(result(m2('oak_planks','cherry_planks','dark_oak_planks','spruce_planks'))).toBe('1 crafting_table');
    expect(result(m3('oak_planks','birch_planks','cherry_planks','acacia_planks','','jungle_planks','spruce_planks','dark_oak_planks','oak_planks'))).toBe('1 chest');
    expect(result(m3('cherry_planks','cherry_planks','cherry_planks','','stick','','','stick',''))).toBe('1 wooden_pickaxe');
    expect(result(m3('cherry_planks','','cherry_planks','','cherry_planks','','','',''))).toBe('4 bowl');
    expect(result(m3('birch_planks','iron_ingot','birch_planks','cherry_planks','oak_planks','spruce_planks','','jungle_planks',''))).toBe('1 shield');
    // Oak-only recipes keep their wood type.
    expect(m3('birch_planks','birch_planks','birch_planks','','','','','','')).toBeNull();
    expect(result(m3('oak_planks','oak_planks','oak_planks','','','','','',''))).toBe('6 oak_slab');
  });
  test('cobbled deepslate substitutes for cobblestone in stone tools and the furnace',()=>{
    expect(result(m3('cobbled_deepslate','cobbled_deepslate','cobbled_deepslate','','stick','','','stick',''))).toBe('1 stone_pickaxe');
    expect(result(m3('cobblestone','cobbled_deepslate','','cobblestone','stick','','','stick',''))).toBe('1 stone_axe');
    expect(result(m3('cobbled_deepslate','cobblestone','cobbled_deepslate','cobblestone','','cobblestone','cobbled_deepslate','cobbled_deepslate','cobblestone'))).toBe('1 furnace');
    expect(result(m3('','cobbled_deepslate','','','cobbled_deepslate','','','stick',''))).toBe('1 stone_sword');
  });
  test('torches from coal or charcoal; any wool makes a bed',()=>{
    expect(result(m2('coal','','stick',''))).toBe('4 torch');
    expect(result(m2('','charcoal','','stick'))).toBe('4 torch');
    expect(result(m3('white_wool','white_wool','white_wool','oak_planks','birch_planks','cherry_planks','','',''))).toBe('1 red_bed');
    expect(result(m3('','','','red_wool','red_wool','red_wool','oak_planks','oak_planks','oak_planks'))).toBe('1 red_bed');
  });
  test('vanilla counts for common recipes',()=>{
    const cases:[string[],string][]=[
      [['stick','','stick','stick','stick','stick','stick','','stick'],'3 ladder'],
      [['stone','stone','','stone','stone','','','',''],'4 stone_bricks'],
      [['brick','brick','','brick','brick','','','',''],'1 bricks'],
      [['oak_planks','oak_planks','oak_planks','book','book','book','oak_planks','oak_planks','oak_planks'],'1 bookshelf'],
      [['sugar_cane','sugar_cane','sugar_cane','','','','','',''],'3 paper'],
      [['wheat','wheat','wheat','','','','','',''],'1 bread'],
      [['wheat','cocoa_beans','wheat','','','','','',''],'8 cookie'],
      [['gold_ingot','gold_ingot','gold_ingot','gold_ingot','apple','gold_ingot','gold_ingot','gold_ingot','gold_ingot'],'1 golden_apple'],
      [['gold_nugget','gold_nugget','gold_nugget','gold_nugget','carrot','gold_nugget','gold_nugget','gold_nugget','gold_nugget'],'1 golden_carrot'],
      [['iron_ingot','','iron_ingot','','iron_ingot','','','',''],'1 bucket'],
      [['','iron_ingot','','iron_ingot','redstone','iron_ingot','','iron_ingot',''],'1 compass'],
      [['','gold_ingot','','gold_ingot','redstone','gold_ingot','','gold_ingot',''],'1 clock'],
      [['flint','','','stick','','','feather','',''],'4 arrow'],
      [['oak_planks','oak_planks','','oak_planks','oak_planks','','oak_planks','oak_planks',''],'3 oak_door'],
      [['iron_nugget','iron_nugget','iron_nugget','iron_nugget','torch','iron_nugget','iron_nugget','iron_nugget','iron_nugget'],'1 lantern'],
      [['oak_planks','oak_slab','oak_planks','oak_planks','','oak_planks','oak_planks','oak_slab','oak_planks'],'1 barrel'],
      [['copper_ingot','copper_ingot','copper_ingot','copper_ingot','copper_ingot','copper_ingot','copper_ingot','copper_ingot','copper_ingot'],'1 copper_block'],
      [['iron_nugget','iron_nugget','iron_nugget','iron_nugget','iron_nugget','iron_nugget','iron_nugget','iron_nugget','iron_nugget'],'1 iron_ingot'],
      [['melon_slice','melon_slice','melon_slice','melon_slice','melon_slice','melon_slice','melon_slice','melon_slice','melon_slice'],'1 melon'],
      [['gunpowder','sand','gunpowder','red_sand','gunpowder','sand','gunpowder','sand','gunpowder'],'1 tnt'],
      [['string','string','','string','string','','','',''],'1 white_wool'],
      [['glowstone_dust','glowstone_dust','','glowstone_dust','glowstone_dust','','','',''],'1 glowstone'],
      [['sand','sand','','sand','sand','','','',''],'1 sandstone'],
      [['snowball','snowball','','snowball','snowball','','','',''],'1 snow_block'],
      [['snow_block','snow_block','snow_block','','','','','',''],'6 snow'],
      [['clay_ball','clay_ball','','clay_ball','clay_ball','','','',''],'1 clay'],
      [['cobblestone','','','cobblestone','cobblestone','','cobblestone','cobblestone','cobblestone'],'4 cobblestone_stairs'],
      [['stone','stone','stone','','','','','',''],'6 stone_slab'],
      [['dirt','gravel','','gravel','dirt','','','',''],'4 coarse_dirt'],
      [['diamond','diamond','diamond','diamond','','diamond','','',''],'1 diamond_helmet'],
      [['leather','','leather','leather','leather','leather','leather','leather','leather'],'1 leather_chestplate'],
      [['iron_ingot','iron_ingot','iron_ingot','iron_ingot','','iron_ingot','iron_ingot','','iron_ingot'],'1 iron_leggings'],
      [['','','','gold_ingot','','gold_ingot','gold_ingot','','gold_ingot'],'1 golden_boots'],
      [['','diamond','','','diamond','','','stick',''],'1 diamond_sword'],
      [['','gold_ingot','','','stick','','','stick',''],'1 golden_shovel'],
      [['iron_ingot','iron_ingot','','','stick','','','stick',''],'1 iron_hoe'],
      [['oak_planks','oak_planks','oak_planks','','','','','',''],'6 oak_slab']];
    for(const [ids,want] of cases)expect(result(m3(...ids)),want).toBe(want);
  });
});

describe('shapeless recipes',()=>{
  test('match in any slots and any order',()=>{
    expect(result(m3('paper','','','','leather','','paper','','paper'))).toBe('1 book');
    expect(result(m2('leather','paper','paper','paper'))).toBe('1 book');
    expect(result(m2('','flint','iron_ingot',''))).toBe('1 flint_and_steel');
    expect(result(m3('','','','','','','egg','sugar','pumpkin'))).toBe('1 pumpkin_pie');
    expect(result(m2('bowl','red_mushroom','brown_mushroom',''))).toBe('1 mushroom_stew');
    expect(result(m2('bone','','',''))).toBe('3 bone_meal');
    expect(result(m3('','','','','sugar_cane','','','',''))).toBe('1 sugar');
    expect(result(m3('','','','','iron_block','','','',''))).toBe('9 iron_ingot');
    expect(result(m3('','','','','copper_block','','','',''))).toBe('9 copper_ingot');
    expect(result(m3('','','','','gold_ingot','','','',''))).toBe('9 gold_nugget');
    expect(result(m3('','moss_block','','','cobblestone','','','',''))).toBe('1 mossy_cobblestone');
    expect(result(m2('cobblestone','diorite','',''))).toBe('2 andesite');
  });
  test('missing or extra ingredients do not match',()=>{
    expect(m2('paper','paper','leather','')).toBeNull();
    expect(m3('paper','paper','paper','leather','paper','','','','')).toBeNull();
    expect(m2('flint','flint','iron_ingot','')).toBeNull();
  });
  test('dyes from flowers, bone meal and mixing',()=>{
    const cases:[string[],string][]=[
      [['dandelion'],'1 yellow_dye'],[['poppy'],'1 red_dye'],[['blue_orchid'],'1 light_blue_dye'],[['allium'],'1 magenta_dye'],
      [['cornflower'],'1 blue_dye'],[['oxeye_daisy'],'1 light_gray_dye'],[['bone_meal'],'1 white_dye'],[['ink_sac'],'1 black_dye'],
      [['cocoa_beans'],'1 brown_dye'],[['lapis_lazuli'],'1 blue_dye'],[['red_dye','yellow_dye'],'2 orange_dye'],
      [['green_dye','white_dye'],'2 lime_dye'],[['white_dye','red_dye'],'2 pink_dye'],[['black_dye','white_dye'],'2 gray_dye'],
      [['gray_dye','white_dye'],'2 light_gray_dye'],[['black_dye','white_dye','white_dye'],'3 light_gray_dye'],
      [['blue_dye','green_dye'],'2 cyan_dye'],[['red_dye','blue_dye'],'2 purple_dye'],[['purple_dye','pink_dye'],'2 magenta_dye'],
      [['blue_dye','red_dye','pink_dye'],'3 magenta_dye'],[['blue_dye','red_dye','red_dye','white_dye'],'4 magenta_dye'],
      [['blue_dye','white_dye'],'2 light_blue_dye']];
    for(const [ids,want] of cases){const cells=[...ids,...new Array(4-ids.length).fill('')];expect(result(m2(...cells)),want).toBe(want);}
  });
  test('dyed wool from any other wool colour',()=>{
    expect(result(m2('white_wool','red_dye','',''))).toBe('1 red_wool');
    expect(result(m2('','blue_wool','','yellow_dye'))).toBe('1 yellow_wool');
    expect(result(m2('black_wool','white_dye','',''))).toBe('1 white_wool');
    expect(m2('red_wool','red_dye','','')).toBeNull();
    for(const colour of WOOL_COLOURS)expect(crafting.recipesFor(`${colour}_wool`).some(v=>v.kind==='shapeless'&&v.grid.some(c=>c?.includes(`${colour}_dye`)))).toBe(true);
  });
  test('metal and gem blocks round-trip with their items',()=>{
    for(const [block,item] of [['iron_block','iron_ingot'],['gold_block','gold_ingot'],['diamond_block','diamond'],['emerald_block','emerald'],
      ['lapis_block','lapis_lazuli'],['coal_block','coal'],['redstone_block','redstone'],['copper_block','copper_ingot']]){
      expect(result(m3(...new Array(9).fill(item))),block).toBe(`1 ${block}`);
      expect(result(m2(block,'','','')),item).toBe(`9 ${item}`);
    }
    expect(result(m2('iron_ingot','','',''))).toBe('9 iron_nugget');
  });
});

describe('remainders and repair',()=>{
  test('remainders list one entry per grid slot; plain ingredients leave nothing',()=>{
    const match=m3('paper','','','','leather','','paper','','paper');
    expect(match?.remainders).toEqual(new Array(9).fill(null));
  });
  test('containers stay in their slot (milk buckets leave buckets)',()=>{
    const cake=shaped({id:'bread',count:1},['MMM','SES','WWW'],{M:'milk_bucket',S:'sugar',E:'egg',W:'wheat'});
    const brew=shapeless({id:'cookie',count:1},['water_bucket','sugar']);
    const cells=grid('milk_bucket','milk_bucket','milk_bucket','sugar','egg','sugar','wheat','wheat','wheat');
    const match=matchRecipes([cake,brew],cells,3,3);
    expect(match?.result).toEqual({id:'bread',count:1});
    expect(match?.remainders).toEqual([{id:'bucket',count:1},{id:'bucket',count:1},{id:'bucket',count:1},null,null,null,null,null,null]);
    expect(matchRecipes([cake,brew],grid('','sugar','water_bucket',''),2,2)?.remainders).toEqual([null,null,{id:'bucket',count:1},null]);
  });
  test('two worn tools of one kind repair into one with a 5% bonus',()=>{
    const match=crafting.match([{id:'iron_pickaxe',count:1,damage:200},null,null,{id:'iron_pickaxe',count:1,damage:150}],2,2);
    // 250 durability: 50 + 100 left, + 12 bonus = 162 left → 88 damage.
    expect(match?.result).toEqual({id:'iron_pickaxe',count:1,damage:88});
    expect(crafting.match([{id:'iron_pickaxe',count:1,damage:10},{id:'iron_pickaxe',count:1,damage:5},null,null],2,2)?.result).toEqual({id:'iron_pickaxe',count:1});
    expect(crafting.match([{id:'iron_pickaxe',count:1,damage:10},{id:'stone_pickaxe',count:1,damage:5},null,null],2,2)).toBeNull();
    expect(crafting.match([{id:'stick',count:1},{id:'stick',count:1},null,null],2,2)).toBeNull();
  });
  test('the result is a fresh stack each time',()=>{
    const a=m2('oak_log','','',''),b=m2('oak_log','','','');
    a!.result.count=99;expect(b!.result.count).toBe(4);expect(m2('oak_log','','','')!.result.count).toBe(4);
  });
  test('rejects malformed grids',()=>{
    expect(crafting.match(grid('oak_log','',''),2,2)).toBeNull();
    expect(crafting.match(grid('oak_log','','',''),4,1)).toBeNull();
    expect(crafting.match([{id:'nope',count:1},null,null,null],2,2)).toBeNull();
  });
});

describe('smelting and fuels',()=>{
  test('vanilla smelting results and experience',()=>{
    const cases:[string,string,number][]=[['raw_iron','iron_ingot',.7],['raw_gold','gold_ingot',1],['raw_copper','copper_ingot',.7],
      ['iron_ore','iron_ingot',.7],['deepslate_gold_ore','gold_ingot',1],['sand','glass',.1],['red_sand','glass',.1],['cobblestone','stone',.1],
      ['cobbled_deepslate','deepslate',.1],['clay_ball','brick',.3],['oak_log','charcoal',.15],['cherry_log','charcoal',.15],
      ['beef','cooked_beef',.35],['porkchop','cooked_porkchop',.35],['chicken','cooked_chicken',.35],['mutton','cooked_mutton',.35],
      ['rabbit','cooked_rabbit',.35],['potato','baked_potato',.35],['cactus','green_dye',1],['coal_ore','coal',.1],['diamond_ore','diamond',1],
      ['lapis_ore','lapis_lazuli',.2],['redstone_ore','redstone',.7],['emerald_ore','emerald',1],['iron_sword','iron_nugget',.1],
      ['golden_helmet','gold_nugget',.1]];
    for(const [input,output,xp] of cases){
      const r=crafting.smelt(input);expect(r?.result,input).toEqual({id:output,count:1});expect(r?.xp,input).toBeCloseTo(xp,5);
    }
    for(const id of ['stone','dirt','cooked_beef','iron_ingot','nope'])expect(crafting.smelt(id),id).toBeNull();
  });
  test('vanilla fuel durations',()=>{
    const cases:[string,number][]=[['coal',80],['charcoal',80],['oak_planks',15],['cherry_planks',15],['birch_log',15],['stick',5],
      ['coal_block',800],['lava_bucket',1000],['wooden_pickaxe',10],['wooden_sword',10],['oak_sapling',5],['red_wool',5],['crafting_table',15],
      ['chest',15],['bookshelf',15],['barrel',15],['ladder',15],['oak_stairs',15],['oak_slab',7.5],['bow',15],['oak_door',10],['bowl',5],
      ['dead_bush',5]];
    for(const [id,seconds] of cases)expect(crafting.fuelSeconds(id),id).toBe(seconds);
    // Shields are not a furnace fuel in vanilla Java.
    for(const id of ['stone','cobblestone','iron_ingot','water_bucket','bucket','stone_slab','stone_pickaxe','shield','nope'])expect(crafting.fuelSeconds(id),id).toBe(0);
  });
});

describe('recipe views',()=>{
  const all=crafting.allRecipes();
  const find=(id:string,kind:RecipeView['kind'])=>crafting.recipesFor(id).find(v=>v.kind===kind);
  test('lists shaped, shapeless and smelting recipes with their station',()=>{
    expect(new Set(all.map(v=>v.kind))).toEqual(new Set(['shaped','shapeless','smelting']));
    expect(all.length).toBe(CRAFTING_RECIPES.length+SMELTING_RECIPES.length);
    const table=find('crafting_table','shaped')!;
    expect(table).toMatchObject({station:'inventory',width:2,height:2,result:{id:'crafting_table',count:1}});
    expect(table.grid[0]).toEqual(expect.arrayContaining(WOOD_PLANKS));
    expect(find('furnace','shaped')).toMatchObject({station:'crafting_table',width:3,height:3});
    expect(find('furnace','shaped')!.grid[4]).toBeNull();
    expect(find('furnace','shaped')!.grid[0]).toEqual(expect.arrayContaining(['cobblestone','cobbled_deepslate']));
    expect(find('book','shapeless')).toMatchObject({station:'inventory'});
    expect(find('iron_ingot','smelting')).toMatchObject({station:'furnace',width:1,height:1});
    expect(crafting.recipesFor('charcoal')[0].grid[0]).toEqual(expect.arrayContaining(WOOD_LOGS));
    expect(crafting.recipesFor('iron_ingot').map(v=>v.kind)).toEqual(expect.arrayContaining(['shaped','shapeless','smelting']));
    expect(crafting.recipesFor('nope')).toEqual([]);
  });
  test('views are stable and shared between calls',()=>{
    expect(crafting.allRecipes()).toBe(all);expect(crafting.recipesFor('stick')).toBe(crafting.recipesFor('stick'));
  });
});
