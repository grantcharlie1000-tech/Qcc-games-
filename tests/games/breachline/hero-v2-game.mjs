// In-game evidence for the second-build weapons under the real lighting, at 1280×720.
// Usage: QUERY='&heroclay' node tests/games/breachline/hero-v2-game.mjs <baseUrl> <outDir> [job] [kit]
//   job "fp" (default): hip and aimed in the corridor and the Lab. job "reload": four frames of a tactical reload in
//   each place. Writes PNGs; crops are made afterwards (scripts/breachline-assets/hero/evidence.py).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, job = 'fp', kitArg] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => {
  if (window !== window.top) return;
  localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
});
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error' || /Breachline (baked|weapon|hand)/.test(m.text())) console.log(`[page] ${m.text()}`); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${base}/?festive=off&arttier=high${process.env.QUERY ?? ''}#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 1, bots: true }); h.freeze(true); h.advance(0.2); });
await page.locator('.bl-canvas').focus();
await page.keyboard.press(`Digit${Number(kitArg ?? 1)}`);
await page.evaluate(() => { const h = window.__breachlineTest; h.advance(0.1); h.still(); h.skip(30); h.advance(0.3); h.advance(5); });
await page.waitForFunction(() => window.__breachlineTest.stats().ready === true, undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('not ready'));
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '.bl-toast, .bl-prompt { visibility: hidden !important; }' });
const shot = async name => { const f = `${out}/${name}.png`; await page.screenshot({ path: f, timeout: 180000 }); console.log(f); return f; };
const place = (x, z, yaw, pitch) => page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.advance(0.05); h.draw(); h.draw(); }, [x, z, yaw, pitch]);
const hold = (patch, s, once = null) => page.evaluate(([p, s, o]) => window.__breachlineTest.hold(p, s, o), [patch, s, once]);
const PLACES = [['corridor', [13.5, -0.5, 1.5708, -0.04]], ['lab', [-0.6, -4.6, 1.2, -0.12]]];
for (const [name, at] of PLACES) {
  await place(...at);
  if (job === 'fp') {
    await hold({}, 0.6); await shot(`${name}-hip`);
    await hold({ ads: true }, Number(process.env.ADS_S ?? 1.4)); await shot(`${name}-ads`);
    if (process.env.DEBUG_VM) console.log(await page.evaluate(() => { const v = window.__heroVM; let g = null; v.scene.traverse(o => { if (o.isSkinnedMesh && o.parent.children.length > 8 && !g) g = o; }); const r = g.parent; return JSON.stringify({ p: r.position.toArray().map(x => +x.toFixed(4)), r: [r.rotation.x, r.rotation.y, r.rotation.z].map(x => +x.toFixed(4)), fov: v.camera.fov, cam: v.camera.position.toArray() }); }));
    await hold({}, 0.5);
  } else if (job === 'reload') {
    await hold({ fire: true }, 0.25); await hold({}, 0.6);
    await hold({}, 1 / 60, { reload: true });
    for (let i = 0; i < 4; i++) { await hold({}, i === 0 ? 0.3 : 0.55); await shot(`${name}-reload-${i}`); }
    await hold({}, 2);
  }
}
await browser.close();
