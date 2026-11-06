# Ball Run — Christmas skin

## Revision: original scene, snow-capped obstacles and Santa's sleigh

This revision replaces the whole skin described further down. The festive palette, frosted tower texture,
bauble ball, star layer and `christmas.css` are gone: with the theme on or off, Ball Run draws its original
neon corridor. Under the Christmas theme it adds just two things:

- **Snow on the obstacles** (`src/games/ball-run/snow.ts`): a light covering, 7.5 cm at the crest, on top of every
  obstacle (static blocks and sliders, not gate walls). One instanced pool draws all the caps, so the theme adds
  one draw call. Each cap is a soft, slightly lumpy mound that overhangs the block by 3 cm, with a rounded lip
  that hangs over the edge. Like the blocks, it is unlit: white-to-lavender shading is baked into vertex colours.
  Caps follow banked blocks and moving sliders, and they share the block cache's begin, end and reset path.
  Collision is unchanged.
- **Santa's sleigh in place of the ball** (`src/games/ball-run/sleigh.ts`): a red sleigh with a scrolled bow,
  gold trim and scrollwork, curled gold runners on struts, green velvet cushions and Santa's hat (fur brim,
  drooping cone, pompom) on the seat. Santa is not in it. Its measured vertices are normalised so the sleigh is
  exactly `2 × RADIUS` (0.76 m, the ball's diameter) wide, centred on the ball, with the runners exactly on the
  ball's ground contact. Nothing reaches further forward than the ball's front, so a crash never shows it
  inside a block. Collision still uses the ball's sphere. It is six merged meshes (one per material).
  - It does not roll. On the road it sits on the slope and bank (the same angles as the road tiles). In the air
    or off the road's edge it holds its attitude. It never turns about y, like the blocks, so a dodge never
    swings its corners wider or further forward than the ball. Changes ease in over about a metre of travel;
    a new run, restore or teleport snaps straight to the road. About 15,000 triangles in six draw calls.
  - The back panel stops just above the seat, so the chase camera (behind and only a little above) sees the hat.
  - The block crash bursts into the sleigh's red, gold and white instead of magenta and cyan.
  - Only the sleigh is lit in this scene, so under the theme the pink hemisphere light becomes neutral and a soft
    fill from behind lights the sleigh's back. Nothing else changes.

Evidence: `sleigh-chase.png` (mobile chase view), `sleigh-width-top.png` (straight down, with the ball's
outline in cyan: the sleigh's sides land exactly on it), `sleigh-three-quarter.png`, `sleigh-side.png`,
`snow-closeup.png`, `crash-burst.png`. `after-mobile.png` and `after-desktop.png` now show this revision.
The `detail-*` images belong to the earlier skin.

Tests: `tests/games/ball-run/christmas.test.ts` checks the sleigh's exact width, centring, ground contact, forward
reach and hat placement, and its disposal; that it never yaws while dodging and holds its attitude in the air and off the edge. It checks every snow cap in the festive scene against the collision pose: count
equal to the obstacles, on the top face, along the block's banked up axis, overhang and depth, sliders included.
With the theme off it checks the original ball, no snow and no sleigh. `play.spec.ts` is back to its original
contrast check, because the bars are lavender again.

## Earlier skin (superseded)

## Skills invoked
- `using-superpowers`: session workflow.
- `game-development` (Skill tool). I read its nested guides `.agents/skills/game-development/3d-games/SKILL.md` and `game-art/SKILL.md` in full.
  - 3d-games principle followed: simple colliders and complex visuals, with batching kept.
  - The change is colour and light values only. No mesh, pool, instance count, light count or texture size changed, so draw calls and WebGL cost stay flat.
- `requesting-code-review`: invoked, but this agent has no subagent tool, so no independent review was dispatched. The lead should run one.
- `verification-before-completion`: invoked before reporting, and every result below is from a fresh run.
- `systematic-debugging`: invoked for the browser failures (see Tests).
- `animate` was not used because no motion was added.

## What changed
`src/games/ball-run/scene.ts`: `createScene` reads `christmas()` once at mount and picks between `ORIGINAL_PALETTE` / `FESTIVE_PALETTE` (the original values are unchanged, only renamed).
- **Scene**
  - Snowy night: a deep winter-blue clear colour and fog (`0x13284f`).
  - Frosted buildings (second pass, after lead review): the existing tower material gets one 64x256 canvas texture, `frostedTowerTexture()`. It provides:
    - a snow cap on the roof edge;
    - winter-blue walls with sparse warm lit windows (6x3 texels, nearest magnification so they stay crisp up close);
    - frost and snow fading up the lower walls to road level (tower bases sit 14 m below the road, so the fade starts high), with a drift crest at the base.
    - Material colour is white so the texture shows true. The grid lines are a softer frost blue (`0xaec6e0`) and read as snowy ledges.
    - Disposed with the scene.
  - Starry sky: a static CSS `::after` star layer (`--xmas-stars`) on `.br-viewport`, under the HUD, `pointer-events:none`, masked to the upper middle where the sky slot shows.
    - It is CSS rather than WebGL: a `scene.background` texture would add a draw call, and a transparent canvas would break the dock glass, which refracts the WebGL buffer.
  - An icy-blue road with snow-white lane and cross lines.
- **Obstacles**
  - Static blocks cycle red, green, gold and deep red, keyed by `o.id` as before.
  - Sliders are snow white, so they stay distinct from static blocks.
  - Per-face vertex light is neutral (`FESTIVE_FACE_LIGHT`) for Christmas, so the red, green and gold keep their hue. The original used green-heavy multipliers to turn purple into pink.
  - The vertex-colour attribute is the same size, with only different values.
- **Boost gates and effects**
  - Boost gates: evergreen walls with gold rails and posts.
  - The boost colour (entrance ring, chevrons, trail) is gold `0xf4c430`.
  - The burst uses red, gold and white.
- **Ball and lights**
  - The ball is a red glass bauble. Its 128x64 canvas texture is red with a gold equator band and darker trim, plus thin gold meridians so the roll stays visible.
  - The ball material is glossier Phong (shininess 90, warm specular).
  - Lights: cool hemisphere light (`0xd6e8ff`), key at 1.6, and an icy rim light. The light count is unchanged.

Other files:
- `src/games/ball-run/christmas.css` (new): a midnight background behind the canvas, a navy dimmer layer, a red heading with snowflakes on the setup panel, navy panel bodies, and a frost focus outline. Every selector is scoped under `:root[data-festive="christmas"]`.
- `src/games/ball-run/index.ts`: imports `christmas.css`.

## Guaranteed unchanged
- Course geometry and collision: `course.ts`, `config.ts` and `model.ts` are untouched. Obstacle transforms (`setObstacleTransform`), road tiles, gates and city layout use identical code.
- The ball mesh radius (`SphereGeometry(RADIUS, 32, 20)`) is unchanged.
- Performance tiers: `resolution.ts` and `setResolutionCap` are untouched. Draw calls, pools, `TILES`/`LINES`/`BLOCKS` counts, instancing and the ball texture size are identical. Nothing is drawn per obstacle beyond the existing instanced block mesh.
- The only added GPU resource is the 64x256 tower texture (about 64 KB, mipmapped) on the existing tower material. No new geometry, mesh or draw call.
- HUD colours tested by specs (difficulty buttons, the cyan boost speed text) are unchanged.

## Tests
- `npx tsc --noEmit`: no errors in ball-run, pool or block-fill. The only error is in another agent's file, `tests/games/animal-stack/tall-framing-festive.spec.ts` (missing module `christmas-art.ts`).
- `npx vitest run tests/games/ball-run tests/games/pool tests/games/block-fill tests/core/festive.test.ts`: 17 files, 155 of 155 tests passed (final run).
- Environment note: the live dev server (4600) full-reloads the page every 25–40 s because other agents are editing concurrently. A watcher page saw 8 reloads in 4 minutes. The pristine 4601 server does not reload. The load average was 12–22 throughout.
- Ball Run unit tests alone: 10 files, 107 of 107 passed. That includes `performance.test.ts`, `scene-cache.test.ts` and `hitboxes.test.ts`.
- Browser, full run on 4600 (`--output=/tmp/claude-0/pw-ball-run`): 31 passed, 8 failed.
- Rerunning the 8 failures on 4600: 3 passed; `layout:4`, `play:339` and `play:462` (gate boost) passed on rerun.
- Same four tests on the ORIGINAL code (4601), same load: `play:265` (touch drag, steering amount), `play:572` (restarts, timeout) and `regressions:78` ×2 (boost readout, timeout) also FAIL there. They are load-related timing failures, not caused by the skin.
- `regressions:39` (real steering reversal, medium) failed 2 of 3 times on 4600 with `phase ready` or `distance 0`, and passed 2 of 2 on 4601.
  - Root cause (systematic-debugging): the 4600 dev server's periodic full reloads. The init script re-seeds a fresh `ready` run after a reload, and the run also showed "Execution context was destroyed … navigation".
  - The skin changes only colour values, so no gameplay path is affected.

- Second pass (frosted towers and starry sky), fresh runs:
  - `npx tsc --noEmit`: no errors in ball-run files.
  - `npx vitest run tests/games/ball-run tests/core/festive.test.ts`: 11 files, 113 of 113 passed.
  - `playwright test tests/games/ball-run/play.spec.ts --workers=1 --output=/tmp/claude-0/pw-ball-run2` on 4600 (load average 9–12): 24 passed, 3 failed. All 3 were 30 s timeouts: `play:152` click, `play:339`, `play:462`.
  - Rerunning those 3 at load average about 5: 3 of 3 passed on 4600 (current) and 3 of 3 on 4601 (original). The star overlay is `pointer-events:none` and does not intercept the Play click.

## Screenshots
- `before-*.png` and `after-*.png` (1440x900 and 390x844).
  - The evidence action now presses Play, runs 3 s, then taps left and right, so the shot shows the rolling ball and upcoming obstacles.
- `detail-bauble-blocks.png`: a close crop of the bauble and the festive blocks, from the first pass.
- `detail-frosted-towers.png`: frosted walls, warm windows, soft ledges, and snow fading up to road level.
- `detail-winter-sky.png`: stars in the winter-blue sky slot, with roof snow caps.
- What I checked:
  - the ball reads as a glossy red bauble with a gold band;
  - red, green, gold and white blocks contrast with the ice road and navy fog;
  - the HUD and speed text stay legible over the dark sky;
  - no clipping on phone or desktop.
- `detail-gate.png` and `detail-gate-before.png` (390x844): Hard seed 5, restored 14 m before the first boost gate.
  - I captured these with a scratch Playwright script that seeds the save the same way the play spec does.
  - Checked: evergreen walls with gold rails, snow-white arch bars, a gold entrance ring and gold chevrons, and the gold Speed Up trail. The speed text stays legible over the arches.
  - Recaptured after the second pass.
- The spec's own `tests/games/ball-run/evidence/boost.png` was not regenerated in this session.

## Known limitations
- The theme is read at mount. Toggling it mid-run applies on the next mount.
- There is no falling snow, by design (no continuous particles).
