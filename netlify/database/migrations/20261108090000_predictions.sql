-- SCHEMA CHANGE: NEEDS CHARLIE APPROVAL before application. Never run against a remote DB from this task.
-- Predictions: free play-credit binary markets (LMSR), weekly allowance, double-entry credit journal,
-- moderated questions, independent resolution and exactly-once settlement. Credits have no cash value and
-- cannot be bought, transferred, redeemed or cashed out; nothing in this schema links them to anything that can.
-- Amounts are integer micro-units: 1 credit = 1,000,000 microcredits; 1 share = 1,000,000 microshares.
-- The feature ships DISABLED: predictions_config.enabled defaults to false and launch_at to NULL (no grants).

CREATE TABLE predictions_config (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 enabled boolean NOT NULL DEFAULT false,
 trading_paused boolean NOT NULL DEFAULT false,
 -- No allowance is issued for any week before launch_at; NULL means not launched.
 launch_at timestamptz NULL,
 -- Development fixtures are listed only when this is true. Never set it in production.
 show_fixtures boolean NOT NULL DEFAULT false,
 weekly_grant bigint NOT NULL DEFAULT 10000000 CHECK (weekly_grant>0 AND weekly_grant<=100000000),
 market_reserve bigint NOT NULL DEFAULT 14000000 CHECK (market_reserve>0),
 liquidity_b bigint NOT NULL DEFAULT 20000000 CHECK (liquidity_b>0),
 max_open_markets integer NOT NULL DEFAULT 12 CHECK (max_open_markets>=0),
 challenge_hours integer NOT NULL DEFAULT 24 CHECK (challenge_hours BETWEEN 1 AND 336),
 -- The reserve funding needs b ln 2 at most; refuse a configuration that could leave a market underfunded.
 CHECK (market_reserve*1000000 >= liquidity_b*693148),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO predictions_config(id) VALUES (true);

-- Moderators review/publish/finalise; resolvers propose results. Granted by an operator in SQL (see docs/PREDICTIONS.md).
CREATE TABLE predictions_roles (
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('moderator','resolver')),
 granted_by text NOT NULL CHECK (char_length(granted_by) BETWEEN 1 AND 60),
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (account_id,role)
);
-- Eligibility history. A visit never creates entitlement; an explicit opt-in or operator action does.
CREATE TABLE predictions_eligibility (
 id bigserial PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 eligible_from timestamptz NOT NULL DEFAULT now(),
 eligible_until timestamptz NULL,
 method text NOT NULL CHECK (method IN ('opt_in','operator')),
 note text NOT NULL DEFAULT '' CHECK (char_length(note)<=300),
 CHECK (eligible_until IS NULL OR eligible_until>eligible_from)
);
CREATE UNIQUE INDEX predictions_eligibility_current ON predictions_eligibility(account_id) WHERE eligible_until IS NULL;
CREATE INDEX predictions_eligibility_account ON predictions_eligibility(account_id,eligible_from);

