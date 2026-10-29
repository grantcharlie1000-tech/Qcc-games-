# Cloud progress sync

Local saves remain frequent during active play. Unchanged snapshots, settings and favourites retain their timestamp; equal/lower best scores do not rewrite storage or server rows. Object property order is canonicalized for comparisons and equal-timestamp merge ties. Only the shell/transfer `updated` fields are excluded from content fingerprints; game-state fields retain their meaning.

## Incremental protocol

New clients send `X-QCC-Sync: 2` to the existing accounts function. Revisions are decimal strings because PostgreSQL bigint can exceed JavaScript's safe integer range.

| Request | Format |
| --- | --- |
| Pull | `GET ?action=sync&cursor=0` (or the last acknowledged cursor) |
| Push | `PUT ?action=sync` with `{cursor,bases,saves}`; `bases` maps submitted keys to their last observed revision, default `"0"` |
| Response | `{protocolVersion:2,cursor,saves,revisions,acks,conflicts}` |

`saves` contains only keys changed after the cursor. `acks` maps accepted submitted keys to their revision without echoing their values. `conflicts` contains authoritative records for submitted keys that lost or were modified by the merge. `revisions` includes every returned/acknowledged key. A successful upload includes unrelated remote changes since its cursor, so no second full download is necessary.

A per-account counter and save-row revision are assigned in the write transaction. The migration's trigger also covers old deployed SQL writers. Account locks serialize writes and establish a consistent delta/cursor boundary; frozen reads use a repeatable-read, read-only snapshot. Retrying a committed request after losing its response does not create another revision or rewrite its rows. Existing best scores merge by maximum; other records use latest timestamp, with canonical JSON lexical order breaking ties. Base mismatches use these same rules. This retains whole-snapshot conflict behavior: it does not merge individual blocks inside two different worlds.

There is no save-delete API. Favourite removal writes an empty/new list, and restart writes an ordinary reset snapshot; both propagate through revisions. Logging out removes browser copies only. No tombstone is needed for these existing operations.

## Durable client queue and scheduling

The game records themselves remain in versioned localStorage. Per-account `accounts:sync:<username>` metadata persists the cursor, per-key revisions, compact content fingerprints, pending keys, batch deadline and retry deadline. Those keys reference the durable local records rather than copying acknowledged worlds into another queue. Logout stages unacknowledged record values under the existing per-account pending namespace before restoring guest progress. Staging, pending leaderboard scores and retry deadlines are isolated by account and survive logout/reload. Clearing browser storage still removes unsent progress; blocked/full storage retains the existing truthful memory-only notice.

An acknowledgement records the fingerprint of exactly the content sent. If a local edit occurred during the request, it stays pending. Responses are checked against the session/identity epoch both before and after asynchronous JSON parsing. Server changes are stored for the next game mount; an active instance is never replaced by a remote snapshot.

`SYNC_BATCH_MS` and `SCORE_BATCH_MS` are three minutes. Genuine changes start a bounded batch deadline; frequent changes do not postpone it. No account interval pulls or sidebar polling remain. Pause/hidden transitions save locally; paused and hidden autosave intervals skip serialization after the transition snapshot. Flushes occur on game exit, first new best per run, game end, sign-in, reconnect, hiding/pagehide and **Sync now** in the existing account menu. Continuing best improvements in a run remain batched. The sidebar retains its existing Refresh control and loads on open, score submission, reconnect, and visibility regain if older than three minutes.

Pulls occur at app start/sign-in, manual sync, reconnect and stale visibility regain. Hidden tabs have no scheduled network work. A one-time hiding/pagehide flush may use keepalive, with batches below 60,000 bytes; large changes stay durable for a regular request. No correctness depends on unload delivery.

Network failures, HTTP 429 and 503 retain pending progress and retry with exponential backoff and jitter. Retry-After seconds and HTTP dates establish a minimum retry deadline, persisted across reload. Manual/lifecycle actions respect that deadline. Nonretryable errors suspend automatic dirty uploads until explicit recovery or reauthentication. Leaderboard pending scores follow the same durable retry policy.

## Ranking cache and sessions

