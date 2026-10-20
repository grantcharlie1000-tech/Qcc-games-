#!/usr/bin/env python3
"""Prepare the runtime's complete source download, without installing a compiler."""
import argparse
import concurrent.futures
import errno
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
EXCLUDED_SDK_DIRS = {'test', 'docs', 'media', 'site'}
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
        descriptor, name = tempfile.mkstemp(prefix=path.name + '.download-', dir=cache)
        os.close(descriptor)
        temporary = pathlib.Path(name)
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


def extract_source(archive_path, destination, *, excluded=(), zip_links_as_files=False):
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
                    if zip_links_as_files:
                        # Emscripten uses shutil.unpack_archive for its ports.
                        # Its ZIP extractor stores link payloads as regular files.
                        with archive.open(member) as data:
                            add(member.filename, stat.S_IFREG | (mode & 0o777), data)
                    else:
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
    run(['patch', '--batch', '--forward', '--no-backup-if-mismatch', '-p1', '-i', str(patch)], directory)


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
                       excluded=EXCLUDED_SDK_DIRS if item['name'] == 'emscripten' else (),
                       zip_links_as_files=item['name'].startswith('port-'))
    native = tree / 'luanti-wasm'
    sdk = native / 'emsdk/upstream/emscripten'
    # The SDK's release packaging replaces the Git version marker and adds the
    # revision file; reproduce those two recorded, compiler-visible inputs.
    pins = json.loads((RECIPE_DIR / 'pins.json').read_text())
    (sdk / 'emscripten-version.txt').write_text('"' + pins['emsdk']['sdk_version'] + '"\n')
    (sdk / 'emscripten-revision.txt').write_text(pins['emsdk']['emscripten_revision'] + '\n')
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


def recipe_fingerprint():
    paths = [(path, 'qcc-build/' + path.relative_to(RECIPE_DIR).as_posix())
             for path in source_files(RECIPE_DIR)
             if '__pycache__' not in path.parts and path.suffix != '.pyc'
             and path.name != 'runtime-source-manifest.json']
    licenses = PROJECT_DIR / 'public/voxelibre/licenses'
    paths += [(path, 'licenses/' + path.relative_to(licenses).as_posix())
              for path in source_files(licenses)]
    data = [{'path': name, 'sha256': digest_file(path)} for path, name in sorted(paths, key=lambda item: item[1])]
    return hashlib.sha256(json.dumps(data, separators=(',', ':')).encode()).hexdigest()


def existing_archive_is_valid(output, fingerprint):
    archive, metadata_path = output / 'runtime-source.tar.gz', output / 'runtime-source.json'
    if not archive.exists() or not metadata_path.exists():
        return False
    metadata = json.loads(metadata_path.read_text())
    return (metadata.get('recipeFingerprint') == fingerprint
            and metadata.get('bytes') == archive.stat().st_size
            and metadata.get('sha256') == digest_file(archive))


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
            # Match the pinned SDK's tools/install.py release exclusions. These
            # additional upstream maintenance scripts remain in the source bundle.
            if expected_root.name == 'emscripten':
                if any(part.startswith('.') for part in relative.parts):
                    continue
                if str(relative) in ('Makefile', 'bootstrap.py', 'tools/install.py') or relative.parts[:2] == ('tools', 'maint'):
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


def verify_archive(path, tree, root_name):
    expected = {root_name + '/' + source.relative_to(tree).as_posix(): file_entry(source, tree)
                for source in source_files(tree)}
    seen = set()
    with gzip.open(path, 'rb') as decoded:
        with tarfile.open(fileobj=decoded, mode='r|') as archive:
            for member in archive:
                item = expected.get(member.name)
                if item is None or member.name in seen:
                    raise ValueError('Unexpected or duplicate source archive member: ' + member.name)
                seen.add(member.name)
                if 'link' in item:
                    if not member.issym() or member.linkname != item['link']:
                        raise ValueError('Source archive link differs: ' + member.name)
                else:
                    if not member.isfile() or member.size != item['bytes']:
                        raise ValueError('Source archive file size differs: ' + member.name)
                    digest = hashlib.sha256()
                    with archive.extractfile(member) as data:
                        for chunk in iter(lambda: data.read(1024 * 1024), b''):
                            digest.update(chunk)
                    if digest.hexdigest() != item['sha256']:
                        raise ValueError('Source archive file checksum differs: ' + member.name)
        # Read the gzip footer as well as tar's end records, checking its CRC.
        while decoded.read(1024 * 1024):
            pass
    if seen != expected.keys():
        raise ValueError('Source archive is missing files')


