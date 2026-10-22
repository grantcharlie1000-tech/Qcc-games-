// Blockcraft service contracts.
//
// The game is a set of services wired together by engine/game.ts. Each service lives in its own
// module and is created by a factory `create<Name>(game)`. Modules talk to each other ONLY through
// these interfaces (via the `Game` object) and the event bus, never by importing each other's
// internals. Data registries (blocks, items, biomes) are in data/; pure helpers shared by several
// areas are in engine/ (physics, support, constants).
//
// Conventions
//  - Coordinates: world space, 1 unit = 1 block, +y up. A block at integer (x,y,z) spans [x,x+1).
//    North is -z, south +z, east +x, west -x.
//  - Yaw 0 looks toward -z (north); positive yaw turns left (counter-clockwise seen from above), so
//    the look vector is (-sin yaw, 0, -cos yaw). Pitch is up-positive in radians, clamped to ±1.55.
//  - Time is in ticks (20 per second) unless a name says `seconds` or `dt` (seconds).
//  - Velocities are blocks per second. Health, damage and armour are in half-hearts (20 = full).
//  - Every factory runs in the order listed in engine/game.ts. A constructor may only store `game`
//    and build private state; reaching another service happens in init() or later.
//  - Tick order (fixed 20 Hz): survival, player, entities, ticks, blockEntities, weather, the rest.
//    Frame order (every animation frame): input, player, interaction, render (camera, then sky,
//    chunks, held item), entities (models, particles), weather (precipitation), ui, hud, the rest,
//    then render.render() draws everything.
import type * as THREE from 'three';
import type {GameContext} from '../../../core/types';
import type {BlockId,SoundKind,WoodType} from '../data/blocks';
import type {BiomeId} from '../data/biomes';
import type {ItemId,ItemStack,FoodStats,ArmorSlot,EffectName} from '../data/items';
import type {EventBus} from './events';

export type {BlockId,ItemId,ItemStack,BiomeId,FoodStats,ArmorSlot,EffectName};
export interface Vec3{x:number;y:number;z:number}
export type GameMode='survival'|'creative';
export type Difficulty='peaceful'|'easy'|'normal'|'hard';
/** Engine state. 'screen' = an inventory-like screen is open (world keeps running, mouse released). */
export type EngineState='loading'|'ready'|'playing'|'screen'|'paused'|'dead'|'lost';

// ---- Lifecycle shared by all services ---------------------------------------------------------
export interface System{
  /** Called once after every service exists and every entity kind is registered. */
  init?():void;
  /** Fixed 20 Hz logic tick while the world runs (states 'playing' and 'screen'). */
  tick?():void;
  /** Every rendered frame in every state but 'lost'. `dt` seconds, capped at 0.1. */
  frame?(dt:number):void;
  /** New world (restart, or before restore): clear all state. */
  reset?():void;
  /** JSON-safe snapshot of this service. Must be cheap: called every 5 seconds. */
  serialize?():unknown;
  /** Validate untrusted data; ignore what is invalid. Called after reset(), before the `restored` event. */
  restore?(data:unknown):void;
  /** Release DOM nodes, GPU resources, listeners and timers. Services are disposed in reverse creation order. */
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
  /** Sets a block, records it as an edit, emits `blockChanged` and marks affected chunks for remeshing
   *  (the chunk itself and neighbours sharing the edited border; light-only neighbours are relit later).
   *  Returns false if unloaded, unchanged or the edit budget is full. Never drops items or plays sounds. */
  set(x:number,y:number,z:number,id:BlockId,cause?:ChangeCause):boolean;
  /** True once MAX_EDITS voxels differ from generation: further edits of untouched voxels fail. */
  readonly editsFull:boolean;
  /** Voxels that currently differ from generation (natural snow and ice keep it under 75% of MAX_EDITS). */
  readonly editCount:number;
  biomeAt(x:number,z:number):BiomeId;
  /** Highest non-air block y in a column, or -1. */
  topY(x:number,z:number):number;
  /** Packed light (sky<<4|block). Unknown light (not yet meshed): 15 sky above the heightmap, else 0. */
  lightAt(x:number,y:number,z:number):number;
  /** Light as seen now: max(block, sky - skyDarkening). 0..15. Mob spawning and crop growth use it. */
  brightnessAt(x:number,y:number,z:number):number;
  /** Mark a chunk (and neighbours) for remeshing and relighting without changing blocks. */
  invalidate(x:number,y:number,z:number):void;
}

// ---- Terrain and light (pure, also run in workers) --------------------------------------------
export type TreeKind=WoodType|'big_oak'|'mega_spruce'|'jungle_bush';
export interface TerrainService extends System{
  readonly seed:number;
  /** Deterministic chunk contents; runs in a worker too (must not touch the DOM or Game). */
  generate(cx:number,cz:number):ChunkData;
  /** Feet position of a safe dry surface spawn near the origin, not inside a tree. */
  spawnPoint():Vec3;
  biomeAt(x:number,z:number):BiomeId;
  /** Approximate terrain surface height (no structures, no caves). */
  heightAt(x:number,z:number):number;
  /** Grow a tree whose trunk base is (x,y,z) (the sapling cell, overwritten); returns false when there is not enough room.
   *  Writes with cause 'growth'. Used by saplings and bone meal; the same shapes as generation. */
  growTree(world:BlockWriter,x:number,y:number,z:number,kind:TreeKind,random:()=>number):boolean;
}
/** Light engine (world/light.ts). Pure: computes light for a padded chunk volume. */
export interface LightEngine{
  /** neighbours: 3×3 chunks ordered [-x-z, 0-z, +x-z, -x0, center, +x0, -x+z, 0+z, +x+z] (null = missing:
   *  treat as opaque for block light, open sky above its heightmap is unknown so use full sky above y=CH-1 only).
   *  Writes sky<<4|block for every padded voxel (padIndex) into `out` (PAD_VOLUME bytes). Light spreads up to
   *  15 blocks across the 3×3 neighbourhood so the centre chunk's rim matches its neighbours. */
  computePadded(neighbours:readonly (ChunkData|null)[],out:Uint8Array):void;
  /** Optional faster path when only a few voxels changed since `out` was computed for the same neighbourhood.
   *  `changed`: every voxel edited since then, in centre-chunk local coordinates laid out like the 3×3 neighbourhood
   *  (x = worldX - 16*cx and z = worldZ - 16*cz, each -16..31; y = world y). Edits outside that frame force a full recompute. */
  relightPadded?(neighbours:readonly (ChunkData|null)[],out:Uint8Array,changed:readonly Vec3[]):void;
}

