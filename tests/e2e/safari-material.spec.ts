import {test,expect} from '../fixtures';

test.use({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});

test('navigation transmits the artwork instead of darkening it into a flat pill',async({page,browserName})=>{
  await page.goto('/#/collection');
  const nav=page.locator('.app-tabbar');
  await expect(nav).toHaveAttribute('data-glass-mode',browserName==='chromium'?'svg':'blur');
  await page.addStyleTag({content:'.section-navigation .ui-tab>*{visibility:hidden!important}.section-navigation .section-menu>svg{visibility:hidden!important}'});
  const art=await page.evaluateHandle(()=>{
    const art=document.createElement('div');art.style.cssText='position:fixed;inset:0;z-index:40;pointer-events:none';document.body.append(art);return art;
  });
  for(const rgb of [[18,36,54],[226,180,40],[38,178,224]]){
    await art.evaluate((e,rgb)=>{e.style.background=`rgb(${rgb.join(' ')})`;},rgb);
    const png=(await nav.screenshot({scale:'css',animations:'disabled'})).toString('base64');
    const sampled=await page.evaluate(async png=>{
      const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
      return [...ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data].slice(0,3);
    },png);
    // A clear lens may gently brighten/saturate. A 20–36% dark veil destroys
    // the artwork's values and must fail this rendered-pixel check.
    for(let i=0;i<3;i++)expect(Math.abs(sampled[i]-rgb[i]),`${browserName}: ${sampled} through ${rgb}`).toBeLessThan(24);
  }
});
