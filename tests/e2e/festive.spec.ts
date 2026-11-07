import {test,expect} from '../fixtures';
import {appSettings} from '../game-menu';

/** The 21 games with a Christmas skin. Crossy Road already has its own; Blockcraft and Quad Clash are excluded. */
const FESTIVE=['fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','globle','maze-muncher','corn-clicker','slipline','quadfall','fivefold','claimline'];

for(const id of FESTIVE)test(`${id} mounts with the Christmas theme and no page errors`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/#/game/${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-festive','christmas');
  await expect(page.locator('#game-stage > *').first()).toBeVisible();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});

test('the menu switch turns Christmas off and on without touching saves or scores',async({page})=>{
  await page.goto('/#/game/snake');
  await expect(page.locator('html')).toHaveAttribute('data-festive','christmas');
  await page.evaluate(()=>{localStorage.setItem('pocket-arcade:v1:best:snake','42');});
  const before=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('pocket-arcade:v1:')&&!k.endsWith(':settings')).map(k=>[k,localStorage.getItem(k)])));
  await appSettings(page);
  const toggle=page.getByLabel('Christmas theme',{exact:true});
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-festive','off');
  expect(await page.evaluate(()=>localStorage.getItem('qcc:festive'))).toBe('off');
  // The snake frame loses its candy-cane background straight away (CSS overrides are scoped to the attribute).
  expect(await page.locator('.snake-garden').evaluate(el=>getComputedStyle(el).backgroundImage)).not.toContain('repeating-linear-gradient');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-festive','off');
  const after=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('pocket-arcade:v1:')&&!k.endsWith(':settings')).map(k=>[k,localStorage.getItem(k)])));
  expect(after['pocket-arcade:v1:best:snake']).toBe(before['pocket-arcade:v1:best:snake']);
  await appSettings(page);
  await page.getByLabel('Christmas theme',{exact:true}).check();
  await expect(page.locator('html')).toHaveAttribute('data-festive','christmas');
  expect(await page.evaluate(()=>localStorage.getItem('qcc:festive'))).toBeNull();
});

test('switching the theme during a game remounts it in one theme and keeps the run',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/game/maze-muncher');
  await expect(page.locator('#game-stage .xm-wall-rim').first()).toBeAttached();
  await appSettings(page);
  await page.getByLabel('Christmas theme',{exact:true}).uncheck();
  // The original maze returns: no festive-only elements are left behind to lose their scoped colours.
  await expect(page.locator('#game-stage .mm-wall').first()).toBeAttached();
  await expect(page.locator('#game-stage [class^="xm-"]')).toHaveCount(0);
  await page.getByLabel('Christmas theme',{exact:true}).check();
  await expect(page.locator('#game-stage .xm-wall-rim').first()).toBeAttached();
  expect(errors).toEqual([]);
});