// ---- Meshing and rendering ---------------------------------------------------------------------
/** Vertex layout shared by render/mesher.ts (writer) and render/renderer.ts (shaders).
 *  Per vertex, three attributes:
 *   - `position` Uint16 ×4: x*16, y*16, z*16 (1/16-block fixed point, chunk local, 0..16*16 / 0..CH*16), and
 *       w = light | flags<<8. light = sky<<4 | block (0..15 each, smoothed per vertex);
 *       flags bit0 = sway (leaves and plants; only vertices with y above the block base sway for plants),
 *       bit1 = liquid surface (animated ripple), bit2 = emissive (ignores light: lava, glowstone, torches).
 *   - `uvt` Uint16 ×4: u*16, v*16, tile index, shade. u/v are in 1/16 block and tiles repeat every 16 units so greedy
 *       quads tile. v increases upward on side faces (v=16 is the top pixel row of the painted tile); on top/bottom faces
 *       u follows +x and v follows -z (north is up in the tile). Shade 0..255 = AO × directional face shade.
 *   - `tint` Uint8 ×4 normalized: biome tint rgb (255,255,255 = none), a unused (255).
 *  Quads use 4 vertices; triangles (0,1,2),(2,1,3) via the shared index buffer `quadIndices()` (engine/constants).
 *  Layers: opaque (depth write, no blend), cutout (alpha test 0.5, no culling of back faces for plants),
 *  translucent (blended, drawn after the others back-to-front per chunk: water, ice, stained glass). */
export interface MeshPart{position:Uint16Array;uvt:Uint16Array;tint:Uint8Array;
  /** Quads used; buffers may be longer. At most MAX_PART_QUADS. */
  quads:number}
export interface ChunkMesh{
  opaque:MeshPart;cutout:MeshPart;translucent:MeshPart;
  /** Occupied height range, for bounding volumes. */
  minY:number;maxY:number;
}
export interface Mesher{
  /** neighbours as for LightEngine; light = output of computePadded for the same neighbourhood.
   *  Copies its outputs (the caller may keep them); internal scratch buffers are reused. */
  meshChunk(neighbours:readonly (ChunkData|null)[],light:Uint8Array):ChunkMesh;
  /** One block on its own (held block, dropped block item, falling block, primed TNT): every face visible,
   *  full light (0xf0), no AO, no tint unless `tint` (0xRRGGBB) is given. Positions 0..16 (one block). */
  meshBlock(id:BlockId,tint?:number):ChunkMesh;
}
export type ParticleKind='block'|'item'|'smoke'|'large_smoke'|'explosion'|'splash'|'bubble'|'drip'|'crit'|'heart'|'angry'|
  'happy'|'flame'|'lava'|'portal'|'poof'|'slime'|'damage'|'sweep'|'note'|'spell'|
  /** Squid ink: black, does not rise, friction 0.92. */
  'ink';
export interface ParticleOptions{
  /** Block texture for 'block' (break/landing dust) and item sprite for 'item' (eating crumbs, snowball/egg breaking). */
  block?:BlockId;item?:ItemId;
  /** Particles (default depends on kind) and spawn box half size in blocks (default 0.25). */
  count?:number;spread?:number;
  /** Base velocity in blocks/second (randomised per particle). */
  velocity?:Vec3;
  /** 0xRRGGBB colour override (spell, dust). */
  color?:number;
}
/** Uniforms shared by every world shader (chunks, entities, particles, sky) so light and fog match. */
export interface SharedUniforms{
  /** 0..1 sky light multiplier after weather (see GameTime.daylight and skyDarkening). */
  daylight:{value:number};
  /** 0..15 levels subtracted from sky light. */
  skyDarkening:{value:number};
  fogColor:{value:THREE.Color};fogNear:{value:number};fogFar:{value:number};
  /** Seconds since start, for sway and ripples (frozen when reduced motion is preferred). */
  time:{value:number};
  /** 0..1 lightning flash added to the sky light. */
  flash:{value:number};
}
export interface RenderService extends System{
  readonly renderer:THREE.WebGLRenderer;readonly scene:THREE.Scene;
  /** Positioned by the renderer in its frame() from player.eye() plus view bob (bob is camera-only; game logic uses eye()). */
  readonly camera:THREE.PerspectiveCamera;
  /** The block atlas texture (ATLAS_COLUMNS × ATLAS_ROWS tiles of TILE px). Entity and particle shaders may sample it. */
  readonly atlas:THREE.Texture;
  readonly uniforms:SharedUniforms;
  /** Upload (or replace) a chunk's mesh; null removes it. */
  setChunkMesh(cx:number,cz:number,mesh:ChunkMesh|null):void;
  /** Outline box (world units) of the targeted block shape; null hides it. */
  setSelection(box:{minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number}|null):void;
  /** Breaking crack overlay (destroy_stage_0..9) on a block, stage 0..9; null hides. */
  setBreaking(pos:Vec3|null,stage:number):void;
  /** Particles (render/particles*.ts, one batched draw call, capped): simulated and drawn by the renderer. */
  spawnParticles(kind:ParticleKind,x:number,y:number,z:number,options?:ParticleOptions):void;
  /** Plays the first-person arm/item swing once (attack, place, use). The held item itself is read from
   *  game.inventory.held() every frame; eating/drawing animations follow game.interaction.using. */
  swing():void;
  /** View distance in chunks (fog and far plane). */
  setViewDistance(chunks:number):void;
  /** Field-of-view multiplier (sprinting 1.15, flying 1.1, drawing a bow < 1), eased by the renderer. */
  setFovScale(scale:number):void;
  /** Screen tint overlay: underwater, in lava, damage red flash, powder of freezing (0..1 strength). Set every frame by survival. */
  setOverlay(kind:'water'|'lava'|'hurt'|'fire'|'portal'|null,strength?:number):void;
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
  /** Swimming pose (sprint-swimming in water, or crawling under a 1-block gap): 0.6 high hitbox, eye at 0.4. */
  swimming:boolean;
  /** Blocks fallen since last on ground (for fall damage). */
  fallDistance:number;
  /** World spawn and bed spawn (respawn point). */
  spawn:Vec3;bedSpawn:Vec3|null;
}
export interface PlayerService extends System{
  readonly state:PlayerState;
  /** Hitbox: 0.6 wide, 1.8 high (1.5 sneaking, 0.6 swimming). */
  readonly width:number;readonly height:number;
  /** Eye height above feet: 1.62, 1.27 sneaking, 0.4 swimming. */
  eyeHeight():number;
  /** Eye position (no view bob; the camera adds bob). */
  eye():Vec3;
  /** Unit look vector from yaw/pitch. */
  look():Vec3;
  /** Moves the feet to (x,y,z), zeroes velocity and fall distance. Used for respawn, ender pearls, restore. */
  teleport(x:number,y:number,z:number):void;
  /** Adds an impulse to the velocity (knockback, explosions); ignored in creative flight. */
  push(vx:number,vy:number,vz:number):void;
  /** Apply mouse/touch look deltas in radians (sensitivity already applied by input). */
  rotate(dyaw:number,dpitch:number):void;
}
/** Input actions. Consumers: player (movement, jump, sneak, sprint); interaction (attack, use, pick, drop, dropStack,
 *  swapHands); ui (inventory: opens the inventory while playing, closes any open screen). The input service itself
 *  handles the hotbar keys 1-9 and the wheel (game.inventory.select), F1 (root dataset hudHidden) and F3 (debug);
 *  see ROOT_FLAGS. Escape belongs to the shell and the browser (pointer lock); never bind it. */
