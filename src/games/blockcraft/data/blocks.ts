// Block registry. Every voxel is one byte: a BlockId indexing BLOCKS. Block states (crop age,
// facing, fluid level, lit furnace...) are separate ids that share a `family`.
//
// Face order everywhere: +x (east), -x (west), +y (up), -y (down), +z (south), -z (north).

export type BlockId=number;
export type Shape='air'|'cube'|'cross'|'crop'|'torch'|'liquid'|'slab'|'snow_layer'|'farmland'|'cactus'|'ladder'|'door'|'bed'|'flat';
export type RenderLayer='none'|'opaque'|'cutout'|'translucent';
export type ToolKind='pickaxe'|'axe'|'shovel'|'hoe'|'sword'|'shears';
export type SoundKind='stone'|'wood'|'gravel'|'grass'|'sand'|'cloth'|'glass'|'snow'|'metal'|'liquid'|'plant';
export type Facing='north'|'south'|'east'|'west';
export type TintKind='none'|'grass'|'foliage'|'water';
export const FACINGS:Facing[]=['north','south','east','west'];
/** Offsets of each facing: north is -z, south +z, east +x, west -x. */
export const FACING_VECTOR:Record<Facing,[number,number]>={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]};

export interface BlockDef{
  readonly id:BlockId;
  /** Unique state name, e.g. `wheat_3`, `furnace_lit_north`. */
  readonly name:string;
  /** Shared name of all states of one block, e.g. `wheat`, `furnace`. Equals `name` for stateless blocks. */
  readonly family:string;
  readonly displayName:string;
  readonly shape:Shape;
  readonly layer:RenderLayer;
  /** Player and mobs collide with it. */
  readonly solid:boolean;
  /** A full opaque cube: hides neighbouring faces, blocks light completely, counts for AO. */
  readonly opaque:boolean;
  /** Faces between two blocks of this same family are culled (glass, water, leaves). */
  readonly cullSame:boolean;
  /** Light lost when light passes through (0 clear .. 15 fully blocking). Opaque cubes are 15. */
  readonly lightOpacity:number;
  /** Light emitted, 0..15. */
  readonly lightEmission:number;
  /** Tile names per face (+x,-x,+y,-y,+z,-z). Painted by art/atlas.ts. Empty for air. */
  readonly tiles:readonly string[];
  /** Biome tint applied to tiles (grass top, leaves, water). Grass block sides carry a painted green band and are not tinted
   *  (the mesher may add the tinted `grass_block_side_overlay` on top); see `tintFaces`. */
  readonly tint:TintKind;
  /** Which faces receive the tint (same order as tiles). */
  readonly tintFaces:readonly boolean[];
  /** Seconds to break by hand when harvestable = hardness × 1.5. -1 = unbreakable. */
  readonly hardness:number;
  /** Explosion resistance. */
  readonly blastResistance:number;
  /** Tool that mines it fastest. */
  readonly tool?:ToolKind;
  /** Minimum tool tier (0 wood/gold, 1 stone, 2 iron, 3 diamond) when `requiresTool`. */
  readonly harvestLevel:number;
  /** Without the right tool (and tier) mining is slow and drops nothing. */
  readonly requiresTool:boolean;
  /** Can be replaced by placing a block into it (air, liquids, short grass, snow layer). */
  readonly replaceable:boolean;
  /** Falls when unsupported (sand, gravel). */
  readonly gravity:boolean;
  readonly flammable:boolean;
  readonly climbable:boolean;
  /** Needs a supporting block below (plants, torches, crops...) and pops off otherwise. */
  readonly needsSupport:boolean;
  readonly liquid?:{readonly kind:'water'|'lava';readonly level:number;readonly falling:boolean};
  readonly facing?:Facing;
  /** Crop / plant age state. */
  readonly age?:number;
  readonly maxAge?:number;
  /** Lit furnace etc. */
  readonly lit?:boolean;
  /** Door half and open state. */
  readonly door?:{readonly half:'lower'|'upper';readonly open:boolean};
  readonly sound:SoundKind;
  /** Item obtained by pick-block (and the default drop). Item ids live in data/items.ts. */
  readonly item?:string;
  /** Has a block entity (chest inventory, furnace state). */
  readonly blockEntity?:'chest'|'furnace';
  /** Opens a screen or acts on right click. */
  readonly interactive:boolean;
}

