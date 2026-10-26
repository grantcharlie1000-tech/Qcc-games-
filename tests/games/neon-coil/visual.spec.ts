import { test, expect } from '../../fixtures';

for(const size of [{width:390,height:844},{width:1440,height:900}]) test(`reference HUD and rendered arena ${size.width}x${size.height}`,async({page},testInfo)=>{
  await page.setViewportSize(size);
  await page.clock.install({time:new Date('2026-10-26T10:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-26T10:00:01Z'));
  await page.goto('/#/game/neon-coil'); await page.getByRole('button',{name:'Enter arena',exact:true}).click();
  await page.clock.runFor(350);
  const pixels=await page.locator('.nc-canvas').evaluate(node=>{
    const c=node as HTMLCanvasElement,ctx=c.getContext('2d')!, dpr=c.width/c.clientWidth;
    const centre=ctx.getImageData(Math.round(c.width/2-12*dpr),Math.round(c.height/2-12*dpr),Math.round(24*dpr),Math.round(24*dpr)).data;
    const corner=ctx.getImageData(Math.round(8*dpr),Math.round(8*dpr),Math.round(40*dpr),Math.round(40*dpr)).data;
    let bright=0,base=0;
    for(let i=0;i<centre.length;i+=4) if(centre[i+2]>80&&centre[i+3]===255) bright++;
    for(let i=0;i<corner.length;i+=4) if(Math.abs(corner[i]-20)<=3&&Math.abs(corner[i+1]-25)<=3&&Math.abs(corner[i+2]-35)<=3&&corner[i+3]===255) base++;
    return {bright,base};
  });
  expect(pixels.bright).toBeGreaterThan(20); expect(pixels.base).toBeGreaterThan(20);
  expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([size.width,size.height]);
  await expect(page.locator('.nc-score .nc-difficulty')).toHaveText('CLASSIC');
  const caption=(await page.locator('.nc-difficulty').boundingBox())!,score=(await page.locator('.nc-mass').boundingBox())!;
  expect(caption.y+caption.height).toBeLessThanOrEqual(score.y+1);
  const font=await page.locator('.nc-mass').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)); expect(font).toBeGreaterThanOrEqual(24); expect(font).toBeLessThanOrEqual(30);
  expect(await page.locator('.nc-ranking').evaluate(el=>getComputedStyle(el).backgroundColor)).toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
  await expect(page.locator('.nc-ranking li')).toHaveCount(size.width<600?5:10); await expect(page.locator('.nc-you')).toBeVisible();
  const boost=page.getByRole('button',{name:'Hold to boost',exact:true}),b=(await boost.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(56); expect(b.width).toBeLessThanOrEqual(64); expect(b.height).toBe(b.width);
  expect(b.x).toBeGreaterThanOrEqual(20); expect(b.x+b.width).toBeLessThanOrEqual(size.width); expect(b.y+b.height).toBeLessThanOrEqual(size.height);
  await page.screenshot({path:testInfo.outputPath('normal.png')});
  await page.keyboard.down('Space'); await page.clock.runFor(180); await expect(boost).toHaveAttribute('aria-pressed','true');
  expect(await boost.evaluate(el=>getComputedStyle(el).boxShadow)).toContain('168, 85, 247');
  await page.screenshot({path:testInfo.outputPath('boost.png')});
  await page.keyboard.up('Space'); await page.clock.runFor(200); await expect(boost).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Escape'); await expect(page.locator('#study-view')).toBeVisible();
});

test('cached body material, boost envelope, reduced motion and world boundary',async({page})=>{
  await page.goto('/#/game/neon-coil');
  const result=await page.evaluate(async()=>{
    const renderURL='/src/games/neon-coil/render.ts',modelURL='/src/games/neon-coil/model.ts';
    const {createRenderer}=await import(renderURL),{createArena}=await import(modelURL);
    const canvas=document.createElement('canvas'),renderer=createRenderer(canvas),s=createArena(),p=s.snakes[0];
    renderer.resize(400,300); s.food=[]; for(const bot of s.snakes.slice(1)) bot.alive=false;
    p.body=[{x:0,y:0},{x:-220,y:0}];
    const ctx=canvas.getContext('2d')!,dpr=canvas.width/400;
    const pixel=(x:number,y:number)=>Array.from(ctx.getImageData(Math.round(x*dpr),Math.round(y*dpr),1,1).data);
    const originalNow=performance.now,originalGradient=CanvasRenderingContext2D.prototype.createRadialGradient;
    let now=0,gradients=0;
    performance.now=()=>now;
    CanvasRenderingContext2D.prototype.createRadialGradient=function(...args){gradients++;return originalGradient.apply(this,args);};
    try {
      renderer.draw(s); const blue:number[]=[];
      for(let x=90;x<180;x++) blue.push(pixel(x,150)[2]);
      const normal=pixel(187,150)[0];
      p.boosting=true; renderer.draw(s); const start=pixel(187,150)[0];
      now=50; renderer.draw(s); const half=pixel(187,150)[0];
      now=100; renderer.draw(s); const full=pixel(187,150)[0];
      p.boosting=false; renderer.draw(s); const release=pixel(187,150)[0];
      now=175; renderer.draw(s); const fading=pixel(187,150)[0];
      now=250; renderer.draw(s); const off=pixel(187,150)[0];
      p.boosting=true; renderer.draw(s,1,true); const reducedOn=pixel(187,150)[0];
      p.boosting=false; renderer.draw(s,1,true); const reducedOff=pixel(187,150)[0];
      p.x=p.previous.x=1450; p.body=[{x:1450,y:0},{x:1230,y:0}]; renderer.draw(s);
      return {minBlue:Math.min(...blue),normal,start,half,full,release,fading,off,reducedOn,reducedOff,gradients,outside:pixel(390,150),inside:pixel(10,10)};
    } finally {performance.now=originalNow;CanvasRenderingContext2D.prototype.createRadialGradient=originalGradient;}
  });
  // Internal overlaps must retain saturated material rather than forming dark gaps.
  expect(result.minBlue).toBeGreaterThan(90);
  expect(result.start).toBe(result.normal); expect(result.half).toBeGreaterThan(result.normal+30); expect(result.full).toBeGreaterThan(result.half+30);
  expect(result.release).toBe(result.full); expect(Math.abs(result.fading-result.half)).toBeLessThan(4); expect(result.off).toBe(result.normal);
  expect(result.reducedOn).toBe(result.full); expect(result.reducedOff).toBe(result.normal); expect(result.gradients).toBe(0);
  expect(result.outside[0]).toBeGreaterThan(50); expect(result.outside[1]).toBeLessThan(24); expect(result.outside[2]).toBeLessThan(45);
  expect(result.inside[0]).toBeLessThan(35); expect(result.inside[3]).toBe(255);
});
