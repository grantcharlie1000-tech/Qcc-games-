-- SCHEMA CHANGE: NEEDS CHARLIE APPROVAL before application. Never run against a remote DB from this task.
-- Femboy Frosthop joins the shared rankings. Same complete list as 20261104090000_quad_clash_score.sql, plus 'femboy-obby'.
-- Its scores are 2147483647 minus the Time Trial milliseconds, so the existing MAX-and-descending board ranks faster times higher.
ALTER TABLE arcade_scores DROP CONSTRAINT IF EXISTS arcade_scores_game_id_check;
ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK (game_id IN ('fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','minesweeper-easy','minesweeper-medium','minesweeper-hard','minesweeper-score','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','corn-clicker','slipline','quadfall','crossy-road','claimline','quad-clash','femboy-obby'));
