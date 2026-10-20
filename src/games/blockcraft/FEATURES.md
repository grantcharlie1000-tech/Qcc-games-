# Blockcraft feature briefs

Modern Minecraft (Java/Bedrock 1.20-style) feature targets, one section per feature area. Each area is implemented by
one agent against `engine/contracts.ts` (read its header: units, conventions, tick and frame order, ownership notes on
each interface); ownership and rules are in `ARCHITECTURE.md`. "Must" items are required. "Should" items are expected
unless they would compromise performance or correctness. Unit tests can build services on the DOM-free
`tests/games/blockcraft/helpers/fake-game.ts`.

---

## terrain — Terrain and biomes
- **Must:** a multi-noise biome map (temperature, humidity, continentalness, erosion, weirdness) placing all 23 biomes in `data/biomes.ts` in believable regions:
  - oceans and deep oceans
  - beaches between land and ocean
  - stony shores beside steep coasts
  - rivers carved down to sea level (frozen rivers in cold regions)
  - snowy biomes in the cold, deserts, savanna and badlands in the hot and dry
  - jungles hot and wet; mushroom fields rare and isolated in the ocean
  - cherry groves on temperate hillsides (pink cherry trees)
- **Must:** heights for 128-high chunks with sea level 62:
  - plains about 63–72 with gentle hills
  - forests rolling
  - windswept hills and mountains up to about 120, with snowy peaks above about 100 (snow block and stone)
  - ocean floors about 40–55, deep ocean about 28–38
  - smooth transitions between neighbouring biomes (no cliffs at biome borders unless the biome is steep)
- **Must:** surface rules per biome (`top`, `filler`, `underwater` fields):
  - 3–5 filler blocks over stone
  - sand beaches, desert sand over sandstone, red sand over red sandstone in badlands
  - gravel or clay patches underwater
  - snow layers (`snow`) on top of exposed blocks and ice (`ice`) on sea-level water in snowy biomes
  - podzol patches under mega spruce
- **Must:** caves:
  - "cheese" caverns plus "spaghetti" tunnels plus thin noodle caves, open to the surface occasionally on land, never breaching ocean or river floors
  - lava filling cave air below y=10
  - a jagged bedrock floor at y=0–4
- **Must:** ores (vanilla-like distributions scaled to 128 height), in blobs whose sizes match vanilla:
  - coal y 0–127, most common near the surface
  - iron 0–72, peaking at 16 and 56
  - copper 0–96
  - gold 0–32
  - redstone 0–16
  - lapis 0–32 (triangular)
  - diamond 0–16 (rare)
  - emerald only in mountains
- **Must:** stone variety: granite, diorite and andesite blobs, plus gravel and dirt blobs underground.
- **Must:** deepslate (1.17+): stone below y≈8 is `deepslate`, blending to stone over y 8–16 with a dithered boundary; ores inside it use the
  `deepslate_<ore>_ore` variants; `tuff` blobs in the deepslate layer; moss patches (`moss_block`) on some cave floors.
- **Must:** trees per biome from the biome's weighted `trees`, all deterministic across chunk borders (generate trees from a margin of neighbouring columns):
  - oak and big_oak
  - birch
  - spruce
  - mega_spruce (2×2)
  - jungle (tall)
  - jungle_bush
  - acacia (bent trunk, flat canopy)
  - dark_oak (2×2 trunk, wide canopy)
  - cherry (curved branching trunk, wide pink canopy)
- **Must:** vegetation from the biome's `vegetation` list:
  - short grass, ferns, flowers, dead bushes
  - cacti 1–3 tall with no adjacent solid blocks
  - sugar cane 1–3 tall only beside water
  - pumpkins (rare patches) and melons (jungle)
  - lily pads on swamp water
  - mushrooms (dark forest, mushroom fields and caves)
- **Must:** `growTree` for every sapling kind (2×2 saplings for dark oak and mega spruce may fall back to single trees). Return false if there is no room.
- **Must:**
  - `spawnPoint()` is dry land near the origin, not under a canopy.
  - `biomeAt`/`heightAt` agree with `generate`.
  - Generation stays deterministic and ≤ 4 ms per chunk on average (measured in Node in tests); it runs in workers.
- **Should:** small structures: desert wells, and ruined cobblestone portal-like rubble (decorative only).
- **Tests:**
  - determinism
  - biome variety over a large area
  - border continuity (blocks and trees)
  - ore height ranges
  - no floating trees
  - performance

## light — Lighting engine
- **Must:** implement `LightEngine.computePadded` with flood-fill light:
  - **Sky light:** 15 straight down open columns; reduced by `LIGHT_OPACITY` through leaves, water and ice; spreads sideways and down with −1 per step into caves and overhangs.
  - **Block light:** from `LIGHT_EMISSION` (torches 14, glowstone and lava 15, lit furnaces 13), −1 per step and blocked by opacity.
  - Opaque blocks are 0 inside.
- **Must:** correct across chunk borders: compute using the full 3×3 neighbourhood (light within 15 blocks can enter the padded volume). Missing neighbours are opaque. The padded border values must equal what the neighbour chunk would compute for itself.
- **Must:** ≤ 3 ms per chunk on average for generated terrain (measure in tests on real `createTerrain` chunks), with no per-call allocation (reuse scratch typed arrays, queue as a typed ring buffer).
- **Must:** tests against a brute-force BFS reference on small random worlds; torch falloff; cave darkness; shade under trees; border continuity; water attenuation.
- **Should:** the optional `relightPadded` incremental path; the engine currently recomputes per remesh, and relights neighbours via `world.lightDirty`.
- **Must:** light emission from the new blocks (lantern 15, fire 15) comes from `LIGHT_EMISSION`; no special cases.

