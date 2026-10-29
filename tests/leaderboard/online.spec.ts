import {test,expect,seedStudyTopic} from '../fixtures';
import type {BrowserContext,Page} from '@playwright/test';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Pool} from 'pg';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
import {createAccountsHandler} from '../../src/accounts/server';
const database=new LocalDB();let pool:Pool;let handle:ReturnType<typeof createLeaderboardHandler>;let accounts:ReturnType<typeof createAccountsHandler>;
test.beforeAll(async()=>{const connectionString=await database.start();await database.applyMigrations('db/migrations');pool=createLocalPool(connectionString);handle=createLeaderboardHandler(pool);accounts=createAccountsHandler(pool);});
test.afterAll(async()=>{await pool?.end();await database.stop();});
async function connect(context:BrowserContext,score:number,username?:string){
 if(username){const response=await accounts(new Request('https://arcade.test/.netlify/functions/accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'test password'})}));expect(response.status).toBe(201);const session=await response.json();await context.addInitScript(session=>localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify(session)),session);}
 await seedStudyTopic(context);await context.addInitScript(score=>localStorage.setItem('pocket-arcade:v1:best:snake',String(score)),score);
 await context.route(/\/\.netlify\/functions\/(leaderboard|accounts)/,async route=>{
  const req=route.request();const result=await (req.url().includes('/accounts')?accounts:handle)(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.method()==='POST'?req.postData():undefined}));
  const body=await result.text();
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body});
 });
}
async function appMenu(page:Page){await page.getByRole('button',{name:'Open menu',exact:true}).click();if(await page.locator('.ms-settings').isVisible())await page.getByRole('button',{name:'Account & app settings',exact:true}).click();}
async function join(page:Page,name:string){
 await page.goto('/#/');await appMenu(page);await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.getByLabel('Game',{exact:true}).locator('option')).toHaveCount(18);
 await page.getByLabel('Game',{exact:true}).selectOption('snake');
 await expect(page.locator('.lb-table tbody')).toContainText(name);
}
test('two browsers share ranked scores, highlight the current player and show cached scores during an outage',async({browser})=>{
 test.setTimeout(60000);
 const a=await browser.newContext({viewport:{width:390,height:844}}),b=await browser.newContext();
 try{
  await connect(a,120,'Ada');await connect(b,200,'Bobby');const first=await a.newPage(),second=await b.newPage();
  await join(first,'Ada');await join(second,'Bobby');
  await first.getByRole('button',{name:'Refresh scores'}).click();
  await expect(first.locator('.lb-table tbody tr').first()).toContainText('Bobby');
  await expect(first.locator('.lb-you')).toContainText('Ada · account · You');
  await expect(first.locator('.lb-personal')).toContainText('Your rank: 2');
  expect(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await a.route('**/.netlify/functions/leaderboard**',route=>route.abort('internetdisconnected'));
  await first.getByRole('button',{name:'Refresh scores'}).click();await expect(first.locator('.lb-status')).toContainText('previously loaded');
  await expect(first.locator('.lb-table tbody')).toContainText('Bobby');
  await first.getByRole('button',{name:'Close leaderboards'}).click();await expect(first.locator('#leaderboard-dialog')).not.toBeVisible();
 }finally{await a.close();await b.close();}
});

test('opening leaderboards pauses the active game and closing them restores its previous pause state',async({page,context})=>{
 await connect(context,0);await page.goto('/#/game/snake');await expect(page.locator('#game-stage')).not.toContainText('Getting your game ready');
 const menu=async()=>{await appMenu(page);await page.getByRole('button',{name:'Leaderboards',exact:true}).click();};
 await menu();await expect(page.getByLabel('Game',{exact:true})).toHaveValue('snake');
 await expect(page.locator('#pause-overlay')).toBeVisible();
 await page.getByRole('button',{name:'Close leaderboards'}).click();await expect(page.locator('#pause-overlay')).toBeHidden();
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await menu();
 await page.getByRole('button',{name:'Close leaderboards'}).click();await expect(page.locator('#pause-overlay')).toBeVisible();
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('a score earned in a real game is published only for the signed-in account',async({page,context})=>{
 await connect(context,0,'Active_Player');await page.goto('/#/game/minesweeper');await expect(page.locator('.ms-tile').first()).toBeVisible();
 const open=async()=>{await appMenu(page);await page.getByRole('button',{name:'Leaderboards',exact:true}).click();};
 await open();await expect(page.locator('.lb-login')).toBeHidden();await page.getByRole('button',{name:'Close leaderboards'}).click();
 await page.locator('.ms-tile[data-index="0"]').click();await expect(page.locator('.ms-tile[data-index="0"]')).toHaveAttribute('data-state','open');
 await open();await expect(page.getByLabel('Game',{exact:true})).toHaveValue('minesweeper-easy');
 await expect(page.locator('#leaderboard-dialog .lb-you')).toHaveCount(0);await page.getByRole('button',{name:'Close leaderboards'}).click();
 const b=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:minesweeper')!).data);
 for(let i=0;i<b.cells.length;i++)if(b.cells[i]!==-1&&await page.locator(`.ms-tile[data-index="${i}"]`).getAttribute('data-state')!=='open')await page.locator(`.ms-tile[data-index="${i}"]`).click();
 await open();await expect(page.locator('#leaderboard-dialog .lb-you')).toContainText('Active_Player');
 await expect(page.locator('.lb-personal')).toContainText(' s');
});

test('guests can read rankings and keep local progress while the sharing action opens account login',async({page,context})=>{
 await page.clock.install({time:new Date('2026-10-27T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-27T10:00:01Z'));
 await connect(context,0);await page.goto('/#/game/minesweeper');await page.locator('.ms-tile[data-index="0"]').click();
 const saved=await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:save:minesweeper'));
 await appMenu(page);await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.locator('.lb-login')).toContainText('Log in to share');await expect(page.locator('#leaderboard-name')).toHaveCount(0);
 await page.locator('.lb-login').getByRole('button',{name:'Log in / Sign up',exact:true}).click();await expect(page.locator('#accounts-dialog')).toBeVisible();await expect(page.locator('#pause-overlay')).toBeVisible();
 await page.getByRole('button',{name:'Play as guest',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:save:minesweeper'))).toBe(saved);
});

test('an expired session offers login recovery while scores remain local',async({page,context})=>{
 await connect(context,0,'Expired_Player');await pool.query("UPDATE account_sessions SET expires_at=now()-interval '1 second' WHERE account_id=(SELECT id FROM accounts WHERE username='Expired_Player')");
 await page.goto('/');await appMenu(page);await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.locator('.lb-status')).toContainText('Log in again');await expect(page.locator('.lb-login')).toBeVisible();await page.locator('.lb-login button').click();await expect(page.locator('#accounts-dialog')).toBeVisible();
});
