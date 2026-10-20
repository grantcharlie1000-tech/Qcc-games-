# Actual skill use

| Read source | Provenance (`skills.lock.json`) | Actual application |
| --- | --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | obra/superpowers | Loaded at session start as AGENTS.md requires; the user's detailed brief served as the approved design, so no separate brainstorming round was held. |
| `.agents/skills/game-development/SKILL.md` | vudovn/ag-kit | Kept a pure state machine (`model.ts`: evaluate → apply → stats) separate from input and rendering (`index.ts`, `globe.ts`). |
| `.agents/skills/game-development/web-games/SKILL.md` | vudovn/ag-kit | Lazy loading of the 3D chunk and data, pause when hidden, low-power WebGL renderer, no CDN or remote assets. |
| `.agents/skills/svg-skill/SKILL.md` | svg-skill upstream | Cover uses the 320×410 viewBox with `title`/`desc`, shared `defs`, no text; it is generated from the real Natural Earth outlines by `scripts/build-globle-cover.mjs`. |

# Gaps and documentation read

The Phaser skills do not cover globe.gl. Its behaviour was taken from the installed sources, not memory:

- `node_modules/globe.gl/dist/globe.gl.mjs` — `pointOfView` tween ends by jumping (`povTween.end()`), so the game
  runs its own cancellable fly-to; `_destructor`, `pauseAnimation`/`resumeAnimation`, OrbitControls calibration.
- `node_modules/three-render-objects/dist/three-render-objects.mjs` — pixel ratio clamp, `enablePointerInteraction`
  gating the raycaster and tooltip, renderer/controls disposal, the global `window.scene` it sets.
- `node_modules/three-globe/dist/three-globe.mjs` — spherical ring interpretation, which is why the generator
  enforces exterior winding.
- Natural Earth admin-0 attribute documentation (`ADM0_A3`, `TYPE`, `SOVEREIGNT`, `LABEL_X/Y`) as present in the data.
