# Whetū Study integration

Status: **locally wired, default off, not deployed or release-verified**. This
public repository contains the NCEAStudy host and its narrow routing adapter,
not private Whetū application code. No live site, account, database, secret,
service binding or production header has been changed.

## Experience and retained behavior

Normal Study entry opens the complete dedicated Whetū runtime inside the site,
not Whetū's public landing page. A first-time student creates a Whetū account;
existing users log in. The NCEAStudy account is required first. The host then:

1. Checks the dedicated runtime's uncached compatibility manifest.
2. Checks the current server-verified account link.
3. If not linked, asks the student to continue to account setup. Only that
   explicit action starts a short-lived pairing intent and opens signup/login.
4. Offers **Review account link** after Whetū authentication. The QCC backend
   verifies both live identities and returns display labels and a challenge.
5. Displays those labels in the host and requires **Confirm account link**.
6. Rechecks the live link and integration context before reopening the workspace.

There is no automatic link by email, anonymous admission, token-bearing
`postMessage`, credential URL, or bearer passed to the iframe. An uncertain
confirmation is checked rather than automatically resubmitted. Linking does
not move or delete either account's existing progress. Cancelling setup revokes
only its matching pending intent, not another tab’s context, the permanent
mapping or either account. A confirmation that already completed is not undone.

History subjects, including Level 2 History, are excluded in the private
integrated runtime only. Existing History progress, saved selections, standalone
Whetū subject availability and activity/history logs must remain intact.

`VITE_QCC_WHETU_STUDY=on` is the only activating frontend build value. No
checked-in deployment configuration sets it. With the flag off, original Study
entry and topic selection remain. With it on, normal Study buttons (including
Movies) open `#/study`. Existing articles, saves and Esc behavior remain in the
code. Esc still follows its retained-game/article path pending a separate final
decision. Pausing for that reader does not reload an in-progress Whetū form.

## Separate security boundaries

Compatibility readiness is not identity proof. The host never treats an iframe
`load` event, UI label, localStorage session or compatibility field as proof of
account ownership. Actual framed documents also need the agreed marker; a SPA
fallback, frame refusal or timeout fails visibly instead of claiming success.

QCC uses a bearer session, not an authentication cookie. Only the host-owned
pairing client attaches that bearer, only to fixed same-origin link endpoints.
Those requests terminate on the QCC backend, never the Whetū service. The backend
verifies Whetū through a fixed authenticated backchannel, performs atomic durable
link operations and issues a short-lived HttpOnly integration context. The
private Whetū runtime must verify that context on every protected request,
including guest/demo/deep-link variants. The mapping alone is not admission. Pending views cancel using a non-authorizing
intent correlation digest plus the HttpOnly browser proof; they never clear a
shared context cookie merely because one tab navigated away.

The integration-enabled account client starts quarantined until the server
acknowledges the stored account selection (or guest). Local storage is not proof.
A separate HttpOnly browser cookie binds a durable selection epoch to the
selected QCC session. Selecting a different identity atomically invalidates old
intents and contexts, including an in-flight old confirmation. Selecting the same
identity is idempotent and preserves a still-valid context.

The client must await this selection acknowledgement and confirmed outgoing
session revocation before committing logout or switching identity. Network
failure keeps local progress intact and blocks the unsafe transition or
integrated admission with an error. Startup always reconciles with the server,
even if writing a local barrier failed. Default-off offline behavior is unchanged.
The synchronous identity hook also destroys the old iframe immediately.
Cross-tab changes use the same server-authoritative boundary. In an enabled
build, account bootstrap now requires the pairing backend to be available;
provision and verify it before enabling the frontend flag.

This is trusted **same-origin** composition. An iframe sandbox containing both
`allow-scripts` and `allow-same-origin` is not a security isolation boundary.
Private runtime source, all first-party scripts and dependencies require review.

## Fixed first-party dispatch

`functions/_middleware.ts` first checks the opt-in `server/whetu-integration.ts`
adapter. With `QCC_WHETU_INTEGRATION` unset, existing behavior is unchanged.
With it set to `on`, a separately configured **service binding** provides the
private runtime at approved root-disjoint application/API/asset routes listed
in `server/whetu-routes.json`. It is not a generic HTTP proxy or configurable
user redirect. QCC keeps `/`, its hash navigation, game/assets and its PWA
`/manifest.webmanifest`, `/robots.txt`, `/icon.svg` routes. The fixed top-level
Google handoff is `/nceastudy/google`; arbitrary descendants are not admitted.
Billing handoffs are only exact GET/HEAD `/nceastudy/billing` and
`/nceastudy/billing/return`. The billing page remains context-protected; its
private action/cadence parser is authoritative. Rendering does not start a
purchase, and the host does not allow external redirect exceptions. The return
page is informational only: request cookies/action credentials and response
Set-Cookie are suppressed, automatic redirects and user query state are rejected.
A single bounded Next `_rsc` cache key is allowed for framework compatibility,
never treated as payment or identity proof. Its explicit account link handles
the subsequent same-origin session check without relaxing Strict cookies.

- Runtime requests strip QCC Authorization, proxy credentials, unrelated
  cookies and spoofable forwarding headers.
