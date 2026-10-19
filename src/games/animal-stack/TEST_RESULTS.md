# Animal Stack correction evidence

2026-10-19, SOL-12, isolated `correction/animal-stack` worktree. Only `src/games/animal-stack/`, `tests/games/animal-stack/` and `public/game-art/animal-stack/` are in the game handoff. Parent viewport commit was cherry-picked as699bae8 and is excluded from the game-only handoff.

## Verified results

- `npm run check`: passes.
- `npm test`:236 tests across19 files pass;22 Animal tests across3 files cover compound recesses/centroid, contact/real tipping, support/stability/scoring, safe preview/spawn, state migration, restore/corrupt saves and gesture classification/cancellation.
- `npm run build`: passes and generates the offline pack. Parent owns integrated deployment/offline root/subpath acceptance.
- `bash .agents/skills/svg-skill/scripts/validate.sh public/game-art/animal-stack/`:14 SVGs pass. Six active species and two preview sheets are original assets; old unused species/cover assets remain historical.
- `ARCADE_URL=http://127.0.0.1:4182 npx playwright test tests/games/animal-stack --project=chromium --workers=1`:11/11 pass in39.7s. Covers mouse drag/tap, deliberate drop, keys/repeat, touchCDP/cancel, dropped-body exclusion, pause capture cleanup, pause stopping Canvas/one-loop resumes, saved run, restart and all3 viewport fits.
- Additional fresh targeted `-g 'neck-first'` after strengthening the restored-pose fixture:1/1 passes in8.4s. Runtime giraffe body bottom441.4115 is45.2552 logical units above platform486.6667 while both animals have earned connected support, proving actual support on the elephant.
- Held-key RED→GREEN was observed in Chromium: native repeated Enter on refocused actual DROP released animal2; native focused Space waited until keyup; held D moved only10 units. Three targeted tests failed first, then all3 passed after a shared guarded down-transition, native activation prevention, window keyup/focus cleanup and continuous held directional positioning. DROP keeps visible text while accessible name is dynamically `Drop Elephant` etc.

## Actual artifacts

All paths below are relative to `tests/games/animal-stack/evidence/`:

- `actual-touch-tap-drop-tip-stable-fall.webm`: actual mounted game with parent shell; VP9,390×844,14.12s verified by ffprobe. Real touch drag → tap → deliberate DROP, restored neck-first giraffe pivot, true above-elephant stable support, viewport changes and actual off-edge penguin fall.
- `interaction-checks.json`: drag count0, aim215, angle0; tap count0 and angleπ/4; pivot angle changed from-π/2 to-0.0791 (>1.49radians); stable support bottom441.4115; no page errors. All3 document dimensions equal viewport dimensions exactly.
- `final-390x844.png`, `final-844x390.png`, `final-1366x768.png`: actual responsive scene with giraffe on elephant and waiting sloth.
- `final-giraffe-release.png`, `final-giraffe-tip.png`, `final-giraffe-stable.png`, `final-elephant-stable.png`, `final-tap-portrait.png`, `final-fall.png`: real scene stills. Release still is airborne; after-pivot still shows the body after natural contact rotation. Collider overlay shows actual convex parts and white centre-of-mass marks.
- `six-sprite-preview.png`: all6 original cutouts at native relative scale. CPU rasterization with installed librsvg/Cairo; not gameplay evidence.
- `three-sprite-preview-refined.png` and `gate-real-*.png`: earlier parent-reviewed3-species gate. Elephant was then shortened with identical0.84 art/collider scaling; parent accepted the revised gate before full-set expansion.
- `performance.json`:60 actual browser RAF samples, with environment limitations; no physical-device or Chromebook claim.

`preview/record.mjs` reproduces the final recording against Vite4182 (`ANIMAL_REVIEW_URL` may override). `preview/index.html` is an explicitly labelled optional real-module harness; final screenshots/video use the actual app route, not that harness. C or `?animal-colliders` before the hash toggles colliders.

## Save and reference limits

Version1 saves have incompatible old species/platform geometry. Every old field and score formula is validated, prior score is archived as `legacyScore` and retained in shell Record through the unchanged context API; a fresh version2 stack starts with an explicit notice. Version2 retains body state and waiting rotation. Complex collision trajectories can diverge after restoration because transient solver contact cache is not serialized; no bit-for-bit chaotic landing claim. The CPU live x210 head-first giraffe test really falls, but its browser restored-pose case is claimed only as a verified pivot; the browser fall evidence is the independent off-edge penguin.

The ZIP had stills/contact sheets only, no MP4. Original continuous timing and tap increment cannot be certified. The single45° tap/Q/E constant is an explicit parent-authorised adaptation after optional clarification remained unanswered. Browser touch is actual Chromium CDP interaction/emulation, not physical-device evidence. WebKit/real-device hardware was not exercised in this specialist slot.

## Late tall-stack HUD regression

Independent review found that following a tall tower could place the waiting cutout behind the shared HUD in short landscape view. A real reachable fixture is now retained as `tests/games/animal-stack/tall-run.json`: seed51, five ordinary queued drops at aim180,600 fixed steps per drop, tick3000, five scored sleeping animals, score1114. The deterministic replay test matches that save exactly.

The old camera reproduced1239 non-sky Canvas pixels in the top76px of844×390; `evidence/tall-landscape-before.png` shows the overlap. A render-only camera safety floor now reserves84px, includes4 logical units of outline padding, and clamps even an interpolated first frame after rotation/restore/resize. Native scale, body geometry, spawn/release height, score, save data and input relationships are unchanged. The same camera continues to drive Canvas art/colliders, inverse pointer coordinates and bubble positioning. As before, following a tall tower can move the platform/lower tower outside the ordinary play framing; sprites are not shrunk.

Fresh tests:5 framing/unit cases (original logic RED in3 viewport cases, then GREEN),27/27 total Animal unit tests, and2/2 actual Chromium tall-save UI cases in7.0s. Browser checks scan real Canvas pixels (not HUD DOM or a copied framing formula), cover8 tap-equivalent rotations, portrait/landscape resize, visible DROP and a genuine pointer drag at the rasterized waiting sloth verifying inverse mapping/count5. Refreshed evidence: `tall-390x844.png`, `tall-844x390.png`; all top76px Canvas pixels are skyblue. Browser slot released to parent for final integration QA.

Final isolated full suite after the camera fix:241/241 tests across20 files; typecheck and production build/offline pack pass.
