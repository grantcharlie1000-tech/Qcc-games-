# Strongroom Round 3 Implementation Plan

> **For agentic workers:** Use the local executing-plans and test-driven-development skills; independent code review is required before completion.

**Goal:** Deliver the approved outline HUD, daylight rendering, final operators, Customs House tactical rounds and host-authoritative destruction.

**Architecture:** Retain the R2 Three.js renderer and pure TypeScript authority, prediction and Room transport. Add pure round/objective and cell models, then use those same models for solo and online. Reuse the licensed Tiny Strike material, prop, gun and map builders and the supplied character pipeline outputs.

**Tech Stack:** Vite, TypeScript, Three.js r180, PeerJS Room, Vitest, Playwright.

**Spec:** `/workspace/qcc-shooter-work/design/DESIGN.md`; user Round 3 brief and Charlie's D1/D2 decisions; `/workspace/qcc-shooter-work/shots/r3-hud-mock/` direction B.

## Global Constraints

- Only `/workspace/qcc-shooter`, existing `game/shooter`; no other worktree or session changes.
- No env, Netlify configuration/functions, DB, ads, production, push or deploy.
- Small commits with check, unit suite and build green.
- PNG/WebM/evidence JSON stay external except actual game assets.
- Capture `5af2099` lighting BEFORE changing the renderer; retain identical Harbor camera, seed and viewport for AFTER.
- HUD: ally #3D9BFF, enemy #FF8A1F, text #F5F8FB, muted #BECBD5, critical #FF8177; Barlow Condensed with OFL.
- No backdrop-filter/glass inside the match HUD; safe areas, invisible inactive stick, no fine-pointer touch buttons, changed text only.
- Potato: no SSAO, bloom or shadow maps; textured surfaces and a daytime sky still required.
- Authoritative plant/disable and wall changes; clients send inputs, never state claims.

## Review Focus

- Cross-round packets and late/rejoining guests: objective and walls must agree with the authoritative round.
- Side swaps: score ownership stays stable, while loadouts, character side and relative ally/enemy tint change correctly.
- Releasing/moving during holds: plant, disable and build actions cancel without consuming inventory prematurely.
- Narrow/short viewports and long player names: HUD/readouts and sheets remain contained with a clear aiming area.
- First breach/quality changes/disposal: no allocation spike, stale collision, hidden shader surprise or leaked models/textures.

### Task 1: Reproducible baseline and approved HUD

Files: `ui/hud.ts`, `ui/match-hud.ts`, `ui/hud-icons.ts`, `ui/match-hud.css`, `touch.ts`, `style.css`, font assets, `ASSETS.md`, HUD browser specs.

- [ ] Capture high/potato × 1440×900/844×390 frames at seed 42 and persist pose/provenance externally.
- [ ] Add a browser regression that fails for glass on match nodes, missing live readouts and touch geometry.
- [ ] Adapt the approved B geometry/icons/CSS, bundle font/license, wire HP/ammo/score/clock/feed/reticle and menu.
- [ ] Preserve shared lobby/sheets; fix the stretched header close button; test desktop and both touch sizes.
- [ ] Run check/test/build and commit.

### Task 2: Daylight and textured rendering

Files: `render.ts`, licensed world/material helpers, lighting browser specs.

- [ ] Verify the baseline exists before edits. Add regression checks for sRGB, exposure, daylight sky and cheap-path constraints.
- [ ] Fix the clipped/black sky, increase fill/key/exposure, lighten albedos and extend lighter fog on every tier; reuse material library.
- [ ] Capture same Harbor poses AFTER; compare mean luminance and HUD contrast on bright frames.
- [ ] Run check/test/build and commit.

### Task 3: Rounds, Customs House and objective

Files: `rounds.ts`, `maps/customs-house.ts`, `loadouts.ts`, `sim.ts`, net protocol/session, pick UI, tests.

Interfaces: `Simulation` owns phase/score/site/carrier/progress; `SimWorld` supplies map spawns, plant zones, LOS and paths. Snapshots/reliable messages carry objective, selection and round transitions.

- [ ] RED: six round win conditions; side swap/overtime, seeded site vote, carry/drop/pickup/hold cancellation, loadout validation.
- [ ] Author the coordinate-table map, hard shell/openings/cover, nav graph and site tactics using Harbor's builders/materials/props.
- [ ] Implement full Pick→Prep→Action→Planted→RoundEnd→GameEnd, human loadout lock and bot objective tactics through the existing authority.
- [ ] Validate every nav node and edge in Node, bots planting across 10 seeds, solo matches both sides, host/guest phase/objective equality.
- [ ] Run check/test/build and commit in feature-sized increments.

### Task 4: Cell destruction and replication

Files: `walls.ts`, `wall-renderer.ts`, sim/collision/net integration, tests.

Interfaces: deterministic panels/cells and compact `wd`/`wp`/`wf`; `WallStore` owns damage, reinforcement, barricades and footprint; renderer reads authoritative state; collision and LOS read the same cells.

- [ ] RED: indexing, damage multipliers, reinforced immunity, clamped floor-aligned footprint, exact greedy collider coverage and packet validation/resync.
- [ ] Implement bounded panel store, five instanced wall meshes, pooled one-draw debris and dirty-range matrix updates.
- [ ] Integrate bullets/penetration, movement, LOS, reinforcement/barricade/charge/impact holds and bot tactics with host authority/reliable ops.
- [ ] Browser: 1-cell hole, shattered collision, walkable breach, guest/host wall hashes and 4× breach timing ≤2ms/≤6 draws.
- [ ] Run check/test/build and commit.

### Task 5: Final operators and weapon/arms

Files: `render.ts`, `operators/`, `viewmodel.ts`, models, `ASSETS.md`, asset/render regressions.

- [ ] RED: compressed asset/LOD/material/clip requirements and actual rendered operator submission.
- [ ] Copy designer outputs, meshopt decoder, cache merged operator kits, four side/tint materials and per-tier LOD switching.
- [ ] Replace old hands with supplied palette arms and use real licensed procedural gun viewmodels/held guns.
- [ ] Verify side swap/tint, clipping and disposal; run check/test/build and commit.

### Task 6: Evidence, performance, audit and review

Files: regression specs; external capture/profile/audit artifacts; `/workspace/qcc-shooter-work/REPORT.md` and a committed Round 3 verification record.

- [ ] Capture lobby/pick/prep reinforcement/action breach and enemies/planted/end/scores/online guest at all three requested sizes.
- [ ] Run the full nine-point polish audit plus contrast/reduced-motion on real HUD and menus/lobby, fix findings and save AUDIT.md/contact sheet externally.
- [ ] Profile potato/low at 4×/6× CPU, FPS p50/p95/p5, frame p95, calls, triangles, JS heap; report runner/device limits honestly.
- [ ] Full unit suite, Strongroom browser/online specs and Blockcraft/Pool online specs.
- [ ] Fresh independent code review, fix important findings, rerun relevant verification.
- [ ] Append REPORT Round 3 with commits, counts, performance, paths and honest known issues; final check/test/build and clean committed branch, no push/deploy.
