#!/usr/bin/env python3
"""Prepare the runtime's complete source download, without installing a compiler."""
import argparse
import concurrent.futures
import gzip
import hashlib
import io
import json
import os
import pathlib
import posixpath
import shutil
import stat
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile

RECIPE_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_DIR = RECIPE_DIR.parents[2]
EXCLUDED_SDK_DIRS = {'test', 'docs', 'media'}
SDK_PATCHES = ['emsdk_dirperms', 'emsdk_openat', 'emsdk_libegl', 'emsdk_jspi',
               'emsdk_wasmfs_opfs', 'emsdk_wasmfs_opfs_subdir']


def digest_file(path, algorithm='sha256'):
    digest = hashlib.new(algorithm)
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(item, cache):
    path = cache / item['archive']
    if not path.exists():
        temporary = path.with_name(path.name + '.download')
        request = urllib.request.Request(item['url'], headers={'User-Agent': 'QCC-source-packager/1'})
        try:
            with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as output:
                count = 0
                while block := response.read(1024 * 1024):
                    count += len(block)
                    if count > item['bytes']:
                        raise ValueError('Download exceeds pinned size: ' + item['name'])
                    output.write(block)
            verify_input(temporary, item)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    verify_input(path, item)
    return path


def verify_input(path, item):
    if path.stat().st_size != item['bytes'] or digest_file(path) != item['sha256']:
        raise ValueError('Source archive does not match its pin: ' + item['name'])
    if item.get('sha512') and digest_file(path, 'sha512') != item['sha512']:
        raise ValueError('Source archive does not match upstream SHA512: ' + item['name'])


def relative_member(name):
    # Every input has exactly one enclosing directory, removed on extraction.
    if name.startswith('/') or '\\' in name or '\x00' in name:
        raise ValueError('Unsafe archive path: ' + repr(name))
    parts = name.rstrip('/').split('/')
    if any(part in ('', '.', '..') for part in parts):
        raise ValueError('Unsafe archive path: ' + repr(name))
    return parts[0], pathlib.PurePosixPath(*parts[1:]) if len(parts) > 1 else None


def extract_source(archive_path, destination, *, excluded=()):
    """Extract verified source archives without permitting writes outside the root."""
    destination.mkdir(parents=True, exist_ok=True)
    seen, roots, links = set(), set(), []
    total_bytes = 0

    def add(name, mode, data, link=None):
        nonlocal total_bytes
        root, relative = relative_member(name)
        roots.add(root)
        if len(roots) != 1:
            raise ValueError('Expected one archive root: ' + str(archive_path))
        if relative is None or relative.parts[0] in excluded:
            return
        key = str(relative)
        if key in seen:
            raise ValueError('Duplicate archive path: ' + key)
        seen.add(key)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if link is not None:
            resolved = posixpath.normpath(posixpath.join(str(relative.parent), link))
            if link.startswith('/') or '\\' in link or resolved == '..' or resolved.startswith('../'):
                raise ValueError('Unsafe source symbolic link: ' + key)
            links.append((target, link))
        elif stat.S_ISDIR(mode):
            target.mkdir(exist_ok=True)
        else:
            with target.open('wb') as output:
                while block := data.read(1024 * 1024):
                    total_bytes += len(block)
                    if total_bytes > 1024 * 1024 * 1024:
                        raise ValueError('Source archive exceeds extraction size limit')
                    output.write(block)
            target.chmod(0o755 if mode & 0o111 else 0o644)

    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.infolist():
                mode = member.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if member.is_dir():
                    add(member.filename, stat.S_IFDIR | mode, None)
                elif kind == stat.S_IFLNK:
                    add(member.filename, mode, None, archive.read(member).decode())
                elif kind in (0, stat.S_IFREG):
                    with archive.open(member) as data:
                        add(member.filename, stat.S_IFREG | mode, data)
                else:
                    raise ValueError('Unsupported ZIP source member: ' + member.filename)
    else:
        with tarfile.open(archive_path, 'r:*') as archive:
            for member in archive:
                if member.isdir():
                    add(member.name, stat.S_IFDIR | member.mode, None)
                elif member.issym():
                    add(member.name, stat.S_IFLNK | member.mode, None, member.linkname)
                elif member.isfile() or member.islnk():
                    with archive.extractfile(member) as data:
                        add(member.name, stat.S_IFREG | member.mode, data)
                else:
                    raise ValueError('Unsupported tar source member: ' + member.name)
    # Symlinks come last, so no regular member can write through one.
    for target, link in links:
        if target.exists() or target.is_symlink():
            raise ValueError('Source link collides with another member: ' + str(target))
        target.symlink_to(link)


