import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
import {articleById} from '../../src/study/articles';
const database=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
let accounts:ReturnType<typeof createAccountsHandler>,leaderboard:ReturnType<typeof createLeaderboardHandler>;
test.beforeAll(async()=>{const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;accounts=createAccountsHandler(pool);leaderboard=createLeaderboardHandler(pool);});
test.afterAll(async()=>{await pool?.end();await database.stop();});
async function connect(context:BrowserContext,topic=true){
 if(topic)await context.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
 for(const [name,handle] of [['accounts',accounts],['leaderboard',leaderboard]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request(),result=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:['POST','PUT'].includes(req.method())?req.postData():undefined}));
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});
 });
}
async function signIn(page:Page,username:string,signup=false){
 const dialog=page.locator('#accounts-dialog');
 if(signup){await dialog.getByRole('button',{name:'Sign up',exact:true}).click();await expect(dialog).toContainText('Forgotten passwords cannot be recovered.');}
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill('long enough password');
 if(signup)await dialog.getByLabel('Confirm password',{exact:true}).fill('long enough password');
 await dialog.locator('form').getByRole('button',{name:signup?'Create account':'Log in',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(dialog.getByLabel('Password',{exact:true})).toHaveValue('');await expect(dialog.getByLabel('Confirm password',{exact:true})).toHaveValue('');
}
async function menu(page:Page){await page.getByRole('button',{name:'Open menu',exact:true}).click();if(await page.locator('.ms-settings').isVisible())await page.getByRole('button',{name:'Account & app settings',exact:true}).click();}

test('entry offers guest play before the Study chooser and remembers the choice',async({page,context})=>{
 await connect(context,false);await page.goto('/');const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 await expect(dialog.locator('form').getByRole('button',{name:'Log in',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Sign up',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Play as guest',exact:true}).click();await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
 await page.reload();await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
 await page.getByRole('button',{name:'Accept All',exact:true}).click();await page.locator('[data-study-topic="close-reading"]').click();await menu(page);await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();await expect(dialog).toBeVisible();
});

test('two browsers carry account scores and favourites, then logout restores guest isolation',async({browser})=>{
 test.setTimeout(60000);const a=await browser.newContext(),b=await browser.newContext();
 try{
  await connect(a);await connect(b);await b.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:best:minesweeper','9999');localStorage.setItem('pocket-arcade:v1:favourites',JSON.stringify(['snake']));});const first=await a.newPage(),second=await b.newPage(),name=`Carry_${Date.now()}`;
  await first.goto('/#/game/minesweeper');await signIn(first,name,true);await expect(first.locator('.ms-tile').first()).toBeVisible();
  await first.getByRole('button',{name:'Favourite Minesweeper',exact:true}).click();await first.locator('.ms-tile[data-index="0"]').click();await expect(first.locator('.ms-tile[data-index="0"]')).toHaveAttribute('data-state','open');
  const field=await first.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:minesweeper')!).data);
  for(let i=0;i<field.cells.length;i++)if(field.cells[i]!==-1&&await first.locator(`.ms-tile[data-index="${i}"]`).getAttribute('data-state')!=='open')await first.locator(`.ms-tile[data-index="${i}"]`).click();
  await expect(first.locator('.ms-outcome')).toHaveText('Field cleared!');
  // Leaving saves the real game snapshot; the debounced account sync sends it without blocking play.
  await first.getByRole('link',{name:'Back to game library',exact:true}).click();
  await expect.poll(async()=>Number((await pool.query(`SELECT count(*) AS n FROM account_saves WHERE key='best:minesweeper-easy'`)).rows[0].n)).toBeGreaterThan(0);
  await second.goto('/#/game/minesweeper');await signIn(second,name);await expect(second.locator('#favourite-game')).toHaveAttribute('aria-pressed','true');await expect(second.locator('.ms-tile[data-index="0"]')).toHaveAttribute('data-state','open');
  await expect(second.locator('.ms-result-detail')).toContainText('Best');expect(await second.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:favourites')!))).toEqual(['minesweeper']);await menu(second);await expect(second.locator('#menu')).toContainText(`Signed in as ${name}`);await expect(second.getByRole('button',{name:'Log in / Sign up',exact:true})).not.toBeVisible();
  await second.getByRole('button',{name:'Leaderboards',exact:true}).click();await expect(second.locator('#leaderboard-dialog .lb-you')).toContainText(name);await expect(second.locator('#leaderboard-dialog .lb-you')).toContainText('· account');await second.getByRole('button',{name:'Close leaderboards',exact:true}).click();
  await first.goto('/#/game/minesweeper');await first.locator('#favourite-game').click();await expect(first.locator('#favourite-game')).toHaveAttribute('aria-pressed','false');await first.getByRole('link',{name:'Back to game library',exact:true}).click();
  await expect.poll(async()=>((await pool.query("SELECT value FROM account_saves WHERE key='favourites' AND account_id=(SELECT id FROM accounts WHERE username=$1)",[name])).rows[0]?.value)).toEqual([]);
  expect(await first.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:favourites')!))).toEqual([]);
  await second.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>second.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:favourites')!))).toEqual([]);await expect(second.locator('#favourite-game')).toHaveAttribute('aria-pressed','false');
  await menu(second);await second.getByRole('button',{name:'Switch account',exact:true}).click();await expect(second.locator('#accounts-dialog')).toBeVisible();
  await second.getByRole('button',{name:'Play as guest',exact:true}).click();await expect.poll(()=>second.evaluate(()=>Number(localStorage.getItem('pocket-arcade:v1:best:minesweeper')??0))).toBe(9999);expect(await second.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:favourites')!))).toEqual(['snake']);
  await menu(first);await first.getByRole('button',{name:'Log out',exact:true}).click();await expect(first.locator('#menu')).not.toBeVisible();await menu(first);await expect(first.getByRole('button',{name:'Log in / Sign up',exact:true})).toBeVisible();
  expect(await first.evaluate(()=>Number(localStorage.getItem('pocket-arcade:v1:best:minesweeper')??0))).toBe(0);
 }finally{await a.close();await b.close();}
});

test('logout in another tab preserves Study and returns to a fresh guest game',async({page,context})=>{
 await connect(context);await page.goto('/#/game/minesweeper');await signIn(page,`Tabs_${Date.now()}`,true);
 await page.locator('.ms-tile[data-index="0"]').click();await expect(page.locator('.ms-tile[data-index="0"]')).toHaveAttribute('data-state','open');
 const reading=await context.newPage();await reading.goto('/#/game/minesweeper');await expect(reading.locator('.ms-tile').first()).toBeVisible();await reading.keyboard.press('Escape');
 const selected=await reading.evaluate(()=>sessionStorage.getItem('pocket-arcade:study:v1:topic'));expect(selected).toMatch(/^(quanta|aeon|essay):close-reading$/);const article=articleById(selected!);expect(article).toBeDefined();await expect(reading.locator('#study-topic')).toHaveValue('close-reading');await expect(reading.locator('#study-title')).toHaveText(article!.title);
 await menu(page);await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page.locator('#menu')).not.toBeVisible();
 await expect(reading.locator('#account-summary')).toHaveText('Playing as guest');await expect(reading.locator('#study-title')).toHaveText(article!.title);expect(await reading.locator('.study-article-body > p').count()).toBeGreaterThanOrEqual(6);
 await reading.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await expect(reading.locator('.ms-tile').first()).toBeVisible();await expect(reading.locator('#game-best strong')).toHaveText('0');
 expect(await reading.evaluate(()=>Number(localStorage.getItem('pocket-arcade:v1:best:minesweeper')??0))).toBe(0);
 await menu(reading);await expect(reading.getByRole('button',{name:'Log in / Sign up',exact:true})).toBeVisible();await expect(reading.getByRole('button',{name:'Log out',exact:true})).not.toBeVisible();await expect(reading.getByRole('button',{name:'Switch account',exact:true})).not.toBeVisible();
});

test('keyboard-only signup and Escape still open Study while playing',async({page,context})=>{
 await connect(context);await page.goto('/#/game/fruit-merge');const dialog=page.locator('#accounts-dialog');await dialog.getByRole('button',{name:'Sign up',exact:true}).focus();await page.keyboard.press('Enter');
 await dialog.getByLabel('Username',{exact:true}).focus();await page.keyboard.type(`Keys_${Date.now()}`);await page.keyboard.press('Tab');await page.keyboard.type('long enough password');await page.keyboard.press('Tab');await page.keyboard.type('long enough password');await page.keyboard.press('Enter');
 await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'Drop fruit',exact:true})).toBeVisible();await page.keyboard.press('Escape');const selected=await page.evaluate(()=>sessionStorage.getItem('pocket-arcade:study:v1:topic'));expect(selected).toMatch(/^(quanta|aeon|essay):close-reading$/);const article=articleById(selected!);expect(article).toBeDefined();await expect(page.locator('#study-topic')).toHaveValue('close-reading');await expect(page.locator('#study-title')).toHaveText(article!.title);
});

test('guest entry and account form fit a 320px touch screen',async({browser})=>{
 const context=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:320,height:568},isMobile:true,hasTouch:true});
 try{await connect(context);const page=await context.newPage();await page.goto('/');const dialog=page.locator('#accounts-dialog');await dialog.getByRole('button',{name:'Sign up',exact:true}).tap();await expect(dialog).toContainText('Forgotten passwords cannot be recovered.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const button of await dialog.locator('.account-tabs button').all()){await button.scrollIntoViewIfNeeded();expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
  for(const name of ['Create account','Play as guest']){const button=dialog.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded();const box=(await button.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);}
  await dialog.getByRole('button',{name:'Play as guest',exact:true}).tap();await expect(page.locator('.game-card').first()).toBeVisible();await menu(page);await page.getByRole('button',{name:'Log in / Sign up',exact:true}).tap();await expect(dialog).toBeVisible();
 }finally{await context.close();}
});

