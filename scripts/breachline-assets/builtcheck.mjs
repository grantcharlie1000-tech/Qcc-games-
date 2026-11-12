#!/usr/bin/env node
/** Checks Breachline on the production build served with the real security headers (scripts/serve-built.mjs):
 * security-policy violations, failed requests, console errors, and the art bytes downloaded on a tier.
 *
 *   PORT=4175 node scripts/serve-built.mjs &
 *   node scripts/breachline-assets/builtcheck.mjs --url http://127.0.0.1:4175 --tier high|low
 */
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:4175'), tier = arg('tier', 'high');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => {
  localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
  window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
});
const page = await context.newPage();
const failed = [], errors = [], bytes = { art: 0, js: 0, other: 0 }, kinds = {};
page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url()}`));
page.on('response', async r => {
  const u = r.url();
  if (r.status() >= 400) failed.push(`${r.status()} ${u}`);
  try { const n = (await r.body()).length; if (u.includes('/game-art/breachline/')) { bytes.art += n; const k = u.split('/game-art/breachline/')[1].split('/')[0]; kinds[k] = (kinds[k] ?? 0) + n; } else if (u.endsWith('.js')) bytes.js += n; else bytes.other += n; } catch { /* redirects, opaque */ }
});
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('worker', w => errors.push(`(worker started: ${w.url().split('/').pop()})`));
await page.goto(`${url}/?festive=off&arttier=${tier}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 15000 }).catch(() => errors.push('no __breachlineTest on the built site (index.ts installs it only in dev)'));
await page.waitForTimeout(90000);  // the art streams in from the game page; give it time to finish
const hasHook = await page.evaluate(() => window.__breachlineTest !== undefined);
if (hasHook) {
  await page.evaluate(q => { const h = window.__breachlineTest; h.start({ seed: 7, quality: q, teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); }, tier);
  await page.waitForFunction(t => { const a = window.__breachlineTest.stats().art; return t === 'low' ? a !== 'none' : a === 'env'; }, tier, { timeout: 240000, polling: 500 }).catch(() => errors.push('art never finished loading'));
  await page.evaluate(() => { const h = window.__breachlineTest; h.skip(30); for (let i = 0; i < 20; i++) { h.hold({ fire: true }, 0.05, { fire: true }); h.advance(0.1); h.draw(); } });
  console.log('stats', JSON.stringify(await page.evaluate(() => window.__breachlineTest.stats())));
}
await page.waitForTimeout(2000);
const csp = await page.evaluate(() => window.__csp);
console.log(JSON.stringify({ tier, csp, failed, errors: errors.slice(0, 40), mb: { art: +(bytes.art / 1e6).toFixed(2), js: +(bytes.js / 1e6).toFixed(2), other: +(bytes.other / 1e6).toFixed(2) }, artByKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])) }, null, 1));
await browser.close();
