import {appSettings,gameAction} from '../game-menu';
import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// The shell's Liquid Glass sheets: the four dialogs, their material, placement, contents, motion and accessibility fallbacks.
const PHONE={width:390,height:844};
const DESKTOP={width:1366,height:900};
const ACCESSIBILITY_NOTE='Reduce Transparency and forced colours are emulated through CDP, which only Chromium offers.';

// The island's Menu tab opens the menu, as a visitor does.
async function openMenuFromIsland(page:Page){
  await page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menu')).toBeVisible();
}
// A sheet's box once its entry has finished, so the box is the layout box and not a point mid-transition.
async function settledBox(sheet:Locator){
  await expect.poll(()=>sheet.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  const box=await sheet.boundingBox();
  if(!box)throw new Error('The sheet has no box');
  return box;
}
// The origin the sheet grows from, as the two numbers in its --sheet-origin custom property.
async function originOf(sheet:Locator){
  const value=await sheet.evaluate(el=>el.style.getPropertyValue('--sheet-origin'));
  const [x,y]=value.split(' ').map(part=>parseFloat(part));
  return {value,x,y};
}
async function expectGlassSheet(dialog:Locator){
  await expect(dialog).toHaveClass(/\bui-glass-sheet\b/);
  // The approved clear sheet: --glass-clear-blur with a slight saturation.
  expect(await dialog.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('blur(1.5px) saturate(1.08)');
  const family=await dialog.locator('h2').first().evaluate(el=>getComputedStyle(el).fontFamily);
  expect(family).toContain('-apple-system');
  expect(family).not.toContain('Arcade');
}
// The menu's tinted buttons that are showing, by their text.
const tintedMenuActions=(page:Page)=>page.locator('#menu .game-button:not(.secondary)').evaluateAll(buttons=>buttons.filter(button=>button.getClientRects().length>0).map(button=>button.textContent?.trim()));

test('the four shell dialogs are glass sheets with the blur and the system font',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  await expectGlassSheet(page.locator('#menu'));
  await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  await expectGlassSheet(page.locator('#accounts-dialog'));
  await page.getByRole('button',{name:'Play as guest',exact:true}).click();
  await openMenuFromIsland(page);
  await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
  await expectGlassSheet(page.locator('#leaderboard-dialog'));
  await page.getByRole('button',{name:'Close leaderboards',exact:true}).click();
  await page.goto('/#/game/fruit-merge');
  await expect(page.getByRole('img',{name:/Fruit basket/})).toBeVisible();
  await gameAction(page,'Game rules');
  await expectGlassSheet(page.locator('#rules-dialog'));
});

// A sheet's accessible name is its heading, so a screen reader announces what the sheet is.
test('the menu and the rules sheet are named by their headings',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  await expect(page.getByRole('dialog',{name:'Mauri Study Notes',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/#/game/fruit-merge');
  await expect(page.getByRole('img',{name:/Fruit basket/})).toBeVisible();
  await gameAction(page,'Game rules');
  await expect(page.getByRole('dialog',{name:'How to play',exact:true})).toBeVisible();
});

test('at 390 px the menu is a bottom sheet inset from the screen edges, and it scrolls inside itself',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const menu=page.locator('#menu');
  const box=await settledBox(menu);
  expect(box.x).toBeCloseTo(8,0);
  expect(box.width).toBeCloseTo(374,0);
  expect(box.y+box.height).toBeCloseTo(836,0);
  expect(await menu.evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).toBe('32px');
  // The wheel moves the sheet. Once it is at its end, the page behind it stays where it was.
  expect(await menu.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,2000);
  await expect.poll(()=>menu.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(0,600);
  expect(await page.evaluate(()=>window.scrollY)).toBe(0);
});

test('at 1366 px the menu is a centred panel at most 440 px wide, with a 28 px radius',async({page})=>{
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openMenuFromIsland(page);
  const menu=page.locator('#menu');
  const box=await settledBox(menu);
  expect(box.width).toBeLessThanOrEqual(440);
  expect(box.x+box.width/2).toBeCloseTo(683,0);
  expect(box.y+box.height/2).toBeCloseTo(450,0);
  expect(await menu.evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).toBe('28px');
});

test('the menu grows from the control that opened it in the island and in-game dock',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  const menu=page.locator('#menu');
  const tab=await page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true}).boundingBox();
  if(!tab)throw new Error('The island Menu tab has no box');
  await openMenuFromIsland(page);
  const box=await settledBox(menu);
  const fromIsland=await originOf(menu);
  // The origin is the tab's centre measured from the sheet's corner. The companion Menu sits beside the five-tab island, at the bottom right.
  expect(Math.abs(fromIsland.x-(tab.x+tab.width/2-box.x))).toBeLessThanOrEqual(1);
  expect(Math.abs(fromIsland.y-(tab.y+tab.height/2-box.y))).toBeLessThanOrEqual(1);
  expect(fromIsland.x).toBeGreaterThan(box.width*0.75);
  expect(fromIsland.y).toBeGreaterThan(box.height*0.75);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.goto('/#/game/fruit-merge');
  await expect(page.getByRole('img',{name:/Fruit basket/})).toBeVisible();
  const gameMenu=await page.locator('#game-menu').boundingBox();
  if(!gameMenu)throw new Error('The game menu button has no box');
  await page.locator('#game-menu').click();
  const gameSheet=page.locator('#game-options');
  const gameBox=await settledBox(gameSheet);
  const fromGame=await originOf(gameSheet);
  // The compact game group anchors the sheet at the actual Menu centre.
  const expectedX=Math.min(Math.max(gameMenu.x+gameMenu.width/2-gameBox.x,0),gameBox.width);
  const expectedY=Math.min(Math.max(gameMenu.y+gameMenu.height/2-gameBox.y,0),gameBox.height);
  expect(Math.abs(fromGame.x-expectedX)).toBeLessThanOrEqual(1);
  expect(Math.abs(fromGame.y-expectedY)).toBeLessThanOrEqual(1);
  expect(fromGame.x).toBeGreaterThan(gameBox.width*0.5);
  expect(fromGame.y).toBeGreaterThan(gameBox.height*0.75);
});

