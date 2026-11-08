-- Legacy combined Minesweeper scores remain intact. New boards contain only
-- unassisted wins, encoded as 2147483647 - elapsed milliseconds (higher is better).
ALTER TABLE arcade_scores DROP CONSTRAINT arcade_scores_game_id_check;
ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK (game_id IN ('fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','minesweeper-easy','minesweeper-medium','minesweeper-hard','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','corn-clicker','slipline','quadfall'));
