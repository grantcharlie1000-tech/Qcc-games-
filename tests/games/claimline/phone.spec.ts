import type { CDPSession } from '@playwright/test';
import { test, expect, type Page } from '../../fixtures';

const game = (page: Page) => page.locator('.cl-game');
const num = async (page: Page, name: string) => Number(await game(page).getAttribute(`data-${name}`));
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

async function start(page: Page) {
  await page.goto('/#/game/claimline');
  // The shell title now lives in the glass options dialog; the arena card carries the visible name.
  await expect(page.locator('#game-title')).toHaveText('Claimline menu');
  await expect(page.locator('#cl-heading')).toHaveText('Claimline');
  await page.getByRole('button', { name: 'Play', exact: true }).tap();
  await expect(game(page)).toHaveAttribute('data-phase', 'running');
}
// One CDP session per page: Chromium keeps the touch sequence state on the session.
const sessions = new WeakMap<Page, Promise<CDPSession>>();
async function touch(page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: { x: number; y: number }[]) {
  if (!sessions.has(page)) sessions.set(page, page.context().newCDPSession(page));
  const cdp = await sessions.get(page)!;
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
}
async function pad(page: Page) {
  const b = (await page.locator('.cl-canvas').boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height * 0.7 };
}
const noScroll = async (page: Page) => {
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
};

test.describe('Claimline phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('fits a 390px phone with the HUD inside the canvas and no overflow', async ({ page }) => {
    await start(page);
    // Touch players only see the touch hint; key hints stay on keyboard devices.
    await expect(page.locator('.cl-footnote')).toHaveText('Drag anywhere to steer');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const canvas = (await page.locator('.cl-canvas').boundingBox())!;
    expect(canvas.x).toBeGreaterThanOrEqual(0);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(390.5);
    for (const selector of ['.cl-share', '.cl-ranking']) {
      const b = (await page.locator(selector).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390.5);
    }
    const share = (await page.locator('.cl-share').boundingBox())!, rank = (await page.locator('.cl-ranking').boundingBox())!;
    expect(share.x + share.width).toBeLessThanOrEqual(rank.x);
    await expect(page.locator('.cl-ranking li')).toHaveCount(7);
    await noScroll(page);
  });

  test('start card fits and stays inside the viewport', async ({ page }) => {
    await page.goto('/#/game/claimline');
    const card = (await page.locator('.cl-card').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(390.5);
    expect(card.y + card.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('dragging shows the floating stick, steers, and releasing keeps the heading moving', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch emulation requires Chromium');
    await start(page);
    const p = await pad(page);
    await touch(page, 'touchStart', [p]);
    await expect(page.locator('.cl-stick')).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-stick', 'active');
    // Drag straight up (screen -y): target heading is -PI/2.
    for (let i = 1; i <= 6; i++) await touch(page, 'touchMove', [{ x: p.x, y: p.y - i * 8 }]);
    await expect.poll(async () => angleGap(await num(page, 'target'), -Math.PI / 2)).toBeLessThan(0.1);
    await expect(game(page)).toHaveAttribute('data-input', 'touch');
    const knob = (await page.locator('.cl-stick-knob').boundingBox())!, base = (await page.locator('.cl-stick').boundingBox())!;
    expect(knob.y + knob.height / 2).toBeLessThan(base.y + base.height / 2);
    await noScroll(page);
    // Swing right.
    for (let i = 1; i <= 6; i++) await touch(page, 'touchMove', [{ x: p.x + i * 8, y: p.y - 48 + i * 8 }]);
    await expect.poll(async () => angleGap(await num(page, 'target'), 0)).toBeLessThan(0.7);
    await touch(page, 'touchEnd', []);
    await expect(page.locator('.cl-stick')).toBeHidden();
    await expect(game(page)).toHaveAttribute('data-stick', 'idle');
    const x0 = await num(page, 'x'), y0 = await num(page, 'y'), t0 = await num(page, 'target');
    await page.waitForTimeout(500);
    expect(Math.hypot((await num(page, 'x')) - x0, (await num(page, 'y')) - y0)).toBeGreaterThan(1);
    expect(await num(page, 'target')).toBeCloseTo(t0, 3);
    await noScroll(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('touchCancel clears the stick and leaves no stuck input', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch emulation requires Chromium');
    await start(page);
    const p = await pad(page);
    await touch(page, 'touchStart', [p]);
    await touch(page, 'touchMove', [{ x: p.x - 40, y: p.y }]);
    await expect(game(page)).toHaveAttribute('data-stick', 'active');
    await touch(page, 'touchCancel', []);
    await expect(game(page)).toHaveAttribute('data-stick', 'idle');
    await expect(page.locator('.cl-stick')).toBeHidden();
    const t0 = await num(page, 'target');
    await page.waitForTimeout(600);
    expect(await num(page, 'target')).toBeCloseTo(t0, 3);
    await expect(game(page)).not.toHaveAttribute('data-input', 'touch');
    await noScroll(page);
  });

  test('a second finger does not steal the steering touch', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch emulation requires Chromium');
    await start(page);
    const p = await pad(page);
    await touch(page, 'touchStart', [p]);
    await touch(page, 'touchMove', [{ x: p.x, y: p.y + 40 }]);
    await expect.poll(async () => angleGap(await num(page, 'target'), Math.PI / 2)).toBeLessThan(0.1);
    await touch(page, 'touchStart', [{ x: p.x, y: p.y + 40 }, { x: p.x - 80, y: p.y - 80 }]);
    await touch(page, 'touchMove', [{ x: p.x, y: p.y + 40 }, { x: p.x - 90, y: p.y - 90 }]);
    await page.waitForTimeout(150);
    expect(angleGap(await num(page, 'target'), Math.PI / 2)).toBeLessThan(0.2);
    await touch(page, 'touchEnd', []);
    await expect(game(page)).toHaveAttribute('data-stick', 'idle');
  });
});
