// The shared WebGL lens (src/ui/webgl-glass.ts) in Chromium and WebKit: it
// samples the game's own canvas once per game frame, bends only its rim, and
// falls back to the plain CSS blur mode whenever it cannot run.
import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';

test.use({viewport:{width:390,height:844},hasTouch:true});
const PILLS='.game-dock>.game-glass';
const HUD_LENS='.game-dock>.game-hud>.ui-glass-gl>canvas';
type Stats={frames:number;uploads:number;skipped:number;failures:number};
const stats=(page:Page)=>page.evaluate(()=>({...(globalThis as unknown as {__qccGlassStats:Stats}).__qccGlassStats}));

async function slither(page:Page,query=''){
  await page.goto(`/${query}#/game/neon-coil`);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.nc-game')).toHaveAttribute('data-phase','running');
}

test('Slither dock refracts the live field through the shared lens on every game frame',async({page})=>{
  await slither(page);
  for(const pill of await page.locator(PILLS).all())await expect(pill).toHaveAttribute('data-glass-mode','webgl');
  // One mode at a time: no backdrop blur or SVG chain under the WebGL lens.
  await expect(page.locator('.game-dock>.game-hud')).toHaveCSS('backdrop-filter','none');
  await expect(page.locator('.game-dock .ui-glass-lens:visible')).toHaveCount(0);
  const result=await page.locator('.nc-game canvas').first().evaluate(async element=>{
    const {onGlassFrame}=await import(String('/src/ui/glass-frame-source.ts'));
    const source=element as HTMLCanvasElement,lens=document.querySelector<HTMLCanvasElement>('.game-dock>.game-hud>.ui-glass-gl>canvas')!;
    const scratch=document.createElement('canvas'),sctx=scratch.getContext('2d',{willReadFrequently:true})!;
    const hash=(d:Uint8ClampedArray)=>{let h=0;for(let i=0;i<d.length;i+=12)h=(h*31+d[i])|0;return h;};
    let frames=0,lensChanges=0,sourceChanges=0,lastLens=0,lastSource=0;
    // Registered after the lens, so this runs in the same game frame, after the lens drew it.
    await new Promise<void>(resolve=>{const off=onGlassFrame(source,()=>{
      const l=hash(lens.getContext('2d')!.getImageData(0,0,lens.width,lens.height).data);
      const box=lens.getBoundingClientRect(),back=source.getBoundingClientRect(),k=source.width/back.width;
      scratch.width=lens.width;scratch.height=lens.height;
      sctx.drawImage(source,(box.left-back.left)*k,(box.top-back.top)*k,box.width*k,box.height*k,0,0,lens.width,lens.height);
      const s=hash(sctx.getImageData(0,0,scratch.width,scratch.height).data);
      if(frames){if(l!==lastLens)lensChanges++;if(s!==lastSource)sourceChanges++;}
      lastLens=l;lastSource=s;if(++frames>=40){off();resolve();}
    });});
    return {frames,lensChanges,sourceChanges};
  });
  expect(result.sourceChanges).toBeGreaterThan(10);
  // Every changed game frame changes the lens in that same frame: no stale snapshot.
  expect(result.lensChanges).toBeGreaterThanOrEqual(result.sourceChanges-1);
  const output=await page.locator(HUD_LENS).evaluate(e=>({w:(e as HTMLCanvasElement).width,h:(e as HTMLCanvasElement).height,pointer:getComputedStyle(e.parentElement!).pointerEvents}));
  expect(output.pointer).toBe('none');
  // The glass buffer is 1-1.5 px per CSS px, never DPR3.
  expect(output.w*output.h).toBeLessThanOrEqual(70*1.5*64*1.5+200);
});

