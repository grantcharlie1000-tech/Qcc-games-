import {test, expect} from '../../fixtures';
import {advance, canvasCenter, force, grass, hop, openGame, state, swipe} from './helpers';

// Movement through real input. The simulation is frozen (helpers.openGame), so a hop only lands when the test advances time:
// a hop takes 0.12 s, so advance(0.2) lands it. Rows 0-4 of every seed are safe grass with columns 2-6 open, and the player
// starts at row 0, column 4, so nothing here depends on the seed beyond that.

test('W and ArrowUp hop forward, one row each', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'w');
  expect(await state(page)).toMatchObject({row: 1, col: 4, phase: 'running', hopping: false});
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 2, col: 4, hopping: false});
  expect(errors).toEqual([]);
});

test('S and ArrowDown hop back, one row each', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'ArrowUp');
  await hop(page, 'ArrowUp');
  expect((await state(page)).row).toBe(2);
  await hop(page, 's');
  expect(await state(page)).toMatchObject({row: 1, col: 4, alive: true});
  await hop(page, 'ArrowDown');
  expect(await state(page)).toMatchObject({row: 0, col: 4, alive: true});
  expect(errors).toEqual([]);
});

test('A and ArrowLeft hop one column left', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'a');
  expect(await state(page)).toMatchObject({row: 0, col: 3});
  await hop(page, 'ArrowLeft');
  expect(await state(page)).toMatchObject({row: 0, col: 2});
  expect(errors).toEqual([]);
});

test('D and ArrowRight hop one column right', async ({page}) => {
  const errors = await openGame(page);
  await hop(page, 'd');
  expect(await state(page)).toMatchObject({row: 0, col: 5});
  await hop(page, 'ArrowRight');
  expect(await state(page)).toMatchObject({row: 0, col: 6});
  expect(errors).toEqual([]);
});

test('a mouse click at the canvas centre hops forward', async ({page}) => {
  const errors = await openGame(page);
  const {x, y} = await canvasCenter(page);
  await page.mouse.click(x, y);
  await advance(page, 0.2);
  expect(await state(page)).toMatchObject({row: 1, col: 4, phase: 'running'});
  expect(errors).toEqual([]);
});

test.describe('touch', () => {
  test.use({hasTouch: true});

  test('a touch tap on the canvas hops forward', async ({page}) => {
    const errors = await openGame(page);
    const {x, y} = await canvasCenter(page);
    await page.touchscreen.tap(x, y);
    await advance(page, 0.2);
    expect(await state(page)).toMatchObject({row: 1, col: 4, phase: 'running'});
    expect(errors).toEqual([]);
  });

  test('a native touch swipe left hops left', async ({page, browserName}) => {
    test.skip(browserName !== 'chromium', 'CDP native touch uses Chromium.');
    const errors = await openGame(page);
    const {x, y} = await canvasCenter(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    for (const step of [15, 30, 45, 60]) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - step, y}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await advance(page, 0.2);
    expect(await state(page)).toMatchObject({row: 0, col: 3, phase: 'running'});
    expect(errors).toEqual([]);
  });
});

// A swipe is decided on release from the travel since the press (src/games/crossy-road/input.ts): at least 24 px, one axis at least
// 1.5 times the other. A tap and an ambiguous diagonal hop forward. `from` is how many forward hops come first, so that a
// swipe down has a row to hop back to.
const swipes = [
  {name: '60 px up hops forward', from: 0, dx: 0, dy: -60, row: 1, col: 4},
  {name: '60 px down hops back', from: 1, dx: 0, dy: 60, row: 0, col: 4},
  {name: '60 px left hops left', from: 0, dx: -60, dy: 0, row: 0, col: 3},
  {name: '60 px right hops right', from: 0, dx: 60, dy: 0, row: 0, col: 5},
  {name: 'a 10 px drag is a tap and hops forward', from: 0, dx: 10, dy: 0, row: 1, col: 4},
  {name: 'a 40 by 30 diagonal is ambiguous and hops forward', from: 0, dx: 40, dy: 30, row: 1, col: 4},
];
for (const c of swipes) {
  test(`swipe: ${c.name}`, async ({page}) => {
    const errors = await openGame(page);
    for (let i = 0; i < c.from; i++) await hop(page, 'ArrowUp');
    await swipe(page, c.dx, c.dy);
    await advance(page, 0.2);
    expect(await state(page)).toMatchObject({row: c.row, col: c.col, alive: true});
    expect(errors).toEqual([]);
  });
}

