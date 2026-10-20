# VoxeLibre: source code, credits and licenses

QCC distributes **VoxeLibre 0.92.4** with a locally running **Luanti WebAssembly
engine**. VoxeLibre's developers, the Luanti community, paradust7 and the authors
of the libraries below created the game and browser engine. Their original
copyright and license notices are preserved.

## Downloads

- [VoxeLibre 0.92.4 source and assets](sources/voxelibre-0.92.4.zip) — the complete,
  unmodified official game release, including its mod sources, media notices and
  credits. SHA256: `6215d4da27900874959ff586fb266091be3d4161b9d4f5d27ce0d0cdc49f1af2`.
- [Runtime corresponding source](sources/runtime-source.tar.gz) — the patched
  browser port, engine, bundled libraries, Emscripten runtime and ports, dependency
  sources, build scripts and license notices needed to rebuild the runtime.
- [Runtime source checksum and file count](sources/runtime-source.json).
- [Game contributors](licenses/VOXELIBRE-CREDITS.md) and
  [VoxeLibre's original README](licenses/VOXELIBRE-README.md).
- [QCC integration and build recipes](https://github.com/grantcharlie1000-tech/Qcc-games-/tree/feat/voxelibre/vendor/voxelibre/build).

The source downloads are separate from the assets loaded when playing. The
runtime source archive includes a `SOURCE-MANIFEST.json` with each source file's
SHA256 or symbolic-link target, plus the upstream archive checksums. It also
includes the exact patches and a `README.md` explaining how to rebuild and modify
the engine. Build dependencies can be obtained from the pinned public upstream
projects; no QCC account or multiplayer service is needed.

## Versions and upstream projects

| Component | Distributed source |
| --- | --- |
| [VoxeLibre](https://git.minetest.land/VoxeLibre/VoxeLibre) | 0.92.4, ContentDB release 39534; game source commit `a5078bab2efbc8a670b8b10c290ade73aa87be6a` |
| [Luanti browser port](https://github.com/paradust7/luanti-wasm) | `5bfae52b53605b39667dfc29cddd59c861e38111`, with the supplied QCC patch |
| [Luanti engine fork](https://github.com/paradust7/luanti) | `6f532b5ed03a6aa70091412114b5dde3d33c6f87`, with the supplied singleplayer menu patch |
| [Browser socket shim](https://github.com/paradust7/webshims) | `70653a91c974aa2b20df09a39f858d92e663c1a7`, with the supplied local socket patch |
| [Zstandard](https://github.com/facebook/zstd) | `f8745da6ff1ad1e7bab384bd1f9d742439278e99` |
| [Emscripten](https://github.com/emscripten-core/emscripten) | 6.0.8, revision `aeb67926e7de656da38bc807d83050af93578758`, with the six browser port patches |
| Native archive/network libraries | libarchive 3.6.1, libzip 1.11.4, curl 7.82.0, OpenSSL 1.1.1n |
| Emscripten ports | SDL 2.32.10, zlib 1.3.2, libjpeg 9f, libpng 1.6.58, FreeType 2.14.3, Ogg 1.3.5, Vorbis 1.3.7, SQLite 3.39.0 |
| Terminal support | xterm.js 6.0.0 and addon-fit 0.11.0 |

Luanti's source tree also includes its Irrlicht rendering engine fork, Lua,
JSON parser, mini-gmp and other bundled libraries. The Emscripten tree includes
the C/C++ runtime, compiler runtime, WasmFS, pthread and browser API code used
by the build. Each retains its component license. Emscripten's test suite,
documentation website and test media are excluded from the source download;
they do not contribute code or assets to the distributed game.

## QCC changes

The included patches identify QCC's changes to the upstream code: browser build
fixes, memory and worker settings, same-origin runtime paths, a content-based
installed-pack version, local singleplayer sockets and native singleplayer menu
controls. The official VoxeLibre game ZIP is unchanged. QCC's launcher handles
the surrounding site navigation and world backup controls; its JavaScript is
served as readable source alongside the game page.

## License notices

VoxeLibre code is distributed under **GPL-3.0-or-later**, with the additional
component and media licenses documented in its source ZIP. Luanti code is
**LGPL-2.1-or-later**; included libraries retain their own terms, including
mini-gmp's **LGPL-3.0-or-later / GPL-2.0-or-later** alternatives. The source
downloads preserve the copyright headers, attribution files and license texts
for these components.

| Notices | Text |
| --- | --- |
| VoxeLibre | [GPL and game license](licenses/VOXELIBRE-LICENSE.txt), [credits](licenses/VOXELIBRE-CREDITS.md); mod and media notices at their original paths in the game ZIP |
| Luanti code, textures and bundled notices | [Luanti license and media attribution](licenses/LUANTI-LICENSE.txt), [LGPL 2.1](licenses/LGPL-2.1.txt), [LGPL 3](licenses/LGPL-3.txt), [GPL 3](licenses/GPL-3.txt), [bundled notices](licenses/LUANTI-BUNDLED-NOTICES.txt) |
| Browser port and socket shim | [luanti-wasm MIT](licenses/luanti-wasm-MIT.txt), [webshims MIT](licenses/webshims-LICENSE.txt) |
| Irrlicht and fonts | [Irrlicht notices](licenses/IRRLICHT-NOTICES.txt), [font notices](licenses/FONT-LICENSES.txt) |
| Emscripten | [MIT / NCSA](licenses/EMSCRIPTEN-LICENSE.txt), [system library notices](licenses/EMSCRIPTEN-SYSTEM-NOTICES.txt), [third-party notices](licenses/EMSCRIPTEN-THIRD-PARTY-NOTICES.txt) |
| Native dependency libraries | [OpenSSL, curl, libarchive, libzip and Zstandard notices](licenses/DEPENDENCY-LICENSES.txt) |
| Emscripten ports | [SDL, zlib, libjpeg, libpng, FreeType, Ogg, Vorbis and SQLite notices](licenses/PORT-LICENSES.txt) |
| xterm.js | [xterm license](licenses/xterm-LICENSE.txt), [fit addon license](licenses/xterm-addon-fit-LICENSE.txt) |

Portions of this software are copyright © 2026 The FreeType Project
(www.freetype.org). All rights reserved. This software is based in part on the
work of the Independent JPEG Group. SQLite is in the public domain.

The applicable free-software licenses permit you to inspect, modify and rebuild
the software. The runtime source archive includes a script for building modified
sources in place and a packager for replacing the runtime in a copy of this site.
