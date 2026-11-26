import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {existsSync} from 'node:fs';
import { createHash } from 'node:crypto';
const source = new URL('../../../../src/chess-ai/providers/beginner/', import.meta.url);
const target = new URL('./hillclimb-tiers/baseline/', import.meta.url);
if(existsSync(new URL('../baseline-hashes.json',target)))throw Error('Refuse to overwrite the frozen baseline');
await mkdir(new URL('vendor/', target), { recursive: true });
const hashes = {};
for (const file of ['engine.ts','brook.ts','index.ts','manifest.ts','protocol.ts','engine.worker.ts','vendor/chess.js','vendor/chess.d.ts']) {
  const bytes = await readFile(new URL(file, source));
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
  const output = file.endsWith('.ts') ? bytes.toString().replaceAll("from '../../types'", "from '../../../../../../src/chess-ai/types'") : bytes;
  await writeFile(new URL(file, target), output);
}
await writeFile(new URL('../baseline-hashes.json', target), JSON.stringify({ generatedAt:new Date().toISOString(), method:'Snapshot of the accepted 900 work and unchanged lower tiers before the follow-up. Only provider type import paths are relocated.', hashes },null,2)+'\n');
console.log('Frozen eight runtime files. No Git operations.');
