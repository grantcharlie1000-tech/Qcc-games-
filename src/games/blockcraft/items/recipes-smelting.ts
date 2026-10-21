// Furnace recipes with vanilla (Java 1.20/1.21) experience, and furnace fuel durations.
import {ITEMS,type ItemId,type ItemStack} from '../data/items';
import {GROUPS,ingredient,type IngredientSpec} from './recipes';

/** Seconds to smelt one item in a furnace (200 ticks). */
export const COOK_SECONDS=10;
export interface SmeltingRecipe{readonly input:readonly ItemId[];readonly result:ItemStack;
  /** Experience per item, paid out when the output is taken. */
  readonly xp:number}

const list:SmeltingRecipe[]=[];
const smelt=(input:IngredientSpec,id:ItemId,xp:number)=>{
  if(!ITEMS.has(id))throw new Error(`Unknown smelting result ${id}`);
  list.push(Object.freeze({input:ingredient(input),result:Object.freeze({id,count:1}),xp}));
};
const ores=(ore:string)=>[`${ore}_ore`,`deepslate_${ore}_ore`].filter(id=>ITEMS.has(id));

smelt('raw_iron','iron_ingot',.7);smelt(ores('iron'),'iron_ingot',.7);
smelt('raw_gold','gold_ingot',1);smelt(ores('gold'),'gold_ingot',1);
smelt('raw_copper','copper_ingot',.7);smelt(ores('copper'),'copper_ingot',.7);
smelt(ores('coal'),'coal',.1);smelt(ores('redstone'),'redstone',.7);smelt(ores('lapis'),'lapis_lazuli',.2);
smelt(ores('diamond'),'diamond',1);smelt(ores('emerald'),'emerald',1);
smelt('#sand','glass',.1);
smelt('cobblestone','stone',.1);
smelt('cobbled_deepslate','deepslate',.1);
smelt('clay_ball','brick',.3);
smelt('#logs','charcoal',.15);
for(const meat of ['beef','porkchop','chicken','mutton','rabbit'])smelt(meat,`cooked_${meat}`,.35);
smelt('potato','baked_potato',.35);
smelt('cactus','green_dye',1);
// Iron and gold tools and armour melt down into nuggets (1.11+), worn or not.
const GEAR=['pickaxe','shovel','axe','hoe','sword','helmet','chestplate','leggings','boots'];
smelt(GEAR.map(g=>`iron_${g}`),'iron_nugget',.1);
smelt(GEAR.map(g=>`golden_${g}`),'gold_nugget',.1);

export const SMELTING_RECIPES:readonly SmeltingRecipe[]=Object.freeze(list);

/** Vanilla corrections to the `fuel` field of data/items.ts (its data source): shields do not burn; dead bushes burn 5 s. */
const FUEL_OVERRIDES:Readonly<Record<ItemId,number>>={shield:0,dead_bush:5};
/** Seconds one item burns in a furnace (coal 80, logs and planks 15, wooden slabs 7.5, sticks 5, lava bucket 1000...). */
export const FUEL_SECONDS:ReadonlyMap<ItemId,number>=(()=>{
  const map=new Map<ItemId,number>();
  for(const def of ITEMS.values())if(def.fuel&&def.fuel>0)map.set(def.id,def.fuel);
  for(const [id,seconds] of Object.entries(FUEL_OVERRIDES)){if(seconds>0&&ITEMS.has(id))map.set(id,seconds);else map.delete(id);}
  // Every log and plank burns, whatever the registry says.
  for(const id of [...GROUPS.logs,...GROUPS.planks])map.set(id,15);
  return map;
})();