test('the lens bends only its rim: the clear centre matches the live canvas',async({page})=>{
  await slither(page);
  await expect(page.locator('.game-dock>.game-hud')).toHaveAttribute('data-glass-mode','webgl');
  const diff=await page.locator('.nc-game canvas').first().evaluate(async element=>{
    const {onGlassFrame}=await import(String('/src/ui/glass-frame-source.ts'));
    const source=element as HTMLCanvasElement,lens=document.querySelector<HTMLCanvasElement>('.game-dock>.game-hud>.ui-glass-gl>canvas')!;
    const scratch=document.createElement('canvas'),sctx=scratch.getContext('2d',{willReadFrequently:true})!;
    let centre=0,rim=0,cn=0,rn=0,frames=0;
    await new Promise<void>(resolve=>{const off=onGlassFrame(source,()=>{
      const w=lens.width,h=lens.height,scale=w/lens.getBoundingClientRect().width;
      const L=lens.getContext('2d')!.getImageData(0,0,w,h).data;
      const box=lens.getBoundingClientRect(),back=source.getBoundingClientRect(),k=source.width/back.width;
      scratch.width=w;scratch.height=h;sctx.drawImage(source,(box.left-back.left)*k,(box.top-back.top)*k,box.width*k,box.height*k,0,0,w,h);
      const S=sctx.getImageData(0,0,w,h).data;
      const d=(x:number,y:number)=>{const i=(y*w+x)*4;return (Math.abs(L[i]-S[i])+Math.abs(L[i+1]-S[i+1])+Math.abs(L[i+2]-S[i+2]))/3;};
      for(let x=Math.round(w*.4);x<Math.round(w*.6);x++){
        for(let y=Math.round(h*.4);y<Math.round(h*.6);y++){centre+=d(x,y);cn++;}
        // 1.5-4 CSS px inside the top and bottom rims, past the antialiased edge.
        for(let y=Math.round(1.5*scale);y<Math.round(4*scale);y++){rim+=d(x,y)+d(x,h-1-y);rn+=2;}
      }
      if(++frames>=12){off();resolve();}
    });});
    return {centre:centre/cn,rim:rim/rn};
  });
  expect(diff.centre).toBeLessThan(8);
  expect(diff.rim).toBeGreaterThan(Math.max(2,diff.centre*2));
});

test('a WebGL game (Ball Run, non-preserved buffer) feeds an opaque, moving lens',async({page})=>{
  await page.goto('/#/game/ball-run');
  await expect(page.locator('#game-menu')).toBeVisible();
  await page.getByRole('slider',{name:'Difficulty',exact:true}).fill('0');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.ball-run')).toHaveAttribute('data-phase','running');
  expect(await page.locator('.br-viewport>canvas').evaluate(e=>(e as HTMLCanvasElement).getContext('webgl2')!.getContextAttributes()!.preserveDrawingBuffer)).toBe(false);
  await expect(page.locator('.game-dock>.game-hud')).toHaveAttribute('data-glass-mode','webgl');
  const lens=page.locator(HUD_LENS);
  const opaque=()=>lens.evaluate(e=>{const c=e as HTMLCanvasElement,p=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i]>=240)n++;return n/(c.width*c.height);});
  // A rounded lens leaves only its antialiased corners transparent.
  await expect.poll(opaque).toBeGreaterThan(.7);
  const first=await lens.evaluate(e=>(e as HTMLCanvasElement).toDataURL());
  await expect.poll(()=>lens.evaluate(e=>(e as HTMLCanvasElement).toDataURL())).not.toBe(first);
});

test('all three WebGL sources expose their completed drawing buffer for a repaint and unregister on navigation',async({page})=>{
  test.setTimeout(120000);
  for(const id of ['ball-run','blockcraft','globle']){
    await page.goto(`/#/game/${id}`);
    await expect(page.locator('#game-menu')).toBeVisible({timeout:60000});
    if(id==='blockcraft')await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});
    const source=await page.locator('#game-stage canvas:not(.ui-glass-gl>canvas)').first().elementHandle();
    const result=await source!.evaluate(async element=>{
      const {hasGlassFrameSource,onGlassFrame,requestGlassFrame}=await import(String('/src/ui/glass-frame-source.ts'));
      const canvas=element as HTMLCanvasElement,scratch=document.createElement('canvas');scratch.width=scratch.height=1;
      const ctx=scratch.getContext('2d')!;let frames=0,alpha=0;
      const off=onGlassFrame(canvas,()=>{frames++;ctx.drawImage(canvas,0,0,1,1);alpha=ctx.getImageData(0,0,1,1).data[3];requestGlassFrame(canvas);});
      const registered=hasGlassFrameSource(canvas);requestGlassFrame(canvas);off();
      return {registered,frames,alpha,preserved:canvas.getContext('webgl2')!.getContextAttributes()!.preserveDrawingBuffer};
    });
    expect(result,id).toEqual({registered:true,frames:1,alpha:255,preserved:false});
    await page.goto('/#/collection');
    await expect(page.locator('.game-view')).toHaveCount(0);
    expect(await source!.evaluate(async element=>{const {hasGlassFrameSource}=await import(String('/src/ui/glass-frame-source.ts'));return hasGlassFrameSource(element as HTMLCanvasElement);}),`${id} unregisters`).toBe(false);
  }
});

