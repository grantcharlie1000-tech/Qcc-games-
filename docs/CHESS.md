# Chess

`src/games/chess/` is a full chess game registered as `chess` (`#/game/chess`, canonical `#/collection/29`). It is a fill game in the shared shell: the shell owns the dock, pause overlay, rules, settings and saves; the game owns its menus, board and online play.

## Modes

| Mode | Authority | Rated | Saved |
| --- | --- | --- | --- |
| Computer | This device. Moves come from engines through `src/chess-ai` ([contract](CHESS_AI_INTEGRATION.md)) | No | Yes, resumable |
| Pass and play | This device | No | Yes, resumable |
| Friend | The host's browser, over the shared WebRTC room (`src/multiplayer/`) | No | Finished games only |
| Ranked | The chess server, against Postgres | Yes | On the server |

Finished local, computer and friend games are kept on the device (last 30) and open from **My games** for review. Ranked games are listed from the server.

## Files

| File | Role |
| --- | --- |
| `rules.ts` | Trusted rules layer over chess.js 1.4.0 (BSD-2-Clause). UCI moves, SAN, FEN, PGN, repetition counts, automatic ends (mate, stalemate, insufficient material, fivefold, 75-move) and claims (threefold, 50-move), timeout against insufficient mating material. Shared by every mode and the server. |
| `match.ts` | `LocalMatch`: rules plus clock, draw offers, takebacks, pause, validated snapshots. |
| `time-control.ts` | Presets, rating categories (base + 40 × increment: under 3 min bullet, under 8 blitz, under 25 rapid), the local clock. |
| `session.ts` | The `Session` interface the screen talks to; `LocalSession` (local and computer) and `ArchiveSession` (review). |
| `board.ts` | DOM board: tap, mouse and touch drag, keyboard, premoves, promotion chooser, right-drag arrows and circles, highlights. It reports intents; the session decides legality. |
| `screen.ts` | The playing and review screen: players, clocks, captured pieces, material, move list, actions, draw prompts, premove execution, sounds, export. |
| `app.ts` | `GameInstance`: menus, setup screens, lobbies, matchmaking, leaderboard, history, settings, save and restore. |
| `analysis.ts` | Post-game analysis through the optional analysis provider; evaluation graph and move judgements from real engine output only. |
| `online/friend.ts` | Friend games: host-authoritative `LocalMatch`, guest commands validated by the host, rematch with colour swap. |
| `online/ranked.ts` | Ranked client: API wrapper and `RankedSession` (polling, optimistic move, retry with the same command id). |
| `online/server.ts` | Ranked server handler. |
| `online/glicko.ts` | Glicko-2 (Glickman 2012), checked against the paper's worked example. |
| `pieces.ts`, `style.css`, `sound.ts` | Original piece silhouettes, themes and layout, synthesized move sounds. |

## Ranked play

The ranked server is `createChessHandler(db)` in `online/server.ts`, served at the same-origin route `/.netlify/functions/chess` (Netlify adapter `netlify/functions/chess.mts`; the Cloudflare Pages proxy allowlist in `functions/_middleware.ts`). Tables come from `netlify/database/migrations/20261116090000_chess_ranked.sql`.

- **Identity.** Every call resolves the QCC account from the bearer session (`resolveAccount`). Guests cannot queue, move or affect ratings. Only the two players can read or act on a game.
- **Commands.** Each command runs in one transaction with the game row locked. It must carry the current `revision` and a unique `commandId`; a repeated id returns the current game instead of acting twice, and a stale revision is refused. Moves are checked with `rules.ts` against the stored move list. There is no endpoint that accepts a result.
- **Clocks.** Time is the database clock. The clock starts after both first moves; the mover is charged from `turn_started_at` to the moment the move commits, then gets the increment. Network delay counts against the mover; nothing the client sends changes a clock. Timeouts are applied whenever the game is read or acted on, under the row lock, so a late move cannot beat its own flag. A flag against a side that cannot mate is a draw. Pausing, hiding the tab or opening Study never stops a ranked clock; the shell's pause overlay says so.
- **Abort.** Before both first moves the game can be aborted, and a player who does not move within 30 seconds aborts it. Aborted games are unrated.
- **Settlement.** A game leaves `active` exactly once (`UPDATE ... WHERE status = 'active'` under the lock). In the same transaction both rating rows are locked in a fixed order and updated with Glicko-2. Ratings, record, streak and best rating live in `chess_ratings`, per category. The game row stores each player's rating before and the change, which is the rating history.
- **Matchmaking.** `chess_queue` holds one row per searching player. Pairing for a time control is serialized with a transaction advisory lock. Players match when both are within each other's window, which starts at ±100 and widens by 50 every 5 seconds of waiting, to ±1000. Searchers must poll; a row not seen for 20 seconds is ignored.
- **Limits.** 400 requests per account per minute in the handler, plus the platform IP limit. Bodies are capped at 1 KiB.
- **Client.** The client polls the game about every 0.7 s while the opponent moves and every 2.5 s on its own turn (5 s in a hidden tab), and draws the clock locally between answers. After a refresh, the game reopens from `action=me`.

