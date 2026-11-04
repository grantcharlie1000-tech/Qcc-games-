# Quad Clash test results

Engine: Chromium 1243 (`/opt/pw-browsers/chromium`, SwiftShader WebGL), Playwright, Vitest 3.2.

## Unit (`npx vitest run tests/games/quad-clash`)

46 tests across `world.test.ts`, `combat.test.ts` and `bots.test.ts`, all passing:

- **Arenas.** Spawns are in open space, and each house has five or more spawns on opposite halves. Every spawn, zone and pickup sits on the main navigation component and is pathable. Raised zones are reachable from the ground.
- **Movement.** Walls stop you; stage steps climb; a 1.25 m wall needs a jump; landing works; walking down stairs stays grounded; rays hit what they should.
- **Weapons.** Headshot multiplier, range falloff, shotgun pellets, walls stop bullets, three-round bursts, semi-auto buffering without repeat, reload from reserve, sidearm swap when dry, manual reload and swapping.
- **Explosives.** Rocket direct hits; splash spares teammates, hurts its owner at 45% and is blocked by walls; flask bounce, fuse and damage.
- **Eliminations.** Drops, respawn and spawn shield, streak rewards at 3, 5 and 8 (including the shield halving damage), no friendly fire, health regeneration, pickups refilling and respawning, loadout changes.
- **Modes.** The Brawl limit and win bonus, House Match to 40, Hold the Quad majority scoring, contest and zone moves, and the time limit in every mode.
- **Saving.** An exact JSON round trip that continues identically; malformed snapshots are rejected and values clamped.
- **Bots.** Determinism. Full bot-only matches in four mode and arena pairs: more than 20 eliminations, under 2% of fighter-seconds stuck, and zone points in Hold the Quad. Hard beats easy. Bots react after the reaction delay and aim at a seen enemy.

## Browser (`CHROMIUM_PATH=/opt/pw-browsers/chromium ARCADE_URL=http://127.0.0.1:4180 npx playwright test tests/games/quad-clash --project=chromium`)

7 passed:

1. The menu offers every option, and Play starts the chosen mode, arena and weapon (draw calls and triangles confirm rendering).
2. Keyboard: W moves, Space jumps, F fires, R reloads and Q swaps.
3. Eliminating a bot shows a kill-feed entry and a shell score above 0 (evidence screenshot `tests/games/quad-clash/evidence/chromium.png`).
4. The respawn panel weapon pick carries into the next life.
5. P pauses and saves; a reload restores to Continue and the match resumes.
6. The time limit shows the result card and 8-row scoreboard, and Play again restarts.
7. Phone 390×844 with touch: no horizontal scroll, all touch buttons visible, Jump and Swap work.

## Whole repository

- `npm run check`: pass.
- `npx vitest run`: 191 files, 4122 tests pass.
- `tests/e2e/shell.spec.ts` and `redesign-shell.spec.ts` (updated to 24 games): 41 pass and 1 fails. The failure is `the phone tab bar … at 360px`, where the TV Shows label is 0.16 px outside its tab. It fails identically with these changes stashed, so it predates this game.

## Limitations

- Headless Chromium uses SwiftShader, so its frame timings do not establish hardware FPS. Render resolution stays fixed within the selected drawing budget.
- WebKit was not run, because its browser is not installed in this environment.
- Pointer lock behaviour was exercised in Chromium only.
- The leaderboard needs migration `20261104090000_quad_clash_score.sql` applied before the server accepts scores. Until then, scores queue quietly, as they did for Claimline.

## Independent review

Two read-only reviewers covered the simulation and the presentation/lifecycle code. These findings were fixed:
- Rockets and flasks spawned inside a wall the thrower was hugging.
- A saved zero-speed rocket could produce NaN.
- Restore now clamps pitch, zone and attacker fields.
- Burst leftovers fired from the sidearm.
- The spawn chooser could throw if every spawn was crowded.
- Knockback ignored spawn shields and teammates.
- Bots repathed every frame toward unreachable goals.
- Bot grenade lob angle.
- Restart while paused captured the mouse behind the pause overlay.
- Per-frame HUD string building is now memoised, and attribute writes are cached.
- Wheel swap is debounced, pointer-lock refusals are no longer double-counted, and the two touch Fire buttons are independent.
- "Click to play" is hidden when pointer lock is refused.
- The menu-phase render rate is reduced, and the lost-graphics card has a link back to the games.

## Supplied satellite-image campus update — 2026-11-04

- Quad Clash Vitest: **62 passed**. Coverage includes all three arenas, thirteen traced footprint interiors, screenshot landmark relationships, connected spawns/pickups/objectives, all three campus bot modes, roof-escape prevention, old-layout save migration, and lost-target bot search behavior. Existing shell/headshot/weapon tests also pass.
- Quad Clash Chromium: **8 passed** after the boundary/bot fixes, including campus selection/rendering, save/restore and phone controls.
- `npm run check`, final `npm run build`, and `git diff --check` passed. The existing large-chunk warning remains.
- The north-up layout, 3D overview, actual menu and gameplay were inspected visually against the supplied screenshot. Evidence is under `/workspace/qcc-evidence/` outside git.
- Independent review found a roof-to-fence escape, fixed by treating campus horizontal bounds as solid at every height. The reviewer verified the reproduced jump now stops inside the fence. Bot pauses at already-reached lost-target locations were also corrected and tested.
- Building outlines, courts, pool and field now follow the user's screenshot. Scale, heights, interiors, doors, cover and boundary remain gameplay approximations. See `CAMPUS_REFERENCE.md`. No deployment performed.