test('a tree in front blocks the hop, and the run does not start', async ({page}) => {
  const errors = await openGame(page);
  await force(page, [grass(1, [4])]);
  await page.keyboard.press('ArrowUp');
  expect(await state(page)).toMatchObject({row: 0, hopping: false, queued: null});
  await advance(page, 0.5);
  expect(await state(page)).toMatchObject({row: 0, col: 4, phase: 'ready', started: false, alive: true});
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase', 'ready');
  expect(errors).toEqual([]);
});

test('trees beside the player block sideways hops', async ({page}) => {
  const errors = await openGame(page);
  await force(page, [grass(1, [3, 5])]);
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, col: 4, phase: 'running'});
  for (const key of ['ArrowLeft', 'a', 'ArrowRight', 'd']) {
    await page.keyboard.press(key);
    expect(await state(page), `${key} against a tree starts no hop`).toMatchObject({row: 1, col: 4, hopping: false, queued: null});
    await advance(page, 0.2);
    expect(await state(page), `${key} against a tree leaves the player where it was`).toMatchObject({row: 1, col: 4, alive: true});
  }
  expect(errors).toEqual([]);
});

test('the hedge behind the start blocks a hop back', async ({page}) => {
  const errors = await openGame(page);
  await page.keyboard.press('ArrowDown');
  await advance(page, 0.5);
  expect(await state(page)).toMatchObject({row: 0, col: 4, phase: 'ready', started: false, hopping: false});
  expect(errors).toEqual([]);
});

test('a held key hops once: auto-repeat is ignored', async ({page}) => {
  const errors = await openGame(page);
  await page.evaluate(() => {
    const repeats: boolean[] = [];
    (window as unknown as {keyRepeats: boolean[]}).keyRepeats = repeats;
    window.addEventListener('keydown', event => repeats.push(event.repeat), true);
  });
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowUp'); // the second keydown, with no keyup between, is an auto-repeat
  expect(await page.evaluate(() => (window as unknown as {keyRepeats: boolean[]}).keyRepeats)).toEqual([false, true]);
  expect(await state(page)).toMatchObject({hopping: true, queued: null});
  await page.keyboard.up('ArrowUp');
  await advance(page, 1);
  expect(await state(page)).toMatchObject({row: 1, hopping: false, queued: null});
  expect(errors).toEqual([]);
});

test('the input buffer keeps one extra hop and drops the rest', async ({page}) => {
  const errors = await openGame(page);
  await page.keyboard.press('ArrowUp'); // starts the hop
  await page.keyboard.press('ArrowUp'); // buffered
  await page.keyboard.press('ArrowUp'); // dropped: one is already waiting
  expect(await state(page)).toMatchObject({row: 1, hopping: true, queued: 'up'});
  await advance(page, 1);
  expect(await state(page)).toMatchObject({row: 2, hopping: false, queued: null});
  expect(errors).toEqual([]);
});

test('the score counts only a new furthest row', async ({page}) => {
  const errors = await openGame(page);
  const scores: number[] = [];
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
    await hop(page, key);
    scores.push((await state(page)).score);
  }
  expect(scores).toEqual([1, 2, 2, 2, 3]);
  expect(await state(page)).toMatchObject({row: 3, maxRow: 3, score: 3});
  // The shell's HUD follows: every new best is reported to it at once.
  await expect(page.locator('#game-score strong')).toHaveText('3');
  await expect(page.locator('#game-level')).toHaveText('Row 3');
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-score', '3');
  expect(errors).toEqual([]);
});
