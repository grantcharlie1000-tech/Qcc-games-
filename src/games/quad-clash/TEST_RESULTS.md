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

- Headless Chromium uses SwiftShader, so frame rates there are not representative; adaptive resolution lowers the pixel ratio when sustained FPS drops below 40.
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