## mesher — Meshing
- **Must:** every `Shape` in `data/blocks.ts`:
  - **cube:** greedy-merged, with ambient occlusion
  - **cross:** two diagonal quads, double-sided
  - **crop:** four planes in a # pattern
  - **torch:** a 2×10 px stick plus a top cap; wall torches tilt about 22.5° away from the wall they hang on, per `facing`
  - **liquid:**
    - corner heights from fluid levels averaged with neighbours like vanilla (source and falling are full height)
    - the top face is lowered from 16/16 by the level
    - faces only toward air or non-liquid transparent blocks
    - a surface flag on top faces
  - **slab:** bottom half
  - **snow_layer:** 2/16 high
  - **farmland:** 15/16 high
  - **cactus:** sides inset 1/16
  - **ladder:** a flat quad 1/16 from the wall it faces
  - **door:** a 3/16 panel placed by facing and open state, upper and lower halves
  - **bed:** 9/16 high box
  - **flat:** lily pad 1/16 above the surface
  - **stairs:** the bottom slab plus the upper back half (`stairsBoxes(facing)` in `data/blocks.ts`), greedy-safe, faces culled against neighbours
  - **lantern:** a 6×7 px body with a 4×2 px cap and handle (`lantern` tile), emissive
  - **fire:** four inward-leaning planes on the block sides plus two crossed planes, emissive, animated by the renderer
- **Must:**
  - Culling: opaque neighbours hide faces, and `cullSame` families hide shared faces.
  - Partial shapes never hide neighbours' faces.
  - Liquids never draw against the same liquid.
- **Must:** smooth lighting: per-vertex sky and block light averaged over the 4 light cells touching the vertex on the face's outer side (skip opaque cells), combined with AO. Greedy merging only when light, AO and tint are uniform.
- **Must:**
  - Biome tint blended over a 3×3 column neighbourhood, using neighbour chunks' biome arrays at chunk borders.
  - Grass block sides untinted.
  - **Should:** draw the tinted `grass_block_side_overlay` in the cutout layer.
- **Must:** set the sway flag on leaves, plants and crops, the liquid surface flag on liquid tops and the emissive flag on lava, fire, lantern,
  torches and glowstone. Assign each layer from the registry `layer`.
- **Must:** `meshBlock(id,tint?)` for held blocks, dropped block items, falling blocks and primed TNT (every face, full light, no AO).
- **Must:** follow the UV convention in `MeshPart` (side faces: v up; top/bottom: u along +x, v along -z) so painted tiles appear upright.
- **Must:**
  - ≤ 2 ms per chunk on average for generated terrain in Node.
  - No allocation in hot loops.
  - Positions in 1/16 fixed point exactly per the `MeshPart` layout.
  - Tests for every shape, culling, smooth light, tint blending, border continuity and performance.

## renderer — Renderer and sky
- **Must:** keep the `RenderService` contract and the `MeshPart` vertex layout; extend the shaders. Expose `atlas` and the `SharedUniforms`
  objects (shared by reference) so entity, particle and weather shaders match chunk light and fog. Position the camera in `frame()` (engine
  frame order: input, player, interaction, render, entities...), so entities can billboard against it.
- **Must:** the sky:
  - a gradient dome (zenith and horizon colours by time of day and the biome `sky` colour)
  - sunrise and sunset glow near the horizon
  - square sun and moon (procedural, original pixel art; moon phases by day)
  - stars at night
  - fog colour matches the horizon
  - clouds fade with distance and darken at night and in rain (`game.weather.intensity`)
- **Must:** underwater (blue fog, short range) and in-lava (orange fog, very short) views, plus `setOverlay` screen tints (water, lava, hurt,
  fire flames at the screen bottom, portal shimmer for ender pearls). Darkness from `time.skyDarkening` (includes weather) and lightning
  `weather.flash`. Block light warm. Emissive vertices ignore light.
- **Must:** animated water and lava textures (scroll or frame-cycle in the shader). Leaves and plants sway via the vertex flag, disabled when `game.reducedMotion`.
- **Must:** a breaking crack overlay (`destroy_stage_*` tiles on a slightly inflated cube with polygon offset) and a thin black selection outline
  sized to the box passed to `setSelection` (interaction passes `OUTLINE_BOX` of the block state).
- **Must:** particles (`render/particles.ts`) in one batched draw call, capped at about 2 000, for every `ParticleKind`:
  - block debris from the block's tile and item crumbs from the item sprite (eating, snowballs, eggs)
  - smoke, large smoke, explosion, splash, bubble, drip, crit, heart, angry, happy (bone meal), flame, lava, portal (endermen), poof (death),
    slime, damage, sweep, note, spell; `ParticleOptions` velocity, colour, count and spread
- **Must:** the first-person hand and held item (polled from `game.inventory.held()` and `offhand` every frame):
  - a blocky arm, or the held item: blocks via `game.mesher.meshBlock`; items as extruded sprites using `art/items.ts` `spritePixels`
  - the offhand item (shield raised while blocking: `interaction.using?.item==='shield'`)
  - swing animation (`swing()`)
  - walk bob from player velocity and onGround (off with reduced motion)
  - eating and bow-draw poses from `game.interaction.using`
- **Must:** FOV easing, the adaptive-resolution governor (resize before drawing), and `info()`.
- **Must:**
  - ≤ 6 draw calls for sky, particles, hand and overlays combined.
  - Handle `setChunkMesh` replacing meshes without leaks.
  - Dispose everything.
- **Tests:** a unit test of time-to-colour functions; a browser spec with screenshots at noon, dusk, midnight and underwater.

## entities — Entity framework
- **Must:** implement `EntityService` completely:
  - **Physics:** per-kind `physics` options (or 'none'); gravity, `moveBody` collision with `stepHeight` (0.6 for walking mobs), water buoyancy
    and drag (aquatic kinds swim freely), lava, friction with `SLIPPERINESS`; flowing water pushes (`flowAt`). AI steers through
    `moveX/moveZ/jump` (the service accelerates toward the intent and turns the body); set `collidedH/collidedV`.
  - **Combat:** knockback, hurt flash and invulnerability (10 ticks), fall damage (unless `noFallDamage`), fire ticks and damage, burning in daylight (`burnsInDaylight`; not in water, shade or rain).
  - **Death:** death animation (tip over, 20 ticks, `poof` particles, then remove); drops always, xp only when `source.byPlayer`; the kind's
    `hurt` hook may cancel damage (returns false). Sounds from `kind.sounds` (`mob:<name>:ambient|hurt|death|step`).
  - **Lifecycle:** `spawn` calls `kind.init(entity, game, reason)` and emits `entitySpawned` with the reason; spawning an unknown kind returns null.
  - **Render modes:** 'model' box models, 'item' (dropped items and thrown items as sprites from `item(e)`), 'block' (`block(e)` via
    `game.mesher.meshBlock`: falling blocks, primed TNT with white flash).
