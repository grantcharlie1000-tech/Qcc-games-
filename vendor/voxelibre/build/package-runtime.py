#!/usr/bin/env python3
"""Normalize a completed pinned build and split it into verified small Git parts."""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('build_directory', type=pathlib.Path)
parser.add_argument('--vendor-directory', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
args = parser.parse_args()
build = args.build_directory.resolve()
vendor = args.vendor_directory.resolve()
releases = [path for path in (build / 'www').iterdir() if path.is_dir() and (path / 'luanti.wasm').is_file()]
if len(releases) != 1:
    raise SystemExit('Expected exactly one completed native runtime under www/.')
release = releases[0]

names = ['luanti.js', 'luanti.wasm', 'launcher.js', 'worker.js', 'lockworker.js',
         'packs/base.pack', 'packs/certs.pack', 'xterm/xterm.js', 'xterm/xterm.css',
         'xterm/addon-fit.js', 'xterm/LICENSE.xterm', 'xterm/LICENSE.addon-fit']
digest = lambda data: hashlib.sha256(data).hexdigest()
base_digest = digest((release / 'packs/base.pack').read_bytes())
game_source_digest = '6215d4da27900874959ff586fb266091be3d4161b9d4f5d27ce0d0cdc49f1af2'
pack_id = 'qcc-voxelibre-0.92.4-' + base_digest[:12] + game_source_digest[:12]
payload = {}
for name in sorted(names):
    if name in ('launcher.js', 'worker.js', 'lockworker.js'):
        content = (build / 'static' / name).read_text().replace('%__RELEASE_UUID__%', 'runtime').replace('%__QCC_PACK_BUILD_ID__%', pack_id).encode()
        if b'%__' in content:
            raise SystemExit('Unsubstituted launcher marker: ' + name)
    else:
        content = (release / name).read_bytes()
    payload['runtime/' + name] = content

tar_bytes = io.BytesIO()
with tarfile.open(fileobj=tar_bytes, mode='w', format=tarfile.PAX_FORMAT) as archive:
    for name, data in sorted(payload.items()):
        info = tarfile.TarInfo(name)
        info.size, info.mtime, info.mode = len(data), 0, 0o644
        archive.addfile(info, io.BytesIO(data))
archive = gzip.compress(tar_bytes.getvalue(), compresslevel=9, mtime=0)
parts_directory = vendor / 'runtime-parts'
parts_directory.mkdir(parents=True, exist_ok=True)
parts = []
for index, offset in enumerate(range(0, len(archive), 300000)):
    data = archive[offset:offset + 300000]
    name = f'runtime-parts/runtime.tar.gz.part-{index:03d}'
    (vendor / name).write_bytes(data)
    parts.append({'file': name, 'bytes': len(data), 'sha256': digest(data)})
expected_parts = {pathlib.PurePosixPath(part['file']).name for part in parts}
for stale in parts_directory.glob('runtime.tar.gz.part-*'):
    if stale.name not in expected_parts:
        stale.unlink()
manifest = {
    'format': 1,
    'engine': 'Luanti',
    'game': 'VoxeLibre 0.92.4',
    'packBuildId': pack_id,
    'buildPins': 'build/pins.json',
    'buildInputs': {
        'pinsSha256': digest((vendor / 'build/pins.json').read_bytes()),
        'patches': [{'file': path.relative_to(vendor).as_posix(), 'sha256': digest(path.read_bytes())}
                    for path in sorted((vendor / 'build/patches').glob('*.patch'))],
    },
    'archive': {'name': 'runtime.tar.gz', 'bytes': len(archive), 'sha256': digest(archive), 'parts': parts},
    'files': [{'path': name, 'bytes': len(data), 'sha256': digest(data)} for name, data in sorted(payload.items())],
}
(vendor / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Packaged {len(payload)} runtime files: {len(archive):,} bytes, {len(parts)} parts, SHA256 {digest(archive)}')
