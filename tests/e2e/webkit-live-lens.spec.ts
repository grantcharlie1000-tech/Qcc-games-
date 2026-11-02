import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
test.use({viewport:{width:390,height:844},hasTouch:true});
async function arena(page:Page){
 await page.goto('/?glass=fallback#/game/neon-coil');
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect(page.locator('.nc-game')).toHaveAttribute('data-phase','running');
}
test('fallback bends the current canvas at the edge and releases it on navigation',async({page})=>{
 await arena(page);
 const lens=page.locator('.game-hud canvas.ui-glass-live');
 await expect(lens).toBeVisible();
 const a=await lens.evaluate(e=>(e as HTMLCanvasElement).toDataURL());
 await expect.poll(()=>lens.evaluate(e=>(e as HTMLCanvasElement).toDataURL())).not.toBe(a);
 const css=await lens.evaluate(e=>({filter:getComputedStyle(e).filter,mask:getComputedStyle(e).maskImage,pointer:getComputedStyle(e).pointerEvents}));
 expect(css.filter).toContain('url(');expect(css.mask).not.toBe('none');expect(css.pointer).toBe('none');
 const pixels=await lens.evaluate(e=>({width:(e as HTMLCanvasElement).width,height:(e as HTMLCanvasElement).height}));
 expect(pixels.width*pixels.height).toBeLessThan(100000);
 await page.locator('.game-dock a').click();
 await expect(page.locator('canvas.ui-glass-live')).toHaveCount(0);
 await expect(page.locator('svg[data-live-lens-filter]')).toHaveCount(0);
});
test('unsupported canvas readback leaves clear live blur rather than a captured frame',async({page})=>{
 await page.addInitScript(()=>{
  const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(this:CanvasRenderingContext2D,...args:unknown[]){
   if(this.canvas.classList.contains('ui-glass-live'))throw new DOMException('Blocked source','SecurityError');
   return Reflect.apply(original,this,args);
  };
 });
 await arena(page);
 await expect(page.locator('.game-hud canvas.ui-glass-live')).toHaveCount(0);
 await expect(page.locator('.game-hud')).toHaveAttribute('data-glass','frost');
 await expect(page.locator('.game-hud')).toHaveCSS('backdrop-filter','blur(3px) saturate(1)');
});

test('edge displacement changes real pixels while the centre stays clear',async({page})=>{
 await arena(page);
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
  const ctx=canvas.getContext('2d')!;for(let x=0;x<390;x+=8){ctx.fillStyle=x%16?'#fff':'#000';ctx.fillRect(x,0,8,844);}
 });
 const lens=page.locator('.game-hud canvas.ui-glass-live');await expect(lens).toBeVisible();
 await page.addStyleTag({content:'.game-hud small,.game-hud strong{visibility:hidden!important}'});
 await page.waitForTimeout(400);
 const bent=(await lens.screenshot()).toString('base64');
 await lens.evaluate(e=>(e as HTMLElement).style.filter='blur(3px)');
 const flat=(await lens.screenshot()).toString('base64');
 const difference=await page.evaluate(async({bent,flat})=>{
  const a=new Image(),b=new Image();a.src='data:image/png;base64,'+bent;b.src='data:image/png;base64,'+flat;await Promise.all([a.decode(),b.decode()]);
  const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d')!;
  ctx.drawImage(a,0,0);const aa=ctx.getImageData(0,0,c.width,c.height).data;ctx.drawImage(b,0,0);const bb=ctx.getImageData(0,0,c.width,c.height).data;
  let edge=0,center=0,en=0,cn=0;
  for(let y=2;y<c.height-2;y++)for(let x=20;x<c.width-20;x++){
   const d=Math.abs(aa[(y*c.width+x)*4]-bb[(y*c.width+x)*4]);
   if(y<8||y>=c.height-8){edge+=d;en++;}else if(y>18&&y<c.height-18){center+=d;cn++;}
  }
  return{edge:edge/en,center:center/cn};
 },{bent,flat});
 // WebKit may quantize fractional compositor clips by one channel level.
 expect(difference.edge).toBeGreaterThan(1);expect(difference.center).toBeLessThan(1);
 expect(difference.edge).toBeGreaterThan(difference.center*3);
});