- **Must:** spawning rules (`entity/spawning.ts`), off when `settings.mobSpawning` is false:
  - **Passive:** packs from the biome `animals` weights (or a kind's `spawn.biomes`) when a chunk loads with `fresh: true`, plus rare respawn on grass in daylight. Cap 20 near the player.
  - **Hostile:** at night or in darkness (block light 0 and `brightnessAt` ≤ 7) on solid opaque ground, 24–64 blocks from the player, groups
    from the kind's `spawn.group`, weighted by `spawn.weight`, biome filters and `replaces` substitutions (husk for zombie in deserts, stray for
    skeleton in snowy biomes, drowned in water). Cap 40.
  - **Water:** squid in water columns of oceans and rivers (`spawn.light 'water'`). Cap 8.
  - Peaceful removes hostiles.
  - Hostiles despawn beyond 128 blocks, or randomly beyond 32.
- **Must:** entities in unloaded chunks are frozen and saved with the snapshot (cap 200 persistent entities; hostiles are not persisted).
- **Must:** item entities and xp orbs:
  - Items: small spinning cubes or sprites, merge nearby equal stacks, pick up after the delay with a magnet pull, despawn after 5 minutes.
  - Xp orbs: green glowing sprites attracted to the player.
- **Must:** box-model rendering for all kinds in ≤ 3 draw calls total:
  - Build an entity texture atlas from each kind's `model.paint`.
  - Write one dynamic buffer of CPU-transformed boxes per frame with standard cuboid UVs (Java model layout; `mirror`, `inflate`).
  - Interpolate between ticks for smooth 60 fps motion.
  - Lighting from `world.brightnessAt` × daylight; red hurt tint; baby scale.
- **Must:** the `EntityAI` helpers in `entity/ai.ts` (exposed as `game.entities.ai`; a straight-line stub exists), using only contracts and `engine/physics`:
  - wander, look at, move toward with jump-when-blocked
  - avoid cliffs (more than 3 drop), lava, fire and cacti
  - flee
  - line of sight (`canSee`)
  - `navigate`: bounded A* over standable cells (≤ 200 nodes, cached per entity, re-planned when blocked or the goal moves > 2 blocks)
- **Must:**
  - Mobs push each other and the player slightly.
  - Collisions use the entity box.
  - Raycast honours `pickable` (items, xp and projectiles are not) and skips the dying.
  - `near(..., out)` fills a caller array without allocating.
  - Persistence validates everything.
- **Tests:** physics, step-up, knockback, death and drops, spawning rules, caps, pickup and merge, persistence; draw-call count in a browser spec with 60 entities.

## passive — Passive mobs
- **Must:** cow (with the mooshroom variant in mushroom fields: red with mushrooms, shears → cow + 5 red mushrooms, bowl → mushroom stew), pig,
  sheep, chicken and rabbit registered in `registerPassiveMobs`:
  - Original procedural box models and textures in Java proportions.
  - Walk animation (legs swing with speed); head looks around and at nearby players.
- **Must:** AI:
  - wander and idle
  - panic (run randomly fast for about 5 s) when hurt
  - follow a player within 10 blocks holding their food: wheat (cow, sheep), carrot or potato (pig), seeds (chicken)
  - avoid cliffs and lava; swim
- **Must:** breeding:
  - Feeding the food (right click, consumes one) enters love mode with heart particles.
  - Two in love mode within 8 blocks spawn a baby, then a 5-minute cooldown.
  - Babies grow up in 20 minutes; feeding a baby speeds growth by 10%.
- **Must:** per-mob behaviour:
  - **Cow:** milking with a bucket → milk_bucket.
  - **Sheep:** wool colour weighted by vanilla odds (mostly white, some grey, black, brown, rare pink); shearing → 1–3 wool of its colour; regrows by eating grass (grass_block → dirt).
  - **Chicken:** lays eggs every 5–10 minutes; flaps and falls slowly; no fall damage.
  - **Rabbit:** hops; coat by biome (brown, white in snow, gold in deserts); flees players; eats carrots crops; bred with carrots or
    dandelions; drops 0–1 rabbit hide, 0–1 rabbit (cooked when burning), 10% rabbit foot.
- **Must:**
  - **Drops:** cow 0–2 leather and 1–3 beef; pig 1–3 porkchop; sheep 1 wool and 1–2 mutton; chicken 0–2 feathers and 1 chicken. Meat drops cooked when the mob died burning. 1–3 xp when killed by the player.
  - Sounds via `kind.sounds` (played by the entity service) and `game.sounds` for actions (shear, milk).
  - Emit `animalBred` on a birth.
- **Tests:** AI decisions, breeding, shearing and regrowth, milking, drops, model part sanity.

## hostile — Hostile mobs and projectiles
- **Must:** zombie, husk, drowned, skeleton, stray, creeper and spider registered in `registerHostileMobs`, with original models and textures and `spawn` settings:
  - **Zombie:**
    - Chases players within 35 blocks; melee 2.5/3/4.5 damage (easy/normal/hard) with knockback.
    - Burns in daylight; 5% babies (fast, small).
    - Drops 0–2 rotten flesh, rarely an iron ingot, carrot or potato.
    - Arms raised when chasing.
  - **Husk:** desert zombie (`spawn.replaces 'zombie'` in desert biomes); does not burn; hits inflict Hunger for 7 s per difficulty level.
  - **Drowned:** spawns in rivers and oceans in darkness; swims (aquatic movement, chases swimmers); burns in daylight out of water;
    drops 0–2 rotten flesh and rarely copper; a zombie submerged for 30 s converts to a drowned (`convert` reason).
  - **Skeleton:**
    - Keeps range 6–12 and strafes; shoots arrows every 2–3 s with spread by difficulty.
    - Burns in daylight; drops 0–2 bones and 0–2 arrows.
  - **Stray:** snowy-biome skeleton (`spawn.replaces 'skeleton'`); its arrows add Slowness for 30 s.
  - **Creeper:**
    - Approaches silently; within 3 blocks hisses (`fuse` sound) and swells for 1.5 s, then `game.ticks.explode(x,y,z,3)`.
    - Defuses if the player escapes beyond 7 blocks; does not burn; drops 0–2 gunpowder.
  - **Spider:**
    - Fast; climbs walls when blocked; pounces.
    - Neutral in daylight unless attacked; drops 0–2 string.
