# Gameplay correction record — 19 October 2026

This pass corrects Animal Stack, Water Sort, Color Blocks and Ball Run against the supplied gameplay stills, plus shared viewport/input behavior. The other eight game modules and the library artwork are preserved. It does not establish visual fidelity for games without detailed references.

## Reference and specialist boundaries

The supplied ZIP contained fourteen labelled PNGs, three contact sheets, a timed giraffe contact sequence and a README. It contained no original MP4 recordings. The parent and four assigned specialists inspected the relevant images. Exact source-video timing and the original tap-rotation increment remain unverified. Animal Stack uses an explicitly documented **45° browser tap rotation**; Q/E rotate in the same increments.

Four distinct specialists actually ran **GPT-6.1 Sol**, each in an isolated worktree, restricted to its game source, tests and artwork. Each independently inventoried the installed registry, read and applied actual local SVG/illustration, animation, game development, input and testing skills, and documented applicability gaps. The available physics/input skills are Phaser-oriented; native Matter.js/Pointer Events and Three.js implementation details were verified against actual installed source or official documentation. No third-party skill installer or new dependency was used. See each game's `SKILL_USAGE.md` for precise paths, sources and limits.

## Resulting behavior

| Game | Correction | Evidence |
|---|---|---|
| Animal Stack | Flat sky-blue scene, thin lime platform and deliberate DROP. Six original full silhouettes with distinct dimensions and explicit convex compound colliders. Waiting animals drag horizontally and tap-rotate; releasing a drag never drops. Rigid-body tipping, settling and falling remain physical. Keyboard and button activation share a repeat guard. | [Sprite preview](../tests/games/animal-stack/evidence/six-sprite-preview.png), [actual input/physics recording](../tests/games/animal-stack/evidence/actual-touch-tap-drop-tip-stable-fall.webm), [tall landscape](../tests/games/animal-stack/evidence/tall-844x390.png) |
| Water Sort | Slender outlined glass on aubergine, compact level controls, gold Undo/Hint. A legal pour moves and tips the source, transfers area-conserved scene-level liquid through a continuous stream, then returns. Original rules, verified levels and solver remain unchanged. | [Pour sequence](../tests/games/water-sort/evidence/correction-motion-sheet.jpg), [recording](../tests/games/water-sort/evidence/correction-pour-390x844.webm) |
| Color Blocks | Purple square board, bevelled cubes, smaller tray and full-size dragged footprint with exact legal preview. Consistent touch lift, valid snap, invalid return, cancellation and brief clear effects. Original rule engine remains unchanged. | [Portrait](../tests/games/color-blocks/evidence/correction-390x844.png), [mouse](../tests/games/color-blocks/evidence/mouse-drag.webm), [touch emulation](../tests/games/color-blocks/evidence/touch-drag.webm) |
| Ball Run | Genuine 3D indigo grid road, varied wireframe buildings, glossy magenta ball, magenta hazards and cyan acceleration gates. Continuous drag/held-key steering; ramps launch across navigable gaps without an invented jump control. Camera follows elevation; pooled geometry and explicit disposal remain bounded. | [Portrait](../tests/games/ball-run/evidence/390x844.png), [drag, held keys and ramp/gap](../tests/games/ball-run/evidence/ramp-gap.webm) |

Games occupy a fixed browser viewport without browser-native fullscreen. Background document scrolling is locked only during play, then restored for library and Study Mode. Landscape compositions preserve shape and physics proportions. The legacy eight layouts are uniformly fitted, including dynamic Solitaire piles, large scrollable Minesweeper boards and Pool's ball-in-hand controls. Pointer coordinates remain in the games' original logical units. Articles retain native scrolling and gestures.

## Save compatibility

Existing Animal Stack v1 piles use incompatible species/collision geometry and cannot be restored faithfully. Their previous score is retained as the record; the game explicitly explains that a fresh pile is required. New v2 piles serialize exact poses. Ball Run v1 runs preserve seed, distance and best while rebasing height onto the revised terrain. Other saves keep their existing formats. Study Mode retains the same mounted game instance across Esc/Return.

## Verification and limits

Final integrated results, build, offline checks and publication evidence are recorded in the release report.

Animal Stack’s neck-first, supported-on-elephant and off-edge recording segments use explicitly restored physical-pose fixtures in the actual mounted game; they are not claimed as an uninterrupted random run. The stable case asserts the giraffe’s entire body remains above the platform. A separate reachable five-animal save verifies tall-stack framing: the original landscape Canvas painted 1,239 animal pixels inside the HUD region; the corrected camera paints zero through rotations and resizing, without changing world scale or physics.

A first integrated run was interrupted for that camera correction. It also exposed a native PageDown test sent before a foreground/composited article frame. Source/trace inspection and eight independent native-key runs found no prevented event or application scroll lock. The browser test now foregrounds the tab, waits for a frame and asserts both real scrolling and `defaultPrevented === false`; five repeated runs passed. No Study runtime change was made.

Browser input evidence uses Linux Chromium, including trusted mouse/keyboard and Chromium CDP touch emulation. This is **not physical Chromebook or Mac testing**. WebKit could not launch because its executable is absent; official browser download hosts are restricted in this environment. Managed-device policies, real trackpads, Safari and sustained hardware performance remain unverified.

The software WebGL renderer produces variable frame times. Recorded scheduler samples and actual draw/geometry counts are measurements of this container, not a 60 FPS or Chromebook performance guarantee. Source recordings were unavailable, so new interaction clips demonstrate the implementation rather than exact original motion timing.

Offline operation is verified only after successfully caching the complete pack. Caches are browser/device/origin specific and may be evicted or disabled by policy. It cannot bypass device or network controls.

## Release results

The integrated139-case Chromium regression passed on source `0a0fb35`; final Water capture follow-up then passed 15 independent cases plus 4 shared viewport/Study cases. Final source `17440fb` passes 252 unit tests, typecheck/build, all 12 games and 20 chapters offline at both root/subpath, and the real two-version worker update. SVG validation 30/30. [Full report](DELIVERY.md), [machine-readable verification](evidence/correction/verification.json), [current publication evidence](NETLIFY_DEPLOYMENT.md).
