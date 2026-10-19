# Gameplay correction contract

Source: the user's 19 October 2026 correction prompt and supplied `arcade_gameplay_visual_references.zip`. References are extracted at `/tmp/arcade-gameplay-refs/arcade_visual_references/` for comparison only. Do not distribute the reference images as product assets.

## Scope and ownership

Correct Animal Stack first, then Water Sort, Color Blocks and Ball Run. Preserve the other eight game modules; only parent-owned shared viewport/input fixes may affect their presentation. Preserve Study Mode, offline caching, game IDs, score rules, pause/save/restore/dispose and the existing Vite/TypeScript architecture. No new framework, runtime service or heavy dependency.

Each GPT-6.1 Sol specialist owns only `src/games/<id>/`, `tests/games/<id>/` and `public/game-art/<id>/` in its new isolated correction worktree. The parent owns shell/CSS/API, shared tests, scripts, manifests, deployment and integration. Never concurrently edit shared files. Request parent integration changes by message. Parent reviews and integrates commits one at a time.

## Frozen viewport interface

- Existing `GameModule` / `GameContext` / `GameInstance` API stays intact.
- The parent sets `data-game-id="<id>"` on `.game-view`. It covers the available viewport with a fixed layer, no library header or underlying document scrolling. Study Mode removes the scroll lock and retains the game instance.
- For the four corrected games, `.stage-wrap` and `#game-stage` cover the whole viewport. The module root must fill available height and render its own responsive composition, reserving the top approximately 76px for parent HUD controls. `#game-stage` remains the mount target, with the game root as its first child.
- Parent supplies `--scene-width` on `.game-view`: Animal Stack `min(100vw, calc(100dvh * .54))`; Water Sort `min(100vw, calc(100dvh * .58))`; Color Blocks `min(100vw, calc(100dvh * .72))`; Ball Run `100vw`. These are browser fitting limits, not source constants. Root may be narrower if needed, but must stay centered and fill height. Use aspect-preserving rendering and fixed logical physics units.
- Parent backgrounds: Animal Stack sky blue `#55c3ec`; Water Sort aubergine `#221b2e`; Color Blocks deep purple `#30223b`; Ball Run black. Agents should use matching flat backgrounds and can request measured colour corrections.
- Parent owns compact back/restart/pause/rules/favourite controls, live score/record badges and shared pause overlay. Do not duplicate these inside game markup. Water Sort owns its difficulty/level heading (top center), selections and bottom Undo/Hint. Ball Run owns its unobtrusive in-scene run HUD; parent will avoid duplicate scores.
- Pointer capture, coordinate mapping, tap/drag thresholds, held-key guards and pointercancel cleanup belong to each game's adapter. Never disable article/menu gestures globally. Pause must release active capture and clear held input without committing a gesture.

## Reference boundaries

The ZIP contains 14 labelled PNG stills, a timed giraffe sequence and three contact sheets, **no MP4 files**. No original videos were found among available attachments. These support shape/composition and sampled poses, not exact continuous timing or a reliable tap-rotation increment. Parent asked the user for the rotation increment and allowed time for a reply. With no answer received, parent explicitly stated a **45° browser adaptation** for tap/Q/E, isolated in one constant. This is not claimed as the original increment; a later user answer overrides it. Continuous original timing remains a reference gap.

## Review gates

Animal Stack first provides elephant/giraffe/penguin previews at relative scale, a genuine running-game screenshot and a collider overlay before expanding to horse/tapir/sloth. Parent compares those with reference frames and requests corrections before the full set. Use explicit convex compound parts with leg/neck gaps and aligned centre of mass; no hull-filled picture box, upright correction, glue or walls. Preserve scoring formula; version/migrate old saves honestly if changed geometry invalidates them.

Every specialist discovers and loads actual installed SVG/illustration, animation, input, testing and applicable physics/game skills. Document exact sources and applicability gaps, using official documentation for missing specialised skills. Provide interaction evidence and deterministic tests, portrait/landscape screenshots, and known limitations. Coordinate browser jobs with the parent to avoid concurrent software-GPU runs. No unmeasured performance or real-device claims.
