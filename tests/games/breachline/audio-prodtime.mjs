// Time to first sound in a production build, with the CPU throttled. Usage (with `vite build` output served by
// `vite preview` at <url>): node tests/games/breachline/audio-prodtime.mjs <url> [throttle=6]
// Prints the engine's own measures: worker up, first buffer taken, whole bank, each in ms after the context starts.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext(); await ctx.addInitScript(() => { localStorage.setItem('pocket-arcade:v1:settings', JSON.stringify({ sound: true })); localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${process.argv[2]}/?festive=off#/game/breachline`);
await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 60000 }); await page.waitForTimeout(3000);
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.argv[3] || 6 });
await page.getByRole('button', { name: 'Play', exact: true }).click();
await page.waitForTimeout(12000);
console.log(JSON.stringify(await page.evaluate(() => performance.getEntriesByType('measure').filter(m => m.name.startsWith('breachline-audio')).map(m => [m.name, Math.round(m.duration)]))), errs.slice(0, 3));
await b.close();
