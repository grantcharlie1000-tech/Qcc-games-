import {test, expect} from '../../fixtures';
import type {Page} from '@playwright/test';
import {COUNTRIES} from '../../../src/games/globle/countries';

// CI and this container render WebGL in software (SwiftShader), so allow generous time.
test.describe.configure({timeout: 120000});
const url = '/#/game/globle';
const KEY = 'pocket-arcade:v1:save:globle';
const input = (page: Page) => page.getByRole('textbox', {name: 'Country name'});
const globe = (page: Page) => page.locator('.gl-globe');
const count = (page: Page) => page.locator('.globle').getAttribute('data-guesses');

async function open(page: Page) {
  await page.goto(url);
  await expect(page.locator('.gl-globe canvas')).toBeVisible({timeout: 20000});
  await expect(globe(page)).toHaveAttribute('data-land', 'ready', {timeout: 30000});
  await expect(globe(page)).toHaveAttribute('data-rendering', 'false', {timeout: 15000});
}
async function guess(page: Page, text: string, submit: 'enter' | 'button' = 'enter') {
  await input(page).fill(text);
  if (submit === 'enter') await input(page).press('Enter');
  else await page.getByRole('button', {name: 'Guess', exact: true}).click();
}
/** Starts a practice round with a known answer through the real save/restore path. */
async function practice(page: Page, answer: string) {
  await open(page);
  await page.getByRole('button', {name: 'Practice', exact: true}).click();
  await page.getByRole('link', {name: 'Back to game library'}).click();
  await expect(page.locator('.game-card').first()).toBeVisible();
  await page.evaluate(([key, answer]) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.data.mode = 'practice';
    saved.data.practice = {mode: 'practice', answer, guesses: [], won: false};
    localStorage.setItem(key, JSON.stringify(saved));
  }, [KEY, answer]);
  await open(page);
  await expect(page.locator('.globle')).toHaveAttribute('data-mode', 'practice');
}
const view = async (page: Page) => {
  await expect(globe(page)).toHaveAttribute('data-rendering', 'false', {timeout: 30000});
  const g = globe(page);
  return {lat: Number(await g.getAttribute('data-lat')), lng: Number(await g.getAttribute('data-lng')), altitude: Number(await g.getAttribute('data-altitude'))};
};
const documentScroll = (page: Page) => page.evaluate(() => ({x: scrollX, y: scrollY, height: document.documentElement.scrollHeight, view: innerHeight}));

test('spelling corrections submit a guess on click and keyboard activation', async ({page}) => {
  await practice(page, 'FRA');
  await guess(page, 'Germny');
  const correction = page.getByRole('button', {name: 'Germany', exact: true});
  await expect(correction).toBeVisible();
  expect(await count(page)).toBe('0');
  await correction.click();
  await expect(page.locator('.gl-guess[data-id=DEU]')).toBeVisible();
  expect(await count(page)).toBe('1');
  await expect(input(page)).toHaveValue('');
  await expect(input(page)).toBeFocused();

  await guess(page, 'Germny');
  await correction.click();
  await expect(page.locator('.gl-message')).toContainText('already guessed Germany');
  expect(await count(page)).toBe('1');

  await guess(page, 'Frnace');
  const winner = page.getByRole('button', {name: 'France', exact: true});
  await winner.focus();
  await winner.press('Enter');
  await expect(page.locator('.globle')).toHaveAttribute('data-won', 'true');
  await expect(page.locator('.gl-win-text')).toContainText('2 guesses');
  await page.reload();
  await expect(page.locator('.gl-guess[data-id=DEU]')).toBeVisible();
  await expect(page.locator('.globle')).toHaveAttribute('data-won', 'true');
});

