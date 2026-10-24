# Ball Run: skills and sources used

## Gameplay correction (2026-10-19)

2026-10-19 correction session. Queried both skills registries (`executor` returned no skills; cloud returned unrelated integrations) and independently discovered repository skills with `rg --files .agents/skills -g SKILL.md`. Read AGENTS.md, the correction contract, the gameplay correction plan and the frozen GameModule types. No skill installer or new dependency was used.

| Exact installed source loaded | Application to this correction |
| --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | Its explicit SUBAGENT-STOP clause applies to this assigned specialist. No additional agents spawned. |
| `.agents/skills/game-development/SKILL.md` | Fixed simulation/render separation, input actions and pooling. |
| `.agents/skills/game-development/3d-games/SKILL.md` | Third-person perspective camera, simple sphere/box collision, batched rendering, no shadows or postprocessing. |
| `.agents/skills/game-development/web-games/SKILL.md` | Retain lazy module/Three loading, recycle allocated scene data, stop work while paused. |
| `.agents/skills/game-development/mobile-games/SKILL.md` | Canvas-only gestures, portrait/landscape fitting, capped DPR and interruption handling. |
| `.agents/skills/game-development/game-design/SKILL.md` | Safe opening, readable hazards, repeatable recovery stretches and a continuously traversable center route. |
| `.agents/skills/game-development/game-art/SKILL.md` | Reference-informed hierarchy: magenta ball/blocks, indigo grid road, violet buildings and cyan acceleration gates. |
| `.agents/skills/svg-skill/SKILL.md` | Loaded the required illustration source; the replacement scene uses actual Three geometry rather than distributing SVG/raster reference art. No SVG asset changed. |
| `.agents/skills/animate/SKILL.md` | Essential game motion remains simulation-driven; no decorative HUD/keyboard animation. A stable player-relative camera omits decorative sway, shake and FOV pulses. Essential game movement remains unchanged. |
| `.agents/skills/pick-ui-library/SKILL.md` | Existing native UI and Three suffice; no new component or animation library. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | Held actions, release cleanup and gesture lifecycle concepts. This is a Phaser skill, so none of its engine APIs were used as Three APIs. Native Pointer Events/capture implement drag. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | New non-jump traversal, launch/landing, boost, collision and migration tests first failed against the old implementation, then passed against the new simulation. Real browser inputs exercise the adapter. |
| `.agents/skills/systematic-debugging/SKILL.md` | Trace failures to input/geometry/lifecycle boundaries before corrections; inspect actual browser composition. |
| `.agents/skills/requesting-code-review/SKILL.md` and `code-reviewer.md` | Parent owns independent source/integration review under the correction contract; supplied the source diff and evidence for that review. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh checks and exact evidence in TEST_RESULTS.md. |

Provenance is retained in the repository `skills.lock.json`. No skills or licenses were modified.

### Official API documentation, separately from skills

Verified the installed official Three r180 source documentation and implementation:

- `node_modules/three/src/objects/InstancedMesh.js`: `setMatrixAt`, `instanceMatrix.needsUpdate`, dynamic usage, and instance-buffer `dispose` (separate from geometry/material disposal).
- `node_modules/three/src/renderers/WebGLRenderer.js`: `setSize(width,height,false)` preserves CSS sizing while updating the actual canvas/viewport; DPR, renderer disposal and `forceContextLoss`.
- `node_modules/three/src/materials/Material.js`: polygon offset for solid faces with highlighted edges, preventing coplanar city-grid flicker.
- `node_modules/three/src/cameras/PerspectiveCamera.js`: changing real width/height aspect requires `updateProjectionMatrix`.

Official source locations: https://github.com/mrdoob/three.js/blob/r180/src/objects/InstancedMesh.js , https://github.com/mrdoob/three.js/blob/r180/src/renderers/WebGLRenderer.js , https://github.com/mrdoob/three.js/blob/r180/src/cameras/PerspectiveCamera.js , https://github.com/mrdoob/three.js/blob/r180/src/materials/Material.js . These are API sources, not loaded skills. An external `curl` attempt for the official responsive/cleanup manuals produced no files; no successful web fetch is claimed.

### Applicability gaps and reference limits

No installed standalone Three.js, procedural runner/track, or custom 3D solver skill was found. Generic 3D/web guides cover principles; official installed API documentation resolves the Three boundary. Deterministic fixed-step tests establish ramp momentum, ballistic gap crossing, landing, speed regions and sphere/AABB collision.

Viewed `blocks_and_ball_reference_sheet.jpg`, `13_ball_track.png`, and `14_ball_obstacles.png` with the image tool. They establish composition and palette; no source MP4 is available, so continuous camera or speed timing cannot be claimed matched. Physical touch hardware and mobile GPU performance are unverified. Parent owns shared viewport/HUD integration and independent review.

