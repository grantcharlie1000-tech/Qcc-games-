# VoxeLibre native runtime build

This directory reconstructs the pinned browser engine used by QCC. The source
identities are in `pins.json`. The normal site build restores a verified vendor
archive split into small Git files; it does not compile C++.

Native rebuilding requires Linux, Git, Python 3, Node.js 24.18 or newer, CMake,
Make, a C/C++ compiler, Tcl, patch, and Zstandard. The pinned Emscripten 6.0.8
SDK is installed within the separate build directory. Native compilation needs
network access to the public pinned sources and compiler/port downloads.

The build recipe and QCC patches are being restored after workspace cleanup.
Do not treat a successful checkout as a completed native build. The artifact
manifest and corresponding-source verification record are generated only after
compilation and packaging succeed.
