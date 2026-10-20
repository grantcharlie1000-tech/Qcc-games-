import base from '/workspace/Qcc-games-/playwright.config';
export default { ...base, webServer: { ...base.webServer, cwd: '/workspace/Qcc-games-' }, testDir: '/workspace/Qcc-games-/tests', workers: 1, reporter: [['list']], projects: [1, 1.25, 2, 3].map(deviceScaleFactor => ({ name: `chromium-dpr${deviceScaleFactor}`, use: { ...base.projects![0].use, deviceScaleFactor } })) };
