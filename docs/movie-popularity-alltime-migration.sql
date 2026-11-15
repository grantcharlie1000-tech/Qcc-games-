-- Apply once to EACH existing dedicated popularity D1 database before deploying the new handler.
-- Re-runnable: existing lifetime rows are never reseeded or added twice.
-- Submit ALL statements together as one atomic D1 batch(), preserving the trigger body.
-- Do not execute sequentially. No explicit BEGIN/COMMIT (unsupported by D1).
CREATE TABLE IF NOT EXISTS movie_popularity_totals (
 title_id TEXT PRIMARY KEY,
 views INTEGER NOT NULL CHECK (views >= 0)
) WITHOUT ROWID;
INSERT OR IGNORE INTO movie_popularity_totals (title_id, views)
 SELECT title_id, SUM(views) FROM movie_popularity_daily GROUP BY title_id;
DROP TRIGGER IF EXISTS movie_popularity_count_insert;
CREATE TRIGGER movie_popularity_count_insert
AFTER INSERT ON movie_popularity_tokens
BEGIN
 INSERT INTO movie_popularity_daily (title_id, day, views) VALUES (NEW.title_id, NEW.day, 1)
 ON CONFLICT(title_id, day) DO UPDATE SET views = views + 1;
 INSERT INTO movie_popularity_totals (title_id, views) VALUES (NEW.title_id, 1)
 ON CONFLICT(title_id) DO UPDATE SET views = views + 1;
END;
