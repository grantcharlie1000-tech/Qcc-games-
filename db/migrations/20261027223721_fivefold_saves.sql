ALTER TABLE account_saves DROP CONSTRAINT account_saves_key_check;
ALTER TABLE account_saves ADD CONSTRAINT account_saves_key_check CHECK (key IN ('settings','favourites') OR key ~ '^(best|save):[a-z0-9]+(-[a-z0-9]+)*$');
