import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { test, expect, seedStudyTopic, type Page } from '../../fixtures';
const evidence = process.env.NEON_COIL_EVIDENCE_DIR || 'docs/evidence/neon-coil';
const game = (page: Page) => page.locator('.nc-game');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:v1:save:neon-coil')!).data);
const worldSummary = (world: Awaited<ReturnType<typeof saved>>) => ({ sha256: createHash('sha256').update(JSON.stringify(world)).digest('hex'), phase: world.phase, ticks: world.ticks, mass: world.snakes[0].mass });
async function open(page: Page) {
  await page.clock.install({ time: new Date('2026-10-20T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
  await page.goto('/#/game/neon-coil');
  await expect(page.getByRole('button', { name: 'Enter arena', exact: true })).toBeVisible();
}
test('pointer movement without click, earned growth, Space boost, P pause, keyboard and restart', async ({ page }) => {
  // Allow 60s cumulatively for this ~180-frame software-rendered flow, while
  // retaining 30s auto-wait/navigation caps and 7s retrying assertions.
  test.setTimeout(60_000);
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(30_000);
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
  await page.screenshot({ path: `${evidence}/death-browser.png` });
  await page.getByRole('button', { name: 'Play again', exact: true }).click(); await page.clock.runFor(1000);
  const ticks = Number(await game(page).getAttribute('data-tick')); expect(ticks).toBeGreaterThan(50); expect(ticks).toBeLessThanOrEqual(60);
  await expect(page.locator('.nc-canvas')).toHaveCount(1);
});
test('real hover steering into a local bot body causes death and collectible pellets', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 }); await open(page); await page.locator('.nc-start').click();
  await page.mouse.move(640, 180); // Pure pointer motion, without clicking or setting game state.
  for (let n = 0; n < 24; n++) await page.clock.fastForward(250);
  await expect(game(page)).toHaveAttribute('data-phase', 'dead');
  await expect(page.locator('.nc-copy')).toContainText('body');
  expect(Number(await game(page).getAttribute('data-trails'))).toBeGreaterThan(5);
  await page.screenshot({ path: `${evidence}/body-collision-browser.png` });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const ended = await saved(page); expect(ended.snakes[0].alive).toBe(false); expect(ended.snakes[0].body).toHaveLength(0);
  expect(ended.food.some((food: { trail: boolean }) => food.trail)).toBe(true);
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
    }).toEqual({ w: (size.width >= 1100 ? size.width - 264 : size.width) * 2, h: size.height * 2 });
    expect(await page.locator('.nc-ranking li').count()).toBe(size.width < 600 || size.height < 600 ? 5 : 10);
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
  await page.screenshot({ path: `${evidence}/touch-390.png` }); await context.close();
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
  await expect(page.locator('.game-card')).toHaveCount(15);
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

for (const order of ['steering-first', 'boost-first', 'reacquire'] as const) {
  test(`native touch ownership: ${order}`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Native multi-touch requires Chromium CDP.');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await seedStudyTopic(context); const page = await context.newPage(); await open(page); await page.locator('.nc-start').tap();
    const cdp = await context.newCDPSession(page);
    const b = (await page.locator('.nc-boost').boundingBox())!;
    const boost = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 };
    const steer = { x: 195, y: 422, id: 2 };
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    try {
      await send('touchStart', [order === 'boost-first' ? boost : steer]);
      await send('touchStart', [boost, steer]);
      if (order === 'reacquire') {
        // CDP touchEnd identifies the contact to release; Boost stays down.
        await send('touchEnd', [steer]);
        steer.id = 3;
        await send('touchStart', [boost, steer]);
      }
      steer.y = 200; await send('touchMove', [boost, steer]); await page.clock.runFor(500);
      await page.screenshot({ path: `${evidence}/touch-${order}.png` });
      await expect(game(page)).toHaveAttribute('data-boosting', 'true');
      expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
      expect(Number(await game(page).getAttribute('data-y'))).toBeLessThan(-40);
      // A further arena finger cannot steal the tracked steering pointer.
      await send('touchStart', [boost, steer, { x: 195, y: 600, id: 4 }]);
      await page.clock.runFor(150);
      expect(Number(await game(page).getAttribute('data-angle'))).toBeLessThan(-1);
      await send('touchCancel', []); await page.clock.runFor(150);
      await expect(game(page)).toHaveAttribute('data-boosting', 'false');
    } finally { await context.close(); }
  });
}
for (const size of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 568, height: 320 }, { width: 667, height: 375 }]) {
  test(`short landscape bounds and unobscured player ranking ${size.width}x${size.height}`, async ({ page }) => {
    // Reproduce rotating the supported small portrait phone while the intro is open.
    await page.setViewportSize(size.width === 568 ? { width: 320, height: 568 } : size); await open(page);
    if (size.width === 568) await page.setViewportSize(size);
    const bounds = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const card = await bounds('.nc-card'), enter = await bounds('.nc-start');
    const footer = await bounds('#restart-game');
    await page.screenshot({ path: `${evidence}/intro-${size.width}.png` });
    expect.soft(card.x).toBeGreaterThanOrEqual(0);
    expect.soft(card.x + card.width).toBeLessThanOrEqual(size.width);
    expect.soft(card.y).toBeGreaterThanOrEqual(62);
    expect.soft(card.y + card.height).toBeLessThanOrEqual(footer.y - 8);
    expect.soft(enter.height).toBeGreaterThanOrEqual(44);
    expect.soft(enter.y + enter.height).toBeLessThanOrEqual(footer.y - 8);
    for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu']) {
      const control = await bounds(selector);
      const overlap = enter.x < control.x + control.width && enter.x + enter.width > control.x && enter.y < control.y + control.height && enter.y + enter.height > control.y;
      expect.soft(overlap, `Enter overlaps ${selector}`).toBe(false);
    }
    // Cover the whole actionable button, including its bottom-right area where Restart covered it.
    const hits = await page.locator('.nc-start').evaluate(button => {
      const b = button.getBoundingClientRect();
      return [.1, .5, .9].flatMap(x => [.1, .5, .9].map(y => button.contains(document.elementFromPoint(b.x + b.width * x, b.y + b.height * y))));
    });
    expect.soft(hits, 'Every sampled Enter point reaches Enter').toEqual(Array(9).fill(true));
    expect.soft(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([size.width, size.height]);
    await page.locator('.nc-start').click(); await page.clock.runFor(150);
    await expect(page.locator('.nc-you')).toBeVisible();
    const you = await bounds('.nc-you');
    await page.screenshot({ path: `${evidence}/running-${size.width}.png` });
    expect.soft(await page.locator('.nc-ranking li').count()).toBe(5);
    expect.soft(you.y + you.height).toBeLessThanOrEqual(footer.y - 8);
    for (const selector of ['#restart-game', '#favourite-game', '#rules-game', '#game-menu', '.nc-boost']) {
      const control = await bounds(selector);
      const overlap = you.x < control.x + control.width && you.x + you.width > control.x && you.y < control.y + control.height && you.y + you.height > control.y;
      expect.soft(overlap, `YOU overlaps ${selector}`).toBe(false);
    }
  });
}
test('short narrow viewport keeps intro and Boost within the supported 320px width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await open(page);
  for (const selector of ['.nc-card', '.nc-start', '.nc-boost']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect.soft(box.x, selector).toBeGreaterThanOrEqual(0);
    expect.soft(box.x + box.width, selector).toBeLessThanOrEqual(320);
    expect.soft(box.y + box.height, selector).toBeLessThanOrEqual(498);
  }
  await page.screenshot({ path: `${evidence}/intro-320.png` });
});

