# Snake — Apple appetite

Classic bounded grid Snake for a portrait-friendly browser stage. The project brief is authoritative for the rule variant; external Snake variants are not treated as a single canonical standard.

- Garden: 16 × 16 cells. Start with three connected segments, facing right. The first apple sits four moves ahead so the objective is clear.
- Start with the start button, a valid arrow/WASD direction, a swipe, or a direction button. Left cannot start a reverse move.
- Advance exactly one cell per 160ms of active game time, independent of render FPS. No acceleration or wall wrapping.
- Eat one apple: keep the tail, gain one segment and 10 points. Seeded food selection enumerates only empty cells. Fill all 256 cells to win (2530 points).
- A wall or occupied body cell ends the run. The tail cell is legal when it is vacating on that move. Collision leaves the last valid body intact.
- At most two future turns are buffered. A turn cannot duplicate or reverse the most recently accepted direction. Only one queued turn is consumed each simulation tick; rapid input cannot reverse within a tick.
- Loss/win provides an immediate Play again action. Shell restart resets score, seed, food, queue, clock, body and phase. Best score belongs to the shell.
- Pause freezes input and the simulation accumulator. It cancels any partial swipe; accepted queued turns remain part of the saved run. Resume/restore establish a fresh wall-clock baseline so time outside the game is never caught up.
- Versioned snapshots contain body, food, seed, queue, direction, phase, score, ticks and fractional accumulator. Validation checks types, ranges, uniqueness, adjacency, queue legality and food exclusion. Invalid snapshots are ignored. Valid snapshots are copied.
- Arrows/WASD ignore repeats, modifiers, editable controls and open native dialogs. Direction buttons support primary pointer activation and keyboard clicks. Swipe needs an 18 CSS-pixel movement and uses the dominant axis. Pointer cancellation and pause discard the gesture.
- Responsive square Canvas uses logical 480px coordinates and a device-pixel ratio capped at 2. The 390px phone viewport leaves 366px for the stage. On-screen directions have 48px minimum targets.
- Original procedural artwork: shaded round green segments, expressive oriented eyes and smile, red apple with leaf/stem/highlight, quiet checker grass and garden rim. Apple shape and snake eyes provide non-colour cues.
- No decorative animation: reduced-motion users receive the same readable discrete grid movement without particles, pulsing, or screen shake. Sound goes exclusively through the shell's settings-aware context API.
- Dispose aborts every module listener, cancels RAF, and clears owned DOM. No global storage, external assets, runtime requests, timers, engine dependencies or shared toolbar duplication.
