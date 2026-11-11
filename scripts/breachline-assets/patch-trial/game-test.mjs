// Job 3.6 check in the real game: serves scene.ts with the proposed one-line switch injected on the fly (the file on
// disk is not touched), starts a seeded match with bots, and photographs a fighter of each squad at 2 and 8 m with the
// stock fighters and with ?fighters=patch. Usage: node game-test.mjs <port> <outDir>
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const [port, outDir] = process.argv.slice(2);
const SWITCH = "(new URLSearchParams(location.search).get('fighters') === 'patch' ? __pf.createPatchFighters(scene, heroLighting) : createFighters(scene, heroLighting))";
async function run(patch) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log(`[${patch ? 'patch' : 'stock'}] ${m.type()} ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`)); page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('[nav]', f.url()); });
  let injected = false;
  await page.route(/\/src\/games\/breachline\/scene\.ts(\?.*)?$/, async route => {
    const resp = await route.fetch(); let body = await resp.text();
    if (body.includes('createFighters(scene, heroLighting)')) { body = 'import * as __pf from "/src/games/breachline/render/patchfighters/index.ts";\n' + body.replace('createFighters(scene, heroLighting)', SWITCH); injected = true; }
    await route.fulfill({ response: resp, body });
  });
  await page.goto(`http://127.0.0.1:${port}/?festive=off&arttier=high${patch ? '&fighters=patch' : ''}#/game/breachline`);
  await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 120000 });
  await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 3, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); });
  await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('art did not reach env'));
  await page.waitForTimeout(3000);
  await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt { visibility: hidden !important; }' });
  const st = await page.evaluate(() => window.__breachlineTest.state());
  const home = st.players[st.self];
  const me = st.players[st.self];
  const shots = [];
  for (const sq of [0, 1]) {
    const target = st.players.find(p => p.squad === sq && p.id !== st.self && p.alive); if (!target) continue;
    for (const d of [2, 8]) for (const ang of [0, 1, 2, 3]) {
      // Stand d metres from the target in each of four directions, facing it (walls block some; pick by eye).
      const r = await page.evaluate(([tx, tz, d, ang]) => {
        const h = window.__breachlineTest, a = ang * Math.PI / 2 + 0.3;
        const x = tx + Math.sin(a) * d, z = tz + Math.cos(a) * d, yaw = Math.atan2(-(tx - x), -(tz - z));
        h.place(x, z, yaw, -0.05); h.advance(0.05); h.draw(); h.draw(); return [x, z, yaw];
      }, [target.x, target.z, d, ang]);
      await page.waitForTimeout(800);
      const buf = await page.locator('canvas').first().screenshot();
      const stats = await page.evaluate(() => window.__breachlineTest.stats());
      shots.push({ sq, d, buf, stats });
      await writeFile(path.join(outDir, `game-${patch ? 'patch' : 'stock'}-sq${sq}-${d}m-${ang}.png`), buf);
      console.log(patch ? 'patch' : 'stock', 'squad', sq, d + 'm', ang, JSON.stringify({ at: r.map(v => +v.toFixed(2)), calls: stats.calls, tris: stats.triangles ?? stats.tris }));
    }
  }
  console.log('injected', injected, 'me', me && me.squad);
  await browser.close();
}
if (process.env.ONLY !== 'patch') await run(false);
if (process.env.ONLY !== 'stock') await run(true);
