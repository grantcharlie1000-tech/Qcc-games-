# Brook 900 verification

Source: d2a1614856f7163c5794ddf78a0223f6cc2f793446e811f655d3a01829b2458b (engine.ts, brook.ts, index.ts concatenated in that order).

- 128 focused tests passed across 14 files: npx vitest run tests/chess-ai tests/games/chess --maxWorkers=1. Report: .omc/state/chess-900-focused-final.json.
- npm run build passed, including TypeScript, Vite, host preparation and service-worker checks. Existing large-chunk warnings remain. Log: .omc/state/chess-900-build-final.log.
- Three real Chromium cases passed: 1440px game, 390px game, and actual Worker cancellation/recovery/emergency clock. Reports: .omc/state/chess-900-browser.json and chess-900-worker-timing.json. The normal reply sample took 359.5ms under the existing 500ms allowance. A 20ms remaining-clock request returned a legal move in 2.8ms. These are individual timing observations, not a speedup or physical phone benchmark.
- Screenshots: tests/games/chess/evidence/brook-game-1440.png and brook-game-390.png. These are dev-browser screenshots; they must not be labeled production-runtime proof.
- A production-preview check could not run: automatic approval review rejected the manual helper and test-runner-managed alternative as blocked by policy, without further explanation. The build succeeded; deployed/production-browser behavior is not claimed.
- The full unit suite finished serially with exit 1: 5634 passed, 17 failed, 7 skipped across 306 files, plus two Vitest worker onTaskUpdate RPC timeouts. All 128 chess tests across 14 files passed in that run as well. The repository-wide suite is not green. Reports: .omc/state/chess-900-full.json and chess-900-full.log.

The first focused run found an immediate-mate choice defect. It was fixed without relaxing the original test, then all 128 focused tests passed. The original lifecycle probe timed out loading the full app before initializing an engine; it now uses the existing small browser harness. The two actual game UI cases passed on both runs.

The 300, 500 and 700 profile lines and the complete legacy evaluator body were compared with the frozen original and are identical. Their worker compute cap remains 75ms; only 900 uses the larger allocation. No commits, pushes or deployment were made.

Both independent council reviewers approved the scoped implementation and retaining 900 as a provisional Chess.com rapid target. Gemini was excluded as requested. GPT Astra estimated roughly 800 to 1100; Claude Opus roughly 900 to 1200, both with low to moderate confidence. Full scores and thread links appear in the final handoff.

The review flags are calibration uncertainty and device-dependent search depth, different error patterns from humans, no competitive human match measurement, and incomplete opening/endgame corpus coverage. Nonblocking search weaknesses include hypothetical repetition/50-move blindness and possible quiet-leaf stalemate misvaluation. These observations did not change the frozen source. The emergency test deliberately accepts either a legal reply or a timely watchdog timeout; its recorded run specifically returned a legal move.

The stale aggregate browserExit value in chess-900-checks-final.json was corrected to 0 using the later successful report and status file. The decision trail has a handoff snapshot beside the benchmark evidence, avoiding a documentation dependency on the scratch directory.

## Full-suite failures

All failing tests are outside chess and outside the edited source. They were not fixed or suppressed. Six Last Light assertions match the failures already reproduced on an unmodified base in public/chess-engines/VERIFICATION.md. Baseline status for the other failures and runner timeouts was not established in this run. Host load may affect timing checks; it does not explain the deterministic assertions or prove any failure is transient.

| File under tests/ | Failed | Observed failure |
| --- | --- | --- |
| core/festive.test.ts | 1 | Existing Blockcraft audio source contains festive text prohibited by the assertion |
| movies/account-storage.test.ts | 1 | 5000ms timeout |
| pages/proxy.test.ts | 1 | 5000ms timeout |
| games/ball-run/christmas.test.ts | 1 | 5000ms timeout |
| games/blockcraft/light.test.ts | 2 | 3ms performance budgets exceeded |
| games/breachline/audio-pack.test.ts | 1 | spawnSync rm ENOENT on Windows |
| games/breachline/fighters.test.ts | 1 | Animation performance budget exceeded |
| games/color-blocks/fair-deal.test.ts | 1 | 5000ms timeout |
| games/crossy-road/revision6.test.ts | 1 | 5000ms timeout |
| games/crossy-road/terrain.test.ts | 1 | 5000ms timeout |
| games/last-light/campaign.test.ts | 1 | Stage 7 pickup/platform overlap |
| games/last-light/journey.test.ts | 5 | Opening dash and continuous-journey assertions |

Two additional runner errors were both [vitest-worker]: Timeout calling onTaskUpdate. The independent focused run and browser checks completed cleanly; the broader result must not be used to claim a fully passing repository.
