import {test,expect,seedStudyTopic} from '../../fixtures';

async function mount(page:import('@playwright/test').Page){
  await page.goto('/#/games');
  await page.evaluate(async()=>{
    const path='/src/ui/game-sheet.ts';const {createGameSheet}=await import(path);
    const host=document.createElement('div');host.id='sheet-fixture';
    Object.assign(host.style,{position:'fixed',inset:'10px',zIndex:'1000',background:'#23362f'});
    document.body.append(host);
    let plays=0;
    const sheet=createGameSheet(host,{title:'Test game',controls:{touch:'Swipe to steer.',keyboard:'Arrow keys to steer.'},onPlay(){host.dataset.plays=String(++plays);sheet.hide();}});
    sheet.show('start',{best:120});
    (window as unknown as {testSheet:typeof sheet}).testSheet=sheet;
  });
}

test('one shared primary action, input-specific controls and keyboard activation once',async({page})=>{
  await mount(page);
  const sheet=page.locator('#sheet-fixture .game-sheet');
  await expect(sheet.getByRole('heading')).toHaveText('Test game');
  await expect(sheet.getByRole('button')).toHaveCount(1);
  await expect(sheet.getByRole('button')).toHaveText('Play');
  await expect(sheet.locator('.game-sheet-controls')).toHaveText('Arrow keys to steer.');
  await expect(sheet.locator('.game-sheet-stats')).toContainText('Best120');
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(page.locator('#sheet-fixture')).toHaveAttribute('data-plays','1');
  await page.evaluate(()=>{(window as unknown as {testSheet:{show(state:string,values:object):void}}).testSheet.show('game-over',{score:75,best:120});});
  await expect(sheet.getByRole('button')).toHaveText('Play again');
  await expect(sheet.locator('.game-sheet-stats')).toContainText('Score75');
});

test('touch sheet omits desktop bindings and keeps actions inside the play area',async({browser})=>{
  const context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true});
  await seedStudyTopic(context);
  const page=await context.newPage();
  await mount(page);
  const sheet=page.locator('#sheet-fixture .game-sheet');
  await expect(sheet.locator('.game-sheet-controls')).toHaveText('Swipe to steer.');
  const box=await sheet.locator('.game-sheet-panel').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(10);expect(box!.x+box!.width).toBeLessThanOrEqual(310);
  await sheet.getByRole('button',{name:'Play',exact:true}).tap();
  await expect(page.locator('#sheet-fixture')).toHaveAttribute('data-plays','1');
  await context.close();
});

test('pause adoption preserves the shell resume button and listener',async({page})=>{
  await page.goto('/#/games');
  await page.evaluate(async()=>{
    const path='/src/ui/game-sheet.ts';const {bindGamePauseSheet}=await import(path);
    const view=document.createElement('div');view.className='game-view';view.id='pause-fixture';
    view.innerHTML='<div id="game-stage"></div><div id="pause-overlay"><div><h2>Paused</h2><button id="resume-game">Keep playing</button></div></div>';
    Object.assign(view.style,{position:'fixed',inset:'0',zIndex:'1000'});document.body.append(view);
    const button=view.querySelector<HTMLButtonElement>('#resume-game')!;
    button.addEventListener('click',()=>{view.dataset.resumed='true';});
    bindGamePauseSheet(view.querySelector<HTMLElement>('#game-stage')!,{title:'Test game',controls:{touch:'Tap to play.',keyboard:'Space to play.'}});
    view.dataset.same=String(button===view.querySelector('#resume-game'));
  });
  await expect(page.locator('#pause-fixture')).toHaveAttribute('data-same','true');
  await expect(page.locator('#pause-fixture .game-sheet-panel')).toBeVisible();
  await page.locator('#resume-game').click();
  await expect(page.locator('#pause-fixture')).toHaveAttribute('data-resumed','true');
});

test('native setup controls retain Enter and Space within the shared sheet',async({page})=>{
  await mount(page);
  await page.evaluate(()=>{
    const details=document.createElement('details');details.innerHTML='<summary>World options</summary><button type="button">Options</button>';
    document.querySelector('.game-sheet-panel')!.prepend(details);
    details.querySelector('button')!.addEventListener('click',()=>{details.dataset.activated='true';});
  });
  const summary=page.getByText('World options',{exact:true});await summary.focus();await page.keyboard.press('Enter');
  await expect(page.locator('details')).toHaveAttribute('open','');
  await page.getByRole('button',{name:'Options',exact:true}).focus();await page.keyboard.press('Space');
  await expect(page.locator('details')).toHaveAttribute('data-activated','true');
  await expect(page.locator('#sheet-fixture .game-sheet')).toBeVisible();
});

test('pause blocks the underlying result action and resumes through its own button',async({page})=>{
  await page.goto('/#/games');
  await page.evaluate(async()=>{
    const path='/src/ui/game-sheet.ts';const {createGameSheet,bindGamePauseSheet}=await import(path);
    const view=document.createElement('div');view.className='game-view';view.id='layer-fixture';
    view.style.cssText='position:fixed;inset:10px;z-index:1000;background:#23362f';
    view.innerHTML='<div class="stage-wrap" style="height:100%"><div id="layer-stage" style="position:absolute;inset:0"></div><div id="pause-overlay" hidden><button id="resume-game">Resume</button></div></div>';
    document.body.append(view);
    const host=view.querySelector<HTMLElement>('#layer-stage')!,pause=view.querySelector<HTMLElement>('#pause-overlay')!;
    const result=createGameSheet(host,{title:'Layered game',controls:{touch:'Tap to play.',keyboard:'Space to play.'},onPlay(){view.dataset.replayed='true';}});
    result.show('game-over',{score:12,best:20});
    bindGamePauseSheet(host,{title:'Layered game',controls:{touch:'Tap to play.',keyboard:'Space to play.'}});
    view.querySelector('#resume-game')!.addEventListener('click',()=>{pause.hidden=true;});
    pause.hidden=false;
  });
  const result=page.locator('#layer-stage .game-sheet');await expect(result).toHaveJSProperty('inert',true);
  await result.locator('button').evaluate((button:HTMLButtonElement)=>button.click());
  await expect(page.locator('#layer-fixture')).not.toHaveAttribute('data-replayed','true');
  await page.keyboard.press('Enter');await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(result).toHaveJSProperty('inert',false);
  await result.getByRole('button',{name:'Play again'}).click();
  await expect(page.locator('#layer-fixture')).toHaveAttribute('data-replayed','true');
});