test('Snake: the menu frosts the paused board without a sharp WebGL copy and the renderer idles',async({page})=>{
  await page.goto('/#/game/snake');await page.locator('.snake-start').click();
  // At phone portrait the dock sits above the board: no live pixels, so no lens.
  for(const pill of await page.locator(PILLS).all())await expect(pill).not.toHaveAttribute('data-glass-mode','webgl');
  await page.locator('#game-menu').click();
  const sheet=page.locator('#game-options');
  // #92 deliberately uses CSS frost on sheets, including over live games.
  await expect(sheet).toHaveAttribute('data-glass-mode','blur');
  await expect(sheet).toHaveCSS('backdrop-filter','blur(20px) saturate(1.5)');
  await expect(sheet).toHaveCSS('background-color','rgba(12, 16, 22, 0.58)');
  // Controls inside the sheet keep a thin fill rather than a second refracting layer.
  await expect(sheet.locator('.sheet-close-glass')).not.toHaveAttribute('data-glass-mode','webgl');
  await expect.poll(()=>sheet.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
  const lens=sheet.locator(':scope>.ui-glass-gl>canvas');
  // A sharp copy must never paint back over the sheet's blur.
  await expect(lens).toHaveCount(0);
  await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
  const before=await stats(page);await page.waitForTimeout(600);const after=await stats(page);
  expect(after.uploads-before.uploads).toBeLessThanOrEqual(1);
});

test('fallbacks select plain blur: no WebGL2, reduced motion, forced blur; accessibility solids select off',async({page,browserName})=>{
  const notWebgl=async()=>{await expect(page.locator('.game-dock>.game-hud')).toHaveAttribute('data-glass-mode',browserName==='chromium'?/svg|blur/:'blur');await expect(page.locator('.ui-glass-gl:visible')).toHaveCount(0);};
  await slither(page,'?glass=blur');await notWebgl();
  // WebKit's fallback is the pill's own plain blur (Chromium's svg mode filters its .ui-glass-lens child).
  if(browserName==='webkit')await expect(page.locator('.game-dock>.game-hud')).toHaveCSS('backdrop-filter',/blur\(/);
  await page.emulateMedia({reducedMotion:'reduce'});await slither(page);await notWebgl();
  await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});await slither(page);
  await expect(page.locator('.game-dock>.game-hud')).toHaveAttribute('data-glass-mode','off');
  await page.emulateMedia({forcedColors:'none'});
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2'&&!this.isConnected)return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  // A distinct URL forces a fresh document, so the init script runs.
  await slither(page,'?nogl=1');await notWebgl();
  expect((await stats(page)).failures).toBeGreaterThan(0);
});

test('lens context loss falls back to blur, restores to the lens, and navigation releases every lens',async({page})=>{
  // Capture the renderer's own (detached) WebGL2 context without a product hook.
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){const ctx=Reflect.apply(original,this,[type,...args]);if(type==='webgl2'&&ctx&&!this.isConnected)(window as unknown as {lensGl:WebGL2RenderingContext}).lensGl=ctx as WebGL2RenderingContext;return ctx;} as typeof original;});
  await slither(page);
  const hud=page.locator('.game-dock>.game-hud');
  await expect(hud).toHaveAttribute('data-glass-mode','webgl');
  await page.evaluate(()=>{(window as unknown as {lensExt:WEBGL_lose_context}).lensExt=(window as unknown as {lensGl:WebGL2RenderingContext}).lensGl.getExtension('WEBGL_lose_context')!;(window as unknown as {lensExt:WEBGL_lose_context}).lensExt.loseContext();});
  await expect(hud).not.toHaveAttribute('data-glass-mode','webgl');
  await page.evaluate(()=>(window as unknown as {lensExt:WEBGL_lose_context}).lensExt.restoreContext());
  await expect(hud).toHaveAttribute('data-glass-mode','webgl');
  await page.locator('.game-dock a').click();
  await expect(page.locator('.game-view')).toHaveCount(0);
  await expect(page.locator('.ui-glass-gl')).toHaveCount(0);
});
