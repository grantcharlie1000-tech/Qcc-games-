/** Deterministic visual review. Start this worktree with:
 * npm run dev -- --port 4190 --strictPort
 * ROUND=7 node scripts/capture-crossy.mjs
 * Optional iteration filters: CAPTURE_VIEW=phone-dsf3 CAPTURE_ONLY=start,mixed
 * PNGs and a manifest stay outside git in /workspace/qcc-crossy-review/rN.
 * The mixed view uses an unmodified generated world. Death setups replace only
 * the lane under the bird, then use the real rules, hop and clock to trigger it.
 */
import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
const sourceDiff = execFileSync('git', ['diff', 'HEAD', '--', 'src', 'scripts/capture-crossy.mjs'], {cwd: repo, encoding: 'utf8'});
const only = process.env.CAPTURE_ONLY?.split(',');
const wanted = name => !only || only.includes(name);
const manifest = {sourceDiffHash: createHash('sha256').update(sourceDiff).digest('hex'), round: Number(round), commit, base: base.origin, source: repo, views: []};

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
      (await page.locator('.crossy-road').getAttribute('data-render-version')) !== 'fidelity-7')
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
  if (!wanted(name)) return;
  await settle(page);
  const source = await page.request.get('/src/games/crossy-road/index.ts');
  if (!source.ok() || !(await source.text()).includes('fidelity-7')) throw new Error('The worktree dev server is no longer serving this pass.');
  const state = await page.evaluate(() => window.__crossyRoadTest.state());
  const stats = await page.evaluate(() => window.__crossyRoadTest.stats());
  const buffer = await page.locator('.hw-canvas').evaluate(c => ({width: c.width, height: c.height, x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y,
    cssWidth: c.clientWidth, cssHeight: c.clientHeight, antialias: c.getContext('webgl2').getContextAttributes().antialias}));
  const pixelRatio = Math.min(view.dsf,3);
  if (buffer.width !== Math.floor(buffer.cssWidth*pixelRatio) || buffer.height !== Math.floor(buffer.cssHeight*pixelRatio) ||
      buffer.x !== 0 || buffer.y !== 0 || !buffer.antialias)
    throw new Error(`Canvas is not full-screen native-DPR antialiased: ${JSON.stringify(buffer)}`);
  const projection = await page.evaluate(async ({width,height})=>{
    const {cameraFit}=await import('/src/games/crossy-road/scene.ts');
    const {ROW_DEPTH}=await import('/src/games/crossy-road/config.ts');
    const {tilePx}=cameraFit(width,height), yaw=20*Math.PI/180;
    const cellPx=tilePx*Math.cos(yaw), rowPitch=tilePx*ROW_DEPTH*Math.sin(Math.PI/4)/Math.cos(yaw);
    return {tilePx,cellPx,rowPitch,rowToCell:rowPitch/cellPx,visibleRows:height/rowPitch};
  },view.viewport);
  const file = `${view.name}-${name}.png`;
  await page.screenshot({path: `${out}/${file}`});
  manifest.views.push({file, viewport: view.viewport, dsf: view.dsf, seed: state.seed, row: state.row,
    x: state.x, t: state.t, phase: state.phase, hopping: state.hopping, cause: state.deathCause, stats, buffer, projection, ...extra});
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
    // Keep the comparison seed; frame a natural banked log/lily crossing ahead
    // of the bird, with road and rail inside the same 15–17-row vertical view.
    for (const seed of [7]) {
      const world = new World(seed);
      for (let row = 3; row < 2000; row++) {
        const home = world.lane(row);
        if (home.kind !== 'grass' || home.blocked[4]) continue;
        const lanes = Array.from({length: 11}, (_, i) => world.lane(row - 2 + i));
        const kinds = lanes.map(l => l.kind);
        if (!['road', 'river', 'lily', 'rail'].every(k => kinds.includes(k))) continue;
        const river = lanes.find(l => l.kind === 'river');
        if (river.row <= row || river.row > row + 4) continue;
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

function grass(row) {
  return {kind:'grass',row,shade:row%2,blocked:Array(9).fill(false),obstacles:Array(9).fill(null),variant:Array(9).fill(0),edge:Array(12).fill(null)};
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
    await page.evaluate(({row, t, banks}) => {
      const h = window.__crossyRoadTest;
      h.forceLanes([...banks,{kind: 'river', row, dir: 1, speed: 2, cycle: 8,
        phase: 6.5 - 2 * t, movers: [{offset: 0, len: 4, color: 0}]}]);
      h.advance(0.06);
    }, {row, t, banks:[grass(row-1),grass(row+1),grass(row+2)]});
    await page.evaluate(() => window.__crossyRoadTest.advance(0.26));
  } else {
    await seek(page, mixed.seed, row, 4, t);
    let lane;
    if (cause === 'car' || cause === 'truck') lane = road(row + 1, t, cause);
    else if (cause === 'train') lane = {kind: 'rail', row: row + 1, dir: 1, speed: 18,
      length: 16, period: 9, phase: t - 0.25, color: 0};
    else lane = {kind: 'river', row: row + 1, dir: -1, speed: 1.2, cycle: 8,
      phase: 6.6 + 1.2 * (t + 0.12), movers: [{offset: 0, len: 2, color: 0}]};
    await page.evaluate(({lane,bank}) => {window.__crossyRoadTest.forceLanes([lane,bank]); window.__crossyRoadTest.hop('up');}, {lane,bank:grass(row+2)});
    // Capture the squash, knock or splash before the card covers it.
    await page.evaluate(seconds => window.__crossyRoadTest.advance(seconds), cause === 'train' ? 0.12 : cause === 'water' ? 0.24 : 0.35);
  }
  const state = await page.evaluate(() => window.__crossyRoadTest.state());
  const expected = cause === 'truck' ? 'car' : cause;
  if (state.phase !== 'dying' || state.deathCause !== expected)
    throw new Error(`Bad ${cause} setup: ${JSON.stringify(state)}`);
  await shot(page, view, `death-${cause}`, {setup: 'forced focal lane and grass bank; natural seeded surroundings'});
}

// Additional close comparisons keep lane boundaries and supported models reviewable
// without relying on a passing truck to uncover every part of a natural river.
async function details(page, view, mixed) {
  const row = mixed.row, t = mixed.t;
  const log = r => ({kind:'river',row:r,dir:1,speed:1.2,cycle:7,phase:0.4-1.2*t,movers:[{offset:0,len:3,color:0}]});
  if (wanted('lane-junctions')) {
    await seek(page,7,row,4,t);
    await page.evaluate(({row,t,land,water}) => {
      const h=window.__crossyRoadTest;
      const track=r=>({kind:'rail',row:r,dir:1,speed:18,length:16,period:9,phase:t+0.5,color:0});
      const asphalt=(r,vehicle='car')=>({kind:'road',row:r,dir:1,speed:1.8,vehicle,...(vehicle==='car'?{style:'sedan'}:{}),cycle:9,phase:0.4-1.8*t,movers:[{offset:0,len:vehicle==='truck'?3:1.8,color:0}]});
      h.forceLanes([land[0],water[0],track(row+2),asphalt(row+3,'truck'),water[1],water[2],land[1],asphalt(row+7)]);
    }, {row,t,land:[grass(row),grass(row+6)],water:[log(row+1),log(row+4),log(row+5)]});
    await shot(page,view,'lane-junctions',{setup:'legacy adjacency stress: forced grass/river, river/rail, rail/road and road/river; new worlds instead have grass banks'});
  }
  if (wanted('river-banks')) {
    await seek(page,7,row,4,t);
    await page.evaluate(({row,t,land,water})=>{
      window.__crossyRoadTest.forceLanes([
        land[0],
        {kind:'road',row:row+1,dir:1,speed:1.8,vehicle:'truck',cycle:8,phase:0.4-1.8*t,movers:[{offset:0,len:3,color:0}]},
        land[1],water,
        {kind:'lily',row:row+4,pads:[false,true,false,true,true,false,true,false,false]},
        land[2],
        {kind:'rail',row:row+6,dir:1,speed:18,length:16,period:9,phase:t+0.5,color:0},
        {kind:'road',row:row+7,dir:1,speed:1.8,vehicle:'car',style:'compact',cycle:8,phase:0.4-1.8*t,movers:[{offset:0,len:1.2,color:1}]},
        land[3],
      ]);
    },{row,t,land:[grass(row),grass(row+2),grass(row+5),grass(row+8)],water:log(row+3)});
    await shot(page,view,'river-banks',{setup:'banked log/lily pair, a box truck below the near bank, and adjacent rail/road beyond the far bank'});
  }
  if (wanted('traffic-models')) {
    await seek(page,7,row,4,t);
    await page.evaluate(({row,t})=>{
      const styles=['compact','sedan','taxi'];
      const lanes=styles.map((style,i)=>({kind:'road',row:row+i+1,dir:i%2?-1:1,speed:1.8,vehicle:'car',style,cycle:7,
        phase:1-(i%2?-1:1)*1.8*t,movers:[{offset:0,len:style==='compact'?1.2:1.8,color:i===0?1:i===1?0:2}]}));
      lanes.push({kind:'road',row:row+4,dir:1,speed:1.8,vehicle:'truck',cycle:8,phase:1-1.8*t,movers:[{offset:0,len:3,color:0}]});
      window.__crossyRoadTest.forceLanes(lanes);
    },{row,t});
    await shot(page,view,'traffic-models',{setup:'authored compact, sedan, taxi and box truck; exact collision lengths'});
  }
  if (wanted('triple-rail')) {
    const cluster=await page.evaluate(async()=>{
      const {World}=await import('/src/games/crossy-road/world.ts');
      for(const seed of [7,11]) {
        const w=new World(seed);
        for(let r=5;r<120;r++) if([0,1,2].every(i=>w.lane(r+i).kind==='rail')) {
          for(let home=r-1;home>=r-5;home--) {
            const land=w.lane(home);
            if(land.kind!=='grass'||land.blocked[4])continue;
            const rail=w.lane(r);let t=rail.phase-0.6;
            while(t<2||(t*2.5)%1>=0.45)t+=0.05;
            return {seed,row:home,t,tracks:[r,r+1,r+2]};
          }
        }
      }
      throw new Error('No early triple rail in the comparison seeds.');
    });
    await seek(page,cluster.seed,cluster.row,4,cluster.t);
    await shot(page,view,'triple-rail',{setup:'natural early triple crossing',composition:cluster});
  }
  if (wanted('shared-menu')) {
    await seek(page,7,row,4,t);
    await page.locator('#game-menu').click();
    await shot(page,view,'shared-menu',{setup:'shared QCC regular-glass menu'});
    await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  }
}

try {
  for (const view of [
    {name: 'phone', viewport: {width: 390, height: 844}, dsf: 2},
    {name: 'phone-dsf3', viewport: {width: 390, height: 844}, dsf: 3},
    {name: 'pc', viewport: {width: 1366, height: 768}, dsf: 1},
  ]) {
    if (process.env.CAPTURE_VIEW && view.name !== process.env.CAPTURE_VIEW) continue;
    const {context, page, errors} = await open(view);
    try {
      await shot(page, view, 'start', {setup: 'natural seed 11, ready'});
      const mixed = await discover(page);
      console.log('Mixed composition', mixed);
      await seek(page, mixed.seed, mixed.row, 4, mixed.t);
      await shot(page, view, 'mixed', {setup: 'natural world, validated restore', composition: mixed});
      // Prefer an open side step; boxed-in grass uses a forward hop. Validate
      // the actual in-air state so a blocked bonk can never masquerade as hop evidence.
      const direction = await page.evaluate(() => {
        const h = window.__crossyRoadTest, s = h.state(), lane = h.lanes(s.row, s.row)[0];
        return !lane.blocked[5] ? 'right' : !lane.blocked[3] ? 'left' : 'up';
      });
      await page.evaluate(dir => {const h = window.__crossyRoadTest; h.hop(dir); h.advance(0.06);}, direction);
      const inAir = await page.evaluate(() => window.__crossyRoadTest.state());
      if (!inAir.hopping || inAir.phase !== 'running') throw new Error('Mid-hop evidence did not reach a live in-air pose.');
      await shot(page, view, 'mid-hop');
      if (view.dsf === 3 && wanted('mid-hop')) {
        // Native-resolution 100% crop: no resampling, 420×480 device pixels.
        await page.screenshot({path: `${out}/phone-dsf3-edges-100-percent.png`, clip: {x: 125, y: 410, width: 140, height: 160}});
      }
      for (const cause of ['car', 'truck', 'train', 'water', 'swept', 'ufo-idle', 'ufo-behind'])
        if (wanted(`death-${cause}`) || (cause === 'ufo-behind' && wanted('game-over'))) await death(page, view, mixed, cause);
      if (wanted('game-over')) {
        await page.evaluate(() => window.__crossyRoadTest.advance(1));
        await page.locator('.hw-over').waitFor({state: 'visible'});
        await shot(page, view, 'game-over');
      }
      await details(page,view,mixed);
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await context.close(); }
  }
} finally {
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  await browser.close();
}
console.log(`Evidence: ${out}`);
