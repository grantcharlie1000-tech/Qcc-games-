import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';
// Exercises the actual production build, not Vite's dev-only source modules.
export default defineConfig({
 testDir:'./tests/recovery',
 testMatch:'offline-downloads.spec.ts',
 outputDir:'test-results/offline-downloads',
 timeout:90000,
 workers:1,
 reporter:'list',
 use:{baseURL:'http://127.0.0.1:4619',screenshot:'only-on-failure',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome'],launchOptions:{
  executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-sandbox']
 }}}],
 webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4619 --strictPort',
  url:'http://127.0.0.1:4619',reuseExistingServer:!process.env.CI,timeout:30000}
});
