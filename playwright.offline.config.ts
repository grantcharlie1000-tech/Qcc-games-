import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';

// Offline play against the production build. The suite runs its own server on 4618; never the dev server.
export default defineConfig({
 testDir:'./tests/recovery',testMatch:'offline.spec.mjs',outputDir:'test-results/offline',workers:1,timeout:60000,
 expect:{timeout:10000},reporter:'list',
 use:{trace:'retain-on-failure',screenshot:'only-on-failure',viewport:{width:390,height:844},hasTouch:true},
 projects:[
  {name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:390,height:844},hasTouch:true,launchOptions:{
   executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
   args:['--no-sandbox','--disable-auto-reload','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']
  }}},
  {name:'webkit',use:{...devices['Desktop Safari'],viewport:{width:390,height:844},hasTouch:true}}
 ]
});
