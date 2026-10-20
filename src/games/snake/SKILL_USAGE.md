# Actual skill use

Independently inventoried with `rg --files .agents/skills -g SKILL.md` before implementation. Source provenance comes from the repository's `skills.lock.json`; no skills were installed or modified.

| Read source | Provenance | Actual application |
| --- | --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | obra/superpowers `bb92a77741419a4ab5f06e711a283343f1ada0c3` | Read the explicit dispatched-subagent exemption; used the task's authorized scoped workflow. |
| `.agents/skills/game-development/SKILL.md` | vudovn/ag-kit `549ba3dc2eb1d40fccb5b6d792eba4101c80cd69` | Separated input → fixed update → render; state machine and bounded action queue. |
| `.agents/skills/game-development/web-games/SKILL.md` | same ag-kit source | Chose small native Canvas renderer, no engine/network dependency; pause/disposal respect browser lifecycle and shell sound gating. |
| `.agents/skills/game-development/2d-games/SKILL.md` | same ag-kit source | Grid cell collision rather than pixel/physics collision; coherent background, food, body, head layering. |
| `.agents/skills/game-development/game-art/SKILL.md` | same ag-kit source | Soft gradient casual palette, strong silhouettes, high-value eyes, original shaded segments/apple; quiet background. |
| `.agents/skills/time-and-timers/SKILL.md` (clock, delta and pause sections) | phaserjs/phaser `02d8931b626d9764c133cbb3fbf99966c03c757c` | Applied accumulator and paused-clock principles using native RAF rather than invoking Phaser APIs. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | same Phaser source | Abstracted all input into a direction action; repeat suppression, primary pointer/capture, cancellation, keyboard alternatives and paused input gating. |
| `.agents/skills/scale-and-responsive/SKILL.md` | same Phaser source | Separated logical board coordinates, backing resolution and CSS display width; bounded DPR and aspect-preserving fit. No Phaser ScaleManager is used. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | same Superpowers source | Wrote initial pure rule cases before engine; literal cell expectations exercise actual state transitions, seeded food, tail legality, clocks and malformed saves. E2E uses the routed game and genuine keyboard/touch actions. |
| `.agents/skills/systematic-debugging/SKILL.md` | same Superpowers source | Traced touch pointerdown/up/click delivery before fixing missing compatibility clicks after swipe; inspected fake-clock behavior before using pauseAt and deterministic time advances. |
| `.agents/skills/requesting-code-review/SKILL.md` | same Superpowers source | Prepared concrete scope, requirements and verification for independent parent review; the explicit no-extra-agents task restriction overrides the guide's reviewer-spawn example. |
| `.agents/skills/verification-before-completion/SKILL.md` | same Superpowers source | Fresh scoped unit, complete available unit suite, TypeScript, Chromium E2E, screenshot and measured RAF evidence before handoff. |

# Gaps and browser documentation actually read

The timing/input/scaling specialty guides target Phaser. They do not specify native DOM APIs or Snake's reversal/tail rules. Native documentation was read separately; it is not reported as an invoked skill.

- MDN `Window.requestAnimationFrame`: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/window/requestanimationframe/index.md — timestamp-based updates, refresh-rate independence, one-shot rescheduling and cancellation.
- MDN Pointer Events overview: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/pointer_events/index.md — unified mouse/touch model and pointer capture.
- MDN pointerdown: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/pointerdown_event/index.md — immediate touch activation and capture/cancellation behavior. Direction controls use primary pointerdown; semantic keyboard clicks remain supported.
- MDN KeyboardEvent.key: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/keyboardevent/key/index.md — key values, modifier-aware printable keys and repeat semantics. Modal/editable controls are excluded.
- MDN Canvas optimization: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/canvas_api/tutorial/optimizing_canvas/index.md — avoid needless drawing. The frame loop redraws only on grid ticks/input/lifecycle updates, not every RAF.
- Official Playwright clock guide: https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/clock.md — install before navigation, pauseAt, runFor. Tests explicitly pause the installed clock to remove wall-time drift.

No grid-Snake solver skill exists in the inventory. The project brief defines the classic rule variant; pure invariant tests cover its edge cases. A Wikipedia genre-page fetch returned no usable content and was not treated as evidence. No external rule text or art was copied.

The parent explicitly retained cover.svg ownership for a new SVG-skill art pass. This specialist did not create or edit that cover and does not claim SVG-skill use; gameplay illustration is original Canvas code in `art.ts`.


# Smooth redesign — 2026-10-20

Read the canonical local `using-superpowers` (dispatched-subagent exemption), `animate`, `game-development`, `game-development/web-games`, `game-development/2d-games`, `scale-and-responsive`, `input-keyboard-mouse-touch`, `time-and-timers`, and `verification-before-completion` skills. Applied animation purpose (spatial consistency/state feedback), native Canvas fixed simulation/interpolated render, reduced-motion gating, no new library, bounded input queue, responsive logical/display/backing separation, pause clock reset and fresh verification. The Phaser guides informed principles only; no Phaser API is used. The existing `--ease-out` tokens are untouched; continuous gameplay follows the model's linear clock.

The brief explicitly requests gameplay motion; it governs this frequent-input game over `animate`'s general UI shortcut-frequency gate. No UI shortcut entrance animation was added. Geometry and input tests plus actual routed browser checks replace any invented Snake-specific skill. Independent coordinator review and browser/performance evidence are part of the handoff. See `docs/snake-smooth-design.md` for the projection sketch, sizing arithmetic, save compatibility and reference-access limitation.


The post-commit Astra correction pass read `receiving-code-review` and `systematic-debugging`: checked each finding against the actual model/presentation and RAF invalidation paths, retained the independent failure evidence, and replaced the clock assumption with delivered-timestamp accounting. It preserves the parent’s timing decision and uses focused regressions instead of broad unrelated changes.


# Continuous authoritative candidate

The later explicit authorization supersedes the original all-input-deadlines constraint. Applied the already-read game-development fixed-clock/path principles, animation purpose/reduced-motion guidance, responsive/input lifecycle skills, receiving-code-review and systematic debugging to a pure version-2 leg/contact model. Native Canvas remains the renderer; no new engine/library/skill installation was needed. Two actual red→green regression records are retained for save invariants and numerical event boundaries. Core continuous travel is essential in both motion modes; only cosmetics are reduced. Current contact dimensions, changed turn cutoff and safe old-save conversion are specified in `SPEC.md`. Independent review is requested only through the coordinator’s allocated slot.
