import { test, expect, seedStudyTopic, type Page } from '../../fixtures';
const game = (page: Page) => page.locator('.nc-game');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:v1:save:neon-coil')!).data);
async function open(page: Page) {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
  await page.goto('/#/game/neon-coil');
  await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
}
test('pointer movement without click, earned growth, Space boost, P pause, keyboard and restart', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 }); await open(page);
  await page.getByRole('button', { name: 'Enter arena', exact: true }).click();
  await page.mouse.move(1050, 450); await page.clock.runFor(900);
  expect(Number(await game(page).getAttribute('data-x'))).toBeGreaterThan(100);
  expect(Number(await game(page).getAttribute('data-mass'))).toBeGreaterThan(30);
  await page.mouse.move(720, 170); await page.clock.runFor(450);
  expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
  await page.keyboard.down('Space'); await page.clock.runFor(250);
  await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  await page.keyboard.press('p'); await expect(page.locator('#pause-overlay')).toBeVisible();
  const before = await saved(page); expect(before.snakes[0].boosting).toBe(false);
  expect(before.snakes[0].pathLength).toBeGreaterThan(220);
  await page.clock.runFor(1000); await page.mouse.move(100, 200); await page.keyboard.press('ArrowDown');
  expect(await saved(page)).toEqual(before);
  await page.keyboard.up('Space'); await page.keyboard.press('p'); await page.clock.runFor(200);
  await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(700); await page.keyboard.up('ArrowRight');
  expect(Math.abs(Number(await game(page).getAttribute('data-angle')))).toBeLessThan(.1);
  await page.keyboard.press('ArrowDown'); await page.clock.runFor(450);
  expect(Number(await game(page).getAttribute('data-angle'))).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Restart game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
  await expect(game(page)).toHaveAttribute('data-tick', '0'); expect(errors).toEqual([]);
});
test('rim death creates real food, exposes death reason, and replay has one loop', async ({ page }) => {
  await open(page); await page.locator('.nc-start').click();
  // A real held direction reaches the physical rim; no test hook sets the death state.
  await page.keyboard.down('ArrowLeft');
  // Exercise 250 ms frame gaps through real held input and the production accumulator.
  // This avoids spending 660 software-rasterized frames on a straight trip to the rim.
  for (let n = 0; n < 44; n++) await page.clock.fastForward(250);
  await page.keyboard.up('ArrowLeft');
  await expect(game(page)).toHaveAttribute('data-phase', 'dead');
  await expect(page.locator('.nc-copy')).toContainText(/rim|body|Head-on/);
  expect(Number(await game(page).getAttribute('data-trails'))).toBeGreaterThan(5);
  await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/evidence/neon-coil/death-browser.png' });
  await page.getByRole('button', { name: 'Play again', exact: true }).click(); await page.clock.runFor(1000);
  const ticks = Number(await game(page).getAttribute('data-tick')); expect(ticks).toBeGreaterThan(50); expect(ticks).toBeLessThanOrEqual(60);
  await expect(page.locator('.nc-canvas')).toHaveCount(1);
});
test('Escape preserves host study, saves exactly, and saved continuation waits for user', async ({ page }) => {
  await open(page); await page.locator('.nc-start').click(); await page.clock.runFor(650);
  await page.keyboard.press('Escape'); await expect(page.locator('#study-view')).toBeVisible();
  const before = await saved(page); await page.clock.runFor(1200); await page.keyboard.press('Space'); await page.keyboard.press('ArrowUp');
  expect(await saved(page)).toEqual(before);
  await page.getByRole('link', { name: 'Games', exact: true }).click(); await page.clock.runFor(150);
  expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(before.ticks);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click(); const paused = await saved(page);
  await page.reload(); await expect(page.getByRole('button', { name: 'Continue arena', exact: true })).toBeVisible();
  await page.clock.runFor(800); await expect(game(page)).toHaveAttribute('data-tick', String(paused.ticks));
  await page.getByRole('button', { name: 'Continue arena', exact: true }).click(); await page.clock.runFor(200);
  expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(paused.ticks);
});
test('resize, high DPI, reduced motion and controls fit desktop, ultrawide and touch widths', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').click();
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.clock.runFor(100);
    expect(await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))).toEqual({ w: size.width, h: size.height });
    await expect.poll(async () => {
      // ResizeObserver is delivered on a native layout frame, outside the fake clock.
      await page.clock.runFor(34);
      return page.locator('.nc-canvas').evaluate(c => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }));
    }).toEqual({ w: size.width * 2, h: size.height * 2 });
    for (const selector of ['#pause-game', '#restart-game', '.nc-boost']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    }
  }
  await context.close();
});
test('touch drag and a second finger on the boost control steer without scrolling', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multi-touch evidence uses Chromium CDP; WebKit tests mouse and keyboard.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').tap();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 422, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 300, id: 1 }] });
  await page.clock.runFor(450); expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-20);
  const b = (await page.locator('.nc-boost').boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }, { x, y, id: 2 }] });
  await page.clock.runFor(250); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(200); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
  await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await page.screenshot({ path: 'docs/evidence/neon-coil/touch-390.png' }); await context.close();
});
test('focusable boost, lost focus, frame stalls, disposal and invalid saves recover safely', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await open(page);
  for (let run = 0; run < 3; run++) {
    await page.getByRole('button', { name: 'Enter arena', exact: true }).click(); await page.locator('.nc-boost').focus();
    await page.keyboard.down('Enter'); await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'true');
    await page.keyboard.up('Enter'); await page.clock.runFor(150); await expect(game(page)).toHaveAttribute('data-boosting', 'false');
    if (run === 0) {
      await page.locator('.nc-canvas').focus(); await page.keyboard.down('Space'); await page.clock.runFor(150);
      await expect(game(page)).toHaveAttribute('data-boosting', 'true');
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.clock.runFor(150);
      await expect(game(page)).toHaveAttribute('data-boosting', 'false'); await page.keyboard.up('Space');
    }
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); const before = (await saved(page)).ticks;
    await page.clock.fastForward(8000);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); const after = (await saved(page)).ticks;
    expect(after - before).toBeLessThanOrEqual(15);
    await page.getByRole('link', { name: 'Back to game library', exact: true }).click(); await expect(game(page)).toHaveCount(0);
    await page.keyboard.press('p'); await page.clock.runFor(150);
    await page.evaluate(() => localStorage.setItem('pocket-arcade:v1:save:neon-coil', JSON.stringify({ version: 1, data: { version: 1, snakes: 'broken' } })));
    await page.getByRole('link', { name: 'Play Neon Coil', exact: true }).click(); await expect(game(page)).toHaveAttribute('data-tick', '0');
  }
  expect(errors).toEqual([]);
});
test('the library retains original grid Snake and opens Neon Coil separately', async ({ page }) => {
  await open(page); await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(14);
  await expect(page.getByRole('link', { name: 'Play Snake', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Play Snake', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start slithering', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.clock.runFor(690);
  await expect(page.locator('#game-score strong')).toHaveText('10');
  await expect(page.locator('.snake-game')).toHaveCount(1); await expect(game(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to game library', exact: true }).click();
  await page.getByRole('link', { name: 'Play Neon Coil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
  await expect(game(page)).toHaveAttribute('data-tick', '0'); await expect(page.locator('.snake-game')).toHaveCount(0);
});