test('the settings are still native checkboxes: a click and Space toggle them, and the track is green when on',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const sound=page.getByRole('checkbox',{name:'Sound',exact:true});
  await expect(sound).not.toBeChecked();
  await sound.click();
  await expect(sound).toBeChecked();
  await sound.focus();
  await page.keyboard.press('Space');
  await expect(sound).not.toBeChecked();
  await sound.click();
  expect(await sound.evaluate(el=>getComputedStyle(el).appearance)).toBe('none');
  expect(await sound.evaluate(el=>[getComputedStyle(el).width,getComputedStyle(el).height])).toEqual(['51px','31px']);
  // The track fades over 200 ms, so its colour is read once it has arrived.
  await expect.poll(()=>sound.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(0, 212, 146)');
});

test('a guest menu retains its actions without offering an offline download',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const tinted=await page.locator('#menu .game-button:not(.secondary)').evaluateAll(buttons=>buttons.filter(button=>button.getClientRects().length>0).map(button=>button.textContent?.trim()));
  expect(tinted).toEqual([]);
  await expect(page.getByRole('button',{name:'Log in / Sign up',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Study Mode',exact:true})).toBeVisible();
});

test('online and visibility events do not offer retired download or worker update controls',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  await page.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.offline-button,#reload-update,#update-notice,#download-progress')).toHaveCount(0);
  expect(await tintedMenuActions(page)).toEqual([]);
});

test('the primary rules action uses contrasting neutral ink in a 48 px capsule',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/#/game/fruit-merge');
  await expect(page.getByRole('img',{name:/Fruit basket/})).toBeVisible();
  await gameAction(page,'Game rules');
  const done=page.getByRole('button',{name:'Let’s play',exact:true});
  expect(await done.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderTopLeftRadius,s.minHeight];})).toEqual(['rgb(17, 19, 22)','rgb(255, 255, 255)','999px','48px']);
  expect(await page.locator('#rules-text').evaluate(el=>{const s=getComputedStyle(el);return [s.fontSize,s.color];})).toEqual(['17px','rgb(17, 19, 22)']);
});

