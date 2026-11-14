-- Apply ONLY to a new, dedicated D1 database. No existing application tables are touched.
CREATE TABLE IF NOT EXISTS movie_popularity_tokens (
 title_id TEXT NOT NULL,
 day INTEGER NOT NULL,
 token_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY (title_id, day, token_hash)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS movie_popularity_tokens_expiry ON movie_popularity_tokens(expires_at);
CREATE TABLE IF NOT EXISTS movie_popularity_daily (
 title_id TEXT NOT NULL,
 day INTEGER NOT NULL,
 views INTEGER NOT NULL CHECK (views >= 0),
 PRIMARY KEY (title_id, day)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS movie_popularity_daily_day ON movie_popularity_daily(day);
CREATE TABLE IF NOT EXISTS movie_popularity_rate (
 bucket_hash TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS movie_popularity_rate_expiry ON movie_popularity_rate(expires_at);
CREATE TABLE IF NOT EXISTS movie_popularity_totals (
 title_id TEXT PRIMARY KEY,
 views INTEGER NOT NULL CHECK (views >= 0)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS movie_popularity_count_insert
AFTER INSERT ON movie_popularity_tokens
BEGIN
 INSERT INTO movie_popularity_daily (title_id, day, views) VALUES (NEW.title_id, NEW.day, 1)
 ON CONFLICT(title_id, day) DO UPDATE SET views = views + 1;
 INSERT INTO movie_popularity_totals (title_id, views) VALUES (NEW.title_id, 1)
 ON CONFLICT(title_id) DO UPDATE SET views = views + 1;
END;
