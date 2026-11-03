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
- No CSS, style, layout, simulation or persistence-format changes.

## Tasks

- [x] Audit every `src/games/*` UI and map existing copy assertions; capture before screenshots of Pool, Claimline and Crossy Road. Retake assigned-group Pool comparison with the corrected save fixture.
- [x] Update existing copy assertions for minimal pool state, results and preserved help/accessibility; avoid tests that just mirror text deletions.
- [x] Remove unsolicited explanations and shorten redundant status strings, retaining meaningful game state and gameplay controls.
- [ ] Run locked typecheck, full Vitest, build and affected Chromium specs using port 4618 and one worker.
- [ ] Capture matching after screenshots in `/workspace/qcc-copy-shots/`; inspect the images and run independent code review.
- [ ] Record per-game changes, verification and screenshot paths; commit and push the reviewed change.

## Execution record

- Resumed from clean WIP `1830a88`. Ran `flock /tmp/qcc-test.lock npm ci` before other commands; fetched origin and merged `origin/main` (already up to date).
- User supplied the execution method and complete copy brief; implementation stays inline in this clone with independent review at the end.
- No new gameplay or styling work. Existing tests and matching before/after screenshots cover this reversible copy cleanup.
- Copy changes pushed in `2aaba3c`, `1a274c6`, `b10d357` and `a0e51da`; per-game inventory is in `docs/STRIP_FLUFF_COPY.md`.
- Full locked Vitest: 183 files / 4,053 tests passed. Initial typecheck and build passed. Final typecheck/build are queued behind the shared lock after the last Minesweeper markup change.
- Independent source review found one remaining Minesweeper first-play callout; removed it and its dead references in `a0e51da`. Reviewer confirmed no remaining Critical/Important findings.
- Initial Chromium run: 50 passed; stale Crossy menu/Study selectors and a Minesweeper menu-mount race caused three failures. Updated test fixtures to existing UI paths and readiness; final rerun is queued.
- Screenshot fixture correction: leave the game before seeding local storage, so unload saves cannot overwrite the fixture. The corrected Pool/Claimline baselines are saved and current source was restored. The original Crossy baseline remains available. `/workspace/qcc-copy-shots/verify-final.mjs` serializes final captures, all-game mounting, typecheck, build and affected Chromium specs under one shared lock. Screenshot failures are recorded without skipping code verification. Output logs live in `/workspace/qcc-copy-shots/`.