## Seeded procedural follow-up (2026-10-19)

The delegated Flappy/Ball Run session read the same repository router, web/3D/design/art, systematic-debugging, SVG, animation, test-driven-development and verification skills plus their test-writing reference. Failing tests reproduced missed lateral contact, NaN steering corruption and only two obstacle variants. The follow-up shares each obstacle definition between rendering and collision and proves traversal across 64 seeds. No Three API or dependency upgrade was needed. Parent coordinates independent Astra review; no review agent was spawned here.

## Redesign (2026-10-23 to 2026-10-24)

The controller session ran the redesign through the repository's Superpowers workflow and delegated implementation, review and verification to subagents in Claude Code workflows. Which skills were loaded is taken from the session transcripts: the Skill tool loads the `.claude/skills/` copies, and agents also read the canonical `.agents/skills/` files directly. No skill was installed or modified, and no dependency was added. Skill provenance is unchanged and recorded in the repository `skills.lock.json`.

| Source | How it was used | Influence on this redesign |
| --- | --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | Invoked at the start of the session, as AGENTS.md requires, and by two subagents. | Routed the work through brainstorming, then writing-plans, then subagent-driven development, instead of editing the old game in place. |
| `.agents/skills/brainstorming/SKILL.md` and `builder-check-prompt.md` | Invoked; the builder-check prompt read. | Produced `docs/superpowers/specs/2026-10-23-ball-run-redesign-design.md`. Kept the brief's OBSERVED, PROPOSED and UNKNOWN facts apart and marked every fixed unknown as a design call, to be kept in one editable configuration table. In the build, per-difficulty tuning and shared constants went into `config.ts`, while generator, camera and UI numbers are constants in `course.ts`, `scene.ts` and `index.ts`; SPEC.md says which file holds what. The builder check settled two gaps: records commit when a run ends however it ends, and arch walls are solid but harmless. Set out the anti-goals (no unwinnable section, no teleporting drag, no frame-rate-dependent speed, no 79/143 defaults). |
| `.agents/skills/writing-plans/SKILL.md` | Invoked. | Wrote `docs/superpowers/plans/2026-10-23-ball-run-redesign.md`: six tasks with interfaces, decided formulas, tests to write first and a review focus list. Later rulings were recorded in the plan with their dates, so implementers and reviewers worked from one source. |
| `.agents/skills/subagent-driven-development/SKILL.md`, `implementer-prompt.md`, `task-reviewer-prompt.md` | Read by the controller. | One implementer per task, then a task-scoped review gate (spec, then quality) with bounded fix rounds. A progress ledger recorded a pre-flight scan of what each task produces and consumes, every ruling with its cost if wrong, and each DONE_WITH_CONCERNS report, which the controller ruled on before work continued. |
| Workflow orchestration: Claude Code's Workflow tool (a harness feature, not a repository skill) | Eleven workflow runs. | Ran parallel lanes: an understanding pass (shell, tests, docs and skills readers), Phase A (records and course in parallel; stopped and relaunched when Charlie made gates permanent), Phases B and C (simulation, renderer, UI), a recovery after a container restart cut those short, course fixes, crest flights, polish, a five-lens final review with adversarial verifiers, and the finish (fixes, full verification, documentation). Each lane had at most two or three fix rounds and structured findings with a severity. |
| `.agents/skills/game-development/SKILL.md` | Read by the skills reader. | Kept the fixed 1/120 s step and swept collision so speed up to 62 m/s cannot tunnel; batching and pooling before culling; one steering action fed by drag and keys; cache instead of allocating in the hot loop (course data generated once per seed; `model.ts` allocates nothing of its own in steady state, while the course calls `model.step` makes leave about 150–200 B per step). |
| `.agents/skills/game-development/3d-games/SKILL.md` | Read by the skills reader. | Sphere and box colliders; third-person chase camera with look-ahead and FOV that widens continuously with speed; no shadows. |
| `.agents/skills/game-development/web-games/SKILL.md` | Read by the skills reader. | Three stays in the lazy game chunk; pooled instanced buffers for the trail and burst; nothing runs while paused or hidden. |
| `.agents/skills/game-development/game-design/SKILL.md` | Read by the skills reader. | Three player-chosen tiers, each with its own curve rather than Hard with fewer blocks; pacing as early wins, a gradual rise and rest beats (warm-up, intro-to-full row intervals, scheduled rests); not over-punishing (R plays again at once). It gives no numbers, so every curve and density is a design call proven by tests. |
| `.agents/skills/game-development/game-art/SKILL.md` | Read by the skills reader. | Hazards keep one colour per object and value contrast against the road; a short, exaggerated death burst read at distance; difficulty never shown by colour alone. |
| `.agents/skills/game-development/mobile-games/SKILL.md` | Read by the skills reader; `pc-games/SKILL.md` searched for input mapping. | No precise timing windows, which supports spacing rows in time; portrait and landscape layouts; pause on background. Its 44 pt touch-target guidance is not met everywhere: the `How to play` toggle is 36–40 px, and on short landscape screens (360 px tall or less, 480 px wide or more) the panel buttons are 40 px tall. |
| `.agents/skills/animate/SKILL.md` and `RECIPES.md` | Read by the skills reader. | Game Over uses the modal recipe: opacity plus a 0.96 → 1 settle over 250 ms on `cubic-bezier(0.23, 1, 0.32, 1)`, never `scale(0)` or ease-in. No animation on keyboard actions (P, R). Reduced motion means fewer and gentler, not none: a smaller fade-only burst, a shorter trail, fixed FOV, no roll or pitch, a fade-only panel, while the Speed Up label stays. |
| `.agents/skills/svg-skill/SKILL.md` | Read by the skills reader; `scenarios.md` searched. | Inline SVG faces with fixed fills (multi-colour), trophy and house icons in `currentColor`, all `aria-hidden` and `focusable="false"` beside text labels. The cover SVG did not change. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | Invoked by four implementers; read by others. | Every task wrote failing tests first and saved the RED output (records, course, model, renderer harness checks, browser assertions). Mutation runs then showed each test fails on the defect it names. |
| `.agents/skills/systematic-debugging/SKILL.md` | Invoked in the course-fix lane. | Traced a failing block-seating test to its root cause (`fits()` guaranteed clearance along the tilted box axis, not vertically) and proved the one-line fix by reverting it, instead of loosening the test. The same discipline separated bot faults from course faults (exact grid and beam searches) and Vite HMR reloads from real test failures. |
| `.agents/skills/receiving-code-review/SKILL.md` | Invoked in the recovery lane; every fix prompt carried its rule ("verify each first; explain rejections"). | Fixers reproduced each finding before changing code and said where they disagreed: the renderer lane tried a reviewer's alternative camera for edge falls, measured that it filled the frame with tower, and kept its own fix; the final review re-verified every finding with a separate agent and dropped the five it refuted. |
| `.agents/skills/requesting-code-review/SKILL.md` | The transcripts do not show this file being opened; the review requests followed subagent-driven development's reviewer prompt. | Independent reviewers checked every task, each fix round and the whole branch (five lenses, each finding re-verified by a separate agent). Reviews found real defects, including backward chevrons, a camera inside the towers, flights through arch roofs, chained flights and a stale status after restore. |
| `.agents/skills/verification-before-completion/SKILL.md` | The transcripts do not show this file being opened; its rule was applied. | Nothing was reported complete without a fresh run: the final verification re-ran type check, unit, build, both browser engines, shared specs and offline checks, and reproduced the one unrelated failure on main before calling it pre-existing. |

