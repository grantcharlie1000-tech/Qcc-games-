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
async function openSignedIn(page:Page,url:string){
 await page.goto(url);await page.getByRole('dialog',{name:'Merry Christmas!'}).getByRole('button',{name:'Got it',exact:true}).click();
}
async function warning(page:Page){await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});}
test('two signed-in browsers share progress, isolate another account, and clear across devices',async({browser})=>{
 test.setTimeout(60000);const session=await identity('CW_'+Date.now()),other=await identity('Other_'+Date.now()),a=await browser.newContext(),b=await browser.newContext(),c=await browser.newContext();
 try{
  await connect(a,session);await connect(b,session);await connect(c,other);const first=await a.newPage(),second=await b.newPage(),third=await c.newPage();await warning(first);
  await openSignedIn(first,'/#/movies/movie-157336/play');await expect(first.locator('.movies-provider-frame')).toBeVisible();
  await first.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:75,duration:5400},'*'));
  await expect.poll(()=>first.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1:account:'+JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:session')!).username.toLowerCase())!).progress['movie-157336'])).toBe(75);
  await expect.poll(async()=>Number((await pool.query('SELECT count(*) FROM account_movie_progress')).rows[0].count),{timeout:15000}).toBe(1);
  await openSignedIn(second,'/#/movies');await expect(second.locator('a.movies-continue')).toHaveCount(1);await expect(second.locator('.movies-storage')).toContainText('synced to your account');
  await second.screenshot({path:'test-results/account-continue-watching-synced.png',fullPage:true});
  await openSignedIn(third,'/#/movies');await expect(third.locator('.movies-storage')).toContainText('synced to your account');await expect(third.locator('a.movies-continue')).toHaveCount(0);
  await first.goto('/#/movies');
  await second.getByRole('button',{name:'Clear my list & watch history',exact:true}).click();await expect(second.locator('a.movies-continue')).toHaveCount(0);
  await expect.poll(async()=>Number((await pool.query('SELECT (value->>\'cleared\')::bigint AS cleared FROM account_movie_progress WHERE account_id=(SELECT id FROM accounts WHERE username=$1)',[session.username])).rows[0].cleared)).toBeGreaterThan(0);
  // Stop the old player first; replaying intentionally after a clear is a new watch.
  await first.reload();await expect(first.locator('a.movies-continue')).toHaveCount(0);
  await second.reload();await expect(second.locator('a.movies-continue')).toHaveCount(0);
 }finally{await a.close();await b.close();await c.close();}
});
async function seedDeviceHistory(context:BrowserContext){
 await context.addInitScript(()=>{if(window!==window.top||localStorage.getItem('guest-history-seeded'))return;localStorage.setItem('guest-history-seeded','yes');localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],progress:{'movie-157336':120},meta:{'movie-157336':{updated:1000,duration:5400}},titles:{'movie-157336':{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,poster:'https://image.tmdb.org/t/p/w500/one.jpg'}}}));});
}
const cloudDocument=async(username:string)=>(await pool.query('SELECT value FROM account_movie_progress WHERE account_id=(SELECT id FROM accounts WHERE username=$1)',[username])).rows[0]?.value;
test('first signed-in app boot automatically merges device history without a prompt',async({browser})=>{
 test.setTimeout(45000);const session=await identity('Auto_'+Date.now()),context=await browser.newContext();
 try{
  await connect(context,session);await seedDeviceHistory(context);const page=await context.newPage();await openSignedIn(page,'/#/collection');
  await expect.poll(async()=>(await cloudDocument(session.username))?.entries?.['movie-157336']?.time,{timeout:15000}).toBe(120);
  expect((await cloudDocument(session.username)).entries['movie-157336'].updated).toBe(1000);await expect(page.locator('.movies-history-prompt')).toHaveCount(0);
  await page.goto('/#/movies');await expect(page.locator('a.movies-continue')).toHaveCount(1);await expect(page.locator('.movies-storage')).toContainText('synced to your account');
  await page.locator('a.movies-continue').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/automatic-account-continue-watching.png',fullPage:true});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')!).progress['movie-157336'])).toBe(120);
  await page.reload();await expect(page.locator('a.movies-continue')).toHaveCount(1);
 }finally{await context.close();}
});
test('switching accounts on the same browser does not automatically copy already-claimed device history',async({browser})=>{
 test.setTimeout(60000);const one=await identity('Owner_'+Date.now()),two=await identity('Other_'+Date.now()),context=await browser.newContext();
 try{
  await connect(context,one);await seedDeviceHistory(context);const page=await context.newPage();await openSignedIn(page,'/#/movies');await expect(page.locator('a.movies-continue')).toHaveCount(1);await expect.poll(async()=>(await cloudDocument(one.username))?.entries?.['movie-157336']?.time,{timeout:15000}).toBe(120);
  await page.locator('.movies-menu').click();await page.getByRole('button',{name:'Switch account',exact:true}).click();const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();await dialog.getByLabel('Username',{exact:true}).fill(two.username);await dialog.getByLabel('Password',{exact:true}).fill('synthetic test password');await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).toBeHidden();await page.getByRole('dialog',{name:'Merry Christmas!'}).getByRole('button',{name:'Got it',exact:true}).click();
  await expect(page.locator('.movies-storage')).toContainText('another account');await expect(page.locator('a.movies-continue')).toHaveCount(0);expect(await cloudDocument(two.username)).toBeUndefined();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')!).progress['movie-157336'])).toBe(120);
 }finally{await context.close();}
});
test('automatic first-use merge keeps newer cloud progress instead of older device progress',async({browser})=>{
 test.setTimeout(45000);const session=await identity('Newer_'+Date.now()),context=await browser.newContext();
 try{
  const response=await accounts(new Request('http://arcade.test/.netlify/functions/accounts?action=movies',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({entries:{'movie-157336':{time:240,updated:2000,duration:5400,snapshot:{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,poster:'https://image.tmdb.org/t/p/w500/one.jpg'}}},cleared:0})}));expect(response.status).toBe(200);
  await connect(context,session);await seedDeviceHistory(context);const page=await context.newPage();await openSignedIn(page,'/#/movies');await expect(page.locator('.movies-storage')).toContainText('synced to your account');await expect(page.locator('a.movies-continue')).toHaveCount(1);expect((await cloudDocument(session.username)).entries['movie-157336'].time).toBe(240);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1:account:'+JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:session')!).username.toLowerCase())!).progress['movie-157336'])).toBe(240);
 }finally{await context.close();}
});
