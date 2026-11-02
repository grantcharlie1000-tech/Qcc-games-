# Strongroom Round 3 verification

Implemented on `game/shooter` in `/workspace/qcc-shooter`. Runtime source: `b9eb2d1`. No push/deploy, other worktree/session changes, environment-file changes, Netlify/functions changes, production DB/schema changes or ads changes.

The approved direction B HUD, daylight renderer, designer operators/arms, Customs House M2 rounds/objective and host-authoritative M3 destruction are implemented. Original HUD SVGs and local Barlow Condensed/OFL assets are included. M4 gadgets and M7 art/audio/device acceptance remain separate milestones.

## Commits

- `7ebf09b`: approved outline match HUD.
- `c69474a`: daylight and textured quality tiers.
- `a5459d4`: Customs House rounds and authoritative objectives.
- `34d73d6`: bounded destruction rendering and breach tools.
- `588e626`: designer operators and real weapon LODs.
- `03a775b`: Pick and tactical match feedback.
- `ba5cf2b`: live HUD feedback and objective tracking.
- `122050c`: round flow and reliable online breach verification.
- `54a0ddb`: final daylight tint, HDR warm-up, painted Pick/orientation and visual polish.
- `b9eb2d1`: objective/ammo touch ownership above the look gesture plane.

## Final checks

- `npm run check`: passed.
- `npm test -- --maxWorkers=2`: **184 files / 3,584 tests passed**, 114.44 s.
- `npm run build`: passed; **210-file offline pack**, version `04af97ed04e2`. Existing large-chunk advisory remains.
- Serial Chromium run: **24 passed, zero failed/skipped, 9.1 minutes**: 21 Strongroom, one Blockcraft and two Pool cases.
- Strongroom covers all three HUD sizes, no HUD glass, changed-text caching, touch hit ownership, long feed/control separation, actual low/medium/high paths, GPU operator colours/LOD/arms, Pick, held crouch/orientation, Study, ten mount/unmount cycles and normal/impaired/relay online.
- Impaired online: all 60 movement cycles at 150 ms RTT / 5% unreliable loss, **902 reconciliations / 121.9 m / 0.0072 m p95 correction**; damage, real breach/hash parity, plant, Study/Away, pause/input reset and equal round results passed.
- Blockcraft full host/guest/late-joiner and world lifecycle passed. Pool completed a 21-shot rack, winner seat 1.
- Real CDP touch guests at 844×390 DPR3 and 667×375 DPR2 each completed the five-second plant. Host and guest wall hashes both equal `74b7c226`.
- Independent code review covered the model/authority/renderer integrations and later visual/input fixes. Important findings were fixed, including output-target shader warm-up and touch gesture interception. No Important code-review findings remain.

The online fixtures use real Room/PeerJS/WebRTC peers. Controlled poses and bot-fire suppression isolate human action assertions. Unit bot tests retain normal combat and complete full matches on both sides, with planting across ten seeded simulations. Browser Pick/Prep setup shortcuts do not replace the pure round-clock tests.

## Rendering and performance evidence

External root: `/workspace/qcc-shooter-work/shots/r3/`. Measurements use `54a0ddb`; the later `b9eb2d1` changes pointer stacking and its browser regression only, with no renderer/simulation/profiler change.

Chromium 156.0.8078.4, ANGLE Vulkan SwiftShader, Customs House seed 42, 844×390 DPR3 touch. Each row has a fresh browser, 15 s warm-up, approximately 60 s of normal Action with five bots and periodic local fire, and no competing tests/builds/browser jobs. Dynamic resolution remains active. JS heap excludes GPU/external allocations.

| Tier / CPU | Scale | Frames | FPS p50 / p95 / p5 | Frame ms p95 | Calls p50 / max | Triangles p50 / max | Heap MiB p50 / max | Breach ms |
|---|---:|---:|---|---:|---|---|---|---:|
| Potato 4× | .50 | 2,642 | 59.88 / 60.24 / 29.94 | 33.4 | 28 / 29 | 24,456 / 24,600 | 39.775 / 40.871 | .30 |
| Potato 6× | .60 | 2,523 | 59.88 / 60.24 / 29.94 | 33.4 | 28 / 29 | 24,456 / 24,600 | 39.823 / 41.088 | .20 |
| Low 4× | .55 | 2,340 | 59.88 / 60.24 / 20.00 | 50.0 | 30 / 31 | 27,818 / 28,106 | 39.881 / 41.044 | .30 |
| Low 6× | .50 | 2,146 | 30.03 / 60.24 / 20.00 | 50.0 | 30 / 31 | 27,818 / 28,106 | 39.903 / 41.202 | 1.20 |

