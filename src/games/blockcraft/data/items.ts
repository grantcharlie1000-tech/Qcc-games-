// Item registry. Items are identified by string ids; block items share the block family name.
import {BLOCKS,WOOD_TYPES,WOOL_COLOURS,type ToolKind,blockDef} from './blocks';

export type ItemId=string;
export type ArmorSlot='head'|'chest'|'legs'|'feet';
export type ToolTier='wooden'|'stone'|'iron'|'golden'|'diamond';
export type ArmorMaterial='leather'|'iron'|'golden'|'diamond';
/** How an item is drawn in inventories and held/dropped: an isometric block, a flat block tile, or an item sprite. */
export type ItemIcon={kind:'block';block:string}|{kind:'tile';tile:string}|{kind:'sprite';sprite:string};

export interface ToolStats{readonly kind:ToolKind;readonly tier:ToolTier;
  /** Harvest level: wood/gold 0, stone 1, iron 2, diamond 3. */
  readonly level:number;readonly speed:number;readonly durability:number;
  /** Attack damage in half-hearts (hit points). */
  readonly damage:number;
  /** Attacks per second at full charge (modern attack cooldown). */
  readonly attackSpeed:number}
export interface ArmorStats{readonly slot:ArmorSlot;readonly material:ArmorMaterial;readonly points:number;readonly toughness:number;readonly durability:number}
export interface FoodStats{readonly hunger:number;readonly saturation:number;readonly seconds:number;
  /** Status effects as [effect, seconds, chance]. */
  readonly effects?:readonly (readonly [string,number,number])[];
  /** Can be eaten with a full hunger bar. */
  readonly always?:boolean}
export interface ItemDef{
  readonly id:ItemId;readonly displayName:string;readonly maxStack:number;readonly icon:ItemIcon;
  /** Block family placed by using this item (state chosen by the placer: facing, door halves...). */
  readonly places?:string;
  readonly tool?:ToolStats;readonly armor?:ArmorStats;readonly food?:FoodStats;
  /** Seconds a furnace burns on one of this item. */
  readonly fuel?:number;
  /** Special use behaviour, interpreted by interact/. */
  readonly use?:'bucket'|'water_bucket'|'lava_bucket'|'milk_bucket'|'flint_and_steel'|'shears'|'bow'|'bone_meal'|'hoe'|'seeds'|'egg'|'snowball';
}

export const ITEMS=new Map<ItemId,ItemDef>();
function add(def:ItemDef){if(ITEMS.has(def.id))throw new Error(`Duplicate item ${def.id}`);ITEMS.set(def.id,def);return def;}
const title=(id:string)=>id.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const sprite=(id:string):ItemIcon=>({kind:'sprite',sprite:id});
/** Item sprite names painted by art/items.ts. */
export const ITEM_SPRITES:string[]=[];
function spriteItem(id:string,extra:Partial<ItemDef>={}){ITEM_SPRITES.push(id);return add({id,displayName:title(id),maxStack:64,icon:sprite(id),...extra});}

// ---- Block items -----------------------------------------------------------------------------
const FLAT_ICON=new Set(['cross','crop','torch','ladder','flat']);
const SPRITE_BLOCK_ITEMS:Record<string,string>={oak_door:'oak_door',bed:'red_bed'};
// Every placeable block family has an item (used by creative mode and pick-block), even when
// mining it drops something else (stone drops cobblestone: see interact/loot.ts).
const NO_ITEM=new Set(['air','water','lava','wall_torch','farmland']);
for(const def of BLOCKS){
  if(NO_ITEM.has(def.family)||ITEMS.has(def.family))continue;
  // Crops are planted from seeds / produce, which are items in their own right.
  if(def.shape==='crop')continue;
  if(SPRITE_BLOCK_ITEMS[def.family])continue;
  const icon:ItemIcon=FLAT_ICON.has(def.shape)?{kind:'tile',tile:def.tiles[0]}:{kind:'block',block:def.name};
  const wooden=/_(planks|log)$/.test(def.family)||['crafting_table','chest','bookshelf','ladder','oak_slab'].includes(def.family);
  const sapling=def.family.endsWith('_sapling');
  add({id:def.family,displayName:def.displayName,maxStack:def.family==='snow'?64:64,icon,places:def.family,fuel:wooden?15:sapling?5:undefined});
}
add({id:'oak_door',displayName:'Oak Door',maxStack:64,icon:sprite('oak_door'),places:'oak_door',fuel:10});ITEM_SPRITES.push('oak_door');
add({id:'red_bed',displayName:'Red Bed',maxStack:1,icon:sprite('red_bed'),places:'bed'});ITEM_SPRITES.push('red_bed');

