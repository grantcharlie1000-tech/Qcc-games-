# VoxeLibre native runtime build

This directory reconstructs the pinned browser engine used by QCC. The source
identities are in `pins.json`. The normal site build restores a verified vendor
archive split into small Git files; it does not compile C++.

Native rebuilding requires Linux, Git, Python 3, Node.js 24.18 or newer, CMake,
Make, a C/C++ compiler, Perl, patch, and Zstandard. The pinned Emscripten 6.0.8
SDK is installed within the separate build directory. Native compilation needs
network access to the public pinned sources and compiler/port downloads.

From the QCC repository root:

```sh
bash vendor/voxelibre/build/build-runtime.sh ../qcc-native-build
python3 vendor/voxelibre/build/package-runtime.py ../qcc-native-build
node scripts/prepare-voxelibre-runtime.mjs
node scripts/prepare-voxelibre.mjs
```

The native build directory is dedicated to this task. The upstream build clears
its own `build/` and `www/` outputs. Source checkouts must match the exact Git
pins; the wrapper refuses a different checkout or a patch that no longer matches.
It uses the host Node executable as upstream's SDK installer does. CMake 3.31.6
and Node 24.19.0 were used for the QCC recovery build.

The QCC patches keep the native world manager, creative/survival controls and
settings, with Online, ContentDB and server hosting hidden in QCC singleplayer
mode. Loopback UDP connects the local server and client within the same browser.
The runtime defaults to an empty external proxy URL. Shared WebAssembly memory
starts at 512 MiB and can grow to 2 GiB, with eight initial worker threads.

`package-runtime.py` normalizes browser paths to `/voxelibre/runtime/` and embeds
a pack identity derived from the base filesystem and game source checksums. It
emits a deterministic gzip/tar archive as parts no larger than 300,000 bytes,
plus the archive and individual-file SHA-256 checksums. The manifest also binds
the artifact to the checked-in pins and QCC patches. Publish the small parts;
do not send an unsplit multi-megabyte blob through a connector.

The site preparation script verifies the native inputs, every archive part,
the joined archive and each extracted file. It preserves the separately
generated `mineclone2.pack`. Missing, stale or partial native outputs are
reconstructed; valid outputs are reused. The source-delivery recipe and public
`SOURCES.md` describe the corresponding-source download.
