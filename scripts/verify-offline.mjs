// Production offline gate: the built packs match dist, then the browser suite plays downloaded games offline.
import {spawn} from 'node:child_process';
import {verifyOfflineBuild} from './verify-offline-build.mjs';
await verifyOfflineBuild();
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.offline.config.ts', ...process.argv.slice(2)], {stdio: 'inherit'});
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error('Offline browser tests failed: ' + (signal || code))));
});