export type InputAction='forward'|'back'|'left'|'right'|'jump'|'sneak'|'sprint'|'attack'|'use'|'pick'|'drop'|'dropStack'|'swapHands'|'inventory'|'advancements';
export interface InputBinding{action:InputAction;
  /** KeyboardEvent.code values, a chord joined with '+' (dropStack: 'ControlLeft+KeyQ'), or 'Mouse0' / 'Mouse2' / 'Mouse1'. */
  keys:readonly string[];label:string}
export interface InputService extends System{
  /** Current held state of an action. */
  down(action:InputAction):boolean;
  /** True once per press; up to 2 unread presses are kept and each read consumes one (a consumer that discards presses reads until false). Each action has exactly one consumer (above). */
  pressed(action:InputAction):boolean;
  /** Movement axes -1..1 combined from keys and the touch stick. */
  move():{forward:number;strafe:number};
  /** Request pointer lock (needs a user gesture). */
  capture():void;
  release():void;
  readonly captured:boolean;
  readonly touch:boolean;
  /** Clear all held and pressed state (pause, blur, screen open). */
  clear():void;
  /** Key bindings for the controls help. */
  bindings():readonly InputBinding[];
}

// ---- Survival ------------------------------------------------------------------------------------
export type DamageKind='player'|'mob'|'projectile'|'fall'|'lava'|'fire'|'explosion'|'drown'|'starve'|'void'|'cactus'|'suffocate'|'magic'|'lightning';
export interface DamageSource{kind:DamageKind;
  /** The entity that caused it (the shooter for projectiles); null/undefined for the environment or the player. */
  attacker?:Entity|null;
  /** The arrow / snowball / egg entity for projectile damage. */
  projectile?:Entity|null;
  /** The player caused it (melee, a player arrow, TNT they lit): counts for drops, xp and stats. */
  byPlayer?:boolean;
  /** Knockback direction (world xz, need not be normalised) from the attacker; strength in blocks/second. */
  knockback?:{x:number;z:number;strength:number}}
export interface StatusEffect{name:EffectName;
  /** 1-based amplifier (Regeneration II = 2). */
  level:number;ticks:number}
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
  /** Applies difficulty scaling (mob and mob-projectile damage only: peaceful 0, easy min(amount, amount/2+1), normal ×1, hard ×1.5),
   *  creative immunity (except 'void'), invulnerability frames (10 ticks; a bigger hit replaces a smaller one), armour and toughness,
   *  absorption, fire resistance, knockback via player.push, armour wear (inventory.damageArmor), exhaustion 0.1, the hurt
   *  sound and `playerDamaged`. Kills when health reaches 0. Returns the health lost. */
  damage(amount:number,source:DamageSource):number;
  heal(amount:number):void;
  /** Exhaustion (4 = one food point). Callers: player (sprint 0.1/block, jump 0.05, sprint jump 0.2, swim 0.01/block),
   *  interaction (break 0.005, attack 0.1), survival itself (damage 0.1, natural regen 6). Ignored in creative/peaceful. */
  addExhaustion(amount:number):void;
  /** Interaction runs the 1.6 s eating animation; this applies the food (hunger, saturation, effects) when it finishes. */
  eat(food:FoodStats):void;
  canEat(food:FoodStats):boolean;
  addXp(points:number):void;
  addEffect(name:EffectName,seconds:number,level?:number):void;
  removeEffect(name:EffectName):void;
  /** Removes every status effect (milk). */
  clearEffects():void;
  effects():readonly StatusEffect[];
  hasEffect(name:EffectName):boolean;
  ignite(seconds:number):void;
  extinguish():void;
  /** Called by the player controller on landing (fall damage = ceil(distance - 3), none into water or in creative). */
  land(fallDistance:number):void;
  /** Resets health, food, saturation, air, fire, effects and xp (xp is kept with keepInventory). game.respawn() calls it. */
  respawn():void;
  /** Death: sets dead and health 0, drops the inventory (inventory.dropAll) and xp orbs (7 per level, max 100) unless
   *  keepInventory, then emits `playerDied` (the engine shows the death screen). Repeated calls while dead do nothing. */
  kill(message:string):void;
  /** The death message while dead ('' while alive): the death screen shows it after loading a world saved on it. */
  readonly deathMessage:string;
  /** 0..1 red hurt flash: 1 on a fresh hit, fading over the 10-tick hurt animation. */
  readonly hurtFlash:number;
}

