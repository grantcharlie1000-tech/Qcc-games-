CREATE TABLE accounts (
 id uuid PRIMARY KEY,
 username varchar(24) NOT NULL CHECK (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
 password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
 player_id text NOT NULL UNIQUE REFERENCES arcade_players(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_username ON accounts(lower(username));
CREATE TABLE account_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX account_sessions_account ON account_sessions(account_id);
CREATE INDEX account_sessions_expiry ON account_sessions(expires_at);
-- Counter subjects are hashes of normalized usernames or platform client IPs.
CREATE TABLE account_attempts (
 subject text PRIMARY KEY,
 attempts integer NOT NULL CHECK (attempts > 0),
 started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_attempts_expiry ON account_attempts(started_at);
CREATE TABLE account_saves (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 key text NOT NULL CHECK (key IN ('settings','favourites') OR key ~ '^(best|save):(fruit-merge|water-sort|color-blocks|tower|snake|neon-coil|minesweeper|solitaire|block-fill|color-connect|ball-run|pool|animal-stack|flappy-bird|globle|blockcraft|maze-muncher|corn-clicker)$'),
 value jsonb NOT NULL,
 updated bigint NOT NULL CHECK (updated >= 0 AND updated <= 9007199254740991),
 PRIMARY KEY(account_id,key),
 CHECK (octet_length(value::text) <= 2097152)
);
REVOKE ALL ON accounts,account_sessions,account_attempts,account_saves FROM PUBLIC;
