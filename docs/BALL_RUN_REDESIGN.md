> Current behavior: Hard is the only Ball Run mode. References to other difficulties below describe the historical redesign. Older non-Hard runs and records are discarded.

# Ball Run redesign checkpoint

Work is based on main `ceb61e3` in `grantcharlie1000-tech/Qcc-games-`, on branch `claude/ball-run-redesign`, which is pushed to origin. No pull request, merge, release or deployment has been made. The final verification ran on the final source and made one deliberate change, the evidence refresh; afterwards only the evidence PNGs and the documentation changed. The branch's work-in-progress snapshot commits are due to be rewritten into logical commits, so no branch SHAs are cited here.

Design: [spec](superpowers/specs/2026-10-23-ball-run-redesign-design.md). Plan and dated rulings: [plan](superpowers/plans/2026-10-23-ball-run-redesign.md). Current game: [SPEC.md](../src/games/ball-run/SPEC.md). Commands and measurements: [TEST_RESULTS.md](../src/games/ball-run/TEST_RESULTS.md). Skills: [SKILL_USAGE.md](../src/games/ball-run/SKILL_USAGE.md).

## What Charlie asked for

1. Redesign Ball Run from `Ball-Run-Reference.pdf` (a rebuild reference made from a 62-second Hard-mode recording), using pages 1–9 only. Page 10, a condensed coding-agent prompt, was set aside at Charlie's request. The brief is not distributed in the repository.
2. Slower acceleration and a much higher speed cap.
3. More obstacles, placed more randomly and harder to get through.
4. During the build: the cyan gates are a permanent speed boost.

## Result

Ball Run is rebuilt as pure modules (`config.ts`, `course.ts`, `model.ts`, `records.ts`), one Three.js renderer (`scene.ts`) and a new UI (`index.ts`, `style.css`). It plays like the reference: a magenta sphere rolls on its own along a suspended indigo grid road between lavender wireframe towers; the road curves, banks, narrows into ribbons, crests, dips and drops away; magenta blocks must be threaded at speed. The Hard setup panel, with a coral face badge, starts a run. The HUD shows the mode, the score and the next record to beat. A block hit bursts the ball, and Game Over shows today's, this week's and all-time bests for Hard. P pauses, R plays again, and Escape stays the shell's Study shortcut. No dependency, external asset, shader or post-processing was added, and the shell, leaderboard protocol and other games are unchanged apart from two button-name patterns in shared checks.

**Slower acceleration, much higher cap.** The old game went from 12 to 22 m/s in about 50 s. Now speed is `min(cap, sqrt(v0² + 2·a·d) + gain × gates passed)`:

Hard starts at 13 m/s, accelerates at 0.03 m/s², gains 3 m/s per gate and caps at 62 m/s. Gates arrive every 20–35 seconds.

**Obstacles.** Rows arrive every 0.48–0.9 seconds at full intensity, drawn from ten seeded patterns including sliding blocks. Every row leaves a route with an opening at least 1.45 m wide for the 0.76 m ball.

**Permanent gates.** Each gate is a full-width arch with cyan chevrons. Crossing it raises speed for the rest of the run; "Speed Up" and a short trail confirm it, and at the cap the label reads "Top Speed" and nothing is added.

## Design calls and rulings

The reference cannot reveal speeds, sizes or generation rules, so each number is a design call. Per-difficulty tuning and shared constants are in `config.ts`; generator shapes, margins and pattern sizes are constants in `course.ts`; camera and render numbers are in `scene.ts`; input and UI timings are in `index.ts` ([SPEC.md](../src/games/ball-run/SPEC.md) lists them). These are the calls and the rulings made during the build, with their reasons.