// ---- Materials --------------------------------------------------------------------------------
for(const id of ['stick','coal','charcoal','iron_ingot','gold_ingot','copper_ingot','raw_iron','raw_gold','raw_copper','diamond','emerald','redstone','lapis_lazuli',
  'flint','leather','feather','string','gunpowder','bone','wheat','sugar','paper','book','clay_ball','brick','bowl','arrow','iron_nugget','gold_nugget','glowstone_dust','ink_sac'])
  spriteItem(id,{fuel:id==='stick'?5:id==='coal'||id==='charcoal'?80:undefined});
spriteItem('bone_meal',{use:'bone_meal'});
spriteItem('wheat_seeds',{places:'wheat',use:'seeds'});
spriteItem('egg',{maxStack:16,use:'egg'});
spriteItem('snowball',{maxStack:16,use:'snowball'});
for(const colour of WOOL_COLOURS.filter(c=>c!=='white'))spriteItem(`${colour}_dye`);

// ---- Tools, weapons and utilities ------------------------------------------------------------
export const TOOL_TIERS:Record<ToolTier,{level:number;speed:number;durability:number;bonus:number}>={
  wooden:{level:0,speed:2,durability:59,bonus:0},stone:{level:1,speed:4,durability:131,bonus:1},iron:{level:2,speed:6,durability:250,bonus:2},
  golden:{level:0,speed:12,durability:32,bonus:0},diamond:{level:3,speed:8,durability:1561,bonus:3}};
const TOOL_BASE:Record<'pickaxe'|'axe'|'shovel'|'hoe'|'sword',{damage:number[];attackSpeed:number[]}>={
  // damage / attack speed per tier, ordered wooden, stone, iron, golden, diamond
  sword:{damage:[4,5,6,4,7],attackSpeed:[1.6,1.6,1.6,1.6,1.6]},
  axe:{damage:[7,9,9,7,9],attackSpeed:[.8,.8,.9,1,1]},
  pickaxe:{damage:[2,3,4,2,5],attackSpeed:[1.2,1.2,1.2,1.2,1.2]},
  shovel:{damage:[2.5,3.5,4.5,2.5,5.5],attackSpeed:[1,1,1,1,1]},
  hoe:{damage:[1,1,1,1,1],attackSpeed:[1,2,3,1,4]}};
const TIERS:ToolTier[]=['wooden','stone','iron','golden','diamond'];
for(const [kind,base] of Object.entries(TOOL_BASE))TIERS.forEach((tier,t)=>{
  const stats=TOOL_TIERS[tier];
  spriteItem(`${tier}_${kind}`,{maxStack:1,tool:{kind:kind as ToolKind,tier,level:stats.level,speed:kind==='sword'?1.5:stats.speed,durability:stats.durability,damage:base.damage[t],attackSpeed:base.attackSpeed[t]},
    fuel:tier==='wooden'?10:undefined,use:kind==='hoe'?'hoe':undefined});
});
spriteItem('shears',{maxStack:1,tool:{kind:'shears',tier:'iron',level:0,speed:5,durability:238,damage:1,attackSpeed:4},use:'shears'});
spriteItem('flint_and_steel',{maxStack:1,tool:{kind:'pickaxe',tier:'iron',level:-1,speed:1,durability:64,damage:1,attackSpeed:4},use:'flint_and_steel'});
spriteItem('bow',{maxStack:1,tool:{kind:'sword',tier:'wooden',level:-1,speed:1,durability:384,damage:1,attackSpeed:4},use:'bow'});
spriteItem('bucket',{maxStack:16,use:'bucket'});
spriteItem('water_bucket',{maxStack:1,use:'water_bucket'});
spriteItem('lava_bucket',{maxStack:1,use:'lava_bucket',fuel:1000});
spriteItem('milk_bucket',{maxStack:1,use:'milk_bucket',food:{hunger:0,saturation:0,seconds:1.6,always:true}});

