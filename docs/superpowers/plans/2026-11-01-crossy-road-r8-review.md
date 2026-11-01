# Crossy Road r8 / r8b execution record

Base: `9c560e5`. Charlie's phone performance feedback takes priority alongside the update-verifier and fidelity corrections. Keep the QCC floating glass, full-screen native-DPR default, original proportions and UFO. No push, merge, deploy, remote database action, protected worktree access or committed PNGs.

## Work and validation

- [x] Measure the unchanged runtime at DSF3, touch/mobile viewport and 4× CPU throttling for about 20 seconds; save raw before metrics and CPU profile outside git.
- [x] Correct the verifier's visible menu path for current floating chrome while retaining the legacy-release path. Run the complete update verifier without removing assertions.
- [x] Reduce GPU/CPU work based on the profile: directional shadows, instance uploads, resize guards, adaptive DPR hysteresis, allocation reuse, pooling and disposal. Keep 120 ms hops and check visible shadows against r7.
- [x] Keep one hop per gesture: pointerdown begins the take-off squash on the next presentable frame; a clear swipe commits on pointermove, a tap on release. No second forward hop is inserted before a sideways swipe. Logical forward movement remains release-based; this is an explicit limit against the literal pointerdown-hop request.
- [x] Introduce a new generation revision for denser 2–4-cell logs and lane paint variety, retaining revisions one through three unchanged. Keep grass banks and the full 2,000-seed fairness sweep.
- [x] Make every r8 capture fixture obey river grass banks; capture all three viewports, deaths, menus and details, and inspect against r7 and t047/t105/t119.
- [x] Run type-check, full unit tests, full Chromium browser suite, targeted Crossy/online/viewport, isolated Crossy Study, update verification and WebKit Crossy sanity if installable. Restore generated evidence before each local commit.
- [x] Independent read-only review, final measurements and short report.

## Baseline

`/workspace/qcc-crossy-review/perf/before.json` and `before.cpuprofile` record a natural seed-7 auto-hop run. Chromium uses software SwiftShader, 390×844 at DSF3, touch, and 4× CDP CPU throttling; this is a repeatable stress environment, not physical-iPhone FPS certification.

The 26.65-second observed run (20 nominal seconds plus a major stall) reports frame times **33.3 / 66.7 / 6583 ms** p50/p95/max, one **202 ms** long task, and input-to-hop **45.7 / 101.4 ms** p50/p95. Raw JS heap grows from **8,728,208 to 9,405,604 bytes**. The natural bot attempts 44 hops, restarts three times and reaches row 11. Recorded steady-state renderer maxima: 26 calls, 7,608 triangles, 35 geometries and zero textures; it has already fallen to Low at DPR1.5. The high-to-low transition's DPR resize appears in the CPU profile; glass placement also performs avoidable layout reads. Subsequent measurements must disclose active DPR/quality and workload, rather than imply identical rendering cost.

## Review focus

Preserve old seed-only saves when changing palette size or log gap bounds; do not silently repaint every compact cyan. Keep the complete visible river block banked even in forced capture scenes. Adaptive quality must recover slowly, avoid allocation/shader churn and restore full native DPR when explicitly selected for captures. Shadow pooling must share GPU resources and release them on disposal. Touch changes must not turn one swipe into two hops accidentally. The verifier must handle home, in-game, Study-retained and legacy documents through visible accessible controls.

## Implementation and review

The expensive 4096² shadow framebuffer is replaced with projected voxel silhouettes, sharing each pool's geometry and instance transforms. A single stencil mark prevents overlapping faces/casters darkening one another. Native antialiasing, directional contrast and baked vertex shading remain. Painted body and fixed windows/wheels/cargo now share one instanced draw. The browser regression confirms unchanged frames upload **zero** instance buffers (baseline: 38), and checks actual grass/shadow pixels. Reused step/pose outputs eliminate the normal simulation's temporary objects. All meshes, shared geometries/materials and GL resources retain explicit disposal. There are no game textures, postprocessing passes or screen-space AO.

DPR begins native up to 3, adapts through 2.5 and 2 after sustained pressure, and permits automatic Low at 1.5 only after four further bad seconds at DPR2. Recovery requires eight good seconds per step. No shader/geometry tier churn accompanies the normal resolution steps. A landing boundary applies pending changes even during continuously buffered hops; its integration test failed at 1170px before the fix and passes at 780px after. Bounded long-frame samples also handle alternating slow/fast frames without permanently pinning native DPR.

Revision four restores lane paint (red/cyan/purple/green/blue/orange, yellow taxis), 2–4-cell logs with .55–.85-cell gaps and grass-banked river blocks. Every legacy fingerprint for revisions 1–3 remains unchanged; new revision-four pins are separate. The 2,000×400-row fairness sweep passes. Capture fixtures obey the same bank requirement and assert both banks around every nearby river block.

Independent read-only review found and prompted fixes for queued-hop adaptation starvation, ignored alternating slow frames, mismatched benchmark generation revisions, and untracked-file hash omissions. The final review reports no remaining important findings. Comparative probes now pin revision three / seed 7, disclose actual attempted inputs and active DPR, and fingerprint tracked plus untracked source contents. Chromium SwiftShader / CPU4 results cannot certify physical-iPhone 60fps.

The full Chromium suite on `7976c47` completed **1,050 passed / 1 opt-in screenshot case skipped** in 25.5 minutes. No assertions were weakened. Following the one-sided shadow optimisation, all **70 Crossy/online/viewport** cases and the isolated Crossy Study case pass on Chromium. A DSF3 pixel comparison of redundant-face culling changes only 25 of 2,962,440 pixels, with maximum channel delta 7 at antialiased edges; the GPU regression fails before the change and passes after.

