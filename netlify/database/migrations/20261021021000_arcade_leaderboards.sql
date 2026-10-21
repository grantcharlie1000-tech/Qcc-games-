CREATE TABLE arcade_players (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  name varchar(24) NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE arcade_scores (
  game_id text NOT NULL CHECK (game_id IN ('fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird')),
  player_id text NOT NULL REFERENCES arcade_players(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score > 0),
  reached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id,player_id)
);
CREATE INDEX arcade_scores_ranking ON arcade_scores(game_id,score DESC,reached_at,player_id);
-- Only the server function connects to this database. No browser credentials or public table grants.
REVOKE ALL ON arcade_players,arcade_scores FROM PUBLIC;
