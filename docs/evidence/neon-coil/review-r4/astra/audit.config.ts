import base from './playwright.config';
if (!process.env.ARCADE_URL) throw new Error('Coordinated ARCADE_URL is required');
export default {
  ...base,
  webServer: undefined,
  testDir: './tests',
  testMatch: '**/games/neon-coil/play.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: '/workspace/neon-coil-integration-audit-r4/browser-output',
  reporter: [['list'], ['json', { outputFile: '/workspace/neon-coil-integration-audit-r4/browser-results.json' }]],
  use: { ...base.use, baseURL: process.env.ARCADE_URL },
  projects: [{ name: 'chromium-dpr2-independent', use: { ...base.projects![0].use, deviceScaleFactor: 2 } }]
};
