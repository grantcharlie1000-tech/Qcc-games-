# Popular in Marlborough

## Current behavior

- The Movies Home and Movies section show real aggregated movie IDs from the past seven UTC calendar days. Empty and unavailable states never substitute TMDB trending or invented local activity.
- Menu → Contribute to Popular in Marlborough is on by default per browser. Opt-out stops future reports, including in other open tabs, without hiding the rail. Clearing watch history does not change this preference.
- A report requires 60 seconds of plausible advancing playback during the current session. The client does not read Continue watching, My list, past viewing history, account sessions, or saved resume positions to qualify a report. It never backfills history.
- Reports contain only a movie ID and a title/day-specific random token. A daily random seed stays in the browser. No new persistent viewed-title list is saved. Failed reports are dropped, not queued or retried in the background.
- The backend suppresses title/day buckets below five accepted tokens. It returns movie IDs only, not counts. See [backend details](MOVIE_POPULARITY_BACKEND.md) for deduplication, retention and shared-network rate limits.

## Playback contract

Licensed local videos qualify through their own `timeupdate` only while playing, not seeking, visible and not suspended or inert.

FrameXTV's native player can qualify through its documented `frameXTV:timeupdate` message containing numeric `currentTime` and optional `duration`. The sending window (`event.source`) must be the exact currently embedded frame and the origin must match the existing explicit FrameXTV origin allowlist. Parent-page messages, old/detached frames, sibling frames, lookalike origins and Archive.org messages cannot qualify. TV episodes are not counted.

Only the reported advancing clock is used, never the initial resume timestamp. Frozen positions, large forward/backward seeks, hidden tabs and gaps over ten seconds add no playback credit. The qualification clock resets when the player is rebound, the iframe loads again, Movies stops, or the contribution preference changes. A minute of qualifying playback is approximate evidence, not proof of watching. FrameXTV does not include a paused/seeking flag, so small seeks indistinguishable from normal progress cannot be detected perfectly.

Unsupported nested fallback players remain uncounted. They do not gain support merely because the top-level FrameXTV shell loaded or announced readiness. No provider script runs in the QCC parent page; the existing sandbox, referrer and feature policies are unchanged. There is no stream extraction, proxy, DRM handling or forwarding of provider accounts/tokens.

### Provider evidence and its limits

On 2026-11-12 the public `/api` documentation's lazy `DocsPage-Bot1GRs-.js` bundle documented the event above. The lazy native `Player-lMmZlVTB.js` bundle contains the video element's `onTimeUpdate` handler calling `window.parent.postMessage({event:'frameXTV:timeupdate',currentTime,duration},'*')`. The entry bundle alone does not establish the player contract. The earlier conclusion that the event was absent came from checking only that entry bundle and was incomplete.

The inspected fallback adapters instead post their translated message to their own `window`. The parent deliberately does not count those. Source inspection establishes the native code path, not a successful live movie session or universal provider availability. Lawful controlled real-player verification is a separate release check, not something synthetic fixture messages can prove.

## Deployment status and limits

The existing aggregate backend was enabled on 2026-11-12 after authorized deployment of PR #146. Main and production source were `16880f84a60089f12a94771ef0bbe6f10f9db4a7`. The production GET endpoint returned HTTP 200 with an empty ranking. Separate free preview/production D1 databases, encrypted secrets, bindings, enablement and cleanup Workers were configured. Preview verified deduplication, five-report suppression/ranking and idle cleanup; synthetic fixtures were removed. Production validation did not fabricate a populated ranking.

This follow-up enables fresh native FrameXTV sampling in source. Its release is separate from the backend activation. It requires focused browser regression checks, independent review, lawful supported-player verification and exact-source production verification before being called live. An ordinary frontend publish preserves the existing Pages bindings and secrets. Do not rerun the old backend provisioning workflow, rotate secrets, or create another database for this frontend change.

Reports are approximate daily browser contributions, not distinct people, students or residents. No location or Marlborough membership is collected or verified. Client signals and random tokens can be forged. One browser can contribute on multiple days; clearing storage or using other devices changes deduplication. Threshold suppression is not a guarantee of anonymity. Do not use this discovery feature for attendance, discipline, surveillance or conclusions about individuals.

Live-table cleanup is separate from Cloudflare's always-on seven-day free-plan D1 backup window. The application does not log bodies, tokens, addresses or secrets. Platform connection metadata is separate from application storage.

## Verification

The current MoviesView integration tests exercise the real receiver and contribution client with controlled network boundaries. They cover current-window/origin validation, initial resume, stalls, seek/gap rejection, iframe reload, opt-out, hidden/detached streams, inert views and reopening Movies. The new reporting and reload regressions were observed failing before their fixes.

The Playwright suite uses provider fixtures, not a real FrameXTV stream. It also plays a generated 75-second CC0 silent VP8 video in a real local `<video>` element. Fixture screenshots are labeled as fixtures. The isolated D1 test uses local workerd/Miniflare, not production data.

Local Chromium cannot start in this cloud environment because its Unix socket is restricted. Browser validation runs on GitHub-hosted runners through `Verify movie popularity`, for Chromium and WebKit. Do not describe a blocked local launch as a passing browser check. The full repository suite and focused checks must be reported separately; unrelated failures are not a full pass.