// ---- Items, inventory and crafting ---------------------------------------------------------------
export type InventoryListener=()=>void;
export interface InventoryService extends System{
  /** 36 slots: 0-8 hotbar, 9-35 main. Read-only view: change through setSlot/add/remove. */
  readonly slots:readonly (ItemStack|null)[];
  /** Armour by slot index 0 head, 1 chest, 2 legs, 3 feet. */
  readonly armor:readonly (ItemStack|null)[];
  readonly offhand:ItemStack|null;
  /** Selected hotbar index 0..8. */
  readonly selected:number;
  held():ItemStack|null;
  select(index:number):void;
  /** Adds a stack (merging into existing stacks first, hotbar first), returns the count that did not fit. Creative mode stores items too. */
  add(stack:ItemStack):number;
  /** Consumes items from the held stack (no-op in creative); a remainder (bucket, bowl) replaces or is added. */
  consumeHeld(count?:number):void;
  /** Adds wear to the held tool; breaks it (tool_break sound + removal) when worn out. No-op in creative. */
  damageHeld(amount?:number):void;
  /** Wears every worn armour piece by max(1, floor(amount/4)) after the player takes damage. */
  damageArmor(amount:number):void;
  armorIn(slot:ArmorSlot):ItemStack|null;
  /** Equips armour (null removes). Rejects a stack whose armour slot differs. Plays `equip`. */
  setArmor(slot:ArmorSlot,stack:ItemStack|null):boolean;
  setOffhand(stack:ItemStack|null):void;
  /** Swaps the held stack and the offhand (F). */
  swapHands():void;
  /** Wears the stack in the offhand (a raised shield); breaks it with tool_break when worn out. No-op in creative. */
  damageOffhand?(amount:number):void;
  count(id:ItemId):number;
  /** Removes up to `count` items of an id; returns the number removed. */
  remove(id:ItemId,count:number):number;
  setSlot(index:number,stack:ItemStack|null):void;
  /** Throws the held item (one, or the whole stack) forward from the eye as an item entity (pickup delay 40 ticks). */
  dropHeld(all:boolean):void;
  /** Drops every slot, armour and offhand around the player with random scatter, then clears them (death). */
  dropAll():void;
  clear():void;
  onChange(listener:InventoryListener):()=>void;
}
export type CraftingStation='inventory'|'crafting_table'|'furnace';
export interface RecipeMatch{result:ItemStack;
  /** Per grid slot (same length as the grid): what stays in that slot after one craft, e.g. a bucket from a milk bucket;
   *  null where nothing remains. The UI takes one item from every non-empty slot, then puts the remainder into the slot
   *  when it became empty, else adds it to the inventory (dropping it if full). */
  remainders:(ItemStack|null)[]}
export interface SmeltResult{result:ItemStack;xp:number}
/** One alternative list per grid cell (any planks), or null. */
export type Ingredient=readonly ItemId[]|null;
export interface RecipeView{kind:'shaped'|'shapeless'|'smelting';station:CraftingStation;width:number;height:number;
  grid:readonly Ingredient[];result:ItemStack}
export interface CraftingService extends System{
  /** Match a crafting grid (row-major, width×height, 2×2 or 3×3). Shaped recipes may sit anywhere and be mirrored. */
  match(grid:readonly (ItemStack|null)[],width:number,height:number):RecipeMatch|null;
  smelt(input:ItemId):SmeltResult|null;
  /** Seconds a furnace burns on one item (0 = not fuel). */
  fuelSeconds(id:ItemId):number;
  /** Every recipe that produces an item (recipe book). */
  recipesFor(id:ItemId):readonly RecipeView[];
  allRecipes():readonly RecipeView[];
}
export interface ChestEntity{kind:'chest';items:(ItemStack|null)[]}
export interface FurnaceEntity{kind:'furnace';input:ItemStack|null;fuel:ItemStack|null;output:ItemStack|null;
  /** Seconds of fuel left / of the current fuel item. */
  burn:number;burnTotal:number;
  /** Seconds cooked of the current item (10 s per item). */
  cook:number;
  /** Experience stored by smelting, paid out when the output is taken. */
  xp:number}
export type BlockEntity=ChestEntity|FurnaceEntity;
/** Owns block entity lifecycle: listens to `blockChanged`; a block whose def has `blockEntity` gets an empty entity when
 *  placed, keeps it across state changes of the same family (furnace ⇄ furnace_lit) and chunk unloads, and drops its contents
 *  (entities.dropItem) when the block is replaced by another family. Furnaces smelt in tick(), switching lit states. */
export interface BlockEntityService extends System{
  /** Returns the block entity at a position, creating it if the block there has one but it is missing. */
  get(x:number,y:number,z:number):BlockEntity|undefined;
}

