# Crossy Road and Ball Run progress

The session task is the specification. Work stays on `perf/crossy-ballrun`.

Charlie’s priority change superseded the original plan: finish Crossy first, defer Ball Run, skip e2e/CI, validate with typecheck and Crossy unit tests, and take one Crossy-only after measurement.

- [x] Run `npm ci` once and capture the original production baselines, CPU profiles, renderer.info and heap samples; commit/push `00cd17bd`.
- [x] Crossy DPR budget and bounded streaming work; weighted seeded generation revision 5; infinite sideways rules, camera, terrain, hazards and save support.
- [x] Focused tests fail before implementation, then 27 pass; typecheck passes; commit/push `03b3743f` immediately.
- [x] Independent source review, both important findings fixed; update legacy unit expectations and add wide-world fairness/return-trip tests.
- [x] Crossy-only Vitest: 631 tests pass. Final typecheck and production Vite rebuild pass; commit/push `9031dfa4`.
- [x] One after benchmark for Crossy phone and desktop. Record the phone improvement and unresolved desktop regression honestly in SUMMARY.md. Preview stopped.
- [x] Final evidence and summary committed and pushed.

Ball Run source was never changed. No e2e/Playwright specs or CI were run after the priority change. All build/test/measurement commands were serialized under `/tmp/qcc-test.lock`; waiting for another job delayed the rush pass. No shared UI, glass, leaderboard, or other-game files were changed.
