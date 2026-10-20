# QCC VoxeLibre runtime: corresponding source

This archive contains the preferred source files, build logic, license notices
and exact patches for the Luanti WebAssembly runtime distributed by QCC. The
VoxeLibre game itself is provided in the separate `voxelibre-0.92.4.zip` download.

## Contents

- `luanti-wasm/`: the pinned browser port, with the QCC patches applied.
- `luanti-wasm/sources/{luanti,webshims,zstd}/`: patched engine, browser socket
  shim and compression library sources. Luanti's bundled libraries, fonts,
  textures, Lua menus, shaders and their notices are included.
- `luanti-wasm/sources/*.{gz,bz2,xz,tgz}`: the pinned OpenSSL, curl, libarchive,
  libzip and xterm source/distribution archives used by upstream's build.
- `dependencies/`: expanded dependency sources after the socket include wrapping
  and OpenSSL patch used by the build, supplied for inspection alongside the
  original archives and transformation scripts.
- `luanti-wasm/emsdk/`: pinned SDK installer and patched Emscripten 6.0.8 source,
  including its JavaScript runtime, libc, libc++, libc++abi, compiler runtime,
  WasmFS, pthreads, OpenAL implementation and port build recipes. Emscripten's
  tests, website documentation and test media are excluded; they do not contribute
  code or assets to this game. Compiler binaries and generated object caches are
  excluded.
- `ports/`: the exact SDL2, zlib, libjpeg, libpng, FreeType, Ogg, Vorbis and SQLite
  port sources. Emscripten's four configuration-header substitutions are applied.
- `qcc-build/`: QCC's pins, patches, compiler build wrapper, source packager and
  runtime packaging script.
- `SOURCE-MANIFEST.json`: SHA256 and size for every regular file, symbolic-link
  targets, upstream download checksums and the deliberate SDK exclusions.

## Build or modify the engine

Use a Linux environment with Bash, Python 3, Git, Make, CMake, a C/C++ compiler,
Perl, Tcl, GNU patch, zstd and Node.js 24.18 or newer. The QCC build used Node
24.19.0, CMake 3.31.6 and Emscripten 6.0.8. The first build downloads the pinned
SDK's public compiler binaries; no service account or game server is required.

From this archive's top directory:

```sh
bash qcc-build/rebuild-source-bundle.sh "$PWD"
```

This builds the supplied sources in place and writes browser files under
`luanti-wasm/www/`. It preserves local edits to the engine, browser port, socket
shim, zstd, Emscripten source and ports. Make desired changes before running it.
To modify OpenSSL, curl, libarchive or libzip, unpack and edit the corresponding
original archive in `luanti-wasm/sources/`, then replace that archive with one
using the same filename and enclosing directory. The upstream build scripts
apply their recorded transformations to those archives during compilation.

Alternatively, `qcc-build/build-runtime.sh /path/to/new-build-directory` checks
out the original pinned repositories and applies QCC's patches afresh. That
workflow deliberately verifies original repository revisions.

To normalize and split a completed runtime for the QCC repository:

```sh
python3 qcc-build/package-runtime.py luanti-wasm --vendor-directory /path/to/qcc/vendor/voxelibre
```

The QCC repository's `scripts/prepare-voxelibre-runtime.mjs` verifies and joins
the small runtime parts, while `scripts/prepare-voxelibre.mjs` converts the
separate official game ZIP into a filesystem pack. The published runtime uses
stable same-origin paths and derives its installed-pack identity from the base
pack and official game source checksums.

## QCC modifications

The patches in `qcc-build/patches/` plainly mark the changes to upstream: static
dependency linkage and cross-build fixes; eight initial pthread workers; 512 MiB
initial memory with growth up to 2 GiB; persistent filesystem fixes supplied by
the pinned browser port; local-only socket behavior; a native singleplayer menu;
and a content-derived pack identity. The game archive is unmodified.

The Luanti engine is LGPL-2.1-or-later. VoxeLibre code is GPL-3.0-or-later with
additional component/media licenses. Each component retains its own copyright
and license terms in the source tree. The download grants no additional
restriction on the rights those licenses provide. You may modify and rebuild
the software, and use your own compatible runtime files in a copy of the site.
