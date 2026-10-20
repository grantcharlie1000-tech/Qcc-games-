# Retained-client update recovery

Worktree /tmp/qcc-update-recovery, branch fix/retained-client-updates, fresh main a7f7631d4f606667f23b016ad6091cb3899365e8. Preserve game/editorial/fair behavior; no publication from this child, no merge/deploy without fresh parent approval. Ads disabled, AdSense/account/personal data stopped; no denied public/installer/Pages route retries or settings changes.

## Verified diagnosis

The exact legacy app/worker baseline was built and exercised in real persistent Chromium profiles, closed/reopened before the simulated deployment, at root and /Qcc-games-/. HTTP responses were no-store. Natural reload/register discovered B but A remained active, B waited, repeated reload and offline/online still rendered A, and no B navigation document requests reached the server. Cookie/settings/score remained unchanged; old game played offline with its lazy chunk removed from B's server and the original document retained. See docs/evidence/retained-updates/legacy-repro.{json,txt}. Two initial harness attempts failed due to foreground pause/persisted sessionStorage assumptions and were corrected; they were not product RED evidence.

## Accepted design

Precache a coherent new shell/manifest with revalidation, then activate immediately without navigating any existing document. This migrates legacy clients that cannot understand new UI. Retain scoped old asset caches while captured legacy clients remain; new navigation uses active-version HTML/manifest. Persist the exact stale cache candidate snapshot captured before installation creates its own cache, plus legacy-client IDs; never enumerate/delete newer caches during runtime cleanup. Unknown/unacknowledged clients and failed/malformed metadata retain caches conservatively. Scope cleanup to this registration. Preserve local/session storage and cookies.

New app checks startup/online/foreground; controller changes only show an explicit reload control. Reload pauses/saves its own game and requires actual durable write success; memory fallback blocks reload, later successful write permits recovery. Worker entry URL vs document module URL establishes update availability. No automatic document reload. Test baseline migration, future updates, persistent worker/profile restart, removed old chunks, storage/progress/settings/cookies, quota/network/cache failures, other scopes and future installing caches. Preserve meaningful old full-pack/offline/lazy-chunk/score checks from verify-update.mjs and extend both scopes.

## Execution

- AGENTS and using-superpowers (dispatched stop), systematic-debugging, TDD + writing-good-tests, verification skills read.
- Root received verified cause/design before product changes and accepted design; Astra early risks: durable-save boolean, immutable stale candidate set, unknown/live clients, metadata fail-closed, shell/manifest coherence before activation. Those are required tests.
- Baseline main CI reported by parent:274 units pass;301 browsers pass/10 existing skips; one WebKit .br-boost visibility failure in ball-run/play.spec.ts:68. Cause unconfirmed; no game edits/threshold changes authorized. Local WebKit unavailable; no installer retry.

## Review checkpoint

Worker protects per-entry modern navigation/ownership, exact legacy pins, own-version mutable shell, all runtime assets and durable saves. Startup/waiting/cancellation UI is implemented. Tests308/308 and build pass. Parent affected Study33/33 and full13-game offline94b193 passed; isolated controlled waiting passes bothpaths; canonical root migration passes then combined waiting W activation times out. Historical delayed bootstrap404 and concurrent first-deletion same-name reinstall remain unresolved. This is a frozen **not-ready** checkpoint for exact Astra review and any authorized draft PR/hosted CI, not approval to merge/deploy. See evidence README for qualified raw logs and tradeoffs.
