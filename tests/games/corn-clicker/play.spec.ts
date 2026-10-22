import {test,expect,type Page} from '../../fixtures';

const KEY='pocket-arcade:v1:save:corn-clicker';
const saved=(page:Page)=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).data,KEY);
const kernels=async(page:Page)=>Number((await page.locator('.cc-kernels-num').textContent())!.replace(/,/g,''));
const cob=(page:Page)=>page.getByRole('button',{name:/^Harvest the cob/});
/** Write a save before the game loads, as an older session would have left it. */
async function seed(page:Page,data:Record<string,unknown>){
  await page.goto('/#/collection');
  await page.evaluate(([k,d])=>localStorage.setItem(k,JSON.stringify({version:1,data:{v:2,rev:1,lastTick:Date.now(),...d},updated:Date.now()})),[KEY,data] as const);
  await page.goto('/#/game/corn-clicker');
  await expect(cob(page)).toBeVisible();
}
const errorsOf=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));return errors;};

test('fresh start with mouse and keyboard: one kernel per input, first producer, upgrade, bulk prices, save and offline return',async({page})=>{
  const errors=errorsOf(page);
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/#/game/corn-clicker');
  await expect(cob(page)).toBeVisible();
  await expect(page.locator('.cc-tip')).toContainText('Click the cob!');
  for(let i=0;i<15;i++)await cob(page).click();
  await expect(page.locator('.cc-kernels-num')).toHaveText('15');
  // Keyboard: each press awards once; a held key's auto-repeat does not.
  await cob(page).focus();
  for(let i=0;i<3;i++)await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  await expect(page.locator('.cc-kernels-num')).toHaveText('20');
  // The first producer within a minute: buy a Farmhand.
  const farmhand=page.locator('[data-producer=farmhand]');
  await farmhand.click();
  await expect(farmhand.locator('.cc-prod-owned')).toHaveText('1');
  await expect(page.locator('.cc-cps')).toHaveText('0.10');
  await expect(page.locator('.cc-lot[data-lot=farmhand]')).toBeVisible();
  // Upgrades show their actual effect, price and unlock reason.
  const thumbs=page.locator('[data-upgrade=click-1]');
  await expect(thumbs).toBeVisible();
  await thumbs.hover();
  await expect(page.locator('.cc-tooltip')).toContainText('Clicking the cob earns ×2 kernels.');
  await expect(page.locator('.cc-tooltip')).toContainText('Price: 100 kernels');
  await expect(page.locator('.cc-tooltip')).toContainText('click the cob 15 times');
  await expect(thumbs).toHaveClass(/cc-poor/);
  while(await kernels(page)<100)await cob(page).click();
  await thumbs.click();
  await expect(page.locator('.cc-cpc')).toHaveText('2');
  // Bulk: ×10 shows the real total of ten rising prices.
  await page.getByRole('radio',{name:'×10',exact:true}).click();
  const expected=Array.from({length:10},(_,i)=>Math.ceil(15*1.15**(1+i)-1e-9)).reduce((a,b)=>a+b,0);
  await expect(farmhand.locator('.cc-cost')).toHaveText(expected.toLocaleString('en-GB'));
  await expect(farmhand.locator('.cc-prod-qty')).toHaveText('×10');
  await page.getByRole('radio',{name:'Max',exact:true}).click();
  await expect(farmhand.locator('.cc-prod-qty')).toHaveText(/×\d+/);
  await page.getByRole('radio',{name:'×1',exact:true}).click();
  // Leaving saves; time away pays 50% of base production, once.
  await page.goto('/#/collection');
  const before=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).data,KEY);
  expect(before.producers.farmhand).toBe(1);
  await page.evaluate(([k])=>{const s=JSON.parse(localStorage.getItem(k)!);s.data.lastTick-=3*3600_000;s.data.clockMax-=3*3600_000;localStorage.setItem(k,JSON.stringify(s));},[KEY]);
  await page.goto('/#/game/corn-clicker');
  const dialog=page.getByRole('dialog',{name:'Welcome back!'});
  await expect(dialog).toContainText('3 hours');
  // One Farmhand (0.1/s, plus the small Butter Bonus) at 50% for 3 hours ≈ 540 kernels.
  const offline=Number((await dialog.locator('b').first().textContent())!.replace(/[+,]/g,''));
  expect(offline).toBeGreaterThanOrEqual(540);expect(offline).toBeLessThan(600);
  await page.screenshot({path:'tests/games/corn-clicker/evidence/offline.png'});
  await dialog.getByRole('button',{name:'Collect'}).click();
  await expect(dialog).toBeHidden();
  const after=await kernels(page);
  expect(after).toBeGreaterThanOrEqual(Math.floor(Number(before.kernels))+offline);
  await page.reload();
  await expect(cob(page)).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole('dialog',{name:'Welcome back!'})).toHaveCount(0);
  expect(await kernels(page)).toBeLessThan(after+20);
  await page.screenshot({path:'tests/games/corn-clicker/evidence/desktop.png'});
  expect(errors).toEqual([]);
});

