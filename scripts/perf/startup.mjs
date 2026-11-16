// Startup and game-launch timings for the built site on a throttled phone-sized Chromium.
//   npm run build && node scripts/serve-built.mjs &   (port 4175)
//   node scripts/perf/startup.mjs [url] [runs]
// Chromium with CPU and network throttling stands in for an older iPhone. It is not a Safari measurement.
import {chromium} from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4175/';
const runs = Number(process.argv[3] || 5);
const GAMES = ['fruit-merge', 'snake', 'pool'];

async function session(context, throttle) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  await cdp.send('Network.enable');
  if (throttle) await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8});
  return page;
}

async function library(page) {
  const start = Date.now();
  await page.goto(url + '#/collection');
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.game-card img')].slice(0, 2);
    return imgs.length === 2 && imgs.every(img => img.complete && img.naturalWidth > 0);
  }, null, {timeout: 60000});
  const ms = Date.now() - start;
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation'))
    .reduce((sum, entry) => sum + (entry.transferSize || 0), 0));
  return {ms, kb: Math.round(bytes / 1024)};
}

async function launch(page, id) {
  const start = Date.now();
  await page.evaluate(id => { location.hash = '#/game/' + id; }, id);
  await page.waitForFunction(() => {
    const stage = document.querySelector('#game-stage');
    return stage && stage.children.length > 0 && !stage.querySelector(':scope > .loading');
  }, null, {timeout: 60000});
  return Date.now() - start;
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
const cold = [], warm = [], kb = [], games = Object.fromEntries(GAMES.map(id => [id, []]));
for (let run = 0; run < runs; run++) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
  await context.addInitScript(() => {
    localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true');
    localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept');
    sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
    localStorage.setItem('qcc:festive', 'off');
  });
  const first = await session(context, true);
  const a = await library(first); cold.push(a.ms); kb.push(a.kb);
  for (const id of GAMES) { games[id].push(await launch(first, id)); await first.evaluate(() => { location.hash = '#/collection'; }); await first.waitForSelector('.game-card'); }
  await first.close();
  // A returning visit in the same profile: HTTP cache and, where present, the service worker.
  const second = await session(context, true);
  warm.push((await library(second)).ms);
  await context.close();
}
await browser.close();
const result = {runs, coldLibraryMs: median(cold), warmLibraryMs: median(warm), coldTransferKB: median(kb),
  gameLaunchMs: Object.fromEntries(GAMES.map(id => [id, median(games[id])]))};
console.log(JSON.stringify(result, null, 1));
