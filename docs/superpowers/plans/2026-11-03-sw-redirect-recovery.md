# Redirected navigation recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, followed by independent review. The supplied brief authorizes implementation on the existing branch.

**Goal:** Align the kill switch and recovery tests with the confirmed redirected `index.html` failure.

**Architecture:** Keep the original worker URL and scope with only install/activate handlers and the lifecycle sequence supplied in the brief. Both worker and app delete only caches whose names start with `pocket-arcade`. Reproduce a real 308 redirect in the production-build browser fixture.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright, Node.js.

**Spec:** `/workspace/codex-briefs/sw-kill-2.md` (supersedes conflicting requirements in the previous kill-switch plan).

## Global constraints

- Continue on `fix/sw-kill-switch`, starting at `f02929c`.
- `public/sw.js` must implement the brief's exact lifecycle behavior; no fetch handler.
- Enumerate window clients after claiming and before unregistering; navigate each afterward, catching individual navigation failures.
- App boot unregisters existing registrations and deletes only caches starting with `pocket-arcade`; no worker registration or worker online/visibility update checks.
- Preserve `sw.js` no-cache headers and document the redirected-response restriction for future caching workers.
- Use port 4618 for Chromium recovery; commit as Charlie Grant <grantcharlie1000@gmail.com>; do not push.

## Review focus

- Prefix cleanup preserves unrelated cached data and its contents.
- Both legacy `pocket-arcade:` and `pocket-arcade-v2` cache names are retired.
- A window closing during navigation does not stop recovery of another window.
- A real cached response has `redirected === true`; no cache eviction or synthetic network error substitutes for the root cause.
- Retain the failed browser tab and prove it can load successfully once more, including at the repository subpath.

### Task 1: Align lifecycle, cleanup and redirected-navigation regression

**Files:** `public/sw.js`, `src/core/offline.ts`, `tests/core/offline-worker.test.ts`, `tests/core/offline-updates.test.ts`, `scripts/verify-sw-kill-switch.mjs`, `tests/recovery/sw-kill-switch.spec.mjs`, `playwright.sw-kill-switch.config.ts`, `README.md`. Inspect existing `public/_headers` and `src/main.ts` to confirm they already satisfy the brief.

**Interfaces:** `retireOffline(): Promise<void>` remains the boot entry point. `verifyBuiltKillSwitch(directory='dist')` executes the built worker and verifies prefix-scoped cleanup and lifecycle order. Browser tests serve the old and replacement worker at the same URL and scope.

- [x] Update worker/app unit assertions to preserve an unrelated cache and enumerate clients before unregistering. Remove superseded worker storage-failure expectations. Run focused units and observe the old code fail these requirements.
- [x] Replace the browser fixture's synthetic cached HTML with `cache.addAll([index.html])` against a 308 to the scope root. Assert the cached response is redirected, observe `ERR_FAILED` with the entry still present, and keep the failed tab for one subsequent load.
- [x] Update the artifact verifier to require prefix cleanup, preserved unrelated content, and client enumeration before unregistering. Run it against the existing build and observe failure.
- [x] Implement the supplied worker lifecycle and prefix-scoped app cleanup. Keep unrelated cache content in all unit, artifact and browser assertions.
- [x] Document the confirmed root cause and the rule that a future caching worker must not store redirected responses: omit `index.html` from precache or rebuild the `Response`.
- [x] Run `npm run build`, `node scripts/verify-sw-kill-switch.mjs`, `npm test -- --maxWorkers=1`, and `npx playwright test --config=playwright.sw-kill-switch.config.ts`; expect all to pass. Run `git diff --check`.
- [x] Independently review the complete follow-up diff, address material findings, record verification, and make one new commit with the requested identity without pushing.

## Execution record

- The existing branch is clean at `f02929c`; the 13 existing focused retirement tests pass before changes.
- The previous plan records all-cache deletion and cache eviction as historical behavior. This brief replaces both requirements; the previous implementation and commit remain in branch history.
- The updated expectations failed against the previous implementation: 7 focused unit failures, artifact rejection for unrelated-cache deletion, and a browser failure after successfully reproducing the redirected cached response.
- The dedicated Chromium configuration disables automatic error-page reloads. This keeps the actual `chrome-error:` document available for exactly one explicit recovery reload, without Chrome's background retries affecting the navigation count.
- Existing boot wiring already calls cleanup once and has no worker registration or online/visibility worker update checks. Existing root/subpath worker headers already require no-cache.
- Independent read-only review found no Critical, Important or Minor issues. The reviewer directly reran the artifact verifier and diff check, and inspected the build/unit/browser verification logs. The exact worker storage-error behavior remains as supplied; browser update scheduling and live hosting are outside this local verification.
- Completion keeps the branch in place with one follow-up commit as Charlie Grant <grantcharlie1000@gmail.com>; no push or deployment.

## Verification

| Command | Result |
| --- | --- |
| Focused worker/app unit tests | 11 passed |
| `npm run build` | Passed, including artifact verification |
| `node scripts/verify-sw-kill-switch.mjs` | Passed |
| `npm test -- --maxWorkers=1` | 3,295 tests / 165 files passed |
| `npx playwright test --config=playwright.sw-kill-switch.config.ts` | 4 Chromium cases passed on port 4618 |
| `npm run verify:offline` | Artifact check and the same 4 Chromium cases passed again |
| `git diff --check` | Passed |
