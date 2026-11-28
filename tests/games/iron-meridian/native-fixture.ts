import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { expect, type Page } from '../../fixtures';
import type { NativeLoaderResponse } from '../../../src/games/iron-meridian/native/loader-protocol';
import type { NativeViewSave } from '../../../src/games/iron-meridian/native-view-state';

interface ObservedNativeWorker {
  worker: Worker;
  url: string;
  type: string;
  terminated: boolean;
  messages: NativeLoaderResponse[];
}
declare global { interface Window { __ironMeridianWorkers?: ObservedNativeWorker[] } }

/** Synthetic authored bytes, never an installed or native-effective game world. */
export async function createNativeFixture(
  info: TestInfo, name: string, options: { firstProvinceId?: number; baseLua?: string } = {},
): Promise<string> {
  const directory = info.outputPath(name);
  const first = options.firstProvinceId ?? 1;
  const files: Record<string, string | Buffer> = {
    'map/default.map': 'definitions="definition.csv" provinces="provinces.bmp"',
    'map/definition.csv': `0;0;0;0;land;false;unknown;0\n${first};1;2;3;land;false;plains;1\n${first + 1};4;5;6;land;false;forest;1\n`,
    'history/states/101-left.txt': `state={id=101 name=BASE_LEFT provinces={${first}} history={owner=FRA}}`,
    'history/states/102-right.txt': `state={id=102 name=BASE_RIGHT provinces={${first + 1}} history={owner=GER}}`,
    'common/defines/00_base.lua': options.baseLua ?? 'NDefines={NTechnology={MIN_RESEARCH_SPEED=0.1},E2E={VALUE=0}}',
    'common/defines/10_execute.lua': 'local sum=0; for _,value in ipairs({3,5,8}) do sum=sum+value end; NDefines.E2E.VALUE=sum*2; assert(NDefines.E2E.VALUE==32)',
  };
  // Small enough for fixtures, large enough for real zoom and pan at scale 8 to 16.
  const width = 128, height = 64, stride = width * 3;
  const bitmap = Buffer.alloc(54 + stride * height);
  bitmap.write('BM'); bitmap.writeUInt32LE(bitmap.length, 2); bitmap.writeUInt32LE(54, 10);
  bitmap.writeUInt32LE(40, 14); bitmap.writeInt32LE(width, 18); bitmap.writeInt32LE(height, 22);
  bitmap.writeUInt16LE(1, 26); bitmap.writeUInt16LE(24, 28); bitmap.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    bitmap.set(x < 64 ? [3, 2, 1] : [6, 5, 4], 54 + y * stride + x * 3);
  }
  files['map/provinces.bmp'] = bitmap;
  for (const [relative, bytes] of Object.entries(files)) {
    const path = join(directory, ...relative.split('/'));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  return directory;
}

/** Observe real workers. Construction, execution and replies remain browser operations. */
export async function observeNativeWorkers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const BrowserWorker = window.Worker;
    const records: ObservedNativeWorker[] = [];
    window.__ironMeridianWorkers = records;
    window.Worker = class extends BrowserWorker {
      private readonly record: ObservedNativeWorker;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.record = { worker: this, url: String(url), type: options?.type ?? 'classic', terminated: false, messages: [] };
        records.push(this.record);
        this.addEventListener('message', event => this.record.messages.push(event.data as NativeLoaderResponse));
      }
      override terminate() { this.record.terminated = true; super.terminate(); }
    };
  });
}

export async function selectNativeFixture(page: Page, directory: string): Promise<void> {
  await page.getByLabel('Installation folder', { exact: true }).setInputFiles(directory);
}

export async function waitForNativeMap(page: Page): Promise<string> {
  const root = page.locator('.im-native');
  await expect(root).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(root).toHaveAttribute('data-snapshot-id', /^[0-9a-f]{64}$/);
  return (await root.getAttribute('data-snapshot-id'))!;
}

export async function nativeWorkerSummary(page: Page) {
  return page.evaluate(() => (window.__ironMeridianWorkers ?? []).map(record => {
    const ready = record.messages.find(message => message.type === 'ready');
    return {
      url: record.url, type: record.type, terminated: record.terminated,
      phases: record.messages.filter(message => message.type === 'progress').map(message => message.phase),
      ready: ready?.type === 'ready' ? {
        snapshotId: ready.manifest.snapshotId, scope: ready.manifest.scope,
        luaRuntime: ready.manifest.luaRuntime, definePaths: ready.manifest.definePathsInExecutionOrder,
        loaderBuildId: ready.manifest.loaderBuildId, fileAccess: ready.manifest.fileAccess,
        width: ready.world.width, height: ready.world.height,
        provinceIds: ready.world.definitions.filter(province => province.id !== 0).map(province => province.id),
      } : null,
    };
  }));
}

/** Query the running worker through its real postMessage channel after Lua execution. */
export async function queryNativeFixtureValue(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const record = window.__ironMeridianWorkers?.at(-1);
    const ready = record?.messages.find(message => message.type === 'ready');
    if (!record || ready?.type !== 'ready') throw new Error('No ready native worker.');
    return new Promise((resolve, reject) => {
      const requestId = 10_000 + record.messages.length;
      const timeout = setTimeout(() => { record.worker.removeEventListener('message', received); reject(new Error('Define query timed out.')); }, 10_000);
      function received({ data }: MessageEvent<NativeLoaderResponse>) {
        if (!('requestId' in data) || data.requestId !== requestId) return;
        clearTimeout(timeout); record!.worker.removeEventListener('message', received);
        if (data.type === 'define-result') resolve(data.value);
        else reject(new Error('Native worker rejected the define query.'));
      }
      record.worker.addEventListener('message', received);
      record.worker.postMessage({ type: 'query-define', sessionId: ready.sessionId, requestId, root: 'NDefines', section: 'E2E', key: 'VALUE' });
    });
  });
}

export async function nativeViewSave(page: Page): Promise<NativeViewSave | undefined> {
  return page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('pocket-arcade:v1:save:iron-meridian') ?? 'null');
    return saved?.data?.kind === 'iron-meridian-native-view' ? saved.data as NativeViewSave : undefined;
  });
}
