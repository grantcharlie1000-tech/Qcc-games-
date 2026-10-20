# Direct-input redesign — 2026-10-20

Review feedback also used the local receiving-code-review skill: the native pause/contact finding was reproduced before the minimal fix, with fresh input recovery checked afterward.

The horizontal redesign read and applied the repository's game-development router, web-games and 2d-games guides, test-driven-development (including writing-good-tests) and verification-before-completion. Their concrete influence was separating input math from the unchanged physics model, mapping measured screen coordinates into saved coordinates, regression-testing cancellation before fixes, and reporting fresh browser/unit evidence with explicit limits. The using-superpowers router was read and its dispatched-subagent exclusion respected. No new skill or third-party dependency was installed. Current details and evidence: [POOL_DIRECT_DRAG.md](../../../docs/POOL_DIRECT_DRAG.md).

The original 2026-10-19 skill record follows; its references to sliders, gameplay buttons and the optional aim aid describe the earlier interface.

# Actual skill and documentation usage

Inventory command: `rg --files .agents/skills -g SKILL.md`. No third-party skill was installed. No additional agent was spawned. Exact local skills below were read; reading documentation is listed separately.

## Applied local skills

| Exact source | Actual influence |
| --- | --- |
| `.agents/skills/game-development/SKILL.md` | Separate input/update/render; fixed-timestep model; finite states aim/moving/over; circle collision choice; simple utility scoring for AI. |
| `.agents/skills/game-development/web-games/SKILL.md` | Raw Canvas choice for a small custom game, offline assets, paused lifecycle and no runtime CDN. |
| `.agents/skills/game-development/2d-games/SKILL.md` | Circle geometry, clear top-down layering and deterministic physics independent of rendering. |
| `.agents/skills/game-development/game-design/SKILL.md` | Aim → shoot → resolve → turn loop; explicit group/turn feedback; human/AI mode and optional Line up a shot aid. |
| `.agents/skills/game-development/game-art/SKILL.md` | Consistent soft vector style, felt/wood contrast, numbers and stripes as redundant identifiers, restrained texture behind the playfield. |
| `.agents/skills/physics-matter/SKILL.md` | Compared fixed timestep, restitution, separation iterations and resting contact concepts. This is a Phaser integration skill, **not** a standalone billiards solver; its `this.matter` APIs are not used. |
| `.agents/skills/physics-arcade/SKILL.md` (physics overview through body/velocity sections) | Fixed-step, units per second, circle bodies and pause semantics informed the custom model. No Phaser Arcade API is used. |
| `.agents/skills/geometry-and-math/SKILL.md` | Native equivalents of normalized vectors, angle/distance, finite segment tests and first circle/ray intersection inform cue preview, collision normal and ghost-ball AI. No Phaser import. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | A unified PointerEvent path, logical-coordinate mapping, scoped keyboard controls, separate aim/shoot actions and disabling input on pause. |
| `.agents/skills/scale-and-responsive/SKILL.md` (scale overview) | Distinguished logical table size from CSS display size; CSS fits the table and pointer positions use their ratio. No Phaser ScaleManager API. |
| `.agents/skills/svg-skill/SKILL.md` | Read for cover task and inspected inherited SVG viewBox, title-safe region and stripe geometry. Parent then explicitly took over cover replacement. No claim of authoring a new cover in this commit. Canvas art uses the same shape/layer discipline. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | Wrote real model and browser tests before initial implementation; tested analytical momentum/energy and literal rule outcomes instead of snapshots of source. Regression tests reproduced terminal scratch-8 restore rejection and cue overlap during break-8 spotting before fixes. |
| `.agents/skills/systematic-debugging/SKILL.md` | Used failure output to distinguish slow rendering from physics completion; cached static art and stopped per-frame DOM/status/storage work. Identified fixture writes being overwritten by the shell's pagehide save and changed fixture setup to enter through the library. |
| `.agents/skills/verification-before-completion/SKILL.md` | Fresh unit, Chromium and TypeScript checks and real screenshot; actual failures and limits documented in TEST_RESULTS. |

`.agents/skills/using-superpowers/SKILL.md` was read at session start. Its explicit SUBAGENT-STOP says dispatched subagents ignore that router. Relevant local workflow skills were still read and used directly; its automatic delegation workflow was not used.

## Upstream provenance

From repository `skills.lock.json`: game-development guides: `vudovn/ag-kit` at `549ba3dc2eb1d40fccb5b6d792eba4101c80cd69`; Phaser guides: `phaserjs/phaser` at `02d8931b626d9764c133cbb3fbf99966c03c757c`; SVG: `linyaosky/svg-skill` at `2103b92cb47f588a97a6c38aa6c40571fadbd4f8`; workflow/testing: `obra/superpowers` at `bb92a77741419a4ab5f06e711a283343f1ada0c3`. Skills retain their existing upstream provenance; no skill files changed.

## Documentation consulted (not skill invocation)

- [WPA Rules of Play supplied PDF](https://www.wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf): connected web open read fouls §§3.1–3.3, eight-ball §§4.1–4.11 and general cue-in-hand/call-shot sections. It confirmed rack/turn/foul/endgame behavior. The implementation's deviations are stated in SPEC and the game's visible rules. Direct shell requests to this PDF, WPA rules page and BCA page returned proxy 403; the supported connected web tool succeeded, with no circumvention.
- [Official Matter.js collision Resolver source](https://raw.githubusercontent.com/liabru/matter-js/master/src/collision/Resolver.js): inspected normal relative velocity, restitution impulse and resting-contact handling. Used to cross-check the custom approaching-only equal-mass impulse, rather than treating Phaser docs as standalone Matter API docs. No Matter dependency is imported at runtime by Pool.

## Gaps and local reasoning

The actual inventory has no billiards cue solver, eight-ball referee, ghost-ball shot-selection or numerical-conservation specialty skill. The mandatory areas are covered by relevant actual skills above plus official rules/source and explicit original implementation/tests. Circle impulses, swept pocket detection, ghost-ball geometry and turn adjudication were written locally; no imaginary skill names or invocations are claimed. The computer can fail difficult snookered escapes; it is an offline casual opponent. No WebKit engine or physical Chromebook measurements are claimed.
