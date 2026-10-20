// Blockcraft service contracts.
//
// The game is a set of services wired together by engine/game.ts. Each service lives in its own
// module and is created by a factory `create<Name>(game)`. Modules talk to each other ONLY through
// these interfaces (via the `Game` object) and the event bus, never by importing each other's
// internals. Data registries (blocks, items, biomes) are in data/.
//
// Coordinates: world space, 1 unit = 1 block, +y up. A block at integer (x,y,z) spans [x,x+1).
// Yaw 0 looks toward -z (north); positive yaw turns left (counter-clockwise from above).
// Pitch is up-positive in radians, clamped to ±1.55. Time is in ticks (20 per second) unless named
// `seconds` / `dt` (seconds).
import type * as THREE from 'three';
import type {GameContext} from '../../../core/types';
import type {BlockId,SoundKind,WoodType} from '../data/blocks';
import type {BiomeId} from '../data/biomes';
import type {ItemId,ItemStack,FoodStats,ArmorSlot} from '../data/items';
import type {EventBus} from './events';

export type {BlockId,ItemId,ItemStack,BiomeId,FoodStats,ArmorSlot};
export interface Vec3{x:number;y:number;z:number}
export type GameMode='survival'|'creative';
export type Difficulty='peaceful'|'easy'|'normal'|'hard';
/** Engine state. 'screen' = an inventory-like screen is open (world keeps running, mouse released). */
export type EngineState='loading'|'ready'|'playing'|'screen'|'paused'|'dead'|'lost';

// ---- Lifecycle shared by all services ---------------------------------------------------------
export interface System{
  /** Called once after every service exists. */
  init?():void;
  /** Fixed 20 Hz logic tick while the world runs (not while paused / loading / dead). */
  tick?():void;
  /** Every rendered frame (also while a screen is open). `dt` seconds, capped at 0.1. */
  frame?(dt:number):void;
  /** New world (restart): clear all state. */
  reset?():void;
  /** JSON-safe snapshot of this service. Must be cheap: called every 5 seconds. */
  serialize?():unknown;
  /** Validate untrusted data; ignore what is invalid. Called after reset(). */
  restore?(data:unknown):void;
  dispose?():void;
}

// ---- World data -------------------------------------------------------------------------------
/** Generated or loaded contents of a 16×CH×16 chunk. */
export interface ChunkData{
  /** CHUNK_VOLUME block ids, index voxelIndex(x,y,z). */
  blocks:Uint8Array;
  /** 256 biome ids, index x + z*16. */
  biomes:Uint8Array;
}
export interface Chunk extends ChunkData{
  readonly cx:number;readonly cz:number;readonly key:number;
  /** Per-voxel light (sky<<4 | block) for this chunk's own volume, filled when the chunk is meshed. */
  light:Uint8Array|null;
  /** Highest non-air y per column (x + z*16), -1 for empty columns. Maintained by World. */
  heightmap:Int16Array;
}
export type ChangeCause='player'|'tick'|'explosion'|'entity'|'growth'|'fluid'|'restore';
/** Read access used by pure algorithms (physics, AI, tree growth). -1 = not loaded. */
export interface BlockSource{get(x:number,y:number,z:number):number}
export interface BlockWriter extends BlockSource{set(x:number,y:number,z:number,id:BlockId,cause?:ChangeCause):boolean}
export interface World extends BlockWriter{
  readonly chunks:ReadonlyMap<number,Chunk>;
  chunk(cx:number,cz:number):Chunk|undefined;
  isLoaded(x:number,z:number):boolean;
  /** Sets a block, records it as an edit, emits `blockChanged` and marks affected chunks for remeshing. Returns false if unloaded/unchanged. */
  set(x:number,y:number,z:number,id:BlockId,cause?:ChangeCause):boolean;
  biomeAt(x:number,z:number):BiomeId;
  /** Highest non-air block y in a column, or -1. */
  topY(x:number,z:number):number;
  /** Packed light (sky<<4|block). Unknown light (not yet meshed): 15 sky above the heightmap, else 0. */
  lightAt(x:number,y:number,z:number):number;
  /** Light as seen now: max(block, sky - darkening at the current time of day). 0..15. */
  brightnessAt(x:number,y:number,z:number):number;
  /** Mark a chunk (and optionally neighbours) for remeshing without changing blocks. */
  invalidate(x:number,y:number,z:number):void;
}

