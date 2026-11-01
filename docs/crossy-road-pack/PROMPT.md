# Build brief: add **Crossy Road** to QCC Games

You are Claude Code (Opus 5.5, max effort) in a cloud session on `grantcharlie1000-tech/Qcc-games-`. Charlie owns this site. It is used by **students**, so safety and polish matter. Work autonomously until every success criterion below passes, then stop.

## 0. Setup (do this first, exactly)

```bash
git fetch origin main ref/crossy-road-pack
git switch -c game/crossy-road origin/main
git checkout origin/ref/crossy-road-pack -- docs/crossy-road-pack   # bring the pack into your branch
git commit -m "docs: add Crossy Road reference pack"
```

Then read, in this order:

1. `AGENTS.md` (and every skill it tells you to load: `using-superpowers`, the game-development skill, and the `.claude/skills/` mirrors such as `writing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`)
2. `GAME_AGENT_GUIDE.md`, `ARCHITECTURE.md`, `docs/LEADERBOARDS.md`, `docs/ACCOUNTS.md`, `docs/STUDY_MODE.md`
3. **`docs/crossy-road-pack/REFERENCE.md`**: the full gameplay spec. It is the source of truth for rules, numbers and what to ignore.
4. `docs/crossy-road-pack/contact-sheet.jpg` and `docs/crossy-road-pack/frames/*.jpg`: look at them. They are from the original game and are for gameplay, camera and lane reference only. Build **original** art and UI in QCC's style; copy no assets, characters, logos or UI.
5. Prior art in this repo:
   - `src/games/ball-run/` (Three.js, WebGL, fill-stage, dispose)
   - `src/games/blockcraft/` (Three.js)
   - `src/games/quadfall/` + commit `b43c45a` (template for a **scored** game incl. leaderboard + migration)
   - commit `a55ebeb` (Fivefold, the full list of files to register a new game)
   - `src/core/types.ts` (`GameModule`/`GameInstance`/`GameContext`)
   - `src/core/random.ts` (`mulberry32`)

## 1. Plan first

Before writing code, use the `writing-plans` skill to write `src/games/crossy-road/PLAN.md`. It must cover:

- module layout
- the pure-logic/render split
- the generator and its fairness invariants (REFERENCE §5)
- the collision model (§4)
- camera (§6)
- registration touch-points
- the test matrix
- the work split for subagents

Commit the plan.

## 2. Work split with subagents

You are the lead and integrator. Use the Task tool with explicit models. Run independent chunks **in parallel**, each with a precise brief, file ownership (no two agents edit the same file at once) and its own verification command.

- **Sonnet 5.5 (`claude-sonnet-5-5`) subagents** for substantial chunks, e.g.:
  1. `generator.ts` + `lanes.ts` (pure, seeded lane generation, deterministic hazard positions as functions of time) with Vitest fairness tests F1–F7 over ≥ 2,000 seeds
  2. `rules.ts` (pure hop/collision/death/eagle/score state machine, input buffer) with Vitest tests for D1–D6
  3. `scene.ts` (Three.js orthographic voxel renderer: merged/instanced geometry, shadows, quality tiers, dispose)
  4. `input.ts` (keyboard + pointer swipe/tap)
  5. Playwright e2e specs
- **Haiku 5.5 (`claude-haiku-5-5`) subagents** for small mechanical chunks:
  - registration edits across catalog/navigation/types/main/viewport CSS/verify-offline/test lists
  - the SVG cover
  - `SPEC.md` / `SKILL_USAGE.md` / `TEST_RESULTS.md`
  - README/ARCHITECTURE entries
  - Web Audio sound table
  - lint and type-error sweeps
- You (Opus) own `index.ts` (the `GameModule` + game loop wiring), integration, the final review and every verification run. Review each subagent's diff before accepting it (`requesting-code-review`).

## 3. Implementation requirements

- Folder `src/games/crossy-road/`, id `crossy-road`, title "Crossy Road". Follow `GAME_AGENT_GUIDE.md`:
  - `SPEC.md`, `SKILL_USAGE.md`, `TEST_RESULTS.md`
  - original cover `public/game-art/crossy-road/cover.svg` (viewBox 0 0 320 410, no text, keep y 0..95 clear)
  - namespaced CSS
  - pixel ratio ≤ 2
  - works at 366 px width
  - sound default OFF, Web Audio oscillators only
  - no network, analytics, CDN or new runtime dependencies (`three` is already installed)
- Register it like Fivefold/Quadfall. At minimum touch:
  - `src/core/types.ts` (GAME_IDS), `src/core/catalog.ts`, `src/core/navigation.ts`, `src/main.ts`
  - add to `fillGames` (WebGL stage, no CSS transform) like Ball Run/Blockcraft; check `src/game-viewport.css`
  - `scripts/verify-offline.mjs`
  - `tests/e2e/study.spec.ts`, `tests/e2e/viewport.spec.ts`, `tests/accounts/server.test.ts`
  - `README.md`, `ARCHITECTURE.md`
  - `src/leaderboard/shared.ts` (`SCORED_GAMES`)