// ---- Entities ----------------------------------------------------------------------------------
export type EntityCategory='passive'|'hostile'|'water'|'item'|'projectile'|'xp'|'misc';
export type SpawnReason='natural'|'chunk'|'breed'|'egg'|'spawner'|'convert'|'restore'|'event';
export interface Entity extends Vec3{
  readonly id:number;readonly kind:string;readonly category:EntityCategory;
  /** Velocity in blocks/second (physics integrates it). */
  vx:number;vy:number;vz:number;
  /** Body yaw (model faces -z at 0) and pitch. */
  yaw:number;pitch:number;
  /** Head yaw in world space (looks around independently of the body; models clamp it to ±75° from yaw). */
  headYaw:number;
  /** Movement intent set by AI each tick: desired horizontal velocity in blocks/second (world space). The entity service
   *  accelerates toward it (ground or water friction), turns the body toward it, and keeps it until AI changes it. */
  moveX:number;moveZ:number;
  /** Set by AI to jump once (on ground, or swim up in liquid); cleared by physics. */
  jump:boolean;
  width:number;height:number;
  onGround:boolean;inWater:boolean;inLava:boolean;
  /** Set by physics each tick: blocked horizontally (AI jumps or repaths), hit something vertically. */
  collidedH:boolean;collidedV:boolean;
  health:number;maxHealth:number;
  /** Ticks since spawn. */
  age:number;
  /** Ticks of red hurt flash remaining (10 after damage; also invulnerability). */
  hurtTime:number;
  /** Ticks since death (20-tick death animation, then removal), 0 while alive. */
  deathTime:number;
  removed:boolean;
  /** Ticks remaining on fire. */
  fire:number;
  /** Baby animals (scale 0.5, grow up after 24000 ticks). */
  baby:boolean;
  /** Kind-specific state (AI target, wool colour, fuse, item stack...). JSON-safe values only (it is saved). */
  data:Record<string,unknown>;
}
/** Box model in the Minecraft Java style: texture-space box UVs, pixel units (16 = 1 block). */
export interface ModelBox{
  /** Min corner relative to the part pivot, pixels. */
  from:[number,number,number];size:[number,number,number];
  /** Top-left of the box's UV unwrap in the texture (standard cuboid layout: top/bottom row of depth×width faces,
   *  then the side row: -x, front -z, +x, back +z). */
  uv:[number,number];
  /** Grow the box by this many pixels on every side (armour overlays, hats, sheep wool). */
  inflate?:number;mirror?:boolean;
}
export interface ModelPart{
  name:string;
  /** Pivot relative to the entity's feet centre, pixels; +y up, -z forward (the way the mob faces). */
  pivot:[number,number,number];
  /** Rest rotation in radians, applied before the animated pose. */
  rotation?:[number,number,number];
  boxes:ModelBox[];
  children?:ModelPart[];
  /** Multiplied by appearance().tint (sheep wool colour, wolf collar). */
  tinted?:boolean;
  /** Drawn at full brightness and without the hurt flash (spider and enderman eyes). */
  emissive?:boolean;
}
/** Animated pose of one part, radians and pixel offsets. Parts not set this frame use their rest pose. */
export interface PartPose{x:number;y:number;z:number;px?:number;py?:number;pz?:number;visible?:boolean}
export interface AnimationState{
  /** Seconds since start (frozen when reduced motion is preferred); `partial` 0..1 between ticks. */
  time:number;partial:number;
  /** Walk cycle phase (radians) and amount 0..1, from horizontal speed. */
  limbSwing:number;limbAmount:number;
  /** Head yaw relative to the body and head pitch, radians. */
  headYaw:number;headPitch:number;
  /** 0..1 attack swing progress (0 when not attacking). */
  attack:number;
  reducedMotion:boolean;
}
export interface EntityModel{
  /** Texture size in pixels; painted once into the entity atlas. */
  textureWidth:number;textureHeight:number;
  /** Paint RGBA pixels (row-major, top row first, width×height). Original art only. */
  paint(pixels:Uint8ClampedArray,width:number,height:number):void;
  parts:ModelPart[];
  /** Pose parts each frame by part name. */
  animate?(entity:Entity,pose:Record<string,PartPose>,state:AnimationState):void;
  /** Per-entity colour and size: tint 0xRRGGBB for `tinted` parts, flash 0..1 white (creeper fuse), scale multiplier (slimes). */
  appearance?(entity:Entity):{tint?:number;flash?:number;scale?:number};
  /** Render scale (1 = pixels/16 blocks). */
  scale?:number;
}
export interface PhysicsOptions{
  /** Blocks/second² (default 32 = vanilla 0.08 per tick²). 0 = no gravity (squid in water use it). */
  gravity?:number;
  /** Fraction of velocity kept per tick in the air (default 0.98). */
  drag?:number;
  /** Step-up height in blocks (mobs 0.6, items 0). */
  stepHeight?:number;
  maxFallSpeed?:number;
}
export interface EntityKind{
  kind:string;category:EntityCategory;width:number;height:number;maxHealth:number;
  /** How it is drawn: a box model, an item sprite (`item(e)`: dropped items, snowballs, eggs, pearls),
   *  a block (`block(e)`: falling blocks, primed TNT, via mesher.meshBlock) or nothing. Default 'model' when model is set. */
  render?:'model'|'item'|'block'|'none';
  model?:EntityModel;
  item?(entity:Entity):ItemStack|null;
  block?(entity:Entity):BlockId;
  /** 'none' = the kind moves itself in tick(); otherwise the service integrates velocity, collides with moveBody,
   *  applies liquids, step-up and friction after tick(). */
  physics?:'none'|PhysicsOptions;
  /** After spawn (and after restore with reason 'restore'): set up data (wool colour, variant, size). */
  init?(entity:Entity,game:Game,reason:SpawnReason):void;
  /** Per-tick behaviour (AI). Movement/collision is applied by the entity service after this. */
  tick?(entity:Entity,game:Game):void;
  /** Right click by the player with the held stack; return true if handled (shear, breed, milk, tame...). */
  interact?(entity:Entity,game:Game,held:ItemStack|null):boolean;
  /** Loot on death; looting is not modelled. */
  drops?(entity:Entity,game:Game,byPlayer:boolean):ItemStack[];
  /** Experience dropped when killed by the player. */
  xp?:number|((entity:Entity)=>number);
  /** Called when hurt (panic, retaliate, anger). Return false to cancel the damage (endermen dodge arrows). */
  hurt?(entity:Entity,game:Game,source:DamageSource,amount:number):boolean|void;
  /** Can be targeted by the crosshair and attacked (mobs). Items, xp and projectiles are not. Default: category passive/hostile/water. */
  pickable?:boolean;
  /** Saved with the world (default true; projectiles and particles-like kinds may opt out). */
  persist?:boolean;
  /** Validate restored data for this kind; return null to drop the entity. Default: keep JSON values as is. */
  restoreData?(data:Record<string,unknown>):Record<string,unknown>|null;
  /** Despawns when far from the player (hostile mobs: instantly beyond 128 blocks, randomly beyond 32). A predicate decides per
   *  entity (endermen holding a block never despawn). */
  despawns?:boolean|((entity:Entity)=>boolean);
  /** Swims freely in water and never drowns; kinds of category 'water' (squid) also dry out on land. */
  aquatic?:boolean;
  /** Undead (zombies, husks, drowned, skeletons, strays): never drowns, as vanilla canBreatheUnderwater. */
  undead?:boolean;
  /** Paths never enter water (endermen). */
  avoidsWater?:boolean;
  /** Immune to fall damage (chickens, cats) / fire and lava. */
  noFallDamage?:boolean;fireImmune?:boolean;
  /** Burns in daylight unless in water, rain or shade (zombies, skeletons, strays, drowned out of water). */
  burnsInDaylight?:boolean;
  /** Sounds played by the entity service: `mob:<name>:ambient` every ~8 s at random, hurt, death, and step when moving on ground. */
  sounds?:{name:string;ambient?:boolean;step?:boolean};
  /** Natural spawning. Animals: light 'grass' (on grass, light ≥ 9, mostly at chunk generation), weights from biome `animals`
   *  unless `biomes` lists [biome name, weight]. Monsters: light 'dark' (block light 0 and sky brightness ≤ 7 or in caves),
   *  weight among dark spawns, `biomes` restricts, `replaces` substitutes this kind for another in matching biomes
   *  (husk for zombie in deserts, stray for skeleton in snowy biomes). Water: in water columns. Natural spawns happen 24–64 blocks
   *  from the player (caps count mobs within 128). An aquatic dark kind with `replaces` takes over the replaced kind's spawns at
   *  water positions (drowned for zombie). Grass kinds spawn on their biome's top block (sand rabbits, mycelium mooshrooms).
   *  `check(game,x,y,z)` (integer feet cell) replaces the default light test (monster darkness for dark kinds, light ≥ 9 for grass
   *  kinds) with the kind's own rule (husk and stray: darkness and open sky; slime chunks below y 40: no darkness needed); the
   *  floor, room, water, distance and cap rules still apply. */
  spawn?:{light:'dark'|'grass'|'water';group:[number,number];weight?:number;biomes?:readonly (readonly [string,number])[];replaces?:string;
    check?(game:Game,x:number,y:number,z:number):boolean};
}
export interface EntityRay{entity:Entity;distance:number}
/** Shared steering helpers (entity/ai.ts) used by every mob. They only set moveX/moveZ/jump/yaw/headYaw. */
export interface EntityAI{
  /** Occasionally (1/120 per tick by default) picks a random standable spot within 10 blocks and walks there. */
  wander(entity:Entity,speed:number,chance?:number):void;
  /** Turns the head (and body when beyond 75°) toward a point. */
  lookAt(entity:Entity,x:number,y:number,z:number):void;
  /** Straight-line steering; jumps over 1-block steps. Returns true when within 0.5 blocks horizontally. */
  moveToward(entity:Entity,x:number,y:number,z:number,speed:number):boolean;
  /** Path-finds (bounded A* over standable cells, avoiding lava, cacti and drops > 3) and follows the path.
   *  Returns false when no path was found (then falls back to moveToward). Paths are cached per entity and refreshed. */
  navigate(entity:Entity,x:number,y:number,z:number,speed:number):boolean;
  /** Runs away from a point (panic, creepers avoiding cats). */
  flee(entity:Entity,fromX:number,fromZ:number,speed:number):void;
  /** Line of sight from the entity's eyes (0.85 × height) to a point; leaves and glass block it. */
  canSee(entity:Entity,x:number,y:number,z:number):boolean;
  /** Can a mob of this size stand at the feet position without harm? */
  isSafe(x:number,y:number,z:number,width?:number,height?:number):boolean;
  stop(entity:Entity):void;
}
export interface EntityService extends System{
  readonly ai:EntityAI;
  /** Register kinds in the register<Area>(game) calls made by engine/game.ts before init(). Spawning an unknown kind returns null. */
  register(kind:EntityKind):void;
  kinds():readonly EntityKind[];
  kind(name:string):EntityKind|undefined;
  spawn(kind:string,x:number,y:number,z:number,options?:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}):Entity|null;
  remove(entity:Entity):void;
  byId(id:number):Entity|undefined;
  all():readonly Entity[];
  /** Entities whose box is within `radius` of a point. Fills and returns `out` when given (no allocation). */
  near(x:number,y:number,z:number,radius:number,filter?:(e:Entity)=>boolean,out?:Entity[]):Entity[];
  /** First pickable entity hit by a ray. */
  raycast(origin:Vec3,direction:Vec3,maxDistance:number,ignore?:Entity|null):EntityRay|null;
  /** Damage with knockback, hurt flash, invulnerability, sounds and death (drops + xp when byPlayer). Returns true if applied.
   *  Amount 0 is a valid hit (snowballs, eggs, pearls): flash, invulnerability, knockback and the kind's hurt hook still run. */
  damage(entity:Entity,amount:number,source:DamageSource):boolean;
  /** Spawn a dropped item entity; merges with nearby equal stacks. pickupDelay in ticks (default 10). */
  dropItem(stack:ItemStack,x:number,y:number,z:number,velocity?:Vec3,pickupDelay?:number):void;
  /** Spawn experience orbs totalling `points`. */
  dropXp(points:number,x:number,y:number,z:number):void;
  count(category:EntityCategory):number;
}