// ---- Armour -----------------------------------------------------------------------------------
const ARMOR:Record<ArmorMaterial,{points:[number,number,number,number];toughness:number;durability:number}>={
  leather:{points:[1,3,2,1],toughness:0,durability:5},golden:{points:[2,5,3,1],toughness:0,durability:7},
  iron:{points:[2,6,5,2],toughness:0,durability:15},diamond:{points:[3,8,6,3],toughness:2,durability:33}};
const PIECES:[string,ArmorSlot,number][]=[['helmet','head',11],['chestplate','chest',16],['leggings','legs',15],['boots','feet',13]];
for(const [material,stats] of Object.entries(ARMOR) as [ArmorMaterial,typeof ARMOR.leather][])PIECES.forEach(([piece,slot,mult],i)=>
  spriteItem(`${material}_${piece}`,{maxStack:1,armor:{slot,material,points:stats.points[i],toughness:stats.toughness,durability:stats.durability*mult}}));

// ---- Food -------------------------------------------------------------------------------------
const FOOD:[string,number,number,FoodStats['effects']?][]=[
  ['apple',4,2.4],['bread',5,6],['beef',3,1.8],['cooked_beef',8,12.8],['porkchop',3,1.8],['cooked_porkchop',8,12.8],
  ['chicken',2,1.2,[['hunger',30,.3]]],['cooked_chicken',6,7.2],['mutton',2,1.2],['cooked_mutton',6,9.6],['carrot',3,3.6],['potato',1,.6],
  ['baked_potato',5,6],['rotten_flesh',4,.8,[['hunger',30,.8]]],['mushroom_stew',6,7.2],['pumpkin_pie',8,4.8],['melon_slice',2,1.2],
  ['cookie',2,.4],['golden_apple',4,9.6,[['regeneration',5,1],['absorption',120,1]]],['golden_carrot',6,14.4]];
for(const [id,hunger,saturation,effects] of FOOD)
  spriteItem(id,{maxStack:id==='mushroom_stew'?1:64,food:{hunger,saturation,seconds:1.6,effects,always:id==='golden_apple'},
    places:id==='carrot'?'carrots':id==='potato'?'potatoes':undefined,use:id==='carrot'||id==='potato'?'seeds':undefined});

export function itemDef(id:ItemId):ItemDef|undefined{return ITEMS.get(id);}
export function requireItem(id:ItemId):ItemDef{const d=ITEMS.get(id);if(!d)throw new Error(`Unknown item ${id}`);return d;}
/** Item that places / represents a block state (pick block). */
export function itemForBlock(blockId:number):ItemDef|undefined{const b=blockDef(blockId);return b.item?ITEMS.get(b.item):undefined;}
export const WOOD_PLANKS=WOOD_TYPES.map(w=>`${w}_planks`);
export const WOOD_LOGS=WOOD_TYPES.map(w=>`${w}_log`);

// ---- Stacks -------------------------------------------------------------------------------
/** One inventory slot's contents. `damage` is tool/armour wear (0 = new). */
export interface ItemStack{id:ItemId;count:number;damage?:number}
export const stack=(id:ItemId,count=1,damage?:number):ItemStack=>damage?{id,count,damage}:{id,count};
export const sameItem=(a:ItemStack|null,b:ItemStack|null)=>!!a&&!!b&&a.id===b.id&&(a.damage??0)===(b.damage??0);
export const maxStack=(id:ItemId)=>ITEMS.get(id)?.maxStack??64;
/** Validates untrusted stack data (saves); returns null when invalid. */
export function parseStack(value:unknown):ItemStack|null{
  if(!value||typeof value!=='object')return null;
  const v=value as Partial<ItemStack>,def=typeof v.id==='string'?ITEMS.get(v.id):undefined;
  if(!def||!Number.isInteger(v.count)||v.count!<1||v.count!>def.maxStack)return null;
  const durability=def.tool?.durability??def.armor?.durability??0;
  if(v.damage!==undefined&&(!Number.isInteger(v.damage)||v.damage<0||v.damage>=Math.max(1,durability)))return null;
  return stack(def.id,v.count!,v.damage);
}