// ---- Terrain and light (pure, also run in workers) --------------------------------------------
export type TreeKind=WoodType|'big_oak'|'mega_spruce'|'jungle_bush';
export interface TerrainService extends System{
  readonly seed:number;
  /** Deterministic chunk contents; runs in a worker too (must not touch the DOM or Game). */
  generate(cx:number,cz:number):ChunkData;
  /** Feet position of a safe surface spawn near the origin. */
  spawnPoint():Vec3;
  biomeAt(x:number,z:number):BiomeId;
  /** Approximate terrain surface height (no structures). */
  heightAt(x:number,z:number):number;
  /** Grow a tree from a sapling at (x,y,z); returns false when there is not enough room. */
  growTree(world:BlockWriter,x:number,y:number,z:number,kind:TreeKind,random:()=>number):boolean;
}
/** Light engine (world/light.ts). Pure: computes light for a padded chunk volume. */
export interface LightEngine{
  /** neighbours: 3×3 chunks ordered [-x-z, 0-z, +x-z, -x0, center, +x0, -x+z, 0+z, +x+z] (null = missing, treat as opaque).
   *  Writes sky<<4|block for every padded voxel (padIndex) into `out` (PAD_VOLUME bytes). */
  computePadded(neighbours:readonly (ChunkData|null)[],out:Uint8Array):void;
}

// ---- Meshing and rendering ---------------------------------------------------------------------
/** Vertex layout shared by render/mesher.ts (writer) and render/renderer.ts (shaders).
 *  Per vertex, three attributes:
 *   - `position` Uint16 ×4: x*16, y*16, z*16 (1/16-block fixed point, chunk local), and w = light | flags<<8
 *       light = sky<<4 | block (0..15 each, smoothed per vertex); flags bit0 = sway (leaves/plants), bit1 = liquid surface.
 *   - `uvt` Uint16 ×4: u*16, v*16 (texture coords in 1/16 block; tiles repeat every 16), tile index, shade (0..255: AO × face shade).
 *   - `tint` Uint8 ×4 normalized: biome tint rgb (255,255,255 = none), a unused (255).
 *  Quads use 4 vertices; triangles (0,1,2),(2,1,3) via a shared index buffer. */
export interface MeshPart{position:Uint16Array;uvt:Uint16Array;tint:Uint8Array;quads:number}
export interface ChunkMesh{
  opaque:MeshPart;cutout:MeshPart;translucent:MeshPart;
  /** Occupied height range, for bounding volumes. */
  minY:number;maxY:number;
}
export interface Mesher{
  /** neighbours as for LightEngine; light = output of computePadded for the same neighbourhood. */
  meshChunk(neighbours:readonly (ChunkData|null)[],light:Uint8Array):ChunkMesh;
}
export type ParticleKind='block'|'smoke'|'explosion'|'splash'|'bubble'|'crit'|'heart'|'flame'|'xp';
export interface RenderService extends System{
  readonly renderer:THREE.WebGLRenderer;readonly scene:THREE.Scene;readonly camera:THREE.PerspectiveCamera;
  /** Upload (or replace) a chunk's mesh; null removes it. */
  setChunkMesh(cx:number,cz:number,mesh:ChunkMesh|null):void;
  /** Outline the targeted block; null hides it. */
  setSelection(box:{x:number;y:number;z:number}|null):void;
  /** Breaking crack overlay on a block (stage 0..9), null hides. */
  setBreaking(pos:Vec3|null,stage:number):void;
  spawnParticles(kind:ParticleKind,x:number,y:number,z:number,options?:{block?:BlockId;count?:number;spread?:number}):void;
  /** First-person held item; `swing` plays the arm swing once. */
  setHeldItem(stack:ItemStack|null):void;
  swing():void;
  /** View distance in chunks (fog and far plane). */
  setViewDistance(chunks:number):void;
  /** Field-of-view multiplier (sprinting, flying), eased by the renderer. */
  setFovScale(scale:number):void;
  /** Draw the frame. Called by the engine after all frame() hooks. */
  render():void;
  /** Rendering statistics for the debug overlay and tests. */
  info():{drawCalls:number;triangles:number;chunks:number};
  /** Resolution scale chosen by the adaptive governor. */
  readonly resolutionScale:number;
}

