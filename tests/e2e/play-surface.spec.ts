import {appSettings,backToGames,gameAction,gameOption,openGameMenu} from '../game-menu';
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

  await backToGames(page);
  await expect(page.locator('.game-card')).toHaveCount(GAME_IDS.length);
  expect(await meta(page)).toBe(READING_VIEWPORT);
  await expect(page.locator('html')).not.toHaveClass(/play-locked/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--play-width'))).toBe('');
});

test('Fullscreen API, the immersive fallback, and Escape still opens Study', async ({page}) => {
  await page.setViewportSize({width: 1366, height: 768});
  await page.goto('/#/game/tower');
  await gameAction(page,'Enter full screen');
  await expect(page.locator('#fullscreen-game')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await appSettings(page);
  await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).not.toBeVisible();
  await expect(page.locator('#study-view')).toBeHidden();
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
  await gameAction(page,'Enter full screen');
  const button = page.locator('#fullscreen-game');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('title', 'This browser keeps its own controls. The game fills the screen.');
  await expect(page.locator('html')).toHaveClass(/play-immersive/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/play-immersive|play-locked/);
});

test('a fullscreen request that finishes after leaving does not capture the library', async ({page}) => {
  await page.addInitScript(() => {
    let active = false;
    const define = (key: string, get: () => unknown) => Object.defineProperty(Document.prototype, key, {configurable: true, get});
    define('fullscreenEnabled', () => true);
    define('fullscreenElement', () => active ? document.documentElement : null);
    Element.prototype.requestFullscreen = () => new Promise(resolve => {
      (window as unknown as {__finishFullscreen?:()=>void}).__finishFullscreen = () => {active = true; resolve();};
    });
    Document.prototype.exitFullscreen = () => {active = false; return Promise.resolve();};
  });
  await page.goto('/#/game/tower');
  await gameAction(page,'Enter full screen');
  await backToGames(page);
  await expect(page.locator('.game-card').first()).toBeVisible();
  await page.evaluate(() => (window as unknown as {__finishFullscreen:()=>void}).__finishFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.locator('html')).not.toHaveClass(/play-immersive|play-locked/);
});

test('dock and menu controls stay clear of game information on a short scene', async ({page}) => {
 await page.setViewportSize({width:844,height:390});
 for(const id of ['animal-stack','color-blocks','water-sort']){
  await page.goto(`/#/game/${id}`);await expect(page.locator('.game-hud strong,.game-compact-hud').filter({visible:true}).first()).toBeVisible();
  for(const [button,metric] of [['#game-menu','.game-hud'],['#fullscreen-game','#game-best']]){
   if(button==='#fullscreen-game')await openGameMenu(page);
   const control=page.locator(button);await control.scrollIntoViewIfNeeded();
   const a=(await control.boundingBox())!,b=(await page.locator(metric).boundingBox())!;
   expect(a.x,id).toBeGreaterThanOrEqual(0);expect(a.x+a.width,id).toBeLessThanOrEqual(844);
   expect(a.y+a.height,id).toBeLessThanOrEqual(390);
   expect(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height,id).toBe(false);
  }
 }
});

test('pinch is cancelled, a control and an overflowing board still receive a single finger', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'Synthetic Touch and TouchEvent constructors are available in Chromium.');
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

  await gameOption(page,'Difficulty','expert');
  await gameAction(page,'Game options');
  await page.getByRole('button', {name:'Zoom in',exact:true}).click();await page.getByRole('button', {name:'Zoom in',exact:true}).click();
  await page.getByRole('button', {name:'Close game options',exact:true}).click();
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
    await gameAction(page,'Enter full screen');
    await expect(page.locator('#fullscreen-game')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({path: `${shots}/${name}-tower-fullscreen.png`});
    await context.close();
  }
});
