import { test, expect, type Page } from '../../fixtures';

const share = (page: Page) => page.getByRole('dialog', { name: 'Share game' });

async function start(page: Page) {
  await page.goto('/#/game/chess');
  await page.getByRole('button', { name: /Pass and play/ }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.ch-board')).toBeVisible();
}

async function open(page: Page) {
  // Resizing changes the container layout on the next frame.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const options = page.getByRole('button', { name: 'Options', exact: true });
  if (await options.isVisible()) {
    await options.click();
  }
  await page.getByRole('button', { name: 'Share or export', exact: true }).click();
  await expect(share(page)).toBeVisible();
}

test('Share X closes the overlay and can reopen repeatedly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  for (let i = 0; i < 3; i++) {
    await open(page);
    await share(page).getByRole('button', { name: 'Close', exact: true }).locator('svg').click();
    await expect(share(page)).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#study-view')).toBeHidden();
  }
  // Keyboard activation uses the same native dialog form submission.
  await open(page);
  await share(page).getByRole('button', { name: 'Close', exact: true }).press('Enter');
  await expect(share(page)).toHaveCount(0);
  await page.locator('#ch-sq-e2').click();
  await page.locator('#ch-sq-e4').click();
  await expect(page.locator('.ch-moves .ch-mv')).toHaveText(['e4']);
});

test('Share Escape closes before Study and releases the overlay on reopen', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 2; i++) {
    await open(page);
    await share(page).getByRole('textbox', { name: 'FEN' }).focus();
    await page.keyboard.press('Escape');
    await expect(share(page)).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#study-view')).toBeHidden();
    await expect(page).toHaveURL(/#\/(?:game\/chess|collection\/29)$/);
  }
  // Once Share is gone, the shell still owns the next Escape.
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
});

test('Share keeps interior clicks open and dismisses on the backdrop', async ({ page }) => {
  await start(page);
  await open(page);
  await share(page).getByRole('heading', { name: 'Share game' }).click();
  await expect(share(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(share(page)).toHaveCount(0);
  await expect(page.locator('#study-view')).toBeHidden();
  await open(page);
  await page.mouse.click(5, 5);
  await expect(share(page)).toHaveCount(0);
});

test('Share spaces its controls and wraps within narrow screens', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Native sharing is not exposed by every desktop browser. Expose only that
  // optional platform capability so this layout includes the phone Share row.
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} }));
  await start(page);
  for (const [width, height] of [[1440, 900], [390, 844], [320, 700], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await open(page);
    const dialog = share(page);
    await dialog.getByRole('button', { name: 'Copy PGN', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('PGN copied.');
    const input = (await dialog.getByRole('textbox', { name: 'FEN' }).boundingBox())!;
    const actions = await Promise.all(['Copy FEN', 'Copy PGN', 'Download PGN'].map(name => dialog.getByRole('button', { name, exact: true }).boundingBox()));
    const nativeShare = (await dialog.getByRole('button', { name: 'Share', exact: true }).boundingBox())!;
    const status = (await dialog.getByRole('status').boundingBox())!;
    expect(Math.min(...actions.map(box => box!.y)) - (input.y + input.height)).toBeGreaterThanOrEqual(12);
    expect(nativeShare.y - Math.max(...actions.map(box => box!.y + box!.height))).toBeGreaterThanOrEqual(12);
    expect(status.y - (nativeShare.y + nativeShare.height)).toBeGreaterThanOrEqual(12);
    for (const box of [...actions, nativeShare]) {
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
    }
    const first = actions[0]!, second = actions[1]!;
    expect(Math.abs(first.y - second.y) < 2 ? second.x - (first.x + first.width) : second.y - (first.y + first.height)).toBeGreaterThanOrEqual(10);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (info.project.name === 'chromium') await page.screenshot({ path: `/tmp/qcc-share-evidence/share-${width}.png` });
    await page.mouse.click(5, 5);
    await expect(dialog).toHaveCount(0);
  }
});