-- Wallet balance is a cache of the 'wallet' postings, maintained only by the posting trigger below.
-- Ledger tables keep account ids without a foreign key so the journal survives an operator account deletion.
CREATE TABLE predictions_wallets (
 account_id uuid PRIMARY KEY,
 balance bigint NOT NULL DEFAULT 0 CHECK (balance>=0),
 revision bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE predictions_markets (
 id uuid PRIMARY KEY,
 author_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','changes_requested','rejected','open','paused','proposed','disputed','resolved','void')),
 fixture boolean NOT NULL DEFAULT false,
 category text NOT NULL CHECK (category IN ('school','local','sport','games','technology','culture','science','community')),
 audience text NOT NULL CHECK (audience IN ('school','public')),
 question varchar(160) NOT NULL,
 yes_rule varchar(400) NOT NULL,
 no_rule varchar(400) NOT NULL,
 void_rule varchar(400) NOT NULL,
 source varchar(300) NOT NULL,
 source_fallback varchar(300) NOT NULL DEFAULT '',
 disclosure varchar(300) NOT NULL DEFAULT '',
 close_at timestamptz NOT NULL,
 resolve_at timestamptz NOT NULL,
 liquidity_b bigint NOT NULL CHECK (liquidity_b>0),
 pricing_version smallint NOT NULL DEFAULT 1,
 rules_hash text NULL CHECK (rules_hash IS NULL OR rules_hash ~ '^[a-f0-9]{64}$'),
 q_yes bigint NOT NULL DEFAULT 0 CHECK (q_yes>=0),
 q_no bigint NOT NULL DEFAULT 0 CHECK (q_no>=0),
 -- Cache of the market's 'reserve' postings, maintained by the posting trigger.
 reserve bigint NOT NULL DEFAULT 0 CHECK (reserve>=0),
 version bigint NOT NULL DEFAULT 0,
 sequence bigint NOT NULL DEFAULT 0,
 outcome text NULL CHECK (outcome IN ('yes','no','void')),
 review_note varchar(400) NULL,
 reviewed_by uuid NULL,
 published_at timestamptz NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 question_key text GENERATED ALWAYS AS (regexp_replace(lower(question),'[^a-z0-9]+','','g')) STORED,
 CHECK (resolve_at>=close_at),
 CHECK ((state IN ('resolved','void'))=(outcome IS NOT NULL)),
 CHECK (state IN ('pending','changes_requested','rejected') OR (rules_hash IS NOT NULL AND published_at IS NOT NULL))
);
-- One live question per wording; resolved/void/rejected wordings may be asked again.
CREATE UNIQUE INDEX predictions_markets_question ON predictions_markets(question_key) WHERE state NOT IN ('rejected','resolved','void');
CREATE INDEX predictions_markets_list ON predictions_markets(state,audience,close_at);
CREATE INDEX predictions_markets_author ON predictions_markets(author_id,created_at DESC);

-- Published terms are frozen: economic and resolution fields cannot change once a market leaves review.
CREATE FUNCTION predictions_freeze_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state NOT IN ('pending','changes_requested','rejected') AND (
   NEW.question IS DISTINCT FROM OLD.question OR NEW.yes_rule IS DISTINCT FROM OLD.yes_rule OR NEW.no_rule IS DISTINCT FROM OLD.no_rule
   OR NEW.void_rule IS DISTINCT FROM OLD.void_rule OR NEW.source IS DISTINCT FROM OLD.source OR NEW.source_fallback IS DISTINCT FROM OLD.source_fallback
   OR NEW.disclosure IS DISTINCT FROM OLD.disclosure OR NEW.close_at IS DISTINCT FROM OLD.close_at OR NEW.resolve_at IS DISTINCT FROM OLD.resolve_at
   OR NEW.liquidity_b IS DISTINCT FROM OLD.liquidity_b OR NEW.pricing_version IS DISTINCT FROM OLD.pricing_version
   OR NEW.rules_hash IS DISTINCT FROM OLD.rules_hash OR NEW.category IS DISTINCT FROM OLD.category OR NEW.audience IS DISTINCT FROM OLD.audience
   OR NEW.state IN ('pending','changes_requested','rejected')) THEN
  RAISE EXCEPTION 'predictions: published market terms are frozen' USING ERRCODE='P0001';
 END IF;
 IF OLD.state IN ('resolved','void') AND (NEW.state IS DISTINCT FROM OLD.state OR NEW.outcome IS DISTINCT FROM OLD.outcome) THEN
  RAISE EXCEPTION 'predictions: a settled market cannot change outcome' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER predictions_markets_freeze BEFORE UPDATE ON predictions_markets FOR EACH ROW EXECUTE FUNCTION predictions_freeze_rules();

-- Double-entry journal. Every transaction's postings sum to zero (checked at commit); rows are append-only.
CREATE TABLE predictions_journal (
 id bigserial PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('grant','fund','buy','sell','payout','void_payout','release','correction')),
 account_id uuid NULL,
 market_id uuid NULL REFERENCES predictions_markets(id),
 actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 80),
 reason text NOT NULL DEFAULT '' CHECK (char_length(reason)<=300),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX predictions_journal_account ON predictions_journal(account_id,created_at DESC) WHERE account_id IS NOT NULL;
CREATE INDEX predictions_journal_market ON predictions_journal(market_id) WHERE market_id IS NOT NULL;
CREATE TABLE predictions_postings (
 journal_id bigint NOT NULL REFERENCES predictions_journal(id),
 line smallint NOT NULL CHECK (line>0),
 -- issuance and treasury are system books and may hold a negative funding position; wallets and reserves cannot.
 book text NOT NULL CHECK (book IN ('issuance','treasury','wallet','reserve')),
 owner uuid NULL,
 amount bigint NOT NULL CHECK (amount<>0),
 PRIMARY KEY (journal_id,line),
 CHECK ((book IN ('wallet','reserve'))=(owner IS NOT NULL))
);
CREATE INDEX predictions_postings_owner ON predictions_postings(book,owner) WHERE owner IS NOT NULL;

