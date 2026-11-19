# QCC Games — optional re3 WASM browser integration

The QCC-side code embeds the independently developed [GTA3-WASM](https://github.com/Antriksh1984/GTA3-WASM) runtime in a game card. The integration is opt-in and initially disabled. This branch does not include the unlicensed reverse-engineered engine or the original game data.

## Building and staging

1. Clone upstream to a separate folder: git clone https://github.com/Antriksh1984/GTA3-WASM.git ../GTA3-WASM
2. Follow the [upstream manual](https://github.com/Antriksh1984/GTA3-WASM/blob/main/manual.md). Activate emsdk, then build using bash scripts/build_wasm.sh from the upstream checkout. This should produce web/build/re3_wasm.js and web/build/re3_wasm.wasm.
3. From QCC Games, run: node scripts/stage-re3.mjs ../GTA3-WASM/web
4. Enable the card in a preview build: VITE_QCC_RE3=on npm run build (on Windows, set the environment variable in the shell or .env.local).
5. Preview the site and open #/game/re3. Each player must pick their own legally obtained GTA III PC install folder using the upstream in-page picker. Files and saves remain in their browser's IndexedDB.

The staging script copies an explicit allowlist of runtime files. It never copies gamefiles, original GTA III artwork, music, movies, maps or web/build/package. Never commit or host those proprietary assets without permission. A build without runtime files will show an honest unavailable message rather than silently failing.

## Limitations and review requirements

- QCC is Vite, TypeScript and Cloudflare Pages; upstream is standalone HTML, JavaScript, WebGL2 and a compiled Emscripten module. The iframe preserves upstream paths, its folder picker, pointer lock, gamepad, virtual filesystem and browser saves.
- The original upstream engine exposes no QCC GameInstance-compatible save or pause method. The adapter's pause blocks the iframe input and hides it, but does not guarantee that the game simulation pauses. Use the game's own menu before opening Study or QCC dialogs. Restart reloads the engine but does not delete its IndexedDB saves. QCC cloud sync does not back up the actual game saves.
- WebGL2 and desktop-grade input are required. Keyboard capture, Escape handling, fullscreen, pointer lock, performance, and persistent saves require manual browser tests on a real compiled build.
- This is a same-origin iframe, so the compiled upstream engine can potentially access QCC account data and origin storage. Review and trust its code before deploying, or isolate the runtime at a separate origin with an adjusted frame policy.
- QCC's CSP must allow self frames. Do not broaden script, connect or frame permissions to unrelated domains.
- This project has no verified redistribution licence for re3. Non-commercial distribution is not an automatic exemption from copyright. Publicly accessible source code is not necessarily licensed for copying. Seek authorisation or legal review before public deployment.
- The WebAssembly files and proprietary assets were not supplied, so this is an integration-ready adapter, not a verified playable release. Keep VITE_QCC_RE3 off until a built runtime has passed testing.

Source documentation: [GTA3-WASM README](https://github.com/Antriksh1984/GTA3-WASM) and [manual](https://github.com/Antriksh1984/GTA3-WASM/blob/main/manual.md).
