import {test,expect,seedStudyTopic} from '../fixtures';
import type {BrowserContext,Page} from '@playwright/test';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
const database=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];let handle:ReturnType<typeof createLeaderboardHandler>;
test.beforeAll(async()=>{const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;handle=createLeaderboardHandler(pool);});
test.afterAll(async()=>{await pool?.end();await database.stop();});
async function connect(context:BrowserContext,score:number){
 await seedStudyTopic(context);await context.addInitScript(score=>localStorage.setItem('pocket-arcade:v1:best:snake',String(score)),score);
 await context.route('**/.netlify/functions/leaderboard**',async route=>{
  const req=route.request();const result=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.method()==='POST'?req.postData():undefined}));
  const body=await result.text();
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body});
 });
}
async function join(page:Page,name:string){
 await page.goto('/#/');await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.getByLabel('Game',{exact:true}).locator('option')).toHaveCount(14);
 await page.getByLabel('Game',{exact:true}).selectOption('snake');await page.getByLabel('Your public nickname').fill(name);await page.getByRole('button',{name:'Join leaderboard',exact:true}).click();
 await expect(page.locator('.lb-table tbody')).toContainText(name);
}
test('two browsers share ranked scores, highlight the current player and show cached scores during an outage',async({browser})=>{
 test.setTimeout(60000);
 const a=await browser.newContext({viewport:{width:390,height:844}}),b=await browser.newContext();
 try{
  await connect(a,120);await connect(b,200);const first=await a.newPage(),second=await b.newPage();
  await join(first,'Ada');await join(second,'Bo');
  await first.getByRole('button',{name:'Refresh scores'}).click();
  await expect(first.locator('.lb-table tbody tr').first()).toContainText('Bo');
  await expect(first.locator('.lb-you')).toContainText('Ada · You');
  await expect(first.locator('.lb-personal')).toContainText('Your rank: 2');
  expect(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await a.route('**/.netlify/functions/leaderboard**',route=>route.abort('internetdisconnected'));
  await first.getByRole('button',{name:'Refresh scores'}).click();await expect(first.locator('.lb-status')).toContainText('previously loaded');
  await expect(first.locator('.lb-table tbody')).toContainText('Bo');
  await first.getByRole('button',{name:'Close leaderboards'}).click();await expect(first.locator('#leaderboard-dialog')).not.toBeVisible();
 }finally{await a.close();await b.close();}
});

test('opening leaderboards pauses the active game and closing them restores its previous pause state',async({page,context})=>{
 await connect(context,0);await page.goto('/#/game/snake');await expect(page.locator('#game-stage')).not.toContainText('Getting your game ready');
 const menu=async()=>{await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Leaderboards',exact:true}).click();};
 await menu();await expect(page.getByLabel('Game',{exact:true})).toHaveValue('snake');
 await expect(page.locator('#pause-overlay')).toBeVisible();
 await page.getByRole('button',{name:'Close leaderboards'}).click();await expect(page.locator('#pause-overlay')).toBeHidden();
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await menu();
 await page.getByRole('button',{name:'Close leaderboards'}).click();await expect(page.locator('#pause-overlay')).toBeVisible();
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('a score earned in a real game is published after joining',async({page,context})=>{
 await connect(context,0);await page.goto('/#/game/minesweeper');await expect(page.locator('.ms-tile').first()).toBeVisible();
 const open=async()=>{await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Leaderboards',exact:true}).click();};
 await open();await page.getByLabel('Your public nickname').fill('Active Player');await page.getByRole('button',{name:'Join leaderboard',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save nickname',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close leaderboards'}).click();
 await page.locator('.ms-tile[data-index="0"]').click();await expect(page.locator('.ms-tile[data-index="0"]')).toHaveAttribute('data-state','open');
 await open();await expect(page.getByLabel('Game',{exact:true})).toHaveValue('minesweeper');
 await expect(page.locator('.lb-you')).toContainText('Active Player');
 const score=await page.locator('#game-score strong').textContent();await expect(page.locator('.lb-personal')).toContainText(`Best: ${Number(score).toLocaleString()}`);
});
