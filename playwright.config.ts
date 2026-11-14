import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const port = process.env.PLAYWRIGHT_PORT || '4600';
const externalURL = process.env.ARCADE_URL;
const baseURL = externalURL || `http://127.0.0.1:${port}`;
// Multiplayer helpers launch their own browsers and read ARCADE_URL directly.
process.env.ARCADE_URL = baseURL;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  expect: { timeout: 7000 },
  // Full CI shards opt into test-level parallelism and two workers via CLI.
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.BLOCKCRAFT_BROWSER_CHANNEL === 'headless-shell' ? undefined : 'chromium',
        headless: process.env.BLOCKCRAFT_HEADED !== '1',
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH || (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
          args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: externalURL ? undefined : {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    // Reuse is explicit: a listener on this port may belong to another worktree.
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER === '1',
  },
});