test('complete winning round with neighbours, aliases, duplicates and invalid entries', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await practice(page, 'FRA');

  await guess(page, 'Spain');
  await expect(page.locator('.gl-message')).toContainText('shares a border');
  await expect(page.locator('.gl-guess[data-id=ESP]')).toHaveAttribute('data-band', 'neighbour');
  await expect(page.locator('.gl-guess[data-id=ESP] .gl-km')).toHaveText('0 km');
  expect(await count(page)).toBe('1');

  await guess(page, 'BELGIUM', 'button'); // a second 0 km neighbour, still wrong
  await expect(page.locator('.gl-guess[data-id=BEL]')).toHaveAttribute('data-band', 'neighbour');
  await expect(page.locator('.globle')).toHaveAttribute('data-won', 'false');

  await guess(page, 'uk');
  await expect(page.locator('.gl-guess[data-id=GBR] .gl-name')).toHaveText('United Kingdom');
  const ukKm = await page.locator('.gl-guess[data-id=GBR] .gl-km').textContent();
  expect(Number(ukKm!.replace(/\D/g, ''))).toBeGreaterThan(20);
  await guess(page, 'usa');
  await expect(page.locator('.gl-guess[data-id=USA] .gl-name')).toHaveText('United States');
  await guess(page, 'cote d’IVOIRE');
  await expect(page.locator('.gl-guess[data-id=CIV]')).toBeVisible();
  expect(await count(page)).toBe('5');

  for (const [typed, text] of [['Great Britain', 'already guessed United Kingdom'], ['Atlantis', 'isn’t a country'], ['Germny', 'Did you mean Germany?'],
    ['Congo', 'two Congos'], ['England', 'part of the United Kingdom'], ['   ', 'Type a country name']] as const) {
    await guess(page, typed);
    await expect(page.locator('.gl-message')).toContainText(text);
    await expect(page.locator('.gl-message')).toHaveAttribute('data-tone', 'error');
  }
  expect(await count(page)).toBe('5');
  await expect(page.locator('.gl-guess')).toHaveCount(5);

  // Colours: far guesses pale, neighbours dark red; list is closest first.
  const colour = (id: string) => page.locator(`.gl-guess[data-id=${id}] .gl-swatch`).evaluate(e => getComputedStyle(e).backgroundColor);
  expect(await colour('ESP')).toBe('rgb(107, 10, 16)');
  const usa = (await colour('USA')).match(/\d+/g)!.map(Number);
  expect(usa[1] + usa[2]).toBeGreaterThan(300); // pale cream/orange, far from France
  await expect(page.locator('.gl-guess').first()).toHaveAttribute('data-band', 'neighbour');

  await guess(page, 'France');
  await expect(page.locator('.globle')).toHaveAttribute('data-won', 'true');
  await expect(page.locator('.gl-win')).toBeVisible();
  await expect(page.locator('.gl-win-text')).toContainText('France');
  await expect(page.locator('.gl-win-text')).toContainText('6 guesses');
  await expect(page.locator('.gl-guess').first()).toHaveAttribute('data-id', 'FRA');
  expect(await colour('FRA')).toBe('rgb(47, 168, 79)');
  await expect(input(page)).toBeDisabled();
  await page.locator('.gl-more summary').click();
  await expect(page.locator('.gl-stats')).toContainText('Practice best6');
  await page.screenshot({path: 'tests/games/globle/evidence/chromium.png'});

  await page.getByRole('button', {name: 'Play again'}).click();
  await expect(page.locator('.globle')).toHaveAttribute('data-guesses', '0');
  await expect(page.locator('.globle')).toHaveAttribute('data-won', 'false');
  await expect(input(page)).toBeEnabled();
  expect(errors).toEqual([]);
});

