# Movie relay and fallback sources

## Behavior

FrameXTV is the default source. VidLink, VixSrc and VidSrc are selectable alternatives in the QCC player. A concrete resolution or media error tries each remaining source once. Viewers can also select a source, try the next source or reload. Source changes retain the selected episode, current position and whether playback was playing or paused. Paused, healthy playback is not replaced by a timer.

The iframe loads the bundled `movies/player.html`, including when QCC is hosted under a subpath. It runs QCC code and locally bundled hls.js. The visitor requests playback metadata, playlists, media, keys and subtitles from QCC's own `/api/playback` and `/api/media` endpoints. Direct provider-player scripts and media URLs are not used as a fallback. Existing TMDB poster requests are separate from this relay.

The backend uses fixed provider adapters and passes no visitor cookies, account tokens, user-agent or IP-forwarding headers upstream. Media URLs are encrypted and authenticated, expire after four hours and authorize only their encoded resource. DNS answers and every redirect must be public; the HTTPS socket is pinned to a validated address. Upstream media responses cannot return executable HTML or JavaScript.

## Required deployment setting

Set `MOVIES_RELAY_SECRET` to a newly generated random value of at least 32 characters, marked secret and scoped to **Functions**, for the Netlify deployment contexts that should stream. Generate it outside source control. Do not reuse an account/session secret or put its value in `netlify.toml`, a build artifact, a PR or logs. Redeploy the selected context after setting it. Changing the value invalidates previously issued media capabilities.

Without this setting, valid playback requests return `503 playback_not_configured`. This deliberate failure prevents the site from issuing unauthenticated relay URLs. The implementation PR must remain a draft until the setting is authorized and live preview testing is complete.

`netlify.toml` packages the server Chromium binary and Puppeteer for VidLink's public JavaScript/WASM bootstrap. That browser uses a fresh profile, a deny-all proxy, bounded approved requests and a deadline. It does not run in the visitor's browser. The other adapters use ordinary backend HTTP requests. No separate paid hosting service is provisioned.

## Provider evidence and limits

| Source | Implemented route | Evidence at implementation time |
| --- | --- | --- |
| FrameXTV | Public stream API; MP4/HLS and subtitles | Live metadata returned an MP4 source and subtitle tracks. |
| VidLink | Public player bootstrap in an isolated server browser, then public playback metadata | Captured a normal playback response with progressive video alternatives; some titles/codecs may not play in every browser. |
| VixSrc | Public title API, embed metadata and HLS master playlist | Live metadata resolution and a valid HLS playlist were observed. |
| VidSrc | Public embed chain with plaintext stream metadata where available | The current live route requires human verification. It reports that condition and permits another source; verification is not bypassed. |

These observations are not an end-to-end deployed playback result. Native DNS lookup to provider hosts is unavailable in the development environment; control probes through its configured HTTPS proxy succeeded. Production DNS validation must not be weakened to work around that limitation. Verify the deployed preview's resolver and bounded media bytes after its secret is configured, before merging.

The relay helps only while the school can reach the QCC site and its same-origin API endpoints. It does not guarantee access on a particular network, provider availability or access to every title. It cannot overcome a block of QCC itself. CAPTCHA, login, payment and protected-media requirements are reported as unavailable/unsupported rather than bypassed.

## Operational bounds

- Resolution deadline: 45 seconds on the server, 50 seconds in the client; the server browser has a 25-second budget within that deadline.
- Progressive files: requests are served in ranges of at most 4 MiB, allowing seeking and subsequent ranges.
- HLS fragments and initialization resources: complete requested ranges up to 18 MiB; larger resources fail instead of returning corrupted partial fragments.
- Playlists: at most 1 MiB upstream and 8 MiB after recursive URL rewriting. Subtitles are limited to 2 MiB. Ordinary AES-128 keys must be 16 bytes.
- API rate limits: 30 playback resolutions and 900 media requests per minute per IP/domain. Shared-network viewers share the IP limit.
- Media, capabilities and the player page are excluded from the offline service worker and use no-store responses. Streamed traffic consumes the existing Netlify project's bandwidth and function allowance.

## Verification

Run `npm test`, `npm run build` and `npm run test:e2e -- tests/movies`. The browser tests use small generated video/HLS fixtures and assert playback, fallback, resume, deadlines, iframe lifecycle and absence of provider/CDN requests in the visitor browser. They do not assert live upstream availability.

The isolated server-browser fixtures run when `MEDIA_BROWSER_TEST_EXECUTABLE` points to a compatible Chromium executable. They test the deny-all network boundary, cancellation and resource budgets. The normal unit command skips these browser-dependent cases unless that executable is supplied.

After building, `node scripts/verify-movies.mjs` serves the production files at `/` and `/Qcc-games-/`, uses the production content security policy and verifies real first-party fixture playback, every frame's request origins, all four source options, Study teardown and offline behavior. `MOVIES_LIVE=1` only changes poster requests to live requests; the static-build audit still uses relay fixtures and is not a live backend playback test.

`MOVIES_TV_TEST_RESULTS.md` records the earlier external-iframe implementation and historical test runs. This document describes the replacement relay architecture.
