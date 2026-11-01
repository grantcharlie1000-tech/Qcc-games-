# Crossy Road implementation guide

The active fidelity-pass plan and execution record are in [2026-11-01-crossy-road-fidelity.md](../../../docs/superpowers/plans/2026-11-01-crossy-road-fidelity.md). Charlie's request overrides older art choices and the external pack where they conflict. The current contract is [SPEC.md](SPEC.md).

## Scope

- Title `Crossy Road`; id, route, save and leaderboard key `crossy-road`.
- Keep one white voxel chicken-like bird, the UFO, every death, seeded procedural fairness and the QCC shell. Omit menus, unlocks, presents and coins from the original.
- Match the supplied frames in camera, zoom, palette, box trees/rocks, chunky traffic, multi-carriage trains and full water rows with logs and lily pads. Author all geometry in code.
- Leave `public/game-art/crossy-road/cover.svg` to the separate designer.
- Use shared shell Score/Row/Best/Menu and shared glass classes for Continue/game-over cards. No duplicate HUD or rankings button.
- High: antialiasing, pixel ratio `min(devicePixelRatio,3)`, tight real directional shadows, baked base shading. Low: capped at 1.5, blob shadows and less decor. Full-screen native canvas size, no CSS scaling.
- UFO warning at 5 s, idle swoop at 7 s; sideways/back moves do not reset it. Immediate swoop at 3 rows back or behind. Grab and depart off the top within 0.7 s. Normal death card at 0.9 s, reduced-motion card at 0.3 s.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `config.ts` | Shared types and tile/timing/fairness constants |
| `generator.ts` | Pure seeded chunks, connectivity repair and F1–F7 invariants |
| `world.ts` | Deterministic row cache, look-ahead/pruning |
| `lanes.ts` | Hazard spans, platform support, rail warning as pure time functions |
| `rules.ts` | Grid hops, max-row score, collisions/deaths, serialization/validation |
| `motion.ts` | Analytic UFO swoop and reduced-motion pose |
| `models.ts` | Authored vertex-coloured voxel geometry; no external assets |
| `scene.ts` | Orthographic camera, shared instanced pools, lighting, quality, effects, disposal |
| `input.ts`, `audio.ts` | Pointer/keyboard actions, optional oscillator sound |
| `index.ts`, `style.css` | Shell lifecycle, fixed-step loop, hints and QCC cards |
| `test-hook.ts` | Dev-only seed, clock, validated restore, forced lanes and render stats |

## Verification

- `npm run check`, `npm test` (F1–F7 over 2,000 seeds × 400 rows; time sampling over a 200-seed subset).
- Start only this worktree: `npm run dev -- --port 4190 --strictPort`.
- `ARCADE_URL=http://127.0.0.1:4190 npx playwright test tests/games/crossy-road --project=chromium`.
- Run touched `tests/e2e/study.spec.ts` and `tests/e2e/viewport.spec.ts` on Chromium, with the same ARCADE_URL.
- `ROUND=1 node scripts/capture-crossy.mjs`: phone 390×844 at DSF2 and DSF3, PC 1366×768. Deterministic start/mixed/hop/death/card frames, manifest and native DSF3 crop in `/workspace/qcc-crossy-review/r1/`.
- Inspect each round against the references; refine and capture at least two further rounds. Generated PNGs stay outside git.
- Independent code review of substantial changes. Commit logical changes on `game/crossy-road`; no push, PR, merge or deployment.

The schema migration `netlify/database/migrations/20261031120000_crossy_road_score.sql` **needs Charlie's approval before application**. Never apply it to any remote database from this task. Local isolated database tests are allowed; do not read or print connection strings/secrets.
