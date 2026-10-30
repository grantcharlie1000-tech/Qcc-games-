import {test,expect} from '../fixtures';
import type {Page} from '../fixtures';

// The tab title stays the same on every route, so a glance at the tab shows no game or film name.
// Provider origins are routed to fixture pages, so a play route never contacts a real provider.
const PROVIDER_PAGE='<!doctype html><title>Provider fixture</title><button>Play stream</button>';
const FRAMEXTV_READY="<script>parent.postMessage({event:'frameXTV:ready'},'*')</script>";

test.beforeEach(async({page})=>{
  await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE+FRAMEXTV_READY}));
  for(const url of ['https://framextv.xyz/**','https://vidlink.pro/**','https://vixsrc.to/**','https://vidsrc.to/**'])
    await page.route(url,route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
});

// Each route is shown, and only then is the title read. A title that changed while the route rendered would be seen here.
async function expectTitle(page:Page,recorded:string){
  expect(await page.title()).toBe(recorded);
}

test('the document title is the same on every route, Study included',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.game-card').first()).toBeVisible();
  const recorded=await page.title();
  expect(recorded).not.toBe('');

  await page.goto('/#/collection');
  await expect(page.locator('.game-grid')).toBeVisible();
  await expectTitle(page,recorded);

  await page.goto('/#/movies');
  await expect(page.locator('.movies-view')).toBeVisible();
  await expectTitle(page,recorded);

  await page.goto('/#/movies/browse/movie');
  await expect(page.locator('.movies-view')).toBeVisible();
  await expectTitle(page,recorded);

  await page.goto('/#/movies/movie-157336');
  await expect(page.locator('#content h1').first()).toContainText('Interstellar');
  await expectTitle(page,recorded);

  await page.goto('/#/movies/movie-157336/play');
  await expect(page.locator('iframe.movies-provider-frame')).toBeAttached();
  await expectTitle(page,recorded);

  // Escape opens Study from the watch page, where the island is hidden.
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expectTitle(page,recorded);
});
