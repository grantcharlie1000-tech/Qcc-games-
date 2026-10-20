# Ball Run correction: actual skills and source use

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

## Official API documentation, separately from skills

Verified the installed official Three r180 source documentation and implementation:

- `node_modules/three/src/objects/InstancedMesh.js`: `setMatrixAt`, `instanceMatrix.needsUpdate`, dynamic usage, and instance-buffer `dispose` (separate from geometry/material disposal).
- `node_modules/three/src/renderers/WebGLRenderer.js`: `setSize(width,height,false)` preserves CSS sizing while updating the actual canvas/viewport; DPR, renderer disposal and `forceContextLoss`.
- `node_modules/three/src/materials/Material.js`: polygon offset for solid faces with highlighted edges, preventing coplanar city-grid flicker.
- `node_modules/three/src/cameras/PerspectiveCamera.js`: changing real width/height aspect requires `updateProjectionMatrix`.

Official source locations: https://github.com/mrdoob/three.js/blob/r180/src/objects/InstancedMesh.js , https://github.com/mrdoob/three.js/blob/r180/src/renderers/WebGLRenderer.js , https://github.com/mrdoob/three.js/blob/r180/src/cameras/PerspectiveCamera.js , https://github.com/mrdoob/three.js/blob/r180/src/materials/Material.js . These are API sources, not loaded skills. An external `curl` attempt for the official responsive/cleanup manuals produced no files; no successful web fetch is claimed.

## Applicability gaps and reference limits

No installed standalone Three.js, procedural runner/track, or custom 3D solver skill was found. Generic 3D/web guides cover principles; official installed API documentation resolves the Three boundary. Deterministic fixed-step tests establish ramp momentum, ballistic gap crossing, landing, speed regions and sphere/AABB collision.

Viewed `blocks_and_ball_reference_sheet.jpg`, `13_ball_track.png`, and `14_ball_obstacles.png` with the image tool. They establish composition and palette; no source MP4 is available, so continuous camera or speed timing cannot be claimed matched. Physical touch hardware and mobile GPU performance are unverified. Parent owns shared viewport/HUD integration and independent review.

## Seeded procedural follow-up (2026-10-19)

The delegated Flappy/Ball Run session read the same repository router, web/3D/design/art, systematic-debugging, SVG, animation, test-driven-development and verification skills plus their test-writing reference. Failing tests reproduced missed lateral contact, NaN steering corruption and only two obstacle variants. The follow-up shares each obstacle definition between rendering and collision and proves traversal across 64 seeds. No Three API or dependency upgrade was needed. Parent coordinates independent Astra review; no review agent was spawned here.
