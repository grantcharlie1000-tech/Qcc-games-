#!/usr/bin/env node
/** Proves the Breachline test hook ships only in test builds: searches the built chunks for `__breachlineTest`.
 *
 *   npm run build && node scripts/breachline-assets/hookcheck.mjs absent
 *   VITE_BREACHLINE_TEST=1 npm run build && node scripts/breachline-assets/hookcheck.mjs present
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const want = process.argv[2];
if (want !== 'absent' && want !== 'present') { console.error('usage: hookcheck.mjs absent|present'); process.exit(2); }
const dir = join('dist', 'assets'), hits = [];
for (const f of await readdir(dir)) if (f.endsWith('.js') && (await readFile(join(dir, f), 'utf8')).includes('__breachlineTest')) hits.push(f);
const ok = want === 'absent' ? hits.length === 0 : hits.length > 0;
console.log(`${ok ? 'PASS' : 'FAIL'}: __breachlineTest ${hits.length ? `in ${hits.join(', ')}` : 'in no built chunk'} (expected ${want})`);
process.exit(ok ? 0 : 1);