// ---- Player --------------------------------------------------------------------------------------
export interface PlayerState extends Vec3{
  vx:number;vy:number;vz:number;yaw:number;pitch:number;
  onGround:boolean;inWater:boolean;inLava:boolean;headInWater:boolean;onLadder:boolean;
  sneaking:boolean;sprinting:boolean;flying:boolean;
  /** Blocks fallen since last on ground (for fall damage). */
  fallDistance:number;
  /** World spawn and bed spawn (respawn point). */
  spawn:Vec3;bedSpawn:Vec3|null;
}
export interface PlayerService extends System{
  readonly state:PlayerState;
  readonly width:number;readonly height:number;
  /** Eye height above feet (lower while sneaking). */
  eyeHeight():number;
  eye():Vec3;
  /** Unit look vector from yaw/pitch. */
  look():Vec3;
  teleport(x:number,y:number,z:number):void;
  /** Push the player (knockback). */
  push(vx:number,vy:number,vz:number):void;
  /** Apply mouse/touch look deltas in radians. */
  rotate(dyaw:number,dpitch:number):void;
}
export interface InputService extends System{
  /** Current held state of an action. */
  down(action:InputAction):boolean;
  /** True once per press (edge), cleared when read. */
  pressed(action:InputAction):boolean;
  /** Movement axes -1..1 combined from keys and touch stick. */
  move():{forward:number;strafe:number};
  /** Request pointer lock (needs a user gesture). */
  capture():void;
  release():void;
  readonly captured:boolean;
  readonly touch:boolean;
  /** Clear all held state (pause, blur, screen open). */
  clear():void;
}
export type InputAction='forward'|'back'|'left'|'right'|'jump'|'sneak'|'sprint'|'attack'|'use'|'pick'|'drop'|'inventory'|'debug'|'hotbar'|'perspective';

// ---- Survival ------------------------------------------------------------------------------------
export type DamageKind='player'|'mob'|'projectile'|'fall'|'lava'|'fire'|'explosion'|'drown'|'starve'|'void'|'cactus'|'suffocate'|'magic';
export interface DamageSource{kind:DamageKind;attacker?:Entity|null;
  /** Knockback direction (world xz) from the attacker; magnitude in blocks/second. */
  knockback?:{x:number;z:number;strength:number}}
export interface StatusEffect{name:string;level:number;ticks:number}
export interface SurvivalService extends System{
  readonly health:number;readonly maxHealth:number;readonly food:number;readonly saturation:number;readonly air:number;readonly maxAir:number;
  readonly absorption:number;
  readonly xpLevel:number;
  /** 0..1 progress to the next level. */
  readonly xpProgress:number;readonly xpTotal:number;
  readonly dead:boolean;
  /** Ticks remaining burning (0 = not on fire). */
  readonly burning:number;
  /** Armour points 0..20 from worn armour. */
  armorPoints():number;
  /** Applies armour, mode (creative ignores), invulnerability frames and knockback. Returns damage taken. */
  damage(amount:number,source:DamageSource):number;
  heal(amount:number):void;
  addExhaustion(amount:number):void;
  /** Starts eating is the interaction layer's job; this applies the food when it finishes. */
  eat(food:FoodStats):void;
  canEat(food:FoodStats):boolean;
  addXp(points:number):void;
  addEffect(name:string,seconds:number,level?:number):void;
  effects():readonly StatusEffect[];
  ignite(seconds:number):void;
  /** Called by the player controller on landing. */
  land(fallDistance:number):void;
  respawn():void;
  kill(message:string):void;
}

