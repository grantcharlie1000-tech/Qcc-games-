// Job 4 check in the real game: serves scene.ts with the proposed switch injected on the fly, and index.ts with a
// test-only `teleport` added to window.__breachlineTest (files on disk untouched). Seed 7, bots parked, high tier.
// Photographs one fighter of each squad in the south yard and in the Lab (swapping a squad-0 and a squad-1 player
// between the two spots), at 2 and 8 m, with the stock fighters and with ?fighters=patch.
// Usage: node game-test.mjs <port> <outDir> [extra query, e.g. patchgain=0.8]
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const [port, outDir, extra = ''] = process.argv.slice(2);
const SWITCH = "(new URLSearchParams(location.search).get('fighters') === 'patch' ? __pf.createPatchFighters(scene, heroLighting) : createFighters(scene, heroLighting))";
const TELEPORT = "teleport: (id, x, z) => { const p = host.m.players[id]; if (p) { p.x = x; p.z = z; } }, still: () =>";
/** Camera angle (quarter turns + 0.3 rad) with a clear sightline from each spot, from a four-way sweep of seed 7. */
const ANG = { yard: { 2: 2, 8: 1 }, lab: { 2: 1, 8: 1 } };
async function run(patch) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { if (window !== window.top) return; localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off'); localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading'); });
  const page = await context.newPage();
  const tag = patch ? 'patch' : 'stock';
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('KHR_parallel'))) console.log(`[${tag}] ${m.type()} ${m.text().slice(0, 300)}`); });
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.route(/\/src\/games\/breachline\/scene\.ts(\?.*)?$/, async route => {
    const resp = await route.fetch(); let body = await resp.text();
    body = 'import * as __pf from "/src/games/breachline/render/patchfighters/index.ts";\n' + body.replace('createFighters(scene, heroLighting)', SWITCH);
    await route.fulfill({ response: resp, body });
  });
  await page.route(/\/src\/games\/breachline\/index\.ts(\?.*)?$/, async route => {
    const resp = await route.fetch(); const body = (await resp.text()).replace('still: () =>', TELEPORT);
    await route.fulfill({ response: resp, body });
  });
  await page.goto(`http://127.0.0.1:${port}/?festive=off&arttier=high${patch ? '&fighters=patch' : ''}${extra ? '&' + extra : ''}#/game/breachline`);
  await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 120000 });
  await page.waitForFunction(() => window.__breachlineTest.stats().ready !== false, undefined, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 3, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(5); });
  await page.waitForFunction(() => window.__breachlineTest.stats().art === 'env', undefined, { timeout: 180000, polling: 500 }).catch(() => console.log('art did not reach env'));
  await page.waitForTimeout(3000);
  await page.addStyleTag({ content: '.bl-toast, .bl-banner, .bl-prompt { visibility: hidden !important; }' });
  await page.waitForFunction(() => { const s = window.__breachlineTest?.state(); return s && s.players.length > 0; }, undefined, { timeout: 60000 });
  const st = await page.evaluate(() => window.__breachlineTest.state());
  const a = st.players.find(p => p.squad === 0 && p.id !== st.self && p.alive), b = st.players.find(p => p.squad === 1 && p.alive);
  const spots = { yard: [a.x, a.z], lab: [b.x, b.z] };
  for (const swap of [false, true]) {
    if (swap) await page.evaluate(([a, b, ya, yb]) => { const h = window.__breachlineTest; h.teleport(a, yb[0], yb[1]); h.teleport(b, ya[0], ya[1]); h.advance(0.05); }, [a.id, b.id, spots.yard, spots.lab]);
    for (const [who, place] of swap ? [[0, 'lab'], [1, 'yard']] : [[0, 'yard'], [1, 'lab']]) for (const d of [2, 8]) {
      if (process.env.PLACES && !process.env.PLACES.split(',').includes(place)) continue;
      const [tx, tz] = spots[place], ang = ANG[place][d];
      await page.evaluate(([tx, tz, d, ang]) => { const h = window.__breachlineTest, q = ang * Math.PI / 2 + 0.3, x = tx + Math.sin(q) * d, z = tz + Math.cos(q) * d;
        h.place(x, z, Math.atan2(-(tx - x), -(tz - z)), -0.05); h.advance(0.05); h.draw(); h.draw(); }, [tx, tz, d, ang]);
      await page.waitForTimeout(800);
      const buf = await page.locator('canvas').first().screenshot();
      await writeFile(path.join(outDir, `${tag}-sq${who}-${place}-${d}m.png`), buf);
      const s = await page.evaluate(() => window.__breachlineTest.stats());
      console.log(tag, 'squad', who, place, d + 'm', JSON.stringify({ calls: s.calls, tris: s.triangles ?? s.tris }));
    }
  }
  await browser.close();
}
if (process.env.ONLY !== 'patch') await run(false);
if (process.env.ONLY !== 'stock') await run(true);
