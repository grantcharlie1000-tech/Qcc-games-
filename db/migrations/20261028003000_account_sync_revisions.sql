-- Additive and safe to reapply: existing values and timestamps are never rewritten.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sync_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE account_saves ADD COLUMN IF NOT EXISTS revision bigint;

WITH numbered AS (
 SELECT account_id,key,row_number() OVER (PARTITION BY account_id ORDER BY key)
   + greatest((SELECT coalesce(max(s.revision),0) FROM account_saves s WHERE s.account_id=account_saves.account_id),
              (SELECT sync_revision FROM accounts WHERE id=account_saves.account_id)) AS revision
 FROM account_saves WHERE revision IS NULL
)
UPDATE account_saves s SET revision=n.revision FROM numbered n
 WHERE s.account_id=n.account_id AND s.key=n.key AND s.revision IS NULL;
UPDATE accounts a SET sync_revision=s.revision
 FROM (SELECT account_id,max(revision) AS revision FROM account_saves GROUP BY account_id) s
 WHERE a.id=s.account_id AND a.sync_revision<s.revision;
ALTER TABLE account_saves ALTER COLUMN revision SET NOT NULL;
CREATE INDEX IF NOT EXISTS account_saves_revision ON account_saves(account_id,revision);

-- All writers, including already deployed v1 functions, advance the same cursor.
-- The account lock serializes commits so a delta cursor cannot skip an in-flight row.
CREATE OR REPLACE FUNCTION account_save_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE existing_revision bigint;
BEGIN
 PERFORM id FROM accounts WHERE id=NEW.account_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  -- BEFORE INSERT also runs before ON CONFLICT UPDATE. Let the UPDATE arm own
  -- revision assignment for existing keys, so retries never consume a revision.
  SELECT revision INTO existing_revision FROM account_saves WHERE account_id=NEW.account_id AND key=NEW.key;
  IF FOUND THEN NEW.revision:=existing_revision; RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.key LIKE 'best:%' AND jsonb_typeof(NEW.value)='number' AND jsonb_typeof(OLD.value)='number' THEN
   IF NEW.value::text::numeric<=OLD.value::text::numeric THEN RETURN NULL; END IF;
   NEW.updated:=greatest(OLD.updated,NEW.updated);
  ELSIF NEW.key LIKE 'save:%' THEN
   IF NEW.value-'updated'=OLD.value-'updated' THEN RETURN NULL; END IF;
  ELSIF NEW.value=OLD.value THEN RETURN NULL;
  END IF;
 END IF;
 UPDATE accounts SET sync_revision=sync_revision+1 WHERE id=NEW.account_id RETURNING sync_revision INTO NEW.revision;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS account_saves_assign_revision ON account_saves;
CREATE TRIGGER account_saves_assign_revision BEFORE INSERT OR UPDATE ON account_saves FOR EACH ROW EXECUTE FUNCTION account_save_revision();
