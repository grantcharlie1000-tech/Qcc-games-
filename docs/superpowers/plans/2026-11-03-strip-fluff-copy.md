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
- Pool: remove open-table/banner copy, potted-ball captions, unassigned group text, gesture/placement explanations and inline help. Below the table show only `Foul` or `Scratch` on a foul; keep results in the existing player heading and accessible status.
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

- [ ] Audit every `src/games/*` UI and map existing copy assertions; capture before screenshots of pool start/mid-game, Claimline and Crossy Road.
- [ ] Update existing copy assertions for minimal pool state, results and preserved help/accessibility; avoid tests that just mirror text deletions.
- [ ] Remove unsolicited explanations and shorten redundant status strings, retaining meaningful game state and all controls.
- [ ] Run locked typecheck, full Vitest, build and affected Chromium specs using port 4618 and one worker.
- [ ] Capture matching after screenshots in `/workspace/qcc-copy-shots/`; inspect the images and run independent code review.
- [ ] Record per-game changes, verification and screenshot paths; commit and push the reviewed change.

## Execution record

- Resumed from clean WIP `1830a88`. Ran `flock /tmp/qcc-test.lock npm ci` before other commands; fetched origin and merged `origin/main` (already up to date).
- User supplied the execution method and complete copy brief; implementation stays inline in this clone with independent review at the end.
- No new gameplay or styling work. Existing tests and matching before/after screenshots cover this reversible copy cleanup.
