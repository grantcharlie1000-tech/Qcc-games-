# Pool test results (remake, 2026-11-04)

Environment: Linux container, Node 22, Chromium 1243 (Playwright), Vite dev server. WebKit was not run.

| Command | Result |
| --- | --- |
| `npx vitest run tests/games/pool` | 30 passed (physics 9, rules 12, computer 5, online 4) |
| `npx vitest run` (whole repository) | 195 files, 4121 tests passed |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed |
| `CHROMIUM_PATH=… npx playwright test tests/games/pool --project=chromium` | 14 passed |
| Shared specs touching Pool (`ingame-glass`, `ingame-space`, `shell`, `viewport`, `arcade-sheets`, `study`) | 87 passed, 1 failed — the failure is Globle in `viewport.spec.ts` (“the entire game … must fit”), which fails identically on `main` |

What the browser tests drive (all through real pointer, touch or keyboard input; the dev-only `window.__pool` hook is used
only to read state and to set an exact aim for the 8-ball scenarios):

- Keyboard break; the rack settles with every ball on the cloth.
- Power cue: pulling and pushing back to the top cancels; pulling and releasing shoots.
- Aiming by dragging on the cloth; the fine-aim wheel nudges by a fraction of a degree.
- Ball in hand: dragging the cue ball to a clear spot, refusal of a spot on another ball, keyboard placement (H, arrows, Enter).
- On the 8: tapping a pocket calls it; sinking the 8 there shows the result card with the match score; Next rack alternates
  the break. Sinking it in an uncalled pocket loses.
- Spin picker sets follow and draw; Done closes it.
- The computer takes its turn from a saved position.
- A reload restores the saved table; switching to two players from the game menu names Player 2.
- Layout at 390×844, 1366×768, 844×390 and 768×1024: controls clear of the table, cards above it, nothing past the dock or
  the viewport edge, names not clipped.
- Trusted touch (CDP, DPR 3): finger aim and a power-cue shot with no page scroll.

Evidence: `tests/games/pool/evidence/chromium.png` (390×844).

Not covered here: physical touch hardware, WebKit/Safari, and audio output (sounds are synthesised and only checked for
not throwing).
