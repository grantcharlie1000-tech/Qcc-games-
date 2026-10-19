# Mauri Gazette — verified automatic deployment

[Published site](https://mauri-gazette.netlify.app) · [Netlify project](https://app.netlify.com/projects/mauri-gazette) · [GitHub source](https://github.com/grantcharlie1000-tech/Qcc-games-)

The four-game correction release is published. The requested Netlify connector reports **ready production deploy `6ad66cf8ae4cc90f7e05944e`**, built from **main commit [`fe22370`](https://github.com/grantcharlie1000-tech/Qcc-games-/commit/fe22370380d0c1f1e02de344dd64be11ec9c7ed6)**, published **2026-10-19T19:18:32.828Z**. `manual_deploy` is **false**: the existing Git connection created this build automatically after main advanced. No manual Netlify upload or build trigger was used.

Project `mauri-gazette`, site ID `4afc912c-6802-4c18-8f2c-273fb3e771ee`. Production branch **main**. Build `npm run build`, publish `dist`, Node 22, settings in `netlify.toml`. Future main pushes use the same working connection.

## Source integrity

The connected GitHub app advanced main without force, guarded by its expected previous SHA. Remote tree **`a300f1aaea0c57ad8f357afbcace8f9b99eed0b3`** exactly matches reviewed local snapshot **`26cf9785654eda4f0e9c9b25756f3f5c816b6e47`**. The isolated original game owners' commits were reviewed and integrated locally, then published as a consolidated source commit because shell Git authentication was unavailable. This publication route does not require a user token or connection change. [Build and review record](AGENT_BUILDS.md).

The release passed 252 logic tests, the 139-case full Chromium regression, 15 final Water capture cases and 4 shared viewport/Study follow-ups. All 12 games and 20 chapters passed offline at both root and repository subpath. The real two-version/two-tab update test preserved the old cached game and high score. [Full results](DELIVERY.md), [correction evidence](GAMEPLAY_CORRECTIONS.md).

## Verified local deployment bundle

Offline pack **d1b885f03c1f**, **65 required files**, exactly 12 games and 20 Study chapters. The [ready static ZIP](evidence/mauri-gazette-netlify.zip) is **340,939 bytes**, SHA256 **`13c2fefd1b4c4d03a0a9282d347d50defff2e496b2edb8a5b2e04c2148974a90`**. It contains every required offline file and `_headers`; sourcemaps and the internal Vite manifest are excluded. [Machine-readable deployment proof](evidence/netlify-deployment.json).

The unchanged output passed production offline interactions at `/` and `/Qcc-games-/`. Relative assets, directory-scoped service worker and hash routes support both. GitHub Pages remains configured separately; no Pages publication is claimed.

## Verification limits and browser updates

Direct live-origin browser/HTTP access is blocked by this environment's proxy; a fresh HEAD attempt returned CONNECT tunnel HTTP403. The ready deployment and matching source were verified through the connector. This does not independently certify live-origin headers, payload bytes or offline downloading on that origin. [Actual origin attempt](evidence/correction/live-origin-unavailable.txt).

Chromium keyboard/pointer/touch emulation is not physical Chromebook/Mac or Safari/WebKit certification. Hardware performance remains unverified. Existing offline tabs retain their old release until all arcade tabs close. Reopen to activate an available update, then download the new complete offline pack. Browser/device policy may block or evict caches; caching does not bypass controls.
