-- QCC chess: server-authoritative ranked games, matchmaking and Glicko-2 ratings.
-- Only the chess handler writes these tables. Casual, local and computer games never touch them.
CREATE TABLE chess_ratings (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 category text NOT NULL CHECK (category IN ('bullet','blitz','rapid','classical')),
 rating double precision NOT NULL DEFAULT 1500,
 deviation double precision NOT NULL DEFAULT 350 CHECK (deviation > 0),
 volatility double precision NOT NULL DEFAULT 0.06 CHECK (volatility > 0),
 games integer NOT NULL DEFAULT 0 CHECK (games >= 0),
 wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
 losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
 draws integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
 streak integer NOT NULL DEFAULT 0,
 best_rating double precision NOT NULL DEFAULT 1500,
 last_change double precision NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (account_id, category),
 CHECK (games = wins + losses + draws)
);
CREATE INDEX chess_ratings_board ON chess_ratings(category, rating DESC) WHERE games > 0;

CREATE TABLE chess_games (
 id uuid PRIMARY KEY,
 rated boolean NOT NULL DEFAULT true,
 category text NOT NULL CHECK (category IN ('bullet','blitz','rapid','classical')),
 base_ms integer NOT NULL CHECK (base_ms BETWEEN 30000 AND 10800000),
 increment_ms integer NOT NULL CHECK (increment_ms BETWEEN 0 AND 180000),
 white_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 black_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 moves text[] NOT NULL DEFAULT '{}',
 fen text NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 white_ms integer NOT NULL,
 black_ms integer NOT NULL,
 turn_started_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','aborted')),
 result text CHECK (result IN ('1-0','0-1','1/2-1/2')),
 termination text,
 draw_offer char(1) CHECK (draw_offer IN ('w','b')),
 white_offer_ply integer NOT NULL DEFAULT -1,
 black_offer_ply integer NOT NULL DEFAULT -1,
 white_rating double precision,
 black_rating double precision,
 white_change double precision,
 black_change double precision,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 CHECK (white_id <> black_id),
 CHECK ((status = 'active') = (result IS NULL AND finished_at IS NULL) OR status = 'aborted')
);
CREATE INDEX chess_games_white ON chess_games(white_id, created_at DESC);
CREATE INDEX chess_games_black ON chess_games(black_id, created_at DESC);
CREATE INDEX chess_games_active ON chess_games(status) WHERE status = 'active';

-- Idempotency: a retried command returns the original outcome instead of acting twice.
CREATE TABLE chess_commands (
 game_id uuid NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
 command_id text NOT NULL CHECK (command_id ~ '^[A-Za-z0-9_-]{8,64}$'),
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (game_id, command_id)
);

CREATE TABLE chess_queue (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 category text NOT NULL CHECK (category IN ('bullet','blitz','rapid','classical')),
 base_ms integer NOT NULL,
 increment_ms integer NOT NULL,
 rating double precision NOT NULL,
 joined_at timestamptz NOT NULL DEFAULT now(),
 seen_at timestamptz NOT NULL DEFAULT now(),
 game_id uuid REFERENCES chess_games(id) ON DELETE SET NULL
);
CREATE INDEX chess_queue_open ON chess_queue(base_ms, increment_ms, joined_at) WHERE game_id IS NULL;

REVOKE ALL ON chess_ratings, chess_games, chess_commands, chess_queue FROM PUBLIC;
