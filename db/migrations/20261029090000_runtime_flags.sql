-- Deploy 1: additive; no environment row until the operator marks the database.
CREATE TABLE qcc_environment (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 name text NOT NULL CHECK (name IN ('production','preview','development'))
);
CREATE TABLE qcc_runtime_flags (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 write_freeze boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO qcc_runtime_flags(id) VALUES (true);
REVOKE ALL ON qcc_environment,qcc_runtime_flags FROM PUBLIC;
