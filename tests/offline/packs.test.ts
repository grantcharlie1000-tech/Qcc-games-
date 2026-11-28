import {expect, test} from 'vitest';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {offlinePacks} from '../../scripts/offline-packs.mjs';

test('writes game packs from normalized Vite module IDs', async () => {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, 'qcc-offline-packs-'));
  try {
    const publicDir = join(root, 'public'), outDir = join(root, 'dist');
    await mkdir(join(root, 'src/games/sample'), {recursive: true});
    await mkdir(publicDir);
    await mkdir(outDir);
    await writeFile(join(root, 'src/games/sample/index.ts'), 'export {}');
    await writeFile(join(publicDir, 'sw.js'), "const VERSION = '__OFFLINE_VERSION__';");
    for (const [name, content] of Object.entries({'index.html': 'page', 'entry.js': 'entry', 'game.js': 'game', 'shared.js': 'shared'})) {
      await writeFile(join(outDir, name), content);
    }
    const plugin = offlinePacks() as unknown as {
      configResolved(config: {root: string; publicDir: string; build: {outDir: string}}): void;
      generateBundle(options: object, bundle: object): Promise<void>;
      writeBundle(): Promise<void>;
    };
    const normalizedRoot = root.replaceAll('\\', '/');
    plugin.configResolved({root: normalizedRoot, publicDir, build: {outDir}});
    await plugin.generateBundle({}, {
      'entry.js': {type: 'chunk', isEntry: true, moduleIds: [normalizedRoot + '/src/main.ts'], imports: [], dynamicImports: ['game.js'], code: 'entry'},
      'game.js': {type: 'chunk', moduleIds: [normalizedRoot + '/src/games/sample/index.ts'], imports: ['shared.js'], code: 'game'},
      'shared.js': {type: 'chunk', moduleIds: [normalizedRoot + '/src/shared.ts'], imports: [], code: 'shared'},
    });
    await plugin.writeBundle();
    const packs = JSON.parse(await readFile(join(outDir, 'offline/packs.json'), 'utf8'));
    expect(packs.games.sample.files.map((file: {path: string}) => file.path)).toEqual(['game.js', 'shared.js']);
    expect(packs.games.sample.size).toBe(10);
    expect(await readFile(join(outDir, 'sw.js'), 'utf8')).toContain(packs.version);
  } finally {
    if (dirname(root) !== parent || !basename(root).startsWith('qcc-offline-packs-')) throw Error('Unexpected fixture path');
    await rm(root, {recursive: true, force: true});
  }
});
