# Strip instructional game copy

> Execution: use the executing-plans skill in this session, with independent review at the end.

**Goal:** Apply Charlie's supplied copy brief to every game, preserving essential state, controls, accessibility, settings and explicitly opened help.

**Architecture:** Edit visible strings and their markup in existing game modules. Remove references to deleted copy elements; keep simulation, persistence formats, CSS and control styling unchanged.

**Tech stack:** TypeScript, Vite, Vitest, Playwright Chromium.

**Spec:** User's task in this session, including `/workspace/codex-briefs/pool-fluff.jpg`.

## Constraints

- Work in `/workspace/qcc-copy` on `chore/strip-fluff-copy` from `main`.
- Text/markup only; no CSS, gameplay, features or migrations.
- Keep titles, buttons, scores, timers, levels/lives, results, errors, accessibility and settings labels.
- Preserve dedicated help screens. Remove empty copy wrappers in markup/TS.
- Use ports 46xx for Playwright; never 4173.
- Commit as Charlie Grant <grantcharlie1000@gmail.com>; do not push or print secrets.

## Review focus

- Pool potted-ball displays must remain both before and after group assignment.
- Turn, foul, scratch and win/loss state must remain clear.
- Removed visible instructions must not remove accessible names/descriptions.
- Start, restore and end overlays must keep actionable buttons and score/result state.
- No CSS, style, layout, simulation or persistence-format changes.

## Tasks

- [ ] Audit every `src/games/*` UI and map existing copy assertions; capture before screenshots of pool start/mid-game, Claimline and Crossy Road.
- [ ] Update existing copy assertions and add focused browser coverage for minimal pool state and preserved help/accessibility.
- [ ] Remove unsolicited explanations and shorten redundant status strings, retaining meaningful game state and all controls.
- [ ] Run typecheck, build, full Vitest and all Chromium specs for touched games using `ARCADE_URL=http://127.0.0.1:4618`.
- [ ] Capture matching after screenshots in `/workspace/qcc-copy-shots/`; inspect the images and run independent code review.
- [ ] Record per-game changes, verification and screenshot paths; commit the reviewed change as Charlie without pushing.

## Execution record

- Initial branch is clean and `HEAD` equals `main` (`f31711e`). Dependencies already exist. User specified this checkout/branch, so work stays here.
- Dev server uses port 4618 because 4600 was already occupied.
