# Skills actually used

Inventory command: `rg --files .agents/skills -g SKILL.md`. Read local guides before coding. Exact upstream versions below come from `skills.lock.json`; no skills were installed.

| Actual local guide | Upstream source | Concrete application |
| --- | --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | obra/superpowers @ bb92a77741419a4ab5f06e711a283343f1ada0c3 | Read the entry point. Its SUBAGENT-STOP says dispatched specialists ignore the rest of that entry workflow; kept assigned scope and did not spawn agents. |
| `.agents/skills/game-development/SKILL.md` | vudovn/ag-kit @ 549ba3dc2eb1d40fccb5b6d792eba4101c80cd69 | Routed to web, 2D and art guides; separated fixed physics from RAF rendering and input actions. |
| `.agents/skills/game-development/web-games/SKILL.md` | vudovn/ag-kit, same commit | Local bundled engine; Canvas renderer; no runtime network assets; context audio only after input; capped pixel ratio and isolated lazy module. |
| `.agents/skills/game-development/2d-games/SKILL.md` | vudovn/ag-kit, same commit | Simplified convex contact geometry, correct sprite centre-of-mass pivot, fixed step and following camera with a ruler. |
| `.agents/skills/game-development/game-design/SKILL.md` | vudovn/ag-kit, same commit | Short aim/drop/settle/reward loop; safe waiting; broad initial hippo; different masses and support widths add decisions. |
| `.agents/skills/game-development/game-art/SKILL.md` | vudovn/ag-kit, same commit | One original flat-vector style with consistent dark outlines; hippo ears, capybara muzzle, patterned turtle shell, sheep wool and fox ears/tail produce redundant silhouettes. |
| `.agents/skills/svg-skill/SKILL.md` | linyaosky/svg-skill @ 2103b92cb47f588a97a6c38aa6c40571fadbd4f8 | Wrote original SVG shape/path markup, coherent viewBoxes, informative metadata; ran provided SVG validator. Shared in-game markup also produced standalone species art and an improved 320×410 cover with y=0..95 clear for shell title. Parent may replace cover during final art pass. |
| `.agents/skills/physics-matter/SKILL.md` | phaserjs/phaser @ 02d8931b626d9764c133cbb3fbf99966c03c757c | Applied compound-part, finite mass/inertia, static island, friction, restitution, sleeping and collision-event concepts. Phaser API calls were not used; standalone APIs were checked against official Matter source. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | phaserjs/phaser, same commit | Unified aim/drop actions across pointer, touch and keyboard; CSS-coordinate mapping, capture/cancel, no repeated Space drops and stage-scoped key ownership. Adapted browser events rather than Phaser input plugin. |
| `.agents/skills/animations/SKILL.md` | phaserjs/phaser, same commit | Used event-driven impact state rather than a permanent decorative animation loop; no Phaser animation API is imported. |
| `.agents/skills/animate/SKILL.md` | emilkowalski/skills @ 2d228630ba1446365f614a108cb8252f1feda202 | Applied motion-purpose gate: collision highlights are feedback; camera travel is spatial consistency. Reduced-motion disables impact accents and smooth camera travel. Essential physics is gameplay, not decorative UI motion. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | obra/superpowers, same commit | Wrote real physics/rule tests before model implementation; initial run failed on absent model, then iterated real support, stability and restoration assertions. No mocked Matter solver. Tests target scoring, falling, safe spawn, entropy, corrupt saves and UI actions. |
| `.agents/skills/systematic-debugging/SKILL.md` | obra/superpowers, same commit | Reproduced parent review seed-4/tick-1531 valid-save rejection, watched the exact regression fail, identified the arbitrary contact-depth guard, and replaced it with bounded schema/known-geometry validation plus exact duplicate rejection. |
| `.agents/skills/verification-before-completion/SKILL.md` | obra/superpowers, same commit | Fresh typecheck, actual unit commands, isolated-server Chromium interactions and saved screenshot are recorded in TEST_RESULTS before completion claims. |

## Documentation and gaps

Official Matter source research is separately cited in SPEC.md. It validates `Body.create`, convex parts, mass, position/velocity setters, manual fixed stepping, events and exact geometry queries. Documentation is not counted as a skill. No installed guide specifically covers standalone Matter stable animal towers or collision-driven illustrated characters. Those gaps were addressed with source reading, authored SVG character design, finite compound geometry and numerical stability tests. The installed physics/input/animation guides are Phaser guides; this game uses standalone Matter + Canvas and does not claim to use Phaser.

Independent review is delegated to the parent specialist coordinator under repository workflow, because this assignment explicitly prohibits spawning additional agents. Physical-device touch feel and actual Chromebook performance remain unmeasured here.
