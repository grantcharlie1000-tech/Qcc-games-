import { test, expect } from '../../fixtures';
import { createNativeFixture, nativeViewSave, nativeWorkerSummary, observeNativeWorkers, queryNativeFixtureValue, selectNativeFixture, waitForNativeMap } from './native-fixture';

test.setTimeout(60_000);

test('selected base files execute Lua in a module worker and render exact province hits, pan and fit', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await observeNativeWorkers(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  const directory = await createNativeFixture(info, 'native-base');
  await page.goto('/#/game/iron-meridian');
  await expect(page.getByRole('heading', { name: 'Load base files', exact: true })).toBeVisible();
  const wasmResponse = page.waitForResponse(response => /\/runtime(?:-[^/]+)?\.wasm(?:[?#]|$)/.test(response.url()) && response.ok());
  await selectNativeFixture(page, directory);
  const snapshotId = await waitForNativeMap(page);
  await wasmResponse;
  expect(await queryNativeFixtureValue(page)).toEqual({ type: 'number', value: 32 });
  const workers = await nativeWorkerSummary(page);
  expect(workers).toHaveLength(1);
  const worker = workers[0]!;
  expect(worker.type).toBe('module');
  expect(worker.url).toContain('loader.worker');
  expect(worker.ready).toMatchObject({ snapshotId, scope: 'base-loose-explicit', width: 128, height: 64, provinceIds: [1, 2], luaRuntime: { candidate: 'Lua 5.1.1' } });
  expect(worker.ready).toMatchObject({
    loaderBuildId: 'base-loose-explicit-v3',
    fileAccess: { model: 'captured-loose-base-v1', completedReads: 7, statCalls: 7, openReadCalls: 7, readBytesCalls: 7, closeCalls: 7, liveHandles: 0,
      streamConstructions: 7, readAllCalls: 7, streamDestructions: 7, vectorDestructions: 7 },
  });
  expect(worker.ready!.luaRuntime.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(worker.phases).toContain('lua'); expect(worker.phases).toContain('world');
  const canvas = page.locator('.im-native-map');
  expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 1024, height: 768 });
  await canvas.click({ position: { x: 256, y: 384 } });
  await expect(page.getByRole('region', { name: 'Selected province' })).toContainText('Province 1');
  await expect(page.locator('[data-field=state]')).toHaveText(/State 101.*BASE_LEFT/);
  await canvas.click({ position: { x: 768, y: 384 } });
  await expect(page.locator('.im-native-selection')).toHaveAttribute('data-province-id', '2');
  await expect(page.locator('[data-field=state]')).toHaveText(/State 102.*BASE_RIGHT/);
  await expect.poll(async () => (await nativeViewSave(page))?.camera).toEqual({ x: 64, y: 32, zoom: 1 });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await nativeViewSave(page))?.camera).toEqual({ x: 64, y: 32, zoom: 2 });
  await page.mouse.move(640, 384); await page.mouse.down();
  await page.mouse.move(560, 384, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await nativeViewSave(page))?.camera).toEqual({ x: 69, y: 32, zoom: 2 });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect.poll(async () => (await nativeViewSave(page))?.camera).toEqual({ x: 64, y: 32, zoom: 1 });
  await canvas.focus(); await canvas.press('Enter');
  await expect(page.locator('.im-native-selection')).toHaveAttribute('data-province-id', '2');
  await page.screenshot({ path: info.outputPath('native-base-map.png') });
  expect(errors).toEqual([]);
});

test('a Lua failure releases the worker and a new folder selection retries successfully', async ({ page }, info) => {
  await observeNativeWorkers(page);
  const invalid = await createNativeFixture(info, 'invalid-lua', { baseLua: 'error("Synthetic Lua failure.")' });
  const valid = await createNativeFixture(info, 'valid-retry');
  await page.goto('/#/game/iron-meridian');
  await selectNativeFixture(page, invalid);
  await expect(page.locator('.im-native')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('heading', { name: 'Files unavailable', exact: true })).toBeVisible();
  await expect(page.locator('.im-native-message')).toContainText('Synthetic Lua failure.');
  await expect(page.getByRole('button', { name: 'Choose folder', exact: true })).toBeVisible();
  expect((await nativeWorkerSummary(page))[0]!.terminated).toBe(true);
  await selectNativeFixture(page, valid);
  await waitForNativeMap(page);
  expect(await queryNativeFixtureValue(page)).toEqual({ type: 'number', value: 32 });
  expect((await nativeWorkerSummary(page)).map(worker => worker.terminated)).toEqual([true, false]);
  await expect(page.locator('.im-native-import')).toBeHidden();
});

test('Cancel interrupts an executing infinite Lua chunk and permits a fresh load', async ({ page }, info) => {
  await observeNativeWorkers(page);
  const marker = 'NATIVE_E2E_INFINITE_ENTERED';
  const infinite = await createNativeFixture(info, 'infinite-lua', { baseLua: `print("${marker}"); while true do end` });
  const valid = await createNativeFixture(info, 'after-cancel');
  await page.goto('/#/game/iron-meridian');
  const created = page.waitForEvent('worker');
  const enteredLua = page.waitForEvent('console', message => message.text().includes(marker));
  await selectNativeFixture(page, infinite);
  const worker = await created;
  await enteredLua;
  await expect(page.locator('.im-native')).toHaveAttribute('data-state', 'loading');
  const closed = worker.waitForEvent('close');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await closed;
  await expect(page.locator('.im-native')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByRole('button', { name: 'Choose folder', exact: true })).toBeVisible();
  expect((await nativeWorkerSummary(page))[0]!.terminated).toBe(true);
  await selectNativeFixture(page, valid);
  await waitForNativeMap(page);
  expect(await queryNativeFixtureValue(page)).toEqual({ type: 'number', value: 32 });
});