- **Must:** projectile kinds in `entity/projectiles.ts` (contracts list their data):
  - **arrow:** gravity, drag, damage scaled by speed, sticks into blocks, the player can pick it up if `pickup`, hits mobs and the player with knockback, falls in water.
  - **snowball and egg:** break on impact with item particles; an egg has a 1/8 chance to hatch a baby chicken; snowballs knock back but deal no damage.
  - **ender_pearl:** thrown by the player (`use:'ender_pearl'`); on impact teleports the player (`player.teleport`), 5 'fall' damage, `portal` particles and `teleport` sound.
  - The player's shield (`interaction.using?.item==='shield'`, facing the arrow within 90°) blocks arrows: they bounce off and wear the shield.
- **Must:**
  - Peaceful: no hostile spawns.
  - Damage to the player via `game.survival.damage` with base (normal difficulty) amounts and `{kind:'mob' or 'projectile', attacker, projectile, knockback}`;
    survival applies the difficulty scaling. A raised shield in front of the player blocks melee (survival or interaction: check `using.item==='shield'`).
  - Sounds; AI with line of sight; no walking into lava.
- **Tests:** AI decisions, fuse/explode/defuse, arrow ballistics and hits, daylight burning, drops, difficulty scaling.

## companions — Wolves and squid
- **Must:** `wolf` and `squid` registered in `registerCompanionMobs` (`entity/companions.ts`, `entity/companions-*.ts`), original models and textures:
  - **Wolf:** spawns in packs of 4 in forests, taigas and snowy taigas (biome `animals`).
    - Wild: wanders; neutral; attacks sheep, rabbits and skeletons nearby; a pack turns angry (red eyes) on the attacker when one is hit.
    - Taming: right click with a bone, 1/3 chance per bone (smoke on failure, hearts on success); emit `entityTamed`; owner stored in data.
    - Tamed: red collar (`tinted` part + `appearance().tint`), tail height shows health, follows the owner and teleports to them beyond 12 blocks,
      sits / stands on right click (empty hand), attacks what the owner attacks or what attacks the owner, never creepers;
      heals by feeding meat; breeds with meat when tamed (puppies are tamed).
    - Sounds: bark, growl, whine at low health, pant.
  - **Squid:** category 'water', `aquatic`, no gravity in water; drifts and propels with tentacle pulses; flees when hurt with black ink
    particles; suffocates on land; drops 1–3 ink sacs.
- **Tests:** taming odds, follow/teleport, sit, owner defence, squid movement in water and drops.

## monsters — Endermen and slimes
- **Must:** `enderman` and `slime` registered in `registerMonsters` (`entity/monsters.ts`, `entity/monsters-*.ts`):
  - **Enderman:** 2.9 tall, black with emissive purple eyes, `portal` particles.
    - Neutral; becomes angry (open jaw, shaking) when the player looks at its head within 64 blocks (`player.look()` ray against the head box,
      not through blocks), or when hit; then teleports near and attacks for 7 damage.
    - Teleports randomly at times, away from water, rain (`weather.isRainingOn`) and projectiles (its `hurt` hook cancels projectile damage).
    - Picks up and places grass, dirt, sand, gravel, flowers, mushrooms, cacti, pumpkins, melons and clay (`data.carried` BlockId; held between its hands).
    - Spawns rarely in darkness everywhere; drops 0–1 ender pearl; 5 xp.
  - **Slime:** sizes 1, 2 and 4 (`appearance().scale`, `width/height` 0.52 × size); translucent outer box with an inner core; hops toward the player;
    sizes 2 and 4 deal 2 and 4 damage on contact, size 1 none; on death splits into 2–4 slimes of half size; size 1 drops 0–2 slime balls.
    - Spawns in swamps at night at light ≤ 7 between y 50 and 70, and in slime chunks below y 40 (a deterministic 1-in-10 hash of seed and chunk).
- **Tests:** stare detection geometry, teleport target safety, block carrying, slime splitting and spawn rules.

## player — Player movement and controls
- **Must:** vanilla-feeling movement at 60 Hz:
  - walk 4.317, sprint 5.612, sneak 1.295 m/s
  - jump about 1.25 blocks; sprint-jump boost
  - air control
  - ground friction with ice slipperiness
  - sneaking never walks off edges
  - automatic step-up of 0.6 blocks (slabs, snow layers)
  - swimming with buoyancy; flowing water pushes the player; sprint in water = swimming pose (`state.swimming`, 0.6 high)
  - ladder climbing (forward or jump up, sneak holds position)
  - lava slowness
  - creative flight (double-tap Space; Space up, sneak down; sprint-fly)
  - landing in water negates fall damage
- **Must:**
  - Report `fallDistance` and call `game.survival.land(distance)` on landing.
  - Keep `headInWater`, `inLava` and `onLadder` current.
  - Expose eye height for sneaking.
  - The engine's `respawn()` teleports the player; `teleport` zeroes velocity and fall distance.
  - Never fall into unloaded chunks.
  - Exhaustion: sprint 0.1/block, jump 0.05, sprint-jump 0.2, swim 0.01/block via `survival.addExhaustion`. Speed and Slowness effects scale movement.
  - Footsteps (`step:<sound of the block below>`) every ~1.7 blocks walked on ground, fall sounds, `splash` on entering water, `swim` strokes.
