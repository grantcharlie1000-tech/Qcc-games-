# Verification evidence

2026-10-19, isolated branch `game/animal-stack`, system Chromium 154.0.8037.57 on shared Linux. Commands below were executed in `/workspace/Qcc-games-/.worktrees/animal-stack`.

## Passing commands

- `npm run check` — exit 0, TypeScript reports no errors.
- `npx vitest run tests/games/animal-stack` — 1 file, 14 tests passed. Real Matter engine, no physics mocks: safe preview, one-time support/height scoring, sleeping support chains, five centered distinct animals plus 1,800-tick stability wait, finite species masses, real overhang rotation/loss, safe spawn clearance, deterministic seed/queue, live-body restoration, corrupt saves and exact duplicate body poses, 40-body cap/completion, off-centre load tipping and exclusion of airborne bodies from height rewards.
- `npm test` — 2 files, 18 tests passed (14 game + 4 existing core tests).
- `ARCADE_URL=http://127.0.0.1:4192 npx playwright test tests/games/animal-stack --project=chromium` — 3 scenarios passed. Actual 390×844 viewport, mouse movement/release aiming and four drops, keyboard fifth drop, score changes, pause stops fixed ticks, instructions dialog, five-body save/restore, repeated exit/re-entry, restart while paused, no document horizontal overflow and no page errors. Separate mobile/touch context with reduced-motion checks touch release and physical fall/loss.
- `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/animal-stack` — 6 SVG files passed, zero failures.
- `git diff --check -- src/games/animal-stack tests/games/animal-stack public/game-art/animal-stack` — no whitespace errors.

Server started on assigned port 4192. The shared dependency optimizer initially returned a failed dynamic module import. A temporary `/tmp/animal-stack-vite.config.mjs` used the assigned worktree root and `/tmp/animal-stack-vite-cache`; command: `npm run dev -- --config /tmp/animal-stack-vite.config.mjs --port 4192`. Parent subsequently added a per-worktree `.vite-cache` setting; shared files are deliberately excluded from this specialist commit.

## Art and browser evidence

- `tests/games/animal-stack/evidence/chromium.png` — actual full-page Chromium screenshot with a four-animal physical stack, waiting preview, height ruler and mobile controls. Inspected visually after correcting dark-shell text contrast.
- `tests/games/animal-stack/evidence/performance.json` — 60 actual RAF interval samples with four stacked bodies, recording median and p95 in the shared headless environment. This is not a physical Chromebook measurement or a 60 FPS guarantee.
- `public/game-art/animal-stack/cover.svg` — original matching vector cover, 320×410. Parent may replace cover in its final art pass.
- Five original standalone character SVGs in the same art directory; runtime illustrations originate in `art.ts` and use the same geometry/style.

## Failures found and resolved

Initial unit run failed because the model did not yet exist. A five-body test exposed sleeping contact pairs disappearing from the active pair list; exact convex-part geometry queries resolved it. A scoring regression test demonstrated an airborne newcomer's height incorrectly boosting another animal's reward (335 cm versus a physical ~54 cm foundation); scoring now measures only island-connected bodies. Additional validation test failed for an impossible complete flag; structural score/completion invariants now reject it.

The first browser run encountered the shared Vite optimizer collision described above. An early pause test pressed Space while the native Pause/Resume toolbar button held focus, which correctly resumed via native button behavior; the corrected test uses an aim key while paused and confirms unchanged simulation ticks. Final Chromium scenarios pass.

## Explicit limitations

`ARCADE_URL=http://127.0.0.1:4192 npx playwright test tests/games/animal-stack --project=webkit` was attempted. Both scenarios failed before opening any page because `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` does not exist. WebKit is not verified; no browser installation was attempted.

Completion/cap validation uses a controlled 40-body snapshot fixture; the automated real-play browser sequence builds five animals, not a full forty-animal run. Physics stability is tested numerically and by actual Chromium play, but physical mobile touch feel and Chromebook hardware performance are unmeasured. Final combined production build, offline pack and parent cover review belong to the coordinator's integrated checks.

## P1 valid-save restoration regression

Independent review reproduced a live seed-4 run: five drops at aim 150 with 300 fixed ticks each, then a sixth drop and 31 more ticks. At world tick 1531 it has score 980 and is not over. The snapshot passes schema parsing, but ordinary hippo/island impact penetration of approximately 7.23 pixels exceeded the old restore-only five-pixel depth guard. The exact deterministic test failed on `restore(save) === false` before the fix.

Removed contact depth as a corruption criterion. Validation still bounds count, species, transforms, velocities and run invariants; reconstruction uses only authored finite convex geometry/masses. Exact duplicated body geometry is rejected atomically, with the duplicate test now using an otherwise schema-valid score so it actually exercises this guard. Natural transient intersections remain intact for the solver to resolve rather than being discarded or repositioned.

The regression now restores the exact snapshot and confirms every serialized field is preserved, then continues 300 real physics ticks with finite positions, angles and velocities. Added a Chromium test which loads that exact fixture through the shell save envelope, confirms six animals and a nonzero score, pauses to save it, reloads, and confirms the six-animal run remains. Focused command `ARCADE_URL=http://127.0.0.1:4192 npx playwright test tests/games/animal-stack --project=chromium -g 'six-animal impact'` passed 1 test. Full follow-up runs: 14 game unit tests, 18 total unit tests, 3 Chromium scenarios and TypeScript check passed. No cover or shared files are included in this correction.
