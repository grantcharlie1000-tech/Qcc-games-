// Creative inventory tabs (vanilla 1.20 layout) and which items each lists. Pure data, built from the
// item registry so every item, including every spawn egg, appears in at least one tab and in Search.
import {ITEMS,type ItemDef,type ItemId} from '../data/items';
import {WOOL_COLOURS} from '../data/blocks';

export type CreativeTabId='building'|'colored'|'natural'|'functional'|'redstone'|'search'|'tools'|'combat'|'food'|'ingredients'|'spawn_eggs'|'inventory';
export interface CreativeTab{id:CreativeTabId;title:string;icon:ItemId;
  /** Top row (true) or bottom row of tabs, like the vanilla screen. */
  top:boolean}
export const CREATIVE_TABS:readonly CreativeTab[]=[
  {id:'building',title:'Building Blocks',icon:'bricks',top:true},
  {id:'colored',title:'Colored Blocks',icon:'cyan_wool',top:true},
  {id:'natural',title:'Natural Blocks',icon:'grass_block',top:true},
  {id:'functional',title:'Functional Blocks',icon:'crafting_table',top:true},
  {id:'redstone',title:'Redstone Blocks',icon:'redstone',top:true},
  {id:'search',title:'Search Items',icon:'compass',top:true},
  {id:'tools',title:'Tools & Utilities',icon:'diamond_pickaxe',top:false},
  {id:'combat',title:'Combat',icon:'diamond_sword',top:false},
  {id:'food',title:'Food & Drinks',icon:'golden_apple',top:false},
  {id:'ingredients',title:'Ingredients',icon:'iron_ingot',top:false},
  {id:'spawn_eggs',title:'Spawn Eggs',icon:'pig_spawn_egg',top:false},
  {id:'inventory',title:'Survival Inventory',icon:'chest',top:false}
];

const STONE_BUILDING=['stone','granite','diorite','andesite','cobblestone','mossy_cobblestone','stone_bricks','mossy_stone_bricks','deepslate','cobbled_deepslate','tuff',
  'bricks','sandstone','red_sandstone','obsidian'];
const METAL_BLOCKS=['coal_block','iron_block','gold_block','redstone_block','emerald_block','lapis_block','diamond_block','copper_block','exposed_copper','weathered_copper','oxidized_copper'];
const FUNCTIONAL=['torch','lantern','glowstone','crafting_table','furnace','chest','barrel','bookshelf','ladder','red_bed','tnt'];
const REDSTONE=['redstone','redstone_block','tnt','oak_door','lantern'];
const NATURAL_EXTRA=['wheat_seeds','cocoa_beans','bone_meal','pumpkin','melon','snow','snow_block','ice','packed_ice','obsidian','clay','moss_block','glowstone'];
const UTILITIES=['bucket','water_bucket','lava_bucket','milk_bucket','flint_and_steel','bone_meal','shears','compass','clock','ender_pearl','book'];
const COMBAT_EXTRA=['shield','bow','arrow','snowball','egg','ender_pearl','tnt'];
const TOOL_ORDER=['shovel','pickaxe','axe','hoe'],TIER_ORDER=['wooden','stone','iron','golden','diamond'];
const ARMOR_ORDER=['leather','golden','iron','diamond'],PIECE_ORDER=['helmet','chestplate','leggings','boots'];
const INGREDIENTS=['coal','charcoal','raw_iron','raw_copper','raw_gold','iron_nugget','gold_nugget','iron_ingot','copper_ingot','gold_ingot','emerald','lapis_lazuli',
  'diamond','redstone','stick','flint','wheat','bone','bone_meal','string','feather','egg','leather','rabbit_hide','rabbit_foot','ink_sac','cocoa_beans','gunpowder',
  'sugar','glowstone_dust','slime_ball','clay_ball','brick','paper','book','bowl','spider_eye','ender_pearl'];

