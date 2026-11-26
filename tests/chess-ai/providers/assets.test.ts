import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve('public/chess-engines');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('locally shipped chess engine assets', () => {
  it('fits the Cloudflare Pages per-file upload limit', () => {
    for (const path of files(root)) {
      expect(statSync(path).size, relative(root, path)).toBeLessThanOrEqual(25 * 1024 * 1024);
    }
  });

  it('ships the exact pinned Stockfish runtime, network and corresponding source', () => {
    const dir = resolve(root, 'stockfish');
    const checksums = readFileSync(resolve(dir, 'SHA256SUMS'), 'utf8').trim().split('\n');
    const checked = new Set<string>();
    for (const line of checksums) {
      const match = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line);
      expect(match, line).not.toBeNull();
      const [, hash, name] = match!;
      expect(name).not.toContain('..');
      const bytes = readFileSync(resolve(dir, name));
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(hash);
      checked.add(name);
    }
    for (const name of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm',
      'nn-61e7af4bb97d.nnue', 'stockfish.js-v19.0.1-source.tar.gz']) {
      expect(checked.has(name), name).toBe(true);
    }
    expect(readFileSync(resolve(dir, 'stockfish-19-lite-single.wasm')).subarray(0, 4))
      .toEqual(Buffer.from([0, 97, 115, 109]));
  });
});