// ---- Items, inventory and crafting ---------------------------------------------------------------
export type InventoryListener=()=>void;
export interface InventoryService extends System{
  /** 36 slots: 0-8 hotbar, 9-35 main. */
  readonly slots:(ItemStack|null)[];
  /** Armour by slot index 0 head, 1 chest, 2 legs, 3 feet. */
  readonly armor:(ItemStack|null)[];
  offhand:ItemStack|null;
  /** Selected hotbar index 0..8. */
  selected:number;
  held():ItemStack|null;
  select(index:number):void;
  /** Adds a stack (merging), returns the count that did not fit. Creative mode still stores items. */
  add(stack:ItemStack):number;
  /** Consumes items from the held stack (no-op in creative). */
  consumeHeld(count?:number):void;
  /** Adds wear to the held tool; breaks it (sound + removal) when worn out. No-op in creative. */
  damageHeld(amount?:number):void;
  /** Wears armour after the player takes damage. */
  damageArmor(amount:number):void;
  armorIn(slot:ArmorSlot):ItemStack|null;
  count(id:ItemId):number;
  /** Removes up to `count` items of an id; returns the number removed. */
  remove(id:ItemId,count:number):number;
  setSlot(index:number,stack:ItemStack|null):void;
  /** Throws the held item (one, or the whole stack) as an item entity. */
  dropHeld(all:boolean):void;
  /** Drops everything (death without keepInventory). */
  dropAll():void;
  clear():void;
  onChange(listener:InventoryListener):()=>void;
}
export interface RecipeMatch{result:ItemStack;
  /** Items left in grid slots after crafting (e.g. empty buckets); null where nothing remains. */
  remainders:(ItemStack|null)[]}
export interface SmeltResult{result:ItemStack;xp:number}
export interface CraftingService extends System{
  /** Match a crafting grid (row-major, width×height, 2×2 or 3×3). */
  match(grid:readonly (ItemStack|null)[],width:number,height:number):RecipeMatch|null;
  smelt(input:ItemId):SmeltResult|null;
  /** Seconds a furnace burns on one item (0 = not fuel). */
  fuelSeconds(id:ItemId):number;
  /** Every recipe that produces an item (recipe book / creative). */
  recipesFor(id:ItemId):readonly {width:number;height:number;grid:(ItemId|null)[];count:number}[];
}
export interface ChestEntity{kind:'chest';items:(ItemStack|null)[]}
export interface FurnaceEntity{kind:'furnace';input:ItemStack|null;fuel:ItemStack|null;output:ItemStack|null;
  /** Seconds of fuel left / of the current fuel item. */
  burn:number;burnTotal:number;
  /** Seconds cooked of the current item (10 s per item). */
  cook:number;xp:number}
export type BlockEntity=ChestEntity|FurnaceEntity;
export interface BlockEntityService extends System{
  get(x:number,y:number,z:number):BlockEntity|undefined;
  /** Creates the block entity for a newly placed chest/furnace. */
  create(x:number,y:number,z:number,kind:BlockEntity['kind']):BlockEntity;
  /** Removes it and returns its contents (to drop). */
  remove(x:number,y:number,z:number):ItemStack[];
}