test('tiny countries, markers and saved-game restoration across reloads and modes', async ({page}) => {
  await practice(page, 'BRA');
  for (const name of ['Vatican City', 'monaco', 'Nauru', 'Tuvalu', 'Singapore', 'São Tomé and Príncipe']) await guess(page, name);
  await expect(page.locator('.gl-guess')).toHaveCount(6);
  await expect(globe(page)).toHaveAttribute('data-markers', '6'); // each is too small to see unaided
  for (const id of ['VAT', 'MCO', 'NRU', 'TUV', 'SGP', 'STP']) await expect(page.locator(`.gl-guess[data-id=${id}]`)).toBeVisible();

  // Daily progress is separate; switch, guess, then reload the page.
  await page.getByRole('button', {name: 'Daily', exact: true}).click();
  await expect(page.locator('.globle')).toHaveAttribute('data-mode', 'daily');
  const dailyAnswer = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).data.daily.answer, KEY);
  const first = dailyAnswer === 'NZL' ? 'Australia' : 'New Zealand';
  await guess(page, first);
  await expect(page.locator('.globle')).toHaveAttribute('data-guesses', '1');
  await page.reload();
  await expect(page.locator('.gl-globe canvas')).toBeVisible({timeout: 20000});
  await expect(page.locator('.globle')).toHaveAttribute('data-mode', 'daily');
  await expect(page.locator('.gl-guess')).toHaveCount(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).data.daily.answer, KEY)).toBe(dailyAnswer);
  await page.getByRole('button', {name: 'Practice', exact: true}).click();
  await expect(page.locator('.gl-guess')).toHaveCount(6);
  // Malformed saves are ignored without breaking the game.
  await page.getByRole('link', {name: 'Back to game library'}).click();
  await expect(page.locator('.game-card').first()).toBeVisible(); // the shell has saved on leaving
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({version: 1, data: {version: 1, mode: 'practice', practice: {answer: 'NOPE'}}})), KEY);
  await open(page);
  await expect(page.locator('.globle')).toHaveAttribute('data-guesses', '0');
  await guess(page, 'Chile');
  await expect(page.locator('.globle')).toHaveAttribute('data-guesses', '1');
});

test('mouse drag, wheel zoom and fly-to with no hover reveal or document scroll', async ({page}) => {
  await page.setViewportSize({width: 1366, height: 768});
  await practice(page, 'JPN');
  await guess(page, 'Argentina');
  const afterFly = await view(page);
  expect(afterFly.lat).toBeLessThan(-20); // the view travelled to the guess
  const box = (await globe(page).boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // Hover and click unguessed land: no tooltip, no name, no guess.
  await page.mouse.move(cx, cy); await page.mouse.move(cx + 30, cy + 20);
  await page.mouse.click(cx + 40, cy - 40);
  expect(await page.locator('.globle').getAttribute('data-guesses')).toBe('1');
  const visibleText = await page.locator('.gl-globe-wrap').innerText();
  expect(visibleText).not.toMatch(/Chile|Brazil|Bolivia|Uruguay|Paraguay/);
  // Start a drag immediately after a new guess: manual control interrupts the flight.
  await guess(page, 'Germany');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 150, cy, {steps: 8});
  await page.mouse.up();
  const dragged = await view(page);
  expect(Math.abs(dragged.lat - 51)).toBeGreaterThan(5); // never reached Germany's framing
  const before = dragged;
  await page.mouse.move(cx, cy);
  await page.mouse.down(); await page.mouse.move(cx + 200, cy + 60, {steps: 10}); await page.mouse.up();
  const moved = await view(page);
  expect(Math.abs(moved.lng - before.lng) + Math.abs(moved.lat - before.lat)).toBeGreaterThan(10);
  await page.mouse.wheel(0, -600);
  const zoomed = await view(page);
  expect(zoomed.altitude).toBeLessThan(moved.altitude);
  expect(await documentScroll(page)).toMatchObject({x: 0, y: 0});
  // Keyboard: arrows spin the focused globe.
  await globe(page).focus();
  await page.keyboard.press('ArrowRight');
  const keyed = await view(page);
  expect(keyed.lng).not.toBeCloseTo(zoomed.lng, 0);
});

