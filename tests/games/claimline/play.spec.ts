import { test, expect, type Page } from '../../fixtures';
import { gameAction, pauseGame } from '../../game-menu';

const URL = '/#/game/claimline';
const game = (page: Page) => page.locator('.cl-game');
const num = async (page: Page, name: string) => Number(await game(page).getAttribute(`data-${name}`));
async function open(page: Page) {
  await page.goto(URL);
  // The shell title now lives in the glass options dialog; the arena card carries the visible name.
  await expect(page.locator('#game-title')).toHaveText('Claimline menu');
  await expect(page.locator('#cl-heading')).toHaveText('Claimline');
  await expect(page.locator('.cl-footnote')).toHaveText('Mouse, arrows or WASD to steer · P pause · Esc study');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}
async function play(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(game(page)).toHaveAttribute('data-phase', 'running');
}
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test.describe('Claimline desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('title, start card, HUD share and a ranking of seven rows with exactly one You', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await open(page);
    await expect(page.locator('.cl-card h2')).toHaveText('Claimline');
    await play(page);
    await expect(page.locator('.cl-overlay')).toBeHidden();
    await expect(page.locator('.cl-share-value')).toHaveText(/^\d+\.\d\d%$/);
    await expect(page.locator('#game-score strong')).toHaveText(/^\d+\.\d\d%$/);
    // The shared glass dock replaces the old top bar and mirrors the share and rank.
    await expect(page.locator('.game-dock .game-hud strong').first()).toHaveText(/^\d+\.\d\d%$/);
    await expect(page.locator('.game-dock .game-hud')).toContainText(/Rank #\d of 7/);
    await expect(page.locator('.game-toolbar')).toHaveCount(0);
    // Start card: no tagline and no numbered guide.
    await expect(page.locator('.cl-guide')).toHaveCount(0);
    const rows = page.locator('.cl-ranking[aria-label="Match ranking"] li');
    await expect(rows).toHaveCount(7);
    await expect(page.locator('.cl-ranking li .cl-name', { hasText: /^You$/ })).toHaveCount(1);
    await expect(page.locator('.cl-ranking li.is-you')).toHaveCount(1);
    await expect(game(page)).toHaveAttribute('data-bots', '6');
    expect(await num(page, 'pct')).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('keyboard steering sets the target and the heading converges on it', async ({ page }) => {
    await open(page); await play(page);
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => angleGap(await num(page, 'target'), -Math.PI / 2)).toBeLessThan(0.01);
    await expect.poll(async () => angleGap(await num(page, 'angle'), -Math.PI / 2), { timeout: 5000 }).toBeLessThan(0.15);
    await expect(game(page)).toHaveAttribute('data-input', 'keyboard');
    await page.keyboard.up('ArrowUp');
    // Releasing keeps the heading; WASD steers too.
    await page.keyboard.down('a');
    await expect.poll(async () => angleGap(await num(page, 'target'), Math.PI)).toBeLessThan(0.01);
    await page.keyboard.up('a');
    const kept = await num(page, 'target');
    await page.waitForTimeout(300);
    expect(await num(page, 'target')).toBeCloseTo(kept, 3);
  });

  test('mouse steering aims at the pointer relative to the head', async ({ page }) => {
    await open(page); await play(page);
    const box = (await page.locator('.cl-canvas').boundingBox())!;
    await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 3 });
    await expect.poll(async () => angleGap(await num(page, 'target'), Math.PI), { timeout: 4000 }).toBeLessThan(0.25);
    await expect(game(page)).toHaveAttribute('data-input', 'mouse');
    await page.mouse.move(box.x + box.width / 2, box.y + 40, { steps: 3 });
    await expect.poll(async () => angleGap(await num(page, 'target'), -Math.PI / 2), { timeout: 4000 }).toBeLessThan(0.3);
  });

  test('P and the pause button freeze the simulation and resume continues', async ({ page }) => {
    await open(page); await play(page);
    await expect.poll(() => num(page, 'tick')).toBeGreaterThan(5);
    await page.keyboard.press('p');
    await expect(page.locator('#pause-overlay')).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-paused', 'true');
    const frozen = await num(page, 'tick');
    await page.waitForTimeout(500);
    expect(await num(page, 'tick')).toBe(frozen);
    await page.keyboard.press('p');
    await expect(page.locator('#pause-overlay')).toBeHidden();
    await expect.poll(() => num(page, 'tick')).toBeGreaterThan(frozen + 5);
  });

  test('restart resets the match and shows the Play card; works while paused', async ({ page }) => {
    await open(page); await play(page);
    await expect.poll(() => num(page, 'tick')).toBeGreaterThan(10);
    await pauseGame(page);
    await gameAction(page, 'Restart game');
    await expect(game(page)).toHaveAttribute('data-tick', '0');
    await expect(game(page)).toHaveAttribute('data-phase', 'ready');
    await page.waitForTimeout(300);
    await expect(game(page)).toHaveAttribute('data-tick', '0');
    // Whether or not the shell resumed, Play is the way back in.
    if (await page.locator('#pause-overlay').isVisible()) await page.locator('#resume-game').click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await play(page);
    await expect.poll(() => num(page, 'tick')).toBeGreaterThan(5);
  });

  test('Escape opens Study and returning to Games resumes without a page error', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await open(page); await play(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#study-view')).toBeVisible();
    await page.locator('.study-article-body').getByRole('link', { name: 'Return to previous view', exact: true }).click();
    await expect(page.locator('#study-view')).toBeHidden();
    await expect(game(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the page never scrolls and leaving the game tears down cleanly', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await open(page); await play(page);
    await page.mouse.move(640, 400); await page.mouse.wheel(0, 800);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.goto('/#/collection');
    await expect(game(page)).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(errors).toEqual([]);
  });

  test('score shown is the human peak only and the saved run restores as Continue', async ({ page }) => {
    await open(page); await play(page);
    await expect.poll(() => num(page, 'tick')).toBeGreaterThan(30);
    await pauseGame(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-arcade:v1:save:claimline') ?? 'null'));
    expect(saved?.data?.version).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(game(page)).toHaveAttribute('data-phase', 'running');
  });
});