// ---- Entities ----------------------------------------------------------------------------------
export type EntityCategory='passive'|'hostile'|'item'|'projectile'|'xp'|'misc';
export interface Entity extends Vec3{
  readonly id:number;readonly kind:string;readonly category:EntityCategory;
  vx:number;vy:number;vz:number;yaw:number;pitch:number;
  /** Head yaw (looks around independently of the body). */
  headYaw:number;
  width:number;height:number;
  onGround:boolean;inWater:boolean;inLava:boolean;
  health:number;maxHealth:number;
  /** Ticks since spawn. */
  age:number;
  /** Ticks of red hurt flash remaining (and invulnerability). */
  hurtTime:number;
  /** Ticks since death (death animation), 0 while alive. */
  deathTime:number;
  removed:boolean;
  /** Ticks remaining on fire. */
  fire:number;
  /** Baby animals (scale 0.5, grow up). */
  baby:boolean;
  /** Kind-specific state (AI target, wool colour, fuse, item stack...). JSON-safe values only. */
  data:Record<string,unknown>;
}
/** Box model in the Minecraft Java style: texture-space box UVs, pixel units (16 = 1 block). */
export interface ModelBox{
  /** Min corner relative to the part pivot, pixels. */
  from:[number,number,number];size:[number,number,number];
  /** Top-left of the box's UV unwrap in the texture (standard cuboid layout). */
  uv:[number,number];
  /** Grow the box by this many pixels on every side (armour overlays, hats). */
  inflate?:number;mirror?:boolean;
}
export interface ModelPart{
  name:string;
  /** Pivot relative to the entity's feet centre, pixels; +y up, -z forward (the way the mob faces). */
  pivot:[number,number,number];
  boxes:ModelBox[];
  children?:ModelPart[];
}
export interface EntityModel{
  /** Texture size in pixels; painted once into the entity atlas. */
  textureWidth:number;textureHeight:number;
  /** Paint RGBA pixels (row-major, top row first, width×height). */
  paint(pixels:Uint8ClampedArray,width:number,height:number):void;
  parts:ModelPart[];
  /** Pose parts each frame: set rotations in radians (x pitch, y yaw, z roll) by part name. */
  animate?(entity:Entity,pose:Record<string,{x:number;y:number;z:number}>,time:number,partial:number):void;
  /** Render scale (1 = pixels/16 blocks). */
  scale?:number;
}
export interface EntityKind{
  kind:string;category:EntityCategory;width:number;height:number;maxHealth:number;
  /** Rendering: a box model, an item sprite (dropped items, arrows) or none. */
  model?:EntityModel;
  /** Per-tick behaviour (AI). Movement/collision is applied by the entity service after this. */
  tick?(entity:Entity,game:Game):void;
  /** Right click by the player with the held stack; return true if handled (shear, breed, milk...). */
  interact?(entity:Entity,game:Game,held:ItemStack|null):boolean;
  /** Loot on death (killed by player or not). */
  drops?(entity:Entity,game:Game,byPlayer:boolean):ItemStack[];
  xp?:number;
  /** Called when hurt (panic, retaliate). */
  hurt?(entity:Entity,game:Game,source:DamageSource):void;
  /** Despawns when far from the player (hostile mobs). */
  despawns?:boolean;
  /** Floats, swims or sinks in water. */
  buoyant?:boolean;
  /** Immune to fall damage (chickens) / fire. */
  noFallDamage?:boolean;fireImmune?:boolean;
  /** Burns in daylight (zombies, skeletons). */
  burnsInDaylight?:boolean;
  /** Natural spawning: weight per biome is in data/biomes.ts for animals; hostiles spawn in darkness. */
  spawn?:{light:'dark'|'grass';group:[number,number]};
}
export interface EntityRay{entity:Entity;distance:number}
export interface EntityService extends System{
  register(kind:EntityKind):void;
  kinds():readonly EntityKind[];
  spawn(kind:string,x:number,y:number,z:number,data?:Record<string,unknown>):Entity|null;
  remove(entity:Entity):void;
  all():readonly Entity[];
  /** Entities whose box is within `radius` of a point. */
  near(x:number,y:number,z:number,radius:number,filter?:(e:Entity)=>boolean):Entity[];
  /** First entity hit by a ray (for attacks / right click), ignoring item/xp entities. */
  raycast(origin:Vec3,direction:Vec3,maxDistance:number):EntityRay|null;
  /** Damage with knockback, hurt flash, invulnerability and death (drops + xp). Returns true if damage applied. */
  damage(entity:Entity,amount:number,source:DamageSource):boolean;
  /** Spawn a dropped item entity (picked up by the player after a short delay). */
  dropItem(stack:ItemStack,x:number,y:number,z:number,velocity?:Vec3):void;
  /** Spawn experience orbs totalling `points`. */
  dropXp(points:number,x:number,y:number,z:number):void;
  count(category:EntityCategory):number;
}

