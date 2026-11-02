import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';

// Production recovery has its own server on 4618; never start the dev server.
export default defineConfig({
 testDir:'./tests/recovery',testMatch:'sw-kill-switch.spec.mjs',outputDir:'test-results/sw-kill-switch',workers:1,timeout:30000,
 expect:{timeout:10000},reporter:'list',
 use:{trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome'],launchOptions:{
  executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-sandbox']
 }}}]
});
