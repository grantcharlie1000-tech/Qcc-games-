# Actual skill and research use

I independently ran `rg --files .agents/skills -g SKILL.md`, then read the files below before implementation. Sources/locked commits are from the repository's `skills.lock.json`. These are local skills, not invented external invocations.

- `.agents/skills/using-superpowers/SKILL.md`: read at session start; its dispatched-subagent exemption applies. Used the relevant testing and verification workflows without spawning agents.
- `.agents/skills/test-driven-development/SKILL.md` and `.agents/skills/test-driven-development/writing-good-tests.md`: real pure-rule tests preceded implementation; the initial stub produced ten expected assertion failures. Assertions target safe reveal, flood, chording and invalid saves. The later terminal-save regression was also observed red before the fix. The browser cases were authored before UI code, initially failing because no game existed; the early run also had server setup failures, recorded honestly in TEST_RESULTS.md.
- `.agents/skills/verification-before-completion/SKILL.md`: required fresh unit, browser and TypeScript evidence before committing.
- `.agents/skills/systematic-debugging/SKILL.md`: read when investigating browser failures. Distinguished Vite reload during active edits, incorrect test expectations, and pagehide save overwriting an injected malformed fixture from implementation defects.

Those four workflow skills come from https://github.com/obra/superpowers at `bb92a77741419a4ab5f06e711a283343f1ada0c3` (MIT).

- `.agents/skills/game-development/SKILL.md`: router selected DOM-based web/2D puzzle architecture and action-based input.
- `.agents/skills/game-development/web-games/SKILL.md`: lazy local assets, no runtime external calls, pause/lifecycle ownership; the frozen shell made another engine unnecessary.
- `.agents/skills/game-development/2d-games/SKILL.md`: logical tile coordinates and readable layering.
- `.agents/skills/game-development/game-design/SKILL.md`: observe/deduce/reveal feedback loop, player-selected difficulty, clear progress/outcome.
- `.agents/skills/game-development/game-art/SKILL.md`: soft vector palette, consistent asset scale, value contrast and symbolic redundancy. Three original standalone SVGs supply actual tile/flag/mine gameplay art. Parent explicitly owns the rejected cover remake, so cover.svg is unchanged here.
- `.agents/skills/game-development/mobile-games/SKILL.md`: larger 44/54 px target options, touch cancellation, portrait layout, scrolling and pause on interruption. Default cells are 34 px for compactness; users can select larger targets without document overflow.

These game guides come from https://github.com/vudovn/ag-kit at `549ba3dc2eb1d40fccb5b6d792eba4101c80cd69` (MIT).

- `.agents/skills/svg-skill/SKILL.md` and `.agents/skills/svg-skill/scenarios.md`: composed original scalable tile, flag and mine artwork, explicit viewBox, decorative accessibility, isolated gradient IDs and no raster/image-generation dependency; ran its validator on the actual art directory. Source https://github.com/linyaosky/svg-skill at `2103b92cb47f588a97a6c38aa6c40571fadbd4f8` (MIT).
- `.agents/skills/input-keyboard-mouse-touch/SKILL.md`: action abstraction, right-click menu suppression and drag/hold thresholds informed the DOM implementation. Phaser APIs were not imported.
- `.agents/skills/geometry-and-math/SKILL.md`: deterministic random state and explicit geometry reinforced seed snapshots and row/column bounds. This is a Phaser guide, not a standalone combinatorics or graph algorithm authority.

The last two come from https://github.com/phaserjs/phaser at `02d8931b626d9764c133cbb3fbf99966c03c757c` (MIT).

# Documentation used for missing specialties

No local dedicated combinatorics, graph traversal or accessible DOM grid skill was found. The following actual reads fill those gaps; reading documentation is not invoking a skill.

- GNOME Mines official rules: https://raw.githubusercontent.com/GNOME/gnome-mines/master/help/C/rules.page — eight-neighbor numbers, blanks, mine loss, completion by safe cells.
- CPython official source: https://raw.githubusercontent.com/python/cpython/main/Lib/random.py (`sample`, `shuffle`, `_randbelow_with_getrandbits`) — sampling without replacement and rejection before a bounded integer; adapted conceptually with a small seeded JS generator and partial Fisher–Yates, not copied Python APIs. Combinatorial subset reasoning is documented in SPEC.md; no solver or no-guess guarantee is claimed.
- NetworkX official BFS source: https://raw.githubusercontent.com/networkx/networkx/main/networkx/algorithms/traversal/breadth_first_search.py (`generic_bfs_edges`) — discovered-node tracking and breadth-first expansion. Applied an index-head queue and reveal-on-enqueue to a finite eight-neighbor field.
- W3C ARIA Authoring Practices grid pattern: https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/grid/grid-pattern.html — one tab stop, arrow movement, Home/End, focusable cells, row/cell semantics and coordinate labels.
- MDN official content sources: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/pointercancel_event/index.md and https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/element/contextmenu_event/index.md — cancel holds on scrolling/cancellation; prevent context menu default locally. Firefox Shift-right-click is a documented browser exception outside tested Chromium behavior.

Two attempted raw W3C Pointer Events branch URLs produced no usable excerpt; they were replaced with the MDN sources and are not evidence. Screen-reader hardware and WebKit are unavailable here. Parent performs independent integrated review; no additional specialist agent was spawned.

`.agents/skills/requesting-code-review/SKILL.md` was read at completion. Its independent review goal is fulfilled by a review request to the parent integrator, rather than dispatching another agent: the explicit specialist assignment forbids additional agents. Parent receives the requirements, baseline, final commit and evidence paths. No independent review is claimed before their response.

## 2026-10-27 improvement pass

Read the project's `using-superpowers`, `brainstorming`, `test-driven-development`, `verification-before-completion`, game-development router, web-games and 2d-games guides. The user's detailed implementation brief supplied the design and authorized implementation; no additional approval gate was introduced. Read `animate` and `svg-skill`; used native CSS/WAAPI feedback and reused the existing SVG art. Read the cloud-environment runtime/networking skill for execution setup and Netlify database skill for migration conventions and local integration tests. No hosting/deployment action or production data change was made.

Read `requesting-code-review` and dispatched an independent read-only reviewer as required by AGENTS.md. Their practice-save, pause-control and assistive-click findings were fixed and checked; a proposed account constraint issue was withdrawn after examining the later existing migrations. Final review reported no remaining critical/important issue. Verification details and limits are in TEST_RESULTS.md.

## 2026-10-28 UI simplification

Applied the same project UI/verification guidance to the user's request to remove clutter. Reused native dialog focus handling and the existing QCC actions; added optional menu/pause hooks to the game interface instead of replacing shared account or fullscreen logic. Independent reviewer checked native close-event ordering, pause/resume, Escape, focus, transitions and disposal in Chromium; no critical/important findings remained.