type Tiles=string|{top:string;bottom?:string;side:string;front?:string}|readonly string[];
interface Options{
  family?:string;display?:string;shape?:Shape;layer?:RenderLayer;solid?:boolean;opaque?:boolean;cullSame?:boolean;
  lightOpacity?:number;lightEmission?:number;tiles?:Tiles;tint?:TintKind;tintFaces?:boolean[];hardness?:number;blast?:number;
  tool?:ToolKind;level?:number;requiresTool?:boolean;replaceable?:boolean;gravity?:boolean;flammable?:boolean;climbable?:boolean;
  needsSupport?:boolean;liquid?:BlockDef['liquid'];facing?:Facing;age?:number;maxAge?:number;lit?:boolean;door?:BlockDef['door'];
  sound?:SoundKind;item?:string|null;blockEntity?:BlockDef['blockEntity'];interactive?:boolean;
}

export const BLOCKS:BlockDef[]=[];
export const BLOCK_BY_NAME=new Map<string,BlockDef>();
const FAMILY=new Map<string,BlockDef[]>();

function faceTiles(tiles:Tiles,facing?:Facing):string[]{
  if(typeof tiles==='string')return [tiles,tiles,tiles,tiles,tiles,tiles];
  if(Array.isArray(tiles))return [...(tiles as string[])];
  const t=tiles as {top:string;bottom?:string;side:string;front?:string},out=[t.side,t.side,t.top,t.bottom??t.top,t.side,t.side];
  if(t.front){const index={east:0,west:1,south:4,north:5}[facing??'south'];out[index]=t.front;}
  return out;
}
function define(name:string,o:Options={}):BlockDef{
  if(BLOCK_BY_NAME.has(name))throw new Error(`Duplicate block ${name}`);
  const shape=o.shape??'cube',cube=shape==='cube';
  const opaque=o.opaque??(cube&&(o.layer??'opaque')==='opaque');
  const def:BlockDef={
    id:BLOCKS.length,name,family:o.family??name,displayName:o.display??titleCase(o.family??name),shape,
    layer:o.layer??(shape==='air'?'none':cube?'opaque':'cutout'),
    solid:o.solid??!['air','cross','crop','torch','liquid','snow_layer','ladder','flat'].includes(shape),
    opaque,cullSame:o.cullSame??false,lightOpacity:o.lightOpacity??(opaque?15:0),lightEmission:o.lightEmission??0,
    tiles:shape==='air'?[]:faceTiles(o.tiles??name,o.facing),tint:o.tint??'none',tintFaces:o.tintFaces??[true,true,true,true,true,true],
    hardness:o.hardness??1,blastResistance:o.blast??(o.hardness??1)*3,tool:o.tool,harvestLevel:o.level??0,requiresTool:o.requiresTool??false,
    replaceable:o.replaceable??false,gravity:o.gravity??false,flammable:o.flammable??false,climbable:o.climbable??false,
    needsSupport:o.needsSupport??['cross','crop','torch','snow_layer','door'].includes(shape),
    liquid:o.liquid,facing:o.facing,age:o.age,maxAge:o.maxAge,lit:o.lit,door:o.door,sound:o.sound??'stone',
    item:o.item===null?undefined:(o.item??(o.family??name)),blockEntity:o.blockEntity,interactive:o.interactive??false
  };
  BLOCKS.push(def);BLOCK_BY_NAME.set(name,def);
  const family=FAMILY.get(def.family)??[];family.push(def);FAMILY.set(def.family,family);
  return def;
}
function titleCase(name:string){return name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
/** Id of a block state by name. Throws on unknown names so typos fail fast. */
export function blockId(name:string):BlockId{const def=BLOCK_BY_NAME.get(name);if(!def)throw new Error(`Unknown block ${name}`);return def.id;}
export function blockDef(id:BlockId):BlockDef{return BLOCKS[id]??BLOCKS[0];}
/** All states of a family, in definition order. */
export function familyStates(family:string):readonly BlockDef[]{return FAMILY.get(family)??[];}
/** The state of `family` with the given facing (and optional lit / door flags). */
export function stateFor(family:string,match:Partial<Pick<BlockDef,'facing'|'lit'|'age'>>&{half?:'lower'|'upper';open?:boolean}):BlockDef|undefined{
  return familyStates(family).find(d=>(match.facing===undefined||d.facing===match.facing)&&(match.lit===undefined||!!d.lit===match.lit)
    &&(match.age===undefined||d.age===match.age)&&(match.half===undefined||d.door?.half===match.half)&&(match.open===undefined||d.door?.open===match.open));
}

// ---- Definitions --------------------------------------------------------------------------
define('air',{shape:'air',solid:false,opaque:false,hardness:0,replaceable:true,item:null,sound:'stone'});

// Stone and earth
const stone={tool:'pickaxe' as const,requiresTool:true,sound:'stone' as const};
define('stone',{hardness:1.5,blast:6,...stone,item:'cobblestone'});
define('granite',{hardness:1.5,blast:6,...stone});
define('diorite',{hardness:1.5,blast:6,...stone});
define('andesite',{hardness:1.5,blast:6,...stone});
define('cobblestone',{hardness:2,blast:6,...stone});
define('mossy_cobblestone',{hardness:2,blast:6,...stone});
define('bedrock',{hardness:-1,blast:3600000,sound:'stone',item:null});
define('dirt',{hardness:.5,tool:'shovel',sound:'gravel'});
define('coarse_dirt',{hardness:.5,tool:'shovel',sound:'gravel'});
define('grass_block',{tiles:{top:'grass_block_top',bottom:'dirt',side:'grass_block_side'},tint:'grass',tintFaces:[false,false,true,false,false,false],hardness:.6,tool:'shovel',sound:'grass',item:'grass_block'});
define('podzol',{tiles:{top:'podzol_top',bottom:'dirt',side:'podzol_side'},hardness:.5,tool:'shovel',sound:'gravel'});
define('mycelium',{tiles:{top:'mycelium_top',bottom:'dirt',side:'mycelium_side'},hardness:.6,tool:'shovel',sound:'grass'});
define('sand',{hardness:.5,tool:'shovel',gravity:true,sound:'sand'});
define('red_sand',{hardness:.5,tool:'shovel',gravity:true,sound:'sand'});
define('sandstone',{tiles:{top:'sandstone_top',bottom:'sandstone_bottom',side:'sandstone'},hardness:.8,...stone});
define('red_sandstone',{tiles:{top:'red_sandstone_top',bottom:'red_sandstone_bottom',side:'red_sandstone'},hardness:.8,...stone});
define('gravel',{hardness:.6,tool:'shovel',gravity:true,sound:'gravel'});
define('clay',{hardness:.6,tool:'shovel',sound:'gravel'});
define('snow_block',{hardness:.2,tool:'shovel',requiresTool:true,sound:'snow',tiles:'snow'});
define('snow',{shape:'snow_layer',hardness:.1,tool:'shovel',requiresTool:true,replaceable:true,sound:'snow',display:'Snow',solid:false});
define('ice',{layer:'translucent',opaque:false,cullSame:true,lightOpacity:2,hardness:.5,tool:'pickaxe',sound:'glass'});
define('packed_ice',{hardness:.5,tool:'pickaxe',sound:'glass'});
define('obsidian',{hardness:50,blast:1200,tool:'pickaxe',level:3,requiresTool:true,sound:'stone'});

// Ores
define('coal_ore',{hardness:3,...stone,level:0});
define('iron_ore',{hardness:3,...stone,level:1});
define('copper_ore',{hardness:3,...stone,level:1});
define('gold_ore',{hardness:3,...stone,level:2});
define('redstone_ore',{hardness:3,...stone,level:2});
define('lapis_ore',{hardness:3,...stone,level:1});
define('diamond_ore',{hardness:3,...stone,level:2});
define('emerald_ore',{hardness:3,...stone,level:2});

// Wood: log, planks, leaves and sapling for each tree type.
export const WOOD_TYPES=['oak','birch','spruce','jungle','acacia','dark_oak'] as const;
export type WoodType=typeof WOOD_TYPES[number];
for(const wood of WOOD_TYPES){
  define(`${wood}_log`,{tiles:{top:`${wood}_log_top`,side:`${wood}_log`},hardness:2,tool:'axe',flammable:true,sound:'wood'});
  define(`${wood}_planks`,{hardness:2,blast:3,tool:'axe',flammable:true,sound:'wood'});
  define(`${wood}_leaves`,{layer:'opaque',opaque:false,cullSame:true,lightOpacity:1,hardness:.2,tool:'shears',flammable:true,sound:'plant',
    tint:wood==='birch'||wood==='spruce'?'none':'foliage'});
  define(`${wood}_sapling`,{shape:'cross',hardness:0,sound:'plant'});
}

// Plants
define('short_grass',{shape:'cross',hardness:0,replaceable:true,tint:'grass',sound:'plant',item:null,display:'Grass'});
define('fern',{shape:'cross',hardness:0,replaceable:true,tint:'grass',sound:'plant',item:null});
define('dead_bush',{shape:'cross',hardness:0,replaceable:true,sound:'plant',item:null});
for(const flower of ['dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy'])define(flower,{shape:'cross',hardness:0,sound:'plant'});
define('brown_mushroom',{shape:'cross',hardness:0,sound:'plant',lightEmission:1});
define('red_mushroom',{shape:'cross',hardness:0,sound:'plant'});
define('sugar_cane',{shape:'cross',hardness:0,sound:'plant',tint:'grass'});
define('cactus',{shape:'cactus',tiles:{top:'cactus_top',bottom:'cactus_bottom',side:'cactus_side'},hardness:.4,sound:'cloth'});
define('pumpkin',{tiles:{top:'pumpkin_top',side:'pumpkin_side'},hardness:1,tool:'axe',sound:'wood'});
define('melon',{tiles:{top:'melon_top',side:'melon_side'},hardness:1,tool:'axe',sound:'wood'});
define('lily_pad',{shape:'flat',hardness:0,sound:'plant',tint:'foliage'});

// Crops: one state per age.
for(let age=0;age<8;age++)define(`wheat_${age}`,{family:'wheat',display:'Wheat Crops',shape:'crop',age,maxAge:7,tiles:`wheat_stage${age}`,hardness:0,sound:'plant',item:'wheat_seeds'});
for(let age=0;age<4;age++)define(`carrots_${age}`,{family:'carrots',display:'Carrots',shape:'crop',age,maxAge:3,tiles:`carrots_stage${age}`,hardness:0,sound:'plant',item:'carrot'});
for(let age=0;age<4;age++)define(`potatoes_${age}`,{family:'potatoes',display:'Potatoes',shape:'crop',age,maxAge:3,tiles:`potatoes_stage${age}`,hardness:0,sound:'plant',item:'potato'});
define('farmland',{shape:'farmland',tiles:{top:'farmland',bottom:'dirt',side:'dirt'},opaque:false,lightOpacity:15,hardness:.6,tool:'shovel',sound:'gravel',item:'dirt'});
define('farmland_wet',{family:'farmland',shape:'farmland',tiles:{top:'farmland_moist',bottom:'dirt',side:'dirt'},opaque:false,lightOpacity:15,hardness:.6,tool:'shovel',sound:'gravel',item:'dirt'});

// Fluids: source (level 0), flowing levels 1-7 and a falling column state.
for(const kind of ['water','lava'] as const){
  const base={shape:'liquid' as const,layer:kind==='water'?'translucent' as const:'opaque' as const,cullSame:true,solid:false,opaque:false,
    lightOpacity:kind==='water'?2:15,lightEmission:kind==='lava'?15:0,hardness:-1,replaceable:true,sound:'liquid' as const,item:null,
    tiles:kind==='water'?'water_still':'lava_still',tint:kind==='water'?'water' as const:'none' as const,family:kind};
  define(kind,{...base,liquid:{kind,level:0,falling:false}});
  for(let level=1;level<8;level++)define(`${kind}_${level}`,{...base,liquid:{kind,level,falling:false},tiles:kind==='water'?'water_flow':'lava_flow'});
  define(`${kind}_falling`,{...base,liquid:{kind,level:0,falling:true},tiles:kind==='water'?'water_flow':'lava_flow'});
}

// Crafted and building blocks
define('crafting_table',{tiles:['crafting_table_side','crafting_table_side','crafting_table_top','oak_planks','crafting_table_front','crafting_table_front'],hardness:2.5,tool:'axe',sound:'wood',interactive:true,flammable:true});
for(const lit of [false,true])for(const facing of FACINGS)
  define(`furnace${lit?'_lit':''}_${facing}`,{family:'furnace',display:'Furnace',facing,lit,tiles:{top:'furnace_top',side:'furnace_side',front:lit?'furnace_front_on':'furnace_front'},
    hardness:3.5,...stone,lightEmission:lit?13:0,blockEntity:'furnace',interactive:true,item:'furnace'});
for(const facing of FACINGS)define(`chest_${facing}`,{family:'chest',display:'Chest',facing,tiles:{top:'chest_top',side:'chest_side',front:'chest_front'},hardness:2.5,tool:'axe',sound:'wood',blockEntity:'chest',interactive:true,item:'chest'});
define('torch',{shape:'torch',lightEmission:14,hardness:0,sound:'wood'});
for(const facing of FACINGS)define(`wall_torch_${facing}`,{family:'wall_torch',display:'Torch',shape:'torch',facing,tiles:'torch',lightEmission:14,hardness:0,sound:'wood',item:'torch',needsSupport:true});
define('glass',{layer:'cutout',opaque:false,cullSame:true,hardness:.3,sound:'glass',item:'glass'});
define('bricks',{hardness:2,...stone});
define('stone_bricks',{hardness:1.5,...stone});
define('mossy_stone_bricks',{hardness:1.5,...stone});
define('bookshelf',{tiles:{top:'oak_planks',side:'bookshelf'},hardness:1.5,tool:'axe',sound:'wood',flammable:true});
export const WOOL_COLOURS=['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'] as const;
for(const colour of WOOL_COLOURS)define(`${colour}_wool`,{hardness:.8,tool:'shears',sound:'cloth',flammable:true});
define('tnt',{tiles:{top:'tnt_top',bottom:'tnt_bottom',side:'tnt_side'},hardness:0,sound:'grass',interactive:true,flammable:true});
define('glowstone',{lightEmission:15,hardness:.3,sound:'glass'});
for(const metal of ['iron','gold','diamond','emerald','lapis','coal','redstone'])define(`${metal}_block`,{hardness:metal==='coal'?5:metal==='lapis'||metal==='gold'?3:5,...stone,level:metal==='diamond'||metal==='gold'||metal==='emerald'?2:metal==='iron'||metal==='lapis'?1:0,sound:'metal'});
for(const facing of FACINGS)define(`ladder_${facing}`,{family:'ladder',display:'Ladder',shape:'ladder',facing,tiles:'ladder',hardness:.4,tool:'axe',sound:'wood',climbable:true,item:'ladder',needsSupport:true});
for(const facing of FACINGS)define(`bed_${facing}`,{family:'bed',display:'Bed',shape:'bed',facing,tiles:{top:'bed_top',bottom:'oak_planks',side:'bed_side'},opaque:false,lightOpacity:0,hardness:.2,sound:'cloth',interactive:true,item:'red_bed'});
for(const half of ['lower','upper'] as const)for(const open of [false,true])for(const facing of FACINGS)
  define(`oak_door_${half}_${open?'open':'closed'}_${facing}`,{family:'oak_door',display:'Oak Door',shape:'door',facing,door:{half,open},tiles:half==='lower'?'oak_door_bottom':'oak_door_top',
    hardness:3,tool:'axe',sound:'wood',interactive:true,item:'oak_door',needsSupport:half==='lower'});
for(const slab of ['stone','cobblestone','oak','sandstone'])define(`${slab}_slab`,{shape:'slab',opaque:false,lightOpacity:0,tiles:slab==='oak'?'oak_planks':slab==='sandstone'?{top:'sandstone_top',bottom:'sandstone_bottom',side:'sandstone'}:slab,
  hardness:2,...(slab==='oak'?{tool:'axe' as const,sound:'wood' as const}:stone)});

if(BLOCKS.length>256)throw new Error(`Too many block states: ${BLOCKS.length}`);
export const BLOCK_COUNT=BLOCKS.length;

// ---- Fast lookup tables for hot loops (indexed by BlockId) ---------------------------------
export const SOLID=new Uint8Array(256),OPAQUE=new Uint8Array(256),LIGHT_OPACITY=new Uint8Array(256),LIGHT_EMISSION=new Uint8Array(256);
export const REPLACEABLE=new Uint8Array(256),LIQUID=new Uint8Array(256),CLIMBABLE=new Uint8Array(256);
/** 0 none, 1 opaque, 2 cutout, 3 translucent. */
export const LAYER=new Uint8Array(256);
for(const d of BLOCKS){
  SOLID[d.id]=+d.solid;OPAQUE[d.id]=+d.opaque;LIGHT_OPACITY[d.id]=d.lightOpacity;LIGHT_EMISSION[d.id]=d.lightEmission;
  REPLACEABLE[d.id]=+d.replaceable;LIQUID[d.id]=d.liquid?(d.liquid.kind==='water'?1:2):0;CLIMBABLE[d.id]=+d.climbable;
  LAYER[d.id]={none:0,opaque:1,cutout:2,translucent:3}[d.layer];
}
export const AIR=0;
// Frequently used ids.
export const B={
  stone:blockId('stone'),cobblestone:blockId('cobblestone'),bedrock:blockId('bedrock'),dirt:blockId('dirt'),grass:blockId('grass_block'),
  sand:blockId('sand'),gravel:blockId('gravel'),water:blockId('water'),lava:blockId('lava'),oakLog:blockId('oak_log'),oakLeaves:blockId('oak_leaves'),
  oakPlanks:blockId('oak_planks'),glass:blockId('glass'),torch:blockId('torch'),snow:blockId('snow'),snowBlock:blockId('snow_block'),ice:blockId('ice'),
  farmland:blockId('farmland'),obsidian:blockId('obsidian'),craftingTable:blockId('crafting_table'),shortGrass:blockId('short_grass')
} as const;
export const isWater=(id:BlockId)=>LIQUID[id]===1;
export const isLava=(id:BlockId)=>LIQUID[id]===2;
export const isLiquid=(id:BlockId)=>LIQUID[id]!==0;

// ---- Atlas tiles ------------------------------------------------------------------------------
// Every tile name referenced by a block, plus overlays used by the renderer. art/atlas.ts paints
// each one into a 16×16 cell of a 256×256 atlas.
export const TILE=16,ATLAS_COLUMNS=16,ATLAS_ROWS=16;
const EXTRA_TILES=[...Array.from({length:10},(_,i)=>`destroy_stage_${i}`),'grass_block_side_overlay'];
export const TILE_NAMES:string[]=[...new Set([...BLOCKS.flatMap(b=>b.tiles),...EXTRA_TILES])];
if(TILE_NAMES.length>ATLAS_COLUMNS*ATLAS_ROWS)throw new Error('Too many tiles');
export const TILE_INDEX=new Map(TILE_NAMES.map((name,i)=>[name,i]));
export const tileIndex=(name:string)=>{const i=TILE_INDEX.get(name);if(i===undefined)throw new Error(`Unknown tile ${name}`);return i;};
/** Per block, per face, the atlas tile index (BLOCK_COUNT × 6). */
export const FACE_TILE=new Uint8Array(256*6);
for(const d of BLOCKS)d.tiles.forEach((t,f)=>{FACE_TILE[d.id*6+f]=tileIndex(t);});
