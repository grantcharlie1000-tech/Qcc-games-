import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
import {seedStudyTopic} from '../fixtures';
const database=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
let accounts:ReturnType<typeof createAccountsHandler>,leaderboard:ReturnType<typeof createLeaderboardHandler>;
test.beforeAll(async()=>{const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;accounts=createAccountsHandler(pool);leaderboard=createLeaderboardHandler(pool);});
test.afterAll(async()=>{await pool?.end();await database.stop();});
async function identity(username:string){const r=await accounts(new Request('http://arcade.test/.netlify/functions/accounts?action=signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'synthetic test password'})}));expect(r.status).toBe(201);return r.json();}
async function connect(context:BrowserContext,session:{username:string;token:string}){
 await seedStudyTopic(context);await context.addInitScript(session=>{if(window===window.top)localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify(session));},session);
 for(const [name,handle] of [['accounts',accounts],['leaderboard',leaderboard]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{const req=route.request(),r=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:['POST','PUT'].includes(req.method())?req.postData():undefined}));await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});});
 await context.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await context.route('**/api/movie-popularity*',r=>r.fulfill({status:503,json:{error:'popularity_unavailable'}}));
 for(const host of ['framextv.cc','framextv.xyz'])await context.route('https://'+host+'/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
}
async function warning(page:Page){await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});}
test('two signed-in browsers share progress, isolate another account, and clear across devices',async({browser})=>{
 test.setTimeout(60000);const session=await identity('CW_'+Date.now()),other=await identity('Other_'+Date.now()),a=await browser.newContext(),b=await browser.newContext(),c=await browser.newContext();
 try{
  await connect(a,session);await connect(b,session);await connect(c,other);const first=await a.newPage(),second=await b.newPage(),third=await c.newPage();await warning(first);
  await first.goto('/#/movies/movie-157336/play');await expect(first.locator('.movies-provider-frame')).toBeVisible();
  await first.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:75,duration:5400},'*'));
  await expect.poll(()=>first.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1:account:'+JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:session')!).username.toLowerCase())!).progress['movie-157336'])).toBe(75);
  await expect.poll(async()=>Number((await pool.query('SELECT count(*) FROM account_movie_progress')).rows[0].count),{timeout:15000}).toBe(1);
  await second.goto('/#/movies');await expect(second.locator('a.movies-continue')).toHaveCount(1);await expect(second.locator('.movies-storage')).toContainText('synced to your account');
  await second.screenshot({path:'test-results/account-continue-watching-synced.png',fullPage:true});
  await third.goto('/#/movies');await expect(third.locator('.movies-storage')).toContainText('synced to your account');await expect(third.locator('a.movies-continue')).toHaveCount(0);
  await first.goto('/#/movies');
  await second.getByRole('button',{name:'Clear my list & watch history',exact:true}).click();await expect(second.locator('a.movies-continue')).toHaveCount(0);
  await expect.poll(async()=>Number((await pool.query('SELECT (value->>\'cleared\')::bigint AS cleared FROM account_movie_progress WHERE account_id=(SELECT id FROM accounts WHERE username=$1)',[session.username])).rows[0].cleared)).toBeGreaterThan(0);
  // Stop the old player first; replaying intentionally after a clear is a new watch.
  await first.reload();await expect(first.locator('a.movies-continue')).toHaveCount(0);
  await second.reload();await expect(second.locator('a.movies-continue')).toHaveCount(0);
 }finally{await a.close();await b.close();await c.close();}
});
test('legacy guest history remains private until explicitly imported and keeps its original copy',async({browser})=>{
 test.setTimeout(45000);const session=await identity('Import_'+Date.now()),context=await browser.newContext();
 try{
  await connect(context,session);await context.addInitScript(()=>{if(window!==window.top)return;if(localStorage.getItem('guest-history-seeded'))return;localStorage.setItem('guest-history-seeded','yes');localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],progress:{'movie-157336':120},meta:{'movie-157336':{updated:1000,duration:5400}},titles:{'movie-157336':{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,poster:'https://image.tmdb.org/t/p/w500/one.jpg'}}}));});
  const page=await context.newPage();await page.goto('/#/movies');await expect(page.locator('.movies-storage')).toContainText('synced to your account');await expect(page.locator('a.movies-continue')).toHaveCount(0);
  await page.getByRole('button',{name:'Add device history',exact:true}).click();await expect(page.locator('a.movies-continue')).toHaveCount(1);await expect(page.getByRole('button',{name:'Add device history',exact:true})).toBeHidden();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')!).progress['movie-157336'])).toBe(120);
 }finally{await context.close();}
});