- **Must:** input bindings:
  - WASD and arrows; Space; Shift sneak; double-tap W or hold R to sprint
  - E inventory (consumed by ui); Q drop, Ctrl+Q drops the stack (`dropStack`); F swap hands; L advancements; 1–9 and the wheel; hold
    Ctrl to sprint (and double-tap W)
  - F3 debug and F1 hide-HUD flags on `game.root.dataset` (`ROOT_FLAGS` in `engine/constants.ts`); the HUD reads them
  - `bindings()` lists every action with its keys for the controls help
  - left/right/middle mouse
  - a sensitivity setting
  - pointer lock with drag-to-look fallback
  - never steal keys from text inputs or open dialogs (Escape belongs to the arcade)
- **Must:** touch controls (Bedrock style):
  - joystick (fully pushed = sprint), jump (double tap toggles flight in creative), sneak toggle, inventory and drop buttons
  - drag anywhere else to look
  - hold to mine or attack with progress, tap to place or use
  - a hotbar tap selects (HUD)
  - responsive at 320–1366 px wide; safe areas
- **Must:** Gamepad API support:
  - left stick move, right stick look
  - A jump, B sneak, X drop, Y inventory
  - RT attack, LT use, LB/RB hotbar
- **Tests:** movement physics (speeds, jump height, edge sneaking, step-up, ladders, swimming, flight) and input mapping; a browser spec for keyboard, mouse and touch.

## survival — Survival systems
- **Must:**
  - **Health:** 20 (half hearts).
  - **Hunger:** 20 with saturation.
  - **Exhaustion** (vanilla values): sprint 0.1/m, jump 0.05, sprint-jump 0.2, attack 0.1, mining 0.005, damage 0.1, regen 6. Each 4.0 removes saturation, then hunger.
  - **Regeneration:**
    - food ≥ 18 heals 1 every 80 ticks
    - with saturation at food 20, heals every 10 ticks
    - peaceful regenerates and restores food
  - **Starvation** at food 0: 1 damage every 80 ticks, down to 10 (easy), 1 (normal) or death (hard).
- **Must:** damage types:
  - fall (distance − 3; none into water)
  - void
  - drowning: 300 air ticks; at 0, 2 damage per second; air refills quickly out of water
  - suffocation when the head is inside an opaque block
  - lava: 4 every 10 ticks, plus fire for 15 s
  - fire: 1 per second, extinguished by water or rain (`game.weather.isRainingOn`)
  - cactus: 1 on contact
  - magic
- **Must:**
  - **Armour:** vanilla reduction `damage × (1 − min(20, max(defense/5, defense − damage/(2 + toughness/4)))/25)`; armour wear via `inventory.damageArmor`.
  - **Invulnerability:** 10 ticks, with vanilla "higher damage replaces" behaviour.
  - **Knockback:** via `player.push`.
  - **Mob damage scales by difficulty:** easy ×0.5+1, normal ×1, hard ×1.5.
  - Creative is immune except void.
- **Must:** every `EffectName` (regeneration, absorption, hunger, poison, saturation, speed, slowness, night vision, fire resistance) ticks with
  `effects()` and 1-based levels. `eat()` applies hunger, saturation and the food's effects (with their chances); `clearsEffects` (milk) calls
  `clearEffects()`. Emit `itemConsumed` from interaction when finished.
- **Must:** `setOverlay` each frame (water, lava, fire, hurt flash) and fire damage from standing in `fire` blocks.
- **Must:** shield blocking: while `interaction.using?.item==='shield'` and the attacker is within 90° of the look direction, melee and
  projectile damage is fully blocked (shield wear via inventory, knockback reduced).
