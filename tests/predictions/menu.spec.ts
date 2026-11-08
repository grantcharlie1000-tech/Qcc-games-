import {test,expect} from '../fixtures';
import type {BrowserContext,Page} from '@playwright/test';

// Isolated synthetic session. The token matches the client shape and is never a real account.
const USERNAME='SynthPlayer';
const TOKEN='acct_'+'ab'.repeat(32);
const QUESTION='Synthetic fixture: will this unpublished test question stay closed?';
const EMPTY_SYNC={protocolVersion:2,cursor:'0',saves:{},revisions:{},acks:{},conflicts:{}};
const MARKET={
 id:'fixture-synthetic',question:QUESTION,category:'games',audience:'public',state:'open',
 closeAt:'2026-12-01T00:00:00.000Z',resolveAt:'2026-12-02T00:00:00.000Z',publishedAt:'2026-11-08T00:00:00.000Z',
 yesPpm:500000,traders:0,trades:0,fixture:true,outcome:null,
};

function me(signedIn:boolean){
 return {
  enabled:true,signedIn,username:signedIn?USERNAME:null,eligible:signedIn,roles:[],
  balance:signedIn?10_000_000:null,nextGrantAt:'2026-11-10T11:00:00.000Z',weeklyGrant:10_000_000,
  tradingPaused:false,launched:true,
 };
}

/** Answers Predictions and account sync locally. Any other host fails the test. */
async function installFixtures(context:BrowserContext,page:Page){
 const hosts=new Set<string>();
 page.on('request',request=>{hosts.add(new URL(request.url()).hostname);});
 await context.route('**/.netlify/functions/**',async route=>{
  const url=new URL(route.request().url());
  const name=url.pathname.split('/').pop();
  const action=url.searchParams.get('action')??'';
  if(name==='predictions'&&action==='me'){
   const signedIn=route.request().headers().authorization===`Bearer ${TOKEN}`;
   await route.fulfill({json:me(signedIn)});
   return;
  }
  if(name==='predictions'&&action==='markets'){
   await route.fulfill({json:{items:[MARKET]}});
   return;
  }
  if(name==='predictions'){
   await route.fulfill({status:403,json:{error:'fixture_refused',message:'This fixture does not perform credit or trade writes.'}});
   return;
  }
  if(name==='accounts'&&action.startsWith('sync')){
   await route.fulfill({json:EMPTY_SYNC});
   return;
  }
  await route.fulfill({status:404,json:{error:'not_found'}});
 });
 await context.route('**/api/election**',route=>route.fulfill({status:404,json:{error:'not_found'}}));
 await context.route('**/api/predictions**',route=>route.fulfill({status:404,json:{error:'not_found'}}));
 return {hosts,expectLocalOnly(){expect([...hosts].filter(host=>host!=='127.0.0.1'&&host!=='localhost')).toEqual([]);}};
}

async function signedIn(context:BrowserContext){
 await context.addInitScript(({username,token})=>{
  localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({token,username}));
  localStorage.setItem('qcc:christmas-welcome:2026:'+username.toLowerCase(),'seen');
 },{username:USERNAME,token:TOKEN});
}

test('the Menu opens Predictions for a synthetic account and has no election entry',async({page,context},testInfo)=>{
 await signedIn(context);
 const api=await installFixtures(context,page);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true}).click();
 const menu=page.locator('#menu');
 await expect(menu).toBeVisible();
 await expect(menu.locator('#open-predictions')).toHaveAttribute('href','#/predictions');
 await expect(menu.locator('#open-predictions')).toContainText('Predictions');
 await expect(menu.locator('#open-predictions')).toContainText('Free credits');
 await expect(menu.locator('#open-election')).toHaveCount(0);
 await expect(menu.getByRole('link',{name:/Election/i})).toHaveCount(0);
 await expect(menu.locator('#account-summary')).toHaveText(`Signed in as ${USERNAME}`);
 await menu.locator('#open-predictions').scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath(`predictions-menu-${testInfo.project.name}.png`)});
 await menu.locator('#open-predictions').click();
 await expect(page).toHaveURL(/#\/predictions$/);
 await expect(page.getByRole('heading',{name:'Explore',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:QUESTION})).toBeVisible();
 await expect(page.getByText('Development fixture')).toBeVisible();
 await expect(page.locator('.election-page,.election-banner')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath(`predictions-explore-${testInfo.project.name}.png`)});
 api.expectLocalOnly();
});

test('a direct election address returns to the games library',async({page,context},testInfo)=>{
 const api=await installFixtures(context,page);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/election');
 await expect(page).toHaveURL(/#\/collection$/);
 await expect(page.locator('.game-card').first()).toBeVisible();
 await expect(page.locator('.election-page,.election-banner,#open-election')).toHaveCount(0);
 await expect(page.getByText(/Results Desk|Election 2026/)).toHaveCount(0);
 await page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true}).click();
 await expect(page.locator('#open-predictions')).toBeVisible();
 await expect(page.locator('#open-election')).toHaveCount(0);
 if(testInfo.project.name==='chromium')await page.screenshot({path:testInfo.outputPath('election-retired-library.png')});
 api.expectLocalOnly();
});
