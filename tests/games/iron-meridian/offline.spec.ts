import { test, expect } from '../../fixtures';
import { createNativeFixture, nativeWorkerSummary, observeNativeWorkers, queryNativeFixtureValue, selectNativeFixture, waitForNativeMap } from './native-fixture';

test('the downloaded native pack reopens offline and loads a reselected local base map', async ({ page, context }, info) => {
  test.skip(!process.env.IRON_MERIDIAN_BUILT, 'Set IRON_MERIDIAN_BUILT=1 and use a production preview URL.');
  test.setTimeout(90_000);
  const directory = await createNativeFixture(info, 'offline-base');
  await page.goto('/#/downloads');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Download Iron Meridian', exact: true }).click();
  await expect(page.locator('.dl-row[data-game="iron-meridian"] .dl-meta')).toHaveAttribute('data-state', 'ready', { timeout: 40_000 });
  const pack = await page.evaluate(async () => {
    const manifest = await (await fetch('offline/packs.json')).json() as { games: Record<string, { files: { path: string; sha256: string }[] }> };
    const game = manifest.games['iron-meridian'];
    if (!game) throw new Error('The native game is absent from the production pack.');
    const files = game.files;
    const cache = await caches.open('pocket-arcade-v3:files');
    const verified = await Promise.all(files.map(async file => (await cache.match(new URL(file.path, location.href)))?.headers.get('x-qcc-sha256') === file.sha256));
    return { paths: files.map(file => file.path), verified };
  });
  expect(pack.paths.some(path => path.includes('loader.worker'))).toBe(true);
  expect(pack.paths.some(path => /\.wasm$/.test(path))).toBe(true);
  expect(pack.verified.every(Boolean)).toBe(true);
  const url = new URL('/#/game/iron-meridian', page.url()).href;
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  await observeNativeWorkers(offline);
  await offline.goto(url);
  await expect(offline.locator('.im-native')).toHaveAttribute('data-state', 'empty');
  // The offline pack stores app/runtime assets; local game files must be reselected.
  await selectNativeFixture(offline, directory);
  const snapshotId = await waitForNativeMap(offline);
  expect(await queryNativeFixtureValue(offline)).toEqual({ type: 'number', value: 32 });
  expect((await nativeWorkerSummary(offline))[0]!.ready).toMatchObject({ snapshotId, provinceIds: [1, 2] });
  await offline.locator('.im-native-map').focus(); await offline.keyboard.press('Enter');
  await expect(offline.locator('.im-native-selection')).toHaveAttribute('data-province-id', '2');
  await expect(offline.locator('.game-error')).toHaveCount(0);
  await offline.screenshot({ path: info.outputPath('native-offline.png') });
});
