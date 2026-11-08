# Whetū / NCEAStudy account pairing (local, disabled)

Branch base: `origin/infra/backend-move` at `c964c982` (PR #151). This uses the existing
host-neutral Node/Vercel + `pg`/Neon backend, not a new Netlify database runtime.
No remote migration, secret provisioning, deployment, publication or production
data change was performed. The public Study readiness must remain false until
the complete private runtime, browser flows and isolated environment checks pass.

## Implemented wiring

- `server/app.ts` registers `study-link` for `/api/study-link` and the legacy
  `/.netlify/functions/study-link` route behind the normal environment/write-freeze
  guard. `QCC_WHETU_PAIRING=on` is required; it is off by default.
- `server/study-pairing.ts` owns `action=select|start|review|confirm|cancel|status|verify`.
  Browser calls use the exact configured public `QCC_NCEASTUDY_ORIGIN` Origin,
  strict same-origin fetch metadata, JSON, and no extra query parameters.
- `server/study-pairing-identities.ts` validates the actual QCC bearer syntax,
  hashes it and joins the current non-expired session to its immutable account.
  Recent authentication uses session `created_at`, never `last_used`.
- Whetū authentication stays at its issuing runtime. A fixed HTTPS backchannel
  POST `/api/integrations/nceastudy/identity` carries only the exact configured
  Supabase auth-cookie family and `X-QCC-Whetu-Service-Secret`. The QCC bearer,
  transaction proof and context cookie are never forwarded. Redirects are errors;
  timeout and bounded strict response validation fail closed.
- Whetū's identity adapter must verify the *same* access token with Supabase
  `getUser(token)` and cryptographically verified `getClaims(token)`, matching
  immutable subject/issuer/session and ownership. Verified `sessionId` is returned
  over the authenticated backchannel and bound to the challenge and context.
  The identity backchannel must be read-only: installed Supabase `getSession()`
  can refresh near-expiry tokens even with auto-refresh disabled, and SSR proxy
  middleware can do the same before the route. The exact internal identity path
  must bypass refresh middleware, strictly capture only the cookie access token,
  and use a stateless non-persistent verifier with explicit getUser/getClaims.
  It must never load/use refresh tokens or emit cookie writes. Normal browser
  runtime requests retain ownership of session refresh. Near-expiry/expired-token
  no-refresh tests are a release gate. Authentication time must come
  from verified session AMR, not refreshed `iat` or account `last_sign_in_at`.
- Server browser selection is authoritative, not localStorage. `select` POST `{}`
  authenticates the NEXT QCC bearer (or no bearer for guest) and creates/updates a
  browser-ledger epoch. Its opaque `__Host-nceastudy_browser` cookie lasts 30 days.
  A changed account/session atomically increments the epoch, cancels all old
  browser intents and deletes old contexts. Same selection is idempotent and
  preserves contexts. All protected context verification joins the exact browser,
  epoch and active selected QCC session. Late old confirmations cannot recreate a
  previous student's context, even if their original bearer session stays live.
- A five-minute 256-bit transaction cookie is HttpOnly/Secure/Strict/host-only.
  Only its hash is persisted. Start additionally returns a non-authorizing
  intent digest for view-scoped cancellation. QCC consent is explicit at start; review presents
  safe labels and a one-time challenge; final confirmation is separate and
  requires the **current host bearer** matching the starting session. The host
  owns this challenge and confirmation. No proof belongs in a URL/postMessage.
- `server/study-pairing-store.ts` uses one authoritative Postgres transaction for
  locked intent + current QCC session checks, unique immutable principal binding,
  context insertion and intent consumption. Database time controls expiry/recent
  authentication. Existing identical pairs can receive a fresh context without
  reassignment; any different binding conflicts. No record merge occurs.
- The success cookie `__Host-nceastudy_context` lasts at most 15 minutes. The
  `verify` action authenticates the server secret, verifies the current Whetū
  identity through the runtime and joins the context to the live QCC session and
  active immutable pair. It returns only `{verified:true}`. The private runtime
  must call this for each integrated protected SSR/API request, never cache it
  across requests, and deny missing/failed proof. Pairing is not a Supabase SSO
  session or permission to copy learning/game data.
- `status` requires the current host bearer to match the exact browser-selected
  account AND session, plus a live verified Whetū account/session. It can mint a
  fresh 15-minute context for an already consented immutable mapping, without
  relinking or requiring authentication within 10 minutes. It cannot create a
  new mapping. Valid contexts are reused without writes; renewal is bounded by
  trusted-IP and per-browser budgets (12 per ten minutes) and prunes only that
  browser's expired contexts. Runtime `verify` is read-only and cannot renew without a bearer.
- View `cancel` requires JSON `{intent:<non-authorizing digest>}`. It cancels only
  that browser-owned pending intent, never another context, permanent mapping or
  cookies. No Set-Cookie is emitted, avoiding a stale response clearing another
  tab's newer context. Old global `cancel{}` is rejected. Intentional global
  identity changes use `select`, not view cancellation.
- The flag-on AccountsClient starts quarantined on EVERY startup, even when a
  localStorage marker is absent or persistence failed. `session()` exposes no
  identity until server `select(actualStoredSession)` is acknowledged. Supported
  logout/switch waits for server selection and exact outgoing session revocation
  `{ok:true}` before committing local identity changes. Failed/offline transitions
  preserve data and reject visibly. Cross-tab incoming selections are quarantined
  until server reconciliation; visibility/reconnect retries cannot bypass it.
  The marker is advisory only, never authority. Default-off offline behavior is
  unchanged. Arbitrary localStorage edits or legacy clients are not authenticated
  changes to server selection and cannot authorize a new protected principal.
- A separate explicit reauthenticated unlink feature is not implemented. Neither
  logout, select, cancel nor context expiry deletes either account, learning
  progress, game saves or the durable consented mapping.

All integration cookies use `__Host-` and therefore `Path=/`, not a path-scoped pseudo
security boundary. Same-origin integration deliberately broadens the trust
boundary between QCC and Whetū. The Whetū SDK cookies retain their existing
convention. Preserve standalone Whetū global frame denial; allow integration
framing only on the separately configured dedicated runtime.

## Configuration, no values provisioned

QCC backend:

- `QCC_WHETU_PAIRING=on` (default off)
- `QCC_NCEASTUDY_ORIGIN`: exact HTTPS public host origin; also include it in the
  established `QCC_ALLOWED_ORIGINS` backend allowlist
- `WHETU_NCEASTUDY_RUNTIME_ORIGIN`: exact HTTPS dedicated Whetū service origin
- `WHETU_SUPABASE_AUTH_COOKIE`: exact SDK auth-cookie base name, for example
  `sb-<project-ref>-auth-token`; only this name or its numeric chunks are sent
- `QCC_WHETU_SERVICE_SECRET`: shared server-only secret of at least 32 bytes,
  supplied securely by operators, not generated or saved by this work
- Existing `DATABASE_URL`, deploy-environment marker and proxy settings

Private Whetū runtime also needs the integration flag, matching cookie/project
and service secret settings. Its protected-route context verifier must use an
explicit `QCC_NCEASTUDY_BACKEND_ORIGIN` for direct authenticated verification,
not infer a target from Host or forward the service secret through a public
Pages proxy. Pages routes all **browser** `/api/integrations/nceastudy/link/*`
requests to this QCC backend. It must preserve only the necessary auth/cookies,
pinned public Origin and approved host-only cookie responses. All other private
runtime routing and standalone behavior stay separate.

## Schema and data safety

`db/migrations/20261108120000_study_pairing.sql` adds only integration metadata:
`qcc_study_browsers`, `qcc_study_pairing_intents`, `qcc_study_links`,
`qcc_study_contexts`. It uses
immutable QCC UUID references, qualified Whetū subjects, uniqueness, expiry
metadata, RLS and no PUBLIC grants. Existing accounts/saves/progress are not
rewritten. The migration is explicitly listed in `GATED_MIGRATIONS`; a normal
migration command refuses it without named target-environment approval. It was
applied only to disposable local test databases, never remotely. Operators must
review least-privilege DB role access before any manual isolated-environment run.

No cleanup scheduler is enabled. Production needs a bounded expiry-metadata
cleanup plan, credential rotation, edge rate/capacity review, real Neon concurrency
and role checks, full auth flow/route/headers/worker browser testing and a second
security review. Returning-user renewal is limited to host `status` with both live identities,
exact selected browser session and the existing immutable consented pair. It
never extends QCC/Supabase sessions or changes consent. External Whetū revocation cannot be
atomically transacted with the separate QCC database; verify the live identity
at every protected request and bound all timeouts/context lifetime.

## Verification scope

Focused tests cover real local PostgreSQL-compatible storage through the
project's PGlite + pg gateway, actual QCC signup/scrypt/session auth, intent and
context persistence, concurrent confirmations, unique conflicts/renewal, rollback,
expiry/revocation, RLS/PUBLIC refusal and save preservation. Whetū network calls
in backend integration tests are controlled external-boundary fixtures, **not
real Supabase/browser authentication**. The private runtime's independent tests
validate its verified-claims boundary, but do not prove a deployed two-service
login. See `docs/evidence/study-pairing/` for exact command results.

## Backend reconciliation and independent work

This branch was rebased locally onto `c964c982`, preserving PR #151 Predictions
API/weekly cron and election Results Desk removal. Both Predictions and Study
remain individually gated migrations. PR #149 is separate and still draft: its
`20261107120000_frosthop_backend_board` migration touches `arcade_scores`, while
Study adds only metadata tables. Their common edit is the migration approval
list; a future reconciliation must retain Social, Frosthop, Predictions and Study
gates, not choose one side. The current backend already registers `femboy-obby`
after #151's main merge; #149's old type-widening hunk is now redundant, but its
preserving score-constraint SQL is still absent/relevant. No PR was merged or
modified by this work.

## Ingress limits and classroom NATs

Only the exact POST `study-link?action=verify`, with one query parameter and a
valid server service secret (minimum 32 bytes, constant-time shared validation),
uses the internal verification lane. It no longer groups the private runtime's
entire classroom under a Cloudflare-egress IP limit. Bad/missing/short secrets,
wrong methods and extra query parameters do not gain that lane. No browser
bearer, proxy header or cookie proof alone grants the exemption.

The existing in-memory router now limits:

- Browser study ingress:600 requests/minute/IP.
- Untrusted internal-verify attempts:120/minute/IP.
- Authenticated internal verification:6000/minute per application instance,
  plus 300/minute/browser-proof per instance. The proof is hashed for the key.

These router ceilings are **per application instance**, not distributed
deployment-wide quotas; autoscaling multiplies them. They remain bounded rather
than removing service anti-abuse protection. Existing durable database mutation
budgets are unchanged: selector/pairing IP windows, five intents/minute/account,
and 12 context renewals/ten minutes/browser plus the renewal IP budget.

A regression test uses the actual QCC scrypt/session/store handlers for 30
synthetic students behind one NAT: 180 combined study calls plus 30 signups
complete, followed by 150 successful protected-context verifications through a
shared private-runtime egress IP. The Whetū identity replies are controlled boundary fixtures, not live
Supabase students. This previously failed at the shared120-call ingress limit.
Separate tests cover shared-egress service traffic, both bounded trusted lanes,
and refusal to obtain the exemption with malformed credentials/methods/queries.

Existing QCC signup remains 60/hour/IP and account authentication limits are
unchanged. The durable 120-call pairing IP budget supports about 40 complete
three-action pairings/minute without retries; selector 120/minute allows about 60
guest-to-account bootstrap pairs/minute. Larger school-wide NAT batches need a deliberate capacity/
account-provisioning plan rather than silently removing those protections.
