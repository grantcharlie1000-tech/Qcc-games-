import sharp from 'sharp';
import {expect,originalTheme,test} from '../fixtures';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

test('a nonselected dark label crossing the raised rim stays a single legible stroke',async({context,page},info)=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(()=>scrollTo(0,210));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(210);
  await page.waitForTimeout(450);
  if(await bar.getAttribute('data-minimized')==='true'){
    await bar.locator('..').locator('.ui-tabbar-mini').click();
    await page.mouse.move(390,420);
  }
  await expect(bar).not.toHaveAttribute('data-minimized','true');
  await page.locator('.game-grid').evaluate(grid=>{
    const pad=document.createElement('div');
    pad.style.cssText='position:fixed;inset:auto 0 0;height:150px;z-index:2;background:#191919;pointer-events:none';
    grid.append(pad);
  });
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(500);
  const box=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.waitForTimeout(500);
  await page.mouse.move(x+138,y,{steps:4});
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await page.waitForTimeout(400);
  // Stop at the right rim of TV Shows even if the initial motion springs further in the desktop harness.
  const selected=bar.getByRole('link',{name:'TV Shows',exact:true});
  if(await selected.getAttribute('data-lens-target')===null){
    await page.mouse.move(x+125,y,{steps:3});
    await page.waitForTimeout(400);
  }
  await expect(selected).toHaveAttribute('data-lens-target','');
  const crossing=bar.getByRole('link',{name:'My list',exact:true});
  await expect(crossing).not.toHaveAttribute('data-lens-target','');
  await expect.poll(()=>crossing.evaluate(el=>el.style.filter)).toContain('section-lens-warp');
  await page.waitForTimeout(500);
  const label=(await crossing.locator(':scope>span').boundingBox())!;
  const clip={x:Math.floor(label.x)-2,y:Math.floor(label.y),width:Math.ceil(label.width)+5,height:Math.ceil(label.height)+1};
  const actual=await page.screenshot({clip,scale:'css',path:info.outputPath('bent-label.png')});
  const style=await page.addStyleTag({content:'.app-tabbar .ui-tab:not([data-lens-target]){filter:none!important}'});
  await expect.poll(()=>crossing.evaluate(el=>getComputedStyle(el).filter)).toBe('none');
  await page.waitForTimeout(100);
  const plain=await page.screenshot({clip,scale:'css',path:info.outputPath('plain-label.png')});
  await style.evaluate(el=>{el.parentNode?.removeChild(el);});
  await page.mouse.up();
  // The chromatic rim may tint white text cyan. Compare its high-lightness footprint rather than RGB equality.
  const ink=async (png:Buffer)=>{
    const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const mask=[];
    for(let i=0;i<data.length;i+=info.channels)mask.push(Math.max(data[i],data[i+1],data[i+2])>=145);
    return mask;
  };
  const a=await ink(actual),b=await ink(plain);
  const union=a.reduce((n,v,i)=>n+Number(v||b[i]),0),intersection=a.reduce((n,v,i)=>n+Number(v&&b[i]),0);
  expect(union).toBeGreaterThan(40);
  console.log('crossing label footprint overlap',intersection/union,{intersection,union});
  expect(intersection/union).toBeGreaterThan(.72);
});
