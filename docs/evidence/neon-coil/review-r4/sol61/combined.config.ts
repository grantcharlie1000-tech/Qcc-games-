import base from '/workspace/Qcc-games-/playwright.config';
export default { ...base, webServer: { ...base.webServer, cwd: '/workspace/Qcc-games-' }, testDir: '/tmp/neon-coil-ci-fix/combined-checkout/tests', projects: [base.projects![0]], workers: 1, reporter: [['list']] };
