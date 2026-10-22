# Skills used

- `.agents/skills/svg-skill/SKILL.md`: the cover (`public/game-art/maze-muncher/cover.svg`, viewBox 320×410, title band clear, `title`/`desc`) and every in-game graphic are hand-written SVG. Shared gradients and filters sit in `<defs>`, and nothing is bitmap or generated imagery. Validated with `scripts/validate.sh` and `xmllint`.
- `.agents/skills/animate/SKILL.md`: gameplay motion is simulation-driven, with no motion library. The muncher chomps once per tile and wisps sway and bob. The power-berry blink is a CSS `steps()` animation, paused with the game. The start card uses opacity/transform transitions only (200 ms, `cubic-bezier(.23,1,.32,1)`, from scale .97, never 0). Pad presses use a 120 ms scale. Reduced motion (setting or media query) keeps state changes but removes decorative movement and flashing.
- `.agents/skills/game-development/SKILL.md` and `web-games/`: fixed 60 Hz deterministic simulation separated from rendering, with keyboard, touch pad and swipe input.
- `.agents/skills/test-driven-development/` and `verification-before-completion/`: model tests and real browser checks, recorded in `TEST_RESULTS.md`.
