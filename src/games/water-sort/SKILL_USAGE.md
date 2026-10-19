# Actual skill and documentation usage

Registry discovery: `rg --files .agents/skills -g SKILL.md`, executed independently
in this worktree before implementation. Provenance below comes from the local
`skills.lock.json`. Project `AGENTS.md`, `ARCHITECTURE.md`, `GAME_AGENT_GUIDE.md`,
`TEST_PLAN.md` and `src/core/types.ts` were read as project instructions/API, not
claimed as skills.

| Skill read | Upstream provenance | Concrete use |
| --- | --- | --- |
| `.agents/skills/using-superpowers/SKILL.md` | obra/superpowers @ bb92a77741419a4ab5f06e711a283343f1ada0c3 | Read at start; its SUBAGENT-STOP exempts dispatched specialists from its orchestration. Used relevant local domain/workflow guides under project instructions. |
| `.agents/skills/game-development/SKILL.md` | vudovn/ag-kit @ 549ba3dc2eb1d40fccb5b6d792eba4101c80cd69 | Router selected web, 2D, design, art and mobile guides; separates input, model and rendering; finite guarded phases. |
| `.agents/skills/game-development/2d-games/SKILL.md` | same ag-kit source | Clear silhouettes and separated decorative glass/liquid layers; no unnecessary physics engine. |
| `.agents/skills/game-development/game-design/SKILL.md` | same ag-kit source | Observe/pour/feedback/reward loop, selectable difficulty, early three-pour win, gradual 3–14 pour progression. |
| `.agents/skills/game-development/game-art/SKILL.md` | same ag-kit source | Consistent purple glass setting, high-contrast liquid palette, redundant letters and patterns rather than colour alone. |
| `.agents/skills/game-development/web-games/SKILL.md` | same ag-kit source | Small DOM/SVG implementation, no runtime network, no continuous idle loop, shell-managed visibility/audio/storage. |
| `.agents/skills/game-development/mobile-games/SKILL.md` | same ag-kit source | Tube hit widths at least 64px, native controls at least 44px, centred wrapping rows, cancellation on interruption. |
| `.agents/skills/svg-skill/SKILL.md` | linyaosky/svg-skill @ 2103b92cb47f588a97a6c38aa6c40571fadbd4f8 | Hand-authored original viewBox SVG tubes, unique clip/gradient IDs per tube, curved transfer path, decorative aria-hidden and semantic button descriptions. Parent now owns coordinated cover remake. |
| `.agents/skills/animate/SKILL.md` | emilkowalski/skills @ 2d228630ba1446365f614a108cb8252f1feda202 | Purpose is spatial consistency/feedback; only a 260ms transfer animates, using transform/opacity plus SVG path geometry; reduced-motion/keyboard remove glass movement. No animation library. Pause freezes model progress and stops RAF. Explicit user-required liquid animation takes precedence over the guide's blanket frequent-action gate. |
| `.agents/skills/input-keyboard-mouse-touch/SKILL.md` | phaserjs/phaser @ 02d8931b626d9764c133cbb3fbf99966c03c757c | Read actual input guide; adopted unified action and cancellation principles. It is Phaser-specific, so no claim that its APIs apply to the standalone DOM game; used native PointerEvent and button APIs. |
| `.agents/skills/test-driven-development/SKILL.md` and `writing-good-tests.md` | obra/superpowers commit above | Rules, construction/search and session started with stub-backed red runs; literal expected stacks, genuine transitions and independent BFS avoid self-verification. Restore-after-victory regression observed red then fixed. |
| `.agents/skills/systematic-debugging/SKILL.md` | same superpowers source | Read full failure/trace for pause browser test; confirmed the test let virtual time run before clicking pause, then paused the clock explicitly. Core pause logic was already covered by elapsed-time tests. |
| `.agents/skills/verification-before-completion/SKILL.md` | same superpowers source | Actual targeted/full Vitest, typecheck, real Chromium interactions, screenshots and measured evidence recorded before handoff. |
| `.agents/skills/requesting-code-review/SKILL.md` | same superpowers source | Prepared exact scope/evidence for parent independent review. Parent expressly prohibits specialist spawning, so no additional review agent was created. |

## Registry gaps

There is **no dedicated Water Sort, constraint-solving, BFS/IDA*, or standalone
DOM-input skill** in the actual registry. This is disclosed instead of claiming
an invented skill. The deterministic reverse constructor, BFS, immutable rules
and independent verifier are original implementations applying established
graph-search reasoning. Phaser engine source maps are not used as standalone
DOM APIs.

## Documentation actually read, separately from skills

- Water Sort rules/source:
  `https://raw.githubusercontent.com/tanjuntao/water-sort-puzzle/master/README.md`,
  `.../bottle.py`, `.../board.py`. Establish bottom-up arrays, exposed top run,
  capacity four and same-colour goal. The requested partial-pour variant is
  documented explicitly in SPEC.md; source code was not copied.
- MDN Pointer Events:
  `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/pointer_events/index.md`.
  Checked pointerup/cancel, implicit capture, keyboard-triggered click and
  touch-action; elementFromPoint chooses the real drag destination.
- MDN RAF:
  `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/window/requestanimationframe/index.md`.
  Checked one-shot scheduling, timestamp deltas and cancellation; resume resets
  the time origin, and idle games schedule no frame loop.
- MDN AbortController:
  `https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/abortcontroller/index.md`.
  Read lifecycle cancellation interface; TypeScript DOM definitions type-check
  the listener signal options.

Two exploratory raw URLs (kociemba/WaterBallSortPuzzle README and
aimacode/aima-python `search.py` on master) returned 404 and are **not** cited as
research evidence. All successfully used documentation was read 2026-10-19.
