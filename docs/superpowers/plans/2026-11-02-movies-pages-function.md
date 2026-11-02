# Movies Pages Function Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan inline. Use an independent reviewer for the completed change.

**Goal:** Restore the live TMDB catalogue on Cloudflare Pages at `/api/movies`, preserving Netlify support.

**Architecture:** Move the existing Web API handler unchanged into `server/movies-catalog.ts`. Netlify and the repo-root Pages Function supply their own `TMDB_READ_TOKEN` binding to that handler. Keep the Netlify named export for existing consumers and tests.

**Tech Stack:** TypeScript, Fetch API, Vitest, Vite, Wrangler Pages.

**Spec:** Charlie's task via Steve, 2 November 2026; the requirements below record its implementation scope.

## Global Constraints

- Work in `/workspace/qcc-movies-cf` on `fix/movies-pages-function`; do not push or deploy.
- Preserve request/response shapes, headers, caching decisions, validation, timeouts and generic upstream errors for search, rails, genres, details and seasons.
- The existing handler has no application rate limiter; preserve its handling of TMDB rate limits.
- Pages must use `functions/api/movies.ts`, discovered by `wrangler pages deploy dist` from the repo root.
- Read only the server binding `TMDB_READ_TOKEN`; never expose or commit a real token.
- Do not touch the `cloudflare-port-prep` (#84) folder or UI code.
- Commit as Charlie Grant <grantcharlie1000@gmail.com>.

## Review Focus

- Missing/empty bindings must return 503 `catalog_not_configured` without an upstream request.
- Search, partial rails and incomplete season responses must retain `no-store` and omit the existing CDN header.
- Invalid parameters and non-GET methods must fail before contacting TMDB.
- Upstream auth/rate-limit/network failures must return generic errors without exposing upstream bodies.
- Shared code must have no Netlify runtime dependency; both adapters must use their own environment binding.

### Task 1: Shared catalogue and Pages adapter

**Files:** Create `server/movies-catalog.ts`, `functions/api/movies.ts`, and `tests/movies/pages-api.test.ts`; modify `netlify/functions/movies-search.mts`, `tests/movies/catalog-api.test.ts`, `tsconfig.json`, and `ARCHITECTURE.md`.

**Interfaces:**
- Consumes: the existing `handleMoviesCatalog(req: Request, token: string, fetcher?: Fetcher): Promise<Response>`.
- Produces: the same shared function, a backwards-compatible Netlify export/default adapter, and a Pages `onRequest({request, env})` returning the shared response.

- [x] Write Pages adapter tests with mocked global fetch: search results and upstream parameters; complete/partial rails; selected/default seasons; missing/empty secret; method/parameter validation; upstream 401/404/429, invalid metadata and network failure.
- [x] Run `npx vitest run tests/movies/pages-api.test.ts`; confirm the adapter is missing before implementation.
- [x] Move the handler without changing its logic or headers; wire both host adapters and include `functions`/`server` in TypeScript checking. Verify the Netlify default adapter still reads its runtime binding.
- [x] Document both adapters, the unchanged client route, and Hosting Lead's command: `wrangler pages secret put TMDB_READ_TOKEN --project-name qcc-games`. Explain root-directory Wrangler deployment and the graceful missing-secret response.
- [x] Run `npm run check`, `npx vitest run tests/movies`, and `npm run build`; expect zero errors. Run the full unit suite for regression coverage.
- [x] Run `npx wrangler pages dev dist` on a free port in 4600–4699 with an ephemeral fake binding. Verify `/api/movies` gives JSON, validation returns 400, and failed TMDB authentication is handled as 502. Stop the local server and remove the fake binding afterward.
- [x] Obtain independent read-only review; address material findings and recheck affected behaviour.
- [x] Check the final diff and commit the completed change as Charlie Grant; report changed files, route, secret, verification and SHA without pushing.

## Verification

- Baseline: 26 existing catalogue tests and `npm run check` passed after `npm ci`.
- Red/green: Pages tests initially failed because the adapter was absent; both handler suites then passed (53 tests). The extracted handler was verified byte-for-byte against the original logic.
- `npm run check`: passed, including both adapters and the shared server module.
- `npx vitest run tests/movies`: 200 tests passed in 12 files.
- `npm test -- --maxWorkers=4`: 3,317 tests passed in 162 files.
- `npm run build`: passed; existing large-chunk warning remains.
- Wrangler 4.156.1 on ports 4662/4663: missing binding 503, validation 400, non-GET 405; fake binding rejected by TMDB with 401 and normalized to 502 for search, rails and seasons. JSON/security/cache headers verified. Servers, temporary binding files and generated Wrangler state were removed.
- Independent read-only review: no actionable findings; nothing declined for review.
