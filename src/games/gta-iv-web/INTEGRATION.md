# GTA IV browser port integration

This is an **experimental, owned-disc launcher**, not an embedded GTA IV game.

Upstream source: https://github.com/itzzace/gta4-web (GPL-3.0).
Upstream latest release: https://github.com/itzzace/gta4-web/releases/latest.
The author of this launcher is not affiliated with the upstream project or Rockstar.

## What works

The QCC Games catalog can launch the upstream community port running at
`http://localhost:8765/` on the player's own machine. Users obtain the port
separately and provide their own USA Xbox 360 ISO and Title Update 8.
No Rockstar files, upstream runtime binaries, game data or encryption keys
are bundled into QCC Games. The launcher itself is not gameplay.

## Why the full import is not shipped

The upstream release uses a local Python server that provides HTTP byte-range
responses for the 7.8 GB ISO, title update, encryption key and game installation,
and serves the cross-origin-isolated WebAssembly build with COOP and COEP.
The QCC Games deployment is a static Vite site on Cloudflare Pages, with its
own service worker, cache manifests and content security policy. A simple
iframe or source copy is not a compatible replacement for that backend.

To genuinely embed the game without distributing copyrighted assets, work is
still required to:
1. Deploy the open-source runtime assets, preserving GPL notices and third-party licenses, with any large binaries served through an appropriate asset host.
2. Create an owned-disc setup workflow that reads files locally, performs
   the same server-side range and installation behavior in the browser or a
   properly isolated user-controlled companion, and never uploads game files.
3. Give the game route cross-origin isolation without breaking the existing
   QCC account/login, media embed and service-worker behavior.
4. Test actual play, controller input, saves, pause, and cleanup with a
   legitimately owned Xbox 360 copy on supported Chromium devices.
5. Make it clear that GTA IV is not part of the offline download pack.
   
Do not mark this as a fully integrated or playable-on-QCC import until
those requirements pass end-to-end testing.
