# Popular in Marlborough: prototype v1

## Included

- A matching poster rail at the top of Movies Home and the Movies section, named **Popular in Marlborough**, with “Across QCC · Past 7 days”. It links through the existing title and playback flows.
- Real aggregate IDs only. Empty, loading and unavailable states, plus retry. No fabricated local activity and no substitution of TMDB trending results.
- **Menu → Contribute to Popular in Marlborough**, enabled by default per browser. No new popup. Opt-out stops future reporting without hiding discovery; existing totals are unchanged.
- Conservative 60-second advancing playback qualification for a licensed local video element. FrameXTV messages, a card click, an initial resume timestamp, a ready message, a seek, a hidden tab, and an Archive player do not qualify.
- Separate daily random browser seed, per-movie derived tokens, no account or history upload, no new persistent title-history list. Pending hashing is invalidated on stopping/opt-out. Samples are dropped on network failure rather than queued or backfilled.
- Disabled-by-default Pages/D1 backend with atomic dedup and aggregation, daily five-report suppression, seven-calendar-day ranking, no public counts, body/origin validation and short-lived IP-based rate limiting.
- Updated existing privacy copy and documentation. My list and resume positions remain device-local; the new aggregate transmission is described accurately.

## Playback contract

The only input that can advance the 60-second clock is a same-page `<video>` `timeupdate` while the element is playing, not seeking, the tab is visible, and Study or Menu has not suspended the page. The position must move forward in step with elapsed time. Restoring a saved position, a click, a seek, and a paused `timeupdate` do not qualify.

FrameXTV messages do **not** count. On 2026-11-08 the rendered public page `https://framextv.cc/api` (title “API & Embed Documentation — FrameXTV”) shows a postMessage example that listens for `event.data.event === 'frameXTV:timeupdate'` and reads `currentTime` and `duration`. That is documentation, not a player session. The same day’s shell script `/assets/index-BrAnuREQ.js` contains `__syncxtv` and does not contain `frameXTV:timeupdate`. No embed was played: the documented embeds point at third-party movie and TV streams, and this check did not open one. Until a real player is observed emitting the documented event, FrameXTV is unsupported for this count. Local resume may still read the documented shape; popularity does not.

Also ignored:

- Internet Archive embeds.
- Messages posted by the parent page, an old iframe, or any other origin.
- VidLink, VixSrc, and VidSrc, which are not playback providers in this app.

Chromium and WebKit each played a generated 75-second silent VP8 fixture in the app’s `<video>` element. A paused restore to 40 seconds, a paused seek to 30 seconds, and a pause did not contribute. Playback that then advanced past 61 seconds sent one movie id and token. The fixture is not a copyrighted film. WebKit’s first attempt crashed because GStreamer reported `autoaudiosink` missing; installing `gstreamer1.0-plugins-good` fixed that in this environment. Playwright’s WebKit build reported H.264 as unsupported (`MEDIA_ERR_SRC_NOT_SUPPORTED`, code 4) and did not crash on that file.

## Limitations and release gate

This is an **undeployed prototype**, not a verified live feature. It estimates eligible daily browser reports, not distinct people or verified students. It does not collect location or verify Marlborough membership. Client playback signals can be forged; actual FrameXTV availability and message behavior have not been live-tested. Unsupported streams are not counted.

Production requires separate approval, a dedicated D1 database and secret, explicit enablement, scheduled cleanup, platform log/backup retention review, preview end-to-end checks and a privacy review appropriate for students/minors. Until configured, the row displays an unavailable state and no contribution POSTs are made. See [backend setup](MOVIE_POPULARITY_BACKEND.md) for exact retention, suppression and shared-network limitations.

Publication scope: a draft PR is authorized for review. Do not merge or deploy it, configure the database, create credentials, or enable collection as part of this prototype.

## Verification

- Focused client/API tests: **19 passed**, including real SQLite unique constraints, trigger, transaction rollback, suppression, retention and validation.
- TypeScript: **passed** with `npm run check` and the production build's type check.
- Production build: **passed**, including movie catalog validation and service-worker kill-switch verification. Existing large-chunk advisory warnings remain.
- Full unit suite: **236 files, 4,696 tests passed** on the final run.
- Independent review: lifecycle cancellation, privacy wording and repeated retry issues were identified and corrected; a delayed-hash regression was observed failing before its fix and then passing.
- Browser suite: three new Playwright scenarios added for populated/empty/unavailable rails, default-on/persisted opt-out and playback reporting. **Not executed successfully here**: Chromium cannot create its local process socket (`Operation not permitted`). The available browser could not reach the local preview (`ERR_CONNECTION_REFUSED`). This is an execution blocker, not a passing browser result. That limitation applies to the full browser suite. Subsequent isolated Chrome checks and screenshots at mobile and desktop sizes are documented below; no WebKit pass is claimed.

