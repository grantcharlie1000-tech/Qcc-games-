# Neon Coil

An original continuous arena game against **18 named local bots**. It is a separate `neon-coil` registry item; `src/games/snake/` and its grid rules are unchanged. The route is `#/game/neon-coil`.

## Reference and original work

The parent thread safely inspected `Snakes_Desktop_Reference_Pack.zip` (SHA256 `6ad74fdf556dac9d9c01a0ffb6b413bea7d148a118a17a592d9955bb05490b68`) and supplied its textual requirements and manifest. This execution environment could read the Library skill but its required hosted transfer helper subsequently returned `skill package is not available`. The pack was not downloaded or executed here; no video/PDF inspection is claimed by this implementation. The parent's inspected brief is the reference for continuous movement, pointer steering, bodies, pellets, local bots and desktop composition. Tuning below is an implementation choice, not a claim about the footage.

All canvas snakes, eyes, woven background, pellet glow sprites, cover SVG, game name and interface are authored for this game. No screenshots, prerecorded gameplay, source assets, copied logos or system chrome ship with it. There is no networking, multiplayer claim, advertising, paid service or new dependency.

## Visual refresh (reference pack)

The QCC Snake - Gameplay Reference Pack page renders h-03–h-07 and h-10–h-12 were inspected for this refresh, using F04 as the primary normal-play target. The renderer now uses a seamless, world-anchored dark doodle floor, a striped red region outside the existing circular boundary, and cached shaded discs stamped tail-to-head at 0.25 body diameters. Bands follow arc distance behind the interpolated head, with a tapered tail, a dark blue/cyan player skin, colour-family bot skins, round heads, forward-facing eyes and upright labels with a 12px screen font floor. Saturated food has compact cached halos and bright cores; remains/boost pellets receive deterministic multicolour display colours from their IDs.

Boost adds static cyan/white body bands with a render-only 100ms activation / 150ms release envelope; reduced motion snaps the intensity. The live HUD has a compact CLASSIC score, transparent skin-coloured rankings and a square chevron boost control with a local purple active aura. The minimap is smaller and clears the boost control. Patterns and sprites are cached once per renderer, offscreen content is culled, stamp buffers are reused, and DPR remains capped at 2.

This is render/HUD only: simulation, model colours, saves/best scores, camera/zoom, input, host toolbar and start/death/continue cards retain their existing contracts. Crowns, direction markers, pickup fade and new menus were intentionally skipped; there is no networking or added dependency.

## Rules and tuning

- Circular arena radius: 1,500 world pixels. Crossing the visibly outlined rim defeats the head. The camera follows the player; viewport shape reveals more or less world without stretching it. Growth subtly zooms out, with no shake or decorative pulsing.
- Fixed 60 Hz physics; normal speed 165 world pixels/second; maximum turn rate 3.2 radians/second. Every head position contributes to the body's arc-length history. Above 2,048 points, older history is resampled at uniform arc-length intervals while the most recent 64 points stay exact; its actual polyline length is recalculated, and rendering, collision and saves share that geometry. A long frame catches up at most 250 ms (15 ticks); excess suspended time is discarded. Pause preserves the exact world and fractional step.
- Player begins at 30 mass. Body target length is `130 + 3 × mass` through 600 mass, then `1930 + 1800 × log1p((mass − 600) / 600)` world pixels. Food awards its stored mass once, then disappears. Tail growth appears through subsequent forward movement, rather than inventing a new body elsewhere. Mass continues beyond 600, bounded only by JavaScript safe-integer precision; geometry has its own fixed point budget.
- Hold boost for 1.7× normal speed. It spends 6 mass/second, never below 20, and emits one-mass pellets along the tail. Releasing, canceling touch, losing focus, pausing, restarting or leaving clears boost input.
- A head touching another snake's body is defeated. Simultaneous head-on contact defeats both, regardless of size. Self-crossing is safe. These rules apply to bots and the player; larger snakes have no collision immunity.
- A defeat redistributes the snake's current mass along its actual body at roughly 17-pixel intervals. Other living snakes can collect these pellets. The final player death freezes the arena and shows its reason, mass, time, best and outmaneuver count. Restart creates a fresh seeded world.
- Normal food population is replenished toward 1,500. The arena holds at most 2,600 pellets; new trails can displace the oldest ordinary food or, if necessary, oldest trails. This bounds long-session memory while preserving the latest defeat chain.
- Bots use the same motion, growth and collision model. Every 12 ticks they choose a reachable curved trajectory using nearby food value, other bodies and the arena boundary. They travel at normal speed. Defeated bots wait 3 simulated seconds, then try to respawn away from the player and occupied paths. They have fixed local names and no network identities.
- Difficulty is a fixed **Classic** mode, not a simulated matchmaking tier. Ranking sorts actual current mass and includes YOU separately outside the displayed top 10 (top 5 on narrow or short screens). Equal mass uses stable ID order. A small map shows actual live positions on larger viewports.

## Input and lifecycle

Desktop mouse/trackpad pointer movement steers immediately without a click or drag. Pointer aim has a 20-CSS-pixel center dead zone. Touchscreens use separately owned captured pointers for steering and Boost: either finger may start first, and steering may be reacquired while Boost stays held. Arrows and WASD choose absolute direction, including diagonals. Holding Space boosts when gameplay has keyboard focus; the real Boost button also accepts held Enter/Space. P delegates pause/resume to the host toolbar. Escape is owned by the host and opens Study Mode.

All toolbar, start, replay and boost controls are real focusable elements. Controls prevent gameplay scrolling; editable controls and open dialogs retain normal keyboard behavior. Hidden tabs pause through the host. Pausing clears held inputs; resuming retains the head's last heading. One requestAnimationFrame chain and one ResizeObserver are disposed on exit. Ready and paused worlds are drawn only on change/resize. Canvas dimensions and the viewport-dependent ranking refresh together on resize without advancing the world or repeating phase announcements.

Full world snapshots (food, bot histories, RNG, ticks and mass) are persisted through the existing host storage contract. Valid saved running arenas wait behind **Continue arena**. Corrupt or incompatible snapshots are rejected. Best mass stays in the existing per-game high-score store. Storage failure inherits the host's in-memory fallback.

## Performance and verification boundaries

Canvas 2D and a spatial hash handle bodies. Rendering culls offscreen food and snakes; glow sprites and the original background tile are created once. Pixel density caps at 2×. Game code and styles load lazily; the existing offline manifest automatically includes the new chunk and cover.

See `TEST_RESULTS.md` and `docs/evidence/neon-coil/` for actual measurements. Synthetic mouse events cover the desktop pointer path; no physical trackpad testing is claimed. Chromium CDP covers native multi-touch events. Browser/encoder download failures and the pending independent review are recorded explicitly.