test('a second tab never runs the same farm at once and can take over without losing progress',async({page,context})=>{
  await page.goto('/#/game/corn-clicker');
  for(let i=0;i<12;i++)await cob(page).click();
  await expect(page.locator('.cc-kernels-num')).toHaveText('12');
  const second=await context.newPage();
  await second.goto('/#/game/corn-clicker');
  const busy=second.getByRole('dialog',{name:'Playing in another tab'});
  await expect(busy).toBeVisible();
  for(let i=0;i<3;i++)await cob(page).click();
  await busy.getByRole('button',{name:'Play here instead'}).click();
  await expect(busy).toBeHidden();
  await expect(second.locator('.cc-kernels-num')).toHaveText('15');
  await expect(page.getByRole('dialog',{name:'Playing in another tab'})).toBeVisible();
  await cob(second).click();
  // The passive tab's autosave never overwrites the newer progress.
  await second.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  expect(Number((await saved(second)).kernels)).toBeGreaterThanOrEqual(16);
  await second.close();
});

test('phone: tabs, touch harvesting, shop, farm and a golden cob',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
  const page=await context.newPage();
  const errors=errorsOf(page);
  await seed(page,{kernels:'114',run:{clicks:20},life:{clicks:20},golden:{next:0.4}});
  await cob(page).tap();
  await expect(page.locator('.cc-kernels-num')).toHaveText('115');
  const tabs=page.getByRole('tablist',{name:'Corn Clicker sections'});
  await tabs.getByRole('tab',{name:'Shop'}).tap();
  await expect(page.locator('#cc-pane-shop')).toBeVisible();
  await expect(page.locator('#cc-pane-cob')).toBeHidden();
  await page.locator('[data-producer=farmhand]').tap();
  await expect(page.locator('[data-producer=farmhand] .cc-prod-owned')).toHaveText('1');
  // Touch: the first tap on an upgrade explains it, the second buys it.
  const thumbs=page.locator('[data-upgrade=click-1]');
  await thumbs.tap();
  await expect(page.locator('.cc-tooltip')).toContainText('Tap again to buy.');
  await expect(thumbs).toBeVisible();
  await thumbs.tap();
  await expect(thumbs).toHaveCount(0);
  await expect(page.locator('.cc-hud-c')).toBeVisible();
  await tabs.getByRole('tab',{name:'Farm'}).tap();
  await expect(page.locator('.cc-lot[data-lot=farmhand]')).toBeVisible();
  const golden=page.getByRole('button',{name:/^Golden cob/});
  await expect(golden).toBeVisible();
  const box=(await golden.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await golden.tap();
  await expect(page.locator('.cc-toasts')).toContainText(/Lucky!|Bumper Crop|Kernel Storm/);
  await tabs.getByRole('tab',{name:'Cob'}).tap();
  const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth<=innerWidth,stage:document.querySelector('.cc-root')!.getBoundingClientRect().bottom<=innerHeight+1}));
  expect(layout).toEqual({scroll:true,stage:true});
  await page.screenshot({path:'tests/games/corn-clicker/evidence/phone.png'});
  expect(errors).toEqual([]);
  await context.close();
});

