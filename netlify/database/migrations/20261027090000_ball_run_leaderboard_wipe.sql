-- Ball Run's leaderboard id is 'ball-run' (src/games/ball-run/index.ts and SCORED_GAMES).
-- arcade_scores has no difficulty column, so every Ball Run row is removed.
-- Synced per-account bests live in account_saves as 'best:ball-run' and are
-- submitted again on login, so they are backed up and removed too.
-- Run snapshots (save:ball-run), other games, and player rows stay. Rankings
-- are read from arcade_scores. There is no stored top-list table.
CREATE TABLE IF NOT EXISTS arcade_scores_ballrun_backup_20261027 (
  game_id text NOT NULL,
  player_id text NOT NULL,
  score integer NOT NULL,
  reached_at timestamptz NOT NULL,
  PRIMARY KEY (game_id, player_id, score, reached_at)
);
INSERT INTO arcade_scores_ballrun_backup_20261027 (game_id, player_id, score, reached_at)
SELECT s.game_id, s.player_id, s.score, s.reached_at
FROM arcade_scores s
WHERE s.game_id = 'ball-run'
ON CONFLICT (game_id, player_id, score, reached_at) DO NOTHING;
DELETE FROM arcade_scores WHERE game_id = 'ball-run';
CREATE TABLE IF NOT EXISTS account_saves_ballrun_best_backup_20261027 (
  account_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated bigint NOT NULL,
  PRIMARY KEY (account_id, key, updated)
);
INSERT INTO account_saves_ballrun_best_backup_20261027 (account_id, key, value, updated)
SELECT s.account_id, s.key, s.value, s.updated
FROM account_saves s
WHERE s.key = 'best:ball-run'
ON CONFLICT (account_id, key, updated) DO NOTHING;
DELETE FROM account_saves WHERE key = 'best:ball-run';
REVOKE ALL ON arcade_scores_ballrun_backup_20261027, account_saves_ballrun_best_backup_20261027 FROM PUBLIC;
