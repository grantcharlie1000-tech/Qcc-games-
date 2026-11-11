import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The site's Content-Security-Policy allows 'wasm-unsafe-eval' but not 'unsafe-eval' (vite.config.ts, public/_headers,
// netlify.toml). The Basis transcoder worker must therefore never evaluate strings as code.
describe('Breachline texture transcoder under the site CSP', () => {
  const worker = 'public/game-art/breachline/basis/ktx2-worker.js';
  it('ships a same-origin worker and its WebAssembly', () => {
    expect(existsSync(worker)).toBe(true);
    expect(existsSync('public/game-art/breachline/basis/basis_transcoder.wasm')).toBe(true);
  });
  it('builds no functions from strings', () => {
    const js = readFileSync(worker, 'utf8');
    expect(js).not.toMatch(/newFunc\(Function/);
    expect(js).not.toMatch(/new Function\s*\(/);
    expect(js).not.toMatch(/\beval\s*\(/);
  });
  it('the policy still forbids string evaluation', () => {
    const csp = readFileSync('public/_headers', 'utf8');
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
});
