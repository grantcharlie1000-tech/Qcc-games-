import {test, expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {advance, carDeath, expectDeathCard, frames, hook, hop, openGame, SEED, shot, showCard, state} from './helpers';

const SAVE_KEY = 'pocket-arcade:v1:save:hopway';

/** Reuses study.spec's robust return: the Games link in the reading view, retried until the view has gone. */
const returnToGame = async (page: Page) => {
  const studyView = page.locator('#study-view'), games = page.getByRole('link', {name: 'Games', exact: true}).first();
  await expect(async () => {
    if (await studyView.isVisible()) await games.click({timeout: 1000});
    await expect(studyView).toBeHidden({timeout: 1000});
  }).toPass({timeout: 7000});
  await expect(page.locator('#study-view')).toBeHidden();
  await expect(page.locator('#game-stage, .game-card').first()).toBeVisible();
  await expect(page.locator('#app')).toHaveJSProperty('inert', false);
};

/** The first seed in 1..200 whose first 12 rows (0-11) include a road and a river, found through hook.lanes. It leaves the run on
 * that seed (ready, t = 0), so every screenshot shows the same world. */
async function useRoadAndRiverSeed(page: Page): Promise<number> {
  for (let seed = 1; seed <= 200; seed++) {
    await hook(page).setSeed(seed);
    const kinds = (await hook(page).lanes(0, 11)).map(lane => lane.kind);
    if (kinds.includes('road') && kinds.includes('river')) return seed;
  }
  throw new Error('no seed up to 200 has a road and a river in its first 12 rows');
}

test('Escape opens Study with the run saved and paused; the Games link returns to the same game', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, phase: 'running'});
  const instance = await page.locator('.hopway').elementHandle();
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Resume game');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY);
  expect(saved, `localStorage ${SAVE_KEY}`).toMatchObject({version: 1, data: {v: 1, seed: SEED, phase: 'running', row: 1, maxRow: 1}});

  await returnToGame(page);
  expect(await instance!.evaluate(el => el.isConnected && el === document.querySelector('.hopway')), 'the same .hopway element').toBe(true);
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Pause game');
  await expect(page.locator('.hw-layer')).toBeHidden();
  expect(await state(page)).toMatchObject({row: 1, score: 1, phase: 'running', alive: true});
  // The game takes input again where it left off.
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 2, score: 2});
  expect(errors).toEqual([]);
});

test('the shell Restart button turns a running run into a fresh ready run', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'ArrowUp');
  await hop(page, 'ArrowUp');
  const before = await state(page);
  expect(before).toMatchObject({row: 2, score: 2, phase: 'running'});
  await page.locator('#restart-game').click();
  await expect(page.locator('.hopway')).toHaveAttribute('data-phase', 'ready');
  const after = await state(page);
  expect(after).toMatchObject({phase: 'ready', row: 0, col: 4, score: 0, maxRow: 0, started: false, alive: true, t: 0});
  expect(after.seed, 'a new run gets a new seed').not.toBe(before.seed);
  await expect(page.locator('#game-score strong')).toHaveText('0');
  await expect(page.locator('#game-level')).toHaveText('Row 0');
  await expect(page.locator('.hw-hint')).toHaveAttribute('data-gone', 'false');
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, phase: 'running'});
  expect(errors).toEqual([]);
});

test('Play again after a death starts a fresh run', async ({page}) => {
  const errors = await openGame(page);
  await carDeath(page);
  await advance(page, 1);
  await expectDeathCard(page, 'car', 'Hit by a car');
  const dead = await state(page);
  await page.getByRole('button', {name: 'Play again', exact: true}).click();
  await expect(page.locator('.hopway')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.hw-over')).toBeHidden();
  await expect(page.locator('.hopway')).toHaveAttribute('data-cause', '');
  const fresh = await state(page);
  expect(fresh).toMatchObject({phase: 'ready', row: 0, col: 4, score: 0, alive: true, deathCause: null, started: false});
  expect(fresh.seed).not.toBe(dead.seed);
  await expect(page.locator('#game-score strong')).toHaveText('0');
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, phase: 'running'});
  expect(errors).toEqual([]);
});