## Final measurements

Runtime/capture source: `8bc9f1c`. Files are outside git under `/workspace/qcc-crossy-review/perf/`: unchanged `before.json` / `before.cpuprofile`, and final `after.json` / `after.cpuprofile`. Both natural runs use revision-three seed 7, mobile 390×844 / DSF3 / touch / CPU4, and the same bot policy; both attempted 44 hops, restarted three times and reached row 11. Scheduling is measured, not forced to match timestamps. The regression retention phase separately uses revision four.

| Metric | Before | After |
| --- | ---: | ---: |
| Recorded duration | 26,649 ms | 20,119.6 ms |
| Frame p50 / p95 / max | 33.3 / 66.7 / 6,583 ms | 33.3 / 66.8 / 216.7 ms |
| Long tasks: count / total / max | 1 / 202 / 202 ms | 5 / 435 / 154 ms |
| Pointerdown → hop p50 / p95 | 45.7 / 101.4 ms | 50.1 / 139.3 ms |
| JS heap start → end (bytes) | 8,728,208 → 9,405,604 | 9,772,200 → 9,746,852 |
| Maximum calls / triangles | 26 / 7,608 | 33 / 12,780 |
| Maximum geometries / textures | 35 / 0 | 18 / 0 |

The baseline renderer had already dropped to Low/DPR1.5 at every recorded sample. The after run retains High/DPR2.5 and 2 before the sustained-load Low/DPR1.5 fallback, preserving directional shadows throughout. Calls and triangles therefore include more visible shadow/detail work than the baseline Low samples. These results show removal of the multi-second stall and bounded memory, **not** a demonstrated 60fps or lower input p95. The CPU4 software probe still has frame drops; real mid-iPhone 60fps needs device testing. Taps retain release commitment to preserve one directional move per gesture; press feedback begins on pointerdown and swipes commit before release.

`PERF_LABEL=after PERF_HOPS=300 npm run perf:crossy -- --check` passes the draw-call, tolerant CI frame-time and retained-resource budgets. After 300 forced hops and GC, heap grows **156,860 bytes / 0.150 MB**, from 8,319,248 to 8,476,108 bytes, with bounded geometry count. Final native-DPR captures have at most **42 draw calls**, including projected shadows.

## Final captures and visual review

`/workspace/qcc-crossy-review/r8/manifest.json` is complete, containing 48 views plus the separate native 420×480-device-pixel DSF3 crop. Phone buffers are 780×1688 (DSF2) and 1170×2532 (DSF3); PC is 1366×768. Every view asserts full-screen placement, antialiasing, native High DPR, the Crossy Road worktree title/marker and grass immediately around nearby river blocks. Capture and performance content hashes agree, including new source files.

The comparison seeds remain **11** for start and **7** for mixed/details/deaths. The natural mixed scene is row **418**, with grass 418, log river 419, lily 420 and grass 421; the triple crossing is rows **25–27** viewed from row 24. Idle UFO uses naturally open row **6**, avoiding the scroll leash beating its real seven-second timer. All car/truck/train/water/swept/UFO-idle/UFO-behind captures reach their asserted live death animation.

Viewed the final phone views, PC start/mixed, native DSF3 edge crop and reference t047/t105/t119/t050, alongside r7. Long logs now cover most of their row with small water gaps; red, blue, orange, purple, green, cyan and yellow traffic are supported instead of forced cyan compacts; the natural scene and junction fixtures expose full grass banks. Truck silhouettes stay inside their road, and the row pitch/framing, floating shared glass and UFO presentation remain intact. Native voxel edges are sharp at 100%. The projected shadows keep the rightward rectangular silhouette and contrast; raised-surface self-shadowing remains an approximation of the earlier shadow map.

## Final checks

- `npm run check`: pass on final runtime.
- `npm test`: **171 files / 3,878 tests passed**, including 2,000-seed fairness and revision 1–4 pins.
- Full `ARCADE_URL=http://127.0.0.1:4190 npx playwright test --project=chromium`: **1,050 passed, 1 existing opt-in screenshot test skipped** on `7976c47` (25.5 min). The subsequent caster-culling change is verified by the final scoped run below, including its new regression.
- `ARCADE_URL=http://127.0.0.1:4190 npx playwright test tests/games/crossy-road tests/leaderboard/online.spec.ts tests/e2e/viewport.spec.ts --project=chromium --workers=2`: **70 passed** on final runtime.
- Crossy Study case alone, Chromium / workers 1: **1 passed**. No assertion was relaxed for load.
- `npm run build`: pass; offline pack 183 files, version `ab0eaacee258`.
- `ARCADE_UPDATE_EVIDENCE_DIR=/workspace/qcc-crossy-review/r8-ci/final npm run verify:update`: pass, both root and subpath scenarios, retaining the existing ownership/update assertions. Its own loopback fixture uses 4181; the game/dev/capture server remains 4190 and protected ports were never used.
- WebKit install attempted, then host-dependency install attempted: unavailable. The browser dependency validator reports missing libraries; the Debian mirror returns HTTP 500 during installation. No WebKit pass is claimed.
- All evidence PNGs stay outside git; regenerated tracked/untracked evidence from the full suite is restored/removed before commits. Poster and migration are unchanged. No push, merge, deploy or database action.