### Official API documentation, separately from skills

Checked in the installed Three r180 (`three` 0.180.0):

- `node_modules/three/src/core/BufferAttribute.js` and `src/renderers/webgl/WebGLAttributes.js`: `updateRanges` are cleared after each upload, so the renderer pushes one used-prefix range per pool on every commit.
- `node_modules/three/src/renderers/WebGLRenderer.js`: the context-creation error path, so `createScene` throws and the game shows its `3D graphics unavailable` fallback.
- `node_modules/three/src/renderers/shaders/ShaderLib/meshbasic.glsl.js`: instance colour multiplies the diffuse colour and there is no per-instance alpha, so the trail fades through instance colour under one material opacity.

Upstream sources: https://github.com/mrdoob/three.js/blob/r180/src/core/BufferAttribute.js , https://github.com/mrdoob/three.js/blob/r180/src/renderers/webgl/WebGLAttributes.js , https://github.com/mrdoob/three.js/blob/r180/src/renderers/WebGLRenderer.js , https://github.com/mrdoob/three.js/blob/r180/src/renderers/shaders/ShaderLib/meshbasic.glsl.js . No web documentation was fetched.

### Gaps

No installed skill covers Three.js, endless-runner track generation, or proving a procedural course passable; none gives numbers for speed curves, reaction time or obstacle density. The interval reachability method, the flight predictor and the look-ahead bot were designed for this game and are proven by their own tests. The reference brief's pages 1–9 were compared with renderer and UI screenshots; page 10 was set aside at Charlie's request, and the brief is not distributed in the repository.