| Decision | Reason |
| --- | --- |
| Speed is `min(cap, ramp + gain × gates passed)`, gates scheduled by running time. | Charlie's permanent-boost request. Every gate spans the road, so a surviving run has passed exactly the gates behind it and speed stays a pure function of distance, which keeps the reachability guarantee exact. Time scheduling keeps the gates' share of the speed-up predictable. |
| "Speed Up" is 1.2 s of feedback only; at the cap it reads "Top Speed". | The gain itself is permanent; the label only confirms it. |
| Lateral authority grows with speed, `max(5, 6 + 0.16·(v − 12))` m/s. | High speed stays steerable, but each dodge costs more road. |
| Rows spaced in time, easing from an intro interval to full intensity over 500–700 m, with scheduled rests. | Density holds as speed climbs; early wins and rest beats (game-design guide). |
| Ribbons stay block-free; density recovered by tightening Medium and Hard row intervals and ribbon weights instead. | Reference page 04 shows clear ribbons. |
| Density asserted pooled over seeds 1–24 (0.6 / 0.9 / 1.3 blocks/s, 0.35 / 0.5 / 0.65 rows/s), every seed at 85 % or more. Hard rows/s lowered from the plan's 0.7. | Mandated clear road is 36 % of Hard running time; 0.7 rows/s was out of reach. |
| Row spacing is start to start, never sooner than 0.35 s after the previous pattern's last block. | Follows the spec's "a new row every …"; the end-to-start reading gave only 0.555 rows/s on Hard. |
| Segment kinds come from an exact-proportion credit scheduler; forced and substituted straights are charged to it. | The first weighted bag quantised the weights, and forced straights after gates pushed straights about 10 points over theirs; now the weights describe the road as built. |
| Bends sway at least 0.8 m (ribbon bends 0.6 m), kept possible by limiting offsets to ±1.2 m. | Every bend must read as a bend. |
| Blocks are posed on the road under them and extended down to stay seated; collision and rendering both use the pose's half sizes, never the nominal height. | A 14 m wall run floated 0.84 m on a slope, leaving a gap to roll under. |
| Openings narrower than the minimum gap never count as routes. | Enforces the spec's 2.0 / 1.7 / 1.45 m at almost no density cost. |
| Gate arch walls are solid but harmless (the ball rolls along them). | A visible wall rather than an invisible clamp (builder check). |
| Full steering in the air. | Matches the previous game; the generator's reach model holds in the air. |
| Lift-off only where the road curves away faster than gravity along the ball's line (ruling 2026-10-24). | A gate's speed step read as a launch. |
| Crest and dip lengths are not stretched with speed (ruling 2026-10-24). | Stretched crests almost never launched (1 of 621), but page 04 shows a drop and flight at speed. |
| Crest and dip height capped at `8·L/(π·v)` (launch at most about 8 m/s up); blocks kept out of every predicted flight from 5 m before take-off to 12 m past landing; a due gate deferred past a flight. | Unstretched crests then threw the ball up to 121 m and 10.8 m high, through arch roofs and onto blocks. |
| A crest or dip drawn under a predicted flight, or inside its zone, is built as a straight (ruling 2026-10-24). | Crest-then-dip pairs and touch-and-go hops gave 1.1–1.7 s chained flights. |
| A flight under 1 cm is not counted as a flight by the tests (the generator still clears a zone around it). | Invisible skims where the road falls within 0.3 % of gravity. |
| A drop's clear zone runs to 12 m past where the ball lands at the speed there. | Fast drops landed up to 23 m beyond the old zone, among blocks. |
| The test bot plans with the model's exact steering (lag and bank drift) instead of the plan's simple controller. | The simple bot died on every matrix course on passable road; an exact grid search proved the course passable. |
| Restore rejects distances over 1e6 m before touching the course. | Generating a course to the 1e8 m limit takes seconds and gigabytes. |
| Records commit exactly once when a run ends, by death or by shell Restart of a running run with a score; leaving mid-run is not an ending. Each commit sends one unthrottled score. | An abandoned run never loses its score, and throttling can never leave the shell RECORD and the all-time best disagreeing (builder check). |
| `setScore` at most every 250 ms while running. | One call per metre at 60 m/s would write storage dozens of times a second. |
| Records live only in the game's save. | The shell contract allows no storage of the game's own. |
| Version 1–3 saves discard their old best and run. Version 4 retains Hard records and compatible Hard runs only. | Earlier courses and records are not comparable to Hard. |
| Home returns to the game's own setup panel. | The shell's back arrow already leaves to the library. |
| P clicks the shell's pause button (Neon Coil's pattern); R plays again only at Game Over; Escape is never bound. | Keeps the shell's pause label, overlay and save in sync, and leaves Escape to the shell's Study shortcut. |
| The HUD sits in the toolbar row, centred over the track, and stops 12 px short of pause on wide screens. | Reference pages 02 and 06 place it there, and the shell hides its own metrics for Ball Run. At 1920 px it sits 51 px left of the track centre. |
| The camera pitches down when the ball is high above the road and follows 85 % of its offset. | Page 04's "drop and flight"; bends read and the ball sits slightly off-centre as on page 03. |
| Landscape horizontal FOV capped at 82°, with speed widening kept under the cap; portrait unchanged. | Landscape reached 96–108° and looked stretched; the spec keeps FOV widening with speed. |
| A fall keeps the camera and drawn ball inside the tower canyon; the pitch never passes 0.6 rad. | The camera drove into the towers on edge falls. A long landscape fall now leaves the screen sooner (accepted). |
| Reduced motion: fixed FOV, no roll or pitch-down, a smaller fade-only burst, a 1 m trail, a fade-only panel. Equal on-screen trail counts in narrow landscape accepted. | "Fewer and gentler, not zero" (animate skill); the reduced trail is still shorter by length. |
| Button labels keep the reference's white on colour, with a dark edge in the fill's own shade. | Reference page 05; the edge gives 4.2–4.9:1 against the fill, though strict WCAG ignores it. |
| Evidence screenshots are written only with `BALL_RUN_EVIDENCE=1` and only by Chromium. | 23 tracked PNGs churned on every test run and mixed engines. |
| Residual per-render allocation (about 47–76 KB, from two independent heap-sampling runs) accepted. | Removing more needs `course.sample` to take no double arguments, a larger restructure. |
| Medium and Hard row intervals retuned to 0.68–1.2 s and 0.48–0.9 s. | Flight zones had cut Hard to 0.656 rows/s against 0.65; it is now 0.686. |
| A resize ends a drag but keeps held keys steering (the design spec said resize clears held input). | A drag maps canvas pixels to metres, so it cannot outlive the old size; a held key does not depend on the canvas size, and the plan's Task 5 browser test requires it to keep steering through a resize. |

