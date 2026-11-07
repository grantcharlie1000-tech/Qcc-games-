# Femboy Frosthop — Christmas Obby

An original third-person 3D obstacle course ("obby") for the QCC arcade. Slug `femboy-obby`, ranked course id `frosthop-v1`. Built from Charlie's reference pack (7 November 2026): research notes, stage plan, technical spec, acceptance checklist, palette and two original concept images. Roblox images in that pack were used only as genre reference; nothing from them ships.

## Player-facing rules

- Move with W A S D or the arrow keys (camera-relative), jump with Space, look by dragging, turn the camera with Q/E, recentre with C or the round camera button. Touch: left side is a movement stick, the right side looks around, and a large Jump button sits bottom right. Move, look and jump are separate pointers and work together.
- 30 stages in six zones: Giftwrap Gardens, Candy Cane Catwalk, Cozy Knit Workshop, Peppermint Ice Rink, Ornament Skyway and North Pole Runway. Each stage ends on a broad checkpoint pad (mint emblem: star outline before, tick after). Checkpoints activate only in course order.
- Falling below the course or touching a hazard returns you to the last checkpoint after 0.35 s, with velocity cleared and the camera reset.
- Every stage has one optional gold star (`frosthop-v1:stage-NN:star`). Stars are saved the moment you touch them, never duplicate and never block progress.
- Rewards: the first checkpoint gives the ribbon bow; clearing each zone unlocks an outfit (Peppermint Swirl, Mint Hoodie, Lilac Yarn, Rink Frost, Bauble Gold, Cocoa Cable); all 30 stars unlock Starlight. Outfits are cosmetic and share the same collider.
- Gentle help (wardrobe panel) slows every hazard and moving platform to 65 % and lengthens crumble warnings. After three falls on one stage the game suggests it once. Reduced motion only changes presentation.
- Campaign: saves the furthest checkpoint and lets you revisit any reached stage. Finishing stage 30 opens the Time Trial.
- Time Trial: a fresh run from the start plaza. The clock starts when you cross the start line, keeps running through falls, and stops at the final checkpoint once all checkpoints have been reached in order. The dock shows the time beside its status: **Ranked** or **Casual**. Pausing (shell menu, Study Mode), hiding the tab, restoring a saved trial or turning on gentle help makes the attempt casual for good. Casual times are shown but never submitted.

## Ranking encoding

The shared leaderboard keeps each player's maximum integer score and sorts descending. A finished, eligible trial of `ms` milliseconds (1 ≤ ms ≤ 7 200 000) is submitted with `context.setScore(2147483647 − ms)`, so faster is higher. `formatScore('femboy-obby', score)` decodes it to `m:ss.cc`. Raw milliseconds, partial runs and casual runs are never submitted. The game id is registered in `SCORED_GAMES`; the database constraint change is `netlify/database/migrations/20261107090000_femboy_obby_score.sql` and needs owner approval to apply. Until then the server answers 409 `leaderboard-not-open` and the existing client keeps the score queued. The board is bound to the fixed `frosthop-v1` course and physics: an incompatible change must reset or separate the board first.

## Design decisions (my calls where the pack left room)

- **Physics:** fixed 60 Hz kinematic box controller (0.64 × 1.8 × 0.64), speed 6, jump 9, gravity 24, coyote 100 ms, jump buffer 120 ms, releasing jump early trims the arc. Bounded catch-up (0.25 s per frame), swept substeps of at most 0.15 units per axis, 0.35-unit step-up. Platform carry is the platform's own displacement; take-off inherits the platform's horizontal velocity once, cleared on landing. Springs fire once per fresh contact.
- **Measured envelope:** standing apex 1.6–1.75 units; airtime about 0.75 s; a running jump clears a 4-unit edge-to-edge gap and fails at 5.4. Early gaps are 1.6–2.2, later ones 2.2–3.0 (40–70 % of reach). Star ledges use up to 2.6.
- **Teaching order** (tested): sweeper first at stage 8, moving platforms 11, conveyor 13, ice 16, snowball 18, crumble 19, spring 22, each alone before any combination.
- **Course data:** every surface is an axis-aligned box whose visible top is its collider. Decorations (bows on gift fronts, baubles under ornament caps, cliffs) never collide, and nothing decorative hangs into a path the player uses. Checkpoint lamp posts are real colliders drawn at their collider size.
- **Rendering:** static course merged into one mesh per zone; props instanced per zone; zones and moving parts outside the nearby stages are hidden. Lambert materials with vertex colours, hemisphere plus one directional light, fog, a blob shadow and a landing ring, no shadow maps. Pixel ratio capped at 1.5 (1 in Low graphics, which also renders at 30 fps; simulation stays at 60 Hz).
- **Avatar:** original geometry merged into five meshes (body, two arms, two legs) so any outfit costs five draw calls.
- **Assets:** six Kenney Holiday Kit models (CC0, licence kept beside them) for trees, canes, gifts, a sled and a snowman, loaded lazily with procedural fallbacks. The library poster comes from `scripts/generate-posters.mjs` like every other poster.
- **Panel instead of a shop:** a small wardrobe & help panel opened from a round button. It does not pause the run, so cosmetics never affect Time Trial eligibility.

## Files

`config.ts` constants · `types.ts` data model · `course.ts` assembly · `stages.ts` the 30 stages · `sim.ts` controller and rules · `trial.ts` Time Trial and encoding · `progress.ts` saves, outfits, unlocks · `input.ts` keyboard/mouse/touch · `avatar.ts` character · `scene.ts` renderer · `index.ts` GameModule glue · `style.css`.