CREATE FUNCTION predictions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'predictions: % is append-only',TG_TABLE_NAME USING ERRCODE='P0001'; END $$;
CREATE TRIGGER predictions_journal_append_only BEFORE UPDATE OR DELETE ON predictions_journal FOR EACH ROW EXECUTE FUNCTION predictions_immutable();
CREATE TRIGGER predictions_postings_append_only BEFORE UPDATE OR DELETE ON predictions_postings FOR EACH ROW EXECUTE FUNCTION predictions_immutable();

-- The only writer of wallet and reserve balances. A posting that would take either below zero fails the CHECK.
CREATE FUNCTION predictions_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.book='wallet' THEN
  UPDATE predictions_wallets SET balance=balance+NEW.amount,revision=revision+1 WHERE account_id=NEW.owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'predictions: no wallet for posting' USING ERRCODE='P0001'; END IF;
 ELSIF NEW.book='reserve' THEN
  UPDATE predictions_markets SET reserve=reserve+NEW.amount WHERE id=NEW.owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'predictions: no market for posting' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER predictions_postings_apply AFTER INSERT ON predictions_postings FOR EACH ROW EXECUTE FUNCTION predictions_apply_posting();

CREATE FUNCTION predictions_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric;
BEGIN
 SELECT COALESCE(sum(amount),0) INTO total FROM predictions_postings WHERE journal_id=NEW.journal_id;
 IF total<>0 THEN RAISE EXCEPTION 'predictions: journal % does not balance',NEW.journal_id USING ERRCODE='P0001'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER predictions_postings_balanced AFTER INSERT ON predictions_postings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION predictions_check_balanced();

