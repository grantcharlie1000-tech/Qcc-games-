import {appSettings,backToGames,gameAction,gameOption,openGameMenu,pauseGame,resumeGame} from '../../game-menu';
import {seedStudyTopic} from '../../fixtures';
import { test, expect } from '../../fixtures';
import type { Page } from '@playwright/test';

const root = (page:Page) => page.locator('.ws-game');
const tube = (page:Page, index:number) => page.locator(`[data-tube="${index}"]`);
const readBoard = (page:Page) => page.locator('.ws-tube').evaluateAll(elements => elements.map(el => {
  const text = (el as HTMLElement).dataset.colours!;
  return text ? text.split(',').map(Number) : [];
}));
async function open(page:Page) {
  await page.goto('/#/game/water-sort');
  await expect(root(page)).toHaveAttribute('data-phase','ready');
}
async function hintPour(page:Page) {
  await page.getByRole('button',{name:'Hint',exact:true}).click();
  const from=Number(await page.locator('.ws-hint-from').getAttribute('data-tube'));
  const to=Number(await page.locator('.ws-hint-to').getAttribute('data-tube'));
  await tube(page,from).click(); await tube(page,to).click();
  await expect(root(page)).not.toHaveAttribute('data-phase','pouring');
}

test('real illegal pour, winning hints, undo, next level and restart', async({page}) => {
  await open(page);
  const initial=await readBoard(page);
  await tube(page,0).click(); await tube(page,1).click();
  await expect(root(page)).toHaveAttribute('data-moves','0');
  await expect(page.locator('.ws-message')).toContainText('full');
  await tube(page,0).click();
  for(let i=0;i<10 && await root(page).getAttribute('data-phase')!=='won';i++) await hintPour(page);
  await expect(root(page)).toHaveAttribute('data-phase','won');
  const solved=await readBoard(page);
  expect(solved.every(t=>new Set(t).size<=1)).toBe(true);
  expect(solved.every(t=>t.length===0||t.length===4)).toBe(true);
  await expect(page.locator('.ws-victory')).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(root(page)).toHaveAttribute('data-phase','ready');
  await hintPour(page);
  await expect(root(page)).toHaveAttribute('data-phase','won');
  await page.getByRole('button',{name:'Next level',exact:true}).click();
  await expect(page.locator('.ws-level')).toHaveValue('1');
  await gameOption(page,'Level','0');
  await hintPour(page);
  await gameAction(page,'Restart game');
  await expect(root(page)).toHaveAttribute('data-moves','0');
  expect(await readBoard(page)).toEqual(initial);
});

test('pending animation freezes under pause and commits only once on resume',async({page})=>{
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await open(page);
  const initial=await readBoard(page);
  await tube(page,0).click(); await tube(page,2).click();
  await expect(root(page)).toHaveAttribute('data-phase','pouring');
  await expect(root(page)).toHaveAttribute('data-moves','0');
  await pauseGame(page);
  await expect(root(page)).toHaveAttribute('data-phase','paused');
  await page.clock.runFor(1000);
  expect(await readBoard(page)).toEqual(initial);
  await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeDisabled();
  await resumeGame(page);
  await page.clock.runFor(1500);
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await expect(root(page)).toHaveAttribute('data-phase','ready');
  await page.clock.runFor(1000);
  await expect(root(page)).toHaveAttribute('data-moves','1');
  expect(await readBoard(page)).not.toEqual(initial);
});

test('legal progress and undo history survive reload and repeated navigation',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await open(page);
  await gameOption(page,'Level','7');
  const initial=await readBoard(page);
  await hintPour(page);
  const progressed=await readBoard(page);
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await expect(page.locator('.ws-level')).toHaveValue('7');
  expect(await readBoard(page)).toEqual(progressed);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await readBoard(page)).toEqual(initial);
  for(let i=0;i<3;i++){
    await backToGames(page);
    await page.getByRole('link',{name:'Play Water Sort',exact:true}).click();
    await expect(root(page)).toHaveCount(1);
  }
  await hintPour(page);
  await expect(root(page)).toHaveAttribute('data-moves','1');
  expect(errors).toEqual([]);
});

