import {test,expect} from '../fixtures';
test.use({viewport:{width:390,height:844},hasTouch:true});
test('sheet headings and secondary actions adapt to the actual content without outlines',async({page})=>{
 await page.goto('/#/collection');
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content,body{background:#050505!important}'});
 await page.locator('.app-navigation .section-menu').click();
 for(const target of ['#menu h2','#open-accounts','#open-leaderboards']){
  await expect.poll(()=>page.locator(target).evaluate(e=>getComputedStyle(e.querySelector('.glass-label')??e).color)).toBe('rgb(255, 255, 255)');
 }
 await page.keyboard.press('Escape');
 await page.addStyleTag({content:'#content,body{background:#fafafa!important}'});
 await page.locator('.app-navigation .section-menu').click();
 await expect.poll(()=>page.locator('#open-accounts').evaluate(e=>getComputedStyle(e.querySelector('.glass-label')??e).color)).toBe('rgb(11, 16, 21)');
 await expect(page.locator('#menu .glass-vector-halo')).toHaveCount(0);
});
test('live canvas ink follows bright and dark frames',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
  canvas.getContext('2d')!.fillStyle='#fff';canvas.getContext('2d')!.fillRect(0,0,390,844);
 });
 const ink=page.locator('.game-hud strong');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(11, 16, 21)');
 await page.locator('.nc-canvas').evaluate(e=>{(e as HTMLElement).style.opacity='0';(e.parentElement as HTMLElement).style.background='#000';});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>(e as HTMLElement).style.opacity='1');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(11, 16, 21)');
 await page.locator('.nc-canvas').evaluate(e=>{const c=e as HTMLCanvasElement;const ctx=c.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await expect(ink).toHaveCSS('-webkit-text-stroke-width','0px');
});
