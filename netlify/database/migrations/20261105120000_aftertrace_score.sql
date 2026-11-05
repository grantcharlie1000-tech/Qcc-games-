-- SCHEMA CHANGE: NEEDS CHARLIE APPROVAL before application. Never run against a remote DB from this task.
-- Aftertrace adds a scored original game. Preserves the complete allowed list from 20261104090000_quad_clash_score.sql.
ALTER TABLE arcade_scores DROP CONSTRAINT IF EXISTS arcade_scores_game_id_check;
ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK (game_id IN ('fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','minesweeper-easy','minesweeper-medium','minesweeper-hard','minesweeper-score','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','corn-clicker','slipline','quadfall','crossy-road','claimline','quad-clash','aftertrace'));
