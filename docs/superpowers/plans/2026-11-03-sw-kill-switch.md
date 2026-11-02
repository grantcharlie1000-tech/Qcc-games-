# Service worker kill switch implementation plan

> **For agentic workers:** Use the executing-plans workflow inline, followed by independent review.

**Goal:** Recover returning visitors from the cached worker and serve the app from the network.

**Architecture:** Preserve the existing `sw.js` URL/scope with a self-removing worker. Independently unregister registrations and clear caches on app startup. Replace offline audits with executable artifact checks and Chromium recovery tests.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright, Node.js.

**Spec:** `/workspace/codex-briefs/sw-kill.md`.

## Global constraints

- Work in `/workspace/qcc-swkill` on `fix/sw-kill-switch`.
- Delete ALL CacheStorage caches; preserve local saves and cookies.
- No new app worker registration; no worker fetch handler.
- Chromium recovery uses 46xx ports, never 4173.
- Commit as Charlie Grant <grantcharlie1000@gmail.com>; do not push.

## Review focus

- Evicted legacy cache entries must not prevent recovery.
- Each open window navigates once, preserving its URL.
- Denied storage APIs must not break startup.
- Root and repository-subpath deployments must recover.
- Menu tests and movie audits must tolerate retired offline features.

### Task 1: Replace worker and app registration

**Files:** `public/sw.js`, `public/_headers`, `src/core/offline.ts`, `src/main.ts`, `tests/core/offline-worker.test.ts`, `tests/core/offline-updates.test.ts`.

**Interfaces:** App calls `retireOffline(): Promise<void>` once on startup. Worker listens only for install/activate.

- [x] Replace old unit expectations with lifecycle cleanup, ordering, closed-window and denied-storage cases; run focused units and observe failure.
- [x] Implement worker and best-effort app retirement; remove download/update menu controls and handlers.
- [x] Run focused units; expect all to pass.

### Task 2: Replace build and CI checks

**Files:** `package.json`, `scripts/offline-manifest.mjs`, `scripts/verify-sw-kill-switch.mjs`, `scripts/verify-offline.mjs`, `scripts/verify-update.mjs`, `.github/workflows/pages.yml`, affected menu/movie tests and audits.

**Interfaces:** Vite copies the worker unchanged. The artifact verifier executes `dist/sw.js`, rejects fetch handling and app registration, and requires no offline manifest. Compatibility verifier entry points run the new check.

- [x] Add executable artifact checks and confirm they reject the old worker.
- [x] Stop generating offline manifests; require replacement checks in build and CI.
- [x] Update menu/movie tests and audits while preserving their other assertions.

### Task 3: Browser recovery and completion

**Files:** `tests/recovery/sw-kill-switch.spec.mjs`, `playwright.sw-kill-switch.config.ts`, `README.md`.

**Interfaces:** Production verification invokes the dedicated Playwright configuration against the real build, with an old caching worker initially served from the same origin and scope.

- [x] Test root/subpath, multiple windows, evicted cache entries, network responses, empty caches, unregistration and preserved local data.
- [x] Test the app cleanup path without installing the replacement; prove no app registration.
- [x] Run build, replacement verification, all units and affected Chromium shell/Study tests.
- [x] Independently review, address material findings, commit with requested identity and report results.

## Execution record

- Clean checkout at `0221bed`, on the requested branch. The brief selects this checkout; work in place.
- The brief specifies the implementation and authorizes execution. Proceed inline without another approval gate; make one reviewed final commit.
- `e54c41b` navigation requires cached HTML and durable metadata; missing data produces a 503. The exact live `ERR_FAILED` trigger remains unconfirmed.

- Focused retirement tests failed against the old implementation (13 failures), then passed against the replacement (13/13). The old built worker was also rejected by the new artifact verifier.
- Independent read-only review found no Critical, Important or Minor findings. The review did not inspect live browser profiles or hosting responses.
- Removed the installation manifest's stale offline-download promise; start URL, scope and installation identity are unchanged.
- Generated Study screenshots were retained under a temporary evidence directory rather than added to this repair commit.

## Final verification

| Command | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test -- --maxWorkers=1` | 3,297 tests / 165 files passed |
| `npm test -- tests/core/branding.test.ts tests/core/offline-worker.test.ts tests/core/offline-updates.test.ts` | 14 passed after the manifest text edit |
| `npm run build` | Passed, including worker artifact verification |
| `npm run verify:offline` | Artifact checks and 4 Chromium recovery cases passed |
| `npm run verify:update` | Compatibility entry point: the same 4 cases passed |
| `ARCADE_URL=http://127.0.0.1:4620 npm run test:e2e -- --project=chromium --workers=1 tests/e2e/glass-menus.spec.ts tests/e2e/study-expansion.spec.ts --reporter=list` | 38 passed |
| `MOVIES_EVIDENCE_DIR=/tmp/qcc-sw-kill-movies node scripts/verify-movies.mjs` | Root/subpath integration audit passed with provider transport fixtures |
| `node --test scripts/update-native-trace.test.mjs` | 7 passed |
| `git diff --check` | Passed |

The recovery test serves an old-style cache-only worker at the original URL/scope, confirms it controls navigation, evicts its cached HTML and observes Chromium `ERR_FAILED`. Replacement then recovers two existing controlled windows with exactly one network navigation each, clears both legacy and unrelated caches, removes registration and preserves cookies/local saves. The independent app cleanup path keeps serving the old worker, loads the new bundle over the network, and proves cleanup without replacement registration. Both run at root and repository subpath on port 4618.

The exact historical worker/profile failure is not reproduced: the checked-in historical worker catches navigation failures as a 503. Recovery of Chrome's failed error document itself is not asserted; it is closed before checking the two controlled windows. No live deployment or push was performed.