## Verification environment

Node 22.22.0 and Playwright 1.64.1 on a 4 vCPU Linux container. Chromium is Chrome for Testing 153.0.8010.12 at `/opt/pw-browsers/chromium` (`CHROMIUM_PATH`), headless, with ANGLE SwiftShader software WebGL. WebKit is Playwright's WebKit build 2370 (with FFmpeg 1013), installed into the session scratchpad for this checkpoint and reached through `PLAYWRIGHT_BROWSERS_PATH`; it is not part of the repository, so that run cannot be reproduced from it alone. CI installs both engines itself (`.github/workflows/pages.yml`). Out-of-suite scripts and logs are in the session scratchpad.

## Verification

Final verification, 2026-10-24 (full commands and numbers in [TEST_RESULTS.md](../src/games/ball-run/TEST_RESULTS.md#redesign-2026-10-24)):

- `npx tsc --noEmit -p tsconfig.json`: pass.
- `npx vitest run tests/games/ball-run`: **80 passed** (model 30, records 19, bot 8, course 23).
- `npm test -- --maxWorkers=1`: 2721 of 2722 passed. The one failure is a Blockcraft lighting performance budget (3.12 ms against 3 ms) that also fails on unchanged main; Blockcraft is untouched. The run exited 1 because of that failure and one unhandled vitest `onTaskUpdate` RPC timeout, which also occurs on main.
- `npm run build` and `git diff --check ceb61e3`: pass; Ball Run chunk 54.92 kB.
- Ball Run browser spec: **Chromium 27 passed; WebKit 26 passed, 1 skipped** (Chromium-only CDP touch).
- Shared Study, viewport and leaderboard specs filtered to Ball Run and viewports: 8 passed in each engine.
- `ARCADE_GAMES=ball-run npm run verify:offline`: pass at `/` and `/Qcc-games-/`, 0 external requests, 0 page errors.
- Draw calls 6–8 and 3 geometries in every measured scene (budget 11 / 4). Under SwiftShader the redesign renders at about the old renderer's rate.

Key guarantees, measured:

- A route always exists: an independent interval check at 0.95 of the generator's reach never closes (seeds 1–24 in the suite; 1000 seeds out of suite; 300 seeds after the final retune), and every row leaves an opening of exactly the minimum gap or more.
- A look-ahead bot driving the real simulation survives the suite matrix on every difficulty, from the start and past the cap. Earlier wide sweeps (400 seeds) had 0 deaths. The final whole-branch review re-ran sweeps on the final course (logs kept with the session, not in the repository): seeds 13–112 × 3000 m from the start, seeds 5–104 × 1500 m past the cap and seeds 1–60 × 1500 m from half the cap distance gave 0 failures on every difficulty; 40 seeds × 30 km from the start gave one Hard death at 27,951 m, which a beam search with the real simulation showed passable from the bot's own states.
- Flights last at most 0.958 s and rise at most 2.58 m above the road on crests and dips; no landing within 12 m of a block and no gate entered in the air, over 1998 km of real simulation (before the final row-spacing retune; the road is unchanged by it, and block clearance of flight zones is enforced by the generator).

The final whole-branch review (five lenses, each finding re-verified independently) confirmed 8 findings (1 important, 7 minor) and refuted 5. All 8 are addressed: a restored Game Over's status, burst fragments sinking into the road, the legacy note hiding Play on short landscape screens, the speed readout over arch bars, a vacuous Restart test, the missing minimum-gap test, mixed-engine evidence and this documentation.

## Evidence

Chromium screenshots at 1× from the final evidence run, in [tests/games/ball-run/evidence](../tests/games/ball-run/evidence):

- The five moments: [straight](../tests/games/ball-run/evidence/390x844.png), [curve](../tests/games/ball-run/evidence/curve.png), [boost](../tests/games/ball-run/evidence/boost.png), [collision](../tests/games/ball-run/evidence/collision.png), [results](../tests/games/ball-run/evidence/results.png).
- Running view at [844×390](../tests/games/ball-run/evidence/844x390.png), [1366×768](../tests/games/ball-run/evidence/1366x768.png), [1920×1080](../tests/games/ball-run/evidence/1920x1080.png), [667×330](../tests/games/ball-run/evidence/667x330.png) and [568×320](../tests/games/ball-run/evidence/568x320.png); a [fresh restart](../tests/games/ball-run/evidence/procedural-restart.png).
- Setup panels: [390×844](../tests/games/ball-run/evidence/setup-390x844.png), [844×390](../tests/games/ball-run/evidence/setup-844x390.png), [1366×768](../tests/games/ball-run/evidence/setup-1366x768.png), [1920×1080](../tests/games/ball-run/evidence/setup-1920x1080.png), [667×330](../tests/games/ball-run/evidence/setup-667x330.png), [568×320](../tests/games/ball-run/evidence/setup-568x320.png).
- Game Over panels: [390×844](../tests/games/ball-run/evidence/over-390x844.png), [844×390](../tests/games/ball-run/evidence/over-844x390.png), [1366×768](../tests/games/ball-run/evidence/over-1366x768.png), [1920×1080](../tests/games/ball-run/evidence/over-1920x1080.png), [667×330](../tests/games/ball-run/evidence/over-667x330.png), [568×320](../tests/games/ball-run/evidence/over-568x320.png).

`ramp-gap.webm` in the same folder shows the old ramp course. It is kept because [DELIVERY.md](DELIVERY.md) and [GAMEPLAY_CORRECTIONS.md](GAMEPLAY_CORRECTIONS.md) link it; no video of the new course is committed. Older checkpoints (DELIVERY.md, GAMEPLAY_CORRECTIONS.md, [FLAPPY_BALL_RUN.md](FLAPPY_BALL_RUN.md)) link screenshots by the same names; those now show the redesign, and the earlier images are in git history (for example at `ceb61e3`).

These stills were checked by eye. The side-by-side comparison with reference pages 02, 03, 04 and 06 was made with earlier renderer screenshots (sheets kept in the session scratchpad) and was not repeated for this final set; see [TEST_RESULTS.md](../src/games/ball-run/TEST_RESULTS.md#redesign-2026-10-24).

## Known limitations

- No physical phone, Chromebook, touch hardware or GPU was tested. Frame timings are SwiftShader software WebGL in a container (medians of 100–200 ms per frame for both the old and new renderer), not device frame rates. Touch is Chromium's CDP emulation.
- The bot is not a complete oracle: very long continuous drives killed it on passable road (Medium seed 37 at 10.2 km and Hard seed 33 at 14.6 km before the final retune; Hard seed 13 at 28 km after it).
- The generator's reach model ignores the ball's 0.1 s steering lag; the 0.7 safety factor and the bot, which models the lag, cover it.
- About 47–76 KB of garbage per render while the road rebuilds (two independent heap-sampling runs), about 150–200 B per simulation step inside `course.ts`, and a little more during the burst.
- Hard row density has little headroom: 0.686 rows/s against a 0.65 threshold, and the worst seed is at 89 % against an 85 % floor. Any change that adds clear road may need Hard's row interval retuned.
- Cold generation of the first course reached about 186 ms under heavy machine load (target 150 ms); a quiet re-measure of the final code was not made.
- White button labels on amber and green stay below 3:1 by strict WCAG; a dark edge carries the contrast to keep the reference look. The `How to play` toggle is 36–40 px and short-landscape panel buttons are 40 px tall, below the 44 px guidance.
- Stills show composition, not continuous motion or the original's timing.

## Review focus

- The route guarantee: the generator's interval pass in `course.ts` (`passable`, `step`, the gap and sliver pruning) against the independent `closesAt` and `widestOpening` checks in `tests/games/ball-run/course.test.ts`.
- Flights: the point-mass prediction and flight zones in `course.ts`, and the lift-off and landing rules in `model.ts` `step`.
- Records committed exactly once when a run ends, and the 250 ms score throttle, in `index.ts`; save validation in `model.ts` `restoreSnapshot`.
- Input lifetime across pause, Study, blur, resize, death and restore in `index.ts`.
- Renderer pooling, used-range uploads, allocation and disposal in `scene.ts`.
- The look-ahead bot (`tests/games/ball-run/bot.ts`) as evidence: a planner, not a complete oracle.

## Deliverables

- Game: `src/games/ball-run/{config.ts,course.ts,model.ts,records.ts,scene.ts,index.ts,style.css}`; `SPEC.md`, `TEST_RESULTS.md` and `SKILL_USAGE.md` updated with history kept.
- Tests: `tests/games/ball-run/{records.test.ts,course.test.ts,model.test.ts,bot.ts,bot.test.ts,play.spec.ts}` and the evidence set above.
- Shared checks: the Ball Run button names in `tests/e2e/study.spec.ts` (`Play|Continue`) and `scripts/verify-offline.mjs` (`Play|Continue|Play again`).
- Design and plan: `docs/superpowers/specs/2026-10-23-ball-run-redesign-design.md`, `docs/superpowers/plans/2026-10-23-ball-run-redesign.md`.
- The cover art, shell, leaderboard and other games are unchanged.
