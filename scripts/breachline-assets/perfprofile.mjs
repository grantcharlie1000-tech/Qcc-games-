#!/usr/bin/env node
/** Performance profile: a live 5v5 bot match on the built site (VITE_BREACHLINE_TEST=1, minify off for names), the
 * player firing at a wall; a CDP CPU profile and per-frame times.
 *   node scripts/breachline-assets/perfprofile.mjs <auto|low|high> <seconds> <out prefix>
 *   python3 scripts/breachline-assets/perfanalyze.py <out prefix> [top]   */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const quality = process.argv[2] || 'auto', secs = Number(process.argv[3] || 15), url = process.env.URL || 'http://127.0.0.1:4175', out = process.argv[4] || `/tmp/claude-0/perf/${quality}`;
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
for (let k = 0; k < 3; k++) { await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(100); }
await page.evaluate(() => window.__breachlineTest.look(0, 0.05));
await page.mouse.down();
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
const t0 = Date.now();
// Keep firing: release and press again every 1.5 s (reload breaks), turning a little so new walls take rounds.
let shots = 0;
while (Date.now() - t0 < secs * 1000) { await page.waitForTimeout(4000); await page.mouse.up(); await page.keyboard.press('r'); await page.waitForTimeout(300); await page.evaluate(k => window.__breachlineTest.look(0.25 * Math.sin(k), 0.05), shots++); await page.mouse.down(); }
const { profile } = await cdp.send('Profiler.stop');
await page.mouse.up();
const frames = await page.evaluate(() => window.__perfFrames);
const st = await page.evaluate(() => ({ stats: window.__breachlineTest.stats(), state: (s => ({ phase: s.phase, holes: s.holes, mag: s.me?.mag, alive: s.me?.alive }))(window.__breachlineTest.state()) }));
writeFileSync(out + '.cpuprofile', JSON.stringify(profile));
writeFileSync(out + '.frames.json', JSON.stringify({ frames, ...st }));
console.log(quality, 'frames', frames.length, 'state', JSON.stringify(st.state), 'stats', JSON.stringify(st.stats).slice(0, 300));
await browser.close();
