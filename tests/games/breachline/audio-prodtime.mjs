// Checks Breachline's sound on a production build: turns sound on, presses Play with the CPU throttled, and prints
// the sound requests (worker, sample pack), the engine's timings (worker up, first buffer, whole bank, pack decoded,
// in ms after the context starts) and any page errors or security-policy violations.
// Usage (with `vite build` output served by `vite preview` at <url>): node tests/games/breachline/audio-prodtime.mjs <url> [throttle=6]
import { chromium } from 'playwright';
const [base, rate = '6'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext();
await ctx.addInitScript(() => {
  localStorage.setItem('pocket-arcade:v1:settings', JSON.stringify({ sound: true })); localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
  document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
});
const page = await ctx.newPage(), errs = [], reqs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('response', r => { if (/audio\/breachline|assets\/worker/.test(r.url())) reqs.push(`${r.status()} ${new URL(r.url()).pathname} ${r.headers()['content-type'] ?? ''}`); });
await page.goto(`${base}/?festive=off#/game/breachline`);
await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 90000 }); await page.waitForTimeout(2000);
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rate });
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.waitForTimeout(15000);
console.log(reqs.join('\n'));
console.log(JSON.stringify(await page.evaluate(() => performance.getEntriesByType('measure').filter(m => m.name.startsWith('breachline-audio')).map(m => [m.name, Math.round(m.duration)]))));
console.log('errors', JSON.stringify(errs.slice(0, 5)));
await b.close();
