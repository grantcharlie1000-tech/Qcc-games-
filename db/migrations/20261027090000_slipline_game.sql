ALTER TABLE arcade_scores DROP CONSTRAINT arcade_scores_game_id_check;
ALTER TABLE arcade_scores ADD CONSTRAINT arcade_scores_game_id_check CHECK (game_id IN ('fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','corn-clicker','slipline'));
ALTER TABLE account_saves DROP CONSTRAINT account_saves_key_check;
ALTER TABLE account_saves ADD CONSTRAINT account_saves_key_check CHECK (key IN ('settings','favourites') OR key ~ '^(best|save):(fruit-merge|water-sort|color-blocks|tower|snake|neon-coil|minesweeper|solitaire|block-fill|color-connect|ball-run|pool|animal-stack|flappy-bird|globle|blockcraft|maze-muncher|corn-clicker|slipline)$');
