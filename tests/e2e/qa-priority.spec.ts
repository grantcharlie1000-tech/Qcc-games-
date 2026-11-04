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
