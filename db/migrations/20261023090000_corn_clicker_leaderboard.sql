ALTER TABLE arcade_scores DROP CONSTRAINT arcade_scores_game_id_check;
ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK (game_id IN ('fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','corn-clicker'));
