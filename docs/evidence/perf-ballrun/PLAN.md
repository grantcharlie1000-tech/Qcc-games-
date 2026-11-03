# Ball Run performance follow-up

Scope: Ball Run source/tests, the existing perf harness, and this evidence directory.
No shared shell, glass, leaderboards, Crossy, e2e, CI, PR, or merge changes.

1. Capture an untouched production baseline with `--ballrun-only`; commit/push it.
2. Retain road geometry between updates, reuse buffers and static obstacle transforms,
   suppress unchanged DOM writes, remove frame-time layout reads/allocations, and
   adapt the existing DPR budget. Preserve course generation, physics, visuals, input,
   and shell integration. Add focused regression tests and independent code review.
3. Run TypeScript and only Ball Run unit tests, then commit/push implementation.
4. Rebuild and repeat the same phone/desktop measurement; summarize and push evidence.

All builds, tests, and measurements use `flock /tmp/qcc-test.lock`, sequentially.
The harness owns and stops one preview and one Chromium browser at a time.

Baseline: phone 19.03 FPS / 166.7 ms p95; desktop 20.91 FPS / 200 ms p95.
The separate CPU profiles are dominated by shared-shell `getImageData` calls;
Ball Run's road bar/transform work and DOM updates also appear. Shell readbacks
remain outside the authorized scope. These are SwiftShader measurements, not
physical phone/GPU results.
