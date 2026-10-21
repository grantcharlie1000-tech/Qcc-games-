# Water Sort correction — actual skill use

Correction session: 19 October 2026, isolated `correction/water-sort` worktree. Discovery used `rg --files .agents/skills -g SKILL.md` and the installed registry `skills.lock.json`/`docs/WORKSPACE_SKILLS.md`. Canonical project skills were actually read from disk. The contract and reference sheets are requirements/evidence, **not** skill loads. No dependency was installed.

## Loaded and applied

- `.agents/skills/using-superpowers/SKILL.md`: session entry point; its dispatched-subagent exception applies to this specialist.
- `.agents/skills/systematic-debugging/SKILL.md`: inspected actual existing adapter and reference frames first. Root causes were a framed dashboard, broad/labelled glass artwork, a stationary source with a decorative curved stream, and no continuous liquid transfer.
- `.agents/skills/svg-skill/SKILL.md` and `scenarios.md`: native inline SVG with explicit viewBox, per-tube unique clipping IDs, flat fills, pale thin outlines, restrained highlights, declarative paths and decorative `aria-hidden`. `scripts/validate.sh` validates a real extracted tube artifact after browser capture.
- `.agents/skills/animate/SKILL.md`, `RECIPES.md`: spatial consistency and state indication justify the controlled game pour. Dynamic, interruptible animation uses the existing requestAnimationFrame transaction; transforms move the glass with the skill’s `cubic-bezier(.77,0,.175,1)` movement curve, polygon clipping changes liquid geometry. Keyboard/reduced-motion pours use a gentle 160ms volume transfer without glass movement or stream. Hover feedback is gated to fine pointers. Celebration is brief opacity/bubble feedback. Native selects avoid an animated hand-built popover. The game-specific 1.4s travel/tip/flow/return is deliberately longer than the skill's ordinary UI-transition budget; it depicts actual gameplay, not a menu transition. Timing is a product choice and is not claimed to match absent source video.
- `.agents/skills/pick-ui-library/SKILL.md`: reviewed the companion and existing package.json; retained native buttons/selects and existing TypeScript/DOM architecture under the user's no-framework/no-new-dependency constraint.
- `.agents/skills/game-development/SKILL.md`, `game-development/web-games/SKILL.md`, `game-development/2d-games/SKILL.md`, `game-development/game-art/SKILL.md`: separate deterministic rules from presentation; preserve the existing solver, scoring, levels and session; scope SVG rendering to this module; disconnect ResizeObserver/listeners/RAF on disposal; align art scale and pivots to a flat vector style.
- `.agents/skills/input-keyboard-mouse-touch/SKILL.md`: input abstraction, primary-pointer filtering, cancellation, one selection per non-repeated keyboard action. This installed skill is **Phaser-specific**. The app is DOM/SVG, so Phaser APIs are not used; native button activation, Arrow focus navigation, pointer cancellation/blur/resize/pause cleanup provide the actual adapter.
- `.agents/skills/physics-matter/SKILL.md`: inspected applicability. It covers Phaser rigid bodies and is **not applicable** to Water Sort's controlled vector liquid. No Matter body, particle simulation, pressure solver, or real-fluid claim was introduced.
- `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md`: new geometry behavior tests were run against missing/stub behavior and observed failing, then implemented. Tests assert conserved area, scene-horizontal surfaces, transfer ordering and empty bands, alongside the unchanged legal-move/solver/session acceptance tests. Browser tests exercise real DOM interaction and screen transformation matrices; they are not source-grep tests.
- `.agents/skills/verification-before-completion/SKILL.md`: fresh focused/full unit, typecheck, browser, SVG and build evidence recorded in TEST_RESULTS.md.
- `.agents/skills/requesting-code-review/SKILL.md`: the parent coordinates independent review and sequential integration; this specialist supplies its diff, test evidence and precise limitations for that review.

## Applicability gaps and actual documentation

The installed inventory has no specialised liquid simulation, Water Sort solver, native DOM input, or browser-game testing skill. Do not present the Phaser input/physics skills as such. The existing BFS solver/rules remain unchanged. The replacement fluid is explicitly **controlled vector geometry**: exact area of a rounded-bottom polygon intersected with horizontal half-planes, transformed back into each tilted glass. The rounded bottom is approximated with 32 arc segments for volume calculation; SVG provides the smooth final clip. This is a visual model, not hydrodynamics.

Official MDN documentation was actually fetched/read from the official `mdn/content` repository after developer.mozilla.org requests returned proxy 403s:

- `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/svg/reference/element/clippath/index.md` — clipping restricts paint without changing inherent geometry; native `userSpaceOnUse` coordinates.
- `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/svggraphicselement/getscreenctm/index.md` — screen transformation matrices for real rendered liquid-surface verification.
- `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/pointercancel_event/index.md` — cancellation on orientation changes, app switching, scrolling and rejected input; never commit a cancelled gesture.
- `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/elements/button/index.md` — native activation by mouse, keyboard, finger and assistive technology.
- `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/css/reference/at-rules/@media/prefers-reduced-motion/index.md` — remove/reduce/replace non-essential panning and scaling.

These are documentation reads, not skill invocations.

## Reference boundary

Actually inspected through `view_image`: `/tmp/arcade-gameplay-refs/arcade_visual_references/water_reference_sheet.jpg`, `07_water_pouring.png`, `08_water_layout.png`, `09_water_pouring_red.png`, `10_water_completed.png`. These support the aubergine scene, pale slender glass, flat vivid liquid, open tube rows, compact difficulty/Level heading, bottom gold controls and sampled tilted poses. No reference pixels are distributed as game assets. The ZIP contains stills and **no original MP4s**; exact continuous motion, transfer rates, original easing and frame cadence cannot be verified. Browser recordings demonstrate this implementation, not equivalence to unavailable motion. No physical-device or measured frame-rate claim.

## Pointer-capture follow-up

Reapplied the loaded native-input/verification guidance for the explicit optional-
drag audit. Source buttons now actually capture the primary pointer; ownership
is checked and released before a drag calls choose/render. Cancellation, lost
capture, blur, resize, pause, restore/restart and disposal clear the gesture.
Synthetic events with no active browser pointer are guarded against the API's
NotFoundError. Only `.ws-tube` uses `touch-action:none`; article/menu/select
scrolling and gestures are unchanged. Keyboard clicks cannot be swallowed by a
stale pointer-click suppression flag.

Additional official documentation actually read (documentation, not skills):
`https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/setpointercapture/index.md`,
`https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/releasepointercapture/index.md`,
and `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/lostpointercapture_event/index.md`.
A real Chromium regression was observed failing on missing capture before the
implementation. New real-mouse tests verify retargeted moves/up, release before
rerender, and zero pours after capture cancellation and lifecycle interruptions.

## Level expansion and shared scores — 21 October 2026

Applied the project's planning, test-driven-development and verification skills,
plus the already-read game-development web/2D guides. The level-count test failed
at nine before appending eighteen seeded boards. Kept the generator and original
nine level indexes unchanged; independent BFS, witnesses, solver and reachable-state
recovery now cover all 27 boards. Shared online scores use the Netlify Database and
Functions skills, the connected coding context, and the existing site architecture.
Independent code review found a per-request pool allocation; verified the installed
library, applied the receiving-code-review workflow and cached the warm handler.
Follow-up review found no remaining blockers.