test('Restart works while the game is paused', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'ArrowUp');
  await page.locator('#pause-game').click();
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Resume game');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.locator('#restart-game').click();
  await expect(page.locator('.hopway')).toHaveAttribute('data-phase', 'ready');
  // Restarting resumes: the pause overlay is gone and the button offers Pause again.
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Pause game');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  expect(await state(page)).toMatchObject({phase: 'ready', row: 0, score: 0, started: false});
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, phase: 'running'});
  expect(errors).toEqual([]);
});

test('P pauses and resumes: no frames and no input while paused', async ({page}) => {
  const errors = await openGame(page);
  const counter = () => page.evaluate(() => window.__hopwayFrames ?? 0);
  await hop(page, 'ArrowUp');
  expect((await hook(page).stats()).looping).toBe(true);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Resume game');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  expect((await hook(page).stats()).looping, 'the loop stops while paused').toBe(false);
  const frozenAt = await counter();
  await page.keyboard.press('ArrowUp'); // ignored while paused
  await page.waitForTimeout(300);
  expect(await state(page)).toMatchObject({row: 1, hopping: false, queued: null});
  expect(await counter(), 'no frames while paused').toBe(frozenAt);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Pause game');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  expect((await hook(page).stats()).looping, 'the loop runs again').toBe(true);
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 2, phase: 'running'});
  expect(errors).toEqual([]);
});

test('a session of hops, a death, restarts and resizes logs no errors', async ({page}) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  await hop(page, 'ArrowUp');
  await carDeath(page, 2); // row 1 -> a car on row 2
  await showCard(page);
  await expectDeathCard(page, 'car', 'Hit by a car');
  await page.setViewportSize({width: 390, height: 844});
  await frames(page, 4);
  await page.getByRole('button', {name: 'Play again', exact: true}).click();
  await expect(page.locator('.hopway')).toHaveAttribute('data-phase', 'ready');
  await hop(page, 'ArrowUp');
  await hop(page, 'ArrowRight');
  await page.setViewportSize({width: 1366, height: 768});
  await frames(page, 4);
  await page.locator('#restart-game').click();
  await expect(page.locator('.hopway')).toHaveAttribute('data-phase', 'ready');
  await page.setViewportSize({width: 366, height: 700});
  await frames(page, 4);
  await hop(page, 'ArrowUp');
  await page.setViewportSize({width: 1280, height: 720});
  await frames(page, 4);
  expect(await state(page)).toMatchObject({row: 1, phase: 'running', alive: true});
  expect(errors).toEqual([]);
});

