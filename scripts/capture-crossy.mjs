/** Deterministic visual review. Start this worktree with:
 * npm run dev -- --port 4190 --strictPort
 * ROUND=1 node scripts/capture-crossy.mjs
 * PNGs and a manifest stay outside git in /workspace/qcc-crossy-review/rN.
 * The mixed view uses an unmodified generated world. Death setups replace only
 * the lane under the bird, then use the real rules, hop and clock to trigger it.
 */
import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const base = new URL(process.env.ARCADE_URL || 'http://127.0.0.1:4190');
if (['4173', '4174', '4175'].includes(base.port)) throw new Error('Ports 4173–4175 belong to another worktree. Use 4190.');
const round = process.env.ROUND || '1';
if (!/^\d+$/.test(round)) throw new Error('ROUND must be an integer.');
const out = `/workspace/qcc-crossy-review/r${round}`;
await mkdir(out, {recursive: true});
const repo = fileURLToPath(new URL('..', import.meta.url));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
const browser = await chromium.launch({executablePath: '/usr/bin/chromium', args: [
  '--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--renderer-process-limit=1',
]});
const manifest = {round: Number(round), commit, base: base.origin, source: repo, views: []};

async function open(view) {
  console.log(`Opening ${view.name} at ${base.origin} ...`);
  const context = await browser.newContext({viewport: view.viewport, deviceScaleFactor: view.dsf, baseURL: base.origin});
  await context.addInitScript(() => {
    localStorage.setItem('pocket-arcade:v1:accounts:guest', 'true');
    localStorage.setItem('pocket-arcade:study:v1:reading-choice', 'accept');
    sessionStorage.setItem('pocket-arcade:study:v1:topic', 'close-reading');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  await page.goto('/#/game/crossy-road?seed=11');
  try { await page.waitForFunction(() => window.__crossyRoadTest); }
  catch (error) { throw new Error(`${error.message}\n${errors.join('\n')}\n${(await page.locator('body').innerText()).slice(0, 3000)}`); }
  // Both the visible shell title and the renderer marker must belong to this pass.
  if ((await page.locator('#game-title').evaluate(e => e.firstChild.textContent.trim())) !== 'Crossy Road' ||
      (await page.locator('.crossy-road').getAttribute('data-render-version')) !== 'fidelity-1')
    throw new Error('This is not the Crossy Road fidelity worktree. Refusing evidence.');
  await page.evaluate(() => {const h = window.__crossyRoadTest; h.freeze(true); h.setSeed(11); h.setQuality('high');});
  return {context, page, errors};
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => {
    let n = 16;
    const frame = () => --n <= 0 ? resolve() : requestAnimationFrame(frame);
    requestAnimationFrame(frame);
  }));
}

async function shot(page, view, name, extra = {}) {
  await settle(page);
  const source = await page.request.get('/src/games/crossy-road/index.ts');
  if (!source.ok() || !(await source.text()).includes('fidelity-1')) throw new Error('The worktree dev server is no longer serving this pass.');
  const state = await page.evaluate(() => window.__crossyRoadTest.state());
  const stats = await page.evaluate(() => window.__crossyRoadTest.stats());
  const buffer = await page.locator('.hw-canvas').evaluate(c => ({width: c.width, height: c.height, x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y,
    cssWidth: c.clientWidth, cssHeight: c.clientHeight, antialias: c.getContext('webgl2').getContextAttributes().antialias}));
  const file = `${view.name}-${name}.png`;
  await page.screenshot({path: `${out}/${file}`});
  manifest.views.push({file, viewport: view.viewport, dsf: view.dsf, seed: state.seed, row: state.row,
    x: state.x, t: state.t, phase: state.phase, cause: state.deathCause, stats, buffer, ...extra});
  console.log(`${file}: seed ${state.seed}, row ${state.row}, t=${state.t.toFixed(3)}, ${state.phase}${state.deathCause ? ` / ${state.deathCause}` : ''}, ${buffer.width}×${buffer.height}, ${stats.calls} calls`);
}

// Seek through the validated restore path, leaving a Continue card until resumed.
async function seek(page, seed, row, x = 4, t = 3, maxRow = row) {
  await page.evaluate(async ({seed, row, x, t, maxRow}) => {
    const {createRun} = await import('/src/games/crossy-road/rules.ts');
    const h = window.__crossyRoadTest;
    h.setSeed(seed);
    h.restore({...createRun(seed), phase: 'running', started: true, row, fromRow: row, x, fromX: x,
      maxRow, t, lastProgress: t, safeLine: Math.max(0, maxRow - 2)});
  }, {seed, row, x, t, maxRow});
  await page.locator('.hw-resume').click();
  await settle(page);
}

async function discover(page) {
  return page.evaluate(async () => {
    const {World} = await import('/src/games/crossy-road/world.ts');
    // Keep the r4 seed for comparison; find a natural nearby crossing under
    // the versioned generator and the tighter fourteen-cell desktop framing.
    for (const seed of [7]) {
      const world = new World(seed);
      for (let row = 3; row < 2000; row++) {
        const home = world.lane(row);
        if (home.kind !== 'grass' || home.blocked[4]) continue;
        const lanes = Array.from({length: 10}, (_, i) => world.lane(row - 3 + i));
        const kinds = lanes.map(l => l.kind);
        if (!['road', 'river', 'lily', 'rail'].every(k => kinds.includes(k))) continue;
        const rail = lanes.find(l => l.kind === 'rail');
        // Choose a lit moment in the warning, before the nose enters the band.
        let t = rail.phase - 0.6;
        while (t < 2 || (t * 2.5) % 1 >= 0.45) t += 0.05;
        return {seed, row, t, railRow: rail.row, lanes: lanes.map(l => ({row: l.row, kind: l.kind}))};
      }
    }
    throw new Error('No mixed composition found.');
  });
}

