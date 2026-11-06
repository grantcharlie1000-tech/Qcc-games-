import {test,expect} from '../fixtures';

test('the homepage countdown links to the full Santa Tracker',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/collection');
  const banner=page.locator('.santa-banner');
  await expect(banner).toBeVisible();
  // It sits above the grid, not inside it as a card.
  expect(await banner.evaluate(el=>el.nextElementSibling?.classList.contains('game-grid'))).toBe(true);
  await expect(banner.locator('.santa-banner-time')).toHaveText(/^\d+d \d\dh \d\dm \d\ds$/);
  await banner.click();
  await expect(page).toHaveURL(/#\/santa$/);
  await expect(page.locator('#santa-title')).toHaveText('Santa leaves the North Pole in');
  await expect(page.locator('[data-unit="seconds"]')).toHaveText(/^\d\d$/);
  await expect(page.locator('.santa-chip')).toContainText('Estimated departure');
  await expect(page.locator('.santa-disclaimer')).toContainText('not NORAD’s tracker');
  expect(errors).toEqual([]);
});

test('the countdown follows the server clock, not a wrong device clock',async({page})=>{
  // The device thinks it is 2030; the server's Date header still drives the countdown.
  await page.clock.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  await page.goto('/#/santa');
  await expect(page.locator('.santa-clock')).toContainText('QCC’s server clock');
  await expect(page.locator('.santa-hero')).toHaveAttribute('data-phase','countdown');
  await expect(page.locator('.santa-clock')).toContainText('Your device clock is');
});

test('test mode reaches zero and switches to the simulated tracker without a reload',async({page})=>{
  await page.goto('/#/santa?test=3');
  await expect(page.locator('.santa-test')).toBeVisible();
  await expect(page.locator('.santa-hero')).toHaveAttribute('data-phase','countdown');
  await expect(page.locator('.santa-hero')).toHaveAttribute('data-phase','flying',{timeout:8000});
  await expect(page.locator('#santa-title')).toHaveText('Santa is on his way!');
  await expect(page.locator('.trk-now')).toContainText('left the North Pole');
  await expect(page.locator('.trk-note')).toContainText('not live tracking');
  // Test mode survives a refresh (sessionStorage) and can be cleared.
  await page.reload();
  await expect(page.locator('.santa-hero')).toHaveAttribute('data-phase','flying');
  await page.getByRole('button',{name:'Exit test mode'}).click();
  await expect(page.locator('.santa-hero')).toHaveAttribute('data-phase','countdown');
});

test('a malformed config keeps the built-in estimate',async({page})=>{
  await page.route('**/santa/departure.json',route=>route.fulfill({contentType:'application/json',body:'{"schema":1,"season":2026,"departureUtc":"24/12/2026"}'}));
  await page.goto('/#/santa');
  await expect(page.locator('[data-field="utc"]')).toHaveText(/10:00 UTC/);
  await expect(page.locator('[data-field="updated"]')).toContainText('Built-in estimate');
});