// ---- Interaction, block ticks, UI, sound ---------------------------------------------------------
export interface RayHit{x:number;y:number;z:number;nx:number;ny:number;nz:number;id:BlockId;distance:number}
export interface InteractionService extends System{
  /** Block under the crosshair (within reach), updated every frame. */
  readonly target:RayHit|null;
  /** Entity under the crosshair if nearer than the block. */
  readonly entityTarget:Entity|null;
  /** 0..1 attack charge (modern cooldown). */
  readonly attackCharge:number;
  /** Eating / drawing a bow progress 0..1, or null. */
  readonly using:{item:ItemId;progress:number}|null;
}
export interface BlockTickService extends System{
  /** Run a scheduled update of a block after `delay` ticks (fluids, falling blocks). */
  schedule(x:number,y:number,z:number,delay:number):void;
  /** Explosion: destroys blocks by resistance, damages and knocks back entities and the player. */
  explode(x:number,y:number,z:number,power:number,source?:Entity|null):void;
}
export type ScreenId='inventory'|'creative'|'crafting_table'|'furnace'|'chest';
export interface UIService extends System{
  /** Opens an inventory-like screen; the engine switches to state 'screen' and releases the mouse. */
  open(id:ScreenId,at?:Vec3):void;
  close():void;
  readonly screen:ScreenId|null;
  /** Short message above the hotbar (e.g. "Can't sleep now"). */
  toast(message:string):void;
}
export interface HudService extends System{
  /** Show the overlay menus owned by the HUD: start, pause, death and context-lost screens. */
  showMenu(menu:'start'|'resume'|'dead'|'lost'|null):void;
}
/** Sound names: `break:<SoundKind>`, `place:<SoundKind>`, `step:<SoundKind>`, `hit:<SoundKind>`, `hurt`, `death`, `eat`, `burp`,
 *  `drink`, `pop`, `levelup`, `orb`, `click`, `door_open`, `door_close`, `chest_open`, `chest_close`, `explode`, `fuse`, `splash`,
 *  `swim`, `fizz`, `bow`, `arrow_hit`, `tool_break`, `equip`, `mob:<kind>:ambient|hurt|death|step`. Unknown names are ignored. */
export type SoundName=string;
export interface SoundService extends System{
  play(name:SoundName,at?:Vec3|null,options?:{volume?:number;pitch?:number}):void;
  stepSound(kind:SoundKind):void;
}

// ---- Weather ----------------------------------------------------------------------------------
export type WeatherState='clear'|'rain'|'thunder';
export interface WeatherService extends System{
  readonly state:WeatherState;
  /** 0..1, eased while weather changes. Sky and light darken with it. */
  readonly intensity:number;
  /** Precipitation at a column: 'rain', 'snow' (cold biomes) or null (clear, deserts, savannas, covered). */
  precipitationAt(x:number,z:number):'rain'|'snow'|null;
  /** Is it raining on this block (exposed to sky)? Used to extinguish fire and by mobs. */
  isRainingOn(x:number,y:number,z:number):boolean;
  set(state:WeatherState,ticks?:number):void;
}