// ---- Interaction, block ticks, UI, sound ---------------------------------------------------------
export interface RayHit{x:number;y:number;z:number;nx:number;ny:number;nz:number;id:BlockId;distance:number}
/** Mining, placing, attacking and using items. Doors open on use (both halves, `door_open`/`door_close`); breaking either
 *  half breaks the other (support rule) and only the lower half drops the door. Beds: use at night (dayTime 12542..23459)
 *  or in a thunderstorm sleeps (sets bedSpawn, game.skipTime to morning, emits playerSlept) unless monsters are within
 *  8 blocks ("You may not rest now; there are monsters nearby") or it is day ("You can sleep only at night"); only the foot
 *  drops the bed. Placing a block refuses cells overlapping the player or a mob. */
export interface InteractionService extends System{
  /** Block under the crosshair (within reach: 4.5 survival, 5 creative), updated every frame. */
  readonly target:RayHit|null;
  /** Entity under the crosshair if nearer than the block (reach 3). */
  readonly entityTarget:Entity|null;
  /** 0..1 attack charge (modern cooldown from the held tool's attack speed). */
  readonly attackCharge:number;
  /** Eating / drinking / drawing a bow progress 0..1, or null. */
  readonly using:{item:ItemId;progress:number}|null;
  /** Block being mined and progress 0..1, or null. */
  readonly breaking:{x:number;y:number;z:number;progress:number}|null;
  /** Items a block drops when broken with `tool` (null = hand or explosion). Respects requiresTool, shears, silk-free
   *  vanilla drops (stone → cobblestone, ores, leaves → saplings/apples/sticks by chance, grass seeds, crops by age). */
  blockDrops(id:BlockId,tool:ItemStack|null,cause?:ChangeCause):ItemStack[];
}
export interface BlockTickService extends System{
  /** Run a scheduled update of a block after `delay` ticks (fluids, falling blocks, support checks). */
  schedule(x:number,y:number,z:number,delay:number):void;
  /** Explosion: destroys blocks by blast resistance, drops a share of them (interaction.blockDrops with no tool), damages
   *  and knocks back entities and the player, chains TNT, sets fire when `fire`. */
  explode(x:number,y:number,z:number,power:number,source?:Entity|null,byPlayer?:boolean,fire?:boolean):void;
}
export type ScreenId='inventory'|'creative'|'crafting_table'|'furnace'|'chest'|'advancements';
export interface UIService extends System{
  /** Opens an inventory-like screen; the engine switches to state 'screen' and releases the mouse. Container screens
   *  need `at` (the block). Opening while another screen is open replaces it. */
  open(id:ScreenId,at?:Vec3):void;
  /** Closes the open screen: items on the cursor and in crafting grids go back to the inventory (dropped if full). */
  close():void;
  readonly screen:ScreenId|null;
  /** Action-bar message above the hotbar (e.g. "You can sleep only at night"); replaces the previous one. Owned by ui. */
  toast(message:string):void;
}
export interface HudService extends System{
  /** Show the overlay menus owned by the HUD: start, pause, death and context-lost screens, and the new-world confirmation
   *  for the shell's Restart ('restart': Create calls game.newWorld(), Cancel goes back to the menu it covered). */
  showMenu(menu:'start'|'resume'|'dead'|'lost'|'restart'|null):void;
}
export interface AdvancementView{id:string;title:string;description:string;icon:ItemId;parent:string|null;done:boolean;
  /** Progress for counted goals ([done, total]). */
  progress?:[number,number]}
