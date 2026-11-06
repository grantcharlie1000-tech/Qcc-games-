# Snake — specification (v3, grid rework)

Goal: a Snake that plays and feels like the familiar search-engine Snake (smooth, quick, forgiving), in this arcade's own original artwork and existing colours.

## Rules and model (`model.ts`, pure)
- 16×16 grid, discrete steps of **135 ms** (≈7.4 squares/s). Start length 4 at (4,7) facing right; first apple at (11,7).
- The first arrow/WASD/swipe starts the run (a reversal into the neck is ignored) and the first step happens immediately. "Start slithering" starts straight ahead.
- **Turn buffer:** up to 3 turns, each checked against the last *queued* direction (no repeats, no reversals). One turn is consumed per step.
- **Late-turn grace:** a turn pressed within **50 ms** after the head passes a square centre, when the last step went straight and did not eat, is applied retroactively at that square (one-step undo), provided the corner is safe. Otherwise it is queued.
- **Bonk hold:** a step into a wall/body holds the head for one tick (135 ms). A safe turn in that tick escapes immediately; otherwise the next step ends the run.
- The tail square is free when the tail vacates it this step; after eating, the tail holds for one step per apple, so it is solid.
- Apples: +10 points and +1 length. Food spawns uniformly on free squares using a seeded mulberry32 RNG (advanced once per spawn). Filling all 256 squares wins.
- Frames longer than 250 ms are clamped and at most 4 steps run per frame, so tab switches never teleport the snake.
- Saves are version 3 (body, direction, queue, growth, food, score, step progress, seed, bonk). Restore validates all invariants; older v1/v2 continuous-geometry saves are rejected and a fresh game starts.

## Presentation (`presentation.ts`, `art.ts`)
- The head is interpolated from the previous square to the current one, and the tail from the vacated square, so the body slides continuously at constant length. Corners are rounded (radius ½ square); the last 2.5 squares taper to half width.
- Animations (all on a presentation clock that freezes while paused):
  - apple pops in with an overshoot (260 ms);
  - eyes track the apple and blink every 2.5–5.5 s; the head turns smoothly;
  - the head opens a jaw built from shared SVG path data (`head.ts`, previewed in `public/game-art/snake/mouth-poses.svg`). The jaw is an ellipse that grows from under the head, with one continuous outline, a dark mouth and two fangs. Opening follows position: it uses smoothstep over the last three squares, and only when the apple is ahead, so it reverses naturally if you turn away. The apple slides into the open mouth before it is swallowed, and the jaw snaps shut in 150 ms on cubic-bezier(0.23,1,0.32,1) with a head squash (160 ms). The visual eat waits until the drawn head reaches the apple;
  - a swallow bulge travels down the body; fruit flecks burst (320 ms) and a "+10" rises (600 ms);
  - on the ready card the snake flicks its tongue;
  - on death: X eyes, a short decaying board shake (280 ms), a soft flash (120 ms), the body dims, and the result card appears after 700 ms ("New best!" when beaten).
- Reduced motion (OS or app setting) turns off all decorative motion (pop, blink, mouth, bulge, flecks, "+10", shake, flash, tongue, card delay); movement itself is gameplay and stays.
- Colours are unchanged from the previous version, including the Christmas variant (bauble apples, red/green striped body, Santa hat).

## Controls
- Keyboard: arrows/WASD, repeats and modifier keys ignored, editable controls and open dialogs excluded.
- Touch: swipes fire on `pointermove` once the finger travels 20 CSS px on a dominant axis (≥1.3× the other), and the origin resets, so one drag can make several turns.