test('all level controls and rules work, keyboard can select and pour',async({page})=>{
  await open(page);
  await gameOption(page,'Difficulty','Deep');
  await expect(page.locator('.ws-level')).toHaveValue('6');
  await gameOption(page,'Difficulty','Flow');
  await expect(page.locator('.ws-level')).toHaveValue('3');
  await gameOption(page,'Difficulty','Gentle');
  await tube(page,0).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(tube(page,2)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await gameAction(page,'Game rules');
  await expect(page.locator('#rules-dialog')).toBeVisible();
  await expect(page.locator('#rules-text')).toContainText('four bands');
  await expect(root(page)).toHaveAttribute('data-phase','paused');
  await page.getByRole('button',{name:'Let’s play',exact:true}).click();
  await expect(root(page)).toHaveAttribute('data-phase','ready');
});

test('actual mouse drag pours; malformed saved data starts safely',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:save:water-sort',JSON.stringify({version:1,data:{version:1,level:80,tubes:'bad',history:[]}})));
  await open(page);
  const a=(await tube(page,0).boundingBox())!,b=(await tube(page,2).boundingBox())!;
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});
  await page.mouse.up();
  await expect(root(page)).toHaveAttribute('data-moves','1');
});

test('touch, colour labels, patterns, phone fit and screenshot',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});await seedStudyTopic(context);
  const page=await context.newPage();
  await open(page);
  await tube(page,0).tap(); await tube(page,2).tap();
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await appSettings(page);
  await page.getByLabel('Colour-blind patterns').check();
  await page.getByRole('button',{name:'Close menu',exact:true}).tap();
  await expect(root(page)).toHaveAttribute('data-patterns','true');
  await expect(page.locator('.ws-pattern').first()).toBeVisible();
  await gameOption(page,'Level','4');
  await page.getByRole('button',{name:'Hint',exact:true}).tap();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await root(page).evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await expect(tube(page,0)).toHaveAccessibleName(/bottom to top/);
  await page.screenshot({path:'tests/games/water-sort/evidence/chromium.png',fullPage:true});
  await context.close();
});

test('all 77 levels are selectable and the final added level wins, restores and wraps to level 1',async({page})=>{
 test.setTimeout(90000);await page.emulateMedia({reducedMotion:'reduce'});await open(page);
 await openGameMenu(page);const levels=page.locator('#game-options').getByRole('combobox',{name:'Level',exact:true});await expect(levels.locator('option')).toHaveCount(77);
 await levels.selectOption('76');await expect(page.locator('.ws-level-name')).toHaveText('Level 77');
 await page.reload();await expect(page.locator('.ws-level')).toHaveValue('76');
 for(let i=0;i<40&&await root(page).getAttribute('data-phase')!=='won';i++)await hintPour(page);
 await expect(root(page)).toHaveAttribute('data-phase','won');
 await page.getByRole('button',{name:'Play again',exact:true}).click();await expect(page.locator('.ws-level')).toHaveValue('0');
});

for(const width of [320,390,1366])test(`dock owns Undo and Hint, with room for tubes at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===1366?768:844});await open(page);
 await expect(page.locator('.ws-actions,.ws-footer')).toHaveCount(0);
 const menu=page.locator('#game-menu'),menuBox=(await menu.boundingBox())!;
 const radius=await menu.evaluate(e=>getComputedStyle(e).borderRadius);
 for(const name of ['Undo','Hint']){
  const action=page.locator('.game-dock').getByRole('button',{name,exact:true});
  await expect(action).toBeVisible();await expect(action).toHaveClass(/ui-tab arcade-glass game-glass/);
  await expect(action).toHaveText('');await expect(action).toHaveCSS('border-radius',radius);
  const box=(await action.boundingBox())!;expect(box.width).toBe(menuBox.width);expect(box.height).toBe(menuBox.height);
 }
 expect(await page.locator('.game-dock').evaluate(e=>[...e.children].map(e=>e.getAttribute('aria-label')))).toEqual(['Games','Undo','Game information','Hint','Menu']);
 const hud=page.locator('.game-compact-hud');await expect(hud).toHaveText('Level 1');
 const dock=(await page.locator('.game-dock').boundingBox())!;expect(menuBox.x+menuBox.width).toBeLessThanOrEqual(dock.x+dock.width+1);
 const tube=(await page.locator('.ws-tube').first().boundingBox())!;if(width===390)expect(tube.height).toBeGreaterThan(280);
 expect(await page.locator('.ws-message').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
});
