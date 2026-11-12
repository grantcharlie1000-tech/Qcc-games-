#!/usr/bin/env node
/** Allocation profile: the same live match as perfprofile.mjs (firing at walls, or idle with `idle`), sampled by the
 * heap profiler including objects already collected, so the total is what the frame loop allocates. Prints MB/s and
 * the functions that allocate most.
 *   node scripts/breachline-assets/allocprofile.mjs <auto|low|high> <seconds> [fire|idle]   */
import { chromium } from 'playwright';
const quality = process.argv[2] || 'auto', secs = Number(process.argv[3] || 15), url = process.env.URL || 'http://127.0.0.1:4175', idle = process.argv[4] === 'idle';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 90000 });
await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q, teamSize: 5, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); }, quality);
await page.waitForFunction(() => window.__breachlineTest.stats().ready, undefined, { timeout: 240000, polling: 500 });
// Face the nearest wall panel so rounds break it.
await page.evaluate(() => { const h = window.__breachlineTest; const s = h.state(); h.place(-3.5, -0.6, 0, 0.05); h.freeze(false); });
const cdp = await context.newCDPSession(page);
await page.evaluate(() => {
  const f = window.__perfFrames = []; let last = performance.now();
  const tick = now => { f.push(now - last); last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
await page.mouse.move(640, 360);
await page.evaluate(() => window.__breachlineTest.look(0, 0.05));
if (!idle) await page.mouse.down();
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const t0 = Date.now(), f0 = await page.evaluate(() => window.__perfFrames.length);
let k = 0;
while (Date.now() - t0 < secs * 1000) {
  await page.waitForTimeout(4000);
  if (!idle) { await page.mouse.up(); await page.keyboard.press('r'); await page.waitForTimeout(300); await page.evaluate(n => window.__breachlineTest.look(0.25 * Math.sin(n), 0.05), k++); await page.mouse.down(); }
}
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const el = (Date.now() - t0) / 1000, frames = (await page.evaluate(() => window.__perfFrames.length)) - f0;
await page.mouse.up();
const self = new Map(); let total = 0;
const walk = (n, path) => { const name = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; const s = n.selfSize || 0; total += s; if (s) self.set(name, (self.get(name) || 0) + s); for (const c of n.children || []) walk(c, path); };
walk(profile.head, '');
console.log(`${quality} ${idle ? 'idle' : 'firing'}: ${(total / 1048576 / el).toFixed(2)} MB/s, ${(total / 1024 / Math.max(1, frames)).toFixed(1)} KB per frame, ${frames} frames in ${el.toFixed(1)} s`);
for (const [n, s] of [...self].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`  ${(s / 1048576 / el).toFixed(3).padStart(7)} MB/s  ${n}`);
await browser.close();