for (const lifecycle of ['ready', 'paused', 'dead', 'running'] as const) {
  test(`resize synchronizes ranking without advancing ${lifecycle} arena`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 }); await open(page);
    if (lifecycle !== 'ready') await page.locator('.nc-start').click();
    if (lifecycle === 'paused') {
      await page.clock.runFor(150); await page.locator('#pause-game').click();
    } else if (lifecycle === 'dead') {
      await page.keyboard.down('ArrowLeft');
      for (let n = 0; n < 44; n++) await page.clock.fastForward(250);
      await page.keyboard.up('ArrowLeft'); await expect(game(page)).toHaveAttribute('data-phase', 'dead');
    }
    await expect(page.locator('.nc-ranking li')).toHaveCount(10);
    await page.evaluate(() => {
      const announcer = document.querySelector<HTMLElement>('#announcer')!;
      announcer.dataset.resizeAnnouncements = '0';
      new MutationObserver(records => { announcer.dataset.resizeAnnouncements = String(Number(announcer.dataset.resizeAnnouncements) + records.length); }).observe(announcer, { childList: true, subtree: true });
      window.dispatchEvent(new Event('pagehide'));
    });
    const before = await saved(page);
    const resizes: { width: number; height: number; rows: number; world: ReturnType<typeof worldSummary> }[] = [];
    const bestBefore = await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil'));
    // No fake-clock advancement: canvas and HUD must synchronize in the same native resize delivery.
    for (const size of [{ width: 390, height: 844, rows: 5 }, { width: 1280, height: 720, rows: 10 }, { width: 844, height: 390, rows: 5 }]) {
      await page.setViewportSize(size);
      // Backing pixels use the browser's DPR, capped at 2 and rounded by the renderer.
      const dpr = await page.evaluate(() => Math.min(2, window.devicePixelRatio || 1));
      await expect.poll(() => page.locator('.nc-canvas').evaluate(c => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }))).toEqual({ w: Math.round((size.width >= 1100 ? size.width - 264 : size.width) * dpr), h: Math.round(size.height * dpr) });
      expect.soft(await page.locator('.nc-ranking li').count(), `${lifecycle} ${size.width}x${size.height}`).toBe(size.rows);
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      const world = await saved(page); resizes.push({ ...size, world: worldSummary(world) });
      expect(world).toEqual(before);
    }
    if (lifecycle !== 'running') {
      await page.clock.runFor(300); await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      expect(await saved(page)).toEqual(before);
      expect.soft(await page.locator('.nc-ranking li').count(), 'Stopped simulation cannot leave stale ranking indefinitely').toBe(5);
    }
    expect(await page.locator('#announcer').getAttribute('data-resize-announcements')).toBe('0');
    expect(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil'))).toBe(bestBefore);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `${evidence}/resize-${lifecycle}.png` });
    await writeFile(`${evidence}/resize-${lifecycle}.json`, JSON.stringify({ lifecycle, before: worldSummary(before), resizes, after: worldSummary(await saved(page)), errors, announcements: await page.locator('#announcer').getAttribute('data-resize-announcements'), bestBefore, bestAfter: await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:neon-coil')) }, null, 2));
    if (lifecycle === 'paused') await page.locator('#pause-game').click();
    if (lifecycle === 'running' || lifecycle === 'paused') {
      await page.clock.runFor(200);
      expect(Number(await game(page).getAttribute('data-tick'))).toBeGreaterThan(before.ticks);
    }
  });
}