`GET leaderboard?game=<board>&view=public` returns only `{entries}` and never resolves a session, even if an Authorization header is supplied. The browser sends no credentials on this request. Headers are `Cache-Control: public, max-age=30`, `Netlify-CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, and `Netlify-Cache-Tag: qcc-board-<board>`. Public fields describe ranking identities, including their public account marker; no own-rank, session or account-private information is included.

`view=personal` requires the account session and returns only `{player}` with `Cache-Control: private, no-store`. Score submissions retain transactional session validation and higher-score-only upserts. Shared rankings may remain stale within the short cache TTL; no purge dependency was added. Every authenticated request still validates the token hash, existing session and fixed expiry. A conditional database update touches `last_used` only after an hour; expiry is never extended. Score submissions retain the session row lock through the score transaction.

## Compatibility and write freeze

Requests without `X-QCC-Sync: 2` retain the v1 `{saves}` full-snapshot protocol. Legacy leaderboard requests retain `{entries,player}`. Both generations read each other's writes; revisions are assigned server-side for legacy writes too. The additive migration preserves existing rows, values, password hashes, sessions and timestamps and can safely be reapplied.

Write limits remain 1 MiB per record and 2 MiB per request. Larger existing server records can be read, but new oversized changes stay local with a notice. The service worker already bypasses every `/.netlify/functions/` request and remains unchanged; private API responses cannot enter its caches.

Freeze writes by setting the `qcc_runtime_flags.write_freeze` database flag or server-only emergency environment override `QCC_WRITE_FREEZE` (`1`, `true`, `yes` or `on`, case-insensitive). Both functions use the same policy; the database flag is cached for at most ten seconds and the environment override is checked on every request. Login, signup, logout/revocation, save uploads (including settings/favourites) and score submissions return HTTP 503, `Retry-After: 120`, and `{"error":"read_only","retryable":true}`. Reads remain available and do not touch sessions or acquire write locks. Already signed-in browsers continue local play and retain their queues. Clear both triggers to allow queued retries. The deploy-one runtime guard checks the database environment marker before either function runs; only this first deployment permits a missing legacy marker. It still uses `@netlify/database`.

## Measurement

Run `node scripts/measure-sync.mjs --label after --port 4422 --output docs/evidence/sync-measurements.json`. The script starts and closes its own Vite/real-handler/local-database stack and Chromium. Use the same script copied into an unmodified `main` worktree for `--label before`. It seeds a synthetic, existing world near 2 MB directly in the local database, preserves the production write cap, counts request/response body bytes, and advances the browser clock while settling real HTTP I/O. It never exports credentials or save contents.

The JSON evidence records the exact commit, browser, fixture size, counting method, phase details and baseline legacy-login limitation. Body sizes are uncompressed UTF-8 payloads, not compressed network billing or database egress. Login and the small update are separate phases so the large initial pull cannot obscure the incremental update.

| Flow | Before requests | Before body bytes | After requests | After body bytes |
| --- | ---: | ---: | ---: | ---: |
| Sign in + small score (3 min batch window) | 8 | 10,002,240 | 7 | 2,001,808 |
| Visible idle · 30 min | 30 | 60,011,070 | 0 | 0 |
| Hidden idle · 30 min | 0 | 0 | 0 | 0 |
| Expanded leaderboard · 10 min | 51 | 60,043,824 | 6 | 1,543 |
| Paused game · 10 min | 30 | 60,037,650 | 0 | 0 |

The small update alone used **5 requests / 8,001,818 bytes before**, versus **3 requests / 902 bytes after** (99.989% fewer body bytes). The account PUT alone drops from a **200-byte request / 2,000,169-byte response** to **101 / 117 bytes**. Its v2 request and response both exclude `save:blockcraft`; the response carries acknowledgements and small deltas only. Public board loads include the initial shared/private requests and genuine queued score/snapshot writes; no periodic refresh remains.

Main rejects the seeded legacy world during login because its read validator applies the 1 MiB write cap. The new client accepts that existing record. For a fair steady-state comparison, both runs therefore use identical already-authenticated fixtures after separately recording the real login attempt. This accounts for the extra initial requests in the new login and the substantial steady-state reduction. The JSON lists request bytes and response bytes separately for every phase.

## Verification record

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1 npx vitest run` | 139 files, 2,914 tests passed, no runner errors |
| `npm run build` | Passed; existing bundle-size warning |
| `ARCADE_URL=http://127.0.0.1:4411 npx playwright test tests/accounts tests/leaderboard tests/e2e --project=chromium --project=webkit` | 235 passed, 3 skipped |
| `ARCADE_URL=http://127.0.0.1:4411 npx playwright test --project=chromium --project=webkit` | Full run: 905 passed, 26 skipped, 3 initial failures; follow-up results below |
| Corrected Ball Run assertion, Chromium + WebKit | 2 passed |
| Snake keyboard scenario, Chromium rerun | 1 passed |
| Unmodified main comparison, Chromium | Snake keyboard passed; legacy-save test failed; original Ball Run assertion passed |
| Measurement script syntax, totals and payload exclusions | Passed |

The full run's Ball Run failure expected an unchanged best score to be rewritten. Its assertion now verifies the new no-rewrite requirement while retaining daily-record and restart checks, and passes in both engines. Snake's keyboard/menu test timed out once in the full run and passed unchanged on rerun. The remaining pre-existing failure is Chromium `tests/games/snake/smooth.spec.ts:48`, **raw legacy effect ages import once and time-zero v2 held/lost reload preserves exact state and pixels**: navigation times out on both this branch and unmodified main. No Snake implementation or test was changed.

Default-parallel Vitest runs encountered the runner's `onTaskUpdate` RPC timeout and intermittent timeout-only failures under concurrent browser/measurement load. A standalone default run passed all 2,914 assertions but still emitted that RPC error. The final two-worker run passed the entire suite without errors; no game timeout or assertion was weakened. Independent review found and verified fixes for rejected-session retry loops, account switches during JSON parsing, and failed-connection lock cleanup, each covered by regressions.

The service worker source is unchanged: its fetch handler already bypasses function routes. Update-specific verification was not required for a worker edit. Both test servers (4411 and temporary-main 4415), measurement servers/databases, and the temporary main worktree were removed after use. No database integration files or dependency declarations changed, and nothing was pushed.
