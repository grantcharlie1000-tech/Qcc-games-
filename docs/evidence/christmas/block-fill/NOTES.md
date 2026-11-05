# Block Fill — Christmas skin

## Skills invoked
- `using-superpowers`: session workflow.
- `game-development` (Skill tool), and I read its nested `game-art/SKILL.md` (palette and readability choices) and `3d-games` guide (read for Ball Run in the same session).
- `svg-skill`: the board is inline SVG built as a string. I followed its defs and gradient guidance: short unique ids (`bfx-*`), shared gradients in `<defs>`, and no filters or blur.
- `requesting-code-review`: invoked, but this agent has no subagent tool, so no independent review was dispatched. The lead should run one.
- `verification-before-completion`: invoked before reporting, and every result below is from a fresh run.
- `systematic-debugging`: invoked for the browser failures (see Tests).
- `animate` was not used because no motion was added.

## What changed
- `src/games/block-fill/christmas.ts` (new): `festiveBoard(level, path, selected)` returns the festive board markup.
  - Icy cells: an ice gradient with a frost-sheen arc.
  - Covered cells: warm lit cells.
  - Walls: navy crosshatch.
  - The trail is drawn as a green light cable with coloured bulbs (`BULBS`). Each bulb has a socket cap and a radial-gradient glow.
  - The start bulb is gold and labelled "S", and the head is a large warm-white bulb with a gold ring. Numbers are white with a dark outline.
  - The hint marker is red, so it shows on the pale ice.
- `src/games/block-fill/index.ts`: imports `christmas.css`. When `christmas()` is true, `render()` uses `festiveBoard(...)`. The original markup is unchanged in the else branch.
- `src/games/block-fill/christmas.css` (new): a night-blue panel with snowflakes, a navy board frame, evergreen secondary buttons, a gold border on completion, and pale message text. Every selector is scoped under `:root[data-festive="christmas"]`.

## Guaranteed unchanged
- Level data, rules, scoring and saves: `logic.ts` is untouched.
- Input: pointer mapping, keyboard and buttons are untouched.
- The SVG viewBox and cell coordinates are identical (cell at `12+col*64`, rect `x+4,y+3,56x56`).
- Every `data-cell` group and its aria-label is identical, and the board's `data-*` attributes and aria-label are unchanged.

## Tests
- `npx tsc --noEmit`: no errors in ball-run, pool or block-fill. The only error is in another agent's file, `tests/games/animal-stack/tall-framing-festive.spec.ts` (missing module `christmas-art.ts`).
- `npx vitest run tests/games/ball-run tests/games/pool tests/games/block-fill tests/core/festive.test.ts`: 17 files, 155 of 155 tests passed (final run).
- Environment note: the live dev server (4600) full-reloads the page every 25–40 s because other agents are editing concurrently. A watcher page saw 8 reloads in 4 minutes. The pristine 4601 server does not reload. The load average was 12–22 throughout.
- Browser: first run of `playwright test tests/games/block-fill` on 4600: 26 passed, 1 failed.
  - The failure was "all thirty-two gardens … real pointer input", a 180 s timeout at garden 24.
  - The ORIGINAL code (4601) also timed out at the same moment, at garden 29.
  - Rerun of `block-fill.spec.ts` on 4600 at lower load: 6 of 6 passed, including the 32-garden test.
- Render cost measured (systematic-debugging; same server, theme toggled, 200 undo+step pairs on garden 15):
  - synchronous render about 8–10 ms festive against 6–8 ms original per pair;
  - frame time about 16–19 ms in both (vsync-bound).
  - First hypothesis (the glow circles) was tested and rejected: removing them made no difference.
  - The extra cost is the larger SVG markup (bulb caps, glows, gradients), which is modest.

## Screenshots
- `before-*.png` and `after-*.png` (1440x900 and 390x844): the evidence action traces part of garden 1 with arrow keys and then presses Hint, so the trail, head bulb and hint marker all show.
- `detail-walls-trail.png` and `detail-walls-trail-before.png`: garden 15 (7x7, with walls) restored from a save with a 12-square trail, 390 px wide at DPR 2.
- What I checked: open, covered and wall cells are clearly distinct by luminance as well as hue (walls dark, open pale cool, covered pale warm). Numbers are legible on every bulb colour. The cable joins line up with cell centres. The red hint dashes are visible on ice. Nothing clips at the board edge.

## Known limitations
- Bulb glows are static radial gradients, with no animation.
- The snowflake tile on the panel and on the copied surround is centre-anchored. A flake can be cut at the panel edge.
