import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {appSettings} from '../game-menu';

// Only the account HTTP boundary is replaced. Entry, Study, routing, dialogs and
// persistence are the real application, without creating production accounts.
async function setup(context:BrowserContext,{signedIn=false,topic=true}={}){
  await context.addInitScript(({signedIn,topic})=>{
    localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
    if(topic)sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
    if(signedIn&&!localStorage.getItem('pocket-arcade:v1:accounts:session'))localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({username:'ChristmasPlayer',token:'acct_'+'a'.repeat(64)}));
  },{signedIn,topic});
  await context.route('**/.netlify/functions/accounts**',async route=>{
    const action=new URL(route.request().url()).searchParams.get('action');
    const body=action==='login'||action==='signup'?{username:route.request().postDataJSON().username,token:'acct_'+'a'.repeat(64)}:{protocolVersion:2,cursor:'0',saves:{},conflicts:{},revisions:{},acks:{}};
    await route.fulfill({json:body});
  });
  await context.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[]}}));
}
async function signIn(page:Page,username='ChristmasPlayer'){
  const dialog=page.locator('#accounts-dialog');
  await dialog.getByLabel('Username',{exact:true}).fill(username);
  await dialog.getByLabel('Password',{exact:true}).fill('test password only');
  await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();
  await expect(dialog).not.toBeVisible();
}
const welcome=(page:Page)=>page.getByRole('dialog',{name:'Merry Christmas!'});

test('first sign-in introduces the actual toggle, then stays dismissed on reload and sign-in',async({page,context})=>{
  await setup(context);await page.goto('/');await expect(welcome(page)).not.toBeVisible();
  await signIn(page);await expect(welcome(page)).toBeVisible();
  await expect(welcome(page)).toContainText('Turn it off in Menu');
  await welcome(page).getByRole('button',{name:'Got it'}).click();
  await expect(page.locator('.game-card').first()).toBeVisible();
  await expect(page.locator('.game-card').first()).toBeFocused();
  await appSettings(page);await expect(page.getByLabel('Christmas theme',{exact:true})).toBeVisible();
  await page.getByLabel('Christmas theme',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Log out',exact:true}).click();
  await appSettings(page);await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  await signIn(page,'christmasplayer');await expect(welcome(page)).not.toBeVisible();
  await page.reload();await expect(page.locator('.game-card').first()).toBeVisible();
  await expect(welcome(page)).not.toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-festive','off');
});

test('remembered sign-in sees it once, with keyboard focus and Escape preserving the requested game',async({page,context})=>{
  await setup(context,{signedIn:true});await page.goto('/#/game/minesweeper');
  await expect(welcome(page)).toBeVisible();
  await expect(welcome(page).getByRole('button',{name:'Got it'})).toBeFocused();
  // Native dialogs may Tab into browser chrome (document.activeElement is body),
  // but must never expose background controls. Shift+Tab returns to the action.
  await page.keyboard.press('Tab');
  expect(await welcome(page).evaluate(el=>el.contains(document.activeElement)||document.activeElement===document.body)).toBe(true);
  await page.keyboard.press('Shift+Tab');await expect(welcome(page).getByRole('button',{name:'Got it'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(welcome(page)).not.toBeVisible();
  await expect(page.locator('.ms-tile').first()).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/study-active/);
  await page.reload();await expect(page.locator('.ms-tile').first()).toBeVisible();await expect(welcome(page)).not.toBeVisible();
});

test('guests remain uninterrupted and the first signed-in Study choice finishes before the welcome',async({page,context})=>{
  await setup(context,{topic:false});await page.goto('/');
  await page.getByRole('button',{name:'Play as guest',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();
  await expect(welcome(page)).not.toBeVisible();
  await page.locator('[data-study-topic="close-reading"]').click();
  await expect(page.locator('.game-card').first()).toBeVisible();await expect(welcome(page)).not.toBeVisible();
  await appSettings(page);await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  await signIn(page);await expect(welcome(page)).toBeVisible();
});

test('signed-in Study setup is not covered and a new account receives its own welcome',async({page,context})=>{
  await setup(context,{topic:false});await page.goto('/');await signIn(page);
  await expect(page.getByRole('heading',{name:'Choose your study topic'})).toBeVisible();await expect(welcome(page)).not.toBeVisible();
  await page.locator('[data-study-topic="close-reading"]').click();await expect(welcome(page)).toBeVisible();
  await welcome(page).getByRole('button',{name:'Got it'}).click();
  await appSettings(page);await page.getByRole('button',{name:'Switch account',exact:true}).click();
  await signIn(page,'AnotherPlayer');await expect(welcome(page)).toBeVisible();
});

test('mobile welcome uses the site sheet style, fits at 320px and respects reduced motion',async({page,context},testInfo)=>{
  await page.setViewportSize({width:320,height:568});await page.emulateMedia({reducedMotion:'reduce'});
  await setup(context,{signedIn:true});await page.goto('/');await expect(welcome(page)).toBeVisible();
  await expect(welcome(page)).toHaveClass(/arcade-sheet/);
  expect(await welcome(page).evaluate(el=>getComputedStyle(el).textAlign)).toBe('center');
  expect(await welcome(page).evaluate(el=>getComputedStyle(el,'::before').borderTopLeftRadius===getComputedStyle(el).borderTopLeftRadius)).toBe(true);
  expect(await welcome(page).evaluate(el=>{const snow=el.querySelector('.christmas-snow')!,box=snow.getBoundingClientRect(),sheet=el.getBoundingClientRect();return box.top<sheet.top&&box.bottom<=sheet.top+8&&getComputedStyle(snow).pointerEvents==='none';})).toBe(true);
  const button=welcome(page).getByRole('button',{name:'Got it'}),box=(await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
  expect(await welcome(page).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('christmas-welcome-mobile.png')});
  await button.click();await expect(page.locator('.game-card').first()).toBeVisible();
});


test('newer navigation wins while the welcome is open',async({page,context})=>{
  await setup(context,{signedIn:true});await page.goto('/#/game/minesweeper');
  await expect(welcome(page)).toBeVisible();
  await page.evaluate(()=>{location.hash='#/game/snake';});
  await expect(welcome(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-view')).toHaveAttribute('data-game-id','snake');
  await expect(page.locator('.ms-tile')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/study-active/);
});
