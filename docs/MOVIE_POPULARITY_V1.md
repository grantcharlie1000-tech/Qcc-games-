# Popular in Marlborough: prototype v1

## Included

- A matching poster rail at the top of Movies Home and the Movies section, named **Popular in Marlborough**, with “Across QCC · Past 7 days”. It links through the existing title and playback flows.
- Real aggregate IDs only. Empty, loading and unavailable states, plus retry. No fabricated local activity and no substitution of TMDB trending results.
- **Menu → Contribute to Popular in Marlborough**, enabled by default per browser. No new popup. Opt-out stops future reporting without hiding discovery; existing totals are unchanged.
- Conservative 60-second advancing playback qualification for supported FrameXTV messages and licensed native video. A card click, initial resume timestamp, ready message, seek, hidden tab or unsupported Archive player does not qualify.
- Separate daily random browser seed, per-movie derived tokens, no account or history upload, no new persistent title-history list. Pending hashing is invalidated on stopping/opt-out. Samples are dropped on network failure rather than queued or backfilled.
- Disabled-by-default Pages/D1 backend with atomic dedup and aggregation, daily five-report suppression, seven-calendar-day ranking, no public counts, body/origin validation and short-lived IP-based rate limiting.
- Updated existing privacy copy and documentation. My list and resume positions remain device-local; the new aggregate transmission is described accurately.

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

The corrected code passes the full 236-file / 4,696-test unit suite and production build. These checks preceded the final menu-copy removal below. Nothing has been deployed.


## Follow-up: remove the expanded settings explanation

Removed both requested paragraphs under the contribution switch and the now-unused description reference. The aligned switch, default-on preference and persistent opt-out are unchanged. A failed preference write still receives an accessible announcement instead of silently claiming the change was saved. The existing Movies footer retains the accurate aggregate-data and connection-information disclosure; no popup was introduced.

The final code was checked against `main` at `05214cd0619e940242269d45f28888347fe9bea9`. Publication is limited to a draft PR, with backend enablement and live provider verification still gated as above.

Final verification after the removal and persistence-failure fix: **236 unit-test files / 4,699 tests passed**, the **25 focused client/API/privacy tests passed**, the production build and TypeScript passed, and all **3 noindex checks passed**. The three new preference-save regressions were observed failing before the fix, then passing. Independent follow-up review found no remaining blocker for draft PR publication. Full browser-suite, live-provider and live-D1 validation remain release gates, not claimed passes.
