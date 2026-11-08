import {guestTest as test,expect} from '../fixtures';
import type {BrowserContext,Page} from '@playwright/test';

test.skip(process.env.VITE_QCC_WHETU_STUDY!=='on','The Whetū integration is deliberately off in normal builds.');
const readiness={integration:'nceastudy-whetu-v1',ready:true,framePath:'/nceastudy',excludedSubjects:['history','l2-history'],authentication:{embeddedPassword:true,embeddedSignup:true,externalProviderHandoff:true},accountLink:'verified-explicit-v1',revision:'a'.repeat(40)};
async function signedIn(context:BrowserContext){
 await context.addInitScript(()=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({username:'StudyPlayer',token:'acct_'+'a'.repeat(64)}));
  localStorage.setItem('qcc:christmas-welcome:2026:studyplayer','seen');
 });
 await context.route('**/.netlify/functions/accounts?**',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('action')==='logout'?{ok:true}:{protocolVersion:2,cursor:'0',saves:{},conflicts:{},revisions:{},acks:{}}}));
}
async function mockRuntime(page:Page){
 // This fixture authorizes same-origin framing ONLY in this browser test.
 // Only an explicit integration build adds self; default shipping headers stay unchanged.
 await page.route('http://127.0.0.1:*/',async route=>{
  const response=await route.fetch();const headers={...response.headers()};
  headers['content-security-policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'";
  await route.fulfill({response,headers});
 });
 let linked=false,context=false;
 await page.route('**/api/integrations/nceastudy/link/*',route=>{
  const action=new URL(route.request().url()).pathname.split('/').pop();
  if(action==='select')return route.fulfill({json:{selected:true}});
  if(action==='status')return route.fulfill({status:linked&&context?200:401,json:linked&&context?{linked:true,verified:true}:{verified:false}});
  if(action==='start')return route.fulfill({status:201,json:{started:true,expiresIn:300,intent:'c'.repeat(64)}});
  if(action==='review')return route.fulfill({json:{qccUsername:'StudyPlayer',whetuLabel:'student@example.test',challenge:'b'.repeat(64)}});
  if(action==='confirm'){linked=true;context=true;return route.fulfill({json:{linked:true}});}
  return route.fulfill({json:{cancelled:true}});
 });
 await page.route('**/api/integrations/nceastudy',route=>route.fulfill({json:readiness,headers:{'Cache-Control':'private, no-store'}}));
 for(const path of ['/nceastudy','/login'])await page.route('**'+path,route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="whetu-integration" content="nceastudy-whetu-v1"><h1>${path==='/login'?'Log in to Whetū':'Create your Whetū account'}</h1><a href="/login">Already have an account? Log in</a>`,headers:{'Content-Security-Policy':"default-src 'self'; frame-ancestors 'self'",'X-Frame-Options':'SAMEORIGIN','Cache-Control':'private, no-store'}}));
}

test('Study requires NCEAStudy authentication and never starts a Whetū frame for a guest',async({page})=>{
 const probes:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/integrations/nceastudy')probes.push(r.url());});
 await page.goto('/#/study');
 await expect(page.getByRole('heading',{name:'Study with Whetū'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Log in or create an NCEAStudy account'})).toBeVisible();
 await expect(page.locator('#study-view')).toBeHidden();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);expect(probes).toEqual([]);
 await page.getByRole('button',{name:'Log in or create an NCEAStudy account'}).click();
 await expect(page.locator('#accounts-dialog')).toBeVisible();
});

test('an unready private runtime fails closed with site navigation intact',async({page,context})=>{
 await signedIn(context);
 await page.route('**/api/integrations/nceastudy/link/select',route=>route.fulfill({json:{selected:true}}));
 await page.route('**/api/integrations/nceastudy',route=>route.fulfill({status:503,json:{ready:false,reason:'account-link-protocol-unavailable'},headers:{'Cache-Control':'no-store'}}));
 await page.goto('/#/study');
 await expect(page.getByText('Study is not available inside this site yet.',{exact:true})).toBeVisible();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);
 await expect(page.locator('.app-tabbar [data-action="study"]')).toHaveAttribute('aria-current','page');
 await page.locator('.app-tabbar a[href="#/collection"]').click();
 await expect(page.locator('.game-card').first()).toBeVisible();
});

test('the approved first-party runtime opens signup inside Study, keeps navigation and handles Back',async({page,context})=>{
 await signedIn(context);await mockRuntime(page);
 await page.goto('/#/collection');
 await page.locator('.app-tabbar [data-action="study"]').click();
 await page.getByRole('button',{name:'Continue to Whetū account setup'}).click();
 const frame=page.frameLocator('.whetu-study iframe');
 await expect(frame.getByRole('heading',{name:'Create your Whetū account'})).toBeVisible();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(1);
 await page.locator('.app-tabbar a[href="#/collection"]').click();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);
 await page.goBack();
 await page.getByRole('button',{name:'Continue to Whetū account setup'}).click();
 await expect(frame.getByRole('heading',{name:'Create your Whetū account'})).toBeVisible();
 await page.goForward();
 await expect(page.locator('.game-card').first()).toBeVisible();
 await page.goBack();
 await page.getByRole('button',{name:'Continue to Whetū account setup'}).click();
 await expect(frame.getByRole('heading',{name:'Create your Whetū account'})).toBeVisible();
 await frame.getByRole('link',{name:'Already have an account? Log in'}).click();
 await expect(frame.getByRole('heading',{name:'Log in to Whetū'})).toBeVisible();
 await page.goBack();
 await expect(frame.getByRole('heading',{name:'Create your Whetū account'})).toBeVisible();
 await expect(page).toHaveURL(/#\/study$/);await expect(page.locator('.whetu-study iframe')).toHaveCount(1);
 await page.goForward();
 await expect(frame.getByRole('heading',{name:'Log in to Whetū'})).toBeVisible();
 await page.locator('.app-tabbar a[href="#/collection"]').click();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);
});

test('an unrelated or frame-blocked app response never masquerades as an integrated account screen',async({page,context})=>{
 await signedIn(context);await mockRuntime(page);
 await page.route('**/nceastudy',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Unrelated fallback</h1>'}));
 await page.goto('/#/study');
 await page.getByRole('button',{name:'Continue to Whetū account setup'}).click();
 await expect(page.getByText('Study could not open securely. Try again to check your account setup.',{exact:true})).toBeVisible();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);
});


test('linking requires explicit review and confirmation, then a new live-status check',async({page,context})=>{
 await signedIn(context);await mockRuntime(page);
 const actions:string[]=[];page.on('request',request=>{if(request.url().includes('/api/integrations/nceastudy/link/'))actions.push(new URL(request.url()).pathname.split('/').pop()!);});
 await page.goto('/#/study');
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);
 await page.getByRole('button',{name:'Continue to Whetū account setup'}).click();
 await expect(page.frameLocator('.whetu-study iframe').getByRole('heading',{name:'Create your Whetū account'})).toBeVisible();
 await page.getByRole('button',{name:'Review account link',exact:true}).click();
 await expect(page.getByText('Link NCEAStudy account “StudyPlayer” with Whetū account “student@example.test”? Both accounts keep their existing progress.',{exact:true})).toBeVisible();
 expect(actions).toEqual(['select','status','start','review']);
 await page.getByRole('button',{name:'Confirm account link',exact:true}).click();
 await expect(page.locator('.whetu-study-state')).toBeHidden();expect(actions).toEqual(['select','status','start','review','confirm','status']);
 await expect(page.locator('.whetu-study iframe')).toHaveCount(1);
});


test('account logout removes the old private frame before network revocation completes',async({page,context})=>{
 await signedIn(context);await mockRuntime(page);await page.goto('/#/study');
 await page.getByRole('button',{name:'Continue to Whetū account setup'}).click();
 await expect(page.frameLocator('.whetu-study iframe').getByRole('heading',{name:'Create your Whetū account'})).toBeVisible();
 let finish!:(value:void)=>void;
 await page.route('**/.netlify/functions/accounts?action=logout',async route=>{await new Promise<void>(resolve=>{finish=resolve;});await route.fulfill({json:{ok:true}});});
 await page.locator('.app-navigation [data-action="menu"]').click();
 await page.locator('#logout-account').click();
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);
 await expect(page.locator('#content h1')).toHaveText('Study connection paused');
 await expect.poll(()=>typeof finish).toBe('function');
 await page.evaluate(()=>{(document.querySelector('#menu') as HTMLDialogElement).close();(document.querySelector('#content button') as HTMLButtonElement).click();});
 await expect(page.locator('.whetu-study iframe')).toHaveCount(0);await expect(page.locator('#content h1')).toHaveText('Study connection paused');finish();
 await expect(page.getByRole('button',{name:'Log in or create an NCEAStudy account'})).toBeVisible();
});