test('the sheet leaves the page undimmed behind a plain backdrop, and no control inside it has a backdrop filter of its own',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const menu=page.locator('#menu');
  // The clear material keeps the page behind it undimmed: the ::backdrop
  // transition settles on a transparent colour, not a dark scrim.
  await expect(menu).toBeVisible();await expect.poll(()=>menu.evaluate(el=>el.getAnimations().length)).toBe(0);
  expect(await menu.evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await menu.evaluate(el=>getComputedStyle(el,'::backdrop').backdropFilter)).toBe('none');
  // The only nested filter is the close button's own clear-glass lens (or, in
  // WebKit's frost mode, the button itself: the
  // shared control material); no row, field or button has one.
  const nested=await menu.evaluate(el=>[...el.querySelectorAll('*')].filter(child=>getComputedStyle(child).backdropFilter!=='none').map(child=>({lens:child.matches('.sheet-close-glass,.sheet-close-glass>.ui-glass-lens'),filter:getComputedStyle(child).backdropFilter})));
  expect(nested.map(n=>n.lens)).toEqual([true]);
  expect(nested[0].filter).toMatch(/^blur\(1\.5px\) (url\("#ui-glass-\d+"\) )?saturate\(1\.08\)$/);
});

test('a keyboard focus ring is a 2 px contrasting outline on the sheet\'s buttons, and its search field takes an inner ring',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  // The first control in the sheet, the close button, has focus. The next Tab reaches the search field.
  await page.keyboard.press('Tab');
  const search=page.getByRole('searchbox');
  await expect(search).toBeFocused();
  expect(await search.evaluate(el=>[getComputedStyle(el).outlineStyle,getComputedStyle(el).boxShadow])).toEqual(['none',expect.stringContaining('rgb(17, 19, 22) 0px 0px 0px 1px inset')]);
  // Shift+Tab returns to the close button. As a clear glass control it takes the
  // shared white outline with a 6px black ring, contrasting over any backdrop.
  await page.keyboard.press('Shift+Tab');
  const close=page.getByRole('button',{name:'Close menu',exact:true});
  await expect(close).toBeFocused();
  expect(await close.evaluate(el=>[getComputedStyle(el).outlineStyle,getComputedStyle(el).outlineWidth,getComputedStyle(el).outlineColor,getComputedStyle(el).outlineOffset])).toEqual(['solid','2px','rgb(255, 255, 255)','2px']);
  expect(await close.evaluate(el=>getComputedStyle(el).boxShadow)).toBe('rgb(0, 0, 0) 0px 0px 0px 6px');
});

test('Reduce Transparency gives an opaque sheet with no blur (Chromium only)',async({page,browserName})=>{
  test.skip(browserName!=='chromium',ACCESSIBILITY_NOTE);
  await page.setViewportSize(PHONE);
  await page.goto('/');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  await openMenuFromIsland(page);
  const menu=page.locator('#menu');
  expect(await menu.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(28, 28, 32)');
  expect(await menu.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
});

test('Increase Contrast gives an opaque sheet, a 2 px edge and brighter small text',async({page})=>{
  await page.emulateMedia({contrast:'more'});
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const menu=page.locator('#menu');
  expect(await menu.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).backdropFilter,getComputedStyle(el).borderTopWidth])).toEqual(['rgb(18, 18, 20)','none','2px']);
  expect(await page.locator('#study-menu-summary').evaluate(el=>getComputedStyle(el).color)).toBe('rgba(255, 255, 255, 0.9)');
});

