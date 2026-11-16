import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const artifacts = process.env.CHESS_BROWSER_ARTIFACTS || join(tmpdir(), 'qcc-chess-ui-speed');
await mkdir(artifacts, { recursive: true });
const server = await preview({ root, configFile: false, preview: { host: '127.0.0.1', port: 0 } });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [];
try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    for (const [name, id] of [['maia', 'elo-1300'], ['stockfish', 'max']]) {
      const context = await browser.newContext({ viewport: { width, height } });
      try {
        await context.addInitScript(() => {
          localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true');
          localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept');
          sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/game/chess`);
        await page.getByRole('button', { name: /Computer/ }).click();
        await page.locator(`.ch-opp[data-value="${id}"]`).click();
        await page.getByRole('radio', { name: 'White', exact: true }).click();
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await expect(page.locator('.ch-state')).toHaveText('Your move', { timeout: 120000 });
        await page.locator('#ch-sq-e2').click();
        await page.locator('#ch-sq-e4').click();
        await expect(page.locator('.ch-moves .ch-mv')).toHaveCount(2, { timeout: 120000 });
        await expect(page.locator('.ch-state')).toHaveText('Your move');
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow');
        if (errors.length) throw new Error(errors.join('\n'));
        const screenshot = join(artifacts, `${name}-${width}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({ name, width, moves: await page.locator('.ch-moves .ch-mv').allTextContents(), screenshot, errors });
        console.log(`${name} ${width}: real engine reply applied`);
      } catch (error) {
        console.error(`${name} ${width}: ${error}`);
        const page = context.pages()[0];
        if (page) await page.screenshot({ path: join(artifacts, `${name}-${width}-failure.png`), fullPage: true });
        throw error;
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  await new Promise(done => server.httpServer.close(done));
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(results, null, 2));
}
