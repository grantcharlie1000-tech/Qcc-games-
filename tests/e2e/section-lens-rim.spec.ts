import {expect,originalTheme,test} from '../fixtures';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

for(const colorScheme of ['light','dark'] as const)test(`the raised ${colorScheme} lens lights its curved shoulders in a thin refractive band`,async({context,page},info)=>{
  await originalTheme(context);
  await page.emulateMedia({colorScheme});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  // An even dark page isolates the lens's own light, rather than a page stroke or glyph.
  await page.locator('.game-grid').evaluate(grid=>{
    const pad=document.createElement('div');
    pad.style.cssText='position:fixed;inset:auto 0 0;height:150px;z-index:2;background:#202c3a;pointer-events:none';
    grid.append(pad);
  });
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(500);
  const tab=bar.getByRole('link',{name:'Games',exact:true});
  const r=(await tab.boundingBox())!;
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  const crossing=bar.getByRole('link',{name:'Movies',exact:true});
  await expect.poll(()=>crossing.evaluate(el=>el.style.filter)).toContain('section-lens-warp');
  await page.waitForTimeout(650);
  const geometry=await crossing.evaluate(el=>{
    const tab=el as HTMLElement,bar=tab.closest<HTMLElement>('.app-tabbar')!;
    const id=tab.style.filter.match(/#([^"')]+)/)![1];
    const map=document.getElementById(id)!.querySelector('feImage')!;
    const r=bar.getBoundingClientRect(),sx=r.width/bar.offsetWidth,sy=r.height/bar.offsetHeight;
    const width=Number(map.getAttribute('width'))*sx,height=Number(map.getAttribute('height'))*sy;
    return {cx:r.x+(tab.offsetLeft+Number(map.getAttribute('x')))*sx+width/2,cy:r.y+(tab.offsetTop+Number(map.getAttribute('y')))*sy+height/2,width,height};
  });
  const gains=await canvas.evaluate((el,g)=>{
    const c=el as HTMLCanvasElement,r=c.getBoundingClientRect(),sx=c.width/r.width,sy=c.height/r.height;
    const data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;
    const radius=g.height/2,cap=g.cx+g.width/2-radius;
    const pixel=(angle:number,depth:number)=>{
      const x=Math.round((cap+Math.cos(angle)*(radius-depth)-r.x)*sx-.5);
      const y=Math.round((g.cy+Math.sin(angle)*(radius-depth)-r.y)*sy-.5);
      const i=(y*c.width+x)*4;
      return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
    };
    // Read the upper and lower right arcs, not the flat run or horizontal tangent.
    return [-1,1].map(sign=>{
      const deltas=[40,45,50,55,60].map(degrees=>{
        const a=sign*degrees*Math.PI/180;
        const peak=Math.max(...[.5,1,1.5,2].map(depth=>pixel(a,depth)));
        const interior=(pixel(a,4)+pixel(a,5)+pixel(a,6))/3;
        return peak-interior;
      });
      return deltas.reduce((a,b)=>a+b,0)/deltas.length;
    });
  },geometry);
  await page.screenshot({path:info.outputPath('raised-shoulders-390.png'),scale:'css'});
  await page.mouse.up();
  console.log(colorScheme,'curved rim gain over interior',gains);
  for(const gain of gains)expect(gain).toBeGreaterThan(16);
});
