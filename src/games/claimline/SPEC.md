# Claimline

An original territory-capture game for QCC: one fixed circular arena, the human against six local rule-based bots, scored by the share of the arena you hold. Built from Charlie's gameplay brief of 2 November 2026; the art, names and code are our own. Vanilla TypeScript and Canvas 2D, no dependencies.

## Rules as built

- **Arena.** A circle of radius 56 cells on a 116 x 116 integer ownership grid (`Uint8Array`). A cell is playable when its centre lies strictly inside the circle (9,856 cells). Outside cells are never owned.
- **Start.** Everyone starts on a radius-3 disc of their own land; the human at half radius, bots spread around the circle.
- **Leave, loop, return.** Leaving your land lays an exposed trail (a centreline polyline) from the last point on your land. Re-entering any of your land, including a disconnected patch, captures: every playable cell within 1 cell of the trail becomes yours, then a 4-connected flood from outside the circle marks everything reachable without crossing your land or trail band; every playable cell it cannot reach becomes yours. Enemy cells inside are stolen. Each cell changes owner at most once per capture, and area counts change only through `setOwner`, once per cell.
- **Self-crossing** is safe and simply makes more enclosed regions.
- **Trail cut.** Any head (human or bot, including the victim's own attacker) that comes within 0.6 cells of another player's exposed trail eliminates the trail's owner. The victim's trail is cleared and all of its remaining land goes to the attacker, with a short takeover flash.
- **Head contact** has no death rule; a hit within 1.2 cells of the victim's own head is treated as head contact and ignored, so the last ~1.2 cells of a trail behind its head cannot be cut.
- **Zero land is defeat.** If a capture takes a player's last cell, that player is eliminated (reason "land").
- **Edge.** Heads stay within radius 55.75 and slide along the edge: the heading is projected onto the tangent and speed stays at the normal 8 cells/s (no boost). Because the trail band reaches 1 cell, a trail sliding along the edge seals every playable cell between it and the outside, so loops that touch the edge fill correctly.
- **Thin gaps** under about a cell between a trail and its owner's land are sealed by the trail band.
- **Same rules for everyone.** Speed 8 cells/s, turn rate 4.2 rad/s, hit radius 0.6 and trail band 1 cell apply to the human and every bot.
- **Score.** Territory % = 100 x owned playable cells / all playable cells. Trails and outside cells never count, and theft can lower it. The HUD shows the current share and a ranking of all seven players. The score reported to the shell (`context.setScore`) is the human's **peak** share in hundredths of a percent (12.34% = 1234), via the pure `leaderboardScore(world)`, which only reads the human player.
- **End.** The run ends when the human is eliminated or holds the whole arena. Results show peak, final share, rank and time. Bots respawn 3 s after defeat on a free neutral disc at least 10 cells from every head and 8 cells from every exposed trail; the human does not.

## Timing and collisions

`requestAnimationFrame` drives an accumulator with a fixed 1/60 s step. Each frame simulates at most 0.25 s, in fixed sub-steps, every one of them swept; any longer stall beyond that is dropped rather than simulated. Each step moves every head, then:

1. samples the head's swept segment every 0.25 cells to find where it left or re-entered its land;
2. tests the swept segment analytically against every other player's trail segments (swept circle vs capsule, `sweepHit`), so a fast step can't jump a trail; the victim's newest section only counts once the victim has laid it;
3. orders cut and return-home events by their time along the step (return wins an exact tie) and applies them in order. A victim that reaches home first survives and captures; an attacker that crosses first eliminates it.

## Bots

These are rule-based and deterministic (seeded Mulberry32 kept in the world state). Each bot replans every 0.1-0.2 s (5-10 Hz) and only sets a target heading, so its motion stays smooth. Each bot has its own aggression, loop size and reaction delay. A bot:

- plans short loops toward open or enemy ground;
- heads home once its trail is long or a head comes near;
- intercepts a trail point it can reach before that trail's owner gets home.

Bot names and scores never leave the match.

## Rendering and input

- **Territory:** cached in an offscreen canvas that is re-rendered only when `landVersion` changes. Outlines are marching squares, relaxed by a short moving average and Chaikin-smoothed, drawn with a darker offset rim and a thin outline. Trails, heads, labels and effects are drawn each frame. DPR is capped at 2.
- **Effects:** capture flash 220 ms, takeover 300 ms, defeat burst 400 ms. All are off with reduced motion. Each player also carries a shape mark, so players can be told apart without colour.
- **Input:** mouse steers toward the pointer, arrows/WASD steer in 8 directions, and touch or pen uses a floating thumbstick with pointer capture. pointerup, pointercancel and lostpointercapture all release the stick, and the heading is kept on release. The play surface is `touch-action: none` and the page never scrolls. P pauses. Blur and hidden pause through the shell. Escape is left to the shell (Study).

## Leaderboard

Claimline is a scored game on the shared leaderboard and uses the existing Leaderboards dialog and `LeaderboardSync` as-is. The submitted score is the human's peak share in hundredths of a percent, shown as a percentage by `formatScore`. Bots are never submitted.

The production database only accepts `claimline` scores after `netlify/database/migrations/20261102090000_claimline_leaderboard.sql` adds it to `arcade_scores_game_id_check`. Until then:

- **Server.** An insert that fails that specific constraint (`23514` on `arcade_scores_game_id_check`) gets a 409 with `code: 'leaderboard-not-open'`. Every other failure is still the generic 503. Reads work and return an empty board.
- **Client.** `LeaderboardSync` parks only that game for 15 minutes, keeps its best queued, raises no error and applies no shared backoff, and goes on sending other games' scores. A fresh page load retries straight away.
- **What players see.** The Leaderboards dialog shows its normal empty state ("No scores yet"), and the local best is kept as usual.

Once the migration is applied, the next retry (or page load) delivers the queued best with no code change.

## Tests

- `tests/games/claimline/*.test.ts`: capture and fill, theft, percentages, self-crossing, cuts and land transfer, low-frame-rate cuts, cut vs return ordering, edge sliding, edge loops, thin gaps, zero land, leaderboard value, bots, snapshots and outlines.
- `*.spec.ts`: desktop and phone smoke tests (keyboard, mouse, thumbstick, pause, restart, Escape, no scroll, cancelled touch).

## Shell chrome

The shared glass dock (Games, live HUD, Menu) replaces the old top bar; its HUD mirrors the host score (peak share) and rank. The in-arena Your land card and ranking panel keep their own layout and look. The start card has one title, a short line and one Play / Continue / Play again action, with a controls footnote for the current device only: no tagline and no numbered guide. Pause, restart, rules and favourites live in the dock Menu.
