# Study Mode implementation plan

**Goal:** Choose one of 20 NCEA-related revision topics per browser session; Escape pauses and saves any game and immediately opens a complete local textbook chapter. Return restores the same game instance.

**Architecture:** Keep the existing Vite/TypeScript shell and game API. Eagerly bundle original articles and accessible inline SVG diagrams. A small Study view owns topic selection and reading; the shell owns pause, save, focus, dialogs and game lifetime. No game API changes are needed. Review led to two isolated paused-render adapter fixes and one rules-text correction from the original game owners.

**Decisions:** First visit to each tab shows a topic chooser before gameplay. The choice survives reload through sessionStorage, with an honest memory fallback. Reading never unmounts the game. Return resumes a previously running game, preserves a manual pause and does not resume a hidden tab. Escape in the article stays in the article; it never toggles straight back into play. Native menu/rules dialogs and unfinished game loads must obey the same pause gate. Article selection is local and immediate. These are implementation choices within the supplied request, not additional features requiring approval.

**Content:** English (close reading, essays, poetry, film); Maths (linear relationships, quadratics, trigonometry, probability); Science (forces, energy, acids/bases, inheritance, ecosystems); History (evidence, Te Tiriti, causes of WWI); Geography (flood risk); Economics (supply/demand); Digital Technologies (algorithms); Health (hauora). Original explanations, worked examples, self-checks and diagrams; general NCEA revision, without inventing standard numbers or assessment guarantees.

## Tasks

- [x] Add typed article data and 20 inline diagrams in `src/study/`, plus unit tests for catalogue coverage and safe session-only persistence.
- [x] Add the first-visit chooser and full-page reading view with topic selector, accessible contents, self-checks and a discreet Return to Arcade button.
- [x] Integrate capture-phase Escape, synchronous pause/save, retained DOM/instance, modal suppression, late-mount gating and focus restoration in `src/main.ts`.
- [x] Extend the shared Playwright fixture and production offline/update harnesses for deliberate first-visit selection; retain all existing gameplay assertions.
- [x] Test all 20 articles, all 12 game returns, saved-state stability, repeat Escape, open dialogs, delayed imports, manual pauses, blocked storage, fresh tabs and offline root/subpath builds.
- [x] Obtain independent review as required by AGENTS.md; fix important findings, run the full unit/browser/build checks, inspect screenshots at 390/768/1366 and record actual browser/hardware limits.
- [x] Update architecture, evidence and the deployment archive. Publish source to GitHub main under the existing authorization; verify the automatic Netlify production deploy matches that source commit. Source `2dbfce1`, ready deploy `6ad5fcc65c43d750cebd7d5c`.

## Review focus

Input while a drag/turn/pour is active; Escape during a delayed module mount; queued dialog-close events; sessionStorage unavailable or malformed; a background tab returning from Study. Verify same-instance identity as well as serialized game state. No requests, loading screens or game clock advances on a Study switch.

## Verification

`npm test`, `npm run check`, `npm run build`, `npx playwright test --project=chromium`, `npm run verify:offline`, `npm run verify:update`, SVG validation. Run WebKit if installed; record absence explicitly. Chromium desktop/keyboard/viewport tests are useful proxies, not physical Chromebook or Mac testing.