-- One allowance per account per Auckland week (week_start is the local Monday).
CREATE TABLE predictions_grants (
 account_id uuid NOT NULL,
 week_start date NOT NULL CHECK (extract(isodow FROM week_start)=1),
 amount bigint NOT NULL CHECK (amount>0),
 journal_id bigint NOT NULL UNIQUE REFERENCES predictions_journal(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (account_id,week_start)
);

CREATE TABLE predictions_positions (
 market_id uuid NOT NULL REFERENCES predictions_markets(id),
 account_id uuid NOT NULL,
 side text NOT NULL CHECK (side IN ('yes','no')),
 shares bigint NOT NULL DEFAULT 0 CHECK (shares>=0),
 cost_basis bigint NOT NULL DEFAULT 0 CHECK (cost_basis>=0),
 realised bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (market_id,account_id,side)
);
CREATE INDEX predictions_positions_account ON predictions_positions(account_id,updated_at DESC);

CREATE TABLE predictions_quotes (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL,
 market_id uuid NOT NULL REFERENCES predictions_markets(id),
 side text NOT NULL CHECK (side IN ('yes','no')),
 op text NOT NULL CHECK (op IN ('buy','sell')),
 amount bigint NOT NULL CHECK (amount>0),
 expected bigint NOT NULL CHECK (expected>=0),
 min_out bigint NOT NULL CHECK (min_out>=0),
 tolerance_bp integer NOT NULL CHECK (tolerance_bp BETWEEN 0 AND 500),
 market_version bigint NOT NULL,
 rules_hash text NOT NULL,
 pricing_version smallint NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX predictions_quotes_account ON predictions_quotes(account_id,created_at);

-- One immutable receipt per executed operation; (account, operation key) makes retries exactly-once.
CREATE TABLE predictions_trades (
 id uuid PRIMARY KEY,
 account_id uuid NOT NULL,
 operation_key text NOT NULL CHECK (operation_key ~ '^[A-Za-z0-9_-]{16,64}$'),
 request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 market_id uuid NOT NULL REFERENCES predictions_markets(id),
 side text NOT NULL CHECK (side IN ('yes','no')),
 op text NOT NULL CHECK (op IN ('buy','sell')),
 shares bigint NOT NULL CHECK (shares>0),
 credits bigint NOT NULL CHECK (credits>=0),
 price_before_ppm integer NOT NULL CHECK (price_before_ppm BETWEEN 0 AND 1000000),
 price_after_ppm integer NOT NULL CHECK (price_after_ppm BETWEEN 0 AND 1000000),
 market_sequence bigint NOT NULL,
 balance_after bigint NOT NULL CHECK (balance_after>=0),
 rules_hash text NOT NULL,
 journal_id bigint NOT NULL UNIQUE REFERENCES predictions_journal(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (account_id,operation_key),
 UNIQUE (market_id,market_sequence)
);
CREATE TRIGGER predictions_trades_append_only BEFORE UPDATE OR DELETE ON predictions_trades FOR EACH ROW EXECUTE FUNCTION predictions_immutable();

CREATE TABLE predictions_resolutions (
 id uuid PRIMARY KEY,
 market_id uuid NOT NULL REFERENCES predictions_markets(id),
 outcome text NOT NULL CHECK (outcome IN ('yes','no','void')),
 evidence varchar(1000) NOT NULL,
 source_checked varchar(300) NOT NULL,
 proposer_id uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 challenge_until timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','disputed','accepted','overturned')),
 dispute_reason varchar(500) NULL,
 disputed_by uuid NULL,
 disputed_at timestamptz NULL,
 reviewer_id uuid NULL,
 reviewed_at timestamptz NULL,
 review_note varchar(500) NULL,
 final_outcome text NULL CHECK (final_outcome IN ('yes','no','void')),
 CHECK (challenge_until>proposed_at),
 CHECK ((status IN ('accepted','overturned'))=(final_outcome IS NOT NULL AND reviewer_id IS NOT NULL)),
 CHECK (reviewer_id IS NULL OR reviewer_id<>proposer_id)
);
CREATE UNIQUE INDEX predictions_resolutions_active ON predictions_resolutions(market_id) WHERE status IN ('proposed','disputed');

-- Exactly one economic settlement per market, and one claim per holder in it.
CREATE TABLE predictions_settlements (
 market_id uuid PRIMARY KEY REFERENCES predictions_markets(id),
 outcome text NOT NULL CHECK (outcome IN ('yes','no','void')),
 resolution_id uuid NOT NULL UNIQUE REFERENCES predictions_resolutions(id),
 total_payout bigint NOT NULL CHECK (total_payout>=0),
 released bigint NULL CHECK (released>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz NULL
);
CREATE TABLE predictions_claims (
 market_id uuid NOT NULL REFERENCES predictions_settlements(market_id),
 account_id uuid NOT NULL,
 yes_shares bigint NOT NULL CHECK (yes_shares>=0),
 no_shares bigint NOT NULL CHECK (no_shares>=0),
 amount bigint NOT NULL CHECK (amount>=0),
 journal_id bigint NULL UNIQUE REFERENCES predictions_journal(id),
 paid_at timestamptz NULL,
 PRIMARY KEY (market_id,account_id),
 CHECK ((paid_at IS NULL)=(journal_id IS NULL) OR amount=0)
);

-- Written in the same transaction as each ledger change; delivered after commit, deduplicated by event_key.
CREATE TABLE predictions_outbox (
 id bigserial PRIMARY KEY,
 event_key text NOT NULL UNIQUE,
 kind text NOT NULL,
 market_id uuid NULL,
 account_id uuid NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz NULL
);
CREATE INDEX predictions_outbox_pending ON predictions_outbox(created_at) WHERE delivered_at IS NULL;

-- Appealable record of every moderation, resolution and eligibility action.
CREATE TABLE predictions_audit (
 id bigserial PRIMARY KEY,
 actor_id uuid NULL,
 actor text NOT NULL,
 action text NOT NULL,
 market_id uuid NULL,
 note text NOT NULL DEFAULT '' CHECK (char_length(note)<=1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX predictions_audit_market ON predictions_audit(market_id,created_at) WHERE market_id IS NOT NULL;
CREATE TRIGGER predictions_audit_append_only BEFORE UPDATE OR DELETE ON predictions_audit FOR EACH ROW EXECUTE FUNCTION predictions_immutable();

CREATE TABLE predictions_evidence (
 id uuid PRIMARY KEY,
 market_id uuid NOT NULL REFERENCES predictions_markets(id),
 author_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
 body varchar(500) NOT NULL CHECK (char_length(btrim(body))>0),
 link varchar(300) NULL CHECK (link IS NULL OR link ~ '^https://[^\s<>"]+$'),
 hidden boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX predictions_evidence_market ON predictions_evidence(market_id,created_at DESC);
CREATE TABLE predictions_reports (
 market_id uuid NOT NULL REFERENCES predictions_markets(id),
 reporter_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK (reason IN ('personal','harmful','ambiguous','duplicate','already_known','other')),
 note varchar(300) NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (market_id,reporter_id)
);

REVOKE ALL ON predictions_config,predictions_roles,predictions_eligibility,predictions_wallets,predictions_markets,predictions_journal,
 predictions_postings,predictions_grants,predictions_positions,predictions_quotes,predictions_trades,predictions_resolutions,
 predictions_settlements,predictions_claims,predictions_outbox,predictions_audit,predictions_evidence,predictions_reports FROM PUBLIC;
