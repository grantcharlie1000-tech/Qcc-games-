#!/usr/bin/env node
/** Close to the owner's readout view (docs/evidence/breachline/owner, 2026-11-12): the North Yard east of the building,
 * looking west along its north wall with the yard and its fence to the right, the round over and its banner up. Records a few seconds of frames and a
 * CPU profile (for scriptsplit.py), the perf readout's text and a screenshot.
 *   node scripts/breachline-assets/readout.mjs <auto|low|high> <out prefix> [seconds] [extra query]
 * W and H set the window (default 1890 x 1016, the owner's). */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const [quality = 'high', out = '/tmp/claude-0/readout', secs = '6', extra = ''] = process.argv.slice(2);
const url = process.env.URL || 'http://127.0.0.1:4175', W = Number(process.env.W || 1890), H = Number(process.env.H || 1016);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await context.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${url}/?festive=off&perf=1${extra}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 90000 });
await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q, teamSize: 5, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); }, quality);
await page.waitForFunction(() => window.__breachlineTest.stats().ready, undefined, { timeout: 300000, polling: 500 });
// Play the round out to its end (the banner), then stand by the corner.
await page.evaluate(() => { const h = window.__breachlineTest; h.skip(999); for (let i = 0; i < 20 && h.state().phase !== 'end'; i++) h.advance(0.1); h.place(17, -15, 1.95, -0.08); h.advance(0.05); });
const phase = await page.evaluate(() => window.__breachlineTest.state().phase);
await page.waitForTimeout(1500);
const cdp = await context.newCDPSession(page);
await page.evaluate(() => { const f = window.__perfFrames = []; let last = performance.now(); const tick = now => { f.push(now - last); last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await page.waitForTimeout(Number(secs) * 1000);
const { profile } = await cdp.send('Profiler.stop');
const frames = await page.evaluate(() => window.__perfFrames);
const readout = await page.locator('.bl-perf').innerText().catch(() => '');
await page.screenshot({ path: out + '.png' });
writeFileSync(out + '.cpuprofile', JSON.stringify(profile));
writeFileSync(out + '.frames.json', JSON.stringify({ frames }));
const s = [...frames].sort((a, b) => a - b);
console.log(`${quality} ${phase}: ${frames.length} frames, median ${s[s.length >> 1]?.toFixed(1)} ms`);
console.log(readout);
await browser.close();
