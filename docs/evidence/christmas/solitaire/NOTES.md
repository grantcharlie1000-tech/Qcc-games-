# Solitaire — Christmas skin

## Skills invoked
- `game-development`, with `game-art/SKILL.md` read. This was used for readability: card faces keep full value contrast, decoration stays off the play area, and the style is consistent. It was invoked again specifically for solitaire.
- `svg-skill`: the card back is the "pattern texture" scenario, a `<pattern>` lattice in `<defs>`; the holly sprig is a small illustration. Both files passed `validate.sh`. It was invoked again specifically for solitaire.
- `systematic-debugging`: the browser test timeout (see Tests).
- No motion was added, so `animate` was not used.

## What changed (visual only)
- `src/games/solitaire/christmas.css` (new; imported right after `solitaire.css`; every selector starts with `:root[data-festive="christmas"]`):
  - Evergreen felt: a vertical gradient with a faint woven texture. The `.game-surface` override uses the same felt, so the surround continues it.
  - A gold frame border and inner rim.
  - Two holly sprigs on the bottom table corners, as `::before`/`::after` with `z-index:-1` and `pointer-events:none`.
  - Card backs (`.sol-back`, covering the stock and face-down tableau cards) use `xmas-card-back.svg`: a red ground with a gold diamond lattice, small snowflakes, a gold inner border and a snowflake medallion. The ◆ rosette glyph is hidden only with `visibility:hidden`.
  - The stock count strip is deep red.
  - Gold outlines: foundation slots are solid gold, and the waste slot and column targets are faint gold dashes.
  - Labels are cream. The Undo, Hint and New deal buttons are recoloured red, gold and red; sizes are unchanged.
  - The rules are excluded from the drag ghost (`.solitaire.sol-drag-ghost`) via `:not(.sol-drag-ghost)`, so a dragged card shows no felt or holly. Checked in `detail-drag.png`.
- New art: `src/games/solitaire/xmas-card-back.svg` and `src/games/solitaire/xmas-holly.svg`.
- `src/games/solitaire/index.ts`: one line, `import './christmas.css';`.
- `scripts/festive-evidence.mjs` (solitaire entry only): follows four Hints by clicking the highlighted target, or draws when there is none, then draws twice.
- Cover/poster art is untouched.

## Guaranteed unchanged
- Card faces: ranks, suits, colours, fonts and layout are untouched (no face selector is overridden).
- Rules, model, hints, undo, scoring, saves, drag and drop, keyboard, the card stacking offsets (`--sol-y`) and grid sizes.
- Only colours, backgrounds, borders' colours and two non-interactive pseudo-elements were added.

## Tests
- `npx tsc --noEmit`: clean.
- `npx vitest run tests/games/solitaire tests/core/festive.test.ts`: 3 files, 30/30 passed.
- Playwright `tests/games/solitaire` on :4600 (`--output=/tmp/claude-0/pw-solitaire`): 8 passed and 1 failed. The failure was `play.spec:13`, the 30 s test timeout hit at a random step: once on `backToGames`, with the Games link visible in the failure screenshot.
- Root cause is the test's total duration under machine load (load average 10 to 15 with four agents). The test normally takes 21 to 32 s against a 30 s limit.
- Interleaved timing runs with `--timeout=90000` show no difference attributable to the skin:
  - Skin: 31.5 s, 21.8 s and 31.3 s.
  - With the festive import removed (HEAD solitaire): 32.5 s, 21.5 s and 20.8 s.
  - All runs passed.
- On the pristine :4601 the same test passed 2/2. No test was changed.

## Screenshots (inspected)
- `before-*.png` (:4601) and `after-*.png` (:4600): active deals after hints and draws.
- `compare-mobile.png`: before and after side by side.
- `detail-backs-desktop.png`: the card back pattern on the stock and on face-down strips.
- `detail-drag.png`: a card mid-drag on desktop.

What I checked:
- The faces are crisp and unchanged.
- Covered-card strips still read as a stack.
- The holly sits inside the frame (an earlier version was clipped at the bottom edge and was moved).
- Gold slot outlines are subtle.
- No seam between the felt and the surround.
- Dark dock glass stays legible.

## Known limitations
- The card back uses `preserveAspectRatio="none"` inside the 3px card border, so the lattice is stretched by under 2%. It is not noticeable.
