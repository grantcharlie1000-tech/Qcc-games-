# Iron Meridian execution plan

Scope correction: this document describes the earlier original-game implementation. It does not fulfill the user's requested decompilation and web port. Current work is governed by [NATIVE_PLAN.md](NATIVE_PLAN.md).

Goal: inspect the installed HOI4 build and add an original, playable grand strategy game to the existing app. Full HOI4 engine and DLC parity remains a separate unfulfilled part of the user's goal.

Implementation uses the existing TypeScript/Vite stack, semantic DOM controls and Canvas 2D. No new runtime dependency. No extracted HOI4 code, artwork, music, localization or map data ships in the app. No commit, branch switch, push or deployment is authorized.

The user requested parallel execution using only OpenAI models. Parallel tasks own separate files and share the frozen types in `src/games/iron-meridian/types.ts`. The native agents use OpenAI models. This direct request overrides the skill's sequential implementer preference. The existing checkout is retained under the owner's no-branch-switch instruction.

## Task 1: Local investigation

Own `docs/iron-meridian/RESEARCH.md` and `source-inventory.json`. Inspect the local Steam install, hash observed sources, and link public primary sources. Distinguish configuration facts, inference and unobserved native behavior. Record gaps honestly. Do not alter the installation or execute the game.

## Task 2: Deterministic simulation

Own `src/games/iron-meridian/content.ts`, `model.ts`, and `tests/games/iron-meridian/model.test.ts`. Consume `types.ts` and `map-data.ts`. Implement economy, technology, focus branches, build queues, equipment production, recruitment, supply, land combat, air and naval missions, diplomacy, AI, victory and validated saves. Export the interface in the engine brief. Verify real player actions, invariants, deterministic continuation and invalid commands.

## Task 3: Map and artwork

Own `src/games/iron-meridian/map-data.ts`, `render.ts`, `public/game-art/iron-meridian/cover.svg`, and map geometry tests. Consume `types.ts`. Author a fictional province map with six nations, terrain, capitals, ports and land/sea connectivity. Draw the map, units, orders and supply. Return exact selection coordinates through the renderer. Verify geometry and coherent connectivity.

## Task 4: Interface and integration

Parent owns `index.ts`, `style.css`, `SPEC.md`, `SKILL_USAGE.md`, lifecycle/browser tests, and shared registration. Fill the screen underneath floating glass. Desktop side panel and mobile sheets expose real model actions. No duplicate app menu. Keep controls and essential text clear of the dock and device insets. Register stable collection entry and game chrome fields. Preserve pause, restore, restart and disposal contracts.

## Task 5: Verification and independent review

Run scoped unit tests, app typecheck, real Chromium gameplay at desktop and phone sizes, save round trip and pause behavior, production build and offline manifest inspection. Capture screenshots. Review research, simulation and renderer tasks, then obtain an independent review of the whole integration. Fix concrete findings before completion claims.

## Interface preflight

| Producer | Consumer | Decision |
| --- | --- | --- |
| types.ts | Engine, map, UI | Shared immutable interfaces written before delegation |
| map-data.ts | Engine, renderer, UI | PROVINCES and NATIONS are the single geometry/identity source |
| content.ts / model.ts | UI | Parent consumes exported action and presentation helpers |
| render.ts | UI | Canvas renderer receives Campaign and MapView; owns no simulation |
| Engine saves | Shell restore | Version 1; deeply validate unknown data and clone accepted state |

## Progress

- Skill installed to `C:/Users/charlie/.codex/skills/reverse-engineer-anything` using the official Codex skill installer from `morluto/rea/.agents/skills/reverse-engineer-anything`.
- Initial investigation located HOI4 v1.19.5 in the default Steam library. Subsequent actual native decompilation and bounded ports are tracked in [NATIVE_PLAN.md](NATIVE_PLAN.md). No original-process runtime observation has been performed.
- Resumed after the user's one-hour pause. Fresh OpenAI independent review found and verified fixes for stale combat attackers, sparse save arrays, obsolete war justifications, and stale construction cancellation. Earlier construction-cap reconciliation, stale unit selection and phone camera bounds were also verified.
- Parent browser testing found daily clock button replacement and a disabled Begin button after paused restart. The clock now retains its DOM controls and pause/resume refresh the setup controls. Both defects have real browser regression coverage.
- Scoped simulation, geometry and navigation validation passed 37 tests. Final browser, build and offline results are recorded in `src/games/iron-meridian/TEST_RESULTS.md` when complete.
