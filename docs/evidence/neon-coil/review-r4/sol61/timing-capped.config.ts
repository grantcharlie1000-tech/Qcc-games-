import base from '/workspace/Qcc-games-/playwright.config';
export default { ...base, webServer: { ...base.webServer, cwd: '/workspace/Qcc-games-' }, testDir: '/tmp/neon-coil-ci-fix', testMatch: 'timing-capped-source.spec.ts', timeout: Number(process.env.NEON_TIMING_BUDGET || 30000), workers: 1, reporter: [['list']], projects: [{ name: 'chromium-timing', use: base.projects![0].use }] };