test('touch drag and pinch move the globe, list scrolls inside its own area', async ({page, context, browserName}) => {
  test.skip(browserName !== 'chromium', 'Native CDP touch is specific to Chromium.');
  await page.setViewportSize({width: 390, height: 844});
  await practice(page, 'MNG');
  for (const name of ['Peru', 'Chile', 'Mexico', 'Canada', 'Egypt', 'Kenya', 'India', 'Japan', 'Norway', 'Italy', 'Ghana', 'Fiji']) await guess(page, name);
  const settled = await view(page);
  const box = (await globe(page).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - i * 18, y: y + i * 4}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  const swiped = await view(page);
  expect(Math.abs(swiped.lng - settled.lng)).toBeGreaterThan(3);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x - 20, y, id: 1}, {x: x + 20, y, id: 2}]});
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 20 - i * 12, y, id: 1}, {x: x + 20 + i * 12, y, id: 2}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  const pinched = await view(page);
  expect(pinched.altitude).toBeLessThan(swiped.altitude);
  expect(await page.locator('.globle').getAttribute('data-guesses')).toBe('12'); // taps never guess
  expect(await documentScroll(page)).toMatchObject({x: 0, y: 0, height: 844});

  const list = page.locator('.gl-history');
  const metrics = await list.evaluate(e => ({scroll: e.scrollHeight, client: e.clientHeight}));
  expect(metrics.scroll).toBeGreaterThan(metrics.client);
  const lb = (await list.boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => list.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(await documentScroll(page)).toMatchObject({x: 0, y: 0, height: 844});
  await page.screenshot({path: 'tests/games/globle/evidence/touch-390.png'});
});

for (const size of [{width: 390, height: 844}, {width: 844, height: 390}, {width: 1366, height: 768}, {width: 320, height: 568}]) {
  test(`fills ${size.width}×${size.height} and keeps the input visible when a keyboard opens`, async ({page}) => {
    await page.setViewportSize(size);
    await open(page);
    const root = (await page.locator('.globle').boundingBox())!;
    expect(root.y + root.height).toBeLessThanOrEqual(size.height + 1);
    const g = (await globe(page).boundingBox())!;
    expect(g.width).toBeGreaterThan(Math.min(size.width, size.height) * 0.45);
    expect(g.height).toBeGreaterThan(120);
    await input(page).focus();
    // A touchscreen keyboard shrinks the visual viewport; emulate it by shrinking the window.
    await page.setViewportSize({width: size.width, height: Math.round(size.height * 0.55)});
    const field = (await input(page).boundingBox())!;
    expect(field.y).toBeGreaterThanOrEqual(0);
    expect(field.y + field.height).toBeLessThanOrEqual(Math.round(size.height * 0.55));
    await expect(input(page)).toBeFocused();
    expect(await documentScroll(page)).toMatchObject({x: 0, y: 0});
    await page.setViewportSize(size);
    await page.screenshot({path: `tests/games/globle/evidence/layout-${size.width}x${size.height}.png`});
  });
}

test('Escape opens Study, pause stops rendering, leaving frees the WebGL canvas', async ({page}) => {
  await open(page);
  await input(page).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await page.getByRole('link', {name: 'Games', exact: true}).click();
  await expect(page.locator('#study-view')).toBeHidden();
  await expect(page.locator('.gl-globe canvas')).toBeVisible();
  await guess(page, 'Kenya');
  await page.getByRole('button', {name: 'Pause game', exact: true}).click();
  await expect(globe(page)).toHaveAttribute('data-rendering', 'false');
  await page.getByRole('button', {name: 'Resume game', exact: true}).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('link', {name: 'Back to game library'}).click();
    await expect(page.locator('.game-card').first()).toBeVisible();
    expect(await page.locator('canvas').count()).toBe(0);
    await page.goto(url);
    await expect(page.locator('.gl-globe canvas')).toHaveCount(1, {timeout: 20000});
  }
  await expect(page.locator('.gl-guess[data-id=KEN]')).toBeVisible();
});

test('a stale second tab cannot overwrite a daily win made in another tab', async ({page, context}) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  await expect.poll(() => other.evaluate(key => localStorage.getItem(key), KEY), {timeout: 10000}).not.toBeNull();
  const answer = await other.evaluate(key => JSON.parse(localStorage.getItem(key)!).data.daily.answer as string, KEY);
  await guess(other, COUNTRIES.find(c => c.id === answer)!.name);
  await expect(other.locator('.globle')).toHaveAttribute('data-won', 'true');
  // The first tab still shows its old state, then autosaves (every 5 s) — it must adopt the win instead.
  await expect(page.locator('.globle')).toHaveAttribute('data-won', 'true', {timeout: 10000});
  await page.waitForTimeout(5500);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).data, KEY);
  expect(saved.daily.won).toBe(true);
  expect(saved.stats.daily.wins).toBe(1);
  await other.close();
});
