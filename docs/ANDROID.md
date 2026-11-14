# QCC Games: Android proof of concept (Capacitor 8)

This is an **isolated Android prototype**. The existing Cloudflare Pages production
website and its deployment workflow are unchanged. Do not publish this debug
build to Google Play or describe all online functions as working.

## Build

Capacitor 8.6.0 (stable release), Node 22, JDK 21, Android SDK 36.
Android Studio 2025.2.1 or newer is recommended.

For an APK **without** a local Android installation, open the GitHub Actions
workflow **Android debug APK (Capacitor)** on the PR or, once merged, dispatch
it manually. If the Gradle job succeeds, download the
`qcc-games-android-debug` artifact, unzip it, then install the APK on an
Android device with permission for sideloaded applications.

For local development:

```sh
npm ci
npm run build
npm install --no-save --package-lock=false @capacitor/core@8.6.0 @capacitor/cli@8.6.0 @capacitor/android@8.6.0
npx cap add android
npx cap sync android
npx cap open android
```

This bootstrap intentionally leaves the website's package/lockfile alone.
The resulting `android/` project is generated locally or by CI, not yet
checked in. **Before a shipping release**, pin Capacitor dependencies in the
project package/lockfile, check in a reviewed Android native project, choose
the permanent package ID, and set up release signing/Play App Signing. The
current package ID is only a provisional prototype identifier.

## Known functional gap: online APIs

The browser website calls relative paths
`/.netlify/functions/{accounts,leaderboard,turn,social,chat,media}`
and `/api/movies`. On the website, Cloudflare Pages forwards these to a
server. In a locally bundled Capacitor WebView, `https://localhost` is
**not Cloudflare Pages**; the API routes therefore do not exist.

**Do not solve this by embedding backend secrets or blindly granting wildcard
CORS access.** Before calling the Android app production-ready:

1. Create an explicit native-compatible API URL resolver, using the existing
   public `https://nceastudy.pages.dev` gateway for browser-safe requests.
   Include media GET URLs and upload XHR, not just `fetch()` calls.
2. Design and test secure cross-origin access for Android's local WebView
   (CORS preflights for Authorization/Content-Type, or an audited native HTTP
   bridge). Preserve authentication, request limits, backend proxy restrictions
   and any existing same-origin security assumptions.
3. Test signup/login, cloud sync, scores, social posts, chat and photo uploads,
   and movie metadata against a test backend. Avoid production test accounts.
4. Integrate the Android back button, dialog dismissal, insets/status bar,
   keyboard, permissions, app lifecycle and external links appropriately.
5. Audit sandboxed movie providers and content rights before distribution.

The static web bundle can load local assets without a service worker, but this
does **not** restore the retired offline caching mode or make network-backed
features available offline. No service-worker policy is changed.

## Release acceptance

- Debug APK successfully built and launched on a physical Android device
- Game library, navigation and a representative set of Canvas/WebGL/touch games
  verified for performance and rotation
- Proper offline behaviour and local saves verified; network loss is graceful
- API parity verified (accounts, cloud saves, leaderboards, social, chat, media)
- Android back button, overlays, pause/resume, fullscreen and keyboard verified
- Privacy disclosures, branding, content rights and Play policies reviewed
- Release-signed AAB generated from the reviewed native project

Current status: **Android build scaffold only; native runtime and API parity
unverified.**
