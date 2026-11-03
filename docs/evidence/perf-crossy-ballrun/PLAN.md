# Crossy Road and Ball Run implementation plan

The task in this session is the specification. Work stays on `perf/crossy-ballrun` in this checkout.

**Goal:** improve measured performance without changing the visual design, make Crossy terrain less predictable, and stream its world sideways without boundaries.

**Architecture:** retain Vite, TypeScript, Three.js, the pure fixed-step simulations, and existing instanced renderers. Benchmark the production build with one headless Chromium instance. Version Crossy's new generator so existing saves retain their terrain; use stateless seeded terrain queries and fixed-capacity render pools for horizontal streaming.

**Constraints:** one build/test process at a time, using `/tmp/qcc-test.lock`; one owned server at a time; only the two games, their tests, this requested evidence, and the requested performance harness. No shared UI, glass, leaderboard, or other-game changes. Chromium only, one worker; only the two Vitest folders. Commit and push each milestone.

## Milestones

- [x] Baseline: run `npm ci` once, build once, add `scripts/perf/crossy-ballrun.mjs`, measure four 15-second scenarios, and save `before.json`, CPU profiles, heap and renderer.info samples. Commit and push.
- [ ] Performance: use the profiles to select fixes in each game's scene/loop. Add behavior tests for adaptive resolution and any changed cache behavior; run the focused tests before and after. Preserve fixed-step collision fidelity and appearance. Commit and push.
- [ ] Crossy generation: add a new generation revision using seeded weighted selection without forced alternation, capped clusters, independent lane directions/speeds/spacing, and guaranteed grass/log passability. Test seed replay, long-run variety, difficulty, and fairness across seeds. Commit and push.
- [ ] Crossy sideways: update rules, save validation, lane queries, rail warnings/collision, camera, and renderer to use an unbounded logical x and a bounded visible window. Test far-positive/negative x, return-trip determinism, river riding, train warnings, and bounded caches/pools. Commit and push.
- [ ] Finish: independent code review; scoped Vitest; Chromium Playwright specs with workers=1; `npx tsc --noEmit`; final production build; repeat the identical benchmark to `after.json`; inspect screenshots; write `SUMMARY.md`; final commit and push; print results and file list.

## Review focus

- Old saves replay their original generation revision; far-side new saves restore without truncation.
- Warning lights and train collision agree at far negative/positive columns and period boundaries.
- Returning sideways reconstructs the same obstacles with bounded memory.
- A slow frame or repeated restart neither creates unbounded work nor stops adaptive resolution.
- Measurements contain active rendering, identify software GPU limitations, and keep profiler overhead out of the rAF sample.

## Progress

- Initial checkout clean at `f31711e6`. `npm ci` completed once. Baseline build started under the shared test lock.
- Existing code already uses seeded mulberry32, instancing, and projected Crossy shadows. Investigate actual profiles before duplicating those optimizations.

- Baseline complete: production build passed; four 15-second samples and separate CPU profiles saved. Shared-shell getImageData dominates all profiles (outside authorized change scope). Ball Run also shows per-frame DOM updates, style/layout work, GC and road transform construction. Preview stopped.