test('signup confirms passwords, clears secrets and scrolls in short landscape',async({page,context})=>{
 await page.setViewportSize({width:844,height:390});await connect(context);await page.goto('/');
 const dialog=page.locator('#accounts-dialog');await dialog.getByRole('button',{name:'Sign up',exact:true}).click();
 await dialog.getByLabel('Username',{exact:true}).fill('Mismatch');await dialog.getByLabel('Password',{exact:true}).fill('long enough password');await dialog.getByLabel('Confirm password',{exact:true}).fill('different password');
 await dialog.getByRole('button',{name:'Create account',exact:true}).click();await expect(dialog.getByRole('status')).toHaveText('Passwords do not match.');
 expect(await dialog.evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollWidth<=el.clientWidth)).toBe(true);
 await dialog.evaluate((el:HTMLDialogElement)=>el.close());
 await expect(dialog.getByLabel('Password',{exact:true})).toHaveValue('');await expect(dialog.getByLabel('Confirm password',{exact:true})).toHaveValue('');
 await dialog.evaluate((el:HTMLDialogElement)=>el.showModal());await dialog.getByLabel('Password',{exact:true}).fill('long enough password');await dialog.getByLabel('Confirm password',{exact:true}).fill('long enough password');
 await dialog.getByRole('button',{name:'Play as guest',exact:true}).click();await expect(dialog.getByLabel('Password',{exact:true})).toHaveValue('');await expect(dialog.getByLabel('Confirm password',{exact:true})).toHaveValue('');
});

test('manual sync fits the account panel and paused/hidden tabs make no idle requests',async({page,context})=>{
 test.setTimeout(60000);await connect(context);await page.goto('/#/game/minesweeper');await signIn(page,`Idle_${Date.now()}`,true);
 await expect(page.locator('.ms-tile').first()).toBeVisible();if(await page.getByRole('button',{name:'Pause game',exact:true}).isVisible())await page.getByRole('button',{name:'Pause game',exact:true}).click({force:true});await menu(page);
 await page.getByRole('button',{name:'Sync now',exact:true}).click();await expect(page.locator('#account-sync-status')).toHaveText('Progress synced.');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:sync:'+JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:session')!).username.toLowerCase())!).pending.length)).toBe(0);
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));const requests:string[]=[];page.on('request',request=>{if(/\/\.netlify\/functions\/(accounts|leaderboard)/.test(request.url()))requests.push(request.method());});
 await page.clock.runFor(30*60000);expect(requests).toEqual([]);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(30*60000);expect(requests).toEqual([]);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>requests.filter(method=>method==='GET').length).toBe(1);expect(requests.filter(method=>method==='PUT')).toHaveLength(0);
});
