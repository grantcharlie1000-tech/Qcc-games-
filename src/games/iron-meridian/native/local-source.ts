import { NativeLoaderError } from './loader-protocol';
import type { CapturedBaseSource } from './loader-protocol';

const relevant = (path: string) => ['common/defines', 'history/states', 'map'].some(root => path === root || path.startsWith(root + '/'));
const fail = (code: string, message: string, path?: string): never => {
  throw new NativeLoaderError({ phase: 'capture', code, message, ...(path === undefined ? {} : { path }) });
};

/** Browser input policy. This does not canonicalize strings inside the recovered VFS. */
export function validateNativeBasePath(path: string, ascii = true): void {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || path.includes(':')
    || path.split('/').some(part => !part || part === '.' || part === '..')
    || (ascii && /[^\x20-\x7e]/.test(path))) {
    fail('invalid-path', 'Unsupported relative content path.', path);
  }
}

function captureIndex(files: readonly { readonly path: string; readonly blob: Blob }[]): Pick<CapturedBaseSource, 'directories' | 'files'> {
  const names = new Set<string>();
  const directories = new Set<string>();
  for (const file of files) {
    validateNativeBasePath(file.path);
    if (!relevant(file.path)) fail('unsupported-path', 'Content is outside the base input subtrees.', file.path);
    if (names.has(file.path)) fail('duplicate-path', 'Duplicate content path.', file.path);
    if (!(file.blob instanceof Blob)) fail('invalid-file', 'Content must be a selected file.', file.path);
    if (!Number.isSafeInteger(file.blob.size) || file.blob.size < 0) fail('invalid-file-size', 'Invalid content size.', file.path);
    names.add(file.path);
    const parts = file.path.split('/');
    for (let length = 1; length < parts.length; length++) directories.add(parts.slice(0, length).join('/'));
  }
  for (const directory of directories) if (names.has(directory)) fail('path-conflict', 'A content path is both file and directory.', directory);
  for (const required of ['common/defines', 'history/states', 'map']) {
    if (!directories.has(required)) fail('missing-input', `Missing ${required}.`, required);
  }
  if (!names.has('map/default.map')) fail('missing-input', 'Missing map/default.map.', 'map/default.map');
  return {
    directories: [...directories].sort(),
    files: files.map(file => ({ path: file.path, blob: file.blob })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  };
}

/** Capture File references only. Byte reads and hashing occur in the worker. */
export function captureNativeBaseDirectory(files: Iterable<File>): CapturedBaseSource {
  let selectedRoot: string | undefined;
  const paths = new Set<string>();
  const selected: { path: string; blob: Blob }[] = [];
  for (const file of files) {
    const relative = file.webkitRelativePath;
    if (!relative) fail('missing-relative-path', 'Select the installation folder.');
    validateNativeBasePath(relative, false);
    const slash = relative.indexOf('/');
    if (slash < 1) fail('missing-relative-path', 'Folder-relative paths are required.', relative);
    const root = relative.slice(0, slash);
    if (selectedRoot !== undefined && selectedRoot !== root) fail('multiple-roots', 'Select one installation folder.');
    selectedRoot = root;
    const path = relative.slice(slash + 1);
    if (paths.has(path)) fail('duplicate-path', 'Duplicate selected path.', path);
    paths.add(path);
    if (relevant(path)) selected.push({ path, blob: file });
  }
  if (selectedRoot === undefined) return fail('empty-selection', 'Select the installation folder.');
  return { scope: 'base-loose-explicit', label: selectedRoot, acquisition: 'directory-input', directoryCoverage: 'inferred-from-files', ...captureIndex(selected) };
}

/** Recheck structured-cloned input at the loader boundary and detach its index arrays. */
export function validateCapturedBaseSource(source: CapturedBaseSource): CapturedBaseSource {
  if (source.scope !== 'base-loose-explicit' || source.acquisition !== 'directory-input'
    || source.directoryCoverage !== 'inferred-from-files' || typeof source.label !== 'string'
    || !Array.isArray(source.files) || !Array.isArray(source.directories)) {
    fail('unsupported-source', 'Unsupported base content source.');
  }
  const index = captureIndex(source.files);
  if (source.directories.length !== index.directories.length
    || [...source.directories].sort().some((directory, indexInList) => directory !== index.directories[indexInList])) {
    fail('invalid-directory-index', 'Directory index differs from the selected files.');
  }
  return { scope: source.scope, label: source.label, acquisition: source.acquisition, directoryCoverage: source.directoryCoverage, ...index };
}
