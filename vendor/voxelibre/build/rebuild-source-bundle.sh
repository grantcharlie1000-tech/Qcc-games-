#!/usr/bin/env bash
# Rebuild the source bundle in place, including locally modified engine sources.
set -euo pipefail
QCC_BUNDLE_DIR=$(cd -- "${1:-$(dirname -- "${BASH_SOURCE[0]}")/..}" && pwd)
QCC_NATIVE_DIR="$QCC_BUNDLE_DIR/luanti-wasm"
QCC_NODE_BIN=$(command -v node)
test -f "$QCC_NATIVE_DIR/build_all.sh"
test -d "$QCC_BUNDLE_DIR/ports"
cd "$QCC_NATIVE_DIR/emsdk"
if [ ! -f upstream/bin/clang ]; then
  # Preserve the included patched source and any changes you have made to it.
  QCC_SDK_SOURCE_COPY=$(mktemp -d)
  trap 'rm -rf -- "$QCC_SDK_SOURCE_COPY"' EXIT
  cp -a upstream/emscripten "$QCC_SDK_SOURCE_COPY/"
  ./emsdk install 6.0.8
  cp -a "$QCC_SDK_SOURCE_COPY/emscripten/." upstream/emscripten/
fi
./emsdk activate 6.0.8
python3 - "$QCC_NODE_BIN" <<'PY'
import pathlib, re, sys
config = pathlib.Path('.emscripten')
config.write_text(re.sub(r'^NODE_JS = .*$', 'NODE_JS = ' + repr(sys.argv[1]), config.read_text(), flags=re.M))
PY
chmod -R a+rX upstream node
source ./emsdk_env.sh
cd "$QCC_NATIVE_DIR"
# Only generated outputs are replaced. Source directories are kept as supplied.
rm -rf build www
emcc --clear-cache --clear-ports
python3 - "$QCC_BUNDLE_DIR" <<'PY'
import json, pathlib, shutil, sys
root = pathlib.Path(sys.argv[1])
recipe = json.loads((root/'qcc-build/source-recipe.json').read_text())
cache = root/'luanti-wasm/emsdk/upstream/emscripten/cache/ports'
for item in recipe['inputs']:
    if not item['name'].startswith('port-'):
        continue
    name = item['name'].removeprefix('port-')
    shutil.copytree(root/'ports'/name, cache/name)
    (cache/name/'.emscripten_url').write_text(item['url']+'\n')
PY
# The source archives and repositories are already included and pinned in the
# bundle. Omitting fetch_sources.sh also permits your local source modifications.
for stage in zstd libarchive webshims openssl curl libzip luanti fsroot www; do
  "./build_${stage}.sh"
done
printf 'Native output: %s/www\n' "$QCC_NATIVE_DIR"