- **Must:**
  - **XP:** vanilla level formula; orbs give points.
  - **Death:** drops inventory unless keepInventory; drops xp (7 × level, up to 100).
  - **Respawn:** `respawn()` resets health, food, air, fire and effects (the engine's `game.respawn()` handles the teleport and state).
  - Emit `playerDamaged` and `playerDied` with a vanilla-style death message ("fell from a high place", "drowned", "tried to swim in lava", "was slain by Zombie", "was blown up by Creeper", "starved to death", "was shot by Skeleton").
- **Tests:** all formulas and timers with deterministic tick stepping; persistence.

## inventory — Inventory and screens
- **Must:**
  - **Inventory model:** 36 slots, 4 armour, offhand, a cursor stack.
  - **Stacking:** max stacks; tools and armour stack 1; equal damage stacks merge.
  - Durability bars.
  - Hotbar selection events; `onChange`; persistence.
- **Must:** the 'inventory' input action (E) is consumed in `ui.frame`: it opens the inventory while playing and closes any open screen.
- **Must:** screens, opened via `game.ui.open`; call `game.screenChanged(true/false)`:
  - **Survival inventory:** armour slots (typed), offhand, 2×2 crafting grid with result via `game.crafting.match`.
  - **Creative inventory:** tabs (Building, Natural, Functional, Tools, Combat, Food and Drinks, Ingredients, Search) listing every item; take infinite stacks; a delete slot; the survival inventory tab.
  - **Crafting table:** 3×3.
  - **Furnace:** input, fuel, output, with flame and arrow progress from the furnace block entity; taking output gives its stored xp via `game.survival.addXp`.
  - **Chest:** 27 slots from the chest block entity (barrels use the same chest entity and screen); a large chest (54) when two chests are side by side.
  - **Advancements:** opened by the 'advancements' action (L) or the pause menu; the screen body comes from `game.advancements.mountScreen`.
  - Offhand slot in the survival inventory (shield, torches); emit `itemCrafted` when a crafting or furnace result is taken.
- **Must:** vanilla slot interactions:
  - left click picks up, places, swaps or merges
  - right click picks up half or places one
  - shift-click quick-moves between sections, respecting armour slot types and furnace fuel/input rules
  - double-click collects matching items
  - left and right drag distribute
  - number keys 1–9 swap with the hotbar while hovering
  - Q drops the hovered stack
  - crafting results consume ingredients and leave remainders; shift-click on a result crafts as many as fit
  - closing returns grid and cursor items to the inventory (or drops them)
- **Must:** tooltips (name, durability, armour points, food); touch support (tap to pick and place, long-press for half); keyboard focusable slots with labels; fits 320×568 up to desktop.
- **Should:** a recipe book panel listing craftable recipes from `game.crafting.recipesFor`.
- **Tests:** model operations and every click semantic; a browser spec covering crafting a table and planks, smelting, a chest round-trip and armour equip.

## crafting — Crafting, smelting and block entities
- **Must:** `items/recipes.ts` with vanilla recipes for every item in `data/items.ts` that is craftable in vanilla 1.20:
  - planks from each log
  - sticks, crafting table, furnace, chest, torches (coal or charcoal), ladder, slabs, stone bricks, bricks, bookshelf, book, paper, sugar
  - bread, cookie, pumpkin pie, mushroom stew, golden apple, golden carrot
  - all tools and armour
  - shears, flint and steel, bucket, bow, arrows, bed, door, shield, compass, clock
  - stairs (6 → 4), lantern, barrel, copper block ↔ 9 copper ingots, cobbled deepslate tools/furnace like cobblestone (stone tool and furnace recipes accept it)
  - wool from string; dyes from flowers and bone meal; dyed wool
  - TNT, glowstone, metal and gem blocks ↔ items, nuggets ↔ ingots, sandstone, snow block, clay block, bone meal, melon
- **Must:**
  - Shaped recipes with horizontal mirroring and shapeless recipes.
  - Ingredient groups (any planks, any log, any wool).
  - Remainders (buckets).
  - `match` for 2×2 and 3×3 grids with any placement offset; `recipesFor`.
- **Must:**
  - **Smelting** with vanilla xp: raw iron/gold/copper → ingots, sand → glass, cobblestone → stone, clay ball → brick, logs → charcoal, all raw meats, potato.
  - **Fuels:** coal and charcoal 80 s, planks and logs 15 s, stick 5 s, coal block 800 s, lava bucket 1000 s (leaves a bucket), wooden tools 10 s, saplings 5 s, wool 5 s, wooden blocks 15 s, slabs 7.5 s.
- **Must:**
  - **Block entities:** chest (27 slots) and furnace ticking at 20 TPS — 10 s per item, consumes fuel only when it can smelt, lit/unlit block swap preserving facing via `game.world.set`.
  - **Lifecycle** from `blockChanged` (see `BlockEntityService`): create on placement, keep across same-family state swaps, drop contents
    (`entities.dropItem`) when the block is replaced or exploded; contents survive chunk unloads. Barrels are chest entities.
  - **Persistence** by position. Only loaded chunks tick.
  - Expose `allRecipes()` / `recipesFor()` as `RecipeView`s (shaped, shapeless, smelting) for the recipe book.
- **Tests:** a recipe for every craftable item, mirroring, groups, the furnace timeline, the fuel rule, persistence.

## interaction — Mining, placing, using and combat
- **Must:** mining:
  - vanilla break time (hardness × 1.5 when harvestable else × 5, ÷ tool speed when the tool type matches; × 5 when not on ground, × 5 under water)
  - crack stages to the renderer; hit sounds every 4 ticks; break particles
  - creative instant break (200 ms repeat)
  - tool durability (−1 per block, −2 per mob hit for non-weapons)
- **Must:** loot tables (`interact/loot.ts`):
  - stone → cobblestone
  - ores → raw iron/gold/copper, coal, diamond, redstone 4–5, lapis 4–9, emerald
  - grass_block → dirt
  - gravel → flint 10%
  - leaves → sapling 5%, apple 0.5% (oak and dark oak), sticks 2%
  - short grass → seeds 12.5%
  - glass → nothing
  - bookshelf → 3 books; glowstone → 2–4 dust; melon → 3–7 slices; clay → 4 clay balls
  - snow → snowball; snow block → 4 snowballs
  - ice → water if above a solid block
  - mature crops → produce plus seeds; younger crops → seeds
  - deepslate → cobbled deepslate; deepslate ores drop like their stone ores
  - doors and beds drop from one half only (see `InteractionService` docs); the other half pops via its support rule
  - block entity contents drop through the block entity service, not here
  - `blockDrops(id, tool)` is the single loot entry point (explosions call it with no tool)
  - xp from ores: coal 0–2, diamond and emerald 3–7, lapis 2–5, redstone 1–5
- **Must:** placement:
  - into replaceable blocks; not inside entities or the player
  - support rules: plants on dirt-like blocks; crops on farmland; sugar cane beside water; cactus not beside blocks; torches on solid faces; ladders on solid walls
  - doors place both halves with facing; beds and slabs
  - furnaces and chests face the player; logs vertical
  - lily pads on water
  - creative keeps stacks
- **Must:** use actions:
  - open the crafting table, furnace and chest screens
  - toggle doors (both halves)
  - beds: sleep at night when no monsters are within 8 blocks → time to morning; set the bed spawn; toasts otherwise
  - TNT plus flint and steel → a `primed_tnt` entity (data `byPlayer: true`); flint and steel on other blocks places `fire` on top
  - eat food: hold for 1.6 s with particles and sound; only when hungry unless `always`
  - drink milk: clears effects
  - buckets: pick up water/lava sources, place sources, return empty buckets
  - hoe: grass or dirt → farmland
  - seeds, carrots and potatoes plant crops
  - bone meal: grows crops 2–5 stages, saplings 45% via `game.terrain.growTree`, grass spawns flowers and grass
  - shears via entity interaction
  - bow: hold to draw for 1 s, release to spawn an `arrow`
  - throw snowballs, eggs and ender pearls (`throw` sound)
  - spawn eggs place their mob (`spawns`) on the clicked face (reason 'egg')
  - shield: hold use to raise it (`using = {item:'shield'}`), slows walking
  - compass and clock: the HUD shows direction to spawn / time of day while held (no interaction needed)
  - place stairs facing the player, lanterns on top of blocks, barrels like chests
- **Must:** combat:
  - entity raycast within 3 blocks; weapon damage
  - modern attack cooldown (charge = time since last attack × attackSpeed; damage × (0.2 + charge² × 0.8))
  - critical hits when falling (+50%, crit particles); sprint knockback
  - `attackCharge` and `using` exposed for the HUD and renderer
- **Must:** creative middle-click pick block into the hotbar.
- **Must:** act on `input.pressed()` edges as well as `down()` so clicks shorter than one frame still register on slow devices.
- **Must:** emit `itemConsumed` after eating/drinking and `blockBroken`/`blockPlaced`; play break/place/hit sounds; selection box from `OUTLINE_BOX`.
- **Tests:** break times, loot tables, placement rules, every use action, cooldown math.

## ticks — World simulation
- **Must:** random ticks (about 3 per 16×16×16 section per tick in loaded chunks within 8 chunks):
  - crops grow at light ≥ 9 (faster on wet farmland)
  - saplings → `game.terrain.growTree` at light ≥ 9
  - grass spreads to dirt (light ≥ 9 above, not covered); grass dies under opaque blocks; mycelium spreads
  - farmland hydrates within 4 of water, else dries and reverts when empty
  - sugar cane and cactus grow to 3
  - ice and snow layers melt at block light ≥ 12
  - leaves decay when no log is within `LEAF_DECAY_DISTANCE` (6) taxicab steps through leaves; persistent leaves never decay
  - copper oxidises one stage (copper_block → exposed → weathered → oxidized) with a small chance per random tick
  - fire burns out, spreads to flammable blocks nearby (destroying them), is put out by rain; lava ignites flammable blocks nearby
- **Must:** scheduled ticks:
  - **Fluids:** vanilla-like water (spreads every 5 ticks to level 7, flows toward the nearest drop within 4, infinite source from 2 adjacent sources) and lava (every 30 ticks, level step 2).
  - **Lava–water reactions:** obsidian, cobblestone and stone.
  - Removing a source drains the flow.
  - **Falling blocks** (sand, gravel) as `falling_block` entities that land as blocks or drop as items.
  - **Support checks:** `canSurvive` from `engine/support.ts`; unsupported blocks pop off with `interaction.blockDrops(id, null)` items.
  - React to `blockChanged` events by scheduling neighbour updates.
- **Must:** `explode`:
  - vanilla-style 16×16×16 ray algorithm with resistance
  - drop a fraction of blocks as items
  - entity and player damage with exposure and knockback
  - particles and sound
  - chain-prime nearby TNT
- **Must:** a `primed_tnt` entity kind (render 'block', flashing white via the model appearance flash, 80-tick fuse) and `falling_block`
  (render 'block'), both with physics; `explode(..., byPlayer)` attributes kills.
- **Must:**
  - Budget ≤ 1 ms per tick on average; cap fluid updates per tick.
  - Updates are deterministic given `game.random`.
  - Pending scheduled ticks persist.
- **Tests:** crop growth, grass spread, fluid spread, drain and reactions, falling blocks, support pop-off, explosion craters and damage, budget.

## sound — Audio
- **Must:**
  - Procedural Web Audio only; no audio files.
  - One AudioContext created on the first user gesture.
  - Master gain follows `game.context.settings.sound` live (default off).
  - Suspend while the engine is paused, lost or disposed.
  - At most 16 voices; reuse noise buffers.
- **Must:** `play` only (no other API); master volume from `settings.volume` and the shell toggle; every `SoundName` in the contract,
  synthesised to evoke vanilla sound families (callers listed in the `SoundName` docs):
  - block break/place/step/hit per material: stone, wood, gravel, grass, sand, cloth, glass, snow, metal, liquid, plant
  - hurt, death, eat, burp, drink, pop, levelup (arpeggio), orb (random-pitch ding), click
  - door and chest open/close, explode, fuse, splash, swim, fizz, bow, arrow_hit, tool_break, equip
  - craft, ignite, lava, fire crackle, throw, thunder, rain loop, attack weak/strong, crit, sweep, toast, bucket fill/empty, shear, milk, teleport, furnace
  - mob voices for every kind in `MOB_KINDS` (ambient, hurt, death, step)
- **Must:**
  - Positional attenuation (linear to 16 blocks) and stereo pan from player yaw.
  - Footsteps are played by the player and entity services (`step:<kind>`); audio only synthesises them.
  - Occasional cave ambience in darkness underground; rain ambience follows `weather.intensity` (weather calls `play('rain')`).
- **Should:** sparse generative music (calm pads every few minutes) at low volume when sound is on.
- **Tests:** name → synth mapping, voice cap, attenuation math (mock AudioContext).

## hud — HUD and menus
- **Must:** HUD layout:
  - **Hearts:** full, half and empty; flash on damage; shake at ≤ 4 health unless reduced motion; absorption hearts.
  - **Hunger shanks:** shake when saturation is 0.
  - **Armour points** above the hearts; **air bubbles** under water.
  - **XP bar** with the level number.
  - **Hotbar:** icons, counts, durability bars, selected frame; the offhand slot beside it.
  - **Compass/clock readouts** while held: arrow toward spawn, sun/moon dial.
  - **Held item name** fades after selection.
  - **Crosshair** with an attack-charge indicator.
  - **Effects:** damage red flash, low-health vignette.
  - All icons are original procedural pixel art; colour-blind setting respected (shape cues).
- **Must:** menus (`showMenu`):
  - **Start/pause:** Play/Resume; World options through `game.updateSettings` (game mode, difficulty, view distance, FOV, mouse
    sensitivity, volume, keep inventory, daylight cycle, weather cycle, mob spawning); Advancements; a Controls help panel from `input.bindings()`.
  - **Death screen:** "You died!", death message, score, Respawn (`game.respawn()`).
  - **Lost-context screen.**
  - Overlay copy differs for touch.
- **Must:** F3 debug overlay:
  - fps and resolution scale, draw calls and triangles
  - xyz, facing, biome, light at the feet (sky/block)
  - day time and day, weather
  - chunk, entity and mob counts
- **Must:** F1 hides the HUD (`ROOT_FLAGS.hudHidden`); action-bar toast styling; layer z-indexes and reserved zones from the `Game` docs;
  fits 320×568 to desktop; no overlap with the arcade toolbar (top 56 px reserved, bottom-right 150 px reserved for shell buttons).
- **Tests:** heart and hunger rendering from state, menu option effects (spec), layout at 390×844 and 1366×768.

## advancements — Advancements and statistics
- **Must:** a modern-style advancement tree unlocked from game events, each shown as a toast (icon, title, description):
  - Minecraft (get a crafting table), Stone Age, Getting an Upgrade (stone pickaxe), Acquire Hardware (iron ingot)
  - Suit Up (any armour), Hot Stuff (lava bucket), Isn't It Iron Pick, Diamonds!, Cover Me with Diamonds
  - Monster Hunter, Sweet Dreams (sleep), The Parrots and the Bats (breed two animals), A Seedy Place (plant seeds)
  - Bake Bread, Hot Topic (furnace), Getting Wood (log), Benchmarking (craft with planks), Time to Mine!, Time to Strike! (sword)
  - Best Friends Forever (tame a wolf), The End? (pick up an ender pearl), Sticky Situation (slime ball), Oh Shiny (copper),
    Into the Deep (mine deepslate), A Balanced Diet (eat 10 different foods, with progress), Monsters Hunted (kill one of each hostile, with progress)
- **Must:**
  - `mountScreen`: the Advancements screen body (tree with parents, locked/unlocked, progress, plus statistics) opened by L or the pause menu.
  - Toasts in the top-right zone ("Advancement Made!", icon, title) with the `toast` sound; they never cover the shell toolbar.
  - Statistics: blocks mined/placed, mobs killed, deaths, distance walked, days survived, items crafted.
  - Persistence via `serialize`/`restore`.
  - Hook only via `game.events` (blockBroken, blockPlaced, itemPickedUp, itemCrafted, itemConsumed, entityDied, animalBred, entityTamed,
    playerSlept, playerDied...) and polling services (inventory armour).
  - Respect reduced motion for toast animation.
- **Tests:** unlock conditions from simulated events; persistence.

## weather — Weather
- **Must:**
  - Vanilla-like cycles: clear 0.5–7.5 days, rain 0.5–1 day, thunder chance.
  - `intensity` eases in and out.
  - Rain or snow particles around the camera by biome `precipitationAt` (snow in cold biomes, none in deserts, savannas and badlands), drawn in ≤ 2 draw calls with a cap of about 1 500 drops; never inside covered spaces (use `world.topY`).
  - Splashes on ground; darker sky and light: the engine computes `time.skyDarkening` from `intensity` and `thunder`.
  - Thunder: `flash` (brief sky light boost read by the renderer), a bolt mesh, `thunder` sound delayed by distance, strikes near the player:
    5 'lightning' damage around the strike, `fire` on flammable ground, creepers become charged (`data.charged`), pigs are unaffected.
  - Cold biomes: while it snows, `snow` layers accumulate on exposed tops and sea-level water freezes to `ice` (a few random columns per tick).
  - Rain ambience loop via `sounds.play('rain')` at intervals, quieter when covered.
  - `settings.weatherCycle` false freezes the current weather. Persistence.
- **Must:** `isRainingOn` checks sky exposure; the engine's `skipTime` (sleeping) calls `set('clear')`.
- **Tests:** cycle timing, precipitation by biome, exposure.

## blockart — Block art
- **Must:** paint every tile in `TILE_NAMES` (`data/blocks.ts`) as original 16×16 pixel art. The style is readable, vanilla-like shading but not a copy.
- **Grey tiles:** grass top, `grass_block_side_overlay`, short grass, fern, sugar cane, lily pad and the leaves of oak, jungle, acacia and dark oak are painted grey for biome tinting.
- **Pre-coloured tiles:** birch and spruce leaves; the grass block side (dirt with a painted green band).
- **Required tile groups:**
  - all six wood types (bark, rings, planks, saplings)
  - ores with distinct colours
  - wool in 16 colours
  - glass with a frame (transparent centre)
  - water greyscale, semi-transparent; lava bright orange with darker veins
  - crafting table, furnace (off and on), chest, TNT
  - ladder, door top and bottom (with windows), bed, torch
  - crops in every stage, flowers, mushrooms, cactus, pumpkin, melon, sandstone variants, farmland (dry and moist), snow, ice
  - `destroy_stage_0..9` crack overlays (transparent, progressively more cracks)
  - modern blocks: cherry wood (pink leaves pre-coloured), deepslate (dark grey, vertical grain; distinct top) and its ores, tuff, moss, the four
    copper oxidation stages (orange → teal), lantern (cutout), fire (cutout flames), barrel (top, bottom, side)
- **Transparency:** cutout tiles use alpha 0 outside the shape.
- **Also update** the cover `public/game-art/blockcraft/cover.svg` via `scripts/generate-blockcraft-cover.py`: add a cow, a sheep and a creeper, and two biomes (snowy and desert edge). Keep the 320×410 frame and the clear top 95 px.
- **Tests:** every tile is painted (no placeholder); cutout tiles have transparency; tinted tiles are low-saturation.

## itemart — Item art and icons
- **Must:** paint every name in `ITEM_SPRITES` as original 16×16 pixel art with transparent backgrounds and a vanilla-like dark outline:
  - tools by tier palette, swords, armour by material
  - food, materials, dyes in 16 colours
  - buckets (empty, water, lava, milk)
  - bow, arrow, shears, flint and steel
  - seeds, wheat, sugar, paper, book, bowl, stew, egg, snowball, bone, bone meal, string, feather, leather, gunpowder, clay ball, brick, red bed, oak door, ink sac, nuggets, dusts, raw ores
  - shield, compass, clock, cocoa beans, rabbit hide and foot, slime ball, ender pearl, rabbit (raw, cooked), spider eye
  - spawn eggs for every kind in `MOB_KINDS` (two-tone speckled eggs in each mob's colours)
- **Must:**
  - Fix and polish `iconUrl` isometric block icons: top, left and right faces, shaded, with the plains tint applied to tinted faces, and cutout tiles respected.
  - Export `spritePixels` for held and dropped item rendering; cache data URLs.
- **Tests:** every sprite painted with transparency and no placeholders; icon generation produces distinct images.
