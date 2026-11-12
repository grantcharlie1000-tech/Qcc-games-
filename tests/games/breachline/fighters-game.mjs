// In-game evidence for the fighters, under the real lighting: a parked bot seen from 2, 8 and 20 metres (four
// directions each, so one has a clear line), plus the scene's budget counters.
// Usage: node tests/games/breachline/fighters-game.mjs <baseUrl> <outDir> [botIndex] [dists]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, botArg, distArg = '2,8,20', dirArg = '0,90,180,270'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => {
  if (window !== window.top) return;
  localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true'); localStorage.setItem('qcc:festive', 'off');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept'); sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
});
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error') console.log(`[page] ${m.text()}`); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${base}/?festive=off#/game/breachline`);
await page.waitForFunction(() => window.__breachlineTest !== undefined, undefined, { timeout: 60000 });
await page.evaluate(() => { const h = window.__breachlineTest; h.start({ seed: 7, quality: 'high', teamSize: 3, bots: true }); h.freeze(true); h.advance(0.2); h.still(); h.skip(30); h.advance(0.3); h.advance(1); });
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '.bl-toast, .bl-prompt, .bl-hud { visibility: hidden !important; }' });
const st = await page.evaluate(() => window.__breachlineTest.state());
const self = st.self, bots = st.players.filter(p => p.id !== self && p.alive);
const bot = bots[Number(botArg ?? 0)] ?? bots[0];
console.log('bot', JSON.stringify(bot), 'self', self, 'all', JSON.stringify(st.players.map(p => [p.id, p.squad, +p.x.toFixed(1), +p.z.toFixed(1)])));
// Let every level of detail build (one per frame).
for (let i = 0; i < 12; i++) await page.evaluate(() => window.__breachlineTest.draw());
for (const d of distArg.split(',').map(Number)) for (const a of dirArg.split(',').map(Number)) {
  const r = a * Math.PI / 180, x = bot.x + Math.sin(r) * d, z = bot.z + Math.cos(r) * d;
  const yaw = Math.atan2(-(bot.x - x), -(bot.z - z)), pitch = Math.atan2(1.15 - 1.62, d);
  const stats = await page.evaluate(([x, z, yaw, pitch]) => { const h = window.__breachlineTest; h.place(x, z, yaw, pitch); h.advance(0.05); h.draw(); h.draw(); return h.stats(); }, [x, z, yaw, pitch]);
  const f = `${out}/game-${d}m-${a}.png`;
  await page.locator('canvas').first().screenshot({ path: f });
  console.log(f, JSON.stringify(stats));
}
await browser.close();