## Additional campus clutter — 2026-11-04

- Added shaped benches, picnic tables, desks/lockers, bins, bike racks, planters, storage carts/cases and noticeboards using 183 shared render/collision boxes in place of the earlier simple bench blocks.
- All **62 game tests pass**, including spawn/pickup/objective connectivity, room interiors and bot matches in every campus mode.
- **3 targeted Chromium tests pass**: campus rendering, save/restore and phone controls.
- Typecheck, production build and `git diff --check` pass. Existing large-chunk build warning remains.
- Independent review found no structural-wall or gameplay-point overlaps and confirmed doorway centre routes remain clear.
- Menu, court-side gameplay and overview inspected visually. Evidence is under `/workspace/qcc-evidence/clutter-*` outside git. No deployment performed.

## Initial Potato-PC optimisation — 2026-11-04 (superseded visual profile)

- **76 game tests pass**, including indexed-vs-linear collision/ray equivalence, idle effects, batched mesh bounds, pixel budgets and timing across refresh rates.
- Final production build passes; the existing large-chunk warning remains.
- **10 Chromium browser tests pass** after the final adjustments, including both graphics presets, saved quality preference, high-DPI pixel limits, draw-call limits, normal gameplay and phone controls.
- The original low-resolution/no-shadow experiment measured 232.25→62 mean draw calls and 50,528→16,878 mean triangles. These are historical counts for the superseded profile; the current full-detail measurements follow below.
- Actual Potato menu/gameplay inspected visually. The campus and added clutter remain present; changes reduce rendering work and query candidates.
- Independent review identified frame-cap and visual-delta issues; fixed and verified with refresh-rate/jitter tests. No unresolved review findings. No deployment performed.

## Better textures and full-detail Potato — 2026-11-04

- Improved painted weatherboards/windows, roof sheets/seams/fasteners, concrete, timber grain, pool tiles/water, lockers, crates, bins and ground surfaces. A 256² mipmapped detail tile sharpens the ground without a huge map image; all outdoor court paint shares one crisp static geometry draw.
- Potato and Balanced share texture resolution/filtering, antialiasing, material lighting, desktop shadows, effects and the same 1080p-equivalent pixel budget. Only their 30/60 Hz render targets differ. Automatic resolution reductions and preset-switch arena rebuilds are removed. Input/simulation remain 60 Hz.
- **76 game tests pass**; **11 Chromium checks pass** (the full 10-test suite plus the added exact-frame parity check). The new check compares rendered canvas pixels synchronously across a preset switch. Graphics tests verify native 1080p output, desktop shadows and fewer than 230 draw calls in all four sampled headings. Phone, gameplay and preference restore checks pass.
- Production build/typecheck and whitespace checks pass. The existing large-chunk warning remains.
- Full-detail campus profile, including the refined weapons: mean draw calls **232.25→154.75 (33.4% fewer)** and mean triangles **50,528→43,887 (13.1% fewer)** against the pre-batching baseline, including shadow passes. This is scene-work evidence; no hardware FPS guarantee is inferred.
- Evidence: `textures-browser.log`, `textures-parity.log`, `textures-unit-final.log`, `textures-build-final.log`, `perf-full-detail.json` and `textures-*.png` under `/workspace/qcc-evidence/`, outside git. No deployment performed.

## Weapon textures and model refinement — 2026-11-04

- All eight weapon models now have painted receivers, brushed barrels, patterned grips, timber or brass accents, readable QCC markings and subtle wear. Five small shared finish sheets add about 0.83 MiB including mipmaps, across first-person, menu and bot models.
- Added 44-triangle beveled receivers, tapered stocks, hollow muzzles, attached sight posts, trigger guards, scope lenses and a shaped Bell Ringer bell. Parts remain batched by material. Weapon behavior, recoil, damage and hitboxes are unchanged.
- **77 game tests pass**. New coverage checks the bounded shared texture set, UV preservation through batching, isolation from fighter materials and exactly-once texture disposal. Final production build/typecheck pass.
- The full **11-test Chromium suite passes**, with the three graphics/preference/pixel-parity checks revalidated after the final sight/lens fixes. The two-load retina preference check needed a 60s test allowance for software WebGL shader compilation; it passed with that allowance.
- Independent review verified new chamfer/stock/tube closure, normals, winding, indices and UVs. It caught floating sight posts and an occluded scope lens; both were fixed and rechecked. No unresolved findings.
- All eight guns and actual first-person gameplay inspected visually; no console errors in the capture. Evidence: `weapons-lineup.png`, `weapons-*-gameplay.png`, `weapons-visual.json`, final unit/build/browser logs and `perf-full-detail.json` under `/workspace/qcc-evidence/`. No deployment performed.
- Final post-weapon scene profile averages **154.75 draw calls** (33.4% below the pre-batching baseline) and **43,887 triangles** (13.1% lower), including shadow passes.
