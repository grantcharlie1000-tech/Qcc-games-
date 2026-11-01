# Crossy Road r8 / r8b execution record

Base: `9c560e5`. Charlie's phone performance feedback takes priority alongside the update-verifier and fidelity corrections. Keep the QCC floating glass, full-screen native-DPR default, original proportions and UFO. No push, merge, deploy, remote database action, protected worktree access or committed PNGs.

## Work and validation

- [x] Measure the unchanged runtime at DSF3, touch/mobile viewport and 4× CPU throttling for about 20 seconds; save raw before metrics and CPU profile outside git.
- [x] Correct the verifier's visible menu path for current floating chrome while retaining the legacy-release path. Run the complete update verifier without removing assertions.
- [x] Reduce GPU/CPU work based on the profile: directional shadows, instance uploads, resize guards, adaptive DPR hysteresis, allocation reuse, pooling and disposal. Keep 120 ms hops and check visible shadows against r7.
- [x] Keep one hop per gesture: pointerdown submits the take-off squash immediately; a clear swipe commits on pointermove, a tap on release. No second forward hop is inserted before a sideways swipe. Logical forward movement remains release-based; this is an explicit limit against the literal pointerdown-hop request.
- [x] Introduce a new generation revision for denser 2–4-cell logs and lane paint variety, retaining revisions one through three unchanged. Keep grass banks and the full 2,000-seed fairness sweep.
- [ ] Make every r8 capture fixture obey river grass banks; capture all three viewports, deaths, menus and details, and inspect against r7 and t047/t105/t119.
- [ ] Run type-check, full unit tests, full Chromium browser suite, targeted Crossy/online/viewport, isolated Crossy Study, update verification and WebKit Crossy sanity if installable. Restore generated evidence before each local commit.
- [ ] Independent read-only review, final measurements and short report.

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