function road(row, t, vehicle = 'car') {
  // The left edge passes through x=3.7 at t. A real hop at x=4 triggers D1.
  return {kind: 'road', row, dir: 1, speed: 1.8, vehicle, ...(vehicle === 'car' ? {style: 'sedan'} : {}), cycle: 9, phase: 3.7 - 1.8 * t,
    movers: [{offset: 0, len: vehicle === 'truck' ? 3 : 1.8, color: 0}]};
}

async function death(page, view, mixed, cause) {
  const row = mixed.row, t = mixed.t;
  if (cause === 'ufo-idle' || cause === 'ufo-behind') {
    await seek(page, mixed.seed, row, 4, t, cause === 'ufo-behind' ? row + 3 : row);
    // Three rows back triggers immediately; idle uses the same 7-second rule as play.
    await page.evaluate(seconds => window.__crossyRoadTest.advance(seconds), cause === 'ufo-idle' ? 7.001 : 1 / 60);
    await page.evaluate(() => window.__crossyRoadTest.advance(0.37));
  } else if (cause === 'swept') {
    // A four-tile log naturally carries the bird across the playable boundary.
    await seek(page, mixed.seed, row, 8.4, t);
    await page.evaluate(({row, t}) => {
      const h = window.__crossyRoadTest;
      h.forceLanes([{kind: 'river', row, dir: 1, speed: 2, cycle: 8,
        phase: 6.5 - 2 * t, movers: [{offset: 0, len: 4, color: 0}]}]);
      h.advance(0.06);
    }, {row, t});
    await page.evaluate(() => window.__crossyRoadTest.advance(0.26));
  } else {
    await seek(page, mixed.seed, row, 4, t);
    let lane;
    if (cause === 'car' || cause === 'truck') lane = road(row + 1, t, cause);
    else if (cause === 'train') lane = {kind: 'rail', row: row + 1, dir: 1, speed: 18,
      length: 16, period: 9, phase: t - 0.25, color: 0};
    else lane = {kind: 'river', row: row + 1, dir: -1, speed: 1.2, cycle: 8,
      phase: 6.6 + 1.2 * (t + 0.12), movers: [{offset: 0, len: 2, color: 0}]};
    await page.evaluate(lane => {window.__crossyRoadTest.forceLanes([lane]); window.__crossyRoadTest.hop('up');}, lane);
    // Capture the squash, knock or splash before the card covers it.
    await page.evaluate(seconds => window.__crossyRoadTest.advance(seconds), cause === 'train' ? 0.12 : cause === 'water' ? 0.24 : 0.35);
  }
  const state = await page.evaluate(() => window.__crossyRoadTest.state());
  const expected = cause === 'truck' ? 'car' : cause;
  if (state.phase !== 'dying' || state.deathCause !== expected)
    throw new Error(`Bad ${cause} setup: ${JSON.stringify(state)}`);
  await shot(page, view, `death-${cause}`, {setup: 'forced focal lane; natural seeded surroundings'});
}

try {
  for (const view of [
    {name: 'phone', viewport: {width: 390, height: 844}, dsf: 2},
    {name: 'phone-dsf3', viewport: {width: 390, height: 844}, dsf: 3},
    {name: 'pc', viewport: {width: 1366, height: 768}, dsf: 1},
  ]) {
    const {context, page, errors} = await open(view);
    try {
      await shot(page, view, 'start', {setup: 'natural seed 11, ready'});
      const mixed = await discover(page);
      console.log('Mixed composition', mixed);
      await seek(page, mixed.seed, mixed.row, 4, mixed.t);
      await shot(page, view, 'mixed', {setup: 'natural world, validated restore', composition: mixed});
      // A sideways hop into an open neighbour; logical move and scoring stay real.
      const direction = await page.evaluate(() => {
        const h = window.__crossyRoadTest, s = h.state(), lane = h.lanes(s.row, s.row)[0];
        return !lane.blocked[5] ? 'right' : 'left';
      });
      await page.evaluate(dir => {const h = window.__crossyRoadTest; h.hop(dir); h.advance(0.06);}, direction);
      await shot(page, view, 'mid-hop');
      if (view.dsf === 3) {
        // Native-resolution 100% crop: no resampling, 420×480 device pixels.
        await page.screenshot({path: `${out}/phone-dsf3-edges-100-percent.png`, clip: {x: 125, y: 410, width: 140, height: 160}});
      }
      for (const cause of ['car', 'truck', 'train', 'water', 'swept', 'ufo-idle', 'ufo-behind'])
        await death(page, view, mixed, cause);
      await page.evaluate(() => window.__crossyRoadTest.advance(1));
      await page.locator('.hw-over').waitFor({state: 'visible'});
      await shot(page, view, 'game-over');
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await context.close(); }
  }
} finally {
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  await browser.close();
}
console.log(`Evidence: ${out}`);