// ---- Shared entity kinds -------------------------------------------------------------------------
// Several areas spawn entity kinds registered by another area. Their data contracts:
//  - 'item'      (entity framework) data {stack:ItemStack, pickup:number ticks before pickup}
//  - 'xp_orb'    (entity framework) data {points:number}
//  - 'arrow'     (hostile mobs, entity/projectiles.ts) data {owner:'player'|'mob', damage:number, pickup:boolean}; set vx/vy/vz after spawn
//  - 'snowball', 'egg' (hostile mobs, entity/projectiles.ts) data {owner:'player'|'mob'}; set velocity after spawn
//  - 'primed_tnt' (world simulation, world/explosion*.ts) data {fuse:number ticks}
//  - 'falling_block' (world simulation) data {block:BlockId}
// Mob kinds: 'cow','pig','sheep','chicken' (passive); 'zombie','skeleton','creeper','spider' (hostile).

// ---- The game object ---------------------------------------------------------------------------
export interface GameSettings{mode:GameMode;difficulty:Difficulty;
  /** Index into VIEW_DISTANCES. */
  view:number;
  /** Mouse sensitivity multiplier. */
  sensitivity:number;keepInventory:boolean;daylightCycle:boolean}
export interface GameTime{
  /** Total ticks in this world. */
  tick:number;
  /** 0..23999, see DAY_TICKS. */
  dayTime:number;
  /** Day counter starting at 1. */
  day:number;
  /** 0 (midnight) .. 1 (noon): sky light multiplier. */
  daylight:number;
}
export interface GameEvents{
  blockChanged:{x:number;y:number;z:number;from:BlockId;to:BlockId;cause:ChangeCause};
  chunkLoaded:{cx:number;cz:number};
  chunkUnloaded:{cx:number;cz:number};
  blockBroken:{x:number;y:number;z:number;id:BlockId;byPlayer:boolean};
  blockPlaced:{x:number;y:number;z:number;id:BlockId};
  playerDamaged:{amount:number;source:DamageSource};
  playerDied:{message:string};
  playerRespawned:{};
  entitySpawned:{entity:Entity};
  entityDamaged:{entity:Entity;amount:number;source:DamageSource};
  entityDied:{entity:Entity;source:DamageSource};
  itemPickedUp:{stack:ItemStack};
  modeChanged:{mode:GameMode};
  stateChanged:{from:EngineState;to:EngineState};
  worldReset:{};
}
export interface Game{
  readonly context:GameContext;
  /** DOM root of the game (absolute positioned layers go here). */
  readonly root:HTMLElement;
  readonly canvas:HTMLCanvasElement;
  readonly events:EventBus<GameEvents>;
  readonly settings:GameSettings;
  readonly time:GameTime;
  readonly state:EngineState;
  readonly world:World;
  readonly terrain:TerrainService;
  readonly render:RenderService;
  readonly player:PlayerService;
  readonly input:InputService;
  readonly survival:SurvivalService;
  readonly inventory:InventoryService;
  readonly crafting:CraftingService;
  readonly blockEntities:BlockEntityService;
  readonly entities:EntityService;
  readonly interaction:InteractionService;
  readonly ticks:BlockTickService;
  readonly ui:UIService;
  readonly hud:HudService;
  readonly sounds:SoundService;
  readonly weather:WeatherService;
  /** Seeded random for gameplay (not world generation). */
  random():number;
  /** Start / resume play from the start or pause menu (a user gesture: captures the mouse). */
  play():void;
  /** Called by the UI service when a screen opens (state 'screen', mouse released) or closes (back to 'playing', mouse captured). */
  screenChanged(open:boolean):void;
  /** Change game mode (emits modeChanged). */
  setMode(mode:GameMode):void;
  setViewDistance(index:number):void;
  /** Statistics shown in the shell (score = blocks mined). */
  stats:{mined:number;placed:number;kills:number;deaths:number};
  /** True when reduced motion is preferred (no view bobbing, no sway). */
  readonly reducedMotion:boolean;
}
export const VIEW_DISTANCES=[3,5,7,9,12];