const isFood=(d:ItemDef)=>!!d.food;
const toolOf=(d:ItemDef)=>d.tool&&d.tool.kind!=='sword'&&d.tool.kind!=='shears';
const blockFamily=(d:ItemDef)=>!!d.places&&d.icon.kind!=='sprite'||['oak_door','red_bed'].includes(d.id);
const natural=(id:string)=>/_ore$/.test(id)||/_(log|leaves|sapling)$/.test(id)||['grass_block','podzol','mycelium','dirt','coarse_dirt','sand','red_sand','gravel','bedrock',
  'short_grass','fern','dead_bush','dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy','brown_mushroom','red_mushroom','sugar_cane','cactus','lily_pad',
  'stone','deepslate','granite','diorite','andesite','tuff','sandstone','red_sandstone'].includes(id);

function tabsOf(d:ItemDef):CreativeTabId[]{
  const id=d.id,out:CreativeTabId[]=[];
  if(d.spawns){out.push('spawn_eggs');return out;}
  if(blockFamily(d)){
    if(/_wool$/.test(id)||id==='glass')out.push('colored');
    if(/_(log|planks|slab|stairs)$/.test(id)||STONE_BUILDING.includes(id)||METAL_BLOCKS.includes(id)||id==='oak_door')out.push('building');
    if(natural(id)||NATURAL_EXTRA.includes(id))out.push('natural');
    if(FUNCTIONAL.includes(id))out.push('functional');
    if(REDSTONE.includes(id))out.push('redstone');
    if(!out.length)out.push('building');
  }
  if(toolOf(d)||UTILITIES.includes(id))out.push('tools');
  if(d.tool?.kind==='sword'||d.tool?.kind==='axe'||d.armor||COMBAT_EXTRA.includes(id))out.push('combat');
  if(isFood(d))out.push('food');
  if(INGREDIENTS.includes(id)||/_dye$/.test(id))out.push('ingredients');
  if(REDSTONE.includes(id)&&!out.includes('redstone'))out.push('redstone');
  if(NATURAL_EXTRA.includes(id)&&!out.includes('natural'))out.push('natural');
  if(!out.length)out.push('ingredients');
  return [...new Set(out)];
}
/** Sort key inside a tab: tools by tier then kind, armour by material then piece, dyes and wool by colour, else registry order. */
function sortKey(tab:CreativeTabId,d:ItemDef,index:number):number{
  const colour=WOOL_COLOURS.findIndex(c=>d.id===`${c}_dye`||d.id===`${c}_wool`);
  if(d.tool&&(tab==='tools'||tab==='combat')){
    const kind=d.tool.kind==='sword'?-1:TOOL_ORDER.indexOf(d.tool.kind);
    return 1000+(tab==='combat'?(kind===-1?0:500):0)+TIER_ORDER.indexOf(d.tool.tier)*10+kind;
  }
  if(d.armor)return 2000+ARMOR_ORDER.indexOf(d.armor.material)*10+PIECE_ORDER.indexOf(d.id.slice(d.armor.material.length+1));
  if(colour>=0)return 3000+colour+(d.id.endsWith('_dye')?100:0);
  if(tab==='ingredients'){const i=INGREDIENTS.indexOf(d.id);if(i>=0)return 4000+i;}
  return 10000+index;
}

const order=new Map<ItemId,number>([...ITEMS.keys()].map((id,i)=>[id,i]));
const LISTS=new Map<CreativeTabId,ItemId[]>();
for(const tab of CREATIVE_TABS)LISTS.set(tab.id,[]);
for(const d of ITEMS.values())for(const t of tabsOf(d))LISTS.get(t)!.push(d.id);
for(const [tab,list] of LISTS)list.sort((a,b)=>sortKey(tab,ITEMS.get(a)!,order.get(a)!)-sortKey(tab,ITEMS.get(b)!,order.get(b)!));
LISTS.set('search',[...ITEMS.keys()]);

/** Items listed by a tab (Search lists everything; the inventory tab lists nothing). */
export function tabItems(tab:CreativeTabId):readonly ItemId[]{return LISTS.get(tab)??[];}
/** Search: every word of the query must appear in the item's name (or its id), ignoring case. */
export function searchItems(query:string):readonly ItemId[]{
  const words=query.toLowerCase().split(/[\s_]+/).filter(Boolean);
  if(!words.length)return tabItems('search');
  return tabItems('search').filter(id=>{
    const name=`${ITEMS.get(id)!.displayName} ${id.replace(/_/g,' ')}`.toLowerCase();
    return words.every(w=>name.includes(w));
  });
}
