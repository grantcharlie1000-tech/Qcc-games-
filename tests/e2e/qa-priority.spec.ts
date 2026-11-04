import {test,expect} from '@playwright/test';
test('initial topic opens games and Study navigation works',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:accounts:guest','true'));
 await page.goto('/');
 await page.locator('[data-study-topic="forces"]').click();
 await expect(page.locator('.game-grid')).toBeVisible();
 await page.locator('.app-tabbar [data-action=study]').click();
 await expect(page.locator('#study-title')).toHaveText('Why motion changes');
 const sections=page.locator('#study-view nav[aria-label="Sections"]');
 await expect(sections).toBeVisible();
 await sections.getByRole('link',{name:'Games',exact:true}).click();
 await expect(page.locator('.game-grid')).toBeVisible();
});
test('closing a dialog does not steal a newly focused game canvas',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','forces');});
 await page.goto('/#/game/flappy-bird');
 const stage=page.locator('#game-stage');await expect(stage).toBeVisible();
 await page.evaluate(()=>{
  const trigger=document.querySelector<HTMLElement>('.game-dock button');const dialog=document.querySelector<HTMLDialogElement>('#rules-dialog');
  trigger?.focus();dialog?.showModal();
 });
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
 await page.evaluate(()=>new Promise<void>(resolve=>{document.querySelector<HTMLDialogElement>('#rules-dialog')?.close();queueMicrotask(()=>{document.querySelector<HTMLElement>('#game-stage')?.focus();resolve();});}));
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(stage).toBeFocused();
});
test('next article preserves the common reader layout and disclosure controls',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:accounts:guest','true'));
 await page.goto('/');
 await page.locator('[data-study-topic="forces"]').click();
 await expect(page.locator('.game-grid')).toBeVisible();
 await page.locator('.app-tabbar [data-action=study]').click();
 const chapter=page.locator('.study-chapter');const initial=await chapter.getAttribute('data-article-id');
 await page.getByRole('button',{name:'Next article'}).click();
 await expect(chapter).not.toHaveAttribute('data-article-id',initial!);
 await expect(page.locator('.study-reader-layout')).toBeVisible();
 await expect(page.locator('.study-check details')).toBeVisible();
 await expect(page.locator('.study-sources a').first()).toBeVisible();
});

test('account dialog has a touch-accessible close',async({page})=>{
 await page.goto('/');const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Close sign in'}).click();await expect(dialog).not.toBeVisible();
 await expect(page.locator('[data-study-topic]')).toHaveCount(20);
});
test('browser Back and Forward navigate between games and library',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','forces');});
 await page.goto('/#/collection');await page.getByRole('link',{name:'Play Snake',exact:true}).click();
 await expect(page.locator('[data-game-id="snake"].game-view')).toBeVisible();
 await page.goBack();await expect(page.locator('.game-grid')).toBeVisible();
 await page.goForward();await expect(page.locator('[data-game-id="snake"].game-view')).toBeVisible();
});

// Social/Chat joined the shared arcade-sheet material after the original QA fixes.
// Their sheets keep main's phone-bottom placement, clear backdrop and original controls.
for(const viewport of [{width:390,height:844},{width:1366,height:900}])test(`Apps sheets retain their existing material and placement at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','forces');});
 await page.route('**/.netlify/functions/chat**',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Log in to use Chat.'})}));
 await page.goto('/');
 await expect(page.locator('.app-navigation')).toHaveAttribute('data-apps','on');
 await page.locator('.app-tabbar [data-action=apps]').click();
 const launcher=page.locator('#apps-dialog');
 await expect(launcher).toBeVisible();
 await expect.poll(()=>launcher.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 const box=(await launcher.boundingBox())!;
 expect(box.x+box.width/2).toBeCloseTo(viewport.width/2,0);
 if(viewport.width<640)expect(box.y+box.height).toBeCloseTo(viewport.height-8,0);
 else expect(box.y+box.height/2).toBeCloseTo(viewport.height/2,0);
 expect(await launcher.evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 await launcher.getByRole('button',{name:'Close apps',exact:true}).click();
 await expect(launcher).not.toBeVisible();
 // Exercise the production shared confirmation component without submitting any app action.
 await page.evaluate(async()=>{
  const {confirmSheet}=await import(String('/src/apps/sheets.ts'));
  void confirmSheet({title:'Confirm test action',text:'A local presentation test.',confirm:'Confirm',typed:{label:'Type test',match:'test'}}).then((answer:boolean)=>{document.body.dataset.confirmTestResult=String(answer);});
 });
 const confirm=page.locator('#apps-confirm');
 await expect(confirm).toBeVisible();
 await expect(confirm.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 await expect(confirm.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
 await expect.poll(()=>confirm.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 const confirmBox=(await confirm.boundingBox())!;
 if(viewport.width<640)expect(confirmBox.y+confirmBox.height).toBeCloseTo(viewport.height-8,0);
 else expect(confirmBox.y+confirmBox.height/2).toBeCloseTo(viewport.height/2,0);
 expect(await confirm.evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 expect(await confirm.getByLabel('Type test').evaluate(el=>({border:getComputedStyle(el).borderTopWidth,fill:getComputedStyle(el).backgroundColor}))).toEqual({border:'1px',fill:'rgba(0, 0, 0, 0.13)'});
 expect(await confirm.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>({border:getComputedStyle(el).borderTopWidth,fill:getComputedStyle(el).backgroundColor}))).toEqual({border:'0px',fill:'rgba(0, 0, 0, 0.13)'});
 await confirm.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(confirm).not.toBeVisible();
 await expect(page.locator('body')).toHaveAttribute('data-confirm-test-result','false');
});