test('forced colours give the sheet the system Canvas, CanvasText and border',async({page})=>{
  await page.emulateMedia({forcedColors:'active'});
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const menu=page.locator('#menu');
  // A probe element asks the browser for the system colours, so the expectation does not hard-code a palette.
  const system=await page.evaluate(()=>{
    const probe=document.createElement('p');
    probe.style.background='Canvas';probe.style.color='CanvasText';probe.style.borderTop='2px solid CanvasText';
    // System colours follow color-scheme, so ask from inside the sheet itself.
    document.querySelector('#menu')!.append(probe);
    const style=getComputedStyle(probe);
    const result={background:style.backgroundColor,color:style.color,border:style.borderTopColor};
    probe.remove();
    return result;
  });
  expect(await menu.evaluate(el=>{const style=getComputedStyle(el);return {background:style.backgroundColor,color:style.color,border:style.borderTopColor};})).toEqual(system);
});

test('forced colours keep each switch visible as a bordered track',async({page})=>{
  await page.emulateMedia({forcedColors:'active'});
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  // The track has no fill of its own under forced colours, so its border is what shows where it is.
  const sound=page.getByRole('checkbox',{name:'Sound',exact:true});
  expect(await sound.evaluate(el=>{const style=getComputedStyle(el);return [style.borderTopStyle,style.borderTopWidth];})).toEqual(['solid','2px']);
});

for(const mode of ['media','class'] as const) test(`Reduce Motion (${mode}) gives the sheet no transitions, so it opens and closes at once`,async({page})=>{
  if(mode==='media')await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  if(mode==='class'){
    // The app's own setting: the menu's Reduce motion switch puts the class on <html>, and the menu keeps it when it reopens.
    await page.getByRole('checkbox',{name:'Reduce motion',exact:true}).check();
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
    await page.keyboard.press('Escape');
    await openMenuFromIsland(page);
  }
  const menu=page.locator('#menu');
  expect(await menu.evaluate(el=>getComputedStyle(el).transitionProperty)).toBe('none');
  // The sheet's own box has no transition. Its dim is a plain background fade, which the global rule does not reach, so it is not counted.
  expect(await menu.evaluate(el=>document.getAnimations().filter(animation=>{const effect=animation.effect as KeyframeEffect|null;return effect?.target===el&&['opacity','scale','translate','display','overlay'].includes((animation as CSSTransition).transitionProperty);}).length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

type SheetTransition={property:string;duration:number;from:string};
test('the sheet enters from just inside its place by scale, translate and opacity, and leaves faster than it came',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  // Each read happens in the same task as the open or close, so the transitions it reports are still running.
  const entry=await page.evaluate<SheetTransition[]>(()=>{
    document.querySelector<HTMLElement>('.app-navigation [data-action="menu"]')!.click();
    return document.getAnimations().flatMap(animation=>{
      const effect=animation.effect as KeyframeEffect|null;
      if(effect?.target!==document.getElementById('menu')||effect.pseudoElement)return [];
      const property=(animation as CSSTransition).transitionProperty;
      const from=effect.getKeyframes()[0] as Record<string,unknown>;
      return [{property,duration:Number(effect.getTiming().duration),from:String(from[property]??'')}];
    });
  });
  expect(entry.map(transition=>transition.property)).toEqual(expect.arrayContaining(['scale','translate','opacity']));
  // It starts just inside its place, never from nothing.
  const scale=entry.find(transition=>transition.property==='scale')!;
  expect(parseFloat(scale.from)).toBeGreaterThanOrEqual(0.9);
  expect(parseFloat(scale.from)).toBeLessThan(1);
  await expect.poll(()=>page.locator('#menu').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  const exit=await page.evaluate<SheetTransition[]>(()=>{
    (document.getElementById('menu') as HTMLDialogElement).close();
    return document.getAnimations().flatMap(animation=>{
      const effect=animation.effect as KeyframeEffect|null;
      if(effect?.target!==document.getElementById('menu')||effect.pseudoElement)return [];
      const property=(animation as CSSTransition).transitionProperty;
      const from=effect.getKeyframes()[0] as Record<string,unknown>;
      return [{property,duration:Number(effect.getTiming().duration),from:String(from[property]??'')}];
    });
  });
  await expect(page.locator('#menu')).toBeHidden();
  // A closing dialog stays on screen for its exit only where the overlay property can keep it in the top layer. Elsewhere (WebKit)
  // it leaves at once, with no exit transitions to compare.
  if(!await page.evaluate(()=>CSS.supports('overlay','auto'))){expect(exit).toEqual([]);return;}
  // Leaving has to animate first. With no exit transitions the timing check below compares nothing, because Math.max() of an empty list is -Infinity.
  expect(exit.map(transition=>transition.property)).toEqual(expect.arrayContaining(['scale','opacity']));
  // Leaving is quicker than arriving.
  expect(Math.max(...exit.map(transition=>transition.duration))).toBeLessThan(Math.max(...entry.map(transition=>transition.duration)));
});

test('Escape closes the menu and returns focus to the island Menu',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true})).toBeFocused();
});

