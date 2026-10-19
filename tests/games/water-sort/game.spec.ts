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
  expect(solved.some(t=>t.length>0&&t.length<4)).toBe(true);
  await expect(page.locator('.ws-victory')).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(root(page)).toHaveAttribute('data-phase','ready');
  await hintPour(page);
  await expect(root(page)).toHaveAttribute('data-phase','won');
  await page.getByRole('button',{name:'Next level',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Level',exact:true})).toHaveValue('1');
  await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('0');
  await hintPour(page);
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
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
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await expect(root(page)).toHaveAttribute('data-phase','paused');
  await page.clock.runFor(1000);
  expect(await readBoard(page)).toEqual(initial);
  await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await page.clock.runFor(350);
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
  await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('7');
  const initial=await readBoard(page);
  await hintPour(page);
  const progressed=await readBoard(page);
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await expect(page.getByRole('combobox',{name:'Level',exact:true})).toHaveValue('7');
  expect(await readBoard(page)).toEqual(progressed);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await readBoard(page)).toEqual(initial);
  for(let i=0;i<3;i++){
    await page.getByRole('link',{name:'Back to game library',exact:true}).click();
    await page.getByRole('link',{name:'Play Water Sort',exact:true}).click();
    await expect(root(page)).toHaveCount(1);
  }
  await hintPour(page);
  await expect(root(page)).toHaveAttribute('data-moves','1');
  expect(errors).toEqual([]);
});

test('all level controls and rules work, keyboard can select and pour',async({page})=>{
  await open(page);
  await page.getByRole('combobox',{name:'Difficulty',exact:true}).selectOption('Deep');
  await expect(page.getByRole('combobox',{name:'Level',exact:true})).toHaveValue('6');
  await page.getByRole('combobox',{name:'Difficulty',exact:true}).selectOption('Flow');
  await expect(page.getByRole('combobox',{name:'Level',exact:true})).toHaveValue('3');
  await page.getByRole('combobox',{name:'Difficulty',exact:true}).selectOption('Gentle');
  await tube(page,0).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(tube(page,2)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await page.getByRole('button',{name:'Game rules',exact:true}).click();
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
  await page.getByRole('button',{name:'Open menu',exact:true}).tap();
  await page.getByLabel('Colour-blind patterns').check();
  await page.getByRole('button',{name:'Close menu',exact:true}).tap();
  await expect(root(page)).toHaveAttribute('data-patterns','true');
  await expect(page.locator('.ws-pattern').first()).toBeVisible();
  await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('4');
  await page.getByRole('button',{name:'Hint',exact:true}).tap();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await root(page).evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(366);
  await expect(tube(page,0)).toHaveAccessibleName(/bottom to top/);
  await page.screenshot({path:'tests/games/water-sort/evidence/chromium.png',fullPage:true});
  await context.close();
});
