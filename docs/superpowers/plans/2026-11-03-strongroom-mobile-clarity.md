# Strongroom mobile viewport and clarity fix

User scope: fix landscape Safari coverage and washed-out scene on game/shooter; retain HUD B styling; local 46xx ports, no push/deploy; commit as Charlie Grant <grantcharlie1000@gmail.com>.

- [x] Inspect clean baseline and trace shell, stage, renderer and lighting ownership.
- [x] Capture pre-change 844×390 DPR3 Chromium/WebKit and production geometry, plus deterministic scene frames.
- [x] Reproduce resize/safe-area failures with regression checks before changing code.
- [x] Make the Strongroom viewport ownership explicit; size renderer from the actual CSS root, preserve adaptive DPR caps and handle orientation/toolbar changes.
- [x] Reduce excessive indirect light/exposure, distant fog and high-tier bloom; retain readable daylight and the existing cheap tier budget.
- [x] Capture identical AFTER poses, quantify scene luminance/contrast and verify no bars/control clipping on mobile WebKit/Chromium and injected notch safe areas.
- [x] Independent review, unit tests, check/build, document evidence and commit without push.

Initial baseline: static 844×390 canvas fills the viewport in current Chromium and WebKit. No fixed aspect-ratio wrapper exists in this worktree. The current renderer instead sizes from visualViewport independently of its CSS root, and the HUD uses heavy edge scrims. Physical Safari/#83 screenshot is not provided; avoid claiming a static letterbox reproduction that did not occur. Check production and toolbar/offset behavior before assigning the cause. Nearby walls are before the fog near plane; excessive white fill and exposure are a concrete washout cause.


Verified outcome (baseline `9ee75b6`):

- The stale visualViewport regression first failed at canvas x=48; the fixed playfield covers x=0/y=0 and the real CSS viewport. Native dynamic viewport sizing owns the wrapper, with small-viewport and shared JavaScript pixel-height fallbacks. The renderer follows the root rectangle and retains each tier's DPR and adaptive scale caps.
- Safari's physical #83 screenshot was not supplied or reproduced. Static baseline Chromium, WebKit and production WebKit already filled 844×390; the demonstrated four-edge inset uses injected stale toolbar geometry, not a claim of physical-device reproduction.
- Exposure falls 1.45→1, key light 3.4→2.8, cheap hemisphere/ambient 2.4/.9→1/.18, high extra fill 2.2/1→.6/.12 and high bloom .09→.025. Distant fog is lighter in density; no new passes, shadow maps, textures or geometry are introduced. HUD B match styling is unchanged.
- Matched 844×390 DPR3 corridor frames: potato encoded mean 0.74382→0.41800, normalized RMS contrast 0.16858→0.40751; high mean 0.53731→0.30781, contrast 0.34202→0.44124. The metric is encoded Rec.709 luminance, with contrast=standard deviation/mean, over scene-only frames. Linear-light means and percentile ranges are recorded separately.
- Pixel evidence, scripts, geometry metadata and test logs remain outside git at `/workspace/qcc-shooter-work/shots/r4/`; The scoped R4 result is in `/workspace/qcc-shooter-work/REPORT.md`. Both scene improvements are asserted by `analyse.py`; 106 HUD text samples meet their small/large text contrast thresholds.
- Full units: 3,584/3,584 in 184 files; check and build pass, offline pack 210 files / `4c0f70488e37`. Seventeen Chromium cases were verified across the broad run and isolated medium-quality rerun. The final viewport checks use the iPhone user agent with explicitly pinned 844×390 DPR3, toolbar height changes, a portrait round trip, and injected 47px side/21px bottom safe areas; WebKit separately covers mobile resizing and stale geometry. An initial medium Prep timeout remains documented rather than hidden.
- Independent source and image review found no Important issue or unreadable-dark overcorrection. Outdoor and corner captures were inspected for obvious clipping; these static checks do not certify dynamic far-plane popping or physical Safari.