test('the accounts and leaderboard dialogs use glass fields and hairlines',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  const username=page.locator('#account-username');
  await expect(username).toBeVisible();
  // Fields use the shared --sheet-control fill.
  expect(await username.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0.13)');
  await page.getByRole('button',{name:'Play as guest',exact:true}).click();
  await openMenuFromIsland(page);
  await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
  await expect(page.locator('#leaderboard-dialog')).toBeVisible();
  expect(await page.locator('#leaderboard-game').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0.13)');
  expect(await page.locator('#leaderboard-dialog thead th').first().evaluate(el=>getComputedStyle(el).borderBottomColor)).toBe('rgba(0, 0, 0, 0.12)');
});

// Game-owned menu panels opt into arcade glass; Study remains separate.
test('Minesweeper options use arcade glass while Study privacy keeps its own look',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/#/game/minesweeper');
  await expect(page.locator('.ms-board')).toBeVisible();
  await gameAction(page,'Game options');
  const settings=page.locator('.ms-settings');
  await expect(settings).toBeVisible();
  expect(await settings.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).borderTopLeftRadius])).toEqual(['rgba(8, 12, 18, 0.2)','32px']);
  expect(await settings.evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  await page.goto('/');
  await page.locator('.app-tabbar').getByRole('button',{name:'Study',exact:true}).click();
  await expect(page.locator('#study-view')).toBeVisible();
  await page.getByRole('button',{name:'Reading storage choices',exact:true}).first().click();
  const privacy=page.locator('.study-privacy-dialog');
  await expect(privacy).toBeVisible();
  expect(await privacy.evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).toBe('6px');
});

// The arcade is guest-first, so the account sheet's one tinted action is Play as guest. The form's submit is neutral glass.
test('the account sheet tints only Play as guest',async({page})=>{
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  const dialog=page.locator('#accounts-dialog');
  await expect(dialog).toBeVisible();
  const tinted=await dialog.locator('.game-button:not(.secondary)').evaluateAll(buttons=>buttons.filter(button=>button.getClientRects().length>0).map(button=>button.textContent?.trim()));
  expect(tinted).toEqual(['Play as guest']);
});

// Forced colours drop the sheet's fills, so its controls and fields get a 2 px ButtonText edge. Checkboxes keep their own track.
test('forced colours give the sheet controls and fields a 2 px ButtonText border',async({page})=>{
  await page.emulateMedia({forcedColors:'active'});
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await openMenuFromIsland(page);
  const system=await page.evaluate(()=>{const probe=document.createElement('p');probe.style.borderTop='2px solid ButtonText';document.querySelector('#menu')!.append(probe);const colour=getComputedStyle(probe).borderTopColor;probe.remove();return colour;});
  for(const control of [page.locator('#open-accounts'),page.locator('#search'),page.getByRole('button',{name:'Close menu',exact:true})]){
    expect(await control.evaluate(el=>{const style=getComputedStyle(el);return [style.borderTopStyle,style.borderTopWidth,style.borderTopColor];})).toEqual(['solid','2px',system]);
  }
});
