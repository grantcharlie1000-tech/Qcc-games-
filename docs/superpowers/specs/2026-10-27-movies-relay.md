# Private movie relay and provider fallbacks

The user approved a server relay for QCC playback and all three proposed alternatives: VidLink, VixSrc, and VidSrc. FrameXTV remains the default. The reason is that the school filters direct provider connections. The earlier requirement to keep visitor account/network data away from providers still applies.

## Design

Use QCC's own video player inside a first-party iframe. The existing movie view keeps ownership of fullscreen, episode navigation, and saved progress. Provider JavaScript and external player HTML never execute in the visitor's browser. A fixed-provider backend resolves public playback metadata. Signed, short-lived same-origin media URLs carry playlists, segments, initialization maps, ordinary HLS keys, subtitles and ranged MP4 responses. The browser never silently falls back to a direct provider URL.

The provider picker includes FrameXTV, VidLink, VixSrc, and VidSrc. Concrete load failures try the next source at most once per source; a visible switch control also works manually. Healthy or paused playback is never replaced merely because a timer expires. Preserve the episode and last playback time while switching.

## Constraints

- Preserve the pending movie-network recovery fixes in PR #52 and current main.
- Accept only provider enums, numeric TMDB IDs, and bounded season/episode numbers from clients. Never offer an arbitrary URL proxy or signer.
- Strip all visitor cookies, authorization, user-agent, referrer, and IP-forwarding headers upstream. Provider-specific headers are constants or metadata resolved by the backend.
- Validate HTTPS destinations and every redirect, reject non-public IPs, and pin connections to the validated DNS answer.
- Sign media capabilities only for URLs discovered by a provider adapter or validated media playlist. Expire after four hours; no upstream URL is returned separately to the client.
- Reject executable content from media endpoints. Do not bypass CAPTCHA, login, payment, DRM, or other provider access controls. A provider requiring verification must fail honestly and allow the next fallback.
- Keep each streamed response below Netlify's documented 20 MB/60 second limits. Use bounded byte ranges for large progressive media, and explicit errors for unsupported oversized resources.
- Rate-limit resolver and media endpoints. No paid service or new hosting product is provisioned.
- Provider compatibility and school-network availability are distinct. Test actual upstream resolution and bounded bytes where available, without downloading entire movies.

## Verification

Unit tests cover SSRF, redirects, token forgery/expiry, credentials stripping, HLS URI rewriting, byte ranges, cancellation and errors. Browser tests cover the first-party player, source switching, progress, subtitles, episode transitions, and absence of provider/CDN requests. Run the full existing unit suite, relevant Chromium/WebKit movie suites, TypeScript, production build, and an independent review. Deploy a preview and smoke test live endpoints before claiming readiness.
