-- Owner approval is required via QCC_APPROVED_MIGRATIONS before remote application.
-- Add only Frosthop. Preserve the deployed allowed-game expression, including
-- games intentionally still closed, and retain every existing score.
DO $$
DECLARE
  previous_check text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous_check
    FROM pg_constraint
    WHERE conrelid = 'public.arcade_scores'::regclass
      AND conname = 'arcade_scores_game_id_check' AND contype = 'c';
  IF previous_check IS NULL THEN
    RAISE EXCEPTION 'Expected arcade_scores_game_id_check is missing; inspect the schema before opening Frosthop';
  END IF;
  ALTER TABLE public.arcade_scores DROP CONSTRAINT arcade_scores_game_id_check;
  EXECUTE format(
    'ALTER TABLE public.arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK ((%s) OR game_id = %L)',
    previous_check, 'femboy-obby'
  );
END $$;