Ratings are QCC chess ratings. They start at 1500 with deviation 350; a `?` marks provisional ratings (deviation 110 or more). They are not FIDE or any other site's ratings.

### What needs to happen before ranked play is live

Ranked play needs the chess handler deployed where `QCC_API_ORIGIN` points and the migration applied there. Production routes `/.netlify/functions/*` from Cloudflare Pages to a separate backend ([backend hosting](BACKEND_HOSTING.md)); that backend is built from another branch, so this branch alone does not deploy the chess route. Until it is deployed, the Ranked and Leaderboard screens say ranked chess is not available. The migration needs owner approval before it is applied, like the other migrations.

## Friend games

The host creates a room (colour and time control), and the guest joins with the six-character code or the invite link `#/game/chess?room=CODE`. The host's browser runs the only match and answers every guest command with the full state, so a refused command snaps the guest back. A guest who drops can rejoin the same room and keep their colour. Rematches swap colours. Friend games are never rated.

## Computer play

The setup screen lists the opponent tiers from `CHESS_AI_OPPONENTS` with their real availability. Uninstalled opponents are disabled and marked "Not installed"; with no engines the Play button is disabled. Replies are validated twice (legal list in the loader, rules in the game) and replies for an older position are dropped. Hints appear only when an analysis provider is installed. Development builds can use the test-only mock engine with `localStorage['qcc:chess:mock-ai'] = '1'`; production builds do not contain it.

## Layout

On phones and portrait screens the board runs edge to edge. The move list is a strip along the top, each player's name, captured pieces and a large clock sit directly above and below the board, and one row under it holds Options, Undo (or Hint or Flip), Back and Forward. Every other game action (draw, resign, share, board settings, review) is in the Options sheet. The shell's dock stays the only toolbar below. On wide screens a side panel holds the moves and actions; on landscape phones the players and clocks move beside the board so it can use the full height.

## Accessibility and motion

The board is keyboard playable (arrow keys, Enter, Escape) with spoken square and move announcements. Every action has a labelled button. Piece moves slide for 170 ms, captures fade, the check square pulses once, and sheets spring in. Reduced motion (system or QCC setting) removes animation; reduced transparency (system or QCC setting) replaces glass with solid panels. The default board is flat tan with a dark frame and bold outlined pieces with a soft offset shadow. The high-contrast theme uses white and deep blue squares with strong highlights.

## Tests

```sh
npx vitest run tests/games/chess tests/chess-ai
ARCADE_URL=http://127.0.0.1:<port> npx playwright test tests/games/chess --project=chromium
```

- `rules.test.ts`: every piece, castling restrictions, en passant, underpromotion, mate, stalemate, repetition, 50/75-move rules, insufficient material, FEN, PGN, undo.
- `clock-rating.test.ts`: categories, clock arithmetic, Glicko-2 against the published example.
- `session.test.ts`: the game side of the AI contract with the mock provider (exact request, illegal replies refused, stale replies dropped, failures, disposal), local match clocks, saves and draws.
- `server.test.ts`: the ranked handler on a real local Postgres with every migration: guests, turns, legality, duplicate commands, forged results, checkmate settlement, draws, resignation, abort, server timeouts, increments, matchmaking range.
- `play.spec.ts`: browser play by tap, drag and keyboard, promotion, saves across reload, the no-engine state, a computer game with the test engine, review.
- `ranked.spec.ts`: two isolated browser contexts against the real handlers and Postgres: matchmaking, synced moves, premove, server clocks, forged command refusal, reload recovery, draw, resignation, rating changes, leaderboard.
- `friend.spec.ts`: two Chromium processes over real WebRTC and PeerJS Cloud: create, join by link, moves, draw decline, resignation, rematch.
