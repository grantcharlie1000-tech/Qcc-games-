import {test,expect} from '../../fixtures';
test.use({hasTouch:true});

test.describe('tablet layout boundary',()=>{
 test.use({hasTouch:false});
 for(const [width,height] of [[600,900],[620,900],[600,650],[650,650]])test(`previews stay beside the board at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/#/game/quadfall');
  const board=(await page.locator('.qf-board').boundingBox())!;
  for(const selector of ['.qf-hold','.qf-next','.qf-stats']){
   const panel=(await page.locator(selector).boundingBox())!;
   expect(panel.x>=board.x+board.width||panel.x+panel.width<=board.x).toBe(true);
   expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);
  }
 });
});

for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
 test(`touch controls and board remain fully usable at ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);await page.goto('/#/game/quadfall');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  for(const button of await page.locator('.qf-pad button').all()){
   const box=(await button.boundingBox())!;
   expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
   expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);
   expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
  }
  const board=(await page.locator('.qf-board').boundingBox())!,pad=(await page.locator('.qf-pad').boundingBox())!;
  const overlap=board.x<pad.x+pad.width&&board.x+board.width>pad.x&&board.y<pad.y+pad.height&&board.y+board.height>pad.y;
  expect(overlap).toBe(false);
  await page.getByRole('button',{name:'Hold',exact:true}).click();await expect(page.locator('.qf-game')).not.toHaveAttribute('data-hold','');
  await page.getByRole('button',{name:'Hard drop',exact:true}).click();await expect.poll(async()=>Number(await page.locator('.qf-game').getAttribute('data-score'))).toBeGreaterThan(0);
 });
}

test('repeated resize and fullscreen preserve the run and refresh the canvas',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native fullscreen support varies by browser.');
 await page.clock.install({time:new Date('2026-10-27T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-27T10:00:01Z'));
 await page.goto('/#/game/quadfall');await page.getByRole('button',{name:'Start',exact:true}).click();await page.keyboard.press('c');await page.keyboard.press('Space');
 const state=await page.locator('.qf-game').evaluate(el=>[el.getAttribute('data-active'),el.getAttribute('data-score'),el.getAttribute('data-hold')]);
 for(const size of [{width:390,height:844},{width:844,height:390},{width:1440,height:900},{width:320,height:568},{width:1440,height:900}]){
  await page.setViewportSize(size);
  await expect.poll(()=>page.locator('.qf-canvas').evaluate((c:HTMLCanvasElement)=>Math.abs(c.width-c.clientWidth*Math.min(devicePixelRatio,2))<2&&Math.abs(c.height-c.clientHeight*Math.min(devicePixelRatio,2))<2)).toBe(true);
  expect(await page.locator('.qf-game').evaluate(el=>[el.getAttribute('data-active'),el.getAttribute('data-score'),el.getAttribute('data-hold')])).toEqual(state);
 }
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Enter full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.getByRole('button',{name:'Exit full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 }
 expect(await page.locator('.qf-game').evaluate(el=>[el.getAttribute('data-active'),el.getAttribute('data-score'),el.getAttribute('data-hold')])).toEqual(state);
});