/** Advancement tree. Shows its own toasts in the top-right zone ("Advancement Made!") and plays `toast`. */
export interface AdvancementsService extends System{
  list():readonly AdvancementView[];
  has(id:string):boolean;
  grant(id:string):void;
  /** Builds the advancements screen (tree with progress, plus statistics) inside `container` when ui opens the
   *  'advancements' screen; returns the unmount function ui calls on close. */
  mountScreen(container:HTMLElement):()=>void;
}
export type MobSoundKind='ambient'|'hurt'|'death'|'step';
/** Every sound name. Owners (who calls play): break/place → interaction; step/fall → player (and entities for mobs);
 *  hit → interaction (mining ticks); hurt/death/eat/burp/drink/levelup/orb → survival (eat → interaction while chewing);
 *  pop → entities (pickup); click/chest/door/craft → ui and interaction; explode/fuse/ignite → ticks and creepers;
 *  splash/swim → player and entities; fizz/lava/fire → ticks; bow/arrow_hit/throw → interaction and projectiles;
 *  tool_break/equip → inventory; thunder/rain → weather; attack_* /crit/sweep → interaction; toast → advancements;
 *  bucket_* → interaction; shear, milk → passive mobs (EntityKind.interact); teleport → monsters (enderman) and pearls;
 *  furnace → blockEntities (lit furnace crackle near the player); mob:* → entities (also wolf_growl/whine/pant/shake and
 *  squid_squirt voices from companions); break also passive (grazing) and ticks (blocks popping off); pop also passive (eggs);
 *  fuse, ignite and fizz also interaction (flint and steel, TNT, punching fire out); shield_block → survival; till, bone_meal,
 *  scrape → interaction. Thunder is never attenuated: `at` sets its direction, a volume below 1 is the caller's distance fade.
 *  options.volume and options.pitch replace the event's vanilla defaults, as vanilla playSound(sound, volume, pitch).
 *  Unknown names must not throw. */
export type SoundName=`break:${SoundKind}`|`place:${SoundKind}`|`step:${SoundKind}`|`hit:${SoundKind}`|`fall:${SoundKind}`|
  'hurt'|'death'|'eat'|'burp'|'drink'|'pop'|'levelup'|'orb'|'click'|'door_open'|'door_close'|'chest_open'|'chest_close'|'craft'|
  'explode'|'fuse'|'ignite'|'splash'|'swim'|'fizz'|'lava'|'fire'|'bow'|'arrow_hit'|'throw'|'tool_break'|'equip'|'thunder'|'rain'|
  'attack_weak'|'attack_strong'|'crit'|'sweep'|'toast'|'bucket_fill'|'bucket_empty'|'shear'|'milk'|'teleport'|'furnace'|
  'shield_block'|'till'|'bone_meal'|'scrape'|
  `mob:${string}:${MobSoundKind}`;
export interface SoundService extends System{
  /** Procedural Web Audio sound; positional (distance falloff and stereo pan from the camera) when `at` is given.
   *  Silent while the shell's sound setting is off or the game is paused by the shell. */
  play(name:SoundName,at?:Vec3|null,options?:{volume?:number;pitch?:number}):void;
}

// ---- Weather ----------------------------------------------------------------------------------
export type WeatherState='clear'|'rain'|'thunder';
/** Owns rain/snow visuals and sound, snow layers and ice forming in cold biomes while it snows, and lightning
 *  (strikes near the player in thunderstorms: 'lightning' damage 5, fire, creepers become charged, thunder after a delay). */
export interface WeatherService extends System{
  readonly state:WeatherState;
  /** 0..1 rain strength, eased while weather changes. Sky light darkens by up to 3 levels with it. */
  readonly intensity:number;
  /** 0..1 thunder strength (darkens by up to 5 more levels). */
  readonly thunder:number;
  /** 0..1 lightning flash, decaying over a few frames. */
  readonly flash:number;
  /** Precipitation at a column: 'rain', 'snow' (cold biomes, see coldAt) or null (clear, deserts, savannas, badlands). */
  precipitationAt(x:number,z:number,y?:number):'rain'|'snow'|null;
  /** Is it raining on this block (rain, not snow, and exposed to sky)? Extinguishes fire and burning mobs. */
  isRainingOn(x:number,y:number,z:number):boolean;
  /** Change the weather for `ticks` (random duration when omitted). */
  set(state:WeatherState,ticks?:number):void;
}

// ---- Shared entity kinds -------------------------------------------------------------------------
// Several areas spawn entity kinds registered by another area. Their data contracts:
//  - 'item'      (entities) data {stack:ItemStack, pickup:number ticks before pickup, age despawn after 6000}
//  - 'xp_orb'    (entities) data {points:number}
//  - 'arrow'     (hostile, entity/projectiles.ts) data {owner:'player'|'mob', ownerId?:number, damage:number, pickup:boolean,
//                 crit:boolean, inGround:boolean}; set vx/vy/vz after spawn. Player arrows are picked up when in ground.
//  - 'snowball', 'egg', 'ender_pearl' (hostile, entity/projectiles.ts) data {owner:'player'|'mob', ownerId?:number}; set velocity.
//                 Eggs hatch a chick 1/8; pearls teleport the player and deal 5 'fall' damage.
//  - 'primed_tnt' (ticks) data {fuse:number ticks, byPlayer:boolean}, render 'block'
//  - 'falling_block' (ticks) data {block:BlockId}, render 'block'; lands as the block or drops its item
// Mob kinds (MOB_KINDS in data/items.ts; each has a `<kind>_spawn_egg`): passive (entity/passive.ts) 'cow' (data.variant
//  'mooshroom' in mushroom fields), 'pig', 'sheep', 'chicken', 'rabbit'; companions (entity/companions.ts) 'wolf' (tameable),
//  'squid'; hostile (entity/hostile.ts) 'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'creeper', 'spider';
//  monsters (entity/monsters.ts) 'enderman', 'slime'.

