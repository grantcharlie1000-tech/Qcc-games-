# Flappy Bird: Christmas skin

## Skills invoked
- `using-superpowers`: session start, per AGENTS.md.
- `game-development`: read `game-art/SKILL.md` (silhouette, colour hierarchy, readability) and `2d-games/SKILL.md` (layering). These set the light winter palette: obstacles carry the strongest value contrast, the background stays pale, and the hat leaves the bird's silhouette readable.
- `systematic-debugging`: for the two failing browser tests (see Tests).
- `verification-before-completion`: before reporting.
- I did not invoke `svg-skill` (no SVG; everything is Canvas 2D) or `animate` (no new motion: clouds, flakes and dunes reuse the original drift and wave terms and stay still under reduced motion).

## What changed (files)
- `src/games/flappy-bird/christmas-art.ts` (new): the Christmas renderer.
  - Winter sky gradient and the low sun where the original sun was.
  - Still snowflakes that drift with the clouds.
  - Three snowy dunes with edge highlights and snow-dusted firs.
  - Red-tile snowy rooftop as the ground strip.
  - Brick chimneys with stone crowns.
  - The bird is drawn exactly as before, plus a Santa hat (`drawSantaHat`) on its head.
  - Bricks use one cached 2x `CanvasPattern`.
- `src/games/flappy-bird/art.ts`: one line, `if(christmas()){drawChristmasFlight(...);return;}`. The original drawing code is unchanged.
- `src/games/flappy-bird/christmas.css` (new; imported in `index.ts` right after `style.css`):
  - Evergreen scene border with a red base shadow.
  - Snow-white card with a red title and red button.
  - Sky-gradient surround with `--xmas-snowflakes-light`.
- `scripts/festive-evidence.mjs` (my line only): the action now flaps like a player, reading the bird's y, vy and target from the root's data attributes, so the shot shows active flight through gates.

## Guaranteed unchanged
- `model.ts` is untouched, so physics, gaps, scoring, saves and input are unchanged.
- Each chimney stack fills exactly the gate rectangle `(gate.x, 0, 64, gate.top)` / `(gate.x, gate.bottom, 64, FLOOR-gate.bottom)`, which is the box `sweepSphereBox` collides with.
- Each crown is exactly the original cap rectangle `(gate.x-3, cap, 70, 17)`.
- Snow sits inside the crown: its bumps reach `cap+1` and its drips `cap+11.5`. The frost fringe on hanging crowns sits at `cap+13…15.5`.
- Ground snow starts at `FLOOR`.
- Bird body, rotation and hitbox (radius 12) are untouched. The hat sits above the head and is drawing only.
- The scene stays light, so the dock keeps light glass. No shared-file change is needed.

## Tests
- `npx tsc --noEmit`: no errors in my files. One error elsewhere: `tests/games/animal-stack/tall-framing-festive.spec.ts` (another agent's work).
- `npx vitest run tests/games/flappy-bird tests/core/festive.test.ts`: 2 files, 13/13 passed. A combined run of my three games plus `festive.test.ts` gave 70/70.
- Playwright `tests/games/flappy-bird` on :4600: 9 passed, 2 failed.
  - Failing: "keyboard and mouse flap…" and "a real scored flight…".
  - On retry, "keyboard and mouse" passed once (1 passed, 27.7 s).
  - Root cause (systematic-debugging): the shared :4600 Vite dev server does full page reloads when other agents edit files.
    - Evidence 1: the failure screenshots show the restore card ("Your sky is waiting"), which appears only after a remount.
    - Evidence 2: the trace has one `goto` but two Vite client sessions.
    - Evidence 3: an idle page on :4600 reloaded once in 90 s, while :4601 did not.
  - The same two tests passed against the original code on :4601 (2 passed). That server never reloads.
  - A scripted copy of the scored-flight test, with the same fake clock and the same flap rule, scored on both servers in 6 of 6 runs.
  - Festive draw cost measured 0.22 ms/frame versus 0.70 ms for the original in the same page.

## Screenshots (inspected)
- `before-*.png` from :4601 and `after-*.png` from :4600, same seed and action.
- Checked:
  - Crown positions match the original caps.
  - Brick texture is crisp at DPR 2.
  - Snow on crowns does not cross into the gap.
  - Ground band has no seams. An earlier gap between snow band and drips was fixed.
  - Hat reads clearly and does not cover the eye.
  - Surround gradient continues the sky on desktop. The phone layout is unchanged.
- Detail crops: `detail-chimney-hat.png`, `detail-ground.png`.

## Known limitations
- The phone layout stretches the canvas vertically (original behaviour), so the hat and sun look slightly tall there, as the original art did.