def publish_file(source, target):
    try:
        os.replace(source, target)
    except OSError as error:
        if error.errno != errno.EXDEV:
            raise
        descriptor, name = tempfile.mkstemp(prefix='.' + target.name + '.prepare-', dir=target.parent)
        os.close(descriptor)
        copy = pathlib.Path(name)
        try:
            shutil.copyfile(source, copy)
            if digest_file(source) != digest_file(copy):
                raise ValueError('Source output copy failed checksum verification')
            os.replace(copy, target)
        finally:
            copy.unlink(missing_ok=True)


def create_archive(tree, target, root_name):
    # Keep large intermediate files outside the site's public asset directory.
    descriptor, name = tempfile.mkstemp(prefix=target.name + '.prepare-', dir=tree.parent)
    os.close(descriptor)
    temporary = pathlib.Path(name)
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
        verify_archive(temporary, tree, root_name)
        publish_file(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    global RECIPE_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-directory', type=pathlib.Path, default=PROJECT_DIR / 'public/voxelibre/sources')
    parser.add_argument('--cache-directory', type=pathlib.Path)
    parser.add_argument('--verify-build-tree', type=pathlib.Path)
    parser.add_argument('--keep-tree', type=pathlib.Path)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='qcc-runtime-sources-') as scratch:
        temporary = pathlib.Path(scratch)
        # A concurrent edit to the repository must not mix two source recipes.
        shutil.copytree(RECIPE_DIR, temporary / 'recipe', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        RECIPE_DIR = temporary / 'recipe'
        recipe = json.loads((RECIPE_DIR / 'source-recipe.json').read_text())
        certificate = {'name': 'public CA certificate bundle', **recipe['certificateBundle']}
        verify_input(RECIPE_DIR / certificate['file'], certificate)
        fingerprint = recipe_fingerprint()
        if not args.verify_build_tree and not args.keep_tree and existing_archive_is_valid(args.output_directory, fingerprint):
            print('Verified existing runtime source archive and unchanged source recipe.')
            return
        cache = args.cache_directory or temporary / 'downloads'
        cache.mkdir(parents=True, exist_ok=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda item: fetch(item, cache), recipe['inputs']))
        tree = temporary / 'source'
        reconstruct(tree, recipe, cache)
        verified_count = verify_build_tree(tree, args.verify_build_tree.resolve(), recipe) if args.verify_build_tree else None
        shutil.copytree(RECIPE_DIR, tree / 'qcc-build', ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'runtime-source-manifest.json'))
        shutil.copytree(PROJECT_DIR / 'public/voxelibre/licenses', tree / 'licenses')
        instructions = RECIPE_DIR / 'source-bundle-README.md'
        if instructions.exists():
            shutil.copyfile(instructions, tree / 'README.md')
        files = [file_entry(path, tree) for path in source_files(tree)]
        manifest = {'format': 1, 'files': files, 'sourceInputs': recipe['inputs'],
                    'certificateBundle': recipe['certificateBundle'],
                    'excludedSdkDirectories': sorted(EXCLUDED_SDK_DIRS)}
        (tree / 'SOURCE-MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
        archive = args.output_directory / 'runtime-source.tar.gz'
        create_archive(tree, archive, recipe['archiveRoot'])
        metadata = {'format': 1, 'file': archive.name, 'bytes': archive.stat().st_size,
                    'sha256': digest_file(archive), 'files': len(files),
                    'manifestSha256': digest_file(tree / 'SOURCE-MANIFEST.json'),
                    'recipeFingerprint': fingerprint}
        descriptor, name = tempfile.mkstemp(prefix='runtime-source.json.prepare-', dir=temporary)
        with os.fdopen(descriptor, 'w') as output:
            output.write(json.dumps(metadata, indent=2) + '\n')
        publish_file(pathlib.Path(name), args.output_directory / 'runtime-source.json')
        if args.keep_tree:
            shutil.copytree(tree, args.keep_tree, symlinks=True)
        print(f"Prepared runtime source: {metadata['bytes']:,} bytes, {len(files):,} files, SHA256 {metadata['sha256']}")
        if verified_count is not None:
            print(f'Compared {verified_count:,} files with the actual native build tree: all match.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        raise SystemExit('Runtime source preparation failed: ' + str(error)) from error
