# Independently discovered and applied skills

Inventory performed in this worktree with `rg --files --hidden .agents/skills -g SKILL.md` (and the requested `rg --files .agents/skills -g SKILL.md`). Canonical local files, not assumed skill names, were read. Provenance below is taken from `skills.lock.json`; all listed upstream sources use MIT licences.

| Actual local files read | Upstream | Concrete use |
| --- | --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | `obra/superpowers` @ `bb92a77741419a4ab5f06e711a283343f1ada0c3` | Read session router; its explicit dispatched-subagent exception applies. Parent assigns scope and plan. |
| `.agents/skills/game-development/SKILL.md`, `game-development/web-games/SKILL.md`, `game-development/2d-games/SKILL.md`, `game-development/game-design/SKILL.md`, `game-development/mobile-games/SKILL.md` | `vudovn/ag-kit` @ `549ba3dc2eb1d40fccb5b6d792eba4101c80cd69` | Raw Canvas is sufficient for polygon slabs; separate update/render, a short drop→crop→reward loop, progressive speed, follow camera, full board touch target and semantic 49px action button. |
| `.agents/skills/game-development/game-art/SKILL.md` | same `vudovn/ag-kit` source | Original harmonious lilac scenery, three lit faces per cuboid, stable logical unit, dark edge contrast, active white marker, no colour matching requirement. |
| `.agents/skills/geometry-and-math/SKILL.md` | `phaserjs/phaser` @ `02d8931b626d9764c133cbb3fbf99966c03c757c` | Geometry remains pure data. Interval intersection in x/z is independent of isometric drawing; explicit tolerance scales down on thin edges. No Phaser API was imported. |
| `.agents/skills/time-and-timers/SKILL.md` | same Phaser source | One game clock, seconds-based movement, pause stops elapsed time. Analytic triangle wave replaces per-frame stepping; settle remainder carries into the next slab. Snapshot includes motion elapsed and start direction. |
| `.agents/skills/graphics-and-shapes/SKILL.md` | same Phaser source | Polygon paths, clear fill/stroke separation and a limited primitive budget. Engine-specific Graphics APIs were not used as Canvas APIs. |
| `.agents/skills/animate/SKILL.md` | `emilkowalski/skills` @ `2d228630ba1446365f614a108cb8252f1feda202` | Purpose is spatial consistency/feedback: a cropped slice falls away and the follow camera preserves focus. No idle decorative motion or keyboard-triggered UI animation. Reduced motion suppresses offcut fall, ring and landing lift; essential travel remains. No animation library. |
| `.agents/skills/svg-skill/SKILL.md` | `linyaosky/svg-skill` @ `2103b92cb47f588a97a6c38aa6c40571fadbd4f8` | Original scalable skyline.svg with viewBox and unique gradient IDs, decorative semantics; repository validator passes. Parent explicitly owns cover.svg, which is untouched. |
| `.agents/skills/test-driven-development/SKILL.md`, its `writing-good-tests.md`, `.agents/skills/systematic-debugging/SKILL.md`, `.agents/skills/verification-before-completion/SKILL.md` | above `obra/superpowers` source | Literal hand-derived crop fixtures, behavioral frame-rate and lifecycle tests; first model stubs yielded 10 failing assertions; missing UI initially yielded 3 failing browser tests. Inspect browser trace/context before changing input timing assumptions. Fresh TypeScript, unit and Chromium evidence before handoff. |
| `.agents/skills/requesting-code-review/SKILL.md` | same Superpowers source | Review is handed to parent because explicit specialist instructions prohibit spawning additional agents. No extra agents created. |

## Documentation and rule research

Read official MDN source through GitHub:
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/window/requestanimationframe/index.md — use timestamps, refresh rates vary, one-shot RAF, cancel owned RAF. Implementation advances the model to `performance.now()` at input as well as RAF callbacks, eliminating a display-frame collision delay.
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/canvas_api/tutorial/drawing_shapes/index.md — paths, coordinate space, clearRect and scaling. Renderer uses logical 400×470 coordinates with backing resolution capped at 2× DPR.

Rule reference attempted: https://en.wikipedia.org/wiki/Stack_(video_game). This host returned no usable content in this environment, so it is a reference pointer rather than claimed read evidence. The detailed parent brief is the authoritative rules source. No existing game's art or implementation was copied.

## Gaps and boundaries

Installed timing/geometry/graphics guides are Phaser-specific, not standalone Canvas references. Their conceptual advice was applied, and Canvas/timestamp behavior checked against MDN source; this is documented research, not a claimed extra skill. No installed standalone precision-stacker collision solver skill was found. Collision uses transparent interval arithmetic with independent expected examples, not an unnecessary physics engine. Continuous linear travel is analytic rather than a physics fixed-step loop, so arbitrary display rates produce the same position at the same timestamp. WebKit and physical mobile/Chromebook hardware are unavailable; Chromium touch emulation and host RAF measurements are reported honestly.
