// Block registry. Every voxel is one byte: a BlockId indexing BLOCKS. Block states (crop age,
// facing, fluid level, lit furnace...) are separate ids that share a `family`.
//
// Face order everywhere: +x (east), -x (west), +y (up), -y (down), +z (south), -z (north).

export type BlockId=number;
export type Shape='air'|'cube'|'cross'|'crop'|'torch'|'liquid'|'slab'|'snow_layer'|'farmland'|'cactus'|'ladder'|'door'|'bed'|'flat'|'stairs'|'lantern'|'fire';
export type RenderLayer='none'|'opaque'|'cutout'|'translucent';
export type ToolKind='pickaxe'|'axe'|'shovel'|'hoe'|'sword'|'shears';
export type SoundKind='stone'|'wood'|'gravel'|'grass'|'sand'|'cloth'|'glass'|'snow'|'metal'|'liquid'|'plant';
export type Facing='north'|'south'|'east'|'west';
export type TintKind='none'|'grass'|'foliage'|'water';
/** What a block needs to stay in place (see engine/support.ts canSurvive). */
export type SupportRule='soil'|'soil_or_sand'|'farmland'|'opaque_below'|'sugar_cane'|'cactus'|'water'|'wall'|'door'|'bed';
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
  /** Support rule when needsSupport (derived: needsSupport === support !== undefined). */
  readonly support?:SupportRule;
  readonly liquid?:{readonly kind:'water'|'lava';readonly level:number;readonly falling:boolean};
  /** facing points toward the player who placed the block (interaction facingFromYaw), or out of the wall for wall-mounted blocks.
   *  chest/furnace: the front tile is on the `facing` face. wall_torch/ladder: the support block is at (x,y,z)-FACING_VECTOR[facing];
   *  a wall torch's base touches that face and it leans 22.5° toward +facing; a ladder's quad lies 1/16 in front of the support face.
   *  oak_door: closed, the 3/16 panel is flush with the face opposite `facing` (the side away from the placer); open, it is flush with
   *  the rotateCW(facing) side; both halves share facing and open. bed: the head is at (x,y,z)-FACING_VECTOR[facing] from the foot.
   *  stairs: the low step is on the +facing half (toward the placer), the full-height back on the -facing half (see STAIRS_BOXES). */
  readonly facing?:Facing;
  /** Crop / plant age state. */
  readonly age?:number;
  readonly maxAge?:number;
  /** Lit furnace etc. */
  readonly lit?:boolean;
  /** Door half and open state. */
  readonly door?:{readonly half:'lower'|'upper';readonly open:boolean};
  /** Bed part (two-block bed: the foot is placed where the player clicks, the head one block away along -facing... see facing). */
  readonly bed?:{readonly part:'head'|'foot'};
  /** Leaves placed by a player never decay. */
  readonly persistent?:boolean;
  /** Slab half: bottom and top are half-height `slab` shapes; double is a full opaque cube (shape 'cube'). */
  readonly slab?:'bottom'|'top'|'double';
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
  support?:SupportRule;liquid?:BlockDef['liquid'];facing?:Facing;age?:number;maxAge?:number;lit?:boolean;door?:BlockDef['door'];bed?:BlockDef['bed'];persistent?:boolean;slab?:BlockDef['slab'];
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
    hardness:o.hardness??1,blastResistance:o.blast??Math.max(0,o.hardness??1),tool:o.tool,harvestLevel:o.level??0,requiresTool:o.requiresTool??false,
    replaceable:o.replaceable??false,gravity:o.gravity??false,flammable:o.flammable??false,climbable:o.climbable??false,
    needsSupport:o.support!==undefined,support:o.support,
    liquid:o.liquid,facing:o.facing,age:o.age,maxAge:o.maxAge,lit:o.lit,door:o.door,bed:o.bed,persistent:o.persistent,slab:o.slab,sound:o.sound??'stone',
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
export function stateFor(family:string,match:Partial<Pick<BlockDef,'facing'|'lit'|'age'|'slab'>>&{half?:'lower'|'upper';open?:boolean;part?:'head'|'foot';persistent?:boolean}):BlockDef|undefined{
  return familyStates(family).find(d=>(match.facing===undefined||d.facing===match.facing)&&(match.lit===undefined||!!d.lit===match.lit)
    &&(match.age===undefined||d.age===match.age)&&(match.half===undefined||d.door?.half===match.half)&&(match.open===undefined||d.door?.open===match.open)
    &&(match.part===undefined||d.bed?.part===match.part)&&(match.persistent===undefined||!!d.persistent===match.persistent)
    &&(match.slab===undefined||d.slab===match.slab));
}
/** Facing of a block placed by a player looking along `yaw`: it points back toward the player (yaw 0 looks north). */
export function facingFromYaw(yaw:number):Facing{
  const a=((yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2),q=Math.round(a/(Math.PI/2))%4;
  return (['south','east','north','west'] as Facing[])[q];
}
/** The direction the player looks along (the opposite of facingFromYaw). */
export const lookFacing=(yaw:number):Facing=>opposite(facingFromYaw(yaw));
export const rotateCW=(f:Facing):Facing=>({north:'east',east:'south',south:'west',west:'north'} as const)[f];
export const opposite=(f:Facing):Facing=>({north:'south',south:'north',east:'west',west:'east'} as const)[f];
/** Offset of the block a state rests on: below for floor blocks, behind for wall_torch/ladder. */
export function supportOffset(d:BlockDef):[number,number,number]{
  if(d.support==='wall'&&d.facing){const [fx,fz]=FACING_VECTOR[d.facing];return[-fx,0,-fz];}
  return[0,-1,0];
}

// ---- Definitions --------------------------------------------------------------------------
define('air',{shape:'air',solid:false,opaque:false,hardness:0,replaceable:true,item:null,sound:'stone'});

// Stone and earth
const stone={tool:'pickaxe' as const,requiresTool:true,sound:'stone' as const,blast:6};
define('stone',{hardness:1.5,...stone,item:'cobblestone'});
define('granite',{hardness:1.5,...stone});
define('diorite',{hardness:1.5,...stone});
define('andesite',{hardness:1.5,...stone});
define('cobblestone',{hardness:2,...stone});
define('mossy_cobblestone',{hardness:2,...stone});
define('bedrock',{hardness:-1,blast:3600000,sound:'stone',item:null});
define('dirt',{hardness:.5,tool:'shovel',sound:'gravel'});
define('coarse_dirt',{hardness:.5,tool:'shovel',sound:'gravel'});
define('grass_block',{tiles:{top:'grass_block_top',bottom:'dirt',side:'grass_block_side'},tint:'grass',tintFaces:[false,false,true,false,false,false],hardness:.6,tool:'shovel',sound:'grass',item:'grass_block'});
define('podzol',{tiles:{top:'podzol_top',bottom:'dirt',side:'podzol_side'},hardness:.5,tool:'shovel',sound:'gravel'});
define('mycelium',{tiles:{top:'mycelium_top',bottom:'dirt',side:'mycelium_side'},hardness:.6,tool:'shovel',sound:'grass'});
define('sand',{hardness:.5,tool:'shovel',gravity:true,sound:'sand'});
define('red_sand',{hardness:.5,tool:'shovel',gravity:true,sound:'sand'});
define('sandstone',{tiles:{top:'sandstone_top',bottom:'sandstone_bottom',side:'sandstone'},hardness:.8,...stone,blast:.8});
define('red_sandstone',{tiles:{top:'red_sandstone_top',bottom:'red_sandstone_bottom',side:'red_sandstone'},hardness:.8,...stone,blast:.8});
define('gravel',{hardness:.6,tool:'shovel',gravity:true,sound:'gravel'});
define('clay',{hardness:.6,tool:'shovel',sound:'gravel'});
define('snow_block',{hardness:.2,tool:'shovel',requiresTool:true,sound:'snow',tiles:'snow'});
define('snow',{shape:'snow_layer',hardness:.1,tool:'shovel',requiresTool:true,replaceable:true,sound:'snow',display:'Snow',solid:false,support:'opaque_below'});
define('ice',{layer:'translucent',opaque:false,cullSame:true,lightOpacity:2,hardness:.5,tool:'pickaxe',sound:'glass'});
define('packed_ice',{hardness:.5,tool:'pickaxe',sound:'glass'});
define('obsidian',{hardness:50,blast:1200,tool:'pickaxe',level:3,requiresTool:true,sound:'stone'});

// Ores
define('coal_ore',{hardness:3,...stone,blast:3,level:0});
define('iron_ore',{hardness:3,...stone,blast:3,level:1});
define('copper_ore',{hardness:3,...stone,blast:3,level:1});
define('gold_ore',{hardness:3,...stone,blast:3,level:2});
define('redstone_ore',{hardness:3,...stone,blast:3,level:2});
define('lapis_ore',{hardness:3,...stone,blast:3,level:1});
define('diamond_ore',{hardness:3,...stone,blast:3,level:2});
define('emerald_ore',{hardness:3,...stone,blast:3,level:2});
// Deepslate (1.17+): replaces stone in the lowest layers; its ores drop exactly what the stone ores drop.
define('deepslate',{tiles:{top:'deepslate_top',side:'deepslate'},hardness:3,...stone,item:'cobbled_deepslate'});
define('cobbled_deepslate',{hardness:3.5,...stone});
for(const [ore,level] of [['coal',0],['iron',1],['copper',1],['gold',2],['redstone',2],['lapis',1],['diamond',2]] as const)
  define(`deepslate_${ore}_ore`,{hardness:4.5,...stone,blast:3,level});
define('tuff',{hardness:1.5,...stone});
// Copper ages through exposed, weathered and oxidized states on random ticks (world/ticks.ts).
for(const age of ['copper_block','exposed_copper','weathered_copper','oxidized_copper'])define(age,{hardness:3,...stone,level:1,sound:'metal'});

// Wood: log, planks, leaves and sapling for each tree type.
export const WOOD_TYPES=['oak','birch','spruce','jungle','acacia','dark_oak','cherry'] as const;
export type WoodType=typeof WOOD_TYPES[number];
for(const wood of WOOD_TYPES){
  define(`${wood}_log`,{tiles:{top:`${wood}_log_top`,side:`${wood}_log`},hardness:2,tool:'axe',flammable:true,sound:'wood'});
  define(`${wood}_planks`,{hardness:2,blast:3,tool:'axe',flammable:true,sound:'wood'});
  for(const persistent of [false,true])define(`${wood}_leaves${persistent?'_persistent':''}`,{family:`${wood}_leaves`,display:titleCase(`${wood}_leaves`),persistent,
    tiles:`${wood}_leaves`,layer:'opaque',opaque:false,cullSame:true,lightOpacity:1,hardness:.2,tool:'shears',flammable:true,sound:'plant',
    tint:wood==='birch'||wood==='spruce'||wood==='cherry'?'none':'foliage'});
  define(`${wood}_sapling`,{shape:'cross',hardness:0,sound:'plant',support:'soil'});
}

// Plants
define('short_grass',{shape:'cross',hardness:0,replaceable:true,tint:'grass',sound:'plant',item:null,display:'Grass',support:'soil'});
define('fern',{shape:'cross',hardness:0,replaceable:true,tint:'grass',sound:'plant',item:null,support:'soil'});
define('dead_bush',{shape:'cross',hardness:0,replaceable:true,sound:'plant',item:null,support:'soil_or_sand'});
for(const flower of ['dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy'])define(flower,{shape:'cross',hardness:0,sound:'plant',support:'soil'});
define('brown_mushroom',{shape:'cross',hardness:0,sound:'plant',lightEmission:1,support:'opaque_below'});
define('red_mushroom',{shape:'cross',hardness:0,sound:'plant',support:'opaque_below'});
define('sugar_cane',{shape:'cross',hardness:0,sound:'plant',tint:'grass',support:'sugar_cane'});
define('cactus',{shape:'cactus',tiles:{top:'cactus_top',bottom:'cactus_bottom',side:'cactus_side'},hardness:.4,sound:'cloth',support:'cactus'});
define('pumpkin',{tiles:{top:'pumpkin_top',side:'pumpkin_side'},hardness:1,tool:'axe',sound:'wood'});
define('melon',{tiles:{top:'melon_top',side:'melon_side'},hardness:1,tool:'axe',sound:'wood'});
define('lily_pad',{shape:'flat',hardness:0,sound:'plant',tint:'foliage',support:'water'});
define('moss_block',{hardness:.1,tool:'hoe',sound:'grass'});

// Crops: one state per age.
for(let age=0;age<8;age++)define(`wheat_${age}`,{family:'wheat',display:'Wheat Crops',shape:'crop',age,maxAge:7,tiles:`wheat_stage${age}`,hardness:0,sound:'plant',item:'wheat_seeds',support:'farmland'});
for(let age=0;age<4;age++)define(`carrots_${age}`,{family:'carrots',display:'Carrots',shape:'crop',age,maxAge:3,tiles:`carrots_stage${age}`,hardness:0,sound:'plant',item:'carrot',support:'farmland'});
for(let age=0;age<4;age++)define(`potatoes_${age}`,{family:'potatoes',display:'Potatoes',shape:'crop',age,maxAge:3,tiles:`potatoes_stage${age}`,hardness:0,sound:'plant',item:'potato',support:'farmland'});
define('farmland',{shape:'farmland',tiles:{top:'farmland',bottom:'dirt',side:'dirt'},opaque:false,lightOpacity:0,hardness:.6,tool:'shovel',sound:'gravel',item:'dirt'});
define('farmland_wet',{family:'farmland',shape:'farmland',tiles:{top:'farmland_moist',bottom:'dirt',side:'dirt'},opaque:false,lightOpacity:0,hardness:.6,tool:'shovel',sound:'gravel',item:'dirt'});

// Fluids: source (level 0), flowing levels 1-7 and a falling column state. Level 1 is adjacent to the source (tallest);
// 7 is the thinnest edge; source and falling liquid are full height (see engine/physics liquidHeight).
for(const kind of ['water','lava'] as const){
  const base={shape:'liquid' as const,layer:kind==='water'?'translucent' as const:'opaque' as const,cullSame:true,solid:false,opaque:false,
    lightOpacity:kind==='water'?2:15,lightEmission:kind==='lava'?15:0,hardness:-1,blast:100,replaceable:true,sound:'liquid' as const,item:null,
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
define('torch',{shape:'torch',lightEmission:14,hardness:0,sound:'wood',support:'opaque_below'});
for(const facing of FACINGS)define(`wall_torch_${facing}`,{family:'wall_torch',display:'Torch',shape:'torch',facing,tiles:'torch',lightEmission:14,hardness:0,sound:'wood',item:'torch',support:'wall'});
define('glass',{layer:'cutout',opaque:false,cullSame:true,hardness:.3,sound:'glass',item:'glass'});
define('bricks',{hardness:2,...stone});
define('stone_bricks',{hardness:1.5,...stone});
define('mossy_stone_bricks',{hardness:1.5,...stone});
define('bookshelf',{tiles:{top:'oak_planks',side:'bookshelf'},hardness:1.5,tool:'axe',sound:'wood',flammable:true});
export const WOOL_COLOURS=['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'] as const;
for(const colour of WOOL_COLOURS)define(`${colour}_wool`,{hardness:.8,tool:'shears',sound:'cloth',flammable:true});
define('tnt',{tiles:{top:'tnt_top',bottom:'tnt_bottom',side:'tnt_side'},hardness:0,sound:'grass',interactive:true,flammable:true});
define('glowstone',{lightEmission:15,hardness:.3,sound:'glass'});
define('lantern',{shape:'lantern',lightEmission:15,hardness:3.5,tool:'pickaxe',requiresTool:true,sound:'metal',support:'opaque_below'});
// Fire: lit by flint and steel, lava and lightning; burns out and spreads to flammable blocks (world/ticks.ts).
define('fire',{shape:'fire',lightEmission:15,hardness:0,replaceable:true,solid:false,sound:'wood',item:null,support:'opaque_below'});
define('barrel',{tiles:{top:'barrel_top',bottom:'barrel_bottom',side:'barrel_side'},hardness:2.5,tool:'axe',sound:'wood',blockEntity:'chest',interactive:true,flammable:true});
for(const metal of ['iron','gold','diamond','emerald','lapis','coal','redstone'])define(`${metal}_block`,{hardness:metal==='coal'?5:metal==='lapis'||metal==='gold'?3:5,...stone,blast:metal==='lapis'?3:6,level:metal==='diamond'||metal==='gold'||metal==='emerald'?2:metal==='iron'||metal==='lapis'?1:0,sound:'metal'});
for(const facing of FACINGS)define(`ladder_${facing}`,{family:'ladder',display:'Ladder',shape:'ladder',facing,tiles:'ladder',hardness:.4,tool:'axe',sound:'wood',climbable:true,item:'ladder',support:'wall'});
// Two-block bed. Tiles per face: +y `bed_<part>_top` (head end at pixel row 0; the mesher rotates top UVs so row 0 points toward the
// head, i.e. -FACING_VECTOR[facing] from the foot), -y oak_planks, outward end face `bed_<part>_end`, long sides `bed_<part>_side`.
for(const part of ['foot','head'] as const)for(const facing of FACINGS){
  const faceIndex={east:0,west:1,south:4,north:5} as const,t=[`bed_${part}_side`,`bed_${part}_side`,`bed_${part}_top`,'oak_planks',`bed_${part}_side`,`bed_${part}_side`];
  // Foot end faces +facing (toward the placer); head end faces -facing.
  t[faceIndex[part==='foot'?facing:opposite(facing)]]=`bed_${part}_end`;
  define(`bed_${part}_${facing}`,{family:'bed',display:'Bed',shape:'bed',facing,bed:{part},tiles:t,opaque:false,lightOpacity:0,hardness:.2,blast:.2,sound:'cloth',interactive:true,item:'red_bed',support:'bed'});
}
for(const half of ['lower','upper'] as const)for(const open of [false,true])for(const facing of FACINGS)
  define(`oak_door_${half}_${open?'open':'closed'}_${facing}`,{family:'oak_door',display:'Oak Door',shape:'door',facing,door:{half,open},tiles:half==='lower'?'oak_door_bottom':'oak_door_top',
    hardness:3,tool:'axe',sound:'wood',interactive:true,item:'oak_door',support:'door'});
for(const slab of ['stone','cobblestone','oak','sandstone'])for(const half of ['bottom','top','double'] as const)
  define(`${slab}_slab${half==='bottom'?'':'_'+half}`,{family:`${slab}_slab`,display:titleCase(`${slab}_slab`),slab:half,shape:half==='double'?'cube':'slab',
    opaque:half==='double',lightOpacity:half==='double'?15:0,tiles:slab==='oak'?'oak_planks':slab==='sandstone'?{top:'sandstone_top',bottom:'sandstone_bottom',side:'sandstone'}:slab,
    hardness:2,...(slab==='oak'?{tool:'axe' as const,sound:'wood' as const,blast:3}:stone),item:`${slab}_slab`});
// Straight stairs (no corner shapes), bottom half only.
for(const [material,tiles] of [['oak','oak_planks'],['cobblestone','cobblestone'],['stone_brick','stone_bricks'],['sandstone','sandstone'],['brick','bricks']] as const)
  for(const facing of FACINGS)define(`${material}_stairs_${facing}`,{family:`${material}_stairs`,display:titleCase(`${material}_stairs`),shape:'stairs',facing,layer:'opaque',
    lightOpacity:0,tiles:material==='sandstone'?{top:'sandstone_top',bottom:'sandstone_bottom',side:'sandstone'}:tiles,hardness:2,
    ...(material==='oak'?{tool:'axe' as const,sound:'wood' as const,blast:3,flammable:true}:stone),item:`${material}_stairs`});

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
/** Per-block collision boxes in block units, flat [minX,minY,minZ,maxX,maxY,maxZ,...]; empty when not solid. */
export const COLLISION_BOXES:(readonly number[])[]=new Array(256).fill([]);
/** 1 when the collision shape is the full unit cube (fast path). */
export const FULL_CUBE=new Uint8Array(256);
/** Ground friction factor (vanilla slipperiness): 0.6 normal, 0.98 ice. */
export const SLIPPERINESS=new Float32Array(256).fill(.6);
/** The 3/16 door panel box (block units) for a door state. Single source of truth for mesher, collision and outline:
 *  closed, the panel is flush with the face opposite `facing` (away from the placer); open, it swings onto the face opposite
 *  rotateCW(facing). */
/** Stairs as two boxes: the bottom slab and the upper back half on the -facing side. */
export function stairsBoxes(facing:Facing):number[]{
  const back:Record<Facing,number[]>={north:[0,.5,.5,1,1,1],south:[0,.5,0,1,1,.5],east:[0,.5,0,.5,1,1],west:[.5,.5,0,1,1,1]};
  return[0,0,0,1,.5,1,...back[facing]];
}
export function doorPanelBox(facing:Facing,open:boolean):number[]{
  const t=3/16,far:Record<Facing,number[]>={north:[0,0,1-t,1,1,1],south:[0,0,0,1,1,t],east:[0,0,0,t,1,1],west:[1-t,0,0,1,1,1]};
  return far[open?rotateCW(facing):facing];
}
for(const d of BLOCKS){
  if(!d.solid){COLLISION_BOXES[d.id]=[];continue;}
  let box:number[]=[0,0,0,1,1,1];
  if(d.shape==='slab'&&d.slab!=='top')box=[0,0,0,1,.5,1];
  else if(d.shape==='farmland')box=[0,0,0,1,15/16,1];
  else if(d.shape==='bed')box=[0,0,0,1,9/16,1];
  else if(d.shape==='cactus')box=[1/16,0,1/16,15/16,1,15/16];
  else if(d.shape==='door'&&d.facing&&d.door)box=doorPanelBox(d.facing,d.door.open);
  else if(d.slab==='top')box=[0,.5,0,1,1,1];
  else if(d.shape==='stairs'&&d.facing)box=stairsBoxes(d.facing);
  else if(d.shape==='lantern')box=[5/16,0,5/16,11/16,9/16,11/16];
  COLLISION_BOXES[d.id]=box;FULL_CUBE[d.id]=+(box.join()==='0,0,0,1,1,1');
}
for(const name of ['ice','packed_ice'])SLIPPERINESS[BLOCK_BY_NAME.get(name)!.id]=.98;
/** Selection outline / interaction hit box per state in block units [minX,minY,minZ,maxX,maxY,maxZ]. Mesher geometry stays inside it. */
export const OUTLINE_BOX:(readonly number[])[]=new Array(256).fill([0,0,0,1,1,1]);
for(const d of BLOCKS){
  const p=1/16;let box:number[]=[0,0,0,1,1,1];
  if(d.shape==='air')box=[];
  else if(d.solid&&COLLISION_BOXES[d.id].length)box=[...COLLISION_BOXES[d.id]];
  if(d.shape==='snow_layer')box=[0,0,0,1,2*p,1];
  else if(d.shape==='cross')box=[2*p,0,2*p,14*p,13*p,14*p];
  else if(d.shape==='crop')box=[0,0,0,1,(2+2*((d.age??0)*7/Math.max(1,d.maxAge??7)))*p,1];
  else if(d.shape==='flat')box=[p,0,p,15*p,1.5*p,15*p];
  else if(d.shape==='torch'&&!d.facing)box=[6*p,0,6*p,10*p,10*p,10*p];
  else if(d.shape==='torch'&&d.facing){const [fx,fz]=FACING_VECTOR[d.facing];box=fx>0?[0,3*p,5.5*p,5*p,13*p,10.5*p]:fx<0?[11*p,3*p,5.5*p,1,13*p,10.5*p]:fz>0?[5.5*p,3*p,0,10.5*p,13*p,5*p]:[5.5*p,3*p,11*p,10.5*p,13*p,1];}
  else if(d.shape==='lantern')box=[5/16,0,5/16,11/16,9/16,11/16];
  else if(d.shape==='fire')box=[0,0,0,1,1/16,1];
  else if(d.shape==='stairs')box=[0,0,0,1,1,1];
  else if(d.shape==='ladder'&&d.facing){const [fx,fz]=FACING_VECTOR[d.facing];box=fx>0?[0,0,0,3*p,1,1]:fx<0?[13*p,0,0,1,1,1]:fz>0?[0,0,0,1,1,3*p]:[0,0,13*p,1,1,1];}
  OUTLINE_BOX[d.id]=box;
}
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
const EXTRA_TILES=[...Array.from({length:10},(_,i)=>`destroy_stage_${i}`),'grass_block_side_overlay','grass_block_snow'];
export const TILE_NAMES:string[]=[...new Set([...BLOCKS.flatMap(b=>b.tiles),...EXTRA_TILES])];
if(TILE_NAMES.length>ATLAS_COLUMNS*ATLAS_ROWS)throw new Error('Too many tiles');
export const TILE_INDEX=new Map(TILE_NAMES.map((name,i)=>[name,i]));
export const tileIndex=(name:string)=>{const i=TILE_INDEX.get(name);if(i===undefined)throw new Error(`Unknown tile ${name}`);return i;};
/** How each tile's alpha is used: translucent (blended), cutout (alpha test at 0.5, painted 0 or 255) or opaque (alpha ignored, paint 255).
 *  destroy_stage_N: dark crack pixels at alpha 255 on alpha 0, drawn over the block with alpha test. */
export const TILE_ALPHA=new Map<string,'opaque'|'cutout'|'translucent'>();
for(const name of TILE_NAMES)TILE_ALPHA.set(name,'opaque');
for(const d of BLOCKS)for(const t of d.tiles){
  if(d.layer==='translucent')TILE_ALPHA.set(t,'translucent');
  else if(['cross','crop','torch','ladder','door','flat','lantern','fire'].includes(d.shape)||d.family==='glass')TILE_ALPHA.set(t,'cutout');
}
for(const t of EXTRA_TILES)TILE_ALPHA.set(t,t==='grass_block_snow'?'opaque':'cutout');
/** Tiles painted in greyscale and tinted by biome colour in the mesher. */
export const TINTED_TILES=new Set<string>(['grass_block_side_overlay']);
for(const d of BLOCKS)if(d.tint!=='none')d.tiles.forEach((t,f)=>{if(d.tintFaces[f])TINTED_TILES.add(t);});
/** Per block, per face, the atlas tile index (BLOCK_COUNT × 6). */
export const FACE_TILE=new Uint8Array(256*6);
for(const d of BLOCKS)d.tiles.forEach((t,f)=>{FACE_TILE[d.id*6+f]=tileIndex(t);});
