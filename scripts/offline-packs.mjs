// Builds dist/offline/packs.json and stamps dist/sw.js for offline play.
//
// packs.json lists two kinds of files, by path relative to the site root:
//  - shell: what the library needs to open with no network (HTML, entry script and styles, fonts, icons, covers).
//  - games[id]: every other file a game can load: its chunks and their imports (static and dynamic),
//    styles, workers and the public files it fetches at run time.
// Every file has its size and a SHA-256, so a download can be verified and an update only fetches changes.
// The version is a hash of all of it, so sw.js changes (and the browser updates it) only when content does.
import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import {existsSync, readdirSync} from 'node:fs';
import {join, posix} from 'node:path';

// Public files each game fetches at run time, beyond its own game-art folder.
export const PUBLIC_EXTRAS = {
  breachline: ['audio/breachline/'],
  chess: ['chess-engines/beginner/', 'chess-engines/stockfish/', 'chess-engines/maia/'],
};
// Source archives, licences and notes ship for provenance only; a game never loads them.
const NOT_LOADED = /\.(?:tar\.gz|md|txt)$|(?:^|\/)(?:LICEN[CS]E[^/]*|COPYING|AUTHORS|SHA256SUMS|SOURCE-SHA256SUMS|ONNXRUNTIME-[^/]*)$/;
// Shell files outside the bundle. Covers are added per game.
const SHELL_PUBLIC = ['icon.svg', 'app-icon.svg', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'offline/cover.svg', 'movies/catalog.json', 'movies/licenses.json'];

const sha = data => createHash('sha256').update(data).digest('hex');
async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) out.push(...await walk(join(dir, entry.name), rel + '/'));
    else out.push(rel);
  }
  return out;
}

/** Files reachable from `start` through the bundle graph, skipping `stop`. */
function closure(start, bundle, names, stop, {dynamic, scan}) {
  const seen = new Set();
  const visit = name => {
    if (seen.has(name) || stop.has(name) || !bundle[name]) return;
    seen.add(name);
    const file = bundle[name];
    const next = [...(file.imports || []), ...(dynamic ? file.dynamicImports || [] : []),
      ...(file.viteMetadata?.importedCss || []), ...(file.viteMetadata?.importedAssets || [])];
    // Workers, wasm and CSS fonts are referenced by file name in the code rather than as imports.
    if (scan || file.type === 'asset') {
      const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : '';
      if (text) for (const other of names) if (other !== name && text.includes(posix.basename(other))) next.push(other);
    }
    for (const dep of next) visit(dep);
  };
  visit(start);
  return seen;
}

export function offlinePacks() {
  let root, outDir, publicDir, packs, gameIds;
  return {
    name: 'offline-packs',
    apply: 'build',
    configResolved(config) {
      root = config.root; outDir = config.build.outDir; publicDir = config.publicDir;
      gameIds = readdirSync(join(root, 'src/games')).filter(id => existsSync(join(root, 'src/games', id, 'index.ts'))).sort();
    },
    async generateBundle(_options, bundle) {
      const names = Object.keys(bundle).filter(name => !name.endsWith('.map') && !name.startsWith('.vite/'));
      const entry = names.find(name => bundle[name].type === 'chunk' && bundle[name].isEntry);
      if (!entry) throw new Error('offline-packs: no entry chunk');
      // The entry's own text names every game chunk (the lazy loaders), so only its imports are followed.
      const shellBundle = closure(entry, bundle, names, new Set(), {dynamic: false, scan: false});
      // Fonts and images used by the shell's CSS.
      for (const name of [...shellBundle]) if (name.endsWith('.css')) for (const dep of closure(name, bundle, names, new Set(), {dynamic: false, scan: true})) shellBundle.add(dep);
      // The offline home screen must be able to load Movies, the watch page and stored
      // episode metadata without fetching a lazy JS module from the network.
      for (const filename of ['view.ts', 'storage.ts', 'account-storage.ts']) {
        const file = join(root, 'src/movies', filename).replaceAll('\\', '/');
        const chunk = names.find(name => bundle[name].type === 'chunk' && bundle[name].moduleIds.includes(file));
        if (!chunk) throw new Error('offline-packs: missing Movies & TV chunk for ' + filename);
        for (const dep of closure(chunk, bundle, names, new Set(), {dynamic: false, scan: false})) shellBundle.add(dep);
      }
      const publicFiles = new Set(await walk(publicDir));
      const games = {};
      for (const id of gameIds) {
        const module = join(root, 'src/games', id, 'index.ts').replaceAll('\\', '/');
        const chunk = names.find(name => bundle[name].type === 'chunk' && bundle[name].moduleIds.includes(module));
        if (!chunk) throw new Error(`offline-packs: no chunk contains ${id}`);
        const own = chunk === entry ? new Set() : closure(chunk, bundle, names, shellBundle, {dynamic: true, scan: true});
        const prefixes = [`game-art/${id}/`, ...(PUBLIC_EXTRAS[id] || [])];
        const extra = [...publicFiles].filter(path => prefixes.some(prefix => path.startsWith(prefix)) && !NOT_LOADED.test(path) && !path.endsWith('/cover.svg'));
        games[id] = [...[...own].sort(), ...extra.sort()];
      }
      const covers = gameIds.map(id => `game-art/${id}/cover.svg`);
      const shellPublic = [...SHELL_PUBLIC, ...covers].filter(path => publicFiles.has(path));
      // './' is the page itself. Sizes and hashes are taken in writeBundle, from the bytes actually written.
      packs = {shell: ['./', ...[...shellBundle].sort(), ...shellPublic], games};
    },
    async writeBundle() {
      const describe = async path => {
        const data = await readFile(join(outDir, path === './' ? 'index.html' : path));
        return {path, size: data.length, sha256: sha(data)};
      };
      const games = {};
      for (const [id, paths] of Object.entries(packs.games)) {
        const files = await Promise.all(paths.map(describe));
        games[id] = {files, size: files.reduce((sum, file) => sum + file.size, 0)};
      }
      const content = {shell: await Promise.all(packs.shell.map(describe)), games};
      const version = sha(JSON.stringify(content)).slice(0, 16);
      const out = {version, ...content};
      await mkdir(join(outDir, 'offline'), {recursive: true});
      await writeFile(join(outDir, 'offline/packs.json'), JSON.stringify(out));
      const worker = await readFile(join(publicDir, 'sw.js'), 'utf8');
      if (!worker.includes('__OFFLINE_VERSION__')) throw new Error('offline-packs: sw.js has no version placeholder');
      await writeFile(join(outDir, 'sw.js'), worker.replace('__OFFLINE_VERSION__', version));
      const mb = bytes => (bytes / 1048576).toFixed(1) + ' MB';
      this.info?.(`offline packs ${version}: shell ${mb(out.shell.reduce((s, f) => s + f.size, 0))}, games ${mb(Object.values(out.games).reduce((s, g) => s + g.size, 0))}`);
    },
  };
}
