import {test,expect} from '../fixtures';
import {startGame} from '../game-menu';
import type {Page} from '@playwright/test';

test.use({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});

async function open(page:Page,id:string){
  await page.goto(`/#/game/${id}`);
  const source=page.locator(id==='quadfall'?'.qf-canvas':'#game-stage canvas:not(.ui-glass-gl>canvas)').first();await expect(source).toBeVisible();
  if(id==='claimline')await page.locator('.cl-start').click();
  else if(id==='crossy-road')await page.keyboard.press('ArrowUp');
  else if(id==='quadfall')await page.locator('.qf-card button').click();
  else await startGame(page,id);
  // Some original boards reserve space for the dock. Move its real control
  // over that board for this optical check, without touching the simulation.
  if(id==='snake'||id==='quadfall')await source.evaluate(canvas=>{
    const b=canvas.getBoundingClientRect(),control=document.getElementById('game-menu')!;
    Object.assign(control.style,{position:'fixed',inset:'auto',left:`${b.left+16}px`,top:`${b.top+16}px`,width:'48px',height:'48px',minWidth:'48px',minHeight:'48px',zIndex:'80'});
  });
  await expect(page.locator('#game-menu')).toHaveAttribute('data-glass-mode',/^(webgl|canvas)$/);
  await page.waitForTimeout(250); // Let the crop's bounded opacity probe settle.
  return source;
}

async function sampleFrames(page:Page,id:string){
  const source=await open(page,id);
  const result=await source.evaluate(async element=>{
    const {notifyGlassFrame}=await import(String('/src/ui/glass-frame-source.ts'));
    const source=element as HTMLCanvasElement,ctx=source.getContext('2d'),gl=ctx?null:source.getContext('webgl2')!;
    const surface=document.getElementById('game-menu')!,lens=surface.querySelector<HTMLCanvasElement>('.ui-glass-gl>canvas')!;
    const output=lens.getContext('2d')!;
    const colors=[[30,180,60],[180,40,70],[30,70,180],[30,180,60]];
    const paint=(rgb:number[])=>{
      if(ctx){ctx.save();ctx.resetTransform();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=`rgb(${rgb.join(' ')})`;ctx.fillRect(0,0,source.width,source.height);ctx.restore();}
      else{gl!.bindFramebuffer(gl!.FRAMEBUFFER,null);gl!.disable(gl!.SCISSOR_TEST);gl!.colorMask(true,true,true,true);gl!.clearColor(rgb[0]/255,rgb[1]/255,rgb[2]/255,1);gl!.clear(gl!.COLOR_BUFFER_BIT);}
      notifyGlassFrame(source);
    };
    paint(colors[0]); // Settle the crop and its one-off opacity probe.
    const stats=(globalThis as unknown as {__qccGlassStats:{frames:number;uploads:number;cpuMs:number}}).__qccGlassStats;
    const before={...stats};
    const read=CanvasRenderingContext2D.prototype.getImageData;
    let readbacks=0,largeReadbacks=0;const started=performance.now();
    CanvasRenderingContext2D.prototype.getImageData=function(...args:Parameters<typeof read>){if(!this.canvas.isConnected){readbacks++;if(args[2]>128||args[3]>128)largeReadbacks++;}return Reflect.apply(read,this,args);};
    const diffs:number[]=[];
    try{
      for(let i=0;i<32;i++){
        const rgb=colors[i%colors.length];paint(rgb);
        const p=output.getImageData(Math.floor(lens.width/2),Math.floor(lens.height/2),1,1).data;
        diffs.push(Math.max(...rgb.map((v,c)=>Math.abs(v-p[c]))));
      }
    }finally{CanvasRenderingContext2D.prototype.getImageData=read;}
    return {mode:surface.dataset.glassMode,maxDifference:Math.max(...diffs),frames:stats.frames-before.frames,uploads:stats.uploads-before.uploads,cpuMs:(stats.cpuMs-before.cpuMs)/32,readbacks,largeReadbacks,elapsed:performance.now()-started,bufferPixels:lens.width*lens.height};
  });
  expect(result.maxDifference,`${id}: every green/red/blue frame must reach the lens synchronously`).toBeLessThan(17);
  expect(result.frames).toBe(32);
  expect(result.uploads).toBeLessThanOrEqual(32);
  expect(result.largeReadbacks,'no full crop opacity scans in a settled frame').toBe(0);
  // WebGL source ink legitimately takes one <=128px sample per 120ms.
  expect(result.readbacks,'no per-frame readback loop').toBeLessThanOrEqual(Math.ceil(result.elapsed/120)+1);
  expect(result.bufferPixels,'controls up to 52 CSS px capped at density 1.5').toBeLessThanOrEqual(78*78);
  await test.info().attach(`${id}-glass-frame-cost`,{body:JSON.stringify(result),contentType:'application/json'});
  return result;
}

for(const id of ['claimline','crossy-road','snake','quadfall','neon-coil'])test(`${id}: glass receives every completed canvas frame`,async({page})=>{
  await sampleFrames(page,id);
});

test('reduced motion keeps canvas pixels live without a moving lens',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const result=await sampleFrames(page,'claimline');expect(result.mode).toBe('canvas');expect(result.uploads).toBe(0);
});

test('without WebGL2 the bounded canvas copy still follows every frame',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2'&&!this.isConnected)return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;
  });
  const result=await sampleFrames(page,'claimline');expect(result.mode).toBe('canvas');expect(result.uploads).toBe(0);
});

test('press animations in the GPU fallback do not read pixels on each changing frame',async({page})=>{
  await page.addInitScript(()=>{
    const context=HTMLCanvasElement.prototype.getContext,read=CanvasRenderingContext2D.prototype.getImageData;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2'&&!this.isConnected)return null;return Reflect.apply(context,this,[type,...args]);} as typeof context;
    Object.assign(window,{fallbackReadbacks:0});
    CanvasRenderingContext2D.prototype.getImageData=function(...args:Parameters<typeof read>){if(this.canvas.closest('.ui-glass-gl'))(window as unknown as {fallbackReadbacks:number}).fallbackReadbacks++;return Reflect.apply(read,this,args);};
  });
  await open(page,'claimline');await page.waitForTimeout(250);
  await page.evaluate(()=>{(window as unknown as {fallbackReadbacks:number}).fallbackReadbacks=0;});
  const b=(await page.locator('#game-menu').boundingBox())!;
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await expect(page.locator('#game-menu')).toHaveAttribute('data-pressing','');
  await expect.poll(()=>page.locator('#game-menu').evaluate(e=>e.getAnimations().length)).toBeGreaterThan(0);
  await page.waitForTimeout(90);
  expect(await page.evaluate(()=>(window as unknown as {fallbackReadbacks:number}).fallbackReadbacks),'changing geometry must keep transparency conservative').toBe(0);
  await page.mouse.move(2,2);await page.mouse.up();
});