// ---- The game object ---------------------------------------------------------------------------
export interface GameSettings{mode:GameMode;difficulty:Difficulty;
  /** Index into VIEW_DISTANCES. */
  view:number;
  /** Mouse sensitivity multiplier 0.1..4. */
  sensitivity:number;
  /** Field of view in degrees 50..110 (default 70). */
  fov:number;
  /** Master volume 0..1 (the shell's sound toggle still mutes). */
  volume:number;
  keepInventory:boolean;daylightCycle:boolean;mobSpawning:boolean;weatherCycle:boolean}
export interface GameTime{
  /** Total ticks in this world. */
  tick:number;
  /** 0..23999, see DAY_TICKS. */
  dayTime:number;
  /** Day counter starting at 1. */
  day:number;
  /** 0 (midnight) .. 1 (noon): sky light multiplier from the time of day. */
  daylight:number;
  /** 0..15 levels subtracted from sky light: night (up to 11) plus rain (3) and thunder (5 more), capped at 15. */
  skyDarkening:number;
}
export interface GameEvents{
  blockChanged:{x:number;y:number;z:number;from:BlockId;to:BlockId;cause:ChangeCause};
  /** fresh = generated for the first time in this world (populate animals and structures once). */
  chunkLoaded:{cx:number;cz:number;fresh:boolean};
  chunkUnloaded:{cx:number;cz:number};
  blockBroken:{x:number;y:number;z:number;id:BlockId;byPlayer:boolean};
  blockPlaced:{x:number;y:number;z:number;id:BlockId};
  playerDamaged:{amount:number;source:DamageSource};
  /** source: what killed the player, when known. */
  playerDied:{message:string;source?:DamageSource};
  /** The player landed after falling `fallDistance` blocks at feet (x,y,z) (farmland trampling). */
  playerLanded?:{fallDistance:number;x:number;y:number;z:number};
  playerRespawned:{};
  playerSlept:{};
  entitySpawned:{entity:Entity;reason:SpawnReason};
  entityDamaged:{entity:Entity;amount:number;source:DamageSource};
  entityDied:{entity:Entity;source:DamageSource};
  animalBred:{kind:string;x:number;y:number;z:number};
  entityTamed:{entity:Entity};
  /** An entity left the world (death animation over, despawned or removed); slimes split here. */
  entityRemoved?:{entity:Entity};
  itemPickedUp:{stack:ItemStack};
  /** A crafting or furnace result taken by the player. */
  itemCrafted:{stack:ItemStack;station:CraftingStation};
  /** Food eaten or potion/milk drunk. */
  itemConsumed:{stack:ItemStack};
  modeChanged:{mode:GameMode};
  settingsChanged:{settings:Readonly<GameSettings>};
  stateChanged:{from:EngineState;to:EngineState};
  /** The shell paused or resumed the game (tab hidden, Study Mode, leaving). */
  shellPaused:{paused:boolean};
  /** Time jumped (sleeping): dayTime before and after. */
  timeSkipped:{from:number;to:number};
  worldReset:{};
  /** A saved world finished restoring (every system restored). */
  restored:{};
}
/** DOM layers inside game.root (absolute, z-index): canvas 0, world overlays (crosshair, vignette) 5, HUD (hotbar, bars,
 *  action bar) 10, touch controls 15, screens 20, toasts 25, menus 30. Reserved zones: top-left debug overlay (F3),
 *  top-right advancement toasts, bottom centre hotbar and bars with the action bar above, touch stick bottom-left,
 *  touch buttons bottom-right. */
export interface Game{
  readonly context:GameContext;
  /** DOM root of the game (absolute positioned layers go here). */
  readonly root:HTMLElement;
  readonly canvas:HTMLCanvasElement;
  readonly events:EventBus<GameEvents>;
  /** Change through updateSettings / setMode / setViewDistance. */
  readonly settings:Readonly<GameSettings>;
  readonly time:Readonly<GameTime>;
  readonly state:EngineState;
  /** True until the player's chunk and neighbours are loaded (the start menu waits for it). */
  readonly spawning:boolean;
  /** The shell has paused the game (no frames run). */
  readonly shellPaused:boolean;
  readonly world:World;
  readonly terrain:TerrainService;
  readonly render:RenderService;
  readonly mesher:Mesher;
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
  readonly advancements:AdvancementsService;
  /** Seeded random for gameplay (not world generation). */
  random():number;
  /** Start / resume play from the start or pause menu (a user gesture: captures the mouse). */
  play():void;
  /** From the death screen: survival.respawn(), teleport to the bed (if still a bed) or world spawn, emit playerRespawned, play. */
  respawn():void;
  /** Replaces this world (and its save) with a fresh one from the next seed: the confirmed shell Restart. */
  newWorld():void;
  /** Called by the UI service when a screen opens (state 'screen', mouse released) or closes (back to 'playing', mouse captured). */
  screenChanged(open:boolean):void;
  /** Change game mode (emits modeChanged and settingsChanged). */
  setMode(mode:GameMode):void;
  setViewDistance(index:number):void;
  /** Validates and applies settings, then emits settingsChanged. */
  updateSettings(patch:Partial<GameSettings>):void;
  /** Jump the clock forward to `dayTime` (next occurrence), clearing the weather; emits timeSkipped. */
  skipTime(dayTime:number):void;
  /** Statistics shown in the shell (score = blocks mined). */
  readonly stats:{mined:number;placed:number;kills:number;deaths:number};
  /** True when reduced motion is preferred (no view bob, no sway, no screen shake). */
  readonly reducedMotion:boolean;
}
export const VIEW_DISTANCES=[3,5,7,9,12];