def run(args, cwd):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=120)
    if result.returncode:
        raise RuntimeError('Source preparation command failed: ' + ' '.join(map(str, args))
                           + '\n' + result.stdout[-4000:] + result.stderr[-4000:])


def apply_patch(directory, patch):
    run(['patch', '--batch', '--forward', '-p1', '-i', str(patch)], directory)


def source_files(directory):
    for path in sorted(directory.rglob('*')):
        if path.is_symlink() or path.is_file():
            yield path


def file_entry(path, root):
    name = path.relative_to(root).as_posix()
    if path.is_symlink():
        return {'path': name, 'link': os.readlink(path)}
    return {'path': name, 'bytes': path.stat().st_size, 'sha256': digest_file(path)}


def reconstruct(tree, recipe, cache):
    for item in recipe['inputs']:
        extract_source(cache / item['archive'], tree / item['destination'],
                       excluded=EXCLUDED_SDK_DIRS if item['name'] == 'emscripten' else ())
    native = tree / 'luanti-wasm'
    sdk = native / 'emsdk/upstream/emscripten'
    apply_patch(native, RECIPE_DIR / 'patches/luanti-wasm-qcc.patch')
    apply_patch(native / 'sources/luanti', RECIPE_DIR / 'patches/luanti-singleplayer-menu.patch')
    apply_patch(native / 'sources/webshims', RECIPE_DIR / 'patches/webshims-local-only.patch')
    for name in SDK_PATCHES:
        apply_patch(native / 'emsdk', native / (name + '.patch'))
    # These four header substitutions are part of Emscripten's pinned port recipes.
    substitutions = [
        ('zlib', 'zconf.h', 'zconf.h'),
        ('libjpeg', 'jconfig.h', 'jconfig.h'),
        ('libpng', 'pnglibconf.h', 'pnglibconf.h'),
        ('ogg', 'config_types.h', 'include/ogg/config_types.h'),
    ]
    ports = {item['name'].removeprefix('port-'): tree / item['destination']
             for item in recipe['inputs'] if item['name'].startswith('port-')}
    for name, configuration, destination in substitutions:
        shutil.copyfile(sdk / 'tools/ports' / name / configuration, ports[name] / destination)
    # Original dependency archives are included by luanti-wasm. Also stage the
    # preferred source files after upstream's socket wrapping and OpenSSL patch.
    for name in ('openssl', 'curl', 'libarchive', 'libzip'):
        archives = [p for p in (native / 'sources').glob(name + '-*') if p.is_file()]
        if len(archives) != 1:
            raise ValueError('Missing or ambiguous dependency source: ' + name)
        destination = tree / 'dependencies' / name
        extract_source(archives[0], destination)
        if name in ('openssl', 'curl'):
            run(['python3', str(native / 'sources/webshims/src/emsocket/wrap.py'), str(destination)], tree)
        if name == 'openssl':
            apply_patch(destination, native / 'openssl.patch')
    # Keep all source, build logic and notices. SDK tests/documentation/media are
    # omitted: they do not contribute code or assets to the shipped runtime.
    for backup in tree.rglob('*.orig'):
        backup.unlink()


