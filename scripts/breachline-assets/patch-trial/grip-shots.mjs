// Renders the hero studio's first-person AR view and two orbit views of the hands (for tuning the grip).
import { chromium } from 'playwright';
import sharp from 'sharp';
const [out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
pg.on('pageerror', e => console.log('pageerror', e.message));
await pg.goto('http://127.0.0.1:5391/src/games/breachline/render/hero/studio/index.html');
await pg.waitForFunction(() => window.__heroReady === true, null, { timeout: 300000 });
const shot = async (w, h, ...args) => { await pg.setViewportSize({ width: w, height: h }); await pg.evaluate(a => window.__breachlineHero.fp(...a), args); return pg.locator('#c').screenshot(); };
const fp = await shot(1280, 720, 'ar', {});
const o1 = await shot(480, 360, 'ar', { orbit: true, yaw: -60, pitch: -10, dist: 0.55, at: [0, -0.07, -0.36] });
const o2 = await shot(480, 360, 'ar', { orbit: true, yaw: 60, pitch: 10, dist: 0.5, at: [0, -0.08, -0.05] });
const parts = [{ input: await sharp(fp).resize(960, 540).toBuffer(), left: 0, top: 0 }, { input: o1, left: 960, top: 0 }, { input: o2, left: 960, top: 360 }];
await sharp({ create: { width: 1440, height: 720, channels: 3, background: '#000' } }).composite(parts).jpeg({ quality: 75 }).toFile(out);
await b.close();
