# Private movie relay implementation plan

> **For agentic workers:** Implement independent frontend/provider work in parallel and review the complete branch before release. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Relay QCC video through its own server and offer FrameXTV, VidLink, VixSrc and VidSrc without direct browser connections to those providers.

**Architecture:** Fixed provider adapters resolve playable sources. A first-party player uses signed media endpoints for every media request; the backend validates and pins DNS and rewrites HLS references. Preserve the existing outer movie-view iframe lifecycle and progress protocol.

**Tech Stack:** Existing Vite/TypeScript, Netlify Functions, Node HTTPS, hls.js and ipaddr.js.

**Spec:** `docs/superpowers/specs/2026-10-27-movies-relay.md`

## Global constraints

All four providers must have real adapters and truthful provider failure states. No upstream executable code reaches the browser, no direct-network fallback, no arbitrary target signing, no visitor headers upstream. Four-hour capabilities, bounded transfers, per-endpoint rate limiting. Preserve PR #52 and main.

## Review focus

1. A hostile upstream response must not cause private-network access or executable same-origin content.
2. Stream URLs, headers and tokens may contain provider credentials; do not expose them in application errors or logs.
3. Stale resolver results and retries must not replace a new title, a new source or suspended playback.
4. Range responses must remain valid through seeking and a progressive file larger than one function response.
5. A CAPTCHA or unavailable provider must not trigger direct iframe playback or an endless retry loop.

## Task 1: Secure transport, media capabilities and rewrite handler

Files: `netlify/functions/lib/media-{types,security,tokens,relay}.ts`, `netlify/functions/media.mts`, focused `tests/movies/media-*.test.ts`.

Interface: `UpstreamTransport` and `ResolvedMedia` in `media-types.ts`; `createMediaToken` / `readMediaToken` bind URL, provider, resource purpose, fixed upstream headers and expiry. `handleMedia(Request, secret, transport)` validates and serves content.

- [x] Write failing adversarial token, DNS, redirect, header, HLS and range tests.
- [x] Implement HTTPS transport with public DNS pinning and bounded bodies; capabilities with authenticated encryption; recursive playlist URI rewriting and safe content headers.
- [x] Run focused tests and verify expected failures become passes.

## Task 2: Provider adapters and resolver

Files: `netlify/functions/lib/media-providers.ts`, `netlify/functions/playback.mts`, `tests/movies/media-providers.test.ts`, `tests/movies/playback.test.ts`.

Interface: `resolveProvider(input: PlaybackRequest, transport: UpstreamTransport): Promise<ResolvedMedia>`; GET `/api/playback?provider=&type=&id=&season=&episode=` returns `{provider,source:{url,type},subtitles:[{src,label,srclang}]}` using same-origin encrypted capabilities only.

- [x] Record sanitized live response shapes and write failing normal-path and provider-challenge tests.
- [x] Implement fixed public endpoints and parsers, bounded resolution, validation and rate limiting.
- [x] Prove available adapters resolve real content with bounded network probes; report blocked providers accurately.

## Task 3: First-party player and fallback UI

Files: `movies/player.html`, `src/movies/relay-player.{ts,css}`, `src/movies/{provider,view}.ts`, Vite/CSP configuration and movie browser tests.

Interface: first-party iframe query contains provider/type/ID/episode; requests `/api/playback` with omitted credentials. Existing parent timeupdate/seek/pause protocol uses own-origin/source validation. hls.js is bundled locally; Safari may use native HLS.

- [x] Write failing player/fallback/privacy tests using a small owned video fixture.
- [x] Implement native video controls, source picker, bounded concrete-error fallback, resume, subtitles, cancellation and lifecycle messages.
- [x] Restrict frame-src to self and media/connect to self (blob allowed where MediaSource needs it); exclude playback endpoints/player from offline caching.
- [x] Run Chromium/WebKit movie suites and verify no provider/CDN request originates from the browser.

## Task 4: Integration and delivery

- [x] Run full unit suite, TypeScript, production build and targeted browser tests.
- [x] Request independent review; fix substantive findings with regression evidence.
- [ ] Create a separate draft PR/preview without overwriting newer main changes.
- [ ] Configure the encrypted capability secret after explicit approval and verify live preview endpoints.
- [ ] Deliver the PR and report provider/school-network limits; production rollout remains gated on secret setup and live verification.

## Verification record

After integrating current main (`00012f0`, including the direct-fallback change and Slipline): 139 unit files / 2,869 tests passed (5 browser-dependent cases skipped in the normal unit run); all 19 focused transport/browser cases passed separately with bundled Chromium. All 140 movie cases passed in Chromium/WebKit, TypeScript and production build passed, and the production fixture audit passed at root and repository subpath with all 19 games retained. Independent review found no remaining blocker within the reviewed paths.

Automatic approval review rejected creating `MOVIES_RELAY_SECRET` in Netlify. No secret was stored. The draft PR is reviewable, but live deployment testing and production rollout remain blocked on explicit authorization for that setting.
