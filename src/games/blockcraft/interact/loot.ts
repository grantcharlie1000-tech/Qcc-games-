// Block loot tables (vanilla Java 1.20, no enchantments). lootDrops is the single source of block drops: the
// interaction service exposes it as blockDrops, which world ticks (support pop-offs), fluids and explosions call with
// no tool and their cause, so that only player harvests apply requiresTool.
import {blockDef,WOOD_TYPES,type BlockDef,type BlockId} from '../data/blocks';
import {ITEMS,itemDef,stack,type ItemStack} from '../data/items';
import type {ChangeCause} from '../engine/contracts';

export type Random=()=>number;
/** Uniform integer in [min, max]. */
export const between=(random:Random,min:number,max:number)=>min+Math.floor(random()*(max-min+1));
/** Successes in n trials of probability p (vanilla binomial_with_bonus_count). */
export function binomial(random:Random,n:number,p:number){let k=0;for(let i=0;i<n;i++)if(random()<p)k++;return k;}

const toolOf=(held:ItemStack|null)=>held?itemDef(held.id)?.tool:undefined;
const shears=(held:ItemStack|null)=>toolOf(held)?.kind==='shears';
/** True when breaking `id` with `held` yields drops: blocks with requiresTool need the right tool kind and tier. */
export function canHarvest(id:BlockId,held:ItemStack|null):boolean{
  const def=blockDef(id);if(!def.requiresTool)return true;
  const tool=toolOf(held);return !!tool&&tool.kind===def.tool&&tool.level>=def.harvestLevel;
}

type Table=(def:BlockDef,held:ItemStack|null,random:Random)=>ItemStack[];
const one=(id:string,count=1):ItemStack[]=>count>0?[stack(id,count)]:[];
const NOTHING:Table=()=>[];
const TABLES=new Map<string,Table>();
const table=(families:string[],t:Table)=>{for(const f of families)TABLES.set(f,t);};

// Earth and stone.
table(['grass_block','podzol','mycelium'],()=>one('dirt'));
table(['gravel'],(_d,_h,r)=>one(r()<.1?'flint':'gravel'));
table(['clay'],()=>one('clay_ball',4));
table(['snow'],()=>one('snowball'));
table(['snow_block'],()=>one('snowball',4));
// Ice and glass need silk touch (not modelled). Breaking ice over a solid block leaves water (interaction).
table(['ice','packed_ice','glass'],NOTHING);
// Ores: stone and deepslate variants share their tables.
for(const prefix of ['','deepslate_']){
  table([`${prefix}coal_ore`],()=>one('coal'));
  table([`${prefix}iron_ore`],()=>one('raw_iron'));
  table([`${prefix}gold_ore`],()=>one('raw_gold'));
  table([`${prefix}copper_ore`],(_d,_h,r)=>one('raw_copper',between(r,2,5)));
  table([`${prefix}redstone_ore`],(_d,_h,r)=>one('redstone',between(r,4,5)));
  table([`${prefix}lapis_ore`],(_d,_h,r)=>one('lapis_lazuli',between(r,4,9)));
  table([`${prefix}diamond_ore`],()=>one('diamond'));
  table([`${prefix}emerald_ore`],()=>one('emerald'));
}
// Leaves: shears keep the block; otherwise sapling (5%, jungle 2.5%), 1-2 sticks (2%), apple (0.5%, oak and dark oak).
for(const wood of WOOD_TYPES)table([`${wood}_leaves`],(def,held,r)=>{
  if(shears(held))return one(def.family);
  const out:ItemStack[]=[];
  if(r()<(wood==='jungle'?.025:.05))out.push(stack(`${wood}_sapling`));
  if(r()<.02)out.push(stack('stick',between(r,1,2)));
  if((wood==='oak'||wood==='dark_oak')&&r()<.005)out.push(stack('apple'));
  return out;
});
// Plants.
table(['short_grass','fern'],(def,held,r)=>shears(held)?one(def.family):r()<.125?one('wheat_seeds'):[]);
table(['dead_bush'],(def,held,r)=>shears(held)?one(def.family):one('stick',between(r,0,2)));
table(['melon'],(_d,_h,r)=>one('melon_slice',between(r,3,7)));
// Crops: mature wheat drops wheat plus 1 + B(3, 4/7) seeds. Carrots and potatoes are their own seeds: one item, plus a
// second pool of 1 + B(3, 4/7) when mature (2-5 in all). Poisonous potatoes are not in the item registry.
const mature=(d:BlockDef)=>d.age!==undefined&&d.age>=(d.maxAge??7);
table(['wheat'],(def,_h,r)=>mature(def)?[stack('wheat'),stack('wheat_seeds',1+binomial(r,3,4/7))]:one('wheat_seeds'));
table(['carrots'],(def,_h,r)=>one('carrot',mature(def)?2+binomial(r,3,4/7):1));
table(['potatoes'],(def,_h,r)=>one('potato',mature(def)?2+binomial(r,3,4/7):1));
// Built blocks.
table(['bookshelf'],()=>one('book',3));
table(['glowstone'],(_d,_h,r)=>one('glowstone_dust',between(r,2,4)));
// Two-block structures drop once: the lower door half and the bed foot (the other half pops off).
table(['oak_door'],def=>def.door?.half==='lower'?one('oak_door'):[]);
table(['bed'],def=>def.bed?.part==='foot'?one('red_bed'):[]);

/** Blocks whose vanilla loot table needs an entity breaking them (condition entity_properties "this"): snow layers drop
 *  snowballs for a player with a shovel or an explosion (its source entity), never when they melt, pop off or wash away. */
const NEEDS_ENTITY=new Set(['snow']);
/** Items dropped when block `id` is broken with `held` (null = bare hand). `cause` omitted or 'player' is a player harvest,
 *  which needs the right tool for requiresTool blocks; any other cause is world loot: vanilla only checks
 *  requiresCorrectToolForDrops when a player harvests, so explosions, support pop-offs and fluids drop cobblestone, ores
 *  and lanterns. */
export function lootDrops(id:BlockId,held:ItemStack|null,random:Random,cause?:ChangeCause):ItemStack[]{
  const def=blockDef(id);
  if(def.shape==='air'||def.liquid)return [];
  const harvest=cause===undefined||cause==='player';
  if(harvest&&!canHarvest(id,held))return [];
  if(!harvest&&cause!=='explosion'&&NEEDS_ENTITY.has(def.family))return [];
  const t=TABLES.get(def.family);
  if(t)return t(def,held,random);
  if(!def.item||!ITEMS.has(def.item))return [];
  return one(def.item,def.slab==='double'?2:1);
}

/** Experience points dropped by an ore mined with the right tool (vanilla ranges). */
export function blockXp(id:BlockId,random:Random):number{
  const ore=blockDef(id).family.replace(/^deepslate_/,'');
  switch(ore){
    case 'coal_ore':return between(random,0,2);
    case 'diamond_ore':case 'emerald_ore':return between(random,3,7);
    case 'lapis_ore':return between(random,2,5);
    case 'redstone_ore':return between(random,1,5);
    default:return 0;
  }
}
