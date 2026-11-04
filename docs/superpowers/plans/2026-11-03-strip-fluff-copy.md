# Strip instructional game copy

> Execution: use the executing-plans skill in this session, with independent review at the end.

**Goal:** Apply Charlie's supplied copy brief to every game, preserving essential state, controls, accessibility, settings and help opened from the game menu.

**Architecture:** Edit visible strings and their markup in existing game modules. Remove references to deleted copy elements; keep simulation, persistence formats, CSS and control styling unchanged.

**Tech stack:** TypeScript, Vite, Vitest, Playwright Chromium.

**Spec:** User's resumed strip-fluff-copy task, 2026-11-04.

## Constraints

- Work only in `/workspace/qcc-copy` on `chore/strip-fluff-copy`; merge `origin/main` first.
- Text/markup only; no CSS, gameplay, features or migrations.
- Keep titles, buttons, scores, timers, levels/lives, results, errors, accessibility and settings labels.
- Preserve help explicitly opened from the game menu. Remove instructions and empty copy wrappers from the playfield and start screens.
- Pool: remove open-table/banner copy, potted-ball captions, unassigned group text, gesture/placement explanations and inline help. Below the table show only `Foul` or `Scratch` on a foul; keep results on the table and in accessible status.
- Keep the assigned group and numbered potted-ball trays; shorten the visible pocket-call label.
- Run all test/build/browser commands through `flock /tmp/qcc-test.lock`; Chromium only, `--workers=1`.
- Use ports 46xx for Playwright; never 4173.
- Commit in chunks as the configured Charlie Grant; `git push origin HEAD` at least every 30 minutes and at the end. Never print or commit secrets, force-push, rebase, deploy or change schema.

## Review focus

- Pool potted-ball displays must remain both before and after group assignment.
- Turn, foul, scratch and win/loss state must remain clear.
- Removed visible instructions must not remove accessible names/descriptions.
- Start, restore and end overlays must keep actionable buttons and score/result state.
- No CSS, control restyling, simulation or persistence-format changes.

## Tasks

- [x] Audit every `src/games/*` UI and map existing copy assertions; capture before screenshots of Pool, Claimline and Crossy Road. Retake assigned-group Pool comparison with the corrected save fixture.
- [x] Update existing copy assertions for minimal pool state, results and preserved help/accessibility; avoid tests that just mirror text deletions.
- [x] Remove unsolicited explanations and shorten redundant status strings, retaining meaningful game state and gameplay controls.
- [x] Run locked typecheck, full Vitest, build and affected Chromium specs using port 4618 and one worker.
- [x] Capture matching after screenshots in `/workspace/qcc-copy-shots/`; inspect the images and run independent code review.
- [x] Record per-game changes, verification and screenshot paths; commit and push the reviewed change.

## Execution record

- Resumed from clean WIP `1830a88`. Ran `flock /tmp/qcc-test.lock npm ci` before other commands; fetched origin and merged `origin/main` (already up to date).
- User supplied the execution method and complete copy brief; implementation stays inline in this clone with independent review at the end.
- No new gameplay or styling work. Existing tests and matching before/after screenshots cover this reversible copy cleanup.
- Copy changes and browser-fixture updates were committed and pushed in chunks through `1b38147`; per-game inventory is in `docs/STRIP_FLUFF_COPY.md`. The final documentation commit records completed verification.
- Full locked Vitest: 183 files / 4,053 tests passed. Final typecheck and build passed after the last footer-copy removal. All commands used the shared lock.
- Independent source review found one remaining Minesweeper first-play callout; removed it and its dead references in `a0e51da`. Reviewer confirmed no remaining Critical/Important findings.
- Final Chromium run: 113 passed, one worker, port 4618. Stale Crossy selectors and a Minesweeper mount-readiness fixture were corrected. Headless Chromium lacked WebGL2 in this container; direct probes confirmed headed Chromium on Xvfb supports it, and the complete final suite passed in that mode.
- Screenshot fixtures leave the game before seeding local storage, so unload saves cannot overwrite the staged state. Matching baseline/final Pool, Claimline and Crossy images were captured in the same headed browser mode; current source was restored. All 23 games mounted without browser errors. Requested Corn tips still show/dismiss; Pool pots remain before/after assignment. Images and logs are in `/workspace/qcc-copy-shots/` and the key images were visually inspected.
