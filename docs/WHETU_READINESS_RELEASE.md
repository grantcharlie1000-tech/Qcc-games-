# Whetū capability readiness candidate

Local source candidate only. No deployment, remote database call, tests, typecheck or build was run for this patch. The user's explicit no-tests direction applies. Previous private b0497529 build outputs predate this readiness change and must not be reused after editing source.

The existing explicit dual-consent pairing, verified QCC/Supabase session ownership, browser epoch, revocation and per-request context checks remain authoritative and unchanged. A readiness response is not a user identity, pair proof or authentication token.

## Internal contract

`POST /.netlify/functions/study-link?action=capabilities` (the backend router also accepts `/api/study-link`) uses the existing `X-QCC-Whetu-Service-Secret` header, JSON `{}`, and no Cookie, Authorization, Origin or Sec-Fetch-Site. It is not a browser LINK_ACTION or proxy handoff. Authentication precedes the internal ingress rate-limit lane and any capability database inspection. The response is private/no-store, does not set cookies, and includes only these nine configuration/protocol fields:

- version: `nceastudy-whetu-capabilities-v1`
- pairingProtocol: `verified-explicit-v1`
- browserEpoch: true
- sessionBinding: `verified-session-id-v1`
- publicOrigin: exact public Study HTTPS origin
- runtimeOrigin: different exact dedicated Worker HTTPS origin
- authCookie: exact Whetū Supabase auth-cookie family
- ready: true, only on all checks below
- schema: `20261108120000_study_pairing`

The private runtime must compare every field to its validated local configuration, reject redirects, responses over 4KiB, unexpected fields, missing no-store, Set-Cookie/Location, and configuration/build stamp disagreement. Readiness remains anonymous to avoid blocking signup until a pair already exists. A true result means configured protocol/catalog compatibility, not that real user login/billing/browser flows were tested.

## Read-only database observation

The existing deployment/database environment-marker and write-freeze guards are preserved. The capability reads only migration history and PostgreSQL catalog metadata in a repeatable-read READ ONLY transaction. It always rolls back, has local statement/lock timeouts, returns no SQL errors or identities, and never invokes a migrator, creates objects, reads user rows, or issues proofs.

Positive catalog observations are coalesced for five seconds per process. Checks require the exact approved migration checksum; four expected ordinary tables, ordered column types/nullability, current server-role ownership, enabled but not forced RLS, no PUBLIC table grants, no RLS policies or user triggers; validated and non-deferrable constraint type counts; exact primary/unique/FK key columns, reference schemas/tables/columns and RESTRICT/NO ACTION behavior; valid/ready/immediate backing key indexes; and four named valid/ready non-partial plain indexes on their exact columns.

CHECK expression bodies are not AST-attested by this inspector. The checksum records the approved fresh additive migration, whose real production commit/postcommit observation was previously verified. The inspector also checks current validated CHECK counts. Do not describe this as full semantic attestation of an arbitrarily edited existing schema or as protection against a malicious database administrator. If catalog compatibility fails, keep readiness false and inspect without replaying the completed migration.

## Still required before release

Dedicated private Worker and matching newly stamped build/assets, correct existing production Whetū credentials in its encrypted settings, exact backend/public/runtime origins and cookie family, shared service secret in both services, backend source deployment, host service binding and build/server flags, and correct public Supabase callback allowlist. Preserve the existing standalone Worker, accounts, stored subject preferences and progress. Do not merge the one-time linkage operator branch into the API branch. The linkage migration is already complete and must not be rerun.