- **Shell / UI:** no menu, character select, coins or gift/unlock system. One original character. Score is fed via `ctx.setScore` / `ctx.setLevel` (e.g. "Row 42") so the shared in-game dock (Games left, live info centre, Menu right; Liquid Glass on PR #80) shows live info. Don't build a separate HUD that duplicates it. A game-over card uses QCC design tokens with Play again + Rankings (`ctx.openRankings`).
- **Escape** must keep opening the Study subject article through the shell. Never swallow Escape.
- Full screen, touch and keyboard (WASD/arrows, tap = forward, swipes), with the input buffer exactly as REFERENCE §2–§3.
- `pause/resume/restart/serialize/restore/dispose` all correct. `restore` validates input. `dispose` frees all WebGL resources and listeners.
- Performance targets in REFERENCE §11 (60 fps on Chromebooks and phones; Low-quality auto-fallback).
- Expose a **test hook** only in dev/test builds (e.g. `window.__crossyTest` when `import.meta.env.DEV` or `?test=1` on localhost): set the seed, read state (row, col, alive, deathCause, lanes near the player), advance time deterministically, and force a lane layout. Strip it from production builds.

## 4. Leaderboard and the DATABASE RULE (read carefully)

Server rankings need `'crossy-road'` allowed by the `arcade_scores_game_id_check` CHECK constraint, which means a **new migration** in `netlify/database/migrations/` (pattern: `20261030190000_minesweeper_score.sql`, drop + re-add with the *complete current* list from the newest migration + `'crossy-road'`).

That is a **database schema change**. Charlie must approve it. So:

- You MAY write the migration file as its own clearly separated commit titled `db(migration): allow crossy-road in arcade_scores (NEEDS CHARLIE APPROVAL)`, and test it **only** against the local dev database (`npm run dev:online` / the local test harness used by `tests/accounts`).
- You must NOT run it against, connect to, or print credentials for any remote/production database. Do not read or print env secrets or connection strings.
- If anything beyond that single constraint change seems necessary (new tables, columns, RLS, functions), **STOP and report it instead of doing it.**
- State prominently at the top of your final report that this migration exists and needs approval before merge, because merging runs migrations automatically on Netlify.
- Guests keep local bests (existing behaviour). Signed-in players sync through the existing queue. Don't change the leaderboard server, API, name rules or account code beyond adding the id to the lists the tests require.

## 5. Out of bounds

Do not change:

- Movies/TV code
- ads
- `netlify.toml`, Netlify config, or Netlify functions
- env files or secrets
- package dependencies (unless truly unavoidable; then explain)
- other games' behaviour
- the DB schema beyond §4

Do not touch PR #80's Liquid Glass work.

## 6. Success criteria (all must pass; paste outputs into `src/games/crossy-road/TEST_RESULTS.md`)

1. `npm run check` (strict TypeScript + lints): 0 errors.
2. `npm test`: all green, including new `tests/games/crossy-road/*.test.ts`:
   - generator determinism (F6) and fairness F1–F5, F7 over ≥ 2,000 seeds × 400 rows
   - rules D1–D6 (each death triggers exactly under its rule and not otherwise)
   - input buffer (max 1 queued, key repeat ignored)
   - blocked moves
   - score = max row
   - serialize/restore round-trip + invalid restore rejected
3. `npm run build` succeeds. `node scripts/verify-offline.mjs` (or the repo's offline check) passes.
4. Playwright e2e, Chromium only (`/usr/bin/chromium`; no WebKit), own dev port, `ARCADE_URL=http://127.0.0.1:<port> npx playwright test tests/games/crossy-road --project=chromium`, plus the existing `tests/e2e/study.spec.ts` and `viewport.spec.ts`. The new specs must cover:
   - **movement:** W/↑/tap forward, S/↓ back, A/D/←/→ sideways, swipe gestures, blocked by tree, and the score increases only on new max row
   - **deaths:** with forced seeded layouts, car squash, train hit (and that the warning light shows ≥ 1 s before), drowning, carried off-screen on a log, eagle idle (no eagle before the threshold, eagle after it), eagle when 3 rows back. Each shows the game-over card with the right cause.
   - **generation fairness in-browser:** play 200 rows with the test hook and assert a reachable open column on every grass row and road gaps ≥ the minimum
   - Escape opens Study; restart works; no console errors; `dispose` leaves no running RAF after navigating away
5. **Screenshots** (commit them):
   - `tests/games/crossy-road/evidence/chromium.png`
   - `.../phone-390x844.png`
   - `.../chromebook-1366x768.png`
   - `.../death-*.png` for each death type

   Look at them yourself and fix anything ugly, cropped or illegible.
6. A final self-review against REFERENCE.md, section by section, noting any deviation and why.

## 7. Git: commit and push, nothing else

- Commit in small logical commits on `game/crossy-road` (conventional messages, as in the repo history), then `git push -u origin game/crossy-road`.
- **Do NOT open a pull request, do NOT merge, do NOT trigger or request any deploy** (Charlie is out of Netlify credits, and merging also auto-runs migrations). Do not push to `main` or any other branch.
- Never commit secrets, connection strings, password hashes or user save data. Never print them in logs.

## 8. Final report (your last message)

1. **DB migration status first:** whether you wrote it and that it needs Charlie's approval before merge.
2. Branch name + last commit SHA.
3. The success-criteria checklist with pass/fail and the key numbers (fps measured if possible, test counts, fairness seeds tested).
4. Screenshot paths.
5. Deviations from REFERENCE.md and open questions.
