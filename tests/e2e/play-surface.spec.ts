import {mkdirSync} from 'node:fs';
import {devices} from '@playwright/test';
import {test, expect, seedStudyTopic} from '../fixtures';
import {GAME_IDS} from '../../src/core/types';
import {PLAYING_VIEWPORT, READING_VIEWPORT} from '../../src/core/play-surface';

const meta = (page: import('@playwright/test').Page) => page.locator('meta[name="viewport"]').getAttribute('content');
const shots = process.env.PLAY_SURFACE_SHOTS;

test('a game fills the visual viewport, locks gestures, and reading zoom comes back', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  await expect(page.locator('.game-card').first()).toBeVisible();
  expect(await meta(page)).toBe(READING_VIEWPORT);
  await expect(page.locator('html')).not.toHaveClass(/play-locked/);

  await page.goto('/#/game/snake');
  await expect(page.locator('.snake, .sn-game, #game-stage canvas, #game-stage button').first()).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/play-locked/);
  expect(await meta(page)).toBe(PLAYING_VIEWPORT);
  await expect(page.locator('html')).toHaveCSS('touch-action', 'manipulation');

  const boxOf = () => page.evaluate(() => {
    const vv = window.visualViewport;
    const view = document.querySelector('.game-view')!.getBoundingClientRect();
    const root = getComputedStyle(document.documentElement);
    return {
      playWidth: root.getPropertyValue('--play-width').trim(),
      playHeight: root.getPropertyValue('--play-height').trim(),
      playTop: root.getPropertyValue('--play-top').trim(),
      playLeft: root.getPropertyValue('--play-left').trim(),
      vv: {width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight, top: vv?.offsetTop ?? 0, left: vv?.offsetLeft ?? 0},
      view: {x: view.x, y: view.y, width: view.width, height: view.height},
      scroll: {x: scrollX, y: scrollY, height: document.documentElement.scrollHeight},
    };
  });
  await expect.poll(boxOf).toMatchObject({
    playWidth: '390px', playHeight: '844px', playTop: '0px', playLeft: '0px',
    view: {x: 0, y: 0, width: 390, height: 844},
    scroll: {x: 0, y: 0, height: 844},
  });

  await page.setViewportSize({width: 844, height: 390});
  await expect.poll(boxOf).toMatchObject({
    playWidth: '844px', playHeight: '390px',
    view: {x: 0, y: 0, width: 844, height: 390},
    scroll: {height: 390},
  });

  await page.getByRole('link', {name: 'Back to game library', exact: true}).click();
  await expect(page.locator('.game-card')).toHaveCount(GAME_IDS.length);
  expect(await meta(page)).toBe(READING_VIEWPORT);
  await expect(page.locator('html')).not.toHaveClass(/play-locked/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--play-width'))).toBe('');
});

test('Fullscreen API, the immersive fallback, and Escape still opens Study', async ({page}) => {
  await page.setViewportSize({width: 1366, height: 768});
  await page.goto('/#/game/tower');
  const button = page.getByRole('button', {name: 'Enter full screen', exact: true});
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('button', {name: 'Exit full screen', exact: true})).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.getByRole('button', {name: 'Open menu', exact: true}).click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/play-locked/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await meta(page)).toBe(READING_VIEWPORT);
});

test('a rejected Fullscreen API falls back without taking over Escape', async ({page}) => {
  // The init script runs before <html> exists, so the stub has to live on the prototype.
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('not allowed'));
  });
  await page.goto('/#/game/flappy-bird');
  await page.getByRole('button', {name: 'Enter full screen', exact: true}).click();
  const button = page.getByRole('button', {name: 'Exit full screen', exact: true});
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('title', 'This browser keeps its own controls. The game fills the screen.');
  await expect(page.locator('html')).toHaveClass(/play-immersive/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/play-immersive|play-locked/);
});

test('pinch is cancelled, a control and an overflowing board still receive a single finger', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/#/game/snake');
  await expect(page.locator('.snake-canvas')).toBeVisible();
  const blocked = await page.evaluate(() => {
    const touch = (target: Element, count: number) => {
      const touches = Array.from({length: count}, (_, id) => new Touch({identifier: id, target, clientX: 30 + id * 40, clientY: 80}));
      const event = new TouchEvent('touchmove', {bubbles: true, cancelable: true, touches});
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const canvas = document.querySelector('.snake-canvas')!;
    const button = document.querySelector('#pause-game')!;
    return {pinch: touch(canvas, 2), canvas: touch(canvas, 1), button: touch(button, 1)};
  });
  expect(blocked).toEqual({pinch: true, canvas: true, button: false});

  await page.goto('/#/game/minesweeper');
  await expect(page.locator('.ms-tile').first()).toBeVisible();

  await page.getByLabel('Difficulty', {exact: true}).selectOption('expert');
  await page.getByLabel('Cell size', {exact: true}).selectOption('54');
  await expect.poll(() => page.locator('.ms-scroll').evaluate(element => element.scrollWidth > element.clientWidth + 1)).toBe(true);
  const board = await page.evaluate(() => {
    const scroller = document.querySelector('.ms-scroll')!;
    const touches = [new Touch({identifier: 1, target: scroller, clientX: 40, clientY: 200})];
    const event = new TouchEvent('touchmove', {bubbles: true, cancelable: true, touches});
    scroller.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(board).toBe(false);
});

test('phone and desktop shots of every game', async ({browser}) => {
  test.skip(!shots, 'Set PLAY_SURFACE_SHOTS to capture viewport evidence.');
  test.setTimeout(300000);
  mkdirSync(shots!, {recursive: true});
  const setups = [
    ['phone', devices['Pixel 5']] as const,
    ['desktop', {viewport: {width: 1366, height: 768}}] as const,
  ];
  for (const [name, options] of setups) {
    const context = await browser.newContext(options);
    await seedStudyTopic(context);
    const page = await context.newPage();
    for (const id of GAME_IDS) {
      await page.goto(`/#/game/${id}`);
      await expect(page.locator('#game-stage > *').first()).toBeVisible({timeout: 30000});
      await expect(page.locator('.loading')).toHaveCount(0);
      await page.screenshot({path: `${shots}/${name}-${id}.png`});
    }
    await page.goto('/#/game/tower');
    await page.getByRole('button', {name: 'Enter full screen', exact: true}).click();
    await expect(page.locator('#fullscreen-game')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({path: `${shots}/${name}-tower-fullscreen.png`});
    await context.close();
  }
});
