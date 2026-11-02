/**
 * Every gameplay tunable for the Slither.io arena (`neon-coil`) lives here.
 * Distances are world pixels unless marked CSS px; times are seconds unless
 * marked ticks. The simulation, renderer, input and tests all read these, so
 * changing one value changes behaviour and visuals together.
 */

// ── Simulation clock ────────────────────────────────────────────────────────
/** Fixed simulation step (60 Hz). Rendering interpolates between steps. */
export const STEP = 1 / 60;

// ── Arena size (+20% playable area) ─────────────────────────────────────────
/** Arena radius before the +20% area change; kept to document the scaling. */
export const LEGACY_ARENA_RADIUS = 1500;
/** Playable world area multiplier relative to the legacy arena. */
export const ARENA_AREA_SCALE = 1.2;
/** Linear scale that yields the area change while keeping proportions (√1.2 ≈ 1.0954). */
export const ARENA_LINEAR_SCALE = Math.sqrt(ARENA_AREA_SCALE);
/** Circular arena radius, ≈ 1,643 world px. */
export const ARENA_RADIUS = LEGACY_ARENA_RADIUS * ARENA_LINEAR_SCALE;
/** Ordinary food population, scaled with area so density matches the legacy 1,500. */
export const FOOD_TARGET = Math.round(1500 * ARENA_AREA_SCALE);
/** Hard pellet cap (ordinary + trails), scaled with area from the legacy 2,600. */
export const MAX_FOOD = Math.round(2600 * ARENA_AREA_SCALE);
/** Named local bots. Fixed: saves validate exactly BOT_COUNT + 1 snakes. */
export const BOT_COUNT = 18;
/** Opening bot rings (legacy 720 / 935 / 1,150 px), scaled linearly so spacing keeps its proportions. */
export const BOT_RING_RADII = [720, 935, 1150].map(r => r * ARENA_LINEAR_SCALE);
/** Respawned bots keep at least this distance from the rim (legacy 450 px, scaled). */
export const RESPAWN_RIM_MARGIN = 450 * ARENA_LINEAR_SCALE;
/** Respawned bots appear at least this far from the player's head. Camera-relative, so not scaled. */
export const RESPAWN_PLAYER_CLEARANCE = 600;

// ── Motion and steering ─────────────────────────────────────────────────────
/** Forward speed, world px / second. */
export const SPEED = 165;
/** Boost speed multiplier and its mass cost per second. */
export const BOOST_MULTIPLIER = 1.7;
export const BOOST_COST_PER_SECOND = 6;
/**
 * Steering is one shared model for every input and for bots: the head turns
 * toward a target angle at `min(MAX_TURN_RATE, |error| × TURN_RESPONSE)`.
 * Big turns run at the capped rate (a U-turn takes ≈ 0.8 s); errors below
 * MAX_TURN_RATE / TURN_RESPONSE (≈ 21°) ease in proportionally, so small
 * corrections land precisely without overshoot or finger-tremor wobble.
 */
export const MAX_TURN_RATE = 4.4; // radians / second (legacy fixed rate: 3.2)
export const TURN_RESPONSE = 12; // 1 / second; error halves every ≈ 58 ms

// ── Bodies and hitboxes (render radius ≡ collision radius) ──────────────────
/** Body radius at START_MASS, growth per mass point above it, and the cap on that growth. */
export const BODY_RADIUS = 8;
export const BODY_RADIUS_PER_MASS = 0.014;
export const BODY_RADIUS_MAX_GROWTH = 4;
/** The head disc is this much wider than the body; drawn and collided at the same size. */
export const HEAD_RADIUS_SCALE = 1.1;
/** The tail tapers to this fraction of the body radius… */
export const TAIL_TAPER_MIN = 0.45;
/** …over this many body diameters from the tail tip. */
export const TAIL_TAPER_DIAMETERS = 3;

// ── Spawn immunity ──────────────────────────────────────────────────────────
/** Collision immunity granted at every spawn: player start/restart and every bot spawn. */
export const SPAWN_IMMUNITY_SECONDS = 3;
export const SPAWN_IMMUNITY_TICKS = Math.round(SPAWN_IMMUNITY_SECONDS / STEP);
/** The pale look holds until this much protection remains, then eases back to full colour. */
export const IMMUNITY_FADE_SECONDS = 0.75;
/** Strength of the pale overlay (0–1) and how much opacity a fully pale snake loses. */
export const IMMUNE_PALE_STRENGTH = 0.68;
export const IMMUNE_OPACITY_DROP = 0.35;

// ── Dot hoover ──────────────────────────────────────────────────────────────
/** Pellets whose centre is within this distance of a head start flowing toward it. */
export const HOOVER_RADIUS = 44;
/** Extra hoover reach per world px of body-radius growth (max +16 px at full width). */
export const HOOVER_RADIUS_PER_BODY_PX = 4;
/** A captured pellet starts at this speed and accelerates, up to a cap, in world px / s (/ s²). */
export const HOOVER_START_SPEED = 90;
export const HOOVER_ACCELERATION = 1500;
export const HOOVER_MAX_SPEED = 900;
/** A pellet counts as collected (mass awarded) once it is this close to the head centre. */
export const HOOVER_ARRIVAL_DISTANCE = 6;

// ── Input ───────────────────────────────────────────────────────────────────
/** Mouse / trackpad aim ignores the pointer within this many CSS px of the head. */
export const POINTER_DEAD_ZONE = 20;
/** Thumb joystick ring radius (CSS px; base diameter 132) and knob radius. */
export const JOYSTICK_RADIUS = 66;
export const JOYSTICK_KNOB_RADIUS = 26;
/** How far the knob centre may travel from the ring centre (CSS px). */
export const JOYSTICK_TRAVEL = 50;
/** Knob deflection below this fraction of travel keeps the current target. */
export const JOYSTICK_DEAD_ZONE = 0.14;
/** A touch starts the joystick if it lands left of this fraction of the width… */
export const JOYSTICK_ZONE_WIDTH = 0.6;
/** …and below this fraction of the height. */
export const JOYSTICK_ZONE_TOP = 0.4;
