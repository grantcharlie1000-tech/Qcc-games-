# Round 11 pass 2 — Apple material refinement

Implement the supplied side-by-side review in the existing branch; no push or PR changes. Movies and all game logic remain untouched.

## Review focus

- Uniform home lens coverage at DSF 1 and 2; compare repeated input content across both halves.
- Stronger inward bezel with monotonic sample positions (no folds); legacy Movies field unchanged.
- Brightened dark surfaces and white light surfaces retain 4.5:1 glyph contrast.
- Pointer press lifts and clears; reduced motion and opaque accessibility modes remain effective.
- Final evidence uses production preview, equal-scale Apple controls, all 44 views and crops, plus both presses.

## Tasks

- [x] Diagnose home coverage using computed geometry and repeated backdrop. Add a rendered regression if a layer or profile defect is found.
- [x] Add convex-field monotonicity/strength tests; tune arcade-only optics and shared material; inspect representative dark/light captures at both densities.
- [x] Extend capture script for held press states. Regenerate comparison at equal control height and iterate visuals.
- [x] Run check, unit tests, build, focused glass/dock specs, then every Chromium spec. Independently review the diff and fix material issues.
- [x] Capture all final images against preview 4173, restore generated tracked evidence, commit locally, update and print the existing Round 11 report section.

Execution is inline under the user’s explicit instruction to complete this pass. Existing branch and worktree are the authorized workspace. Baseline: 1361218. Pass-1 external evidence preserved in round-11-pass1.

## Verification record

Check, 3,270 unit tests in 160 files, and build passed. Focused Chromium: 211 passed. Final complete Chromium: 964 passed, 0 failed, 3 flaky, 1 optional screenshot skip across 81 specs (968 cases). Three existing Movies focus/motion cases passed on retry; no Movies files changed. Full results and source screenshots live in /workspace/qcc-liquid-glass/round-11.

Independent review found and verified fixes for quantised cap folds at DSF 3, pale-control hover ink and a nonnumeric press-capture guard. The final field passes all four bilinear-cell Jacobian checks across five geometries at DSF 1/2/3. Movies fields/rendering were independently checked unchanged.

The first full run exposed a Pool test reading its aspect ratio before the browser delivered the orientation event. It now waits for the existing data-portrait state; all original gameplay/geometry assertions remain. The complete Pool spec passed 18/18 across three repeats. No game source changed.

Final evidence: 44 production views, 44 crops, two held presses; zero page/capture errors and no horizontal overflow. All crops and the equal-height Apple comparison were opened. Native material parity is not claimed; the external report records the remaining visual differences.