To run browser checks on a usable development machine:

```sh
npm run dev -- --host 127.0.0.1 --port 4617
ARCADE_URL=http://127.0.0.1:4617 npx playwright test tests/movies/popularity.spec.ts --project=chromium
ARCADE_URL=http://127.0.0.1:4617 npx playwright test tests/movies --project=chromium
```

Browser fixtures do not contact a real playback provider. Live D1 and real provider checks remain separate from fixture coverage.

## Follow-up: settings spacing

The popularity switch originally occupied a separate settings group, which introduced an extra 14 px vertical gap and omitted the divider used by adjacent switches. It now sits directly after Christmas theme in the existing group. Its label, description, default and opt-out behavior are unchanged.

A running production-build check in isolated Chrome contexts measured both 390 px and 1440 px viewports before and after the fix. The row gap changed from 14 px to 0 px, the shared divider from 0 px to 1 px, and the checkbox right-edge difference remained 0 px. Default-on and switching off both passed. Actual revised screenshots were captured. Two geometry regression cases were added to `tests/movies/popularity.spec.ts`; the local browser measurement used the same assertions against the built app. The broader playback browser suite is still not claimed passed.

The corrected code passes the full unit suite and production build recorded below. These checks preceded the final menu-copy removal. Nothing has been deployed.


## Follow-up: remove the expanded settings explanation

Removed both requested paragraphs under the contribution switch and the now-unused description reference. The aligned switch, default-on preference and persistent opt-out are unchanged. A failed preference write still receives an accessible announcement instead of silently claiming the change was saved. The existing Movies footer retains the accurate aggregate-data and connection-information disclosure; no popup was introduced.

The final code was checked against `main` at `05214cd0619e940242269d45f28888347fe9bea9`. Publication is limited to a draft PR, with backend enablement and live provider verification still gated as above.

Final verification after the removal and persistence-failure fix: **236 unit-test files / 4,699 tests passed**, the **25 focused client/API/privacy tests passed**, the production build and TypeScript passed, and all **3 noindex checks passed**. The three new preference-save regressions were observed failing before the fix, then passing. Independent follow-up review found no remaining blocker for draft PR publication. Full browser-suite, live-provider and live-D1 validation remain release gates, not claimed passes.

## Follow-up: isolated D1, cleanup, and playback contract

Checked against `origin/main` `673201b7955d7dd89f39c92926139982a686d41b` (the PR 153 cleanup merge). Election results, Predictions, and the shared rail lifecycle stay. This follow-up does not deploy, create a database, or set `MOVIE_POPULARITY_ENABLED`.

What this run verified:

- Node SQLite runs the production schema, the insert trigger, rollback, the 2,000-attempt shared-address ceiling, and scheduled cleanup while collection is disabled and while the tables are empty. An in-window aggregate is kept.
- Local workerd D1 (Miniflare `5.20261104.0-beta`, compatibility date `2026-11-04`, memory only, `dev.remote: false`) runs playback qualification, contribution, duplicate tokens, the five-report threshold, ranking, batch rollback, and scheduled cleanup with the collection flag absent. The browser then renders that ranking. This is not remote D1.
- Chromium and WebKit each played a generated 75-second silent VP8 file in the real `<video>` element. A paused restore, a paused seek, and a pause did not contribute. Advancing past 61 seconds sent one report. Historical FrameXTV fixture messages did not contribute. Opt-out updated the other tab, survived reload, and stayed off after Clear my list & watch history.
- `npx tsc --noEmit` passed. `npm test`: 245 files passed, 1 skipped; 4,863 tests passed, 7 skipped. The skipped file is `tests/predictions/concurrency.test.ts`, which requires `QCC_TEST_PG_URL`.
- `npx playwright test tests/movies --project=chromium --project=webkit`: 674 passed, 2 skipped, 2 failed. Both failures were `the footer keeps the privacy copy and clears saved data`, which still expected main’s “Saved only on this device.” The page says “My list and resume positions are saved on this device.” That assertion was updated and then passed on Chromium and WebKit. The two skips are conditional fullscreen or Chromium-only glass checks, not popularity failures. On `origin/main` the footer line and the assertion still say “Saved only on this device.”, so this was not a preexisting main failure.

What remains unverified, and blocks enablement:

- A live FrameXTV player. The rendered API page documents `frameXTV:timeupdate`; the fetched shell script does not contain that name. No embed was played. Popularity does not count those messages.
- Remote D1, a deployed cleanup cron, and the account's log and Time Travel settings. `node scripts/movie-popularity-cleanup-local.mjs` is a local in-memory run only.