test('garden by tap and by drag, harvest, then Replant keeps discoveries and buys a permanent upgrade',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.clock.install();
  await seed(page,{kernels:'5e7',producers:{greenhouse:1,patch:10},upgrades:['feature-garden'],garden:{plots:[null,null,null,null,null,{v:'sweet',age:100}],discovered:['sweet']},run:{earned:'9e9'},life:{earned:'9e9'},achievements:['click-1'],tutorial:['click','buy','upgrade','bulk','golden']});
  await page.getByRole('tab',{name:'Garden'}).click();
  const seedButton=page.getByRole('button',{name:/^Golden Sweetcorn seed/});
  await seedButton.click();
  await expect(seedButton).toHaveAttribute('aria-pressed','true');
  const plots=page.locator('.cc-plot');
  await expect(plots).toHaveCount(9);
  await plots.nth(0).click();
  await expect(plots.nth(0)).toHaveAccessibleName(/Golden Sweetcorn, ripe in/);
  // Drag a seed into another plot with a real pointer drag.
  await seedButton.click();
  await expect(seedButton).toHaveAttribute('aria-pressed','false');
  const from=(await seedButton.boundingBox())!,to=(await plots.nth(2).boundingBox())!;
  await page.mouse.move(from.x+20,from.y+20);await page.mouse.down();
  await page.mouse.move(from.x+60,from.y,{steps:4});await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});
  await page.mouse.up();
  await expect(plots.nth(2)).toHaveAccessibleName(/Golden Sweetcorn, ripe in/);
  // Plot (2,2) was nearly grown in the save: it ripens on the clock, then harvests for kernels.
  const ripening=page.locator('[data-plot="5"]');
  await expect(ripening).toHaveAccessibleName(/Golden Sweetcorn, ripe in \d+s/);
  await page.clock.runFor(21_000);
  await expect(ripening).toHaveAccessibleName(/ripe, harvest for/);
  const before=await saved(page);
  await ripening.click();
  await expect(ripening).toHaveAccessibleName(/^Empty plot/);
  await expect.poll(async()=>(await saved(page)).life.harvests).toBe(1);
  await expect(page.locator('.cc-toasts')).toContainText(/Harvested Golden Sweetcorn: \+/);
  await expect(page.locator('.cc-book .cc-book-item').first()).toContainText('Golden Sweetcorn');
  // Replant: shows what resets and survives, the reward and the next-seed progress.
  await page.getByRole('tab',{name:'Replant'}).click();
  const panel=page.locator('#cc-sub-replant');
  await expect(panel).toContainText('+2 seeds');
  await expect(panel).toContainText('Resets');await expect(panel).toContainText('Keeps');
  await expect(panel.getByRole('meter',{name:'Progress to the next Golden Seed'})).toBeVisible();
  await panel.getByRole('button',{name:'Replant for 2 Golden Seeds'}).click();
  const confirm=page.getByRole('dialog',{name:/Replant for 2 Golden Seeds/});
  await expect(confirm).toContainText('+0% → +8%');
  await confirm.getByRole('button',{name:'Replant'}).click();
  await expect(page.locator('.cc-kernels-num')).toHaveText('0');
  await expect(panel).toContainText('You have 2');
  await panel.locator('[data-perm=green-thumbs]').click();
  await expect(page.locator('.cc-cpc')).toHaveText('2');
  const after=await saved(page);
  expect(after.seedsClaimed).toBe(2);expect(after.perms).toEqual(['green-thumbs']);expect(after.upgrades).toEqual([]);
  expect(after.garden.discovered).toContain('sweet');expect(after.achievements).toContain('click-1');
  expect(Number(after.life.earned)).toBeGreaterThanOrEqual(Number(before.life.earned));
  await page.screenshot({path:'tests/games/corn-clicker/evidence/replant.png'});
});

test('export, import, damaged-save recovery from backup and confirmed restart',async({page})=>{
  await seed(page,{kernels:'777',producers:{field:3}});
  await page.getByRole('tab',{name:'Options'}).click();
  await page.getByRole('button',{name:'Export save'}).click();
  const code=await page.getByRole('textbox',{name:'Save code'}).inputValue();
  expect(code).toMatch(/^CORNCLICKER\./);
  await page.getByRole('button',{name:'Done'}).click();
  // Restart asks first; cancelling keeps the farm.
  await page.getByRole('button',{name:'Restart game'}).click();
  await page.getByRole('dialog',{name:'Start a brand-new farm?'}).getByRole('button',{name:'Cancel'}).click();
  expect(await kernels(page)).toBeGreaterThanOrEqual(777);
  await page.getByRole('button',{name:'Restart game'}).click();
  await page.getByRole('button',{name:'Erase everything'}).click();
  await expect(page.locator('.cc-kernels-num')).toHaveText('0');
  // Import the code back.
  await page.getByRole('button',{name:'Import save'}).click();
  await page.getByRole('textbox',{name:'Save code to import'}).fill('not a code');
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('not a Corn Clicker save code');
  await page.getByRole('textbox',{name:'Save code to import'}).fill(code);
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await expect.poll(()=>kernels(page)).toBeGreaterThanOrEqual(777);
  await expect(page.locator('[data-producer=field] .cc-prod-owned')).toHaveText('3');
  // A damaged main save falls back to the newest readable backup.
  await page.goto('/#/collection');
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({version:1,data:{v:2,kernels:'garbage'},updated:Date.now()})),KEY);
  await page.goto('/#/game/corn-clicker');
  await expect(page.locator('.cc-toasts')).toContainText('backup');
  // Any earlier backup can be restored by hand from Options.
  await page.getByRole('tab',{name:'Options'}).click();
  await page.locator('.cc-backup-list li',{hasText:'Before starting a new farm'}).getByRole('button',{name:'Restore'}).click();
  await page.getByRole('dialog',{name:'Restore this backup?'}).getByRole('button',{name:'Restore backup'}).click();
  await expect.poll(()=>kernels(page)).toBeGreaterThanOrEqual(777);
  await expect(page.locator('[data-producer=field] .cc-prod-owned')).toHaveText('3');
});
