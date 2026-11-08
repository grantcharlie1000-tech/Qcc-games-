-- Extend the installed leaderboard allowlist by one game, preserving its restrictions.
-- The deployment runner applies this once under its transaction/advisory lock.
DO $$
DECLARE allowed text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO allowed
 FROM pg_constraint
 WHERE conrelid='arcade_scores'::regclass
   AND conname='arcade_scores_game_id_check' AND contype='c';
 IF allowed IS NULL THEN
  RAISE EXCEPTION 'Leaderboard game constraint missing; refusing to replace its allowlist';
 END IF;
 ALTER TABLE arcade_scores DROP CONSTRAINT arcade_scores_game_id_check;
 EXECUTE format('ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK ((%s) OR game_id = %L)', allowed, 'last-light');
END $$;