- Only the configured exact Supabase auth/PKCE cookie family, existing Whetū
  device/recovery cookies, browser-selection cookie and integration context reach
  the runtime. Static
  Next assets receive no cookies.
- Only the QCC pairing backend may issue browser/pairing/context cookies. The runtime
  may return only its approved host-only Secure cookie families.
- Next/RSC request headers, validated same-origin server-action redirects,
  security headers and streaming bodies are preserved. The header deadline is
  cleared when headers arrive, not after ten seconds of a tutor response.
- Curriculum shards under `/_content/` are dispatched to the private runtime,
  retain authentication/browser/context cookies and are private/no-store. They
  are not immutable Next assets or copies in this public repository. Private
  content-bank platform routes are not whitelisted here.
- Dynamic responses are private/no-store. Unexpected runtime markers or
  redirects fail closed. Internal identity/guest/factory routes are not public.
- Browser link routes expose only `select`, `start`, `review`, `confirm`,
  `status`, `cancel`. The service-authenticated `verify` operation is never exposed here.

An explicit integration build runs `scripts/prepare-whetu-host.mjs` against
**generated** output. It adds only `'self'` to the parent's `frame-src` and adds
approved Pages Function dispatch paths, retaining existing directives/routes.
Source `public/_headers` and `_routes.json` remain unchanged. Standalone Whetū
must retain its global `DENY` / `frame-ancestors 'none'`. Only a separate dedicated
runtime may use `SAMEORIGIN` / `frame-ancestors 'self'`.

## Configuration and deployment gates

Frontend build: `VITE_QCC_WHETU_STUDY=on`.

Pages server adapter needs all of:

- `QCC_WHETU_INTEGRATION=on`;
- `WHETU_PUBLIC_ORIGIN`: exact HTTPS public NCEAStudy origin;
- `WHETU_SUPABASE_COOKIE`: exact `sb-<projectref>-auth-token` family;
- `WHETU_INTEGRATION`: dedicated private runtime service binding;
- existing trusted `QCC_API_ORIGIN` and server-only `QCC_PROXY_SECRET`.

The separate QCC backend needs its own default-off pairing flag, additive durable
link/context/browser-selection schema, exact origin and cookie-family configuration, trusted runtime origin,
and a shared server-only backchannel secret. See the private backend work's
`docs/WHETU_ACCOUNT_PAIRING.md`. Nothing here provisions or applies those values,
creates credentials, applies a remote migration, or changes access permissions.
Private runtime/Next service-binding execution must be verified on the selected
hosting platform before any cutover; source changes are not a deployed binding.

## Runtime compatibility manifest

`GET /api/integrations/nceastudy` returns JSON with `Cache-Control: private,
no-store`. Until every capability is implemented and independently verified it
must report `ready:false`, even if frontend flags are enabled.

```json
{
  "integration": "nceastudy-whetu-v1",
  "ready": true,
  "framePath": "/nceastudy",
  "excludedSubjects": ["history", "l2-history"],
  "authentication": {
    "embeddedPassword": true,
    "embeddedSignup": true,
    "externalProviderHandoff": true
  },
  "accountLink": "verified-explicit-v1",
  "revision": "<actual full 40-or-64-character hexadecimal revision>"
}
```

Every framed signup/login/workspace document needs:

```html
<meta name="whetu-integration" content="nceastudy-whetu-v1">
```

These fields are compatibility assertions only. Missing/expired QCC sessions,
changed Whetū identities, stale contexts, deleted links or guest parameters must
not admit private workspace/API content.

## Verification and remaining release work

```sh
npm test -- tests/core/whetu-integration.test.ts tests/core/whetu-pairing-client.test.ts tests/core/whetu-view.test.ts tests/pages/whetu-proxy.test.ts tests/pages/whetu-host-build.test.ts tests/pages/proxy.test.ts
npm run check
npm run build
VITE_QCC_WHETU_STUDY=on npm run build
```

DOM tests use Happy DOM fixtures and never contact an actual Whetū host or a
student account. The flagged Playwright suite uses fake readiness, link API and
account screens; it tests the host contract, not real authentication:

```sh
VITE_QCC_WHETU_STUDY=on npm run test:e2e -- --project=chromium tests/e2e/whetu-integration.spec.ts
```

Chromium execution in this container is blocked before test bodies by
`socket() failed: Operation not permitted`. This is not a passing browser run.
Layout, real Cloudflare/Next dispatch, SDK cookies and real linked-account
security require supported-browser evidence. Test first signup, existing login,
email verification in another tab, Google top-level handoff/cancel, recent-auth
expiry, repeated clicks, uncertain responses, replay/concurrency, refresh,
Back/Forward including iframe history, navigation away mid-pairing, logout,
identity switches across tabs, old in-flight confirmation after a selection
change, one tab cancelling another tab’s pending/completed setup, failed local
barrier storage and revocation. Verify History exclusion across
picks, deep links and APIs without changing stored records. Run legacy Study,
account/data and default-off regression checks as well.

No production cutover should be inferred from fixture passes, compilation,
source packaging or this document. Keep both release flags and readiness closed
until private runtime, durable backend, hosting and real browser gates pass.
