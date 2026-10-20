# Pool verifier readiness correction

Test/verifier-only follow-up to the captured focused control failure. No product source, worker, storage, game logic, shot expectation, existing threshold, or skip is changed. The original uninstrumented Pool failures retain their separate evidence; this correction does not prove their exact cause.

`verify-offline.mjs` uses `pool-verifier-shot.mjs` only for Pool. The original hover remains. Before targeting, the helper observes the actual canvas rectangle on animation frames for at most15 seconds, bounded by both browser and Node timers. It requires three consecutive identical rectangle/layout samples, no running/pending stage-subtree animations, and the host's fitted width/height/scale to match the current available and natural dimensions (the same formulas used by `viewport-fit.ts`). This is a conditional layout prerequisite, not a fixed frame delay or a shot retry.

Explicit state assertions require a connected table, visible document/canvas, app not inert, Pause-game label, hidden pause overlay, and Pool `aim`/`idle`/zero shots. They fail rather than unpause, resume, restart, change a player, or modify the product. No additional human-turn predicate is introduced. Rectangles must be finite and nonzero. Readiness never reads for one successful shot.

The final actual rectangle supplies the same native225/840→135/840 horizontal eight-step pull. After the target mouse move, the helper asserts that the exact rectangle/layout and prerequisites still match immediately before mouse-down. A change fails before down; it never retargets or retries. Mouse-down, eight moves, mouse-up and the immediate strict `data-shots === '1'` assertion remain. There is no wait for a zero count to become one.

`tests/games/pool/verifier-readiness.spec.ts` is automatically included by the existing Playwright `**/*.spec.ts` discovery in Chromium and WebKit. The workflow's explicit native diagnostic-helper command stays unchanged. The four cases use the actual mounted Pool game and real trusted pointer events:

- A temporary DOM-only canvas animation makes a saved rectangle stale. Original coordinates produce an actual aim and strict0≠1 failure. After a real restart, the frame predicate observes motion, and corrected actual geometry must produce a real pull and one shot.
- A continuously animated real table must fail the15-second readiness bound without a shot attempt.
- A fixture-only target-move listener shifts the table after targeting; the helper must fail before down without retargeting.
- A capture-only, one-release suppressor records an actual accepted pull/75% power, then blocks only that native release from reaching the product handler. The shared verifier must still throw immediate strict0≠1. No model or shot counter is mocked to a success.

Animations/suppression are disposable regression fixtures, not claims about the exact original mechanism. There are no product callback wrappers or response/source patches. The focused paired driver is kept separately under scratch, outside this publication delta, and imports the same preparation helper for candidate567 and main1fb; it retains the reviewed Pool lifecycle and passive diagnostics while omitting prior unrelated routes. One paired outcome cannot establish intermittent update-specificity or full acceptance.

Preparation checks are static only. New browser/helper-negative execution is held for exact Astra review. Proposed commands after review:

```bash
npx playwright test tests/games/pool/verifier-readiness.spec.ts --project=chromium
# Hosted normal browser suite also runs these cases in WebKit; no installer retry.
node /workspace/scratch/qcc-update-validation/main1fb/pool-readiness-focused-driver.mjs
# Parent then coordinates full original offline/update/browser validation.
```

Use the established XDG browser directories for local execution and a new exclusive evidence directory. Preserve all prior logs, JSON, PNGs and profiles. Passing fixtures or focused actions do not erase prior failures or authorize merging.
