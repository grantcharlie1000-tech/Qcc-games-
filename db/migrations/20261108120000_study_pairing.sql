-- Additive, explicitly gated integration metadata only. No save/progress migration.
-- Apply only after the owner approves the named target environment.
CREATE TABLE IF NOT EXISTS qcc_study_links (
 qcc_account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE RESTRICT,
 whetu_subject text NOT NULL UNIQUE CHECK(length(whetu_subject) BETWEEN 1 AND 512),
 linked_at bigint NOT NULL CHECK(linked_at >= 0)
);
CREATE TABLE IF NOT EXISTS qcc_study_browsers (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 epoch bigint NOT NULL CHECK(epoch >= 0),
 qcc_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
 qcc_session_hash text CHECK(qcc_session_hash ~ '^[a-f0-9]{64}$'),
 CHECK((qcc_account_id IS NULL) = (qcc_session_hash IS NULL))
);
CREATE TABLE IF NOT EXISTS qcc_study_pairing_intents (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 browser_digest text NOT NULL REFERENCES qcc_study_browsers(digest) ON DELETE RESTRICT,
 browser_epoch bigint NOT NULL CHECK(browser_epoch >= 0),
 scope text NOT NULL CHECK(scope = 'qcc:whetu:link:v1'),
 return_path text NOT NULL CHECK(return_path = '/nceastudy'),
 qcc_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 qcc_session_hash text NOT NULL CHECK(qcc_session_hash ~ '^[a-f0-9]{64}$'),
 qcc_consented_at bigint NOT NULL CHECK(qcc_consented_at >= 0),
 expires_at bigint NOT NULL CHECK(expires_at = qcc_consented_at + 300000),
 state text NOT NULL CHECK(state IN ('pending','consumed','cancelled')),
 whetu_session_id text CHECK(length(whetu_session_id) BETWEEN 1 AND 512),
 whetu_subject text CHECK(length(whetu_subject) BETWEEN 1 AND 512),
 challenge_digest text CHECK(challenge_digest ~ '^[a-f0-9]{64}$'),
 CHECK((whetu_subject IS NULL) = (challenge_digest IS NULL)),
 CHECK((whetu_subject IS NULL) = (whetu_session_id IS NULL))
);
CREATE INDEX IF NOT EXISTS qcc_study_pairing_browser ON qcc_study_pairing_intents(browser_digest);
CREATE INDEX IF NOT EXISTS qcc_study_pairing_expiry ON qcc_study_pairing_intents(expires_at);
CREATE TABLE IF NOT EXISTS qcc_study_contexts (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 browser_digest text NOT NULL REFERENCES qcc_study_browsers(digest) ON DELETE RESTRICT,
 browser_epoch bigint NOT NULL CHECK(browser_epoch >= 0),
 whetu_session_id text NOT NULL CHECK(length(whetu_session_id) BETWEEN 1 AND 512),
 qcc_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 qcc_session_hash text NOT NULL CHECK(qcc_session_hash ~ '^[a-f0-9]{64}$'),
 whetu_subject text NOT NULL CHECK(length(whetu_subject) BETWEEN 1 AND 512),
 expires_at bigint NOT NULL CHECK(expires_at >= 0)
);
CREATE INDEX IF NOT EXISTS qcc_study_context_browser ON qcc_study_contexts(browser_digest);
CREATE INDEX IF NOT EXISTS qcc_study_context_expiry ON qcc_study_contexts(expires_at);
ALTER TABLE qcc_study_browsers ENABLE ROW LEVEL SECURITY;
ALTER TABLE qcc_study_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE qcc_study_pairing_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE qcc_study_contexts ENABLE ROW LEVEL SECURITY;
-- No client-role policies: identities are accessible only through trusted server
-- ownership/session checks, with the existing server DB role owning these tables.
REVOKE ALL ON qcc_study_browsers,qcc_study_links,qcc_study_pairing_intents,qcc_study_contexts FROM PUBLIC;