test('leaving the game stops its loop and removes the test hook', async ({page}) => {
  const errors = await openGame(page);
  const counter = () => page.evaluate(() => window.__hopwayFrames ?? 0);
  const first = await counter();
  await frames(page, 6);
  const second = await counter();
  expect(second, 'the frame counter rises while the game is on screen').toBeGreaterThan(first);
  await page.getByRole('link', {name: 'Back to game library'}).click();
  await expect(page.locator('.hopway')).toHaveCount(0);
  await page.waitForTimeout(300);
  const stopped = await counter();
  await page.waitForTimeout(600);
  expect(await counter(), 'no frames run after dispose').toBe(stopped);
  expect(await page.evaluate(() => window.__hopwayTest)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('every new best reaches the shell at once, even when the game is paused straight after', async ({page}) => {
  const errors = await openGame(page);
  // Two quick hops (the second buffered during the first), their landing, and the pause all happen in one synchronous task,
  // so no animation frame can run in between: whatever the shell shows afterwards was reported at once, not later.
  await page.evaluate(() => {
    const test = window.__hopwayTest!;
    test.hop('up');
    test.hop('up');
    test.advance(0.3);
    document.querySelector<HTMLButtonElement>('#pause-game')!.click();
  });
  expect((await state(page)).maxRow).toBe(2);
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Resume game');
  await expect(page.locator('#game-score strong')).toHaveText('2');
  await expect(page.locator('#game-best strong')).toHaveText('2');
  expect(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:hopway'))).toBe('2');
  expect(errors).toEqual([]);
});

/** A run saved by pausing (two hops in, on the start seed), then the page reloaded: the game restores it behind Continue. */
async function reloadWithSavedRun(page: Page): Promise<string[]> {
  const errors = await openGame(page);
  await hop(page, 'ArrowUp');
  await hop(page, 'ArrowUp');
  await page.locator('#pause-game').click(); // pausing saves the run
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label', 'Resume game');
  await page.reload();
  await page.waitForFunction(() => window.__hopwayTest !== undefined);
  await hook(page).freeze(true);
  await expect(page.locator('.hw-continue')).toBeVisible();
  return errors;
}

test('a paused run is saved and comes back behind Continue after a reload', async ({page}) => {
  const errors = await reloadWithSavedRun(page);
  const root = page.locator('.hopway');
  await expect(page.locator('.hw-continue-row')).toHaveText('2');
  await expect(root).toHaveAttribute('data-held', 'true');
  expect(await state(page)).toMatchObject({seed: SEED, row: 2, score: 2, phase: 'running'});
  await page.getByRole('button', {name: 'Continue', exact: true}).click();
  await expect(root).toHaveAttribute('data-held', 'false');
  await expect(page.locator('.hw-layer')).toBeHidden();
  expect(await state(page), 'Continue carries on from the same place without hopping').toMatchObject({row: 2, score: 2, hopping: false});
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 3, score: 3});
  expect(errors).toEqual([]);
});

// The shell calls stage.focus() right after restore(); the restored card has to take keyboard focus back (fixed in 24ae183,
// which this test caught), or Enter and Space would do nothing.
test('the restored Continue card takes keyboard focus, so Enter continues', async ({page}) => {
  const errors = await reloadWithSavedRun(page);
  await expect(page.getByRole('button', {name: 'Continue', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.hopway')).toHaveAttribute('data-held', 'false');
  expect(errors).toEqual([]);
});

// Evidence screenshots: the same seed (a road and a river inside its first 12 rows), three hops in, hint gone, no card.
async function playfieldShot(page: Page, name: string, viewport?: {width: number; height: number}): Promise<void> {
  const errors = await openGame(page, {viewport});
  const seed = await useRoadAndRiverSeed(page);
  for (let i = 0; i < 3; i++) await hop(page, 'ArrowUp');
  expect(await state(page), `seed ${seed}`).toMatchObject({seed, row: 3, phase: 'running', alive: true});
  await expect(page.locator('.hw-hint')).toHaveCSS('opacity', '0');
  await expect(page.locator('.hw-layer')).toBeHidden();
  await frames(page, 12); // the camera follows on real time
  await shot(page, name);
  expect(errors).toEqual([]);
}
test('screenshot at the default viewport', async ({page}) => {
  await playfieldShot(page, 'chromium');
});
test('screenshot at a 390x844 phone', async ({page}) => {
  await playfieldShot(page, 'phone-390x844', {width: 390, height: 844});
});
test('screenshot at a 1366x768 Chromebook', async ({page}) => {
  await playfieldShot(page, 'chromebook-1366x768', {width: 1366, height: 768});
});

test('1366x768 stays within the draw-call budget after three seconds of real time', async ({page}) => {
  test.setTimeout(60000);
  const errors = await openGame(page, {viewport: {width: 1366, height: 768}});
  await useRoadAndRiverSeed(page);
  for (let i = 0; i < 3; i++) await hop(page, 'ArrowUp');
  await hook(page).freeze(false);
  await page.waitForTimeout(3000);
  const stats = await hook(page).stats();
  console.log('HOPWAY_STATS', JSON.stringify(stats));
  expect(stats.calls, 'draw calls in the last frame').toBeLessThanOrEqual(120);
  expect(stats.looping).toBe(true);
  expect(errors).toEqual([]);
});

test('at 366x700 the page does not scroll horizontally', async ({page}) => {
  const errors = await openGame(page, {viewport: {width: 366, height: 700}});
  const width = () => page.evaluate(() => ({scroll: document.documentElement.scrollWidth, inner: window.innerWidth}));
  let measured = await width();
  expect(measured.scroll, 'scrollWidth against innerWidth while playing').toBeLessThanOrEqual(measured.inner);
  // The Game Over card fits as well.
  await carDeath(page);
  await showCard(page);
  await expectDeathCard(page, 'car', 'Hit by a car');
  measured = await width();
  expect(measured.scroll, 'scrollWidth against innerWidth with the card').toBeLessThanOrEqual(measured.inner);
  const card = (await page.locator('.hw-over').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(366);
  expect(errors).toEqual([]);
});