def verify_build_tree(tree, compiled, recipe):
    comparisons = [
        (tree / 'luanti-wasm', compiled, {'sources', 'emsdk'}),
        (tree / 'luanti-wasm/sources/luanti', compiled / 'sources/luanti', set()),
        (tree / 'luanti-wasm/sources/webshims', compiled / 'sources/webshims', set()),
        (tree / 'luanti-wasm/sources/zstd', compiled / 'sources/zstd', set()),
        (tree / 'luanti-wasm/emsdk/upstream/emscripten', compiled / 'emsdk/upstream/emscripten', set()),
    ]
    comparisons += [(tree / 'dependencies' / name, compiled / 'build' / name, set())
                    for name in ('openssl', 'curl', 'libarchive', 'libzip')]
    comparisons += [(tree / item['destination'], compiled / 'emsdk/upstream/emscripten/cache/ports'
                     / item['name'].removeprefix('port-') / item['root'], set())
                    for item in recipe['inputs'] if item['name'].startswith('port-')]
    count, failures = 0, []
    for expected_root, actual_root, excluded in comparisons:
        for expected in source_files(expected_root):
            relative = expected.relative_to(expected_root)
            if relative.parts[0] in excluded:
                continue
            # Release SDKs omit GitHub-only workflow/editor metadata.
            if expected_root.name == 'emscripten' and relative.parts[0].startswith('.'):
                continue
            actual = actual_root / relative
            if expected.is_symlink():
                equal = actual.is_symlink() and os.readlink(actual) == os.readlink(expected)
            else:
                equal = actual.is_file() and digest_file(actual) == digest_file(expected)
            if not equal:
                failures.append(str(actual))
            count += 1
    if failures:
        raise ValueError(f'{len(failures)} of {count} source files differ from the build tree:\n'
                         + '\n'.join(failures[:60]))
    return count


def create_archive(tree, target, root_name):
    temporary = target.with_name(target.name + '.prepare')
    try:
        with temporary.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=6) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.PAX_FORMAT) as archive:
                for path in source_files(tree):
                    info = tarfile.TarInfo(root_name + '/' + path.relative_to(tree).as_posix())
                    info.mtime, info.uid, info.gid, info.uname, info.gname = 0, 0, 0, '', ''
                    if path.is_symlink():
                        info.type, info.linkname, info.mode = tarfile.SYMTYPE, os.readlink(path), 0o777
                        archive.addfile(info)
                    else:
                        info.size = path.stat().st_size
                        info.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                        with path.open('rb') as data:
                            archive.addfile(info, data)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-directory', type=pathlib.Path, default=PROJECT_DIR / 'public/voxelibre/sources')
    parser.add_argument('--cache-directory', type=pathlib.Path)
    parser.add_argument('--verify-build-tree', type=pathlib.Path)
    parser.add_argument('--keep-tree', type=pathlib.Path)
    args = parser.parse_args()
    recipe = json.loads((RECIPE_DIR / 'source-recipe.json').read_text())
    args.output_directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='qcc-runtime-sources-') as scratch:
        temporary = pathlib.Path(scratch)
        cache = args.cache_directory or temporary / 'downloads'
        cache.mkdir(parents=True, exist_ok=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda item: fetch(item, cache), recipe['inputs']))
        tree = temporary / 'source'
        reconstruct(tree, recipe, cache)
        verified_count = verify_build_tree(tree, args.verify_build_tree.resolve(), recipe) if args.verify_build_tree else None
        shutil.copytree(RECIPE_DIR, tree / 'qcc-build', ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'runtime-source-manifest.json'))
        instructions = RECIPE_DIR / 'source-bundle-README.md'
        if instructions.exists():
            shutil.copyfile(instructions, tree / 'README.md')
        files = [file_entry(path, tree) for path in source_files(tree)]
        manifest = {'format': 1, 'files': files, 'sourceInputs': recipe['inputs'],
                    'excludedSdkDirectories': sorted(EXCLUDED_SDK_DIRS)}
        (tree / 'SOURCE-MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
        archive = args.output_directory / 'runtime-source.tar.gz'
        create_archive(tree, archive, recipe['archiveRoot'])
        metadata = {'format': 1, 'file': archive.name, 'bytes': archive.stat().st_size,
                    'sha256': digest_file(archive), 'files': len(files),
                    'manifestSha256': digest_file(tree / 'SOURCE-MANIFEST.json')}
        (args.output_directory / 'runtime-source.json').write_text(json.dumps(metadata, indent=2) + '\n')
        if args.keep_tree:
            shutil.copytree(tree, args.keep_tree)
        print(f"Prepared runtime source: {metadata['bytes']:,} bytes, {len(files):,} files, SHA256 {metadata['sha256']}")
        if verified_count is not None:
            print(f'Compared {verified_count:,} files with the actual native build tree: all match.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        raise SystemExit('Runtime source preparation failed: ' + str(error)) from error
