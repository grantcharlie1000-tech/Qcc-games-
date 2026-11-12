-- Private, account-scoped playback state. Never used for public popularity.
-- A retained clear timestamp prevents a stale browser from restoring cleared history.
CREATE TABLE account_movie_progress (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 value jsonb NOT NULL,
 CHECK (jsonb_typeof(value) = 'object'),
 CHECK (octet_length(value::text) <= 262144)
);
REVOKE ALL ON account_movie_progress FROM PUBLIC;