Each measured breach removes 12 cells and includes model/collider/dirty-render sync, excluding GPU execution. Two active destruction draws and program count 39→39 were recorded. The renderer has five fixed wall batches and one debris batch. Peak used JS heap stays below the 150 MiB target. The low-tier 20 FPS slow tail does not meet a 30 FPS target. These software/adaptive-resolution samples do not certify physical Chromebook/iPhone hardware or fixed-resolution cross-tier speed.

## Matched lighting and polish

BEFORE was captured first from untouched `5af2099`, AFTER from `54a0ddb`. All four provenance records match map, camera, seed, viewport/DPR and render dimensions: Harbor, seed 42, position [40,1.62,24], rotation [.018,.045,0,YXZ].

| Tier / viewport | Encoded Rec.709 mean 0–255 before → after | Linear relative luminance before → after |
|---|---|---|
| High / desktop | 66.375 → 142.097 | .16500 → .35136 |
| High / phone | 56.873 → 133.557 | .13437 → .31660 |
| Potato / desktop | 138.185 → 214.324 | .32060 → .69446 |
| Potato / phone | 144.102 → 215.215 | .33678 → .69682 |

Full-size `lighting/before-*.png`, `after-*.png`, `compare-*.png`, provenance and `luminance.json` remain external. Final comparisons include the integrated renderer/art; the isolated original lighting pass is preserved separately.

The live nine-point audit passes **177 distinct surface/probe records, zero recorded issues/page errors**, with **10 text/underlay contrast pairs**, including all four bright outdoor frames. Thresholds are 4.5:1 for small text and 3:1 for large text. Both Chromium and WebKit 27.2 cover 42 painted secondary surfaces each at 390×844 DPR3, 320×640 DPR2 and 1366×768 DPR1 under both colour preferences. Five-height material samples cover all 84 secondary surfaces. No backdrop filter/glass appears on match HUD nodes.

The audit found and fixed transparent Pick/orientation surfaces, the Pick camera inside unspawned bodies, pale/tiny action text, long feed/control overlap, daylight team-colour washout, unreadable home dock ink, repeated objective writes, reduced-motion sheet transitions and objective/ammo interception by the look plane. RED→GREEN logs and before images are retained. The final touch hold was verified online after the hit-ownership correction.

Primary screenshots have `desktop-` (1440×900 DPR1), `phone-` (844×390 DPR3) and `iphone8-` (667×375 DPR2) prefixes. Suffixes include `home`, `lobby`, `room-lobby`, `pick`, `prep-reinforced`, `action-breach`, `busy-audit`, `cracker-planted`, `round-end`, `scoreboard`, `match-end`, `menu`, `settings`, `settings-bottom` and `guest-online`. Visual fixtures arrange poses and pause simulation for reproducibility; guest captures use real online input. See external `polish-audit/AUDIT.md`, `AUDIT_SHEET.jpg`, `analysis.json`, `material-samples.json`, `performance.json` and REPORT.md Round 3.

## Limits

- Successful TURN gameplay is unverified; both forced-relay tests pass the explicit unreachable-relay explanation with no direct fallback.
- WebKit's surface audit passes, but earlier combined dialogs/Leave diagnostics stalled presentation/RAF in this Linux runner. Its full gameplay lifecycle and physical Safari are not certified.
- M4 unique gadgets/intel and reinforced-wall counterplay, PX-12 new art and remaining M7 audio/effects/30 m human readability tests are later work.
- No new aggregate download-size or root/subpath offline-restoration certification is claimed for R3. The build/offline manifest is green.

No screenshots, WebM or generated evidence JSON are committed. Public binary/font assets are actual game assets with retained provenance/licences.
