#!/usr/bin/env bash
# Compile the pinned native runtime in an isolated directory. No site credentials.
set -euo pipefail
for qcc_tool in git python3 node cmake make gcc g++ perl patch zstd; do
  if ! command -v "$qcc_tool" >/dev/null; then
    printf 'Missing native build prerequisite: %s\n' "$qcc_tool" >&2
    exit 1
  fi
done
QCC_RECIPE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
QCC_BUILD_DIR=$(realpath -m -- "${1:?Usage: build-runtime.sh BUILD_DIRECTORY}")
QCC_NODE_BIN=$(command -v node)
export QCC_CA_BUNDLE="$QCC_RECIPE_DIR/ca-certificates.crt"
python3 "$QCC_RECIPE_DIR/fetch-pinned.py" luanti-wasm "$QCC_BUILD_DIR"
for input in luanti webshims zstd; do
  python3 "$QCC_RECIPE_DIR/fetch-pinned.py" "$input" "$QCC_BUILD_DIR/sources/$input"
done
python3 "$QCC_RECIPE_DIR/fetch-pinned.py" emsdk "$QCC_BUILD_DIR/emsdk"
apply_git_patch() {
  local checkout=$1 patch_file=$2
  if git -C "$checkout" apply --check "$patch_file"; then
    git -C "$checkout" apply "$patch_file"
  elif git -C "$checkout" apply --reverse --check "$patch_file"; then
    printf 'Patch already applied: %s\n' "$patch_file"
  else
    printf 'Patch does not match pinned source: %s\n' "$patch_file" >&2
    exit 1
  fi
}
apply_git_patch "$QCC_BUILD_DIR" "$QCC_RECIPE_DIR/patches/luanti-wasm-qcc.patch"
apply_git_patch "$QCC_BUILD_DIR/sources/webshims" "$QCC_RECIPE_DIR/patches/webshims-local-only.patch"
apply_git_patch "$QCC_BUILD_DIR/sources/luanti" "$QCC_RECIPE_DIR/patches/luanti-singleplayer-menu.patch"
cd "$QCC_BUILD_DIR/emsdk"
if [ ! -f upstream/emscripten/emcc.py ]; then
  ./emsdk install 6.0.8
fi
./emsdk activate 6.0.8
# Match upstream's install_emsdk.sh: use the host's supported Node installation.
python3 - "$QCC_NODE_BIN" <<'PY'
import pathlib, re, sys
config = pathlib.Path('.emscripten')
config.write_text(re.sub(r'^NODE_JS = .*$', 'NODE_JS = ' + repr(sys.argv[1]), config.read_text(), flags=re.M))
PY
# SDK archives can retain private extraction modes; all these inputs are public.
chmod -R a+rX upstream node
for qcc_patch in emsdk_dirperms emsdk_openat emsdk_libegl emsdk_jspi emsdk_wasmfs_opfs emsdk_wasmfs_opfs_subdir; do
  if patch --batch --dry-run --forward -p1 < "$QCC_BUILD_DIR/$qcc_patch.patch"; then
    patch --batch --forward -p1 < "$QCC_BUILD_DIR/$qcc_patch.patch"
  elif patch --batch --dry-run --reverse -p1 < "$QCC_BUILD_DIR/$qcc_patch.patch"; then
    printf 'SDK patch already applied: %s\n' "$qcc_patch"
  else
    printf 'SDK patch does not match: %s\n' "$qcc_patch" >&2
    exit 1
  fi
done
cd "$QCC_BUILD_DIR"
./build_all.sh
node --input-type=module -e "import{readFile}from'node:fs/promises';await WebAssembly.compile(await readFile(process.argv[1]));" "$QCC_BUILD_DIR/build/luanti/bin/luanti.wasm"
printf 'Native build complete: %s\n' "$QCC_BUILD_DIR/www"
