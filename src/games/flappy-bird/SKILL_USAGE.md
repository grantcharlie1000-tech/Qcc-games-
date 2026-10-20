# Skills and original artwork

Read the repository AGENTS.md, ARCHITECTURE.md, TEST_PLAN.md, module contract, and relevant existing adapters before implementation. Executor skills registry returned no skills; canonical installed instructions are repository files. No skills, engine dependencies, credentials, security settings, or deployment configuration were added or changed.

- `.agents/skills/using-superpowers/SKILL.md`: read the delegated-task stop clause; no extra agents spawned. Parent arranges Astra review.
- `.agents/skills/game-development/SKILL.md` and `web-games/SKILL.md`: separate fixed simulation, rendering and action input; keep game chunks lazy and offline.
- `.agents/skills/game-development/2d-games/SKILL.md`: logical coordinates, simple colliders and layered original art.
- `.agents/skills/game-development/3d-games/SKILL.md`: Ball Run uses pooled Three geometry and shared obstacle data for rendering/collision.
- `.agents/skills/game-development/game-design/SKILL.md` and `game-art/SKILL.md`: readable warm wetland theme, wide introductory gates, bounded difficulty and a tested safe Ball Run corridor.
- `.agents/skills/svg-skill/SKILL.md`: authored and validated a 320×410 cover with title-safe upper area. No image generator, downloaded artwork, copied sprites or reference screenshots are bundled.
- `.agents/skills/animate/SKILL.md`: essential motion is simulation-driven; no new motion library; scenic parallax/wing beats/rotation respect Reduce motion.
- `.agents/skills/systematic-debugging/SKILL.md`: reproduced Ball Run's missed lateral collision, two-pattern obstacle generation, and nonfinite input corruption before fixing.
- `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md`: failing reproductions followed by deterministic model and actual input/browser verification.
- `.agents/skills/verification-before-completion/SKILL.md` and `requesting-code-review/SKILL.md`: fresh checks, evidence and a local review checkpoint for the parent's independent Astra review.

Upstream provenance and licences remain in `skills.lock.json` and the canonical skill folders. No standalone Three/Canvas procedural runner skill exists in this installation. Existing installed Three APIs are unchanged except instance pool capacity; `node_modules/three/src/objects/InstancedMesh.js` documents setMatrixAt/count/dispose. Native Canvas/Pointer/keyboard APIs follow existing game adapters.
