# Implementation skill references

Read from the repository's own current `.agents/skills`:
- `using-superpowers/SKILL.md` — repository workflow, explicit verification and review.
- `brainstorming/SKILL.md` — choose an immediately playable, simple-to-explain original mechanic; gameplay designed as a short prototype rather than a large speculative engine.
- `game-development/SKILL.md` — deterministic fixed-step update separated from rendering and an input abstraction.
- `game-development/web-games/SKILL.md` — raw Canvas is sufficient for this lightweight browser game; no extra engine/dependency.
- `game-development/2d-games/SKILL.md` — circle/segment collision, readable silhouettes.
- `game-development/game-design/SKILL.md` — 30-second action/feedback/reward loop and rising difficulty.
- `svg-skill/SKILL.md` — authored vector cover, 320×410 viewBox, no text, shared gradients.
- `animate/SKILL.md` — motion conveys charging/activation; reduced-motion mode suppresses nonessential glow oscillation.

No third-party artwork or engine source was imported. Relevant browser APIs: Canvas 2D, ResizeObserver, Pointer Events, requestAnimationFrame. Browser support limitations are recorded in TEST_RESULTS.md.
